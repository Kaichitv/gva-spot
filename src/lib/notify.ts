import webpush, { WebPushError } from "web-push";
import { defaultBox, fetchAll } from "./sources";
import { dedupe, type DedupedListing } from "./dedupe";
import { applyFilters, sortListings } from "./filter";
import { isFresh, loadSnapshot, markNewAndPersist, saveSnapshot } from "./cache";
import { effectiveRent } from "./normalize";
import {
  addNotified,
  list,
  loadNotified,
  remove,
  type StoredSubscription,
} from "./push-store";
import type { FetchReport, Listing, SearchCriteria } from "./types";

/**
 * Notifier Web Push : détecte les annonces jamais notifiées qui correspondent
 * aux critères de chaque abonnement et envoie UN push récapitulatif par abonné.
 *
 * Détection des nouveautés = ledger dédié `data/notified.json`, indépendant de
 * `data/seen.json` (qui ne sert qu'au badge « Nouveau » de l'UI).
 *
 * Le payload ne contient qu'un résumé + un lien vers l'app : aucune photo,
 * description ni coordonnée d'annonceur n'est transmise.
 */

/**
 * Politesse : si un snapshot a moins de N minutes (l'UI ou un autre run vient
 * d'interroger les portails), on le réutilise au lieu de re-solliciter les
 * sources. Protège aussi contre un scheduler mal réglé qui appellerait trop souvent.
 */
const MIN_FETCH_INTERVAL_MINUTES = 5;
/** Durée de vie d'un push non délivré côté service push (téléphone éteint…). */
const PUSH_TTL_SECONDS = 12 * 60 * 60;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  count: number;
  tag: "gva-new";
}

export interface SubscriptionResult {
  /** Endpoint abrégé (l'URL complète est un secret, on ne la logue pas). */
  endpoint: string;
  matches: number;
  status: "sent" | "nothing-new" | "expired-removed" | "error";
  error?: string;
}

export interface NotifierSummary {
  mode: "run" | "test";
  startedAt: string;
  durationMs: number;
  /** "network" = portails interrogés ; "snapshot" = snapshot récent réutilisé. */
  dataFrom?: "network" | "snapshot";
  reports?: FetchReport[];
  listings?: number;
  /** Premier passage (ou aucun abonné) : ledger amorcé sans rien envoyer. */
  bootstrapped?: boolean;
  /** Premier passage pendant une panne de source : amorçage reporté au prochain run. */
  bootstrapDeferred?: boolean;
  subscriptions: number;
  sent: number;
  removed: number;
  failed: number;
  results: SubscriptionResult[];
}

let running = false;

