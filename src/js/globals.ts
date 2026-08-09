export {};

declare global {
  interface Window {
    // Leaflet attaches a global `L` namespace when loaded from CDN.
    // Use the library's types when available but allow `L` to be undefined at runtime.
    L?: typeof import('leaflet');
  }
}

if (typeof window !== 'undefined') {
  // If Leaflet wasn't loaded (e.g., during certain test environments), ensure L exists as a safe any.
  if (typeof window.L === 'undefined') {
    (window as any).L = {} as any;
  }
}
