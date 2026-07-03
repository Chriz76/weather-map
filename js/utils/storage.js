// --- Internal, fixed definition of key names (Only in this one place!) ---
const KEYS = {
    MAP_STATE: 'ruc_map_state'
};

/**
 * Returns a debounced wrapper around a function.
 * @param {Function} func Function to debounce.
 * @param {number} [delayMs=250] Debounce delay in milliseconds.
 * @returns {Function} Debounced function.
 */
function debounce(func, delayMs = 250) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delayMs);
    };
}

// Basis-Operationen (intern genutzt)
const core = {
    set: (key, val) => { try { localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val)); } catch (e) { console.error(e); } },
    get: (key, fallback, isObj) => { try { const item = localStorage.getItem(key); return item ? (isObj ? JSON.parse(item) : item) : fallback; } catch (e) { return fallback; } },
    remove: (key) => { try { localStorage.removeItem(key); } catch (e) {} }
};

const setDebounced = debounce((key, val) => core.set(key, val), 300);

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
};