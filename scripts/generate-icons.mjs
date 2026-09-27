/**
 * Génère les icônes d'app (PWA, Apple, favicon) à partir d'un seul dessin :
 * la maison Phosphor « fill » (la même que le logo de l'en-tête) en
 * `--accent-ink` sur un dégradé rose subtil, du haut-droit vers le bas-gauche.
 *
 *   node scripts/generate-icons.mjs
 *
 * Utilise `sharp`, déjà installé comme dépendance optionnelle de Next.js.
 * À relancer uniquement si l'on veut changer le dessin ou les couleurs.
 * (Le badge monochrome des notifications a son propre script :
 * scripts/generate-badge.mjs.)
 */

import path from "node:path";
import sharp from "sharp";

// Tokens de globals.css : --accent (#f472b6), --accent-hover (#ec4899),
// --accent-ink (#14060d). Le haut-droit est éclairci d'un cran pour que le
// dégradé reste discret autour de l'accent.
const GRADIENT_FROM = "#f78dc6"; // haut-droit
const GRADIENT_TO = "#ec4899"; // bas-gauche
const INK = "#14060d";

// Phosphor « House », graisse fill (viewBox 256, MIT). Boîte englobante
// ≈ x 32→224, y 24→224 : centre optique (128, 124), côté 200.
const HOUSE_PATH =
  "M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z";
const HOUSE_CENTER = { x: 128, y: 124 };
const HOUSE_SIZE = 200;

/**
 * @param {number} size   côté de l'image en px
 * @param {number} glyph  part du côté occupée par la maison (0–1)
 * @param {number} radius rayon des coins en part du côté (0 = carré plein)
 */
function iconSvg(size, glyph, radius) {
  const scale = (size * glyph) / HOUSE_SIZE;
  const tx = size / 2 - HOUSE_CENTER.x * scale;
  // Léger décalage vers le bas : le toit pointu « pèse » moins que la base.
  const ty = size / 2 - HOUSE_CENTER.y * scale + size * 0.01;
  const r = size * radius;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GRADIENT_FROM}" />
      <stop offset="1" stop-color="${GRADIENT_TO}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)" />
  <path fill="${INK}" transform="translate(${tx} ${ty}) scale(${scale})" d="${HOUSE_PATH}" />
</svg>`;
}

const targets = [
  // « any » : coins arrondis, fond transparent autour (installation desktop).
  { file: "public/icons/icon-192.png", size: 192, glyph: 0.5, radius: 0.22 },
  { file: "public/icons/icon-512.png", size: 512, glyph: 0.5, radius: 0.22 },
  // « maskable » : carré plein, maison dans la zone sûre (cercle de 80 %).
  { file: "public/icons/icon-maskable-512.png", size: 512, glyph: 0.46, radius: 0 },
  // iOS arrondit lui-même et noircit la transparence : carré plein.
  { file: "public/icons/apple-touch-icon.png", size: 180, glyph: 0.5, radius: 0 },
  // Favicon : maison plus grande pour rester lisible à 16–32 px.
  { file: "public/favicon.png", size: 64, glyph: 0.6, radius: 0.22 },
];

for (const t of targets) {
  const out = path.join(process.cwd(), t.file);
  await sharp(Buffer.from(iconSvg(t.size, t.glyph, t.radius))).png().toFile(out);
  console.log(`✓ ${t.file} (${t.size}×${t.size})`);
}
