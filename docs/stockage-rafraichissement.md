# Stockage Turso & rafraîchissement en arrière-plan

## À quoi ça sert

Rendre la recherche **instantanée** en production (Vercel) et garder les
données (annonces vues, abonnements push, cache NPA) d'un déploiement à l'autre.

Avant : chaque recherche ré-interrogeait tous les portails (2–3 min), car le
disque de Vercel est effacé entre deux appels. Maintenant, les portails sont
interrogés **en arrière-plan** ; une recherche ne fait que lire le dernier
résultat enregistré et le filtrer (< 1 s).

## Comment ça marche

```
cron-job.org (toutes les 15 min) ──▶ /api/cron/notify ──▶ répond 202 tout de suite
                                                          puis, après la réponse :
                                                          portails → snapshot (Turso)
                                                          → notifications push

Recherche ──▶ /api/listings ──▶ lit le snapshot dans Turso → filtre → JSON
                                 snapshot > 30 min ? on répond quand même, et on
                                 relance un rafraîchissement après la réponse
                                 (`refreshing: true` → la page revient chercher
                                 la nouvelle version toutes les 15 s)
```

- **Stockage** : une table `kv` (clé → JSON) dans Turso, créée automatiquement.
  Clés : `snapshot`, `seen`, `subscriptions`, `notified`, `geo-zip`,
  `refresh-lock`.
- **Sans Turso** (variables absentes) : mêmes données en fichiers
  `data/<clé>.json`, comme avant (dev hors ligne, auto-hébergement).
- **Verrou** (`refresh-lock`) : un seul rafraîchissement à la fois ; un verrou de
  plus de 5 min est considéré comme abandonné.
- **Bouton Actualiser** : lance une mise à jour en arrière-plan ; l'icône tourne
  jusqu'à l'arrivée des nouvelles annonces.

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/lib/kv.ts` | Lecture / écriture clé → JSON (Turso ou fichiers) |
| `src/lib/data-dir.ts` | Dossier des fichiers : `data/` en local, `/tmp` sur Vercel |
| `src/lib/refresh.ts` | Rafraîchissement du snapshot + verrou |
| `src/app/api/listings/route.ts` | Recherche : lit le snapshot, rafraîchit après la réponse si besoin |
| `src/app/api/cron/notify/route.ts` | Rafraîchissement + notifications, déclenché par le cron |

## Mise en place

1. **Base Turso** : `turso db create gva-spot` (région Europe), puis
   `turso db show gva-spot --url` et `turso db tokens create gva-spot`.
2. **Variables** (`.env` local **et** Vercel) : `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`. Le `.env` local pointe sur la même base que la prod :
   `npm run refresh` depuis ta machine remplit aussi la prod.
3. **cron-job.org** : créer une tâche toutes les 15 min sur
   `https://<ton-domaine>/api/cron/notify`, avec l'en-tête
   `Authorization: Bearer <CRON_SECRET>` (ou `?token=<CRON_SECRET>` dans l'URL).
   La route répond `202` immédiatement : le délai d'attente de cron-job.org
   (~30 s) n'est jamais atteint.
4. Débogage : `/api/cron/notify?token=…&wait=1` attend la fin et renvoie le
   résumé (peut prendre ~1–2 min).

## Réglages et limites

- `TTL_MINUTES` (30) en tête de `src/app/api/listings/route.ts` : âge au-delà
  duquel une recherche déclenche un rafraîchissement de secours.
- `maxDuration = 300` sur les deux routes : le rafraîchissement en arrière-plan
  vit dans la même invocation Vercel (nécessite Fluid Compute, activé par défaut).
- Région Vercel : `fra1` (proche des portails suisses et de Turso eu-west).
- Le snapshot pèse ~1–2 Mo : aucun souci pour Turso (testé à 3 Mo).
- Sans cron configuré, l'app fonctionne quand même : c'est la première
  recherche après 30 min qui relance la mise à jour (résultats affichés tout de
  suite, les nouveautés arrivent ~1–2 min plus tard).
- Le verrou n'est pas strictement atomique : deux appels simultanés peuvent
  rarement lancer deux rafraîchissements. Sans conséquence en usage perso.
