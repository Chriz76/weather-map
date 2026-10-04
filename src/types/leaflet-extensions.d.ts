import 'leaflet';

declare global {
  interface Window {
    L?: typeof import('leaflet');
    // Enables verbose logger.debug output when set to `true` before app start.
    WEATHER_DEBUG?: boolean;
  }
}

declare module 'leaflet' {
  /**
   * The app attaches its registered controls to the map instance at runtime (see the
   * `register*View` functions in src/views/). Declaring them here keeps those assignments
   * type-safe instead of falling back to `map as unknown as Record<string, unknown>`.
   */
  interface Map {
    forecastViewControl?: Control;
    legendViewControl?: Control;
    logoViewControl?: Control;
    timelineViewControl?: Control;
  }

  /**
   * App-specific control factory added at runtime by src/views/forecastView.ts.
   * Leaflet's own factories (zoom, attribution, layers, scale) live in the same namespace.
   */
  namespace control {
    function forecastView(options?: ControlOptions): Control;
  }
}

