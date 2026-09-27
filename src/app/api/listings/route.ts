import { NextRequest, NextResponse, after } from "next/server";
import { dedupe } from "@/lib/dedupe";
import { applyFilters, criteriaFromParams, sortListings } from "@/lib/filter";
import { isFresh, loadSnapshot } from "@/lib/cache";
import { isRefreshing, refreshIfIdle } from "@/lib/refresh";

// Toujours dynamique : le snapshot évolue.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Région Vercel proche des portails suisses (défaut : États-Unis).
export const preferredRegion = "fra1";
// Le rafraîchissement en arrière-plan (after) vit dans la même invocation.
export const maxDuration = 300;

// Au-delà, le snapshot est rafraîchi en arrière-plan. Le rafraîchissement
// régulier est assuré par le cron (/api/cron/notify) ; ceci n'est qu'un filet.
const TTL_MINUTES = 30;

/**
 * Recherche = lecture du dernier snapshot + filtrage : quasi instantané.
 * Les portails ne sont jamais interrogés pendant la requête, sauf au tout
 * premier lancement (aucun snapshot). S'il est périmé (ou ?refresh=1), on
 * répond avec l'existant et on rafraîchit après la réponse ; `refreshing`
 * indique au client de revenir chercher la nouvelle version.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const criteria = criteriaFromParams(params);
  const forceRefresh = params.get("refresh") === "1";

  let snap = await loadSnapshot();
  let refreshing = false;

  if (!snap) {
    snap = await refreshIfIdle();
    refreshing = !snap;
  } else if (forceRefresh || !isFresh(snap, TTL_MINUTES)) {
    refreshing = true;
    if (!(await isRefreshing())) {
      after(() =>
        refreshIfIdle().catch((e) => console.error("[listings] rafraîchissement", e))
      );
    }
  }

  const deduped = dedupe(snap?.listings ?? []);
  const filtered = sortListings(applyFilters(deduped, criteria));

  return NextResponse.json(
    {
      fetchedAt: snap?.fetchedAt ?? new Date().toISOString(),
      refreshing,
      total: filtered.length,
      totalBeforeFilters: deduped.length,
      reports: snap?.reports ?? [],
      listings: filtered,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
