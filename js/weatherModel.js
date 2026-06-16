/**
 * Modernized WeatherModel extending EventTarget.
 * Actively manages application state and notifications.
 */
class WeatherModel extends EventTarget {
    constructor() {
        super();
        this.state = {
            availableTimestamps: [],
            activeTimestampIndex: 0,
            lastClickedLatLng: null,
            currentClusterData: null,
            modelGeneratedAt: null,
            modelCurrentHour: null,
            interpolatedValue: null, // Hält den aktuellen Punkt-Wert (z.B. {lat, lng, value})
            activeOverlayUrl: null,  // Hält die fertige Base64-Data-URL oder Bild-URL für die Karte
            forecastData: null       // Hält die interpolierten Vorhersagedaten für die Tabelle
        };
    }

    // --- GETTER (Read-Only State Access) ---
    get availableTimestamps() { return this.state.availableTimestamps; }
    get activeTimestampIndex() { return this.state.activeTimestampIndex; }
    get lastClickedLatLng() { return this.state.lastClickedLatLng; }
    get currentClusterData() { return this.state.currentClusterData; }
    get modelGeneratedAt() { return this.state.modelGeneratedAt; }
    get modelCurrentHour() { return this.state.modelCurrentHour; }
    get interpolatedValue() { return this.state.interpolatedValue; }
    get activeOverlayUrl() { return this.state.activeOverlayUrl; }
    get forecastData() { return this.state.forecastData; }

    get activeTimestamp() {
        return this.state.availableTimestamps[this.state.activeTimestampIndex] || null;
    }

    // --- SETTER (State Mutation + Event Dispatching) ---
    setAvailableTimestamps(arr) {
        this.state.availableTimestamps = arr;
        this.dispatchEvent(new CustomEvent('model:timestamps-updated', { detail: arr }));
    }

    setActiveTimestampIndex(i) {
        const maxIndex = this.state.availableTimestamps.length;

        if (i < 0 || (maxIndex > 0 && i >= maxIndex)) {
            console.warn(`Index ${i} is out of bounds!`);
            return;
        }

        this.state.activeTimestampIndex = i;
        this.dispatchEvent(new CustomEvent('model:index-updated', { detail: i }));
    }

    setLastClickedLatLng(latlng) {
        this.state.lastClickedLatLng = latlng;
        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: latlng }));
    }

    setCurrentClusterData(cluster) {
        this.state.currentClusterData = cluster;
        this.dispatchEvent(new CustomEvent('model:cluster-updated', { detail: cluster }));
    }

    setIndexMetadata(generatedAt, currentHour) {
        this.state.modelGeneratedAt = generatedAt;
        this.state.modelCurrentHour = currentHour;
        this.dispatchEvent(new CustomEvent('model:metadata-updated'));
    }

    setInterpolatedValue(val) {
        this.state.interpolatedValue = val;
        this.dispatchEvent(new CustomEvent('model:interpolated-value-updated', { detail: val }));
    }

    setActiveOverlayUrl(url) {
        this.state.activeOverlayUrl = url;
        this.dispatchEvent(new CustomEvent('model:overlay-url-updated', { detail: url }));
    }

    setForecastData(data) {
        this.state.forecastData = data;
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: data }));
    }
}

// Export a single, global state instance
export const weatherModel = new WeatherModel();