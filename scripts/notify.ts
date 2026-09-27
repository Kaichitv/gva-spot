/**
 * Script CLI : ré-interroge les sources, détecte les annonces jamais notifiées
 * qui correspondent aux critères de chaque abonnement et envoie les Web Push.
 *
 *   npm run notify             passage normal (à brancher sur un cron)
 *   npm run notify -- --test   notif factice à tous les abonnés (validation)
 *
 * Charge .env via le loader partagé (scripts/load-env.ts).
 */

import { loadEnv } from "./load-env";

async function main() {
  await loadEnv();
  // Import différé pour que les variables d'env soient déjà en place.
  const { runNotifier, formatSummary } = await import("../src/lib/notify");

  const test = process.argv.includes("--test");
  console.log(test ? "→ Envoi d'une notification de test…" : "→ Recherche de nouveautés…");
  const summary = await runNotifier({ test });
  console.log("\n" + formatSummary(summary));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
