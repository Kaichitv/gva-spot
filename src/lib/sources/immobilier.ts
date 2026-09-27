import * as cheerio from "cheerio";
import type { BoundingBox, Listing, SourceAdapter } from "../types";
import { kvGet, kvSet } from "../kv";
import { extractZip, neighborhoodFromZip } from "../normalize";

/**
 * Adaptateur immobilier.ch — portail des régies romandes, très fourni à Genève.
 *
 * Pas d'API : on lit les pages de résultats HTML (rendues côté serveur), que le
 * robots.txt du site autorise (seules les pages /carte/ sont exclues). Chaque
 * carte `div.filter-item[data-id]` porte l'id, les coordonnées (data-latlng),
 * le prix, le type, l'adresse, la surface et les pièces.
 *
 * Particularité : la plupart des adresses n'indiquent pas le NPA (« Genève,
 * Av. du Bouchet 8 »). On le retrouve à partir des coordonnées via l'API
 * publique de swisstopo (géocodage inverse), avec un cache disque pour ne
 * jamais redemander deux fois les mêmes coordonnées.
 *
 * Plafond du site : une recherche ne sert que ~29 pages (≈ 700 annonces),
 * les suivantes répondent 202 à vide. Le canton en compte davantage : on
 * combine donc la recherche cantonale (jusqu'au plafond) et celle de la ville
 * de Genève (qui tient sous le plafond). Couverture ≈ 93 % ; seules manquent
 * quelques annonces des autres communes. Les filtres/tri du site sont gardés
 * en session côté serveur, d'où ce découpage par URL plutôt que par prix.
 *
 * ⚠️ Si la récupération renvoie 0 annonce, ouvre une URL de SEARCHES dans le
 * navigateur, inspecte une carte d'annonce et ajuste les sélecteurs de
 * parseCards().
 */

const BASE = "https://www.immobilier.ch";
// Appartements à louer : canton de Genève, puis ville de Genève.
const SEARCHES = [
  `${BASE}/fr/louer/appartement/geneve`,
  `${BASE}/fr/louer/appartement/geneve/geneve`,
];
const MAX_PAGES = 40; // garde-fou par recherche
const PAGE_DELAY_MS = 1000; // politesse entre deux pages

const GEO_API =
  "https://api3.geo.admin.ch/rest/services/api/MapServer/identify";
const GEO_CONCURRENCY = 4;
const GEO_CACHE_KEY = "geo-zip";

const HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "fr-CH,fr;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "2'500.-" / "2’500" -> 2500 */
function parseChf(s?: string | null): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/**
 * Prix affiché : « CHF 2'500.-/mois (+150.- charges) » ou « CHF 7'200.-/mois ».
 * Sans mention de charges, on ne sait pas si c'est charges comprises : on le
 * range en net (prudent, n'affiche pas « CC » à tort).
 */
