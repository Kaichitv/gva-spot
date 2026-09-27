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
 * Flatfox n'a pas d'API officielle documentée ; on reproduit ce que fait la
 * carte de recherche du site, en deux temps (pas de clé requise) :
 *   1. FLATFOX_PIN_API : ids ("pins") des annonces dans la bounding box
 *      (nord/sud/est/ouest), filtrables par type d'offre et catégorie ;
 *   2. FLATFOX_API : détail des annonces, demandé par lots de `pk`.
 *      ⚠️ Cet endpoint ignore la bounding box : sans `pk` il renvoie toute la
 *      Suisse, d'où l'étape 1.
 *
 * Si l'un des deux renvoie 404/403, ouvre https://flatfox.ch/fr/search/ ,
 * onglet Réseau (Network) du navigateur, et repère les requêtes XHR JSON
 * correspondantes. Le mapping des champs est tolérant grâce à pick().
 */

const FLATFOX_PIN_API = "https://flatfox.ch/api/v1/pin/";
const FLATFOX_API = "https://flatfox.ch/api/v1/public-listing/";

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
  if (url && url.startsWith("/")) url = `https://flatfox.ch${url.replace(/^\/(en|de|it)\//, "/fr/")}`;
  if (!url) url = `https://flatfox.ch/fr/flat/${ref}/`;

  // Flatfox renvoie le NPA sous forme de nombre (1200) : on le normalise en chaîne.
  const rawZip = pick(raw, ["zipcode", "zip", "postal_code"]);
  const zip =
    (rawZip != null ? String(rawZip) : null) ||
    extractZip(pick<string>(raw, ["public_address", "street", "address"]));

  const rentGross = toNumber(pick(raw, ["price_display", "rent_gross", "gross_rent"]));
  const rentNet = toNumber(pick(raw, ["rent_net", "net_rent"]));
  const charges = toNumber(pick(raw, ["rent_charges", "charges", "additional_costs"]));

  const cover =
    pick<any>(raw, ["cover_image", "coverImage"]) ??
    (Array.isArray(raw?.images) ? raw.images[0] : undefined);
  // Vignette affichée en lien direct depuis Flatfox (jamais réhébergée).
  let imageUrl =
    (typeof cover === "string"
      ? cover
      : pick<string>(cover, ["url_thumb_m", "url_listing_search", "url", "src"])) ??
    null;
  if (imageUrl && imageUrl.startsWith("/")) imageUrl = `https://flatfox.ch${imageUrl}`;

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

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: HEADERS,
    // On ne veut jamais de cache Next côté fetch serveur ici.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Flatfox HTTP ${res.status} (${url.split("?")[0]}). Si c'est 404/403, vérifie les endpoints en tête de src/lib/sources/flatfox.ts.`
    );
  }
  return res.json();
}

/** Étape 1 : ids des appartements à louer dans la bounding box. */
async function fetchPins(box: BoundingBox): Promise<number[]> {
  const params = new URLSearchParams({
    offer_type: "RENT",
    object_category: "APARTMENT",
    north: String(box.north),
    south: String(box.south),
    east: String(box.east),
    west: String(box.west),
    max_count: "1000", // plafond imposé par l'API
  });
  const json = await getJson(`${FLATFOX_PIN_API}?${params.toString()}`);
  const rows: any[] = Array.isArray(json) ? json : json.results ?? [];
  return rows.map((r) => Number(r?.pk)).filter((pk) => Number.isFinite(pk));
}

/** Étape 2 : détail d'un lot d'annonces. */
async function fetchDetails(pks: number[]): Promise<any[]> {
  const params = new URLSearchParams({
    limit: String(pks.length),
    expand: "cover_image",
  });
  for (const pk of pks) params.append("pk", String(pk));
  const json = await getJson(`${FLATFOX_API}?${params.toString()}`);
  // L'API peut renvoyer {results: [...]} ou directement un tableau.
  return Array.isArray(json) ? json : json.results ?? json.data ?? [];
}

export const flatfox: SourceAdapter = {
  id: "flatfox",
  label: "Flatfox",
  enabled: (process.env.SOURCE_FLATFOX ?? "true") !== "false",
  async fetch(box: BoundingBox): Promise<Listing[]> {
    const pks = await fetchPins(box);
    if (!pks.length) {
      // Jamais 0 à Genève en temps normal : rendre la cause visible dans le rapport.
      throw new Error(
        `Flatfox : 0 annonce dans la zone N${box.north} S${box.south} E${box.east} W${box.west} (zone erronée ou IP serveur filtrée ?)`
      );
    }
    const batch = 100;
    const all: Listing[] = [];
    for (let i = 0; i < pks.length; i += batch) {
      if (i > 0) {
        // Politesse : petite pause entre lots.
        await new Promise((r) => setTimeout(r, 400));
      }
      const rows = await fetchDetails(pks.slice(i, i + batch));
      for (const r of rows) {
        const l = mapFlat(r);
        if (l) all.push(l);
      }
    }
    return all;
  },
};

export { effectiveRent };
