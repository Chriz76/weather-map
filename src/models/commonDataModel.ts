import type { Station } from '../types';

export class CommonDataModel extends EventTarget {
    private _allStations: Station[] = [];
    private _visibleStations: Station[] = [];
    private _specialDataSummary: string | null = null;
    private _dispatchEventCallback: ((eventName: string, detail: unknown) => void) | null = null;

    constructor(dispatchEventCallback?: (eventName: string, detail: unknown) => void) {
        super();
        this._dispatchEventCallback = typeof dispatchEventCallback === 'function' ? dispatchEventCallback : null;
    }

    private _emit(eventName: string, detail?: unknown): void {
        const event = new CustomEvent(eventName);
        super.dispatchEvent(event);
        if (this._dispatchEventCallback) this._dispatchEventCallback(eventName, detail);
    }

    get allStations(): Station[] { return this._allStations; }
    get visibleStations(): Station[] { return this._visibleStations; }

    setAllStations(stations: Station[] | unknown): void {
        this._allStations = Array.isArray(stations) ? (stations as Station[]) : [];
        this._emit('model:all-stations-updated', this._allStations);
    }

    setVisibleStations(stations: Station[] | unknown): void {
        this._visibleStations = Array.isArray(stations) ? (stations as Station[]) : [];
        this._emit('model:visible-stations-updated', this._visibleStations);
    }

    get specialDataSummary(): string | null { return this._specialDataSummary; }

    setSpecialDataSummary(summary: string | null): void {
        this._specialDataSummary = summary ?? null;
        this._emit('model:special-data-updated', this._specialDataSummary);
    }
}

export const commonDataModel = new CommonDataModel();
export default commonDataModel;
