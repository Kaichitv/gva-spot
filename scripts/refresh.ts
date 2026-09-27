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
  const { refreshSnapshot } = await import("../src/lib/refresh");
  const { kvBackend } = await import("../src/lib/kv");
  const { dedupe } = await import("../src/lib/dedupe");

  console.log(`→ Interrogation des sources (stockage : ${kvBackend()})…`);
  const { listings: withFlags, reports = [] } = await refreshSnapshot();
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
    `\n${withFlags.length} brutes · ${deduped.length} après dédoublonnage · ${news} nouvelles.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
