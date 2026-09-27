/**
 * Script CLI : interroge les sources, met à jour le cache (annonces vues +
 * snapshot) et affiche un rapport. Utile pour pré-remplir le registre des
 * annonces (badge "nouveau") ou pour brancher un cron sur ta machine.
 *
 *   npm run refresh
 *
 * Charge .env manuellement (pas de dépendance dotenv).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

async function loadEnv() {
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

async function main() {
  await loadEnv();
  // Import différé pour que les variables d'env soient déjà en place.
  const { fetchAll, defaultBox } = await import("../src/lib/sources/index");
  const { markNewAndPersist, saveSnapshot } = await import("../src/lib/cache");
  const { dedupe } = await import("../src/lib/dedupe");

  console.log("→ Interrogation des sources…");
  const { listings, reports } = await fetchAll(defaultBox());
  const withFlags = await markNewAndPersist(listings);
  await saveSnapshot(withFlags);
  const deduped = dedupe(withFlags);

  console.log("\nRapport par source :");
  for (const r of reports) {
    console.log(
      `  ${r.ok ? "✓" : "✗"} ${r.source.padEnd(10)} ${String(r.count).padStart(
        4
      )} annonces  ${r.ms}ms${r.error ? "  — " + r.error : ""}`
    );
  }
  const news = withFlags.filter((l) => l.isNew).length;
  console.log(
    `\n${listings.length} brutes · ${deduped.length} après dédoublonnage · ${news} nouvelles.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
