// Helpers d'interface autour des critères de recherche (purs, côté client).
// Aucun effet sur le filtrage lui-même, centralisé dans filter.ts.

import type { SearchCriteria } from "./types";
import { ZIP_TO_NEIGHBORHOOD } from "./normalize";

/** Critères → query string de GET /api/listings. */
export function buildParams(c: SearchCriteria, refresh = false): string {
  const p = new URLSearchParams();
  if (c.minRooms != null) p.set("minRooms", String(c.minRooms));
  if (c.maxRooms != null) p.set("maxRooms", String(c.maxRooms));
  if (c.minSurface != null) p.set("minSurface", String(c.minSurface));
  if (c.maxRent != null) p.set("maxRent", String(c.maxRent));
  if (c.minRent != null) p.set("minRent", String(c.minRent));
  if (c.furnished != null) p.set("furnished", String(c.furnished));
  if (c.onlyNew) p.set("onlyNew", "true");
  if (c.neighborhoods?.length) p.set("neighborhoods", c.neighborhoods.join(","));
  if (c.zips?.length) p.set("zips", c.zips.join(","));
  if (c.query) p.set("query", c.query);
  if (refresh) p.set("refresh", "1");
  return p.toString();
}

/** Retire les valeurs vides (undefined, "", []) pour un stockage propre. */
export function cleanCriteria(c: SearchCriteria): SearchCriteria {
  const out: SearchCriteria = {};
  for (const [k, v] of Object.entries(c)) {
    if (v == null || v === "" || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function sameCriteria(a: SearchCriteria, b: SearchCriteria): boolean {
  const norm = (c: SearchCriteria) =>
    JSON.stringify(Object.entries(cleanCriteria(c)).sort(([x], [y]) => x.localeCompare(y)));
  return norm(a) === norm(b);
}

/** Nombre de filtres actifs (pastille du bouton « Filtres »). */
export function countActive(c: SearchCriteria): number {
  return [
    c.minRooms != null || c.maxRooms != null,
    c.minSurface != null,
    c.minRent != null || c.maxRent != null,
    !!c.neighborhoods?.length,
    !!c.zips?.length,
    !!c.query,
    c.furnished === true,
    !!c.onlyNew,
  ].filter(Boolean).length;
}

/** Quartiers proposés : Ville de Genève (NPA 1201–1209) puis communes. */
export const NEIGHBORHOOD_GROUPS: { label: string; items: string[] }[] = (() => {
  const city = new Set<string>();
  const communes = new Set<string>();
  for (const [zip, name] of Object.entries(ZIP_TO_NEIGHBORHOOD)) {
    (Number(zip) <= 1209 ? city : communes).add(name);
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "fr"));
  return [
    { label: "Ville de Genève", items: sort(city) },
    { label: "Communes", items: sort(communes) },
  ];
})();

export const chf = (n: number) => n.toLocaleString("fr-CH");

/** « 3–4.5 p. », « ≥ 3 p. », « ≤ 2 500 CHF »… (unité une seule fois). */
function rangeLabel(
  min: number | undefined,
  max: number | undefined,
  fmt: (n: number) => string,
  unit: string
): string | null {
  if (min != null && max != null)
    return min === max ? `${fmt(min)} ${unit}` : `${fmt(min)}–${fmt(max)} ${unit}`;
  if (min != null) return `≥ ${fmt(min)} ${unit}`;
  if (max != null) return `≤ ${fmt(max)} ${unit}`;
  return null;
}

/** Ligne 1 de la barre de recherche : où. */
export function whereLabel(c: SearchCriteria): string {
  const n = c.neighborhoods ?? [];
  if (!n.length) return "Tout Genève";
  return n.length === 1 ? n[0] : `${n[0]} +${n.length - 1}`;
}

/** Ligne 2 de la barre de recherche : quoi (null si aucun critère). */
export function whatLabel(c: SearchCriteria): string | null {
  const parts = [
    rangeLabel(c.minRent, c.maxRent, chf, "CHF"),
    rangeLabel(c.minRooms, c.maxRooms, String, "p."),
    c.minSurface != null ? `≥ ${c.minSurface} m²` : null,
    c.query ? `« ${c.query} »` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
