import type { BoundingBox, Listing, SourceId } from "../types";
import { excerpt, extractZip, neighborhoodFromZip, toNumber } from "../normalize";

/**
 * Passerelle Apify.
 *
 * Homegate, ImmoScout24 et Anibis (tous du groupe SMG) ont un anti-bot sérieux
 * et des CGU restrictives. Pour un usage perso, le plus simple et le plus fiable
 * est de déléguer la récupération à un acteur Apify (le store en propose
 * plusieurs pour ces portails). On appelle l'acteur en mode synchrone et on
 * récupère directement les items du dataset.
 *
 * Ces sources sont DÉSACTIVÉES par défaut. Pour en activer une :
 *   1. mets SOURCE_HOMEGATE=true (etc.) dans .env
 *   2. renseigne APIFY_TOKEN
 *   3. renseigne l'ID d'acteur correspondant (APIFY_ACTOR_HOMEGATE=user~actor)
 */

const APIFY_BASE = "https://api.apify.com/v2";

interface ApifyOpts {
  actorId: string;
  input: Record<string, unknown>;
  token: string;
}

async function runActorSync(opts: ApifyOpts): Promise<any[]> {
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(
    opts.actorId
  )}/run-sync-get-dataset-items?token=${opts.token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.input),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

function pick<T = unknown>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) if (obj && obj[k] != null) return obj[k] as T;
  return undefined;
}

/** Mapping générique d'un item Apify (portails immobiliers suisses) -> Listing. */
export function mapApifyItem(source: SourceId, raw: any): Listing | null {
  const url = String(
    pick(raw, ["url", "listingUrl", "link", "detailUrl"]) ?? ""
  );
  if (!url) return null;
  const ref =
    String(pick(raw, ["id", "reference", "listingId"]) ?? "") ||
    url.match(/(\d{4,})/)?.[1] ||
    url;

  const address = pick<string>(raw, ["publicAddress", "address", "street", "location"]) ?? null;
  const zip = pick<string>(raw, ["zipcode", "zip", "postalCode"]) ?? extractZip(address);

  return {
    id: `${source}:${ref}`,
    source,
    sourceRef: String(ref),
    sourceUrl: url,
    title: String(pick(raw, ["title", "name"]) ?? "Annonce").trim(),
    excerpt: excerpt(pick<string>(raw, ["description", "text"])),
    rooms: toNumber(pick(raw, ["numberOfRooms", "rooms", "number_of_rooms"])),
    livingSpace: toNumber(pick(raw, ["livingSpace", "surface", "living_area", "size"])),
    rentGross: toNumber(pick(raw, ["rentGross", "grossRent", "price", "priceValue"])),
    rentNet: toNumber(pick(raw, ["rentNet", "netRent"])),
    charges: toNumber(pick(raw, ["rentCharges", "additionalCosts", "charges"])),
    floor: toNumber(pick(raw, ["floor"])),
    furnished: (pick<boolean>(raw, ["isFurnished", "furnished"]) ?? null) as boolean | null,
    address,
    zip: zip ?? null,
    city: pick<string>(raw, ["city", "locality"]) ?? null,
    neighborhood: neighborhoodFromZip(zip),
    lat: toNumber(pick(raw, ["latitude", "lat"])),
    lng: toNumber(pick(raw, ["longitude", "lng"])),
    agency: pick<string>(raw, ["agencyName", "agency", "provider"]) ?? null,
    imageUrl:
      pick<string>(raw, ["coverImage", "image", "imageUrl"]) ??
      (Array.isArray(raw?.images) ? raw.images[0]?.url ?? raw.images[0] : null),
    availableFrom: pick<string>(raw, ["movingDate", "availableFrom", "moveinDate"]) ?? null,
    publishedAt: pick<string>(raw, ["publishedAt", "published", "createdAt"]) ?? null,
  };
}

/** Construit une URL de recherche portail à partir de la bounding box. */
export function portalSearchUrl(source: SourceId, box: BoundingBox): string {
  switch (source) {
    case "homegate":
      return "https://www.homegate.ch/louer/appartement/canton-geneve/liste-annonces";
    case "immoscout":
      return "https://www.immoscout24.ch/fr/appartement/louer/lieu-geneve";
    case "anibis":
      return "https://www.anibis.ch/fr/q/immobilier-geneve-appartements-louer";
    default:
      return "";
  }
}

export interface ApifySource {
  source: SourceId;
  envActor: string; // nom de la variable d'env contenant l'ID d'acteur
}

export async function fetchViaApify(
  cfg: ApifySource,
  box: BoundingBox
): Promise<Listing[]> {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env[cfg.envActor];
  if (!token) throw new Error("APIFY_TOKEN manquant");
  if (!actorId)
    throw new Error(`${cfg.envActor} manquant (ID d'acteur Apify à renseigner)`);

  const items = await runActorSync({
    token,
    actorId,
    // Input générique compatible avec la plupart des acteurs "search URL".
    // Adapte les clés si ton acteur attend un autre schéma.
    input: {
      startUrls: [{ url: portalSearchUrl(cfg.source, box) }],
      maxResults: 120,
      proxyCountry: "CH",
      enrichDetails: true,
    },
  });

  const out: Listing[] = [];
  for (const it of items) {
    const l = mapApifyItem(cfg.source, it);
    if (l) out.push(l);
  }
  return out;
}
