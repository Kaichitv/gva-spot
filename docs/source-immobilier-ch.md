# Source immobilier.ch

## À quoi ça sert

[immobilier.ch](https://www.immobilier.ch) est le portail des régies romandes,
très fourni à Genève. Il ajoute environ **850 annonces** du canton, dont une
bonne partie n'est pas sur Flatfox (régies qui n'y publient pas). Les annonces
présentes sur les deux portails sont fusionnées par le dédoublonnage : la carte
affiche alors « + immobilier.ch ».

## Comment l'utiliser

Rien à faire : la source est **activée par défaut** et ne demande aucune clé.
Pour la couper, mettre dans `.env` :

```
SOURCE_IMMOBILIER=false
```

## Comment ça marche

Fichier : `src/lib/sources/immobilier.ts`.

1. **Pages de résultats HTML** (pas d'API). Le `robots.txt` du site autorise ces
   pages (seules les pages `/carte/` sont exclues). On lit chaque carte
   `div.filter-item[data-id]` : lien, titre, prix, pièces, surface, adresse,
   régie, coordonnées GPS et vignette.
2. **Pagination stable** : le tri par défaut du site (« Offres TOP ») est
   aléatoire. On réutilise les paramètres de la page 1 (dont la graine `sd`) pour
   toutes les pages suivantes, sinon on obtient doublons et trous.
3. **Deux recherches combinées** : le site ne sert que ~29 pages par recherche
   (≈ 700 annonces). On parcourt donc le **canton** jusqu'à ce plafond, puis la
   **ville de Genève** en entier, et on fusionne par id.
4. **NPA retrouvé par les coordonnées** : la plupart des adresses n'indiquent
   pas le NPA (« Genève, Av. du Bouchet 8 »). On l'obtient via l'API publique
   de **swisstopo** (géocodage inverse), ce qui donne le quartier et permet le
   dédoublonnage avec Flatfox. Résultats mis en cache (clé `geo-zip`, Turso ou `data/`) :
   chaque coordonnée n'est demandée qu'une fois.
5. L'adresse est reformatée comme chez Flatfox (« Rue X 8, 1209 Genève »).

Guardrails respectés : on ne stocke que les métadonnées utiles au filtrage ; la
vignette est affichée en lien direct depuis immobilier.ch (jamais réhébergée) et
le contact se fait sur l'annonce d'origine.

## Réglages

En tête de `immobilier.ts` :

- `SEARCHES` : URLs de recherche parcourues.
- `PAGE_DELAY_MS` (1 s) : pause entre deux pages, par politesse.
- `MAX_PAGES` : garde-fou par recherche.
- `GEO_CONCURRENCY` : requêtes swisstopo en parallèle.

## Limites

- **Lent** : ~55 pages à 1 s d'intervalle, soit **~1 min** par rafraîchissement
  complet (le cache de 15 min évite de le refaire à chaque recherche). Le
  premier passage ajoute ~600 requêtes swisstopo, très rapides, puis le cache
  géo prend le relais.
- **Couverture ≈ 90 %** du canton : à cause du plafond du site, quelques
  annonces des communes hors ville de Genève manquent.
- **Loyer sans mention de charges** (« CHF 7'200.-/mois ») : on ne sait pas s'il
  est charges comprises ; il est compté comme **net**. Avec charges affichées,
  on renseigne net + charges + total.
- **Pas de date de publication ni de disponibilité** sur les pages de résultats.
- Structure HTML non documentée : si la source tombe à 0 annonce, ajuster les
  sélecteurs de `parseCards()`.
