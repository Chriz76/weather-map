import { calculatewindSpeeds } from './utils/interpolation.js';
import { determineActiveIndex } from './utils/time.js';

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
            windSpeed: null, 
            activeOverlayUrl: null,  
            forecast: null       
        };
    }

    // --- GETTER (Read-Only State Access) ---
    get availableTimestamps() { return this.state.availableTimestamps; }
    get activeTimestampIndex() { return this.state.activeTimestampIndex; }
    get lastClickedLatLng() { return this.state.lastClickedLatLng; }
    get currentClusterData() { return this.state.currentClusterData; }
    get modelGeneratedAt() { return this.state.modelGeneratedAt; }
    get modelCurrentHour() { return this.state.modelCurrentHour; }
    get windSpeed() { return this.state.windSpeed; }
    get activeOverlayUrl() { return this.state.activeOverlayUrl; }
    get forecast() { return this.state.forecast; }

    get activeTimestamp() {
        return this.state.availableTimestamps[this.state.activeTimestampIndex] || null;
    }

    // --- MUTATORS (State Changes + Safe Event Flow) ---

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
            this.state.windSpeed = interpolation.windSpeed;
        }

        // 2. Events in logischer Reihenfolge feuern
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated', { detail: i }));
        
        if (this.lastClickedLatLng && this.currentClusterData) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this.state.forecast }));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this.state.windSpeed }));            
        }
    }

    setIndexMetadata(indexData) {
        const sortedTimestamps = (indexData.available_timestamps || []).sort();
        let activeIndex = determineActiveIndex(sortedTimestamps, this.activeTimestamp);

        // 1. Erst den RAM komplett befüllen
        this.state.availableTimestamps = sortedTimestamps;
        this.state.activeTimestampIndex = activeIndex;
        this.state.modelGeneratedAt = indexData.generated_at;
        this.state.modelCurrentHour = indexData.current_hour;

        if (this.lastClickedLatLng && this.currentClusterData) {
            const interpolation = calculatewindSpeeds(this.lastClickedLatLng, this.currentClusterData, this.activeTimestamp);
            this.state.forecast = interpolation.forecast;
            this.state.windSpeed = interpolation.windSpeed;
        }

        // 2. Jetzt die Events feuern
        this.dispatchEvent(new CustomEvent('model:timestamps-updated', { detail: sortedTimestamps }));
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated', { detail: activeIndex }));
        this.dispatchEvent(new CustomEvent('model:model-metadata-updated'));

        if (this.lastClickedLatLng && this.currentClusterData) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this.state.forecast }));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this.state.windSpeed }));            
        }
    }

    setPointData(latlng, cluster) {
        const interpolation = calculatewindSpeeds(latlng, cluster, this.activeTimestamp);

        // 1. Erst den RAM komplett konsistent machen
        this.state.lastClickedLatLng = latlng;
        this.state.currentClusterData = cluster;
        this.state.forecast = interpolation.forecast;
        this.state.windSpeed = interpolation.windSpeed;

        // 2. Dann die Events abfeuern
        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: latlng }));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: interpolation.forecast }));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: interpolation.windSpeed }));
    }

    removePointData() {
        this.state.lastClickedLatLng = null;
        this.state.currentClusterData = null;
        this.state.forecast = null;
        this.state.windSpeed = null;

        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: null }));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: null }));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: null }));
    }

    setActiveOverlayUrl(url) {
        this.state.activeOverlayUrl = url;
        this.dispatchEvent(new CustomEvent('model:overlay-url-updated', { detail: url }));
    }
}

export const weatherModel = new WeatherModel();