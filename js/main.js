// main.js
import { weatherModel } from './models/weatherModel.js';
import { initMap } from './map-init.js';
import { loadingSpinnerController } from './controllers/loadingSpinnerController.js';

// Controller Imports
import { initLifecycleController, startLifecycleController } from './controllers/lifecycleController.js';
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
import { registerLoadingView } from './views/loadingSpinnerView.js';
import { registerNotificationView } from './views/notificationView.js';

// --- 1. INITIALISIERUNG ---
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

registerGpsView(map, () => {
    weatherModel.setIsLocating(true);     
    map.locate({ 
        setView: false, 
        enableHighAccuracy: true 
    });
});

// --- 2. CONTROLLER SYSTEM START ---

async function initApp() {
    initMapController(map);
    initUiController();
    initLifecycleController();

    await startLifecycleController();

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
                await loadWeatherDataForLocationAction(targetLatLng);
            }
        }
    });
}

initApp();