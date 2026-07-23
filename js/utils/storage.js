// --- Internal, fixed definition of key names (Only in this one place!) ---
const KEYS = {
    MAP_STATE: 'ruc_map_state',
    WIND_MEASUREMENTS: 'ruc_wind_measurements'
};

/**
 * Returns a debounced wrapper around a function.
 * @param {Function} func Function to debounce.
 * @param {number} [delayMs=250] Debounce delay in milliseconds.
 * @returns {Function} Debounced function.
 */
function debounce(func, delayMs = 250) {
    /** @type {number|null} */
    let timeoutId = null;
    /**
     * @param {...any} args
     */
    return (...args) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => func(...args), delayMs);
    };
}

// Basis-Operationen (intern genutzt)
import { logger } from './logger.js';

const core = {
    /**
     * @param {string} key
     * @param {any} val
     */
    set(key, val) { try { localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val)); } catch (e) { logger.error(e); } },
    /**
     * @param {string} key
     * @param {any} fallback
     * @param {boolean} isObj
     * @returns {any}
     */
    get(key, fallback, isObj) { try { const item = localStorage.getItem(key); return item ? (isObj ? JSON.parse(item) : item) : fallback; } catch (e) { return fallback; } },
    /**
     * @param {string} key
     */
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

/**
 * @param {string} key
 * @param {any} val
 */
function setStorageValue(key, val) {
    core.set(key, val);
}

const setDebounced = debounce(setStorageValue, 300);

// --- The exported interface for your app ---
export const storage = {
    /**
     * Saves current map state to local storage with debounce.
     * @param {{lat:number,lng:number,zoom:number}} state Map center and zoom.
     * @returns {void}
     */
    saveMapState(state) {
        setDebounced(KEYS.MAP_STATE, state);
    },
    /**
     * Loads persisted map state or a fallback value.
     * @param {{lat:number,lng:number,zoom:number}} fallback Default state.
     * @returns {{lat:number,lng:number,zoom:number}} Stored or fallback map state.
     */
    getMapState(fallback) {
        return core.get(KEYS.MAP_STATE, fallback, true);
    },
    /**
     * Persists the wind measurement visibility preference.
     * @param {boolean} value
     * @returns {void}
     */
    saveWindMeasurements(value) {
        core.set(KEYS.WIND_MEASUREMENTS, !!value);
    },
    /**
     * Loads persisted wind measurement visibility or a fallback value.
     * @param {boolean} fallback
     * @returns {boolean}
     */
    getWindMeasurements(fallback = true) {
        const value = core.get(KEYS.WIND_MEASUREMENTS, fallback, false);
        if (value === 'true') return true;
        if (value === 'false') return false;
        return !!fallback;
    },
};