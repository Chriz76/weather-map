import { logger } from './logger';

const KEYS = {
    MAP_STATE: 'ruc_map_state',
    WIND_MEASUREMENTS: 'ruc_wind_measurements',
    ACTIVE_PROVIDER: 'ruc_active_provider'
} as const;

function debounce<T extends (...args: any[]) => void>(func: T, delayMs = 250) {
    let timeoutId: number | null = null;
    return (...args: Parameters<T>) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(() => func(...args), delayMs);
    };
}

const core = {
    set(key: string, val: unknown) { try { localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val)); } catch (e) { logger.error(e); } },
    get(key: string, fallback: unknown, isObj?: boolean): unknown { try { const item = localStorage.getItem(key); return item ? (isObj ? JSON.parse(item) : item) : fallback; } catch (e) { return fallback; } },
    remove(key: string) { try { localStorage.removeItem(key); } catch (e) {} }
};

function setStorageValue(key: string, val: unknown) {
    core.set(key, val);
}

const setDebounced = debounce(setStorageValue, 300);

export const storage = {
    saveMapState(state: { lat: number; lng: number; zoom: number }) {
        setDebounced(KEYS.MAP_STATE, state);
    },
    getMapState(fallback: { lat: number; lng: number; zoom: number }) {
        return core.get(KEYS.MAP_STATE, fallback, true) as { lat: number; lng: number; zoom: number };
    },
    saveWindMeasurements(value: boolean) {
        core.set(KEYS.WIND_MEASUREMENTS, !!value);
    },
    getWindMeasurements(fallback = true) {
        const value = core.get(KEYS.WIND_MEASUREMENTS, fallback, false);
        if (value === 'true') return true;
        if (value === 'false') return false;
        return !!fallback;
    },
    saveActiveProvider(providerId: string | null) {
        core.set(KEYS.ACTIVE_PROVIDER, providerId === null ? '' : String(providerId));
    },
    getActiveProvider(fallback: string) {
        const val = core.get(KEYS.ACTIVE_PROVIDER, '', false);
        return val && typeof val === 'string' && val.length > 0 ? val : fallback;
    }
};
