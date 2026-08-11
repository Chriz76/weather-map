import { determineActiveIndex } from '../utils/time';
import { logger } from '../utils/logger';
import { D2, AROME } from '../weatherProvider/providerIds';
import type { LatLng, ForecastItem } from '../../types';

type ProviderState = {
  availableTimestamps: string[];
  modelGeneratedAt: string | null;
  modelCurrentHour: string | null;
  lastIndexSync: Date | null;
  locationContext: { latLng: LatLng } | null;
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

  getActiveProviderId() { return this.activeProviderId; }

  setActiveProvider(id: string) {
    if (this.activeProviderId === id || !this.providerModels[id]) return;
    this.activeProviderId = id;
    this.removePointData(false);
    this.dispatchEvent(new CustomEvent('model:provider-changed', { detail: { providerId: id } }));
  }

  private _getActiveModel() { return this.providerModels[this.activeProviderId]; }

  get availableTimestamps() { return this._getActiveModel().availableTimestamps; }
  get modelGeneratedAt() { return this._getActiveModel().modelGeneratedAt; }
  get modelCurrentHour() { return this._getActiveModel().modelCurrentHour; }
  get windData() { return this._getActiveModel().windData; }
  get windSpeed() { return this._getActiveModel().windData?.speed ?? null; }
  get windDirection() { return this._getActiveModel().windData?.direction ?? null; }
  get windGust() { return this._getActiveModel().windData?.gust ?? null; }
  get forecast() { return this._getActiveModel().forecast; }
  get lastClickedLatLng() { return this._globalLastClickedLatLng ?? null; }
  get lastIndexSync() { return this._getActiveModel().lastIndexSync ?? null; }

  setLastIndexSync(date: Date | null) {
    this._getActiveModel().lastIndexSync = date;
    this.dispatchEvent(new CustomEvent('model:last-index-sync-updated'));
  }

  get activeTimestampIndex() { return this._getActiveModel().activeTimestampIndex; }
  get indexLoadError() { return this._getActiveModel().indexLoadError; }
  get overlayLoadError() { return this._getActiveModel().overlayLoadError; }
  get pointDataLoadError() { return this._getActiveModel().pointDataLoadError; }
  get apiMismatchError() { return this._getActiveModel().apiMismatchError; }
  get startupError() { return this._getActiveModel().startupError; }

  get hasLoadError() {
    return !!(this._getActiveModel().apiMismatchError || this._getActiveModel().startupError || this._getActiveModel().indexLoadError || this._getActiveModel().overlayLoadError || this._getActiveModel().pointDataLoadError);
  }

  get loadErrorMessage() {
    const errors: string[] = [];
    const active = this._getActiveModel();
    if (active.apiMismatchError) errors.push(active.apiMismatchError);
    if (active.startupError) errors.push(active.startupError);
    if (active.indexLoadError) errors.push(active.indexLoadError);
    if (active.pointDataLoadError) errors.push(active.pointDataLoadError);
    if (active.overlayLoadError) errors.push(active.overlayLoadError);
    return errors.join('\n');
  }

  get activeTimestamp() { return this._getActiveModel().availableTimestamps[this._getActiveModel().activeTimestampIndex] || null; }

  getTimestamp(idx: number) { return this._getActiveModel().availableTimestamps[idx] || null; }

  setIndexLoadError(message: string | null) {
    this._getActiveModel().indexLoadError = message;
    this.dispatchEvent(new CustomEvent('model:index-load-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setOverlayLoadError(message: string | null) {
    this._getActiveModel().overlayLoadError = message;
    this.dispatchEvent(new CustomEvent('model:overlay-load-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setPointDataLoadError(message: string | null) {
    this._getActiveModel().pointDataLoadError = message;
    this.dispatchEvent(new CustomEvent('model:point-data-load-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setApiMismatchError(message: string | null) {
    this._getActiveModel().apiMismatchError = message;
    this.dispatchEvent(new CustomEvent('model:api-mismatch-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  setStartupError(message: string | null) {
    this._getActiveModel().startupError = message;
    this.dispatchEvent(new CustomEvent('model:startup-error-changed'));
    this.dispatchEvent(new CustomEvent('model:load-error-changed'));
  }

  private _setWindDataForActiveTimestamp() {
    const model = this._getActiveModel();
    if (!model.forecast || !this.activeTimestamp) {
      model.windData = null;
      return;
    }

    const entry = model.forecast.find(e => e.fullKey === this.activeTimestamp) || model.forecast[0];
    model.windData = entry ? { speed: entry.wind, gust: entry.gust, direction: entry.direction ?? null } : null;
  }

  setActiveTimestampIndex(i: number) {
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

  setIndexMetadata(indexData: any, prevActiveTimestamp: string | null = null) {
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

  setPointData(latlng: LatLng, forecast: any) {
    this._getActiveModel().locationContext = { latLng: latlng };
    this._globalLastClickedLatLng = latlng;
    this.setPointDataLoadError(null);
    this._getActiveModel().forecast = Array.isArray(forecast) ? forecast : null;
    this._setWindDataForActiveTimestamp();
    this.dispatchEvent(new CustomEvent('model:location-updated'));
    this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
    this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
  }

  removePointData(resetGlobalLastClickedLatLng = true) {
    if (resetGlobalLastClickedLatLng) this._globalLastClickedLatLng = null;
    this._getActiveModel().locationContext = null;
    this._getActiveModel().forecast = null;
    this._getActiveModel().windData = null;
    this.dispatchEvent(new CustomEvent('model:location-updated'));
    this.dispatchEvent(new CustomEvent('model:forecast-data-updated'));
    this.dispatchEvent(new CustomEvent('model:windspeed-updated'));
  }
}

export const weatherProviderModel = new WeatherProviderModel();
