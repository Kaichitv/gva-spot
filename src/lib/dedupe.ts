import type { Listing } from "./types";
import { effectiveRent } from "./normalize";

/**
 * Dédoublonnage : un même bien est souvent listé sur plusieurs portails.
 * On regroupe par signature approximative (adresse simplifiée + pièces + loyer),
 * et on garde une annonce représentante en conservant la liste des autres sources.
 */

function normStr(s?: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Clé de regroupement tolérante. */
function signature(l: Listing): string {
  const addr = normStr(l.address).replace(/\b(rue|route|chemin|avenue|av|ch|rte|place|quai|bd|boulevard)\b/g, "").trim();
  const rooms = l.rooms != null ? l.rooms.toFixed(1) : "?";
  const rent = effectiveRent(l);
  // On arrondit le loyer à la centaine pour absorber les petites variations (charges…).
  const rentBucket = rent != null ? Math.round(rent / 100) : "?";
  const surf = l.livingSpace != null ? Math.round(l.livingSpace / 5) : "?"; // buckets de 5 m²
  const zip = l.zip ?? "?";
  return `${zip}|${addr}|${rooms}|${rentBucket}|${surf}`;
}

export interface DedupedListing extends Listing {
  /** Autres sources où le même bien apparaît. */
  alsoOn?: { source: string; url: string }[];
}

export function dedupe(listings: Listing[]): DedupedListing[] {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) {
    const sig = signature(l);
    const arr = groups.get(sig);
    if (arr) arr.push(l);
    else groups.set(sig, [l]);
  }

  const out: DedupedListing[] = [];
  for (const group of groups.values()) {
    // Représentant = celui avec le plus d'infos (score simple), puis le plus récent.
    group.sort((a, b) => infoScore(b) - infoScore(a));
    const [rep, ...rest] = group;
    const merged: DedupedListing = { ...rep };
    if (rest.length) {
      merged.alsoOn = rest.map((r) => ({ source: r.source, url: r.sourceUrl }));
      // Complète les trous du représentant avec les doublons.
      for (const r of rest) {
        merged.rentGross ??= r.rentGross;
        merged.rentNet ??= r.rentNet;
        merged.livingSpace ??= r.livingSpace;
        merged.rooms ??= r.rooms;
        merged.imageUrl ??= r.imageUrl;
        merged.agency ??= r.agency;
        merged.availableFrom ??= r.availableFrom;
      }
    }
    out.push(merged);
  }
  return out;
}

function infoScore(l: Listing): number {
  let s = 0;
  if (l.rentGross != null) s += 2;
  if (l.rentNet != null) s += 1;
  if (l.livingSpace != null) s += 1;
  if (l.rooms != null) s += 1;
  if (l.address) s += 1;
  if (l.imageUrl) s += 1;
  if (l.excerpt) s += 1;
  return s;
}
