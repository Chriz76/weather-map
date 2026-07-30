import { determineActiveIndex } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { D2 } from '../weatherProvider/providerIds.js';

/**
 * @typedef {{lat: number, lng: number}} LatLng
 * @typedef {{speed: number|null, gust: number|null, direction: number|null}} WindData
 * @typedef {{hour: string, wind: number, gust: number, direction: number|null, fullKey: string}} ForecastItem
 * @typedef {{
 *   latLng: LatLng
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
 *   specialDataSummary: string|null,
 *   activeTimestampIndex: number
 * }} DomainState
 */

export class WeatherProviderModel extends EventTarget {
    constructor() {
        super();
 
        // --- BOOTSTRAPPING DER PROVIDER-MODELS ---
        this.providerModels = {
            [D2]: {
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
                activeTimestampIndex: 0
            }
        };

        this.activeProviderId = D2;       
    }

    // --- STATE-MANAGEMENT ---
    getActiveProviderId() {
        return this.activeProviderId;
    }

    setActiveProvider(id) {
        if (this.activeProviderId === id || !this.providerModels[id]) return;

        this.activeProviderId = id;
        
        // Informiert alle Views über den Provider-Wechsel
        this.dispatchEvent(new CustomEvent('model:provider-changed', { 
        detail: { providerId: id } 
        }));
    }

    _getActiveModel() {
        return this.providerModels[this.activeProviderId];
    }


    // --- DOMAIN GETTER ---
    get availableTimestamps() { return this._getActiveModel().availableTimestamps; }
    get modelGeneratedAt() { return this._getActiveModel().modelGeneratedAt; }
    get modelCurrentHour() { return this._getActiveModel().modelCurrentHour; }
    get windData() { return this._getActiveModel().windData; }
    get windSpeed() { return this._getActiveModel().windData?.speed ?? null; }
    get windDirection() { return this._getActiveModel().windData?.direction ?? null; }
    get windGust() { return this._getActiveModel().windData?.gust ?? null; }
    get forecast() { return this._getActiveModel().forecast; }
    
    get lastClickedLatLng() { return this._getActiveModel().locationContext?.latLng ?? null; }

    /**
     * Date of the last time the index was successfully synced from the server (local Date object).
     * @returns {Date|null}
     */
    get lastIndexSync() { return this._getActiveModel().lastIndexSync ?? null; }

    /**
     * Set the last index sync timestamp (Date). Pass `null` to clear.
     * @param {Date|null} date
     */
    setLastIndexSync(date) {
        this._getActiveModel().lastIndexSync = date;
        this.dispatchEvent(new CustomEvent('model:last-index-sync-updated'));
    }

    get activeTimestampIndex() { return this._getActiveModel().activeTimestampIndex; }
    get indexLoadError() { return this._getActiveModel().indexLoadError; }
    get overlayLoadError() { return this._getActiveModel().overlayLoadError; }
    get pointDataLoadError() { return this._getActiveModel().pointDataLoadError; }
    get apiMismatchError() { return this._getActiveModel().apiMismatchError; }
    get startupError() { return this._getActiveModel().startupError; }
    // specialDataSummary moved to commonDataModel
    get hasLoadError() {
        return !!(this._getActiveModel().apiMismatchError || this._getActiveModel().startupError || this._getActiveModel().indexLoadError || this._getActiveModel().overlayLoadError || this._getActiveModel().pointDataLoadError);
    }
    get loadErrorMessage() {
        const errors = [];
        if (this._getActiveModel().apiMismatchError) errors.push(this._getActiveModel().apiMismatchError);
        if (this._getActiveModel().startupError) errors.push(this._getActiveModel().startupError);
        if (this._getActiveModel().indexLoadError) errors.push(this._getActiveModel().indexLoadError);
        if (this._getActiveModel().pointDataLoadError) errors.push(this._getActiveModel().pointDataLoadError);
        if (this._getActiveModel().overlayLoadError) errors.push(this._getActiveModel().overlayLoadError);
        return errors.join('\n');
    }
    
    get activeTimestamp() { 
        return this._getActiveModel().availableTimestamps[this._getActiveModel().activeTimestampIndex] || null;
    }

