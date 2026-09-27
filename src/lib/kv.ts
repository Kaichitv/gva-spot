import { promises as fs } from "node:fs";
import path from "node:path";
// Client HTTP pur (pas de binaire natif) : fonctionne tel quel sur Vercel.
import { createClient, type Client } from "@libsql/client/web";
import { DATA_DIR } from "./data-dir";

/**
 * Stockage clé → JSON. Turso (libSQL) si TURSO_DATABASE_URL est défini,
 * sinon un fichier `<clé>.json` sous DATA_DIR (auto-hébergé / dev hors ligne).
 *
 * Une clé absente renvoie `fallback`. Une panne Turso lève une erreur : mieux
 * vaut échouer que repartir d'un registre vide (tout redeviendrait « nouveau »).
 */

let client: Client | null | undefined;
let tableReady: Promise<unknown> | null = null;

function turso(): Client | null {
  if (client === undefined) {
    const url = process.env.TURSO_DATABASE_URL;
    client = url
      ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
      : null;
  }
  return client;
}

function ready(db: Client): Promise<unknown> {
  tableReady ??= db
    .execute(
      "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    .catch((e) => {
      tableReady = null;
      throw e;
    });
  return tableReady;
}

export function kvBackend(): "turso" | "file" {
  return turso() ? "turso" : "file";
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const db = turso();
  if (db) {
    await ready(db);
    const rs = await db.execute({ sql: "SELECT value FROM kv WHERE key = ?", args: [key] });
    const raw = rs.rows[0]?.value;
    return typeof raw === "string" ? (JSON.parse(raw) as T) : fallback;
  }
  try {
    return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  const db = turso();
  if (db) {
    await ready(db);
    await db.execute({
      sql: "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      args: [key, json, new Date().toISOString()],
    });
    return;
  }
  // Écriture atomique (fichier temporaire + rename) : jamais de JSON tronqué.
  const file = fileFor(key);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, file);
}

function fileFor(key: string): string {
  return path.join(DATA_DIR, `${key}.json`);
}
