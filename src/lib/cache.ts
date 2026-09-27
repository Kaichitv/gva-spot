import { promises as fs } from "node:fs";
import path from "node:path";
import type { Listing } from "./types";

/**
 * Cache disque très simple (JSON) pour deux usages :
 *  1) mémoriser la date de première apparition d'une annonce (badge "nouveau") ;
 *  2) éviter de re-solliciter les sources trop souvent (TTL court).
 *
 * Suffisant pour un usage perso mono-utilisateur. Pas de base de données.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SEEN_FILE = path.join(DATA_DIR, "seen.json");
const SNAPSHOT_FILE = path.join(DATA_DIR, "snapshot.json");

interface SeenMap {
  [listingId: string]: string; // id -> ISO firstSeenAt
}

interface Snapshot {
  fetchedAt: string;
  listings: Listing[];
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

/** Marque les annonces nouvelles, met à jour le registre des annonces vues. */
export async function markNewAndPersist(listings: Listing[]): Promise<Listing[]> {
  await ensureDir();
  const seen = await readJson<SeenMap>(SEEN_FILE, {});
  const now = new Date().toISOString();

  const result = listings.map((l) => {
    const firstSeenAt = seen[l.id];
    if (firstSeenAt) {
      return { ...l, firstSeenAt, isNew: false };
    }
    seen[l.id] = now;
    return { ...l, firstSeenAt: now, isNew: true };
  });

  await fs.writeFile(SEEN_FILE, JSON.stringify(seen, null, 2), "utf8");
  return result;
}

export async function saveSnapshot(listings: Listing[]): Promise<void> {
  await ensureDir();
  const snap: Snapshot = { fetchedAt: new Date().toISOString(), listings };
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snap, null, 2), "utf8");
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  return readJson<Snapshot | null>(SNAPSHOT_FILE, null);
}

/** Le snapshot est-il encore frais ? (TTL en minutes) */
export function isFresh(snap: Snapshot | null, ttlMinutes: number): boolean {
  if (!snap) return false;
  const age = Date.now() - new Date(snap.fetchedAt).getTime();
  return age < ttlMinutes * 60_000;
}
