// --- Interne, feste Definition der Key-Namen (Nur an dieser einen Stelle!) ---
const KEYS = {
    MAP_STATE: 'ruc_map_state'
};

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

// --- Das exportierte Interface für deine App ---
export const storage = {
    saveMapState(state) {
        setDebounced(KEYS.MAP_STATE, state);
    },
    getMapState(fallback) {
        return core.get(KEYS.MAP_STATE, fallback, true);
    },
};