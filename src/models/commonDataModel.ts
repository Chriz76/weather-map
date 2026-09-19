import type { Station } from '../types';

export class CommonDataModel extends EventTarget {
    private _allStations: Station[] = [];
    private _visibleStations: Station[] = [];
    private _specialDataSummary: string | null = null;
    constructor() {
        super();
    }

    private _emit(eventName: string): void {
        const event = new CustomEvent(eventName);
        super.dispatchEvent(event);
    }

    get allStations(): Station[] { return this._allStations; }
    get visibleStations(): Station[] { return this._visibleStations; }

    setAllStations(stations: Station[] | unknown): void {
        this._allStations = Array.isArray(stations) ? (stations as Station[]) : [];
        this._emit('model:all-stations-updated');
    }

    setVisibleStations(stations: Station[] | unknown): void {
        this._visibleStations = Array.isArray(stations) ? (stations as Station[]) : [];
        this._emit('model:visible-stations-updated');
    }

    get specialDataSummary(): string | null { return this._specialDataSummary; }    

    setSpecialDataSummary(summary: string | null): void {
        this._specialDataSummary = summary ?? null;
        this._emit('model:special-data-updated');
    }
}

export const commonDataModel = new CommonDataModel();
export default commonDataModel;
