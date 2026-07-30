const BASE_URL = "https://winddata.pages.dev/";

export const EXPECTED_API_VERSION = "1.1.0"; // Deine gewünschte Version

import { D2, AROME } from './weatherProvider/providerIds.js';

/**
 * Provider-specific default configuration accessible as `config.providers[providerId]`.
 * Consumers can read e.g. `providers[AROME].gridCellSize`.
 */
export const providers = {
    [D2]: {
        baseUrl: BASE_URL,
        gridCellSize: 1.0,
        imageBounds : [
            [43.0440, -4.1616],
            [58.1647, 20.5444]
        ]
    },
    [AROME]: {
        baseUrl: BASE_URL,
        gridCellSize: 1.0
    }
};

