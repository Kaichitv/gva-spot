import type { SourceAdapter } from "../types";
import { fetchViaApify } from "./apify";

/** Homegate (groupe SMG) — via Apify. Désactivé par défaut. */
export const homegate: SourceAdapter = {
  id: "homegate",
  label: "Homegate",
  enabled: process.env.SOURCE_HOMEGATE === "true",
  fetch: (box) => fetchViaApify({ source: "homegate", envActor: "APIFY_ACTOR_HOMEGATE" }, box),
};
