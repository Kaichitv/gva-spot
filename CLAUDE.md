# CLAUDE.md — GVA Spot

Contexte projet pour Claude Code. À lire avant toute modification.

## En un mot

**GVA Spot** : agrégateur **personnel** d'annonces de location à Genève.
App Next.js installable en PWA. C'est un **comparateur qui redirige vers la
source** : il rassemble, dédoublonne et filtre des annonces de plusieurs
portails, mais le contact se fait toujours sur l'annonce d'origine.

## Principes non négociables (guardrails)

1. **On redirige, on ne republie pas.** Ne jamais réhéberger ni stocker les
   photos, descriptions intégrales ou coordonnées personnelles des annonceurs.
   `sourceUrl` EST le point de contact. C'est la ligne qui sépare un comparateur
   (légitime) d'une republication parasitaire.
2. **Usage strictement perso, non commercial.** Ne pas ajouter de collecte de
   contacts, de compte utilisateur multi-tenant, ni de rediffusion publique.
3. **Respect des CGU / LPD.** Les sources du groupe SMG (Homegate, ImmoScout24,
   Anibis) restent **désactivées par défaut** ; Anibis interdit explicitement la
   duplication. Pas de base de données de contacts personnels.
4. **Politesse technique.** Requêtes espacées, `User-Agent` honnête, cache 15 min.
   Ne pas augmenter les fréquences d'appel sans raison.
5. **Ne pas casser le socle logique.** `src/lib/{types,normalize,dedupe,filter,
   cache}.ts` et `src/lib/sources/**` sont éprouvés. Les modifier seulement si la
   tâche le demande explicitement ; sinon, ne toucher qu'à la présentation.

## Stack

- **Next.js 15** (App Router, TypeScript, RSC + client components)
- **Tailwind CSS v4** — config CSS-first via `@theme` dans `globals.css`
  (⚠️ pas de `tailwind.config.js`). PostCSS : `@tailwindcss/postcss`.
- **Phosphor** (`@phosphor-icons/react`) pour les icônes.
- Cache disque JSON (`data/`), pas de base de données.
- **Node 20+**.

## Commandes

```bash
npm run dev       # http://localhost:3000
npm run build     # build prod (à lancer pour valider une modif)
npm start         # serveur prod
npm run refresh   # CLI : ré-interroge les sources, met à jour data/seen + snapshot
```

Après toute modif significative : `npm run build` doit passer (typecheck inclus).

## Architecture

```
src/
  app/
    layout.tsx              métadonnées, PWA, fond de page, enregistrement du SW
    page.tsx                UI principale (client) : état + fetch + localStorage
    globals.css             Tailwind v4 + tokens du design system + @layer
    api/listings/route.ts   agrège → dédoublonne → filtre → JSON (cache TTL 15 min)
  components/
    Filters.tsx             panneau de critères (client)
    ListingCard.tsx         carte d'annonce (client)
    RegisterSW.tsx          enregistre le service worker
  lib/
    types.ts                modèle Listing + contrat SourceAdapter + SearchCriteria
    normalize.ts            NPA→quartier, parsing nombres, extraits, loyer effectif
    dedupe.ts               regroupement des doublons multi-portails
    filter.ts               application des critères + tri + parsing query params
    cache.ts                registre "annonces vues" (badge Nouveau) + snapshot
    sources/
      index.ts              registre ALL_SOURCES + fetch parallèle tolérant aux pannes
      flatfox.ts            ✅ API géo publique (bounding box) — actif
      appt.ts               ✅ parsing HTML des régies GE — actif
      apify.ts              passerelle Apify générique + mapping commun
      homegate.ts / immoscout.ts / anibis.ts   ⚙️ via Apify — désactivés par défaut
scripts/refresh.ts          CLI de rafraîchissement du cache
public/                     manifest.webmanifest, sw.js, icônes
data/                       cache local (git-ignoré)
```

**Flux de données** : `page.tsx` → `GET /api/listings?<critères>` → `fetchAll()`
(sources activées, en parallèle) → `markNewAndPersist` (cache) → `dedupe` →
`applyFilters` + `sortListings` → JSON → rendu des `ListingCard`.

Ajouter une source = créer un `SourceAdapter` dans `src/lib/sources/` et
l'ajouter à `ALL_SOURCES` dans `index.ts`. Le filtrage est centralisé : un
adaptateur renvoie tout ce que la source expose, sans filtrer.

## Sources & configuration

Tout se règle dans `.env` (voir `.env.example`) : `SOURCE_*` (on/off),
`APIFY_TOKEN` + `APIFY_ACTOR_*`, bounding box `GE_*`.

**⚠️ API Flatfox** : Flatfox n'a pas d'API officielle documentée ; on utilise
l'endpoint que la carte du site interroge. Si 404/403, ajuster la constante
`FLATFOX_API` en tête de `src/lib/sources/flatfox.ts` (repérer la requête XHR
JSON via l'onglet Réseau du navigateur). Le mapping des champs est tolérant.
Idem pour les sélecteurs en tête de `src/lib/sources/appt.ts`.

## Design system

Direction : **minimaliste, sombre, une seule couleur d'accent (rose)**.
Hiérarchie par l'espace et l'**élévation via ombres propres** + surfaces
superposées. **Pas de glassmorphisme** (pas de `backdrop-blur`, pas de fonds
colorés vibrants). Le reste de la palette reste en niveaux de gris neutres.

- Tokens définis dans `globals.css` (`:root` + `@media (prefers-color-scheme)`),
  couleurs de marque exposées via `@theme`.
- Accent rose utilisé **avec parcimonie** : bouton primaire, toggles actifs,
  focus ring, indicateur « Nouveau », éventuellement les chiffres clés.
- Accessibilité : contraste AA, `prefers-reduced-motion` respecté.
- Coins arrondis cohérents, transitions courtes et discrètes.

## Conventions de code

- Composants d'UI interactifs : `"use client"` en tête, sous `src/components/`.
- Français pour l'UI et les commentaires ; noms de code en anglais.
- Pas de secrets commités ; `.env` reste local (git-ignoré).
- Préférer les tokens CSS (`var(--...)`) et les utilitaires Tailwind aux valeurs
  en dur pour les couleurs/ombres/rayons.

## Idées d'évolution (backlog)

- Notifications push des nouvelles annonces (le cache `seen` + `refresh` sont
  déjà là pour ça).
- Carte des résultats (les annonces portent `lat`/`lng`).
- Sauvegarde de plusieurs recherches nommées.