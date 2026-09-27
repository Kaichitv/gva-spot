import type { DedupedListing } from "./dedupe";
import type { SearchCriteria } from "./types";
import { effectiveRent } from "./normalize";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Applique les critères de recherche à une liste dédoublonnée. */
export function applyFilters(
  listings: DedupedListing[],
  c: SearchCriteria
): DedupedListing[] {
  return listings.filter((l) => {
    if (c.minRooms != null && (l.rooms == null || l.rooms < c.minRooms)) return false;
    if (c.maxRooms != null && (l.rooms == null || l.rooms > c.maxRooms)) return false;

    if (c.minSurface != null && (l.livingSpace == null || l.livingSpace < c.minSurface))
      return false;

    const rent = effectiveRent(l);
    if (c.maxRent != null) {
      // Un loyer inconnu ne doit pas être exclu silencieusement : on le garde,
      // mais on pourra le signaler côté UI. Ici on n'exclut que si connu et trop cher.
      if (rent != null && rent > c.maxRent) return false;
    }
    if (c.minRent != null && rent != null && rent < c.minRent) return false;

    if (c.furnished != null && l.furnished != null && l.furnished !== c.furnished)
      return false;

    if (c.onlyNew && !l.isNew) return false;

    if (c.zips?.length) {
      if (!l.zip || !c.zips.includes(l.zip)) return false;
    }

    if (c.neighborhoods?.length) {
      const hay = norm(
        [l.neighborhood, l.address, l.city].filter(Boolean).join(" ")
      );
      const match = c.neighborhoods.some((n) => hay.includes(norm(n)));
      if (!match) return false;
    }

    if (c.query) {
      const hay = norm(
        [l.title, l.address, l.excerpt, l.agency, l.neighborhood]
          .filter(Boolean)
          .join(" ")
      );
      if (!hay.includes(norm(c.query))) return false;
    }

    return true;
  });
}

/** Tri par défaut : nouveautés d'abord, puis loyer croissant. */
export function sortListings(listings: DedupedListing[]): DedupedListing[] {
  return [...listings].sort((a, b) => {
    if (!!a.isNew !== !!b.isNew) return a.isNew ? -1 : 1;
    const ra = effectiveRent(a) ?? Infinity;
    const rb = effectiveRent(b) ?? Infinity;
    return ra - rb;
  });
}

/** Parse les critères depuis les query params de l'URL. */
export function criteriaFromParams(params: URLSearchParams): SearchCriteria {
  const num = (k: string) => {
    const v = params.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  const list = (k: string) => {
    const v = params.get(k);
    return v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
  };
  const bool = (k: string) => {
    const v = params.get(k);
    if (v == null || v === "") return undefined;
    return v === "true" || v === "1";
  };
  return {
    minRooms: num("minRooms"),
    maxRooms: num("maxRooms"),
    minSurface: num("minSurface"),
    maxRent: num("maxRent"),
    minRent: num("minRent"),
    furnished: bool("furnished"),
    neighborhoods: list("neighborhoods"),
    zips: list("zips"),
    query: params.get("query") || undefined,
    onlyNew: bool("onlyNew"),
  };
}
