import { IconLayer } from '@deck.gl/layers';
import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { logger } from '../utils/logger';
import { uiStateModel } from '../models/uiStateModel';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { providers } from '../config';
import { getTileBounds, getDensityConfigFromZoom, getVisibleTileIndicesFromBounds, WindArrowPoint } from '../utils/tile';
import { windArrowService } from '../services/windArrowService';

const WIND_ARROW_PANE_Z_INDEX = '510';
const WIND_ARROW_CLASS = 'wind-arrow-deck-overlay';

// Arrow/grid configuration is provided per-provider via `providers[providerId].arrows`.
function getArrowsConfig() {
  const providerCfg = providers[weatherProviderModel.getActiveProviderId()] as any;
  const arrows = providerCfg?.arrows ?? {};

  const lonMin = typeof arrows.lonMin === 'number' ? arrows.lonMin : (typeof arrows.LON_MIN === 'number' ? arrows.LON_MIN : -12.0);
  const latMax = typeof arrows.latMax === 'number' ? arrows.latMax : (typeof arrows.LAT_MAX === 'number' ? arrows.LAT_MAX : 55.4);
  const totalLonSpan = typeof arrows.totalLonSpan === 'number' ? arrows.totalLonSpan : (typeof arrows.TOTAL_LON_SPAN === 'number' ? arrows.TOTAL_LON_SPAN : 1136 * 0.025);
  const totalLatSpan = typeof arrows.totalLatSpan === 'number' ? arrows.totalLatSpan : (typeof arrows.TOTAL_LAT_SPAN === 'number' ? arrows.TOTAL_LAT_SPAN : 720 * 0.025);
  const baseLeafletZoom = typeof arrows.baseLeafletZoom === 'number' ? arrows.baseLeafletZoom : (typeof arrows.BASE_LEAFLET_ZOOM === 'number' ? arrows.BASE_LEAFLET_ZOOM : 8);
  const maxPmtilesZ = typeof arrows.maxPmtilesZ === 'number' ? arrows.maxPmtilesZ : (typeof arrows.MAX_PMTILES_Z === 'number' ? arrows.MAX_PMTILES_Z : 4);

  return { lonMin, latMax, totalLonSpan, totalLatSpan, baseLeafletZoom, maxPmtilesZ };
}

// `WindArrowPoint` type is imported from utils/tile

