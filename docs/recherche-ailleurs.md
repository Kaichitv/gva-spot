# Continuer la recherche ailleurs

## À quoi ça sert

Certaines pistes ne peuvent pas (ou ne doivent pas) être agrégées dans l'app :
Facebook Marketplace (connexion obligatoire, CGU de Meta, annonces de
particuliers) et le logement subventionné ou coopératif (qui fonctionne par
inscription, pas par annonces). Ce bloc les rassemble en **liens sortants**,
au moment où l'on a fait le tour des résultats.

## Comment l'utiliser

Faire défiler jusqu'en bas de la liste (ou lancer une recherche sans résultat) :
le bloc « Continuer la recherche ailleurs » apparaît sous les annonces.

- **Facebook Marketplace** ouvre la recherche « Locations » à Genève avec tes
  critères déjà appliqués. Le résumé affiché (« Genève · max 2 500 CHF ·
  2 chambres et + ») indique ce qui est repris.
- **SFIDP, GIM, CODHA, Équilibre** ouvrent les sites d'inscription.

Tous les liens s'ouvrent dans un nouvel onglet (ou dans l'app Facebook sur
mobile).

## Comment ça marche

Fichier : `src/components/ElsewhereLinks.tsx`, affiché par `src/app/page.tsx`
sous la liste.

- Le lien Marketplace est construit à partir des critères : budget →
  `minPrice` / `maxPrice`, pièces → `minBedrooms` / `maxBedrooms`.
- Conversion pièces → chambres : le compte suisse inclut le séjour, donc
  **chambres = partie entière des pièces − 1** (3.5 p. ≈ 2 chambres). Un studio
  ne fixe aucun minimum.
- Rien n'est récupéré ni stocké : c'est un simple lien, cohérent avec le
  principe « on redirige, on ne republie pas ».

## Réglages

- `MARKETPLACE_URL` en tête du composant : si le lien n'ouvre pas Genève,
  choisir la ville dans Marketplace et recopier l'identifiant visible dans
  l'URL à la place de `geneva`.
- `RESOURCES` : liste des liens d'inscription (libellé, détail, URL).

## Limites

- Marketplace ne connaît ni les **quartiers**, ni la **surface**, ni le
  **meublé** : seuls le budget et le nombre de pièces sont transmis.
- Le format de l'URL Marketplace n'est pas documenté par Meta et n'a pas pu être
  testé sans compte : à vérifier au premier clic.
- Avec une liste très longue (sans filtre), le bloc est loin en bas.
