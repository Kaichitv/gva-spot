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
- **Alertes push** : notification dès qu'une nouvelle annonce correspond à tes
  critères (Web Push, voir [Notifications](#notifications)).

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

Flatfox n'a pas d'API officielle documentée ; on utilise les endpoints que la carte
du site interroge, en deux temps : `/api/v1/pin/` (ids des annonces dans la zone)
puis `/api/v1/public-listing/?pk=…` (détails par lots). S'ils renvoient 404/403 (le
site a pu changer de chemin) :

1. Ouvre <https://flatfox.ch/fr/search/>, cherche « Genève ».
2. Onglet **Réseau** du navigateur → repère les requêtes XHR qui renvoient du JSON
   (les « pins » de la carte, puis le détail des annonces).
3. Copie leurs chemins dans `FLATFOX_PIN_API` / `FLATFOX_API` en tête de
   `src/lib/sources/flatfox.ts`. Le mapping des champs est tolérant, seuls les
   chemins comptent.

Idem pour APPT : si 0 annonce, ajuste les sélecteurs en tête de
`src/lib/sources/appt.ts`.

## Notifications

Bouton **Alertes** (cloche) dans l'en-tête : il abonne le navigateur aux
notifications push avec les critères courants. Un job périodique ré-interroge les
portails et envoie **un** push récapitulatif par abonné dès qu'apparaissent des
annonces jamais notifiées qui correspondent (« 2 nouvelles annonces à Genève —
3.5 p · 72 m² · CHF 2 400 — Eaux-Vives »). Un clic ouvre l'app. Détails :
[docs/notifications-push.md](docs/notifications-push.md).

### 1. Générer les clés VAPID (une seule fois)

```bash
npx web-push generate-vapid-keys
```

Dans `.env` :

```bash
VAPID_PUBLIC_KEY=<Public Key>
VAPID_PRIVATE_KEY=<Private Key>          # serveur uniquement, jamais commitée
VAPID_SUBJECT=mailto:toi@exemple.ch
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<Public Key> # même valeur que VAPID_PUBLIC_KEY
CRON_SECRET=<une longue chaîne aléatoire>
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` est intégrée au build : relance `npm run build` (ou
`npm run dev`) après l'avoir renseignée. Ne régénère pas les clés ensuite : les
abonnements existants deviendraient invalides.

### 2. S'abonner puis tester

1. `npm run dev`, ouvre <http://localhost:3000> (localhost est accepté sans HTTPS),
   clique sur **Alertes** et accepte la permission.
2. `npm run notify -- --test` → une notification factice doit s'afficher.

Sur **iPhone/iPad** : Web Push uniquement dans l'app **installée** sur l'écran
d'accueil, iOS 16.4+, en HTTPS.

### 3. Planifier la vérification

Le premier passage **amorce** le registre (`data/notified.json`) sans rien envoyer ;
seules les annonces apparues ensuite déclenchent une notification.

**Crontab** (machine qui héberge l'app, toutes les 15 min) :

```cron
*/15 * * * * cd /chemin/vers/gva-spot && npm run notify >> data/notify.log 2>&1
```

**Ping HTTP** de la route protégée (cron-job.org, Vercel Cron, un autre serveur…) :

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ton-domaine.ch/api/cron/notify
# ou : curl -fsS "https://ton-domaine.ch/api/cron/notify?token=$CRON_SECRET"
```

Vercel Cron envoie automatiquement `Authorization: Bearer $CRON_SECRET`. Reste à
15 min minimum (politesse envers les portails ; le notifier réutilise de toute façon
un snapshot de moins de 5 min).

> ⚠️ Les abonnements et le registre sont des fichiers JSON dans `data/` : parfait en
> auto-hébergé, **éphémère en serverless** (Vercel). Dans ce cas, brancher un KV
> (Upstash / Vercel KV) dans `src/lib/push-store.ts` (point de swap indiqué en tête
> du fichier).

## Architecture

```
src/
  app/
    page.tsx              UI (filtres + liste), état persistant en localStorage
    layout.tsx            métadonnées, manifest, enregistrement du SW
    api/listings/route.ts agrège → dédoublonne → filtre → JSON (+ cache TTL 15 min)
    api/push/subscribe/   abonnements push (POST / PATCH / DELETE)
    api/cron/notify/      déclencheur HTTP du notifier (protégé par CRON_SECRET)
  components/             Filters, ListingCard, PushToggle, RegisterSW
  lib/
    types.ts              modèle Listing commun + contrat SourceAdapter
    normalize.ts          NPA→quartier, parsing nombres, extraits
    dedupe.ts             regroupement des doublons multi-portails
    filter.ts             application des critères + tri
    cache.ts              registre "annonces vues" + snapshot (data/*.json)
    push-store.ts         abonnements push + registre des annonces notifiées
    push-client.ts        helpers Web Push côté navigateur
    notify.ts             détection des nouveautés + envoi des push
    sources/
      index.ts            registre + fetch parallèle tolérant aux pannes
      flatfox.ts          ✅ API géo publique
      appt.ts             ✅ parsing HTML régies GE
      apify.ts            passerelle Apify générique + mapping
      homegate.ts immoscout.ts anibis.ts   ⚙️ via Apify
scripts/refresh.ts        CLI de rafraîchissement du cache
scripts/notify.ts         CLI du notifier (`npm run notify`, `-- --test`)
scripts/generate-icons.mjs  régénère les icônes d'app (`node scripts/generate-icons.mjs`)
public/                   manifest, service worker (cache + push), icônes
docs/                     une fiche par fonctionnalité
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

- Carte (les annonces ont lat/lng).
- Sauvegarde de plusieurs recherches nommées.
