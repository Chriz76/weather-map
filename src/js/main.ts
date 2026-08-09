// main.js
import 'leaflet/dist/leaflet.css';
import { weatherProviderModel } from './models/weatherProviderModel.js';
import { storage } from './utils/storage.js';
import { uiStateModel } from './models/uiStateModel.js';
import { initMap } from './map-init.ts';
import { loadingSpinnerController } from './controllers/loadingSpinnerController.js';

// Controller Imports
import { initLifecycleController } from './controllers/lifecycleController.js';
import { initMapController } from './controllers/mapController.js';
import { initUiController } from './controllers/uiController.js';
import { loadWeatherDataForLocationAction } from './controllers/actions.js';

// Views
import { registerTimelineView } from './views/timelineView.js';
import { registerForecastView } from './views/forecastView.js';
import { registerLegendView } from './views/legendView.js';
import { registerLogoView } from './views/logoView.js';
import { registerModelInfoView } from './views/modelInfoView.js';
import { registerMapOverlayView } from './views/mapOverlayView.js';
import { registerGpsView } from './views/gpsView.js';
import { registerWindToggleView } from './views/windToggleView.js';
import { registerLoadingView } from './views/loadingSpinnerView.js';
import { registerNotificationView } from './views/notificationView.js';
import { registerToastView } from './views/toastView.js';
import { specialDataView } from './views/specialDataView.js';

// --- 1. INITIALISIERUNG ---
// Restore previously selected provider (before map init so imageBounds are correct)
const storedProvider = storage.getActiveProvider(weatherProviderModel.getActiveProviderId());
if (storedProvider && storedProvider !== weatherProviderModel.getActiveProviderId()) {
    weatherProviderModel.setActiveProvider(storedProvider);
}
const { map, windOverlay } = initMap();

// Views registrieren
registerTimelineView(map);
registerForecastView(map);
registerLogoView(map);
registerLegendView(map);
registerModelInfoView(map);
registerMapOverlayView(map, windOverlay);
registerLoadingView();
registerNotificationView();
registerToastView();

registerGpsView(map, () => {
    uiStateModel.setIsLocating(true);
    map.locate({ 
        setView: false, 
        enableHighAccuracy: true 
    });
});

registerWindToggleView(map);
specialDataView.init(map);

// --- 2. CONTROLLER SYSTEM START ---

async function initApp() {
    await initMapController(map);
    initUiController();

    await initLifecycleController(map);

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
                map.setView(targetLatLng, 12);
                
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