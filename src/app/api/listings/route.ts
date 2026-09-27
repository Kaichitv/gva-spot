import { NextRequest, NextResponse } from "next/server";
import { defaultBox, fetchAll } from "@/lib/sources";
import { dedupe } from "@/lib/dedupe";
import { applyFilters, criteriaFromParams, sortListings } from "@/lib/filter";
import {
  isFresh,
  loadSnapshot,
  markNewAndPersist,
  saveSnapshot,
} from "@/lib/cache";
import type { FetchReport, Listing } from "@/lib/types";

// Toujours dynamique : on interroge des sources externes.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Région Vercel proche des portails suisses (défaut : États-Unis).
export const preferredRegion = "fra1";
// immobilier.ch pagine avec des pauses de politesse : ~1 min.
export const maxDuration = 120;

// Durée pendant laquelle on réutilise le dernier snapshot sans re-solliciter
// les portails (politesse + rapidité). Contournable avec ?refresh=1.
const TTL_MINUTES = 15;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const criteria = criteriaFromParams(params);
  const forceRefresh = params.get("refresh") === "1";

  let raw: Listing[];
  let reports: FetchReport[] = [];
  let fetchedAt: string;

  const snap = await loadSnapshot();
  if (!forceRefresh && isFresh(snap, TTL_MINUTES) && snap) {
    raw = snap.listings;
    fetchedAt = snap.fetchedAt;
    // Rapport reconstruit depuis le cache : comptage par source.
    const bySource = new Map<Listing["source"], number>();
    for (const l of raw) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);
    reports = [...bySource.entries()].map(([source, count]) => ({
      source,
      ok: true,
      count,
      ms: 0,
      error: "(depuis le cache)",
    }));
  } else {
    const result = await fetchAll(defaultBox());
    raw = await markNewAndPersist(result.listings);
    reports = result.reports;
    fetchedAt = new Date().toISOString();
    await saveSnapshot(raw);
  }

  const deduped = dedupe(raw);
  const filtered = sortListings(applyFilters(deduped, criteria));

  return NextResponse.json(
    {
      fetchedAt,
      total: filtered.length,
      totalBeforeFilters: deduped.length,
      reports,
      listings: filtered,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
