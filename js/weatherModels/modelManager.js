import { MODELS, getDefaultModelId } from '../config.js';
import { d2Model } from './d2Model.js';
import { aromeModel } from './aromeModel.js';
import { logger } from '../utils/logger.js';
import { WeatherModel } from '../models/weatherDomainModel.js';

const adapters = { d2: d2Model, arome: aromeModel };
let activeModelId = getDefaultModelId();

const _modelChangeListeners = new Set();

export const modelManager = {
    getActiveModelId() { return activeModelId; },
    getActiveModelConfig() { return MODELS[activeModelId]; },

    async setActiveModel(id) {
        if (!adapters[id]) throw new Error('Unknown model id: ' + id);
        activeModelId = id;
        // ensure adapter initialized
        await adapters[id].init(MODELS[id]);
        // attach a singleton domainModel to the adapter if not present
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
