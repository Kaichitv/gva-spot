/**
 * Génère public/icons/badge-72.png : icône « badge » des notifications Android
 * (72×72, silhouette monochrome blanche sur fond transparent — Android n'en
 * garde que le canal alpha).
 *
 *   node scripts/generate-badge.mjs
 *
 * Utilise `sharp`, déjà installé comme dépendance optionnelle de Next.js.
 * À relancer uniquement si l'on veut changer le dessin.
 */

import path from "node:path";
import sharp from "sharp";

// Maison simplifiée (toit + corps + porte évidée), marges de sécurité ~10 %.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <path fill="#fff" fill-rule="evenodd" d="
    M36 8 L64 32 L58 32 L58 64 L14 64 L14 32 L8 32 Z
    M30 64 L30 46 Q30 42 34 42 L38 42 Q42 42 42 46 L42 64 Z" />
</svg>`;

const out = path.join(process.cwd(), "public", "icons", "badge-72.png");
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`✓ ${path.relative(process.cwd(), out)}`);
