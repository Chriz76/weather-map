/**
 * Browser capability probes shared by the deck.gl overlays.
 *
 * Import as a namespace so call sites stay explicit, e.g. `webgl.isWebGL2Supported()`.
 */

/**
 * deck.gl v9 renders exclusively through WebGL2: without it, the GPU device creation fails and
 * deck.gl only logs errors. Callers use this to skip the overlay entirely, so the map and all
 * other layers keep working and just the wind layer is missing.
 * @returns `true` when a WebGL2 context can be created.
 */
export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}
