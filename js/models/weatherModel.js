import { calculatewindSpeeds } from '../utils/interpolation.js';
import { determineActiveIndex } from '../utils/time.js';
import { WeatherUi } from './weatherUi.js';

/**
 * @typedef {{lat: number, lng: number}} LatLng
 * @typedef {{speed: number|null, gust: number|null, direction: number|null}} WindData
 * @typedef {{hour: string, wind: number, gust: number, direction: number|null, fullKey: string}} ForecastItem
 
* * @typedef {{
 * latLng: LatLng,
 * clusterData: any
 * }} LocationContext

* * @typedef {{
 * availableTimestamps: string[],
 * modelGeneratedAt: string|null,
 * modelCurrentHour: string|null,
 * lastIndexSync: Date|null,
 * locationContext: LocationContext|null,
 * windData: WindData|null,
 * forecast: ForecastItem[]|null
 * }} DomainState

* * @typedef {{ text: string, event: string }} NotificationAction

* * @typedef {{
 * message: string,
 * isModal?: boolean,
 * action?: NotificationAction
 * }} NotificationPayload
 */

class WeatherModel extends EventTarget {
    constructor() {
        super();
        
        /** @type {DomainState} */
        this._domain = {
            availableTimestamps: [],
            modelGeneratedAt: null,
            modelCurrentHour: null,
            // ISO timestamp of the last successful index sync (e.g. '2026-07-09T12:34:56.789Z')
            lastIndexSync: null,
            locationContext: null,
            windData: null,
            forecast: null
        };

        /** @type {any[]} */
        this._allStations = [];
        /** @type {any[]} */
        this._visibleStations = [];

        /** @type {import('./weatherUi.js').WeatherUi} */
        this._ui = new WeatherUi((eventName, detail) => this.dispatchEvent(new CustomEvent(eventName, { detail })));
    }

    // --- STATIONS API ---
    get allStations() { return this._allStations; }
    get visibleStations() { return this._visibleStations; }

    /**
     * Store the full stations list (from assets) on the model.
     * @param {any[]} stations
     */
    setAllStations(stations) {
        this._allStations = Array.isArray(stations) ? stations : [];
        this.dispatchEvent(new CustomEvent('model:all-stations-updated', { detail: this._allStations }));
    }

    /**
     * Set the currently visible/top stations (e.g. top3) and notify listeners.
     * @param {any[]} stations
     */
    setVisibleStations(stations) {
        this._visibleStations = Array.isArray(stations) ? stations : [];
        this.dispatchEvent(new CustomEvent('model:visible-stations-updated', { detail: this._visibleStations }));
    }

    // --- DOMAIN GETTER ---
    get availableTimestamps() { return this._domain.availableTimestamps; }
    get modelGeneratedAt() { return this._domain.modelGeneratedAt; }
    get modelCurrentHour() { return this._domain.modelCurrentHour; }
    get windData() { return this._domain.windData; }
    get windSpeed() { return this._domain.windData?.speed ?? null; }
    get windDirection() { return this._domain.windData?.direction ?? null; }
    get windGust() { return this._domain.windData?.gust ?? null; }
    get forecast() { return this._domain.forecast; }
    
    get lastClickedLatLng() { return this._domain.locationContext?.latLng ?? null; }
    get currentClusterData() { return this._domain.locationContext?.clusterData ?? null; }

    /**
     * Date of the last time the index was successfully synced from the server (local Date object).
     * @returns {Date|null}
     */
    get lastIndexSync() { return this._domain.lastIndexSync ?? null; }

    /**
     * Set the last index sync timestamp (Date). Pass `null` to clear.
     * @param {Date|null} date
     */
    setLastIndexSync(date) {
        this._domain.lastIndexSync = date;
        this.dispatchEvent(new CustomEvent('model:last-index-sync-updated', { detail: date }));
    }

