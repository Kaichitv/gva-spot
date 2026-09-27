"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchCriteria } from "@/lib/types";
import { countActive, whatLabel, whereLabel } from "@/lib/criteria-ui";
import FilterSheet from "@/components/FilterSheet";
import {
  Armchair,
  MagnifyingGlass,
  SlidersHorizontal,
  Sparkle,
} from "@phosphor-icons/react";

/**
 * Barre de recherche collante (mobile first, inspirée d'Airbnb) :
 * - une « pilule » qui résume la recherche et ouvre le panneau de filtres ;
 * - une rangée de bascules rapides (appliquées immédiatement) + le compteur.
 */

interface Props {
  value: SearchCriteria;
  /** Applique immédiatement les critères (persistance + recherche). */
  onChange: (next: SearchCriteria) => void;
  loading: boolean;
  total?: number;
  fetchedAt?: string;
}

export default function Filters({
  value,
  onChange,
  loading,
  total,
  fetchedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Ombre sous la barre uniquement quand elle colle en haut de l'écran.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const active = countActive(value);
  const what = whatLabel(value);
  const where = whereLabel(value);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        className={
          "sticky top-0 z-30 -mx-4 bg-canvas px-4 pb-3 transition-shadow duration-200 sm:-mx-6 sm:px-6 " +
          (stuck ? "shadow-[0_1px_0_var(--border),var(--shadow-md)]" : "")
        }
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        {/* Pilule de recherche */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Modifier la recherche : ${where}${what ? `, ${what}` : ""}${active ? `, ${active} filtre${active > 1 ? "s" : ""} actif${active > 1 ? "s" : ""}` : ""}`}
          className="card flex w-full items-center gap-3 rounded-full py-2 pl-4 pr-2 text-left transition-[border-color,box-shadow] duration-150 hover:border-(--border-strong) hover:shadow-(--shadow-lg)"
        >
          <MagnifyingGlass size={20} weight="bold" className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1" aria-hidden>
            <span className="block truncate text-[15px] font-semibold leading-5">
              {where}
            </span>
            <span className="block truncate text-[13px] leading-5 text-muted">
              {what ?? "Budget · pièces · surface"}
            </span>
          </span>
          <span
            aria-hidden
            className={
              "relative grid size-10 shrink-0 place-items-center rounded-full border " +
              (active ? "border-ink" : "border-line bg-surface-2")
            }
          >
            <SlidersHorizontal size={18} weight="bold" />
            {active > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink ring-2 ring-surface-1">
                {active}
              </span>
            )}
          </span>
        </button>

        {/* Bascules rapides + compteur (une seule ligne, jamais de retour) */}
        <div className="mt-3 flex items-center gap-2">
          <div className="no-scrollbar -my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
            <QuickToggle
              active={!!value.onlyNew}
              onClick={() => onChange({ ...value, onlyNew: value.onlyNew ? undefined : true })}
              icon={<Sparkle size={15} weight="fill" />}
              label="Nouveautés"
            />
            <QuickToggle
              active={value.furnished === true}
              onClick={() =>
                onChange({ ...value, furnished: value.furnished ? undefined : true })
              }
              icon={<Armchair size={15} weight="fill" />}
              label="Meublé"
            />
          </div>
          <p
            aria-live="polite"
            className="shrink-0 whitespace-nowrap text-[13px] text-muted"
          >
            {loading ? (
              "Recherche…"
            ) : total != null ? (
              <>
                <span className="font-semibold text-ink tabular-nums">{total}</span>{" "}
                annonce{total > 1 ? "s" : ""}
              </>
            ) : null}
          </p>
        </div>
      </div>

      <FilterSheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        onApply={onChange}
        total={total}
        fetchedAt={fetchedAt}
      />
    </>
  );
}

function QuickToggle({
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
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 " +
        (active
          ? "border-transparent bg-accent text-accent-ink shadow-(--shadow-sm) hover:bg-accent-hover"
          : "border-line bg-surface-1 text-ink hover:border-(--border-strong)")
      }
    >
      {icon}
      {label}
    </button>
  );
}
