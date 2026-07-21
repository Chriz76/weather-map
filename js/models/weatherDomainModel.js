import { calculatewindSpeeds } from '../utils/interpolation.js';
import { determineActiveIndex } from '../utils/time.js';
import { logger } from '../utils/logger.js';

/**
 * @typedef {{lat: number, lng: number}} LatLng
 * @typedef {{speed: number|null, gust: number|null, direction: number|null}} WindData
 * @typedef {{hour: string, wind: number, gust: number, direction: number|null, fullKey: string}} ForecastItem
 * @typedef {{
 *   latLng: LatLng,
 *   clusterData: any
 * }} LocationContext
 * @typedef {{
 *   availableTimestamps: string[],
 *   modelGeneratedAt: string|null,
 *   modelCurrentHour: string|null,
 *   lastIndexSync: Date|null,
 *   locationContext: LocationContext|null,
 *   windData: WindData|null,
 *   forecast: ForecastItem[]|null,
 *   indexLoadError: string|null,
 *   overlayLoadError: string|null,
 *   pointDataLoadError: string|null,
 *   apiMismatchError: string|null,
 *   startupError: string|null
 * }} DomainState
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
            forecast: null,
            indexLoadError: null,
            overlayLoadError: null,
            pointDataLoadError: null,
            apiMismatchError: null,
            startupError: null
        };

        /** @type {any[]} */
        this._allStations = [];
        /** @type {any[]} */
        this._visibleStations = [];

        this._activeTimestampIndex = 0;
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
        this.dispatchEvent(new CustomEvent('model:all-stations-updated'));
    }

    /**
     * Set the currently visible/top stations (e.g. top3) and notify listeners.
     * @param {any[]} stations
     */
    setVisibleStations(stations) {
        this._visibleStations = Array.isArray(stations) ? stations : [];
        this.dispatchEvent(new CustomEvent('model:visible-stations-updated'));
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
        this.dispatchEvent(new CustomEvent('model:last-index-sync-updated'));
    }

    get activeTimestampIndex() { return this._activeTimestampIndex; }
    get indexLoadError() { return this._domain.indexLoadError; }
    get overlayLoadError() { return this._domain.overlayLoadError; }
    get pointDataLoadError() { return this._domain.pointDataLoadError; }
    get apiMismatchError() { return this._domain.apiMismatchError; }
    get startupError() { return this._domain.startupError; }
    get hasLoadError() {
        return !!(this._domain.apiMismatchError || this._domain.startupError || this._domain.indexLoadError || this._domain.overlayLoadError || this._domain.pointDataLoadError);
    }
    get loadErrorMessage() {
        const errors = [];
        if (this._domain.apiMismatchError) errors.push(this._domain.apiMismatchError);
        if (this._domain.startupError) errors.push(this._domain.startupError);
        if (this._domain.indexLoadError) errors.push(this._domain.indexLoadError);
        if (this._domain.pointDataLoadError) errors.push(this._domain.pointDataLoadError);
        if (this._domain.overlayLoadError) errors.push(this._domain.overlayLoadError);
        return errors.join('\n');
    }
    
    get activeTimestamp() { 
        return this._domain.availableTimestamps[this._activeTimestampIndex] || null; 
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
     * @param {string|null} message
     */
    setIndexLoadError(message) {
        this._domain.indexLoadError = message;
        this.dispatchEvent(new CustomEvent('model:index-load-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setOverlayLoadError(message) {
        this._domain.overlayLoadError = message;
        this.dispatchEvent(new CustomEvent('model:overlay-load-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setPointDataLoadError(message) {
        this._domain.pointDataLoadError = message;
        this.dispatchEvent(new CustomEvent('model:point-data-load-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setApiMismatchError(message) {
        this._domain.apiMismatchError = message;
        this.dispatchEvent(new CustomEvent('model:api-mismatch-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setStartupError(message) {
        this._domain.startupError = message;
        this.dispatchEvent(new CustomEvent('model:startup-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
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
            logger.warn(`Index ${i} is out of bounds!`);
            return;
        }   

        this._activeTimestampIndex = i;
        this._recalculateInterpolation();

        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated'));
        
        if (this._domain.locationContext) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
        }
    }

    /**
     * @param {{available_timestamps?: string[], generated_at?: string, current_hour?: string}} indexData
     */
    setIndexMetadata(indexData) {
        const sortedTimestamps = (indexData.available_timestamps || []).sort();
        let activeIndex = determineActiveIndex(sortedTimestamps, this.activeTimestamp);

        this._domain.availableTimestamps = sortedTimestamps;
        this._activeTimestampIndex = activeIndex;
        this._domain.modelGeneratedAt = indexData.generated_at ?? null;
        this._domain.modelCurrentHour = indexData.current_hour ?? null;
        this.setIndexLoadError(null);

        this._recalculateInterpolation();

        this.dispatchEvent(new CustomEvent('model:timestamps-updated'));
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated'));
        this.dispatchEvent(new CustomEvent('model:model-metadata-updated'));

        if (this._domain.locationContext) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
        }
    }

    /**
     * @param {LatLng} latlng
     * @param {any} cluster
     */
    setPointData(latlng, cluster) {
        this._domain.locationContext = { latLng: latlng, clusterData: cluster };
        this.setPointDataLoadError(null);
        this._recalculateInterpolation();

        this.dispatchEvent(new CustomEvent('model:location-updated'));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
    }

    removePointData() {
        this._domain.locationContext = null;
        this._domain.forecast = null;
        this._domain.windData = null;

        this.dispatchEvent(new CustomEvent('model:location-updated'));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
    }
}

export const weatherModel = new WeatherModel();