    // --- UI GETTER ---
    get activeTimestampIndex() { return this._ui.activeTimestampIndex; }
    get activeOverlayUrl() { return this._ui.activeOverlayUrl; }
    get isLocating() { return this._ui.isLocating; }
    get isActiveLoading() { return this._ui.isActiveLoading; }
    get notification() { return this._ui.notification; }
    
    get activeTimestamp() { 
        return this._domain.availableTimestamps[this._ui.activeTimestampIndex] || null; 
    }

    /**
     * @param {number} idx
     * @returns {string|null}
     */
    getTimestamp(idx) {
        return this._domain.availableTimestamps[idx] || null;
    }

    // --- REINE UI MUTATORS ---

    /**
     * Setzt den Fehlerzustand (entweder Text, konfiguriertes Objekt oder null zum Schließen)
     * @param {string | NotificationPayload | null} payload
     */
    setNotification(payload) {
        this._ui.setNotification(payload);
    }

    /**
     * @param {boolean} value
     * @param {boolean} [isModal=false]
     */
    setIsActiveLoading(value, isModal = false) {
        this._ui.setIsActiveLoading(!!value, !!isModal);
    }
    

    /**
     * @param {boolean} value
     */
    setIsLocating(value) {
        this._ui.setIsLocating(value);
    }

    /**
     * @param {string|null} url
     */
    setActiveOverlayUrl(url) {
        this._ui.setActiveOverlayUrl(url);
    }

    // --- DOMAIN / GEMISCHTE MUTATORS ---

    /**
     * Interner Helper, um redundanten Interpolations-Code zu vermeiden
     * @private
     */
    _recalculateInterpolation() {
        if (this._domain.locationContext && this.activeTimestamp) {
            const { latLng, clusterData } = this._domain.locationContext;
            const interpolation = calculatewindSpeeds(latLng, clusterData, this.activeTimestamp);
            this._domain.forecast = interpolation.forecast;
            this._domain.windData = interpolation.windData;
        }
    }

    /**
     * @param {number} i
     */
    setActiveTimestampIndex(i) {
        const maxIndex = this._domain.availableTimestamps.length;
        if (i < 0 || (maxIndex > 0 && i >= maxIndex)) {
            console.warn(`Index ${i} is out of bounds!`);
            return;
        }   

        this._ui.activeTimestampIndex = i;
        this._recalculateInterpolation();

        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated', { detail: i }));
        
        if (this._domain.locationContext) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this._domain.forecast }));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this._domain.windData }));
        }
    }

    /**
     * @param {{available_timestamps?: string[], generated_at?: string, current_hour?: string}} indexData
     */
    setIndexMetadata(indexData) {
        const sortedTimestamps = (indexData.available_timestamps || []).sort();
        let activeIndex = determineActiveIndex(sortedTimestamps, this.activeTimestamp);

        this._domain.availableTimestamps = sortedTimestamps;
        this._ui.activeTimestampIndex = activeIndex;
        this._domain.modelGeneratedAt = indexData.generated_at ?? null;
        this._domain.modelCurrentHour = indexData.current_hour ?? null;

        this._recalculateInterpolation();

        this.dispatchEvent(new CustomEvent('model:timestamps-updated', { detail: sortedTimestamps }));
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated', { detail: activeIndex }));
        this.dispatchEvent(new CustomEvent('model:model-metadata-updated'));

        if (this._domain.locationContext) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this._domain.forecast }));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this._domain.windData }));
        }
    }

    /**
     * @param {LatLng} latlng
     * @param {any} cluster
     */
    setPointData(latlng, cluster) {
        this._domain.locationContext = { latLng: latlng, clusterData: cluster };
        this._recalculateInterpolation();

        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: latlng }));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: this._domain.forecast }));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: this._domain.windData }));
    }

    removePointData() {
        this._domain.locationContext = null;
        this._domain.forecast = null;
        this._domain.windData = null;

        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: null }));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated', { detail: null }));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated', { detail: null }));
    }
}

export const weatherModel = new WeatherModel();