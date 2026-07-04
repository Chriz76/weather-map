/* global L */
/**
 * Global helper for the vanilla JS app.
 * Leaflet exposes the global `L` object in the browser.
 * This file is included before the main module to make globals explicit.
 */
if (typeof window !== 'undefined') {
    const globalWindow = /** @type {any} */ (window);
    if (typeof globalWindow.L === 'undefined') {
        globalWindow.L = {};
    }
}