/** Initialise web-push depuis l'env. Lève une erreur claire si mal configuré. */
function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Clés VAPID manquantes : renseigne VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT dans .env (npx web-push generate-vapid-keys)."
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function shortEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.host}/…${endpoint.slice(-8)}`;
  } catch {
    return `…${endpoint.slice(-8)}`;
  }
}

function formatChf(n: number): string {
  return n.toLocaleString("fr-CH", { maximumFractionDigits: 0 });
}

/** Résumé d'une annonce : `3.5 p · 72 m² · CHF 2 400 — Eaux-Vives`. */
function summarize(l: Listing): string {
  const facts: string[] = [];
  if (l.rooms != null) facts.push(`${l.rooms} p`);
  if (l.livingSpace != null) facts.push(`${l.livingSpace} m²`);
  const rent = effectiveRent(l);
  facts.push(rent != null ? `CHF ${formatChf(rent)}` : "loyer n.c.");
  const where = l.neighborhood || l.city || "Genève";
  return `${facts.join(" · ")} — ${where}`;
}

export function buildPayload(news: Listing[]): PushPayload {
  const count = news.length;
  return {
    title: `${count} nouvelle${count > 1 ? "s" : ""} annonce${count > 1 ? "s" : ""} à Genève`,
    body: news[0] ? summarize(news[0]) : "",
    url: "/",
    count,
    tag: "gva-new",
  };
}

type SendOutcome = { ok: true } | { ok: false; expired: boolean; error: string };

async function send(sub: StoredSubscription, payload: PushPayload): Promise<SendOutcome> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: PUSH_TTL_SECONDS }
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof WebPushError) {
      const expired = e.statusCode === 404 || e.statusCode === 410;
      return { ok: false, expired, error: `HTTP ${e.statusCode}` };
    }
    return { ok: false, expired: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Récupère les annonces : snapshot récent s'il existe, sinon les portails.
 * Dans ce dernier cas on met aussi à jour seen + snapshot (comme `npm run
 * refresh`) pour que l'app, ouverte depuis la notif, affiche tout de suite les
 * nouveautés sans ré-interroger les sources.
 */
async function getListings(): Promise<{
  raw: Listing[];
  reports: FetchReport[];
  dataFrom: "network" | "snapshot";
}> {
  const snap = await loadSnapshot();
  if (snap && isFresh(snap, MIN_FETCH_INTERVAL_MINUTES)) {
    return { raw: snap.listings, reports: [], dataFrom: "snapshot" };
  }
  const { listings, reports } = await fetchAll(defaultBox());
  const flagged = await markNewAndPersist(listings);
  await saveSnapshot(flagged);
  return { raw: flagged, reports, dataFrom: "network" };
}

/**
 * Tous les ids d'un groupe dédoublonné (représentant + doublons). Le
 * représentant d'un groupe peut changer d'un run à l'autre ; considérer le
 * groupe entier évite de renotifier le même bien sous un autre id.
 */
function groupIds(l: DedupedListing, idByUrl: Map<string, string>): string[] {
  const ids = [l.id];
  for (const other of l.alsoOn ?? []) {
    const id = idByUrl.get(other.url);
    if (id) ids.push(id);
  }
  return ids;
}

/** Critères d'un abonnement pour le notifier : `onlyNew` n'a pas de sens ici (c'est le ledger qui décide). */
function notifierCriteria(c: SearchCriteria): SearchCriteria {
  const { onlyNew: _ignored, ...rest } = c;
  return rest;
}

export async function runNotifier(opts: { test?: boolean } = {}): Promise<NotifierSummary> {
  if (running) throw new Error("Un envoi de notifications est déjà en cours.");
  running = true;
  try {
    configureWebPush();
    return opts.test ? await runTest() : await runReal();
  } finally {
    running = false;
  }
}

/** Mode --test : notif factice à tous les abonnés, sans toucher aux sources ni au ledger. */
async function runTest(): Promise<NotifierSummary> {
  const t0 = Date.now();
  const subs = await list();
  const payload: PushPayload = {
    title: "GVA Spot — test",
    body: "3.5 p · 72 m² · CHF 2 400 — Eaux-Vives (notification factice)",
    url: "/",
    count: 1,
    tag: "gva-new",
  };
  const summary = emptySummary("test", t0, subs.length);
  for (const sub of subs) {
    await deliver(sub, payload, 1, summary);
  }
  summary.durationMs = Date.now() - t0;
  return summary;
}

async function runReal(): Promise<NotifierSummary> {
  const t0 = Date.now();
  const { raw, reports, dataFrom } = await getListings();
  const listings = dedupe(raw);
  const idByUrl = new Map(raw.map((l) => [l.sourceUrl, l.id]));

  const subs = await list();
  const notified = await loadNotified();
  const summary = emptySummary("run", t0, subs.length);
  summary.dataFrom = dataFrom;
  summary.reports = reports;
  summary.listings = listings.length;

  // Amorçage : premier passage (pas de ledger) ou personne à prévenir. On
  // enregistre tout le stock actuel sans rien envoyer, sinon le premier push
  // annoncerait des centaines d'annonces « nouvelles ».
  if (notified === null || subs.length === 0) {
    if (notified === null && reports.some((r) => !r.ok)) {
      // Une source en panne au premier passage : ses annonces manqueraient au
      // ledger et seraient toutes poussées comme « nouvelles » à son retour.
      summary.bootstrapDeferred = true;
    } else {
      await addNotified(listings.flatMap((l) => groupIds(l, idByUrl)));
      summary.bootstrapped = true;
    }
    summary.durationMs = Date.now() - t0;
    return summary;
  }

  const pushed = new Set<string>();
  for (const sub of subs) {
    const news = sortListings(
      applyFilters(listings, notifierCriteria(sub.criteria)).filter(
        (l) => !groupIds(l, idByUrl).some((id) => notified.has(id))
      )
    );
    if (news.length === 0) {
      summary.results.push({
        endpoint: shortEndpoint(sub.endpoint),
        matches: 0,
        status: "nothing-new",
      });
      continue;
    }
    const ok = await deliver(sub, buildPayload(news), news.length, summary);
    // Seules les annonces effectivement poussées entrent au ledger : un échec
    // transitoire sera retenté au prochain passage.
    if (ok) for (const l of news) for (const id of groupIds(l, idByUrl)) pushed.add(id);
  }

  if (pushed.size) await addNotified(pushed);
  summary.durationMs = Date.now() - t0;
  return summary;
}

function emptySummary(mode: "run" | "test", t0: number, subscriptions: number): NotifierSummary {
  return {
    mode,
    startedAt: new Date(t0).toISOString(),
    durationMs: 0,
    subscriptions,
    sent: 0,
    removed: 0,
    failed: 0,
    results: [],
  };
}

/** Envoie un push et consigne le résultat. Supprime les abonnements expirés (404/410). */
async function deliver(
  sub: StoredSubscription,
  payload: PushPayload,
  matches: number,
  summary: NotifierSummary
): Promise<boolean> {
  const endpoint = shortEndpoint(sub.endpoint);
  const outcome = await send(sub, payload);
  if (outcome.ok) {
    summary.sent++;
    summary.results.push({ endpoint, matches, status: "sent" });
    return true;
  }
  if (outcome.expired) {
    await remove(sub.endpoint);
    summary.removed++;
    summary.results.push({ endpoint, matches, status: "expired-removed", error: outcome.error });
  } else {
    summary.failed++;
    summary.results.push({ endpoint, matches, status: "error", error: outcome.error });
  }
  return false;
}

/** Résumé lisible pour la console (CLI / logs serveur). */
export function formatSummary(s: NotifierSummary): string {
  const lines: string[] = [];
  if (s.mode === "test") {
    lines.push(`Mode test : notification factice envoyée à ${s.subscriptions} abonnement(s).`);
    if (s.subscriptions === 0) {
      lines.push(
        "⚠ Aucun abonnement enregistré (data/subscriptions.json vide) : ouvre l'app, clique sur « Alertes » et accepte la permission, puis relance."
      );
    }
  } else {
    lines.push(
      `${s.listings ?? 0} annonces après dédoublonnage (${
        s.dataFrom === "snapshot" ? "snapshot récent réutilisé" : "portails interrogés"
      }).`
    );
    for (const r of s.reports ?? []) {
      lines.push(
        `  ${r.ok ? "✓" : "✗"} ${r.source.padEnd(10)} ${String(r.count).padStart(4)} annonces  ${r.ms}ms${
          r.error ? "  — " + r.error : ""
        }`
      );
    }
    if (s.bootstrapDeferred) {
      lines.push("Premier passage mais une source est en échec : amorçage reporté, rien envoyé.");
    }
    if (s.bootstrapped) {
      lines.push(
        s.subscriptions === 0
          ? "Aucun abonnement : annonces actuelles enregistrées comme connues, rien envoyé."
          : "Premier passage : ledger amorcé avec les annonces actuelles, rien envoyé."
      );
    }
  }
  for (const r of s.results) {
    lines.push(
      `  ${r.endpoint.padEnd(40)} ${String(r.matches).padStart(3)} nouveauté(s)  ${r.status}${
        r.error ? " (" + r.error + ")" : ""
      }`
    );
  }
  lines.push(
    `${s.sent} envoyé(s) · ${s.removed} expiré(s) supprimé(s) · ${s.failed} échec(s) · ${s.durationMs} ms`
  );
  return lines.join("\n");
}
