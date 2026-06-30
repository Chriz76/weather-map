import { calculatewindSpeeds } from './utils/interpolation.js';
import { determineActiveIndex } from './utils/time.js';

/**
 * Modernized WeatherModel extending EventTarget.
 * Actively manages application state and notifications.
 */
class WeatherModel extends EventTarget {
    constructor() {
        super();
        this._errorTimer = null; // Timer for auto-clearing error messages
        this.state = {
            availableTimestamps: [],
            activeTimestampIndex: 0,
            lastClickedLatLng: null,
            currentClusterData: null,
            modelGeneratedAt: null,
            modelCurrentHour: null,
            windData: null,
            activeOverlayUrl: null,  
            forecast: null,
            isLocating: false,        // Tippfehler im Kommentar korrigiert
            isActiveLoading: false,
            showError: null
        };
    }

    // --- GETTER (Read-Only State Access) ---
    get availableTimestamps() { return this.state.availableTimestamps; }
    get activeTimestampIndex() { return this.state.activeTimestampIndex; }
    get lastClickedLatLng() { return this.state.lastClickedLatLng; }
    get currentClusterData() { return this.state.currentClusterData; }
    get modelGeneratedAt() { return this.state.modelGeneratedAt; }
    get modelCurrentHour() { return this.state.modelCurrentHour; }
    get windData() { return this.state.windData; }
    get windSpeed() { return this.state.windData ? this.state.windData.speed : null; }
    get windDirection() { return this.state.windData ? this.state.windData.direction : null; }
    get windGust() { return this.state.windData ? this.state.windData.gust : null; } // <-- NEU: Getter für die Böen
    get activeOverlayUrl() { return this.state.activeOverlayUrl; }
    get forecast() { return this.state.forecast; }
    get isLocating() { return this.state.isLocating; }
    get isActiveLoading() { return this.state.isActiveLoading; }
    get showError() { return this.state.showError; }
    get activeTimestamp() {
        return this.state.availableTimestamps[this.state.activeTimestampIndex] || null;
    }

    // --- MUTATORS (State Changes + Safe Event Flow) ---

    setShowError(message) {
        this.state.showError = message;
        this.dispatchEvent(new CustomEvent('model:show-error-changed', { detail: message }));

        // Wenn ein Fehler gesetzt wird, starte den Selbstlösch-Timer
        if (message) {
            clearTimeout(this.errorTimer);
            this._errorTimer = setTimeout(() => {
                this.setShowError(null); // Löscht sich selbst und feuert das Event mit null ab
            }, 4000);
        }
    }


    /**
     * Toggles the global "active loading" flag in the model and notifies listeners.
     * This flag represents whether some primary application process is currently
     * loading (e.g. fetching or rendering data). The method updates internal state
     * and dispatches a "model:active-loading-changed" CustomEvent with the new boolean
     * value in its detail.
     *
     * @param {boolean} value - True when active loading is in progress, false otherwise.
     * @returns {void}
     */
    setIsActiveLoading(value) {
        this.state.isActiveLoading = value;
        this.dispatchEvent(new CustomEvent('model:active-loading-changed', { detail: this.state.isActiveLoading }));
    }

    /**
     * Updates GPS locating state and emits UI update event.
     * @param {boolean} value Whether geolocation is currently running.
     * @returns {void}
     */
    setIsLocating(value) {
        this.state.isLocating = value; // <-- KORRIGIERT: Schreibt jetzt korrekt in state.isLocating statt _isLocating
        // Fire event so gpsView knows!
        this.dispatchEvent(new CustomEvent('model:locating-changed', { detail: this.state.isLocating }));
    }

    /**
     * Sets active timestamp index and refreshes dependent interpolation state.
     * @param {number} i Target timestamp index.
     * @returns {void}
     */
    setActiveTimestampIndex(i) {
        const maxIndex = this.state.availableTimestamps.length;
        if (i < 0 || (maxIndex > 0 && i >= maxIndex)) {
            console.warn(`Index ${i} is out of bounds!`);
            return;
        }   

        // 1. Erst den RAM synchronisieren
        this.state.activeTimestampIndex = i;
        if (this.lastClickedLatLng && this.currentClusterData) {
            const interpolation = calculatewindSpeeds(this.lastClickedLatLng, this.currentClusterData, this.activeTimestamp);
            this.state.forecast = interpolation.forecast;
            this.state.windData = interpolation.windData;
        }

        // 2. Fire events in logical order
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated', { detail: i }));
        
        if (this.lastClickedLatLng && this.currentClusterData) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this.state.forecast }));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this.state.windData }));
        }
    }

    /**
     * Applies index metadata and emits timestamp/model events.
     * @param {{available_timestamps?: string[], generated_at?: string, current_hour?: string}} indexData Backend metadata.
     * @returns {void}
     */
    setIndexMetadata(indexData) {
        const sortedTimestamps = (indexData.available_timestamps || []).sort();
        let activeIndex = determineActiveIndex(sortedTimestamps, this.activeTimestamp);

        // 1. First fill RAM completely
        this.state.availableTimestamps = sortedTimestamps;
        this.state.activeTimestampIndex = activeIndex;
        this.state.modelGeneratedAt = indexData.generated_at;
        this.state.modelCurrentHour = indexData.current_hour;

        if (this.lastClickedLatLng && this.currentClusterData) {
            const interpolation = calculatewindSpeeds(this.lastClickedLatLng, this.currentClusterData, this.activeTimestamp);
            this.state.forecast = interpolation.forecast;
            this.state.windData = interpolation.windData;
        }

        // 2. Now fire the events
        this.dispatchEvent(new CustomEvent('model:timestamps-updated', { detail: sortedTimestamps }));
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated', { detail: activeIndex }));
        this.dispatchEvent(new CustomEvent('model:model-metadata-updated'));

        if (this.lastClickedLatLng && this.currentClusterData) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this.state.forecast }));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this.state.windData }));
        }
    }

    /**
     * Sets currently selected map point and computed weather data.
     * @param {{lat:number,lng:number}} latlng Selected location.
     * @param {Object} cluster Cluster payload for interpolation.
     * @returns {void}
     */
    setPointData(latlng, cluster) {
        const interpolation = calculatewindSpeeds(latlng, cluster, this.activeTimestamp);

        // 1. First make RAM completely consistent
        this.state.lastClickedLatLng = latlng;
        this.state.currentClusterData = cluster;
        this.state.forecast = interpolation.forecast;
        this.state.windData = interpolation.windData;

        // 2. Then fire off the events
        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: latlng }));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: interpolation.forecast }));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: interpolation.windData }));
    }

    /**
     * Clears currently selected point data from model state.
     * @returns {void}
     */
    removePointData() {
        this.state.lastClickedLatLng = null;
        this.state.currentClusterData = null;
        this.state.forecast = null;
        this.state.windData = null;

        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: null }));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: null }));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: null }));
    }

    /**
     * Sets the currently active overlay image URL.
     * @param {string|null} url Object URL for current overlay image.
     * @returns {void}
     */
    setActiveOverlayUrl(url) {
        this.state.activeOverlayUrl = url;
        this.dispatchEvent(new CustomEvent('model:overlay-url-updated', { detail: url }));
    }
}

export const weatherModel = new WeatherModel();
