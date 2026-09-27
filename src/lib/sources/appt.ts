import * as cheerio from "cheerio";
import type { BoundingBox, Listing, SourceAdapter } from "../types";
import {
  excerpt,
  extractZip,
  neighborhoodFromZip,
  toNumber,
} from "../normalize";

/**
 * Adaptateur APPT.ch — spécifique Genève.
 *
 * APPT recense les offres des régies genevoises sur une seule plateforme :
 * c'est le meilleur agrégateur "local". Pas d'API : on parse la page de
 * résultats en HTML. Le site est modeste, on reste poli (une requête, un UA
 * honnête, pas de martèlement).
 *
 * ⚠️ SÉLECTEURS À CONFIRMER : la structure DOM d'APPT peut évoluer. Les
 * sélecteurs ci-dessous sont volontairement tolérants (plusieurs candidats).
 * Si la récupération renvoie 0 annonce, ouvre https://appt.ch/ , inspecte une
 * carte d'annonce et ajuste CARD_SELECTOR / les champs ci-dessous.
 */

const APPT_URL = "https://appt.ch/";

const HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "fr-CH,fr;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
};

// Bloc d'une annonce. On essaie plusieurs conteneurs plausibles.
const CARD_SELECTORS = [
  ".property",
  ".annonce",
  ".listing",
  "article",
  ".card",
];

function firstText($: cheerio.CheerioAPI, el: any, sels: string[]): string | null {
  for (const s of sels) {
    const t = $(el).find(s).first().text().trim();
    if (t) return t;
  }
  return null;
}

export const appt: SourceAdapter = {
  id: "appt",
  label: "APPT (régies GE)",
  enabled: (process.env.SOURCE_APPT ?? "true") !== "false",
  // APPT couvre tout le canton : la bounding box ne sert pas au filtrage réseau,
  // le filtrage géographique se fait ensuite via NPA/quartier.
  async fetch(_box: BoundingBox): Promise<Listing[]> {
    const res = await fetch(APPT_URL, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) throw new Error(`APPT HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Trouve le premier sélecteur qui matche quelque chose.
    let cards = $();
    for (const sel of CARD_SELECTORS) {
      const found = $(sel);
      if (found.length >= 3) {
        cards = found;
        break;
      }
    }

    const listings: Listing[] = [];
    cards.each((i, el) => {
      const title =
        firstText($, el, ["h2", "h3", ".title", ".property-title"]) ??
        "Annonce APPT";
      const link =
        $(el).find("a[href]").first().attr("href") ?? "";
      const url = link.startsWith("http")
        ? link
        : link
        ? `https://appt.ch${link.startsWith("/") ? "" : "/"}${link}`
        : APPT_URL;

      const addressText =
        firstText($, el, [".address", ".adresse", ".location", "p"]) ?? "";
      const zip = extractZip(addressText);

      const priceText = firstText($, el, [".price", ".prix", ".loyer"]) ?? "";
      const rooms = toNumber(
        (firstText($, el, [".rooms", ".pieces"]) ?? title).match(
          /(\d(?:[.,]\d)?)\s*(?:p|pi[eè]ces?)/i
        )?.[1]
      );
      const surface = toNumber(
        (firstText($, el, [".surface", ".m2"]) ?? "").match(/(\d+)\s*m/i)?.[1]
      );

      const ref =
        url.match(/(\d{3,})/)?.[1] ?? `${i}-${title.slice(0, 12)}`;

      listings.push({
        id: `appt:${ref}`,
        source: "appt",
        sourceRef: String(ref),
        sourceUrl: url,
        title: title.trim(),
        excerpt: excerpt(addressText),
        rooms,
        livingSpace: surface,
        rentGross: toNumber(priceText),
        rentNet: null,
        charges: null,
        address: addressText || null,
        zip: zip ?? null,
        city: zip ? null : null,
        neighborhood: neighborhoodFromZip(zip),
        agency: null,
        imageUrl: $(el).find("img").first().attr("src") ?? null,
        availableFrom: null,
        publishedAt: null,
      });
    });

    return listings;
  },
};
