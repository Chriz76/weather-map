export const BASE_URL = "https://winddata.pages.dev/";

export const EXPECTED_API_VERSION = "1.1.0"; // Deine gewünschte Version

export const GRID_CELL_SIZE = 1.0;

/** @type {[[number, number], [number, number]]} */
export const imageBounds = [
    [43.0440, -4.1616],
    [58.1647, 20.5444]
];

// The south-west point in imageBounds is [lat, lon]
export const latMin = imageBounds[0][0];
export const lonMin = imageBounds[0][1];

/**
 * Model configurations for different providers.
 * Add provider-specific URLs, overlay templates and capabilities here.
 */
/**
 * MODELS registry. Keep only declarative metadata here; adapters implement behaviour.
 * @type {Record<string, any>}
 */
export const MODELS = {
    d2: {
        id: 'd2',
        displayName: 'ICON-D2 RUC',
        // base URL used for overlays / index
        BASE_URL: BASE_URL,
        overlayUrlTemplate: '${BASE_URL}${timestamp}Z.webp',
        // Bounds for overlay positioning (default to global imageBounds)
        overlayBounds: imageBounds,
        ttl: 60 * 60 * 1000
    },
    arome: {
        id: 'arome',
        displayName: 'Arome PI',
        BASE_URL: 'https://arome.example/', // placeholder - replace with real endpoint
        overlayUrlTemplate: null, // arome may not provide an overlay image
        overlayBounds: imageBounds,
        ttl: 60 * 60 * 1000
    }
};

// Simple constant to indicate the default model id. Prefer importing this directly when
// a constant default is desired instead of calling `getDefaultModelId()`.
export const DEFAULT_MODEL_ID = 'd2';

