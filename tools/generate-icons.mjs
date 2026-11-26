/**
 * Generates every raster icon (favicon PNG, PWA icons, Apple touch icon) from
 * `public/logo.svg`, which holds the plain glyph without any background.
 *
 * `favicon.svg` adapts to the browser theme (blue on light, white on dark chrome), which
 * only SVG favicons can do, so the raster variants cover the other surfaces:
 * - the 48 px favicon fallback stays transparent, because browsers without SVG favicon
 *   support draw it on a light tab strip,
 * - OS surfaces (PWA `any` icons, Apple touch icon) use the brand plate with a white
 *   glyph, matching the installed app icon on Android,
 * - the maskable icon keeps the glyph inside the 80% safe zone, because Android
 *   crops maskable icons to a circle / squircle.
 *
 * sharp is NOT a project dependency. Install it on demand and run:
 *   npm install --no-save sharp
 *   node tools/generate-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** Measured bounding box of the glyph in the logo coordinate system. */
const GLYPH_BOX = { x: 3.67875, y: 4.51952, w: 25.02168, h: 24.84298 };

/** Brand color of the map (same value as `--weather-map-accent-blue`). */
const BRAND_COLOR = '#0077a4';

const PUBLIC_DIR = path.resolve('public');
const SOURCE_SVG = path.join(PUBLIC_DIR, 'logo.svg');

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

/**
 * Extracts the glyph markup from the root `<svg>` element.
 *
 * Only the glyph group is kept: the source file carries no background, and any markup
 * before the group (comments, a future plate) must not leak into the generated icons.
 */
function readGlyphMarkup() {
    const source = fs.readFileSync(SOURCE_SVG, 'utf8');
    const match = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (!match) throw new Error('Unexpected logo.svg structure');

    const inner = match[1];
    const glyphStart = inner.indexOf('<g');
    if (glyphStart === -1) throw new Error('Unexpected logo.svg structure: no glyph group');

    return inner.slice(glyphStart);
}

function buildSvg(glyphMarkup, box, size, options) {
    const viewBox = viewBoxOf(box);
    const glyph = options.fill ? glyphMarkup.replaceAll(BRAND_COLOR, options.fill) : glyphMarkup;
    const radius = (box.side * (options.plateRadius ?? 0)).toFixed(3);
    const backdrop = options.background
        ? `<rect x="${box.x.toFixed(3)}" y="${box.y.toFixed(3)}" width="${box.side.toFixed(3)}" height="${box.side.toFixed(3)}" rx="${radius}" fill="${options.background}"/>`
        : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${backdrop}${glyph}</svg>`;
}

async function writeIcon(glyphMarkup, file, box, size, options) {
    const svg = buildSvg(glyphMarkup, box, size, options);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, file));
    console.log(`generated ${file} (${size}x${size})`);
}

const glyphMarkup = readGlyphMarkup();

/** Corner radius as a share of the plate side; matches the installed app icon. */
const PLATE_RADIUS = 0.22;

const webBox = squareBox(0.86);
const osBox = squareBox(0.8);
const maskableBox = squareBox(0.62);
const appleBox = squareBox(0.78);

// Fallback for browsers without SVG favicons: transparent glyph, like `logo.svg`.
// Theme-dependent color is a job for `favicon.svg`, not for a raster file.
await writeIcon(glyphMarkup, 'favicon-48x48.png', webBox, 48, {});

// Large icon on an opaque white square, same idea as PayPal's pp196.png: browser and OS
// surfaces that ignore the SVG favicon then draw a clean white box instead of a bare
// glyph on a dark background. Square on purpose - the UI rounds it while drawing.
await writeIcon(glyphMarkup, 'favicon-196x196.png', squareBox(0.78), 196, { background: '#ffffff' });

// OS surface: brand plate, white glyph - same look as the maskable launcher icon.
await writeIcon(glyphMarkup, 'icon-192.png', osBox, 192, { background: BRAND_COLOR, fill: '#ffffff', plateRadius: PLATE_RADIUS });
await writeIcon(glyphMarkup, 'icon-512.png', osBox, 512, { background: BRAND_COLOR, fill: '#ffffff', plateRadius: PLATE_RADIUS });

// Android adaptive icon: full-bleed background, glyph inside the 80% safe zone.
await writeIcon(glyphMarkup, 'icon-maskable-512.png', maskableBox, 512, { background: BRAND_COLOR, fill: '#ffffff' });

// iOS ignores transparency and rounds the corners itself, so this one stays opaque and square.
await writeIcon(glyphMarkup, 'apple-touch-icon.png', appleBox, 180, { background: BRAND_COLOR, fill: '#ffffff' });
