import { calculatewindSpeeds } from '../utils/interpolation.js';
import { determineActiveIndex } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import eventProxy from '../weatherModels/eventProxy.js';

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
 *   startupError: string|null,
 *   specialDataSummary: string|null
 * }} DomainState
 */

export class WeatherModel {
    constructor() {
        
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
            startupError: null,
            specialDataSummary: null
        };

        // station-related state moved to appModel

        this._activeTimestampIndex = 0;
    }

    // station state moved to appModel

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
        eventProxy.dispatchEvent(new CustomEvent('model:last-index-sync-updated'));
    }

    get activeTimestampIndex() { return this._activeTimestampIndex; }
    get indexLoadError() { return this._domain.indexLoadError; }
    get overlayLoadError() { return this._domain.overlayLoadError; }
    get pointDataLoadError() { return this._domain.pointDataLoadError; }
    get apiMismatchError() { return this._domain.apiMismatchError; }
    get startupError() { return this._domain.startupError; }
    // specialDataSummary moved to appModel
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
        eventProxy.dispatchEvent(new CustomEvent('model:index-load-error-changed'));
        eventProxy.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setOverlayLoadError(message) {
        this._domain.overlayLoadError = message;
        eventProxy.dispatchEvent(new CustomEvent('model:overlay-load-error-changed'));
        eventProxy.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setPointDataLoadError(message) {
        this._domain.pointDataLoadError = message;
        eventProxy.dispatchEvent(new CustomEvent('model:point-data-load-error-changed'));
        eventProxy.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setApiMismatchError(message) {
        this._domain.apiMismatchError = message;
        eventProxy.dispatchEvent(new CustomEvent('model:api-mismatch-error-changed'));
        eventProxy.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setStartupError(message) {
        this._domain.startupError = message;
        eventProxy.dispatchEvent(new CustomEvent('model:startup-error-changed'));
        eventProxy.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    // setSpecialDataSummary moved to appModel

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

        eventProxy.dispatchEvent(new CustomEvent('model:timestamp-index-updated'));
        
        if (this._domain.locationContext) {
            eventProxy.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
            eventProxy.dispatchEvent(new CustomEvent('model:windspeed-updated'));
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

        eventProxy.dispatchEvent(new CustomEvent('model:timestamps-updated'));
        eventProxy.dispatchEvent(new CustomEvent('model:timestamp-index-updated'));
        eventProxy.dispatchEvent(new CustomEvent('model:model-metadata-updated'));

        if (this._domain.locationContext) {
            eventProxy.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
            eventProxy.dispatchEvent(new CustomEvent('model:windspeed-updated'));
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

        eventProxy.dispatchEvent(new CustomEvent('model:location-updated'));
        eventProxy.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
        eventProxy.dispatchEvent(new CustomEvent('model:windspeed-updated'));
    }

    removePointData() {
        this._domain.locationContext = null;
        this._domain.forecast = null;
        this._domain.windData = null;

        eventProxy.dispatchEvent(new CustomEvent('model:location-updated'));
        eventProxy.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
        eventProxy.dispatchEvent(new CustomEvent('model:windspeed-updated'));
    }
}

export const weatherModel = new WeatherModel();