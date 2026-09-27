import { defaultBox, fetchAll } from "./sources";
import { markNewAndPersist, saveSnapshot, type Snapshot } from "./cache";
import { kvGet, kvSet } from "./kv";

/**
 * Rafraîchissement du snapshot : interroge les sources, met à jour le registre
 * « vues » et enregistre le résultat. Partagé par l'API, le cron et la CLI.
 */

const LOCK_KEY = "refresh-lock";
// Au-delà, on considère qu'un rafraîchissement a planté sans libérer le verrou.
const LOCK_MINUTES = 5;

interface Lock {
  since: string;
}

export async function refreshSnapshot(): Promise<Snapshot> {
  const { listings, reports } = await fetchAll(defaultBox());
  const flagged = await markNewAndPersist(listings);
  return saveSnapshot(flagged, reports);
}

export async function isRefreshing(): Promise<boolean> {
  const lock = await kvGet<Lock | null>(LOCK_KEY, null);
  return !!lock && Date.now() - new Date(lock.since).getTime() < LOCK_MINUTES * 60_000;
}

/** Rafraîchit, sauf si un rafraîchissement est déjà en cours (renvoie alors null). */
export async function refreshIfIdle(): Promise<Snapshot | null> {
  if (await isRefreshing()) return null;
  await kvSet(LOCK_KEY, { since: new Date().toISOString() } satisfies Lock);
  try {
    return await refreshSnapshot();
  } finally {
    await kvSet(LOCK_KEY, null);
  }
}
