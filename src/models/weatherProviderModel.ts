import { determineActiveIndex } from '../utils/time';
import { logger } from '../utils/logger';
import { D2, AROME } from '../weatherProvider/providerIds';
import { calculatewindSpeeds } from '../utils/interpolation';
import type { LatLng, ForecastItem } from '../types';

type ProviderState = {
  availableTimestamps: string[];
  modelGeneratedAt: string | null;
  modelCurrentHour: string | null;
  lastIndexSync: Date | null;
  locationContext: { latLng: LatLng } | null;
  currentClusterData?: unknown | null;
  windData: { speed: number | null; gust: number | null; direction: number | null } | null;
  forecast: ForecastItem[] | null;
  indexLoadError: string | null;
  overlayLoadError: string | null;
  pointDataLoadError: string | null;
  apiMismatchError: string | null;
  startupError: string | null;
  specialDataSummary?: string | null;
  activeTimestampIndex: number;
};

export class WeatherProviderModel extends EventTarget {
  private providerModels: Record<string, ProviderState>;
  private activeProviderId: string;
  private _globalLastClickedLatLng: LatLng | null = null;

  constructor() {
    super();
    this.providerModels = {
      [D2]: {
        availableTimestamps: [],
        modelGeneratedAt: null,
        modelCurrentHour: null,
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
      },
      [AROME]: {
        availableTimestamps: [],
        modelGeneratedAt: null,
        modelCurrentHour: null,
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

    this.activeProviderId = AROME;
  }

  getActiveProviderId(): string { return this.activeProviderId; }

  setActiveProvider(id: string): void {
    if (this.activeProviderId === id || !this.providerModels[id]) return;
    this.activeProviderId = id;
    this.removePointData(false);
    this.dispatchEvent(new CustomEvent('model:provider-changed', { detail: { providerId: id } }));
  }

  private _getActiveModel(): ProviderState { return this.providerModels[this.activeProviderId]!; }

  get availableTimestamps(): string[] { return this._getActiveModel().availableTimestamps; }
  get modelGeneratedAt(): string | null { return this._getActiveModel().modelGeneratedAt; }
  get modelCurrentHour(): string | null { return this._getActiveModel().modelCurrentHour; }
  get windData(): ProviderState['windData'] { return this._getActiveModel().windData; }
  get windSpeed(): number | null { return this._getActiveModel().windData?.speed ?? null; }
  get windDirection(): number | null { return this._getActiveModel().windData?.direction ?? null; }
  get windGust(): number | null { return this._getActiveModel().windData?.gust ?? null; }
  get forecast(): ForecastItem[] | null { return this._getActiveModel().forecast; }
  get currentClusterData(): unknown | null { return this._getActiveModel().currentClusterData ?? null; }
  get lastClickedLatLng(): LatLng | null { return this._globalLastClickedLatLng ?? null; }
  get lastIndexSync(): Date | null { return this._getActiveModel().lastIndexSync ?? null; }

  setLastIndexSync(date: Date | null): void {
    this._getActiveModel().lastIndexSync = date;
    this.dispatchEvent(new CustomEvent('model:last-index-sync-updated'));
  }

  get activeTimestampIndex(): number { return this._getActiveModel().activeTimestampIndex; }
  get indexLoadError(): string | null { return this._getActiveModel().indexLoadError; }
  get overlayLoadError(): string | null { return this._getActiveModel().overlayLoadError; }
  get pointDataLoadError(): string | null { return this._getActiveModel().pointDataLoadError; }
  get apiMismatchError(): string | null { return this._getActiveModel().apiMismatchError; }
  get startupError(): string | null { return this._getActiveModel().startupError; }

  get hasLoadError(): boolean {
    return !!(this._getActiveModel().apiMismatchError || this._getActiveModel().startupError || this._getActiveModel().indexLoadError || this._getActiveModel().overlayLoadError || this._getActiveModel().pointDataLoadError);
  }

  get loadErrorMessage(): string {
    const errors: string[] = [];
    const active = this._getActiveModel();
    if (active.apiMismatchError) errors.push(active.apiMismatchError);
    if (active.startupError) errors.push(active.startupError);
    if (active.indexLoadError) errors.push(active.indexLoadError);
    if (active.pointDataLoadError) errors.push(active.pointDataLoadError);
    if (active.overlayLoadError) errors.push(active.overlayLoadError);
    return errors.join('\n');
  }

  get activeTimestamp(): string | null { return this._getActiveModel().availableTimestamps[this._getActiveModel().activeTimestampIndex] || null; }

  getTimestamp(idx: number): string | null { return this._getActiveModel().availableTimestamps[idx] || null; }

  setIndexLoadError(message: string | null): void {
    this._getActiveModel().indexLoadError = message;
    this.dispatchEvent(new CustomEvent('model:index-load-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setOverlayLoadError(message: string | null): void {
    this._getActiveModel().overlayLoadError = message;
    this.dispatchEvent(new CustomEvent('model:overlay-load-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setPointDataLoadError(message: string | null): void {
    this._getActiveModel().pointDataLoadError = message;
    this.dispatchEvent(new CustomEvent('model:point-data-load-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setApiMismatchError(message: string | null): void {
    this._getActiveModel().apiMismatchError = message;
    this.dispatchEvent(new CustomEvent('model:api-mismatch-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setStartupError(message: string | null): void {
    this._getActiveModel().startupError = message;
    this.dispatchEvent(new CustomEvent('model:startup-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  private _setWindDataForActiveTimestamp(): void {
    const model = this._getActiveModel();
    if (!model.forecast || !this.activeTimestamp) {
      model.windData = null;
      return;
    }

    const entry = model.forecast.find(e => e.fullKey === this.activeTimestamp) || model.forecast[0];
    model.windData = entry ? { speed: entry.wind, gust: entry.gust, direction: entry.direction ?? null } : null;
  }

  setActiveTimestampIndex(i: number): void {
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

  setIndexMetadata(indexData: import('../types').IndexData, prevActiveTimestamp: string | null = null): void {
    const sortedTimestamps = (indexData.available_timestamps || []).sort();
    const reference = prevActiveTimestamp || this.activeTimestamp;
    const activeIndex = determineActiveIndex(sortedTimestamps, reference);

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

  setPointData(latlng: LatLng, forecast: import('../types').ForecastItem[] | unknown | null): void {
    this._getActiveModel().locationContext = { latLng: latlng };
    this._globalLastClickedLatLng = latlng;
    this.setPointDataLoadError(null);

    // Support passing either a precomputed ForecastItem[] or a raw cluster structure
    if (Array.isArray(forecast)) {
      this._getActiveModel().forecast = forecast as ForecastItem[];
      this._getActiveModel().currentClusterData = null;
    } else if (forecast && typeof forecast === 'object') {
      // store raw cluster for callers/tests that rely on it
      this._getActiveModel().currentClusterData = forecast as unknown;
      // attempt to compute forecast from cluster if possible
      try {
        const computed = calculatewindSpeeds(latlng as LatLng, forecast as unknown as import('../types').Cluster) as ForecastItem[] | null;
        this._getActiveModel().forecast = Array.isArray(computed) ? computed : null;
      } catch (e) {
        this._getActiveModel().forecast = null;
      }
    } else {
      this._getActiveModel().forecast = null;
      this._getActiveModel().currentClusterData = null;
    }

    this._setWindDataForActiveTimestamp();
    this.dispatchEvent(new CustomEvent('model:location-updated'));
    this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
    this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
  }

  removePointData(resetGlobalLastClickedLatLng = true): void {
    if (resetGlobalLastClickedLatLng) this._globalLastClickedLatLng = null;
    this._getActiveModel().locationContext = null;
    this._getActiveModel().forecast = null;
    this._getActiveModel().currentClusterData = null;
    this._getActiveModel().windData = null;
    this.dispatchEvent(new CustomEvent('model:location-updated'));
    this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
    this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
  }

  get specialDataSummary(): string | null { return this._getActiveModel().specialDataSummary ?? null; }
  setSpecialDataSummary(value: string | null): void {
    this._getActiveModel().specialDataSummary = value;
    this.dispatchEvent(new CustomEvent('model:special-data-summary-changed'));
  }
}

export const weatherProviderModel = new WeatherProviderModel();
