/**
 * App-wide shared model for stations and special-data badge.
 */
export class CommonDataModel extends EventTarget {
    constructor(dispatchEventCallback) {
        super();

        this._allStations = [];
        this._visibleStations = [];
        this._specialDataSummary = null;

        this._dispatchEventCallback = typeof dispatchEventCallback === 'function' ? dispatchEventCallback : null;
    }

    _emit(eventName, detail) {
        const event = new CustomEvent(eventName);
        super.dispatchEvent(event);
        if (this._dispatchEventCallback) this._dispatchEventCallback(eventName, detail);
    }

    // --- STATIONS API ---
    get allStations() { return this._allStations; }
    get visibleStations() { return this._visibleStations; }

    setAllStations(stations) {
        this._allStations = Array.isArray(stations) ? stations : [];
        this._emit('model:all-stations-updated', this._allStations);
    }

    setVisibleStations(stations) {
        this._visibleStations = Array.isArray(stations) ? stations : [];
        this._emit('model:visible-stations-updated', this._visibleStations);
    }

    // --- SPECIAL DATA ---
    get specialDataSummary() { return this._specialDataSummary; }

    setSpecialDataSummary(summary) {
        this._specialDataSummary = summary ?? null;
        this._emit('model:special-data-updated', this._specialDataSummary);
    }
}

export const commonDataModel = new CommonDataModel();
export default commonDataModel;