const WIND_ARROW_ICON_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.65"/>
        </filter>
      </defs>
      <path d="M36 8 L48 28 H40 V56 H32 V28 H24 Z" fill="white" filter="url(#shadow)"/>
    </svg>
  `);

let overlayInstance: LeafletDeckOverlay | null = null;
let loadToken = 0;
let cachedPoints: WindArrowPoint[] | null = null;
let currentPmtilesUrl: string | null = null;
let updateTimeoutId: ReturnType<typeof setTimeout> | null = null;

// tile utilities (getTileBounds, getDensityConfig, getVisibleTileIndices) are provided
// by `src/utils/tile.ts` and imported above. They are stateless and accept an
// optional arrows config when needed.

// decoding moved to utils/decode; view uses `decodeWindArrowPointsFromImageData` import

// Tile loading, decoding and caching moved into `windArrowService`.

async function updateViewportWindPoints(): Promise<void> {
  if (!overlayInstance || !windArrowService.isReady()) return;

  const map = overlayInstance.getMapInstance();
  if (!map) return;

  const cfg = getArrowsConfig();
  const zoom = Math.floor(map.getZoom());
  const { pmZ, step } = getDensityConfigFromZoom(zoom, cfg);
  if (step === 0) {
    setIconLayerFromPoints([]);
    return;
  }

  const currentToken = ++loadToken;
  const b = map.getBounds();
  const bounds = { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
  const visibleIndices = getVisibleTileIndicesFromBounds(bounds, pmZ, cfg);

  if (visibleIndices.length === 0) return;

    try {
      const cfg = getArrowsConfig();
      const allPoints = await windArrowService.decodeTilesToPoints(visibleIndices, step, cfg);
      if (currentToken !== loadToken) return;

      console.log(`[WindOverlay Summary] Total Viewport Points: ${allPoints.length} across ${visibleIndices.length} tiles.`);
      logger.debug(`[WindOverlay] LOD z=${pmZ}, Step=${step} -> ${allPoints.length} Punkte auf dem Screen.`);
      setIconLayerFromPoints(allPoints);
    } catch (err) {
      console.error('[WindOverlay] Fehler in updateViewportWindPoints:', err);
    }
}

function scheduleUpdateViewportWindPoints(): void {
  if (updateTimeoutId !== null) {
    clearTimeout(updateTimeoutId);
  }
  updateTimeoutId = setTimeout(() => {
    updateTimeoutId = null;
    void updateViewportWindPoints();
  }, 50);
}

function pointsEqual(a: WindArrowPoint[] | null, b: WindArrowPoint[]): boolean {
  if (a === b) return true;
  if (!a) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    if (pa.angle !== pb.angle) return false;
    if (pa.position[0] !== pb.position[0] || pa.position[1] !== pb.position[1]) return false;
  }
  return true;
}

function setIconLayerFromPoints(points: WindArrowPoint[]): void {
  if (!overlayInstance) return;
  if (pointsEqual(cachedPoints, points)) return;

  const iconLayer = new IconLayer<WindArrowPoint>({
    id: 'wind-arrow-layer',
    data: points,
    iconAtlas: WIND_ARROW_ICON_URL,
    iconMapping: {
      arrow: {
        x: 0,
        y: 0,
        width: 72,
        height: 72,
        anchorX: 36,
        anchorY: 36,
        mask: false
      }
    },
    getIcon: () => 'arrow',
    getPosition: (d: WindArrowPoint) => d.position,
    getAngle: (d: WindArrowPoint) => d.angle,
    getSize: 26,
    sizeScale: 1,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false
  });

  cachedPoints = points;
  overlayInstance.setLayers([iconLayer]);
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap) => void;
  setPmtilesUrl?: (overlayUrl: string) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init: (map: LeafletMap): void => {
    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({ className: WIND_ARROW_CLASS, zIndex: WIND_ARROW_PANE_Z_INDEX });
      overlayInstance.addTo(map);

      // Do not initialize a default PMTiles here — wait for model timestamps/provider

      map.on('moveend zoomend resize', () => {
        scheduleUpdateViewportWindPoints();
      });
    }

    // React to overlay URL updates by deriving PMTiles URL from model + config
    uiStateModel.addEventListener('ui:overlay-url-updated', () => {
      const ts = weatherProviderModel.activeTimestamp;
      const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
      // If the active provider does not expose arrow/overlay configuration,
      // it does not provide PMTiles for wind arrows. Clean up any existing
      // tiles/layers and skip initialization.
      if (!ts || !providerCfg?.baseUrl || !providerCfg?.arrows) {
        try { windArrowService.clear(); } catch {}
        currentPmtilesUrl = null;
        loadToken++; // invalidate in-flight loads
        cachedPoints = null;
        setIconLayerFromPoints([]);
        return;
      }

      const base = providerCfg.baseUrl.replace(/\/?$/, '/');
      const pm = `${base}${ts}Z_dir.pmtiles`;
      if (pm === currentPmtilesUrl) return;

      try { windArrowService.setPmtilesUrl(pm); } catch (e) { /* ignore */ }
      currentPmtilesUrl = pm;
      loadToken++; // invalidate any in-flight loads
      scheduleUpdateViewportWindPoints();
    });
    // Initialize PMTiles only when the model provides a timestamp/provider
    const setupFromModel = () => {
      const ts = weatherProviderModel.activeTimestamp;
      const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
      // Only initialize PMTiles when the provider actually supports arrows/overlays
      if (!ts || !providerCfg?.baseUrl || !providerCfg?.arrows) {
        try { windArrowService.clear(); } catch {}
        currentPmtilesUrl = null;
        loadToken++; // invalidate in-flight loads
        cachedPoints = null;
        setIconLayerFromPoints([]);
        return;
      }

      const base = providerCfg.baseUrl.replace(/\/?$/, '/');
      const pm = `${base}${ts}Z_dir.pmtiles`;
      if (pm === currentPmtilesUrl) return;

      try { windArrowService.setPmtilesUrl(pm); } catch (e) { /* ignore */ }
      currentPmtilesUrl = pm;
      loadToken++; // invalidate any in-flight loads
      scheduleUpdateViewportWindPoints();
    };

    // call once in case model already has timestamps
    setupFromModel();

    // re-run setup when timestamps or provider change
    weatherProviderModel.addEventListener('model:timestamps-updated', setupFromModel);
    weatherProviderModel.addEventListener('model:provider-changed', setupFromModel);

    scheduleUpdateViewportWindPoints();
  }
};

function setPmtilesUrlFromOverlayUrl(overlayUrl?: string): void {
  if (!overlayUrl) return;

  let pmurl = overlayUrl;

  // If the URL doesn't already look like a _dir.pmtiles file, try to convert
  if (!/_dir\.pmtiles$/i.test(pmurl)) {
    pmurl = pmurl.replace(/\.webp(?:\?.*)?$/i, '_dir.pmtiles');
  }

  if (pmurl === currentPmtilesUrl) return;

  // Guard: only allow manual PMTiles URL setting for providers that support overlays
  const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
  if (!providerCfg?.arrows) return;

  try { windArrowService.setPmtilesUrl(pmurl); } catch (e) { /* ignore */ }
  currentPmtilesUrl = pmurl;
  loadToken++; // invalidate any in-flight loads
  scheduleUpdateViewportWindPoints();
}

// expose the setter on the exported view
windArrowOverlayView.setPmtilesUrl = (overlayUrl: string) => setPmtilesUrlFromOverlayUrl(overlayUrl);