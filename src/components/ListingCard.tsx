"use client";

import type { DedupedListing } from "@/lib/dedupe";
import { House, MapPin, ArrowUpRight, Sparkle } from "@phosphor-icons/react";

const SOURCE_LABEL: Record<string, string> = {
  flatfox: "Flatfox",
  appt: "APPT",
  immobilier: "immobilier.ch",
  homegate: "Homegate",
  immoscout: "ImmoScout24",
  anibis: "Anibis",
};

function rentText(l: DedupedListing): string {
  const r = l.rentGross ?? l.rentNet;
  if (r == null) return "Loyer n.c.";
  const suffix = l.rentGross ? " CC" : " net";
  return `CHF ${r.toLocaleString("fr-CH")}${suffix}`;
}

export default function ListingCard({ l }: { l: DedupedListing }) {
  const facts: string[] = [];
  if (l.rooms != null) facts.push(`${l.rooms} p.`);
  if (l.livingSpace != null) facts.push(`${l.livingSpace} m²`);

  const location =
    [l.neighborhood, l.address].filter(Boolean).join(" · ") ||
    l.city ||
    "Genève";

  return (
    <a
      href={l.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-hover group grid grid-cols-[104px_1fr] gap-3 overflow-hidden sm:grid-cols-[120px_1fr]"
    >
      {/* Vignette (image distante de la source, non réhébergée) */}
      <div className="relative min-h-[104px] bg-surface-2">
        {l.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <House size={30} weight="light" />
          </div>
        )}
        {l.isNew && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink shadow-[var(--shadow-sm)]">
            <Sparkle size={10} weight="fill" />
            Nouveau
          </span>
        )}
      </div>

      {/* Corps */}
      <div className="min-w-0 py-3 pr-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug">
            {l.title}
          </p>
          <ArrowUpRight
            size={16}
            weight="bold"
            className="mt-0.5 shrink-0 text-muted transition-colors duration-150 group-hover:text-ink"
          />
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px]">
          <span className="font-bold text-accent-fg">{rentText(l)}</span>
          {facts.map((f) => (
            <span key={f} className="text-muted">
              · {f}
            </span>
          ))}
        </div>

        <div className="mt-1 flex items-center gap-1 truncate text-[12px] text-muted">
          <MapPin size={12} weight="fill" className="shrink-0" />
          <span className="truncate">{location}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="chip rounded-full px-2 py-0.5 text-[11px] font-medium text-ink">
            {SOURCE_LABEL[l.source] ?? l.source}
          </span>
          {l.agency && (
            <span className="chip rounded-full px-2 py-0.5 text-[11px] font-medium text-muted">
              {l.agency}
            </span>
          )}
          {l.alsoOn?.map((a) => (
            <span
              key={a.url}
              className="chip rounded-full px-2 py-0.5 text-[11px] font-medium text-muted"
            >
              + {SOURCE_LABEL[a.source] ?? a.source}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}
