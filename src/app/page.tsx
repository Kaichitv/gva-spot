"use client";

import { useCallback, useEffect, useState } from "react";
import type { DedupedListing } from "@/lib/dedupe";
import type { FetchReport, SearchCriteria } from "@/lib/types";
import Filters from "@/components/Filters";
import ListingCard from "@/components/ListingCard";
import PushToggle from "@/components/PushToggle";
import { CRITERIA_STORAGE_KEY, syncPushCriteria } from "@/lib/push-client";
import { House, Clock, CaretDown } from "@phosphor-icons/react";

interface ApiResponse {
  fetchedAt: string;
  total: number;
  totalBeforeFilters: number;
  reports: FetchReport[];
  listings: DedupedListing[];
}

const STORAGE_KEY = CRITERIA_STORAGE_KEY;

function buildParams(c: SearchCriteria, refresh: boolean): string {
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

export default function Page() {
  const [criteria, setCriteria] = useState<SearchCriteria>({});
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCriteria(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  const run = useCallback(async (c: SearchCriteria, refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings?${buildParams(c, refresh)}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated) run(criteria);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const persist = (c: SearchCriteria) => {
    setCriteria(c);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {}
    // Abonné aux alertes ? On aligne les critères côté serveur (débouncé).
    syncPushCriteria(c);
  };

  const fetchedLabel = data
    ? new Date(data.fetchedAt).toLocaleString("fr-CH", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      {/* En-tête */}
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div>
            <h1 className="text-[22px] font-bold leading-none tracking-tight">
              Rechercher
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PushToggle />
          <span className="chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-muted">
            <Clock size={13} weight="bold" />
            {fetchedLabel}
          </span>
        </div>
      </header>

      <Filters
        value={criteria}
        onChange={persist}
        onSearch={() => run(criteria)}
        onRefresh={() => run(criteria, true)}
        loading={loading}
      />

      {/* Compteur */}
      {data && !loading && (
        <p className="mt-4 px-1 text-[13px] text-muted">
          <span className="font-semibold text-ink">
            {data.total}
          </span>{" "}
          annonce{data.total > 1 ? "s" : ""} · {data.totalBeforeFilters} après
          dédoublonnage
        </p>
      )}

      {error && (
        <div role="alert" className="card mt-4 p-4 text-[14px] text-danger">
          ⚠️ {error}
        </div>
      )}

      {/* Skeletons de chargement */}
      {loading && (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[132px] animate-pulse rounded-2xl border border-line bg-surface-2"
            />
          ))}
        </div>
      )}

      {/* Liste */}
      {!loading && data && (
        <div className="mt-4 flex flex-col gap-3">
          {data.listings.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
          {data.listings.length === 0 && (
            <div className="card p-10 text-center text-[14px] text-muted">
              Aucune annonce ne correspond.
              <br />
              Élargis les critères ou clique sur « Actualiser ».
            </div>
          )}
        </div>
      )}

      {/* Rapport sources */}
      {data && (
        <details className="group mt-6">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 text-[12px] text-muted transition-colors duration-150 hover:text-ink">
            <CaretDown
              size={13}
              weight="bold"
              className="transition-transform duration-200 group-open:rotate-180"
            />
            Sources ({data.reports.length})
          </summary>
          <ul className="mt-2 space-y-1 px-1 text-[12px] text-muted">
            {data.reports.map((r) => (
              <li key={r.source}>
                <span className="font-medium text-ink">
                  {r.source}
                </span>{" "}
                — {r.ok ? `${r.count} annonces` : "échec"}{" "}
                {r.error && <em className="opacity-80">({r.error})</em>} ·{" "}
                {r.ms} ms
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-8 border-t border-line px-1 pt-4 text-[11px] leading-relaxed text-muted">
        Outil personnel de veille. Les annonces restent la propriété de leurs
        portails et régies ; ce comparateur ne fait que rediriger vers la source
        (le contact se fait sur l&apos;annonce). Aucune photo ni coordonnée
        personnelle n&apos;est réhébergée. Pense aussi au logement subventionné
        (SFIDP · fidp.ch, GIM) et aux coopératives (CODHA, Équilibre), qui
        fonctionnent par inscription et non par annonces.
      </p>
    </main>
  );
}
