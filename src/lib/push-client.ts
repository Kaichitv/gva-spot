// Helpers Web Push côté navigateur (à n'importer que depuis des composants client).

import type { SearchCriteria } from "./types";

/** Clé localStorage des critères (partagée par page.tsx et PushToggle). */
export const CRITERIA_STORAGE_KEY = "gva-spot:criteria";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const API = "/api/push/subscribe";

/** Convertit une clé VAPID base64url en Uint8Array (format attendu par pushManager.subscribe). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Le navigateur sait-il faire du Web Push ? (SW + PushManager + Notification, contexte sécurisé) */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iOS/iPadOS hors PWA installée : le Web Push n'y est disponible qu'en mode écran d'accueil. */
export function isIosOutsidePwa(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS se présente comme un Mac tactile.
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

export function readStoredCriteria(): SearchCriteria {
  try {
    const raw = localStorage.getItem(CRITERIA_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SearchCriteria) : {};
  } catch {
    return {};
  }
}

/**
 * Registration active du service worker (l'enregistre si RegisterSW ne l'a pas
 * encore fait). Délai max : si le SW ne s'active pas, on échoue avec un message
 * clair au lieu d'attendre indéfiniment.
 */
export async function getRegistration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("service worker inactif — recharge la page")),
      timeoutMs
    );
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Souscription push actuelle, sans rien enregistrer ni demander. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function call(method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<void> {
  const res = await fetch(API, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}

export function saveSubscription(sub: PushSubscription, criteria: SearchCriteria) {
  return call("POST", { subscription: sub.toJSON(), criteria });
}

export function deleteSubscription(endpoint: string) {
  return call("DELETE", { endpoint });
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Resynchronise les critères de l'abonnement courant (s'il existe) après un
 * changement côté UI. Débouncé : les champs appellent persist() à chaque frappe.
 */
export function syncPushCriteria(criteria: SearchCriteria, delayMs = 800) {
  if (!isPushSupported()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const sub = await getCurrentSubscription();
      if (!sub) return;
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, criteria }),
      });
      // Store serveur réinitialisé (ex. redéploiement) : on se réenregistre.
      if (res.status === 404) await saveSubscription(sub, criteria);
    } catch {
      // Silencieux : la prochaine modification ou réactivation resynchronisera.
    }
  }, delayMs);
}
