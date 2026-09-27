// Normalisation transverse : quartiers de Genève par NPA, helpers de parsing.

/** Correspondance NPA (code postal) -> quartier/commune, ville de Genève et proches. */
export const ZIP_TO_NEIGHBORHOOD: Record<string, string> = {
  "1201": "Gare / Pâquis",
  "1202": "Nations / Sécheron",
  "1203": "Saint-Jean / Charmilles",
  "1204": "Centre / Rive",
  "1205": "Plainpalais / Jonction",
  "1206": "Champel / Malagnou",
  "1207": "Eaux-Vives",
  "1208": "Eaux-Vives / Frontenex",
  "1209": "Petit-Saconnex",
  // Communes limitrophes fréquentes
  "1212": "Grand-Lancy",
  "1213": "Onex / Petit-Lancy",
  "1214": "Vernier",
  "1216": "Cointrin",
  "1217": "Meyrin",
  "1218": "Le Grand-Saconnex",
  "1219": "Châtelaine / Aïre / Le Lignon",
  "1220": "Les Avanchets",
  "1223": "Cologny",
  "1224": "Chêne-Bougeries",
  "1225": "Chêne-Bourg",
  "1226": "Thônex",
  "1227": "Carouge / Acacias",
  "1228": "Plan-les-Ouates",
  "1231": "Conches",
  "1290": "Versoix",
};

export function neighborhoodFromZip(zip?: string | null): string | null {
  if (!zip) return null;
  return ZIP_TO_NEIGHBORHOOD[zip.trim()] ?? null;
}

/** Extrait un NPA à 4 chiffres genevois (12xx) d'une chaîne d'adresse libre. */
export function extractZip(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(/\b(12\d{2})\b/);
  return m ? m[1] : null;
}

/** Parse un nombre depuis une valeur hétérogène ("3.5", "CHF 2'400.–", 1800…). */
export function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v)
    .replace(/[’']/g, "") // séparateurs de milliers suisses
    .replace(/[^\d.,-]/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Tronque un texte proprement (on évite de dupliquer les descriptions complètes). */
export function excerpt(text?: string | null, max = 180): string | undefined {
  if (!text) return undefined;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

/** Loyer de référence pour les filtres : charges comprises si dispo, sinon net. */
export function effectiveRent(l: {
  rentGross?: number | null;
  rentNet?: number | null;
}): number | null {
  return l.rentGross ?? l.rentNet ?? null;
}
