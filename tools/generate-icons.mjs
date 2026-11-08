/**
 * Generates the PWA icons (192, 512 and one maskable 512) from `public/favicon.svg`.
 *
 * The favicon declares `viewBox="0 0 32 32"`, but the windsock glyph only occupies
 * part of that box, so every icon re-frames the glyph with its own viewBox:
 * - `any` icons keep ~7% padding around the glyph,
 * - the maskable icon keeps the glyph inside the 80% safe zone on a brand background,
 *   because Android crops maskable icons to a circle / squircle.
 *
 * sharp is NOT a project dependency. Install it on demand and run:
 *   npm install --no-save sharp
 *   node tools/generate-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** Measured bounding box of the glyph inside the favicon's 32x32 viewBox. */
const GLYPH_BOX = { x: 3.67875, y: 4.51952, w: 25.02168, h: 24.84298 };

/** Brand color of the map (same value as `--weather-map-accent-blue`). */
const BRAND_COLOR = '#0077a4';

const PUBLIC_DIR = path.resolve('public');
const SOURCE_SVG = path.join(PUBLIC_DIR, 'favicon.svg');

/** Returns a square viewBox centered on the glyph; `ratio` is the glyph share of the box. */
function squareBox(ratio) {
    const side = Math.max(GLYPH_BOX.w, GLYPH_BOX.h) / ratio;
    return {
        side,
        x: GLYPH_BOX.x + GLYPH_BOX.w / 2 - side / 2,
        y: GLYPH_BOX.y + GLYPH_BOX.h / 2 - side / 2
    };
}

function viewBoxOf(box) {
    return [box.x, box.y, box.side, box.side].map((value) => value.toFixed(3)).join(' ');
}

/** Extracts the glyph markup (everything inside the root `<svg>` element). */
function readGlyphMarkup() {
    const source = fs.readFileSync(SOURCE_SVG, 'utf8');
    const match = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (!match) throw new Error('Unexpected favicon.svg structure');
    return match[1];
}

function buildSvg(glyphMarkup, box, size, options) {
    const viewBox = viewBoxOf(box);
    const glyph = options.fill ? glyphMarkup.replaceAll(BRAND_COLOR, options.fill) : glyphMarkup;
    const backdrop = options.background
        ? `<rect x="${box.x.toFixed(3)}" y="${box.y.toFixed(3)}" width="${box.side.toFixed(3)}" height="${box.side.toFixed(3)}" fill="${options.background}"/>`
        : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${backdrop}${glyph}</svg>`;
}

async function writeIcon(glyphMarkup, file, box, size, options) {
    const svg = buildSvg(glyphMarkup, box, size, options);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, file));
    console.log(`generated ${file} (${size}x${size})`);
}

const glyphMarkup = readGlyphMarkup();
const anyBox = squareBox(0.86);
const maskableBox = squareBox(0.62);

await writeIcon(glyphMarkup, 'icon-192.png', anyBox, 192, {});
await writeIcon(glyphMarkup, 'icon-512.png', anyBox, 512, {});
await writeIcon(glyphMarkup, 'icon-maskable-512.png', maskableBox, 512, { background: BRAND_COLOR, fill: '#ffffff' });
