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
 * locationContext: LocationContext|null,
 * windData: WindData|null,
 * forecast: ForecastItem[]|null
 * }} DomainState

* * @typedef {{ text: string, event: string }} NotificationAction

* * @typedef {{
 * message: string,
 * isModal?: boolean,
 * action?: NotificationAction
 * }} ErrorPayload
 */

class WeatherModel extends EventTarget {
    constructor() {
        super();
        
        /** @type {DomainState} */
        this._domain = {
            availableTimestamps: [],
            modelGeneratedAt: null,
            modelCurrentHour: null,
            locationContext: null,
            windData: null,
            forecast: null
        };

        /** @type {import('./weatherUi.js').WeatherUi} */
        this._ui = new WeatherUi((eventName, detail) => this.dispatchEvent(new CustomEvent(eventName, { detail })));
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
     * @param {string | ErrorPayload | null} payload
     */
    setNotification(payload) {
        this._ui.setNotification(payload);
    }

    /**
     * @param {boolean} value
     */
    setIsActiveLoading(value) {
        this._ui.setIsActiveLoading(value);
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