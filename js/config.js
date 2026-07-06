export const BASE_URL = "https://winddata.pages.dev/";

export const EXPECTED_API_VERSION = "1.0.0"; // Deine gewünschte Version

export const GRID_CELL_SIZE = 1.0;

/** @type {[[number, number], [number, number]]} */
export const imageBounds = [
    [43.0440, -4.1616],
    [58.1647, 20.5444]
];

// The south-west point in imageBounds is [lat, lon]
export const latMin = imageBounds[0][0];
export const lonMin = imageBounds[0][1];
