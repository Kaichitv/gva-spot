import type { SourceAdapter } from "../types";
import { fetchViaApify } from "./apify";

/** ImmoScout24 (groupe SMG) — via Apify. Désactivé par défaut. */
export const immoscout: SourceAdapter = {
  id: "immoscout",
  label: "ImmoScout24",
  enabled: process.env.SOURCE_IMMOSCOUT === "true",
  fetch: (box) => fetchViaApify({ source: "immoscout", envActor: "APIFY_ACTOR_IMMOSCOUT" }, box),
};
