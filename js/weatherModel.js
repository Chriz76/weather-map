/**
 * Modernized WeatherModel extending EventTarget.
 * It keeps your original functions intact so main.js won't break,
 * but adds the missing events and localizes the event system.
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

    setAvailableTimestamps(arr) {
        this.state.availableTimestamps = arr;
        // 1. We dispatch locally from the model instead of global window
        this.dispatchEvent(new CustomEvent('model:timestamps-updated', { detail: arr }));

        // BACKWARD COMPATIBILITY: Keeps your old views running for now
        window.dispatchEvent(new CustomEvent('state:timestampsUpdated'));
    }

    setActiveTimestampIndex(i) {
        const maxIndex = this.state.availableTimestamps.length;

        // 1. Sicherheits-Check: Ist der Index überhaupt im erlaubten Bereich?
        if (i < 0 || (maxIndex > 0 && i >= maxIndex)) {
            console.warn(`Index ${i} is out of bounds!`);
            return; // Wir brechen sofort ab, bevor Schaden entsteht
        }

        // 2. Wenn alles okay ist, schreiben wir den State und feuern die Events
        this.state.activeTimestampIndex = i;
        this.dispatchEvent(new CustomEvent('model:index-updated', { detail: i }));
        window.dispatchEvent(new CustomEvent('state:activeIndexUpdated', { detail: { index: i } }));
    }

    setLastClickedLatLng(latlng) {
        this.state.lastClickedLatLng = latlng;
        // NEW: Now the app can react when a location is updated!
        this.dispatchEvent(new CustomEvent('model:location-updated', { detail: latlng }));
    }

    setCurrentClusterData(cluster) {
        this.state.currentClusterData = cluster;
        // NEW: Now the forecast table knows instantly when fresh cluster data arrived
        this.dispatchEvent(new CustomEvent('model:cluster-updated', { detail: cluster }));
    }
}

// Export a single instance
export const weatherModel = new WeatherModel();

// BACKWARD COMPATIBILITY EXPORTS: 
// This allows your main.js to use the model immediately without changing a single line of code yet!
export const state = weatherModel.state;
export function setAvailableTimestamps(arr) { weatherModel.setAvailableTimestamps(arr); }
export function setActiveTimestampIndex(i) { weatherModel.setActiveTimestampIndex(i); }
export function setLastClickedLatLng(latlng) { weatherModel.setLastClickedLatLng(latlng); }
export function setCurrentClusterData(cluster) { weatherModel.setCurrentClusterData(cluster); }