import type { BoundingBox, Listing, SourceAdapter } from "../types";
import {
  effectiveRent,
  excerpt,
  extractZip,
  neighborhoodFromZip,
  toNumber,
} from "../normalize";

/**
 * Adaptateur Flatfox — la source la plus "propre" techniquement.
 *
 * Flatfox n'a pas d'API officielle documentée, mais la carte de recherche du
 * site interroge son propre endpoint public par bounding box géographique
 * (nord/sud/est/ouest). C'est ce qu'on utilise ici. Pas de clé requise.
 *
 * ⚠️ À VÉRIFIER EN 10 s LA PREMIÈRE FOIS :
 *   Ouvre https://flatfox.ch/fr/search/ , fais une recherche sur Genève,
 *   ouvre l'onglet Réseau (Network) du navigateur et repère la requête XHR
 *   qui renvoie du JSON de logements. Copie son chemin exact dans FLATFOX_API
 *   ci-dessous si celui par défaut renvoie 404. Le reste du code (mapping des
 *   champs) est robuste aux variations de nom grâce à pick().
 */

// Chemin de l'API publique. Ajuste-le si besoin (voir note ci-dessus).
const FLATFOX_API = "https://flatfox.ch/api/v1/flat/";

// En-têtes façon navigateur : Flatfox filtre les requêtes trop "robotisées".
const HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Referer: "https://flatfox.ch/fr/search/",
};

/** Récupère une valeur en essayant plusieurs noms de champ possibles. */
function pick<T = unknown>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k] as T;
  }
  return undefined;
}

function mapFlat(raw: any): Listing | null {
  const ref = String(pick(raw, ["id", "pk", "public_id"]) ?? "");
  if (!ref) return null;

  // Flatfox expose souvent une "url" relative ; on la préfixe si besoin.
  let url = String(pick(raw, ["url", "public_url"]) ?? "");
  if (url && url.startsWith("/")) url = `https://flatfox.ch${url}`;
  if (!url) url = `https://flatfox.ch/fr/flat/${ref}/`;

  const zip =
    (pick<string>(raw, ["zipcode", "zip", "postal_code"]) ?? null) ||
    extractZip(pick<string>(raw, ["public_address", "street", "address"]));

  const rentGross = toNumber(pick(raw, ["price_display", "rent_gross", "gross_rent"]));
  const rentNet = toNumber(pick(raw, ["rent_net", "net_rent"]));
  const charges = toNumber(pick(raw, ["rent_charges", "charges", "additional_costs"]));

  const cover =
    pick<any>(raw, ["cover_image", "coverImage"]) ??
    (Array.isArray(raw?.images) ? raw.images[0] : undefined);
  const imageUrl =
    (typeof cover === "string" ? cover : pick<string>(cover, ["url", "src"])) ??
    null;

  const title =
    pick<string>(raw, ["title", "public_title", "name"]) ??
    `Appartement ${pick(raw, ["number_of_rooms"]) ?? ""} pièces`;

  return {
    id: `flatfox:${ref}`,
    source: "flatfox",
    sourceRef: ref,
    sourceUrl: url,
    title: String(title).trim(),
    excerpt: excerpt(pick<string>(raw, ["description", "short_description"])),
    rooms: toNumber(pick(raw, ["number_of_rooms", "rooms"])),
    livingSpace: toNumber(pick(raw, ["living_space", "surface_living", "space"])),
    rentGross,
    rentNet,
    charges,
    floor: toNumber(pick(raw, ["floor"])),
    furnished: (pick<boolean>(raw, ["is_furnished", "furnished"]) ?? null) as
      | boolean
      | null,
    address: pick<string>(raw, ["public_address", "street", "address"]) ?? null,
    zip: zip ?? null,
    city: pick<string>(raw, ["city"]) ?? null,
    neighborhood: neighborhoodFromZip(zip),
    lat: toNumber(pick(raw, ["latitude", "lat"])),
    lng: toNumber(pick(raw, ["longitude", "lng"])),
    agency: pick<string>(raw?.agency, ["name"]) ?? pick<string>(raw, ["agency_name"]) ?? null,
    imageUrl,
    availableFrom:
      pick<string>(raw, ["movein_date", "moving_date", "available_from"]) ?? null,
    publishedAt: pick<string>(raw, ["published", "published_at", "created"]) ?? null,
  };
}

async function fetchPage(box: BoundingBox, offset: number, limit: number): Promise<any[]> {
  const params = new URLSearchParams({
    offer_type: "RENT",
    object_category: "APARTMENT",
    north: String(box.north),
    south: String(box.south),
    east: String(box.east),
    west: String(box.west),
    ordering: "-published",
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${FLATFOX_API}?${params.toString()}`, {
    headers: HEADERS,
    // On ne veut jamais de cache Next côté fetch serveur ici.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Flatfox HTTP ${res.status}. Si c'est 404/403, vérifie FLATFOX_API dans src/lib/sources/flatfox.ts (voir note en tête de fichier).`
    );
  }
  const json = await res.json();
  // L'API peut renvoyer {results: [...]} ou directement un tableau.
  return Array.isArray(json) ? json : json.results ?? json.data ?? [];
}

export const flatfox: SourceAdapter = {
  id: "flatfox",
  label: "Flatfox",
  enabled: (process.env.SOURCE_FLATFOX ?? "true") !== "false",
  async fetch(box: BoundingBox): Promise<Listing[]> {
    const limit = 50;
    const maxPages = 6; // garde-fou (l'API plafonne ~1000 résultats/bbox)
    const all: Listing[] = [];
    for (let page = 0; page < maxPages; page++) {
      const rows = await fetchPage(box, page * limit, limit);
      if (!rows.length) break;
      for (const r of rows) {
        const l = mapFlat(r);
        if (l) all.push(l);
      }
      if (rows.length < limit) break;
      // Politesse : petite pause entre pages.
      await new Promise((r) => setTimeout(r, 400));
    }
    return all;
  },
};

export { effectiveRent };
