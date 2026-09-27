# Icônes de l'app

## À quoi ça sert

Donner à GVA Spot une icône cohérente avec le design system, partout où
l'app apparaît : écran d'accueil (Android / iOS), app installée sur desktop,
onglet du navigateur.

## Le dessin

- **Fond** : dégradé rose subtil, du **haut-droit** (`#f78dc6`, un cran plus
  clair que `--accent`) vers le **bas-gauche** (`--accent-hover`, `#ec4899`).
- **Maison** : Phosphor `House`, graisse `fill`, en `--accent-ink`
  (`#14060d`). C'est le même glyphe que le logo de l'en-tête (`page.tsx`) :
  l'icône en est la version agrandie.

## Fichiers générés

| Fichier | Taille | Usage | Forme |
|---|---|---|---|
| `public/icons/icon-192.png` | 192 | manifest, `any` | coins arrondis (22 %) |
| `public/icons/icon-512.png` | 512 | manifest, `any` | coins arrondis (22 %) |
| `public/icons/icon-maskable-512.png` | 512 | manifest, `maskable` (Android) | carré plein, maison dans la zone sûre |
| `public/icons/apple-touch-icon.png` | 180 | iOS (`layout.tsx`) | carré plein (iOS arrondit lui-même) |
| `public/favicon.png` | 64 | onglet | coins arrondis, maison plus grande |

Le manifest utilise `#0a0a0b` (fond du thème sombre) pour `theme_color` et
`background_color` : l'écran de lancement Android affiche l'icône rose sur
fond sombre.

## Modifier les icônes

Tout est décrit dans `scripts/generate-icons.mjs` (couleurs, taille de la
maison, rayon des coins par cible). Après modification :

```bash
node scripts/generate-icons.mjs
```

Le badge monochrome des notifications Android est à part :
`scripts/generate-badge.mjs` → `public/icons/badge-72.png`.

## Limites

- Les couleurs sont recopiées dans le script : si l'accent change dans
  `globals.css`, mettre à jour `GRADIENT_FROM` / `GRADIENT_TO` / `INK` et
  relancer.
- Une PWA déjà installée peut garder l'ancienne icône un moment (Android
  rafraîchit le manifest à son rythme ; sur iOS, supprimer puis ré-ajouter
  l'app à l'écran d'accueil).
