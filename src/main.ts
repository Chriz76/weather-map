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
import { windArrowOverlayView } from './views/windArrowOverlayView';
import { windOffscreenOverlayView } from './views/windOffscreenOverlayView';
import { windArrowOverlayView2 } from './views/windArrowOverlayView2';
import { registerGpsView } from './views/gpsView';
import { registerWindToggleView } from './views/windToggleView';
import { registerLoadingView } from './views/loadingSpinnerView';
import { registerNotificationView } from './views/notificationView';
import { registerToastView } from './views/toastView';
import { specialDataView } from './views/specialDataView';

// --- 1. INITIALISIERUNG ---
// Restore previously selected provider (before map init so imageBounds are correct)
const storedProvider = storage.getActiveProvider(weatherProviderModel.getActiveProviderId());
if (storedProvider && storedProvider !== weatherProviderModel.getActiveProviderId()) {
    weatherProviderModel.setActiveProvider(storedProvider);
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
//registerMapOverlayView(mapNN, windOverlay);
//windArrowOverlayView.init(mapNN);
//windOffscreenOverlayView.init(mapNN);
windArrowOverlayView2.init(mapNN);
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
specialDataView.init(mapNN);

// --- 2. CONTROLLER SYSTEM START ---

async function initApp() {
    await initMapController(mapNN);
    initUiController();

    await initLifecycleController(mapNN);

    await loadingSpinnerController.track(async () => {
        // 1. Deep-Linking URL Parameter prüfen (?lat=54.4150&lon=11.1022)
        const urlParams = new URLSearchParams(window.location.search);
        const latParam = urlParams.get('lat');
        const lonParam = urlParams.get('lon');

        if (latParam && lonParam) {
            const lat = parseFloat(latParam);
            const lng = parseFloat(lonParam);

            if (!isNaN(lat) && !isNaN(lng)) {
                const targetLatLng = { lat, lng };
                mapNN.setView(targetLatLng, 12);
                
                // Schiebt die Koordinaten direkt linear in die Pipeline
                try {
                    await loadWeatherDataForLocationAction(targetLatLng);
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    weatherProviderModel.setPointDataLoadError(errMsg);
                }
            }
        }
    });
}

initApp();
