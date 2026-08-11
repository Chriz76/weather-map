import type { Station } from '../types';

export class CommonDataModel extends EventTarget {
    private _allStations: Station[] = [];
    private _visibleStations: Station[] = [];
    private _specialDataSummary: string | null = null;
    private _dispatchEventCallback: ((eventName: string, detail: any) => void) | null = null;

    constructor(dispatchEventCallback?: (eventName: string, detail: any) => void) {
        super();
        this._dispatchEventCallback = typeof dispatchEventCallback === 'function' ? dispatchEventCallback : null;
    }

    private _emit(eventName: string, detail?: any) {
        const event = new CustomEvent(eventName);
        super.dispatchEvent(event);
        if (this._dispatchEventCallback) this._dispatchEventCallback(eventName, detail);
    }

    get allStations() { return this._allStations; }
    get visibleStations() { return this._visibleStations; }

    setAllStations(stations: Station[] | any) {
        this._allStations = Array.isArray(stations) ? stations : [];
        this._emit('model:all-stations-updated', this._allStations);
    }

    setVisibleStations(stations: Station[] | any) {
        this._visibleStations = Array.isArray(stations) ? stations : [];
        this._emit('model:visible-stations-updated', this._visibleStations);
    }

    get specialDataSummary() { return this._specialDataSummary; }

    setSpecialDataSummary(summary: string | null) {
        this._specialDataSummary = summary ?? null;
        this._emit('model:special-data-updated', this._specialDataSummary);
    }
}

export const commonDataModel = new CommonDataModel();
export default commonDataModel;
