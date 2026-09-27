# Recherche & filtres

## À quoi ça sert

Définir ses critères (budget, pièces, surface, quartiers, mot-clé, options)
avec une interface pensée pour le mobile, inspirée d'Airbnb : une barre de
recherche compacte en haut, et un panneau de filtres complet à la demande.

## Comment l'utiliser

- **Barre de recherche** (collante en haut de l'écran) : résume la recherche
  (ligne 1 : quartiers, ligne 2 : budget · pièces · surface · mot-clé). Un tap
  ouvre le panneau de filtres. La pastille rose indique le nombre de filtres
  actifs.
- **Bascules rapides** « Nouveautés » et « Meublé » sous la barre : appliquées
  immédiatement. Le nombre d'annonces s'affiche à droite.
- **Panneau « Filtres »** : bottom sheet sur mobile (glisser la poignée vers le
  bas pour fermer), modale centrée sur desktop.
  - Budget : minimum / maximum + préréglages (≤ 1 500 … ≤ 4 000 CHF).
  - Taille : pièces min. / max. par demi-pièce (− / +), surface minimum.
  - Quartiers : sélection multiple (Ville de Genève / Communes). Aucun = tout Genève.
  - Mot-clé, puis options Nouveautés / Meublé.
  - Le bouton **« Afficher N annonces »** donne le nombre de résultats en direct.
    Fermer (✕, Échap, clic sur le fond) **annule** les modifications.
- **Actualiser** : bouton ↻ avec l'heure de mise à jour, dans l'en-tête
  (ré-interroge les portails en ignorant le cache).
- Aucun résultat : bouton « Effacer les filtres ».

## Comment ça marche

- `src/components/Filters.tsx` — barre collante (pilule + bascules + compteur).
  Ombre affichée seulement quand la barre colle (IntersectionObserver).
- `src/components/FilterSheet.tsx` — panneau sur `<dialog>` natif (focus piégé,
  Échap, top-layer). Travaille sur un **brouillon** ; `onApply` à la validation.
- `src/lib/criteria-ui.ts` — helpers purs : `buildParams`, `cleanCriteria`,
  `countActive`, libellés de résumé, groupes de quartiers (dérivés de
  `ZIP_TO_NEIGHBORHOOD`).
- `src/app/page.tsx` — `apply(c)` = persistance localStorage + synchro alertes +
  recherche. Plus de bouton « Filtrer » : tout changement validé relance la recherche.
- Styles `.sheet`, `.no-scrollbar` et `.field:focus-within` dans `globals.css`.

## Réglages et limites

- Le compteur en direct appelle `/api/listings` (débouncé 350 ms). Cette route
  ne lit que le snapshot enregistré : elle ne sollicite jamais les portails
  pendant la requête (voir [stockage-rafraichissement.md](stockage-rafraichissement.md)).
- Préréglages de budget : `RENT_PRESETS` ; bornes des pièces : `ROOMS`
  (en tête de `FilterSheet.tsx`).
- Champs en 16 px minimum : évite le zoom automatique d'iOS au focus.
- Le filtre `zips` (NPA) reste supporté par l'API mais n'a pas de contrôle dans l'UI.
