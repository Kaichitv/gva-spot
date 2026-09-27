import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./data-dir";
import type { SearchCriteria } from "./types";

/**
 * Store des abonnements Web Push + ledger des annonces déjà notifiées.
 *
 * ⚠️ STOCKAGE : fichiers JSON sous `data/` (ou `/tmp` en serverless, voir plus
 * bas). Parfait en auto-hébergé (un seul process Node, disque persistant),
 * mais ÉPHÉMÈRE en serverless (Vercel, Netlify…) : le disque n'y survit pas
 * entre deux invocations. Pour un déploiement serverless fiable, c'est ICI
 * qu'il faut brancher un KV (Upstash Redis, Vercel KV…) : réimplémenter
 * `readJson` / `writeJson` (ou les fonctions exportées ci-dessous) sur le KV,
 * le reste de l'app ne change pas.
 *
 * Données stockées : endpoint + clés de chiffrement du navigateur abonné et les
 * critères de recherche. Aucune donnée d'annonceur, aucun contact.
 */
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");
const NOTIFIED_FILE = path.join(DATA_DIR, "notified.json");

/** Taille max du ledger : on garde les N ids les plus récents. */
const NOTIFIED_MAX = 5000;
/** Garde-fou : usage perso, pas besoin de plus d'abonnements que ça. */
const MAX_SUBSCRIPTIONS = 50;

export interface PushKeys {
  p256dh: string;
  auth: string;
}

/** Forme minimale d'une PushSubscription (cf. `subscription.toJSON()`). */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: PushKeys;
}

export interface StoredSubscription extends PushSubscriptionJSON {
  criteria: SearchCriteria;
  createdAt: string;
}

interface NotifiedLedger {
  ids: string[];
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Écriture atomique (fichier temporaire + rename) pour ne jamais laisser un JSON tronqué. */
async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// Sérialise les lectures-écritures dans ce process (évite qu'un POST et un
// DELETE simultanés s'écrasent). Suffisant en mono-process.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// --- Validation -------------------------------------------------------------

/** Vérifie la forme d'une souscription reçue du client. */
export function parseSubscription(v: unknown): PushSubscriptionJSON | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const keys = s.keys as Record<string, unknown> | undefined;
  if (typeof s.endpoint !== "string" || !isHttpsUrl(s.endpoint)) return null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string")
    return null;
  if (!keys.p256dh || !keys.auth) return null;
  return { endpoint: s.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:" && s.length <= 2048;
  } catch {
    return false;
  }
}

/** Ne garde que les champs connus de SearchCriteria, correctement typés. */
export function sanitizeCriteria(v: unknown): SearchCriteria {
  if (!v || typeof v !== "object") return {};
  const c = v as Record<string, unknown>;
  const num = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) ? x : undefined;
  const bool = (x: unknown) => (typeof x === "boolean" ? x : undefined);
  const strList = (x: unknown) =>
    Array.isArray(x)
      ? x.filter((s): s is string => typeof s === "string").slice(0, 50)
      : undefined;
  const out: SearchCriteria = {
    minRooms: num(c.minRooms),
    maxRooms: num(c.maxRooms),
    minSurface: num(c.minSurface),
    maxRent: num(c.maxRent),
    minRent: num(c.minRent),
    furnished: bool(c.furnished),
    neighborhoods: strList(c.neighborhoods),
    zips: strList(c.zips),
    query: typeof c.query === "string" && c.query ? c.query.slice(0, 200) : undefined,
    onlyNew: bool(c.onlyNew),
  };
  // Supprime les clés indéfinies pour garder un JSON propre.
  for (const k of Object.keys(out) as (keyof SearchCriteria)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

// --- Abonnements ------------------------------------------------------------

export async function list(): Promise<StoredSubscription[]> {
  return readJson<StoredSubscription[]>(SUBS_FILE, []);
}

/** Ajoute un abonnement ou met à jour celui qui a le même endpoint. */
export function addOrUpdate(
  sub: PushSubscriptionJSON,
  criteria: SearchCriteria
): Promise<StoredSubscription> {
  return serialized(async () => {
    const subs = await list();
    const existing = subs.find((s) => s.endpoint === sub.endpoint);
    if (existing) {
      existing.keys = sub.keys;
      existing.criteria = criteria;
      await writeJson(SUBS_FILE, subs);
      return existing;
    }
    if (subs.length >= MAX_SUBSCRIPTIONS) {
      throw new Error("Nombre maximal d'abonnements atteint");
    }
    const stored: StoredSubscription = {
      endpoint: sub.endpoint,
      keys: sub.keys,
      criteria,
      createdAt: new Date().toISOString(),
    };
    subs.push(stored);
    await writeJson(SUBS_FILE, subs);
    return stored;
  });
}

/** Supprime un abonnement. Renvoie true s'il existait. */
export function remove(endpoint: string): Promise<boolean> {
  return serialized(async () => {
    const subs = await list();
    const next = subs.filter((s) => s.endpoint !== endpoint);
    if (next.length === subs.length) return false;
    await writeJson(SUBS_FILE, next);
    return true;
  });
}

/** Met à jour les critères d'un abonnement. Renvoie false s'il est inconnu. */
export function updateCriteria(
  endpoint: string,
  criteria: SearchCriteria
): Promise<boolean> {
  return serialized(async () => {
    const subs = await list();
    const sub = subs.find((s) => s.endpoint === endpoint);
    if (!sub) return false;
    sub.criteria = criteria;
    await writeJson(SUBS_FILE, subs);
    return true;
  });
}

// --- Ledger des annonces notifiées -----------------------------------------

/**
 * Ids déjà poussés. `null` si le ledger n'existe pas encore (premier passage) :
 * le notifier s'en sert pour amorcer sans envoyer tout le stock existant.
 */
export async function loadNotified(): Promise<Set<string> | null> {
  const ledger = await readJson<NotifiedLedger | null>(NOTIFIED_FILE, null);
  if (!ledger || !Array.isArray(ledger.ids)) return null;
  return new Set(ledger.ids);
}

/** Ajoute des ids au ledger (les plus récents en fin de liste, borné à NOTIFIED_MAX). */
export function addNotified(ids: Iterable<string>): Promise<void> {
  return serialized(async () => {
    const ledger = await readJson<NotifiedLedger>(NOTIFIED_FILE, { ids: [] });
    const current = Array.isArray(ledger.ids) ? ledger.ids : [];
    const known = new Set(current);
    for (const id of ids) {
      if (!known.has(id)) {
        known.add(id);
        current.push(id);
      }
    }
    await writeJson(NOTIFIED_FILE, { ids: current.slice(-NOTIFIED_MAX) });
  });
}
