"use client";

import type { SearchCriteria } from "@/lib/types";
import { ZIP_TO_NEIGHBORHOOD } from "@/lib/normalize";
import {
  MagnifyingGlass,
  ArrowClockwise,
  MapPin,
  Sparkle,
  Armchair,
  X,
  CaretDown,
} from "@phosphor-icons/react";

interface Props {
  value: SearchCriteria;
  onChange: (next: SearchCriteria) => void;
  onSearch: () => void;
  onRefresh: () => void;
  loading: boolean;
}

const NEIGHBORHOODS = Array.from(
  new Set(Object.values(ZIP_TO_NEIGHBORHOOD))
).sort();

const fieldCls = "field w-full appearance-none px-3 py-2.5 text-[15px]";
const labelCls =
  "text-[11px] font-semibold uppercase tracking-wide text-muted";

export default function Filters({
  value,
  onChange,
  onSearch,
  onRefresh,
  loading,
}: Props) {
  const set = <K extends keyof SearchCriteria>(k: K, v: SearchCriteria[K]) =>
    onChange({ ...value, [k]: v });
  const numOrUndef = (s: string) => (s === "" ? undefined : Number(s));

  const toggle = (k: "onlyNew" | "furnished") => {
    const active = k === "furnished" ? value.furnished === true : !!value[k];
    set(k, active ? undefined : (true as never));
  };

  return (
    <form
      className="card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Pièces min</label>
          <input
            type="number"
            step="0.5"
            min="1"
            inputMode="decimal"
            className={fieldCls}
            value={value.minRooms ?? ""}
            onChange={(e) => set("minRooms", numOrUndef(e.target.value))}
            placeholder="3"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Pièces max</label>
          <input
            type="number"
            step="0.5"
            min="1"
            inputMode="decimal"
            className={fieldCls}
            value={value.maxRooms ?? ""}
            onChange={(e) => set("maxRooms", numOrUndef(e.target.value))}
            placeholder="5"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Surface min · m²</label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className={fieldCls}
            value={value.minSurface ?? ""}
            onChange={(e) => set("minSurface", numOrUndef(e.target.value))}
            placeholder="60"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Loyer max · CHF</label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className={fieldCls}
            value={value.maxRent ?? ""}
            onChange={(e) => set("maxRent", numOrUndef(e.target.value))}
            placeholder="2500"
          />
        </div>
      </div>

      {/* Quartiers */}
      <div className="mt-3 flex flex-col gap-1.5">
        <label className={labelCls}>
          <MapPin size={12} weight="fill" className="mr-1 inline align-[-1px]" />
          Quartiers · communes
        </label>
        <div className="relative">
          <select
            className={fieldCls + " pr-9"}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const cur = value.neighborhoods ?? [];
              if (!cur.includes(v)) set("neighborhoods", [...cur, v]);
            }}
          >
            <option value="">Ajouter un quartier…</option>
            {NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
        {!!value.neighborhoods?.length && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {value.neighborhoods.map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`Retirer ${n}`}
                className="chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium"
                onClick={() =>
                  set(
                    "neighborhoods",
                    value.neighborhoods!.filter((x) => x !== n)
                  )
                }
              >
                {n}
                <X size={12} weight="bold" className="text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recherche plein texte */}
      <div className="mt-3 flex flex-col gap-1.5">
        <label className={labelCls}>Mot-clé</label>
        <input
          type="text"
          className={fieldCls}
          value={value.query ?? ""}
          onChange={(e) => set("query", e.target.value || undefined)}
          placeholder="balcon, traversant, meublé…"
        />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[15px] font-semibold disabled:opacity-60"
        >
          <MagnifyingGlass size={17} weight="bold" />
          {loading ? "Recherche…" : "Filtrer"}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Re-interroger les portails (ignore le cache)"
          className="chip inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[15px] font-medium disabled:opacity-60"
        >
          <ArrowClockwise
            size={17}
            weight="bold"
            className={loading ? "animate-spin" : ""}
          />
          Actualiser
        </button>

        <div className="ml-auto flex items-center gap-2">
          <SegToggle
            active={!!value.onlyNew}
            onClick={() => toggle("onlyNew")}
            icon={<Sparkle size={15} weight="fill" />}
            label="Nouveautés"
          />
          <SegToggle
            active={value.furnished === true}
            onClick={() => toggle("furnished")}
            icon={<Armchair size={15} weight="fill" />}
            label="Meublé"
          />
        </div>
      </div>
    </form>
  );
}

function SegToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors duration-150 " +
        (active
          ? "border-transparent bg-accent text-accent-ink shadow-[var(--shadow-sm)] hover:bg-accent-hover"
          : "border-line bg-surface-2 text-muted hover:text-ink")
      }
    >
      {icon}
      {label}
    </button>
  );
}
