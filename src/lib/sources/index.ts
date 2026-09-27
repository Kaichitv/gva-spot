import type { BoundingBox, FetchReport, Listing, SourceAdapter } from "../types";
import { flatfox } from "./flatfox";
import { appt } from "./appt";
import { immobilier } from "./immobilier";
import { homegate } from "./homegate";
import { immoscout } from "./immoscout";
import { anibis } from "./anibis";

export const ALL_SOURCES: SourceAdapter[] = [
  flatfox,
  appt,
  immobilier,
  homegate,
  immoscout,
  anibis,
];

export function enabledSources(): SourceAdapter[] {
  return ALL_SOURCES.filter((s) => s.enabled);
}

// Une variable vide ou invalide retombe sur la valeur par défaut (sinon Number("") = 0).
function envCoord(name: string, fallback: number): number {
  const v = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(v) ? v : fallback;
}

export function defaultBox(): BoundingBox {
  return {
    north: envCoord("GE_NORTH", 46.35),
    south: envCoord("GE_SOUTH", 46.12),
    east: envCoord("GE_EAST", 6.32),
    west: envCoord("GE_WEST", 5.95),
  };
}

/**
 * Interroge toutes les sources activées en parallèle. Une source qui échoue
 * n'empêche pas les autres : on renvoie ce qu'on a + un rapport par source.
 */
export async function fetchAll(
  box: BoundingBox
): Promise<{ listings: Listing[]; reports: FetchReport[] }> {
  const sources = enabledSources();
  const results = await Promise.all(
    sources.map(async (s): Promise<{ listings: Listing[]; report: FetchReport }> => {
      const t0 = Date.now();
      try {
        const listings = await s.fetch(box);
        return {
          listings,
          report: { source: s.id, ok: true, count: listings.length, ms: Date.now() - t0 },
        };
      } catch (e) {
        return {
          listings: [],
          report: {
            source: s.id,
            ok: false,
            count: 0,
            ms: Date.now() - t0,
            error: e instanceof Error ? e.message : String(e),
          },
        };
      }
    })
  );

  return {
    listings: results.flatMap((r) => r.listings),
    reports: results.map((r) => r.report),
  };
}
