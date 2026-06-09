export const state = {
  availableTimestamps: [],
  activeTimestampIndex: 0,
  lastClickedLatLng: null,
  currentClusterData: null
};

export function setAvailableTimestamps(arr) {
  state.availableTimestamps = arr;
  window.dispatchEvent(new CustomEvent('state:timestampsUpdated'));
}

export function setActiveTimestampIndex(i) {
  state.activeTimestampIndex = i;
  window.dispatchEvent(new CustomEvent('state:activeIndexUpdated', { detail: { index: i } }));
}

export function setLastClickedLatLng(latlng) {
  state.lastClickedLatLng = latlng;
}

export function setCurrentClusterData(cluster) {
  state.currentClusterData = cluster;
}
