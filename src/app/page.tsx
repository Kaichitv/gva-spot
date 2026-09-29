"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DedupedListing } from "@/lib/dedupe";
import type { FetchReport, SearchCriteria } from "@/lib/types";
import Filters from "@/components/Filters";
import ListingCard from "@/components/ListingCard";
import PushToggle from "@/components/PushToggle";
import ElsewhereLinks from "@/components/ElsewhereLinks";
import { CRITERIA_STORAGE_KEY, syncPushCriteria } from "@/lib/push-client";
import { buildParams, countActive } from "@/lib/criteria-ui";
import { ArrowClockwise, CaretDown } from "@phosphor-icons/react";

interface ApiResponse {
  fetchedAt: string;
  /** Mise à jour des sources en cours côté serveur : revenir chercher plus tard. */
  refreshing?: boolean;
  total: number;
  totalBeforeFilters: number;
  reports: FetchReport[];
  listings: DedupedListing[];
}

const STORAGE_KEY = CRITERIA_STORAGE_KEY;
const POLL_MS = 15_000;
// ~5 min : au-delà, le rafraîchissement a sans doute échoué, on arrête d'insister.
const MAX_POLLS = 20;

export default function Page() {
  const [criteria, setCriteria] = useState<SearchCriteria>({});
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCriteria(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  const run = useCallback(async (c: SearchCriteria, refresh = false, silent = false) => {
    if (!silent) {
      polls.current = 0;
      setLoading(true);
    }
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

  // Sources en cours de mise à jour : on recharge discrètement jusqu'à la nouvelle version.
  useEffect(() => {
    if (!data?.refreshing || polls.current >= MAX_POLLS) return;
    const t = setTimeout(() => {
      polls.current++;
      run(criteria, false, true);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [data, criteria, run]);

  const updating = loading || (!!data?.refreshing && polls.current < MAX_POLLS);

  const persist = (c: SearchCriteria) => {
    setCriteria(c);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {}
    // Abonné aux alertes ? On aligne les critères côté serveur (débouncé).
    syncPushCriteria(c);
  };

  // Critères appliqués immédiatement : persistance + recherche.
  const apply = (c: SearchCriteria) => {
    persist(c);
    run(c);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const fetchedLabel = data ? formatFetchedAt(data.fetchedAt) : "—";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      {/* En-tête */}
      <header className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold leading-none tracking-tight">
          Rechercher
        </h1>
        <div className="flex items-center gap-2">
          <PushToggle />
          <button
            type="button"
            onClick={() => run(criteria, true)}
            disabled={updating}
            title={
              data?.refreshing
                ? "Mise à jour des annonces en cours…"
                : "Mettre à jour les annonces (en arrière-plan)"
            }
            aria-label={`Actualiser — dernière mise à jour ${fetchedLabel}`}
            className="chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-muted transition-colors duration-150 hover:text-ink disabled:opacity-60"
          >
            <ArrowClockwise
              size={13}
              weight="bold"
              className={updating ? "animate-spin" : ""}
            />
            <span className="tabular-nums">{fetchedLabel}</span>
          </button>
        </div>
      </header>

      <Filters
        value={criteria}
        onChange={apply}
        loading={loading}
        total={data?.total}
      />

      {error && (
        <div role="alert" className="card mt-1 mb-3 p-4 text-[14px] text-danger">
          ⚠️ {error}
        </div>
      )}

      {/* Skeletons de chargement */}
      {loading && (
        <div className="mt-1 flex flex-col gap-3">
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
        <div className="mt-1 flex flex-col gap-3">
          {data.listings.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
          {data.listings.length === 0 && (
            <div className="card flex flex-col items-center gap-4 px-6 py-10 text-center">
              <div>
                <p className="text-[16px] font-semibold">Aucune annonce</p>
                <p className="mt-1 text-[14px] text-muted">
                  Essaie d&apos;élargir le budget, les pièces ou les quartiers.
                </p>
              </div>
              {countActive(criteria) > 0 && (
                <button
                  type="button"
                  onClick={() => apply({})}
                  className="chip rounded-full px-4 py-2.5 text-[14px] font-semibold"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fin de liste (ou aucun résultat) : sources non agrégées, en lien sortant */}
      {!loading && data && <ElsewhereLinks criteria={criteria} />}

      {/* Rapport sources */}
      {data && (
        <details className="group mt-6">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 text-[12px] text-muted transition-colors duration-150 hover:text-ink">
            <CaretDown
              size={13}
              weight="bold"
              className="transition-transform duration-200 group-open:rotate-180"
            />
            Sources ({data.reports.length}) · {data.totalBeforeFilters} annonces
            après dédoublonnage
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
        personnelle n&apos;est réhébergée.
      </p>
    </main>
  );
}

/** Heure seule si c'est aujourd'hui, sinon date courte + heure. */
function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })} ${time}`;
}
