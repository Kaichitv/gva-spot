import { kvGet, kvSet } from "./kv";
import type { FetchReport, Listing } from "./types";

/**
 * Cache très simple (JSON, via kv.ts) pour deux usages :
 *  1) mémoriser la date de première apparition d'une annonce (badge "nouveau") ;
 *  2) garder le dernier résultat des sources (snapshot) pour servir les
 *     recherches sans re-solliciter les portails.
 *
 * Suffisant pour un usage perso mono-utilisateur. Pas de base relationnelle.
 */

const SEEN_KEY = "seen";
const SNAPSHOT_KEY = "snapshot";

interface SeenMap {
  [listingId: string]: string; // id -> ISO firstSeenAt
}

export interface Snapshot {
  fetchedAt: string;
  listings: Listing[];
  reports?: FetchReport[];
}

/** Marque les annonces nouvelles, met à jour le registre des annonces vues. */
export async function markNewAndPersist(listings: Listing[]): Promise<Listing[]> {
  const seen = await kvGet<SeenMap>(SEEN_KEY, {});
  const now = new Date().toISOString();

  const result = listings.map((l) => {
    const firstSeenAt = seen[l.id];
    if (firstSeenAt) {
      return { ...l, firstSeenAt, isNew: false };
    }
    seen[l.id] = now;
    return { ...l, firstSeenAt: now, isNew: true };
  });

  await kvSet(SEEN_KEY, seen);
  return result;
}

export async function saveSnapshot(
  listings: Listing[],
  reports: FetchReport[] = []
): Promise<Snapshot> {
  const snap: Snapshot = { fetchedAt: new Date().toISOString(), listings, reports };
  await kvSet(SNAPSHOT_KEY, snap);
  return snap;
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  return kvGet<Snapshot | null>(SNAPSHOT_KEY, null);
}

/** Le snapshot est-il encore frais ? (TTL en minutes) */
export function isFresh(snap: Snapshot | null, ttlMinutes: number): boolean {
  if (!snap) return false;
  const age = Date.now() - new Date(snap.fetchedAt).getTime();
  return age < ttlMinutes * 60_000;
}
