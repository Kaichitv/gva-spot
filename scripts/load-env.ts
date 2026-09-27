/**
 * Charge .env manuellement (pas de dépendance dotenv). Partagé par les CLI
 * (`refresh`, `notify`). Les variables déjà présentes dans l'environnement
 * gardent la priorité.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // pas de .env : on garde les valeurs par défaut
  }
}
