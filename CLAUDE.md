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
- **web-push** pour les notifications (Web Push / VAPID).
- Cache disque JSON (`data/`), pas de base de données.
- **Node 20+**.

## Commandes

```bash
npm run dev       # http://localhost:3000
npm run build     # build prod (à lancer pour valider une modif)
npm start         # serveur prod
npm run refresh   # CLI : ré-interroge les sources, met à jour data/seen + snapshot
npm run notify    # CLI : détecte les nouveautés et envoie les Web Push
npm run notify -- --test   # notif factice à tous les abonnés (validation)
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
    api/push/subscribe/route.ts   abonnements push : POST / PATCH (critères) / DELETE
    api/cron/notify/route.ts      déclencheur HTTP du notifier (CRON_SECRET)
  components/
    Filters.tsx             panneau de critères (client)
    ListingCard.tsx         carte d'annonce (client)
    PushToggle.tsx          bouton « Alertes » : permission + (dés)abonnement (client)
    RegisterSW.tsx          enregistre le service worker
  lib/
    types.ts                modèle Listing + contrat SourceAdapter + SearchCriteria
    normalize.ts            NPA→quartier, parsing nombres, extraits, loyer effectif
    dedupe.ts               regroupement des doublons multi-portails
    filter.ts               application des critères + tri + parsing query params
    cache.ts                registre "annonces vues" (badge Nouveau) + snapshot
    push-store.ts           data/subscriptions.json + ledger data/notified.json
    push-client.ts          helpers navigateur (clé VAPID, souscription, sync critères)
    notify.ts               runNotifier() : nouveautés par abonné → Web Push
    sources/
      index.ts              registre ALL_SOURCES + fetch parallèle tolérant aux pannes
      flatfox.ts            ✅ API publique (pins bbox → détails par pk) — actif
      appt.ts               ✅ parsing HTML des régies GE — actif
      immobilier.ts         ✅ HTML immobilier.ch (canton + ville) + NPA swisstopo — actif
      apify.ts              passerelle Apify générique + mapping commun
      homegate.ts / immoscout.ts / anibis.ts   ⚙️ via Apify — désactivés par défaut
scripts/refresh.ts          CLI de rafraîchissement du cache
scripts/notify.ts           CLI du notifier (même loader .env : scripts/load-env.ts)
scripts/generate-badge.mjs  régénère public/icons/badge-72.png (sharp)
scripts/generate-icons.mjs  régénère icônes PWA/iOS + favicon (sharp, voir docs/icones-app.md)
public/                     manifest.webmanifest, sw.js (cache + push), icônes
data/                       cache local (git-ignoré) ; geo-zip.json = cache NPA swisstopo
docs/                       une fiche par fonctionnalité (voir « Documentation »)
```

**Flux de données** : `page.tsx` → `GET /api/listings?<critères>` → `fetchAll()`
(sources activées, en parallèle) → `markNewAndPersist` (cache) → `dedupe` →
`applyFilters` + `sortListings` → JSON → rendu des `ListingCard`.

**Flux notifications** : `PushToggle` → `POST /api/push/subscribe` (souscription
+ critères du localStorage) ; `page.tsx` resynchronise via `PATCH` (débouncé)
quand les critères changent. `npm run notify` ou `GET /api/cron/notify` →
`runNotifier()` : snapshot < 5 min sinon `fetchAll()` (+ seen/snapshot comme
`refresh`) → `dedupe` → par abonnement `applyFilters` (sans `onlyNew`) → ids ∉
`data/notified.json` → 1 push récapitulatif → ids poussés ajoutés au ledger ;
404/410 ⇒ abonnement supprimé. Premier passage = amorçage silencieux du ledger
(reporté si une source est en panne). Le ledger est **indépendant** de
`seen.json` : ne pas les coupler. `public/sw.js` affiche la notif et, au clic,
focalise/ouvre l'app. Détails : `docs/notifications-push.md`.

Ajouter une source = créer un `SourceAdapter` dans `src/lib/sources/` et
l'ajouter à `ALL_SOURCES` dans `index.ts`. Le filtrage est centralisé : un
adaptateur renvoie tout ce que la source expose, sans filtrer.

## Sources & configuration

Tout se règle dans `.env` (voir `.env.example`) : `SOURCE_*` (on/off),
`APIFY_TOKEN` + `APIFY_ACTOR_*`, bounding box `GE_*`, et pour les notifications
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (= clé publique, seule exposée au client) et
`CRON_SECRET`. Clés : `npx web-push generate-vapid-keys` (une seule fois).

**⚠️ Stockage push** : `data/*.json` est éphémère en serverless ; point de swap
vers un KV en tête de `src/lib/push-store.ts`.

**⚠️ API Flatfox** : Flatfox n'a pas d'API officielle documentée ; on utilise
les endpoints que la carte du site interroge, en deux temps : `/api/v1/pin/`
(ids dans la bounding box, max 1000) puis `/api/v1/public-listing/?pk=…`
(détails par lots de 100 — cet endpoint ignore la bbox). Si 404/403, ajuster
`FLATFOX_PIN_API` / `FLATFOX_API` en tête de `src/lib/sources/flatfox.ts`
(requêtes XHR via l'onglet Réseau). Le mapping des champs est tolérant.
Idem pour les sélecteurs en tête de `src/lib/sources/appt.ts`.

**⚠️ immobilier.ch** : pages HTML plafonnées à ~29 par recherche et tri
« Offres TOP » aléatoire (on réutilise la graine `sd` de la page 1). NPA déduit
des coordonnées via swisstopo, caché dans `data/geo-zip.json`. Rafraîchissement
≈ 1 min. Détails : `docs/source-immobilier-ch.md`.

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

## Documentation (obligatoire)

**À chaque nouvelle fonctionnalité**, créer (ou mettre à jour) une fiche dans
`docs/` : `docs/<nom-de-la-fonctionnalite>.md`, en français, simple et courte —
à quoi ça sert, comment l'utiliser, comment ça marche (fichiers clés), réglages
et limites. L'ajouter à l'index `docs/README.md`. Mettre aussi à jour README et
ce fichier (architecture, commandes, backlog) si la fonctionnalité les touche.
Une fonctionnalité n'est pas terminée tant que sa fiche n'existe pas.

## Idées d'évolution (backlog)

- Carte des résultats (les annonces portent `lat`/`lng`).
- Sauvegarde de plusieurs recherches nommées.