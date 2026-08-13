import 'leaflet';

declare global {
  interface Window {
    L?: typeof import('leaflet');
  }
}

declare module 'leaflet' {
  // Allow dynamic properties on Control and control factory to support runtime-extended controls
  interface Control {
    [key: string]: any;
  }

  // Cast control namespace to accept dynamic entries like forecastView
  // Provide a loose-typed control namespace to allow runtime-extended controls
  export const control: any;
}

