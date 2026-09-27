# GVA Spot 🏠

Agrégateur **personnel** d'annonces de location à Genève, paramétrable par critères,
installable sur téléphone (PWA). Conçu comme un **comparateur qui redirige vers la
source** : il rassemble les annonces de plusieurs portails, les dédoublonne et les
filtre, mais le contact se fait toujours sur l'annonce d'origine.

> Usage perso, non commercial. Voir la section **Cadre & bonnes pratiques** plus bas.

## Ce que ça fait

- Récupère les annonces de plusieurs sources (voir ci-dessous).
- **Dédoublonne** les biens listés sur plusieurs portails (regroupés par adresse /
  pièces / loyer).
- **Filtre** par pièces, surface, loyer max, quartier/commune, meublé, mot-clé.
- Marque les **nouveautés** (« jamais vues avant ») grâce à un cache disque.
- **PWA** : installable sur iOS/Android, écran d'accueil, coquille hors-ligne.

## Sources

| Source | État | Clé requise | Notes |
|---|---|---|---|
| **Flatfox** | ✅ activée | non | API géographique publique. Socle du MVP. |
| **APPT** | ✅ activée | non | Agrège les régies genevoises (parsing HTML). |
| **Homegate** | ⚙️ optionnelle | Apify | Groupe SMG, anti-bot. Désactivée par défaut. |
| **ImmoScout24** | ⚙️ optionnelle | Apify | Groupe SMG, anti-bot. Désactivée par défaut. |
| **Anibis** | ⚙️ optionnelle | Apify | CGU restrictives (duplication interdite). Désactivée par défaut. |

Les trois dernières passent par un acteur **Apify** (le moyen le plus simple/fiable
pour un usage perso face à leur anti-bot). Elles restent **désactivées** tant que tu
ne fournis pas `APIFY_TOKEN` + l'ID d'acteur correspondant.

## Démarrage

Prérequis : **Node.js 20+**.

```bash
cp .env.example .env      # ajuste si besoin
npm install
npm run dev               # http://localhost:3000
```

Build de prod :

```bash
npm run build && npm start
```

Pré-remplir le cache depuis le terminal (optionnel, utile pour un cron) :

```bash
npm run refresh
```

## Installer sur le téléphone (PWA)

1. Déploie l'app en HTTPS (Vercel en un clic, ou `npm start` derrière un reverse
   proxy TLS). La PWA exige HTTPS (sauf `localhost`).
2. Ouvre l'URL sur le tel :
   - **iOS/Safari** : Partager → « Sur l'écran d'accueil ».
   - **Android/Chrome** : menu → « Installer l'application ».

## Réglages

Tout est dans `.env` (voir `.env.example`) :

- `SOURCE_*` : activer/désactiver chaque source.
- `APIFY_TOKEN`, `APIFY_ACTOR_*` : pour les sources SMG.
- `GE_NORTH/SOUTH/EAST/WEST` : bounding box de la zone (canton de Genève par défaut).

### ⚠️ Vérifier l'API Flatfox (10 s, une seule fois)

Flatfox n'a pas d'API officielle documentée ; on utilise l'endpoint que la carte du
site interroge. S'il renvoie 404/403 (le site a pu changer de chemin) :

1. Ouvre <https://flatfox.ch/fr/search/>, cherche « Genève ».
2. Onglet **Réseau** du navigateur → repère la requête XHR qui renvoie du JSON de
   logements.
3. Copie son chemin dans la constante `FLATFOX_API` en tête de
   `src/lib/sources/flatfox.ts`. Le mapping des champs est tolérant, seul le chemin
   compte.

Idem pour APPT : si 0 annonce, ajuste les sélecteurs en tête de
`src/lib/sources/appt.ts`.

## Architecture

```
src/
  app/
    page.tsx              UI (filtres + liste), état persistant en localStorage
    layout.tsx            métadonnées, manifest, enregistrement du SW
    api/listings/route.ts agrège → dédoublonne → filtre → JSON (+ cache TTL 15 min)
  components/             Filters, ListingCard, RegisterSW
  lib/
    types.ts              modèle Listing commun + contrat SourceAdapter
    normalize.ts          NPA→quartier, parsing nombres, extraits
    dedupe.ts             regroupement des doublons multi-portails
    filter.ts             application des critères + tri
    cache.ts              registre "annonces vues" + snapshot (data/*.json)
    sources/
      index.ts            registre + fetch parallèle tolérant aux pannes
      flatfox.ts          ✅ API géo publique
      appt.ts             ✅ parsing HTML régies GE
      apify.ts            passerelle Apify générique + mapping
      homegate.ts immoscout.ts anibis.ts   ⚙️ via Apify
scripts/refresh.ts        CLI de rafraîchissement du cache
public/                   manifest, service worker, icônes
data/                     cache local (git-ignoré)
```

Ajouter une source = créer un `SourceAdapter` dans `src/lib/sources/` et l'ajouter à
`ALL_SOURCES` dans `index.ts`.

## Cadre & bonnes pratiques (à lire)

Ce projet est pensé pour un **usage strictement personnel**, avec le profil de risque
le plus bas :

- **On redirige, on ne republie pas.** On ne stocke ni ne réaffiche les photos ou les
  coordonnées personnelles des annonceurs : `sourceUrl` est le point de contact. C'est
  la ligne qui distingue un comparateur (qui redirige) d'une republication (parasitaire).
- **Respect des CGU.** Certains portails interdisent explicitement le scraping / la
  duplication (Anibis notamment). Ils sont désactivés par défaut ; si tu les actives,
  reste en usage perso et en mode redirection.
- **Politesse technique.** Requêtes espacées, `User-Agent` honnête, cache 15 min pour
  ne pas marteler les serveurs. N'augmente pas les fréquences sans raison.
- **Données personnelles (LPD).** Les coordonnées d'annonceurs sont des données
  personnelles. Ne construis pas de base de contacts ; contente-toi du lien vers
  l'annonce.
- **Passer public / commercial changerait la donne** : il faudrait alors cadrer
  sérieusement CGU, droit d'auteur (photos/descriptions), protection des bases de
  données et LPD. Ce repo ne vise pas ce cas.

### À ne pas oublier hors portails

Une partie du parc genevois n'est pas sur les portails :

- **Logement subventionné** (HBM/HLM/HM) : inscription au SFIDP (`fidp.ch`) ou en
  ligne via `ge.ch/logement-subventionne`. Système de liste, pas d'annonces.
- **Coopératives** (CODHA, Équilibre…) : attribution sur appel à candidatures entre
  membres. Adhésion ≠ logement immédiat.
- **Gérance immobilière municipale (GIM)** et fondations communales.

Ces pistes sont rappelées en bas de l'app, en lien.

## Idées d'évolution

- Notifications push des nouvelles annonces correspondant aux critères (le vrai atout
  à Genève, où ça part en heures) — via Web Push + le cron `refresh`.
- Carte (les annonces ont lat/lng).
- Sauvegarde de plusieurs recherches nommées.
