"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellSlash, X } from "@phosphor-icons/react";
import {
  VAPID_PUBLIC_KEY,
  deleteSubscription,
  getCurrentSubscription,
  getRegistration,
  isIosOutsidePwa,
  isPushSupported,
  readStoredCriteria,
  saveSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push-client";

/**
 * Bouton « Alertes » : active / désactive les notifications push des nouvelles
 * annonces correspondant aux critères courants.
 */

type Status =
  | "checking" // détection en cours (rendu vide, évite un flash)
  | "hidden" // navigateur sans Web Push : on masque
  | "ios-install" // iOS hors PWA : il faut installer l'app
  | "no-key" // NEXT_PUBLIC_VAPID_PUBLIC_KEY absente
  | "denied" // permission refusée
  | "off" // supporté, pas abonné
  | "on"; // abonné

const NOTES: Partial<Record<Status, string>> = {
  "ios-install":
    "Sur iPhone, les alertes ne marchent que dans l'app installée : Partager → « Sur l'écran d'accueil », puis ouvre GVA Spot depuis l'icône (iOS 16.4+).",
  "no-key":
    "Alertes non configurées : renseigne NEXT_PUBLIC_VAPID_PUBLIC_KEY dans .env puis relance l'app.",
  denied:
    "Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l'adresse, ou Réglages → Notifications), puis réessaie.",
};

export default function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Détection initiale de l'état.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: Status;
      if (!isPushSupported()) next = isIosOutsidePwa() ? "ios-install" : "hidden";
      else if (!VAPID_PUBLIC_KEY) next = "no-key";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const sub = await getCurrentSubscription().catch(() => null);
        next = sub && Notification.permission === "granted" ? "on" : "off";
        // Réenregistre silencieusement (idempotent) : utile si le store serveur
        // a été réinitialisé depuis l'abonnement.
        if (sub && next === "on") {
          saveSubscription(sub, readStoredCriteria()).catch(() => {});
        }
      }
      if (!cancelled) setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ferme la bulle d'info au clic extérieur / Échap.
  useEffect(() => {
    if (!note) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setNote(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNote(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [note]);

  async function enable() {
    // requestPermission doit être le PREMIER appel asynchrone du geste
    // utilisateur (exigence Safari/iOS).
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "off");
      setNote(
        permission === "denied"
          ? NOTES.denied!
          : "Autorisation non accordée (fenêtre fermée ou ignorée). Reclique sur « Alertes » et choisis « Autoriser »."
      );
      return;
    }
    const reg = await getRegistration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    try {
      await saveSubscription(sub, readStoredCriteria());
    } catch (e) {
      // Le serveur n'a pas enregistré : on annule pour rester cohérent.
      await sub.unsubscribe().catch(() => {});
      throw e;
    }
    setStatus("on");
    setNote("Alertes activées : tu seras prévenu·e des nouvelles annonces qui correspondent à tes critères.");
  }

  async function disable() {
    const sub = await getCurrentSubscription();
    if (sub) {
      await deleteSubscription(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    setStatus("off");
    setNote(null);
  }

  async function onClick() {
    // Permission débloquée entre-temps dans les réglages : on retente.
    const stillDenied = status !== "denied" || Notification.permission === "denied";
    if (NOTES[status] && stillDenied) {
      setNote(note ? null : NOTES[status]!);
      return;
    }
    setBusy(true);
    try {
      if (status === "on") await disable();
      else await enable();
    } catch (e) {
      console.error("[GVA Spot] Alertes :", e);
      setNote(
        `Impossible de modifier les alertes${e instanceof Error ? ` (${e.message})` : ""}. Réessaie plus tard.`
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "hidden") return null;

  const active = status === "on";
  const unavailable = !!NOTES[status];
  const Icon = active || status === "off" ? Bell : BellSlash;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={unavailable ? undefined : active}
        aria-busy={busy}
        title={active ? "Désactiver les alertes" : "Être alerté des nouvelles annonces"}
        className={
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 disabled:opacity-60 " +
          (active
            ? "border-transparent bg-accent text-accent-ink shadow-[var(--shadow-sm)] hover:bg-accent-hover"
            : "border-line bg-surface-2 text-muted hover:text-ink")
        }
      >
        <Icon size={14} weight={active ? "fill" : "bold"} />
        {/* Libellé masqué visuellement sur très petits écrans (reste lu par les lecteurs d'écran). */}
        <span className="max-[380px]:sr-only">Alertes</span>
      </button>

      {note && (
        <div
          role="status"
          className="card absolute right-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] p-3 pr-8 text-[13px] leading-snug text-ink shadow-[var(--shadow-lg)]"
        >
          {note}
          <button
            type="button"
            onClick={() => setNote(null)}
            aria-label="Fermer"
            className="absolute right-2 top-2 rounded-md p-1 text-muted transition-colors duration-150 hover:text-ink"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
