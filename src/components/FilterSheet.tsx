"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SearchCriteria } from "@/lib/types";
import {
  NEIGHBORHOOD_GROUPS,
  buildParams,
  chf,
  cleanCriteria,
  countActive,
  sameCriteria,
} from "@/lib/criteria-ui";
import {
  Armchair,
  Check,
  CircleNotch,
  MagnifyingGlass,
  Minus,
  Plus,
  Sparkle,
  X,
} from "@phosphor-icons/react";

/**
 * Panneau « Filtres » : bottom sheet sur mobile, modale centrée dès `sm`.
 * Travaille sur un brouillon ; rien n'est appliqué tant qu'on ne valide pas
 * (fermer = annuler, comme sur Airbnb).
 */

interface Props {
  open: boolean;
  onClose: () => void;
  value: SearchCriteria;
  onApply: (next: SearchCriteria) => void;
  /** Nombre de résultats des critères appliqués (valeur initiale du compteur). */
  total?: number;
}

const RENT_PRESETS = [1500, 2000, 2500, 3000, 3500, 4000];
const ROOMS = { min: 1, max: 8, step: 0.5 };

export default function FilterSheet({
  open,
  onClose,
  value,
  onApply,
  total,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState<SearchCriteria>(value);
  const [preview, setPreview] = useState<number | null>(total ?? null);
  const [previewing, setPreviewing] = useState(false);

  // Ouverture / fermeture du <dialog> natif (focus piégé, Échap, top-layer).
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(value);
      setPreview(total ?? null);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Verrouille le défilement de la page derrière le panneau.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [open]);

  // Compteur en direct (« Afficher 42 annonces »), débouncé, depuis le cache.
  useEffect(() => {
    if (!open) return;
    if (sameCriteria(draft, value)) {
      setPreview(total ?? null);
      setPreviewing(false);
      return;
    }
    const ctrl = new AbortController();
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/listings?${buildParams(draft)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setPreview((await res.json()).total);
      } catch {
        /* annulé ou hors ligne : on garde le libellé générique */
      } finally {
        if (!ctrl.signal.aborted) setPreviewing(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, draft, value, total]);

  // Glisser vers le bas pour fermer (tactile, sur la poignée / l'en-tête).
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button"))
      return;
    drag.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = dialogRef.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.style.transition = "none";
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const onDragEnd = () => {
    const d = drag.current;
    const el = dialogRef.current;
    drag.current = null;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (d && d.dy > 90) onClose();
  };

  const set = <K extends keyof SearchCriteria>(k: K, v: SearchCriteria[K]) =>
    setDraft((cur) => ({ ...cur, [k]: v }));

  const setRooms = (k: "minRooms" | "maxRooms", v: number | undefined) =>
    setDraft((cur) => {
      const next = { ...cur, [k]: v };
      // Garde min ≤ max en poussant l'autre borne.
      if (next.minRooms != null && next.maxRooms != null && next.minRooms > next.maxRooms) {
        if (k === "minRooms") next.maxRooms = next.minRooms;
        else next.minRooms = next.maxRooms;
      }
      return next;
    });

  const toggleNeighborhood = (n: string) => {
    const cur = draft.neighborhoods ?? [];
    set(
      "neighborhoods",
      cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]
    );
  };

  const apply = () => {
    onApply(cleanCriteria(draft));
    onClose();
  };

  const hasDraft = countActive(draft) > 0;
  const ctaLabel =
    preview == null
      ? "Afficher les annonces"
      : `Afficher ${preview} annonce${preview > 1 ? "s" : ""}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        // Clic sur le fond (le <dialog> lui-même, hors contenu) = fermer.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* En-tête (zone de glisser sur mobile) */}
      <div
        className="shrink-0 touch-none select-none border-b border-line"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 rounded-full bg-(--border-strong) sm:hidden"
        />
        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 py-2.5 sm:py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer sans appliquer"
            className="grid size-10 place-items-center rounded-full text-ink transition-colors duration-150 hover:bg-surface-2"
          >
            <X size={18} weight="bold" />
          </button>
          <h2 id={titleId} className="text-center text-[16px] font-semibold">
            Filtres
          </h2>
        </div>
      </div>

      {/* Corps défilant. `flex-auto` (base = contenu) et non `flex-1` (base 0%) :
          le panneau n'a qu'une max-height, et WebKit (iOS) écrase alors une
          base 0% à zéro — le panneau restait réduit à l'en-tête + pied. */}
      <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain">
        <Section title="Budget" hint="Loyer mensuel, charges comprises si connues.">
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberBox
              label="Minimum"
              prefix="CHF"
              value={draft.minRent}
              onChange={(v) => set("minRent", v)}
              placeholder="Indiff."
            />
            <NumberBox
              label="Maximum"
              prefix="CHF"
              value={draft.maxRent}
              onChange={(v) => set("maxRent", v)}
              placeholder="Indiff."
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {RENT_PRESETS.map((p) => (
              <Pill
                key={p}
                selected={draft.maxRent === p}
                onClick={() => set("maxRent", draft.maxRent === p ? undefined : p)}
              >
                ≤ {chf(p)}
              </Pill>
            ))}
          </div>
        </Section>

        <Section title="Taille">
          <div className="mt-2 divide-y divide-(--border)">
            <Stepper
              label="Pièces min."
              value={draft.minRooms}
              onChange={(v) => setRooms("minRooms", v)}
              start={ROOMS.min}
            />
            <Stepper
              label="Pièces max."
              value={draft.maxRooms}
              onChange={(v) => setRooms("maxRooms", v)}
              start={Math.max(draft.minRooms ?? ROOMS.min, 2)}
            />
          </div>
          <div className="mt-3">
            <NumberBox
              label="Surface minimum"
              suffix="m²"
              value={draft.minSurface}
              onChange={(v) => set("minSurface", v)}
              placeholder="Indiff."
              maxLength={4}
            />
          </div>
        </Section>

        <Section
          title="Quartiers"
          hint="Aucun sélectionné = tout Genève."
          action={
            draft.neighborhoods?.length ? (
              <button
                type="button"
                onClick={() => set("neighborhoods", undefined)}
                className="text-[14px] font-semibold underline underline-offset-4"
              >
                Effacer
              </button>
            ) : null
          }
        >
          {NEIGHBORHOOD_GROUPS.map((g) => (
            <div key={g.label} className="mt-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((n) => (
                  <Pill
                    key={n}
                    selected={!!draft.neighborhoods?.includes(n)}
                    onClick={() => toggleNeighborhood(n)}
                    check
                  >
                    {n}
                  </Pill>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Mot-clé" hint="Cherche dans le titre, l'adresse et l'extrait.">
          <label className="field mt-4 flex items-center gap-2.5 px-3.5">
            <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-muted" />
            <input
              type="search"
              enterKeyHint="search"
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70"
              value={draft.query ?? ""}
              onChange={(e) => set("query", e.target.value || undefined)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder="balcon, traversant, lac…"
              aria-label="Mot-clé"
            />
            {draft.query && (
              <button
                type="button"
                onClick={() => set("query", undefined)}
                aria-label="Effacer le mot-clé"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-1 text-muted hover:text-ink"
              >
                <X size={12} weight="bold" />
              </button>
            )}
          </label>
        </Section>

        <Section title="Options">
          <div className="mt-2 divide-y divide-(--border)">
            <SwitchRow
              icon={<Sparkle size={18} weight="fill" />}
              title="Nouveautés uniquement"
              hint="Annonces jamais vues auparavant."
              checked={!!draft.onlyNew}
              onChange={(v) => set("onlyNew", v || undefined)}
            />
            <SwitchRow
              icon={<Armchair size={18} weight="fill" />}
              title="Meublé"
              hint="Masque les logements non meublés."
              checked={draft.furnished === true}
              onChange={(v) => set("furnished", v || undefined)}
            />
          </div>
        </Section>
      </div>

      {/* Pied collant */}
      <div
        className="flex shrink-0 items-center justify-between gap-4 border-t border-line px-5 pt-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => setDraft({})}
          disabled={!hasDraft}
          className="-mx-2 rounded-lg px-2 py-2 text-[15px] font-semibold underline underline-offset-4 transition-opacity duration-150 disabled:no-underline disabled:opacity-40"
        >
          Tout effacer
        </button>
        <button
          type="button"
          onClick={apply}
          className="btn-primary inline-flex min-w-[11.5rem] items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold"
        >
          {previewing && (
            <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
          )}
          <span aria-live="polite">{ctaLabel}</span>
        </button>
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------------ */

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-5 py-6 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[18px] font-semibold tracking-tight">{title}</h3>
        {action}
      </div>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** Pastille sélectionnable (quartiers, préréglages de budget). */
function Pill({
  selected,
  onClick,
  check = false,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  /** Coche visible (choix multiple). */
  check?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-medium transition-colors duration-150 " +
        (selected
          ? "border-ink bg-ink text-canvas"
          : "border-line bg-surface-2 text-ink hover:border-(--border-strong)")
      }
    >
      {check && selected && <Check size={13} weight="bold" aria-hidden />}
      {children}
    </button>
  );
}

/** Champ numérique encadré, libellé intégré (style Airbnb). */
function NumberBox({
  label,
  prefix,
  suffix,
  value,
  onChange,
  placeholder,
  maxLength = 6,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="field flex cursor-text flex-col px-3.5 pb-2 pt-2">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        {prefix && <span className="text-[14px] text-muted">{prefix}</span>}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={maxLength}
          className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:font-normal placeholder:text-muted/70"
          value={value ?? ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            onChange(digits ? Number(digits) : undefined);
          }}
          placeholder={placeholder}
        />
        {suffix && <span className="text-[14px] text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

/** Compteur − / + (pièces, par demi-pièce à la suisse). */
function Stepper({
  label,
  value,
  onChange,
  start,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  start: number;
}) {
  const dec = () => {
    if (value == null) return;
    const v = value - ROOMS.step;
    onChange(v < ROOMS.min ? undefined : v);
  };
  const inc = () =>
    onChange(value == null ? start : Math.min(ROOMS.max, value + ROOMS.step));

  const btn =
    "grid size-10 place-items-center rounded-full border border-(--border-strong) text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-(--border-strong)";

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-[15px]">{label}</span>
      <div className="flex items-center gap-3" role="group" aria-label={label}>
        <button
          type="button"
          onClick={dec}
          disabled={value == null}
          aria-label={`Diminuer ${label.toLowerCase()}`}
          className={btn}
        >
          <Minus size={14} weight="bold" />
        </button>
        <span
          aria-live="polite"
          className={
            "w-14 text-center text-[15px] tabular-nums " +
            (value == null ? "text-muted" : "font-semibold")
          }
        >
          {value ?? "Indiff."}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value != null && value >= ROOMS.max}
          aria-label={`Augmenter ${label.toLowerCase()}`}
          className={btn}
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

/** Ligne entière cliquable avec interrupteur. */
function SwitchRow({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 py-3.5 text-left"
    >
      <span className={checked ? "text-accent-fg" : "text-muted"}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 " +
          (checked ? "bg-accent" : "bg-(--border-strong)")
        }
      >
        <span
          className={
            "absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow-(--shadow-sm) transition-transform duration-200 " +
            (checked ? "translate-x-5" : "translate-x-0")
          }
        />
      </span>
    </button>
  );
}
