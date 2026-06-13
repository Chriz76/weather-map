/**
 * Modernized WeatherModel extending EventTarget.
 * Now with proper getters so main.js can read the data!
 */
class WeatherModel extends EventTarget {
    constructor() {
        super();
        this.state = {
            availableTimestamps: [],
            activeTimestampIndex: 0,
            lastClickedLatLng: null,
            currentClusterData: null
        };
    }

    // --- 👇 DIESE GETTER HABEN GEFEHLT! 👇 ---
    get availableTimestamps() { return this.state.availableTimestamps; }
    get activeTimestampIndex() { return this.state.activeTimestampIndex; }
    get lastClickedLatLng() { return this.state.lastClickedLatLng; }
    get currentClusterData() { return this.state.currentClusterData; }

    get activeTimestamp() {
        return this.state.availableTimestamps[this.state.activeTimestampIndex] || null;
    }
    // --- 👆 Nun kann main.js die Daten fehlerfrei lesen 👆 ---

    setAvailableTimestamps(arr) {
        this.state.availableTimestamps = arr;
        this.dispatchEvent(new CustomEvent('model:timestamps-updated', { detail: arr }));
        window.dispatchEvent(new CustomEvent('state:timestampsUpdated'));
    }

    setActiveTimestampIndex(i) {
        const maxIndex = this.state.availableTimestamps.length;

        if (i < 0 || (maxIndex > 0 && i >= maxIndex)) {
            console.warn(`Index ${i} is out of bounds!`);
            return;
        }

        this.state.activeTimestampIndex = i;
        this.dispatchEvent(new CustomEvent('model:index-updated', { detail: i }));
        window.dispatchEvent(new CustomEvent('state:activeIndexUpdated', { detail: { index: i } }));
    }

    setLastClickedLatLng(latlng) {
        this.state.lastClickedLatLng = latlng;
        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: latlng }));
    }

    setCurrentClusterData(cluster) {
        this.state.currentClusterData = cluster;
        this.dispatchEvent(new CustomEvent('model:cluster-updated', { detail: cluster }));
    }
}

// Export a single instance
export const weatherModel = new WeatherModel();

// BACKWARD COMPATIBILITY EXPORTS: 
export const state = weatherModel.state;
export function setAvailableTimestamps(arr) { weatherModel.setAvailableTimestamps(arr); }
export function setActiveTimestampIndex(i) { weatherModel.setActiveTimestampIndex(i); }
export function setLastClickedLatLng(latlng) { weatherModel.setLastClickedLatLng(latlng); }
export function setCurrentClusterData(cluster) { weatherModel.setCurrentClusterData(cluster); }