import { MODELS, DEFAULT_MODEL_ID } from '../config.js';
import { d2Model } from './d2Model.js';
import { aromeModel } from './aromeModel.js';
import { logger } from '../utils/logger.js';
import { WeatherModel } from '../models/weatherDomainModel.js';

const adapters = { d2: d2Model, arome: aromeModel };
let activeModelId = DEFAULT_MODEL_ID;

// Static initialization: set active adapter and ensure it exposes a domainModel and config.
try {
    const activeAdapter = adapters[activeModelId];
    if (!activeAdapter) throw new Error('No adapter for default model id: ' + activeModelId);
    // attach declarative config for adapter consumers
    activeAdapter.config = MODELS[activeModelId];
    if (!activeAdapter.domainModel) activeAdapter.domainModel = new WeatherModel();
    logger.info('modelManager: statically initialized active model', activeModelId);
} catch (e) {
    logger.warn('modelManager static init failed', e);
}

const _modelChangeListeners = new Set();

export const modelManager = {
    getActiveModelId() { return activeModelId; },
    getActiveModelConfig() { return MODELS[activeModelId]; },

    setActiveModel(id) {
        if (!adapters[id]) throw new Error('Unknown model id: ' + id);
        activeModelId = id;
        // attach declarative config and ensure domainModel
        adapters[id].config = MODELS[id];
        if (!adapters[id].domainModel) adapters[id].domainModel = new WeatherModel();
        logger.info('Active model set to', id);
        // notify listeners
        for (const cb of _modelChangeListeners) {
            try { cb(id); } catch (e) { logger.warn('modelChange listener error', e); }
        }
    },

    getActiveDomainModel() {
        if (!adapters[activeModelId].domainModel) adapters[activeModelId].domainModel = new WeatherModel();
        return adapters[activeModelId].domainModel;
    },

    get activeDomainModel() { return this.getActiveDomainModel(); },

    /**
     * Return the currently active model adapter (includes `domainModel` singleton).
     */
    getActiveModel() {
        const adapter = adapters[activeModelId];
        if (!adapter) throw new Error('No active model adapter');
        if (!adapter.domainModel) adapter.domainModel = new WeatherModel();
        return adapter;
    },

    onModelChange(cb) {
        _modelChangeListeners.add(cb);
        return () => _modelChangeListeners.delete(cb);
    },

    // no cleanup API exposed; adapters keep any internal state if needed

    // expose adapters registry for debugging/inspection
    _adapters: adapters
};

export default modelManager;
