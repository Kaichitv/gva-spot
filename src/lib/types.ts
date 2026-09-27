// Modèle de données commun à toutes les sources.
// Principe (usage perso, profil de risque bas) : on stocke le strict nécessaire
// pour filtrer et RE-DIRIGER vers l'annonce d'origine. On ne réhéberge ni les
// photos ni les coordonnées personnelles des annonceurs : `sourceUrl` est le
// point de contact.

export type SourceId =
  | "flatfox"
  | "appt"
  | "homegate"
  | "immoscout"
  | "anibis";

export interface Listing {
  /** Identifiant stable = `${source}:${sourceRef}` */
  id: string;
  source: SourceId;
  /** Référence propre à la source (id d'annonce). */
  sourceRef: string;
  /** URL de l'annonce d'origine — LE point de contact. */
  sourceUrl: string;

  title: string;
  /** Description courte (on tronque pour ne pas dupliquer le texte intégral). */
  excerpt?: string;

  rooms?: number | null; // nombre de pièces (ex. 3.5)
  livingSpace?: number | null; // m²
  rentGross?: number | null; // loyer charges comprises (CHF/mois) si connu
  rentNet?: number | null; // loyer net (CHF/mois)
  charges?: number | null; // charges (CHF/mois)
  floor?: number | null;

  furnished?: boolean | null;

  address?: string | null; // adresse publique telle que fournie
  zip?: string | null; // NPA
  city?: string | null;
  /** Quartier normalisé quand on peut le déduire (voir neighborhoods.ts). */
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;

  /** Régie / agence quand elle est publique (nom seulement, pas de contact perso). */
  agency?: string | null;

  /** Vignette (URL distante de la source, jamais réhébergée). */
  imageUrl?: string | null;

  availableFrom?: string | null; // ISO date ou "immédiatement"
  publishedAt?: string | null; // ISO date

  /** Rempli par le cache : première fois qu'on a vu cette annonce. */
  firstSeenAt?: string;
  /** Rempli au moment de la réponse : annonce jamais vue avant ce run. */
  isNew?: boolean;
}

export interface SearchCriteria {
  minRooms?: number;
  maxRooms?: number;
  minSurface?: number;
  maxRent?: number; // sur le loyer charges comprises quand dispo, sinon net
  minRent?: number;
  furnished?: boolean;
  /** Quartiers / communes recherchés (matching souple, insensible à la casse). */
  neighborhoods?: string[];
  /** NPA autorisés (ex. ["1201","1205"]). */
  zips?: string[];
  /** Recherche plein texte sur titre + adresse + extrait. */
  query?: string;
  /** N'afficher que les annonces jamais vues auparavant. */
  onlyNew?: boolean;
}

/** Zone géographique (bounding box) — utilisée par les sources géo (Flatfox). */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Contrat que chaque adaptateur de source implémente. */
export interface SourceAdapter {
  id: SourceId;
  label: string;
  /** true si activée via les variables d'environnement. */
  enabled: boolean;
  /**
   * Récupère les annonces brutes déjà normalisées au format `Listing`.
   * Ne filtre PAS selon les critères (le filtrage est centralisé) : renvoie
   * tout ce que la source expose pour la zone, l'agrégateur s'occupe du reste.
   */
  fetch(box: BoundingBox): Promise<Listing[]>;
}

export interface FetchReport {
  source: SourceId;
  ok: boolean;
  count: number;
  error?: string;
  ms: number;
}