    /**
     * @param {number} idx
     * @returns {string|null}
     */
    getTimestamp(idx) {
        return this._getActiveModel().availableTimestamps[idx] || null;
    }

    // --- REINE UI MUTATORS ---

    /**
     * @param {string|null} message
     */
    setIndexLoadError(message) {
        this._getActiveModel().indexLoadError = message;
        this.dispatchEvent(new CustomEvent('model:index-load-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setOverlayLoadError(message) {
        this._getActiveModel().overlayLoadError = message;
        this.dispatchEvent(new CustomEvent('model:overlay-load-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setPointDataLoadError(message) {
        this._getActiveModel().pointDataLoadError = message;
        this.dispatchEvent(new CustomEvent('model:point-data-load-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setApiMismatchError(message) {
        this._getActiveModel().apiMismatchError = message;
        this.dispatchEvent(new CustomEvent('model:api-mismatch-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    /**
     * @param {string|null} message
     */
    setStartupError(message) {
        this._getActiveModel().startupError = message;
        this.dispatchEvent(new CustomEvent('model:startup-error-changed'));
        this.dispatchEvent(new CustomEvent('model:load-error-changed'));
    }

    // setSpecialDataSummary moved to commonDataModel

    // --- DOMAIN / GEMISCHTE MUTATORS ---

    /**
     * Interner Helper, um redundanten Interpolations-Code zu vermeiden
     * @private
     */
    _setWindDataForActiveTimestamp() {
        // Now only derive windData from an existing forecast for the active timestamp.
        const model = this._getActiveModel();
        if (!model.forecast || !this.activeTimestamp) {
            model.windData = null;
            return;
        }

        const entry = model.forecast.find(e => e.fullKey === this.activeTimestamp) || model.forecast[0];
        model.windData = entry ? { speed: entry.wind, gust: entry.gust, direction: entry.direction } : null;
    }

    /**
     * @param {number} i
     */
    setActiveTimestampIndex(i) {
        const maxIndex = this._getActiveModel().availableTimestamps.length;
        if (i < 0 || (maxIndex > 0 && i >= maxIndex)) {
            logger.warn(`Index ${i} is out of bounds!`);
            return;
        }   

        this._getActiveModel().activeTimestampIndex = i;
        this._setWindDataForActiveTimestamp();

        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated'));
        
        if (this._getActiveModel().locationContext) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
        }
    }

    /**
     * @param {{available_timestamps?: string[], generated_at?: string, current_hour?: string}} indexData
     */
    setIndexMetadata(indexData) {
        const sortedTimestamps = (indexData.available_timestamps || []).sort();
        let activeIndex = determineActiveIndex(sortedTimestamps, this._getActiveModel().activeTimestamp);

        this._getActiveModel().availableTimestamps = sortedTimestamps;
        this._getActiveModel().activeTimestampIndex = activeIndex;
        this._getActiveModel().modelGeneratedAt = indexData.generated_at ?? null;
        this._getActiveModel().modelCurrentHour = indexData.current_hour ?? null;
        this.setIndexLoadError(null);

        this._setWindDataForActiveTimestamp();

        this.dispatchEvent(new CustomEvent('model:timestamps-updated'));
        this.dispatchEvent(new CustomEvent('model:timestamp-index-updated'));
        this.dispatchEvent(new CustomEvent('model:model-metadata-updated'));

        if (this._getActiveModel().locationContext) {
            this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
            this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
        }
    }

    /**
     * @param {LatLng} latlng
     * @param {any} cluster
     */
    setPointData(latlng, forecast) {
        // Store only the click location; do not persist cluster in the model.
        this._getActiveModel().locationContext = { latLng: latlng };
        this.setPointDataLoadError(null);

        // Accept forecast computed by the caller and store it in the model.
        this._getActiveModel().forecast = Array.isArray(forecast) ? forecast : null;

        // Now derive windData only from the stored forecast.
        this._setWindDataForActiveTimestamp();

        this.dispatchEvent(new CustomEvent('model:location-updated'));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
    }

    removePointData() {
        this._getActiveModel().locationContext = null;
        this._getActiveModel().forecast = null;
        this._getActiveModel().windData = null;

        this.dispatchEvent(new CustomEvent('model:location-updated'));
        this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
        this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
    }
}

export const weatherProviderModel = new WeatherProviderModel();