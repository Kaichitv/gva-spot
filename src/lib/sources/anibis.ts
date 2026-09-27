import type { SourceAdapter } from "../types";
import { fetchViaApify } from "./apify";

/**
 * Anibis (groupe SMG) — via Apify. Désactivé par défaut.
 * ⚠️ Rappel : les CGU d'Anibis interdisent explicitement la duplication des
 * annonces (photos, données personnelles). On reste en mode "redirige vers la
 * source" : on n'affiche qu'un lien + les métadonnées de filtrage.
 */
export const anibis: SourceAdapter = {
  id: "anibis",
  label: "Anibis",
  enabled: process.env.SOURCE_ANIBIS === "true",
  fetch: (box) => fetchViaApify({ source: "anibis", envActor: "APIFY_ACTOR_ANIBIS" }, box),
};
