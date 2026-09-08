// main.js
import { weatherProviderModel } from './models/weatherProviderModel';
import { storage } from './utils/storage';
import { uiStateModel } from './models/uiStateModel';
import { initMap } from './map-init';
import { loadingSpinnerController } from './controllers/loadingSpinnerController';

// Controller Imports
import { initLifecycleController } from './controllers/lifecycleController';
import { initMapController } from './controllers/mapController';
import { initUiController } from './controllers/uiController';
import { loadWeatherDataForLocationAction } from './controllers/actions';

// Views
import { registerTimelineView } from './views/timelineView';
import { registerForecastView } from './views/forecastView';
import { registerLegendView } from './views/legendView';
import { registerLogoView } from './views/logoView';
import { registerModelInfoView } from './views/modelInfoView';
import { registerMapOverlayView } from './views/mapOverlayView';
import { registerGpsView } from './views/gpsView';
import { registerWindToggleView } from './views/windToggleView';
import { registerShareView } from './views/shareView';
import { registerLoadingView } from './views/loadingSpinnerView';
import { registerNotificationView } from './views/notificationView';
import { registerToastView } from './views/toastView';
import { specialDataView } from './views/specialDataView';
import { D2, AROME } from './weatherProvider/providerIds';
import { parseUrlParams, cleanUrlHistory, normalizeProviderId } from './utils/url';

const { providerId: urlProviderId, location: urlLocation, hadParams } = parseUrlParams();
if (hadParams) cleanUrlHistory();
const storedProviderId = normalizeProviderId(storage.getActiveProvider(weatherProviderModel.getActiveProviderId()));
const initialProviderId = urlProviderId ?? storedProviderId ?? weatherProviderModel.getActiveProviderId();

// --- 1. INITIALISIERUNG ---
// Restore previously selected provider (before map init so imageBounds are correct)
if (initialProviderId !== weatherProviderModel.getActiveProviderId()) {
    weatherProviderModel.setActiveProvider(initialProviderId);
}
const { map, windOverlay } = initMap();

if (!map) {
    throw new Error('Map initialization failed');
}

const mapNN = map as import('leaflet').Map;

// Views registrieren
registerTimelineView(mapNN);
registerForecastView(mapNN);
registerLogoView(mapNN);
registerLegendView(mapNN);
registerModelInfoView(mapNN);
registerMapOverlayView(mapNN, windOverlay);
registerLoadingView();
registerNotificationView();
registerToastView();

registerGpsView(mapNN, () => {
    uiStateModel.setIsLocating(true);
    mapNN.locate({ 
        setView: false, 
        enableHighAccuracy: true 
    });
});

registerWindToggleView(mapNN);
registerShareView(mapNN);
specialDataView.init(mapNN);

// --- 2. CONTROLLER SYSTEM START ---

async function initApp() {
    await initMapController(mapNN);
    initUiController();

    await initLifecycleController(mapNN);

    await loadingSpinnerController.track(async () => {
        // 1. Deep-Linking URL Parameter prüfen (via parseUrlParams)
        if (urlLocation) {
            const targetLatLng = { lat: urlLocation.lat, lng: urlLocation.lng };
            mapNN.setView(targetLatLng, 12);

            // Schiebt die Koordinaten direkt linear in die Pipeline
            try {
                await loadWeatherDataForLocationAction(targetLatLng);
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                weatherProviderModel.setPointDataLoadError(errMsg);
            }
        }
    });
}

initApp();
