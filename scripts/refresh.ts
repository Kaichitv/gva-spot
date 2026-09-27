/**
 * Script CLI : interroge les sources, met à jour le cache (annonces vues +
 * snapshot) et affiche un rapport. Utile pour pré-remplir le registre des
 * annonces (badge "nouveau") ou pour brancher un cron sur ta machine.
 *
 *   npm run refresh
 *
 * Charge .env via le loader partagé (scripts/load-env.ts).
 */

import { loadEnv } from "./load-env";

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