function parsePrice(text: string) {
  const main = parseChf(text.match(/CHF\s*([\d'’\s]+)/)?.[1]);
  const charges = parseChf(text.match(/\+\s*([\d'’\s]+)[.\-–\s]*charges/i)?.[1]);
  return {
    rentNet: main,
    charges,
    rentGross: main != null && charges != null ? main + charges : null,
  };
}

/**
 * Adresse de carte : « Genève, Av. du Bouchet 8 » ou « 1201 Genève, Rue X 3 ».
 * On la reformate comme Flatfox (« Rue X 3, 1201 Genève ») pour que le
 * dédoublonnage multi-portails puisse rapprocher les deux.
 */
function splitAddress(raw: string) {
  const [locality, ...rest] = raw.split(",").map((s) => s.trim());
  const zip = extractZip(locality);
  const city = locality.replace(/^\d{4}\s*/, "").trim() || null;
  const joined = rest.join(", ").trim();
  // « Contactez l'agence pour l'adresse » : pas une rue, on l'écarte.
  const street = joined && !/contacte[rz]/i.test(joined) ? joined : null;
  return { zip, city, street };
}

function formatAddress(street: string | null, zip: string | null, city: string | null) {
  const place = [zip, city].filter(Boolean).join(" ");
  return [street, place].filter(Boolean).join(", ") || null;
}

type Card = Listing & { _street: string | null };

function parseCards(html: string): Card[] {
  const $ = cheerio.load(html);

  // Titres "annonceur" fournis par le JSON-LD (plus parlants que le type).
  const names = new Map<string, string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      if (json?.["@type"] !== "ItemList") return;
      for (const it of json.itemListElement ?? []) {
        if (it?.url && it?.name?.trim()) names.set(String(it.url), it.name.trim());
      }
    } catch {}
  });

  const cards: Card[] = [];
  $("div.filter-item[data-id]").each((_, el) => {
    const card = $(el);
    const ref = card.attr("data-id");
    const href = card.find("a[href*='/louer/']").first().attr("href");
    if (!ref || !href) return;
    const url = href.startsWith("http") ? href : `${BASE}${href}`;

    const [lat, lng] = (card.attr("data-latlng") ?? "")
      .split(",")
      .map((v) => Number(v));

    const content = card.find(".filter-item-content");
    const type = content.find(".object-type").first().text().trim();
    const { zip, city, street } = splitAddress(
      content.find("p").not(".object-type").first().text()
    );

    const space = card.find(".space").first().text();
    const roomsTitle = card.find(".icon-plan").first().attr("title") ?? type;
    const rooms = Number(roomsTitle.match(/(\d+(?:[.,]\d)?)/)?.[1]?.replace(",", "."));

    const thumb = card.find("img[data-src]").first().attr("data-src");

    cards.push({
      id: `immobilier:${ref}`,
      source: "immobilier",
      sourceRef: ref,
      sourceUrl: url,
      title: names.get(url) || type || "Annonce immobilier.ch",
      excerpt: type || undefined,
      rooms: Number.isFinite(rooms) ? rooms : null,
      livingSpace: parseChf(space.match(/([\d'’]+)\s*m/)?.[1]),
      ...parsePrice(content.find(".title").first().text()),
      address: formatAddress(street, zip, city),
      zip,
      city,
      neighborhood: neighborhoodFromZip(zip),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      agency: card.find(".logo-box img").first().attr("alt")?.trim() || null,
      // Vignette en lien direct depuis immobilier.ch (jamais réhébergée).
      imageUrl: thumb ? (thumb.startsWith("http") ? thumb : `${BASE}${thumb}`) : null,
      availableFrom: null,
      publishedAt: null,
      _street: street,
    });
  });
  return cards;
}

/**
 * Paramètres de recherche de la page 1 (dont `sd`, la graine du tri « Offres
 * TOP »). Sans eux, chaque page est remélangée : doublons et annonces ratées.
 * On les réutilise donc pour toutes les pages, comme le fait le site.
 */
function searchQuery(html: string): string {
  const href = cheerio.load(html)("a#list-link").attr("href") ?? "";
  return href.split("?")[1] ?? "";
}

/** Numéro de la dernière page d'après les liens de pagination. */
function lastPage(html: string): number {
  const nums = [...html.matchAll(/\/page-(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 1;
}

async function fetchPage(search: string, page: number, query = ""): Promise<string> {
  const url = `${search}/page-${page}${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`immobilier.ch HTTP ${res.status} (page ${page})`);
  return res.text();
}

// --- NPA par coordonnées (swisstopo) ---------------------------------------

const geoKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

function readGeoCache(): Promise<Record<string, string | null>> {
  return kvGet<Record<string, string | null>>(GEO_CACHE_KEY, {}).catch(() => ({}));
}

async function zipFromCoords(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({
    geometryType: "esriGeometryPoint",
    geometry: `${lng},${lat}`,
    sr: "4326",
    layers: "all:ch.swisstopo-vd.ortschaftenverzeichnis_plz",
    tolerance: "0",
    returnGeometry: "false",
  });
  const res = await fetch(`${GEO_API}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`swisstopo HTTP ${res.status}`);
  const json = await res.json();
  const hit = json?.results?.[0];
  // "attributes" (format par défaut) ou "properties" (geometryFormat=geojson).
  const plz = (hit?.attributes ?? hit?.properties)?.plz;
  return plz != null ? String(plz) : null;
}

/** Complète NPA/quartier/adresse des cartes sans NPA. Tolérant aux pannes. */
async function fillMissingZips(cards: Card[]): Promise<void> {
  const cache = await readGeoCache();
  const todo = cards.filter((c) => !c.zip && c.lat != null && c.lng != null);
  const missing = [
    ...new Set(todo.map((c) => geoKey(c.lat!, c.lng!)).filter((k) => !(k in cache))),
  ];

  let changed = false;
  for (let i = 0; i < missing.length; i += GEO_CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + GEO_CONCURRENCY).map(async (k) => {
        const [lat, lng] = k.split(",").map(Number);
        try {
          cache[k] = await zipFromCoords(lat, lng);
          changed = true;
        } catch {
          // Panne ponctuelle : on retentera au prochain rafraîchissement.
        }
      })
    );
  }

  if (changed) {
    // Cache facultatif : une panne de stockage ne doit pas faire échouer la source.
    await kvSet(GEO_CACHE_KEY, cache).catch(() => {});
  }

  for (const c of todo) {
    const zip = cache[geoKey(c.lat!, c.lng!)];
    if (!zip) continue;
    c.zip = zip;
    c.neighborhood = neighborhoodFromZip(zip);
    c.address = formatAddress(c._street, zip, c.city ?? null);
  }
}

export const immobilier: SourceAdapter = {
  id: "immobilier",
  label: "immobilier.ch",
  enabled: (process.env.SOURCE_IMMOBILIER ?? "true") !== "false",
  // La recherche couvre tout le canton : la bounding box ne sert pas au
  // filtrage réseau, le filtrage géographique se fait ensuite via NPA/quartier.
  async fetch(_box: BoundingBox): Promise<Listing[]> {
    const byId = new Map<string, Card>();
    for (const [n, search] of SEARCHES.entries()) {
      if (n > 0) await sleep(PAGE_DELAY_MS);
      const first = await fetchPage(search, 1);
      const pages = Math.min(lastPage(first), MAX_PAGES);
      const query = searchQuery(first);
      for (const c of parseCards(first)) byId.set(c.id, c);
      for (let p = 2; p <= pages; p++) {
        await sleep(PAGE_DELAY_MS);
        // Au-delà du plafond, le site répond 202 à vide : 0 carte = fin.
        const cards = parseCards(await fetchPage(search, p, query));
        if (!cards.length) break;
        // Les annonces "mises en avant" et les deux recherches se recoupent.
        for (const c of cards) byId.set(c.id, c);
      }
    }

    const cards = [...byId.values()];
    await fillMissingZips(cards);
    return cards.map(({ _street, ...l }) => l);
  },
};
