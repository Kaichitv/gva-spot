import type { SearchCriteria } from "@/lib/types";
import { chf } from "@/lib/criteria-ui";
import { ArrowSquareOut, Warning } from "@phosphor-icons/react";

/**
 * Bloc « Continuer la recherche ailleurs », affiché sous la liste : raccourcis
 * vers des sources qu'on n'agrège pas (on redirige, on ne récupère rien).
 * - Facebook Marketplace : recherche Genève pré-remplie avec les critères
 *   transposables (budget, chambres). Aucune donnée n'est collectée.
 * - Logement subventionné et coopératives : fonctionnent par inscription.
 */

// Recherche « Locations » de Marketplace à Genève. Si le lien n'ouvre pas la
// bonne ville, remplacer "geneva" par l'identifiant visible dans l'URL de
// Marketplace une fois la ville choisie dans l'app.
const MARKETPLACE_URL = "https://www.facebook.com/marketplace/geneva/propertyrentals";

const RESOURCES = [
  {
    label: "Logement subventionné",
    detail: "SFIDP · fondations immobilières de droit public",
    href: "https://www.fidp.ch/",
  },
  {
    label: "Logements de la Ville",
    detail: "GIM · demande de logement social",
    href: "https://www.geneve.ch/demarches/faire-demande-logement-social",
  },
  {
    label: "Coopérative CODHA",
    detail: "Inscription comme membre",
    href: "https://www.codha.ch/",
  },
  {
    label: "Coopérative Équilibre",
    detail: "Inscription comme membre",
    href: "https://www.cooperative-equilibre.ch/",
  },
];

/**
 * Pièces (compte suisse, séjour inclus) → chambres (compte Marketplace) :
 * 3.5 p. ≈ 2 chambres. Un studio (≤ 1.5 p.) ne donne aucun minimum.
 */
function roomsToBedrooms(rooms?: number): number | undefined {
  if (rooms == null) return undefined;
  const bedrooms = Math.floor(rooms) - 1;
  return bedrooms >= 1 ? bedrooms : undefined;
}

function marketplaceLink(c: SearchCriteria): { href: string; summary: string } {
  const minBedrooms = roomsToBedrooms(c.minRooms);
  const maxBedrooms = roomsToBedrooms(c.maxRooms);

  const p = new URLSearchParams();
  if (c.minRent != null) p.set("minPrice", String(c.minRent));
  if (c.maxRent != null) p.set("maxPrice", String(c.maxRent));
  if (minBedrooms != null) p.set("minBedrooms", String(minBedrooms));
  if (maxBedrooms != null) p.set("maxBedrooms", String(maxBedrooms));
  p.set("exact", "false");

  const budget =
    c.minRent != null && c.maxRent != null
      ? `${chf(c.minRent)}–${chf(c.maxRent)} CHF`
      : c.maxRent != null
        ? `max ${chf(c.maxRent)} CHF`
        : c.minRent != null
          ? `dès ${chf(c.minRent)} CHF`
          : null;
  const bedrooms =
    minBedrooms != null
      ? `${minBedrooms} chambre${minBedrooms > 1 ? "s" : ""} et +`
      : null;

  return {
    href: `${MARKETPLACE_URL}?${p.toString()}`,
    summary: ["Genève", budget, bedrooms].filter(Boolean).join(" · "),
  };
}

export default function ElsewhereLinks({ criteria }: { criteria: SearchCriteria }) {
  const mp = marketplaceLink(criteria);

  return (
    <section aria-labelledby="elsewhere-title" className="mt-6">
      <h2
        id="elsewhere-title"
        className="mb-2 px-1 text-[13px] font-semibold text-muted"
      >
        Continuer la recherche ailleurs
      </h2>

      <div className="card overflow-hidden">
        {/* Marketplace : critères repris + mise en garde (annonces de particuliers) */}
        <ExternalRow
          href={mp.href}
          label="Facebook Marketplace"
          detail={mp.summary}
        >
          <span className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-muted">
            <Warning size={14} weight="bold" className="mt-px shrink-0" aria-hidden />
            Particuliers : ne verse jamais d&apos;acompte avant d&apos;avoir visité.
          </span>
        </ExternalRow>

        <div className="divide-y divide-line border-t border-line">
          {RESOURCES.map((r) => (
            <ExternalRow key={r.href} href={r.href} label={r.label} detail={r.detail} compact />
          ))}
        </div>
      </div>
    </section>
  );
}

function ExternalRow({
  href,
  label,
  detail,
  compact = false,
  children,
}: {
  href: string;
  label: string;
  detail: string;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "flex items-center gap-3 px-4 transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 " +
        (compact ? "py-2.5" : "py-3.5")
      }
    >
      <span className="min-w-0 flex-1">
        <span className={"block font-semibold " + (compact ? "text-[14px]" : "text-[15px]")}>
          {label}
        </span>
        <span className="block truncate text-[13px] text-muted">{detail}</span>
        {children}
      </span>
      <ArrowSquareOut size={18} weight="bold" className="shrink-0 text-muted" aria-hidden />
      <span className="sr-only">(nouvel onglet)</span>
    </a>
  );
}
