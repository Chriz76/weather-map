import L from '../lib/leaflet-wrapper';
import type { Map as LeafletMap } from 'leaflet';

export function registerLegendView(map: LeafletMap): void {
  (L.Control as unknown as { LegendView?: unknown }).LegendView = (L.Control as unknown as { extend: Function }).extend({
    options: { position: 'topleft' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'legend-view');
      L.DomEvent.disableClickPropagation(container);

      container.innerHTML = `
                <div class="legend-view__title">knots</div>
                <div class="legend-view__body">
                    <div class="legend-view__color-bar">
                        <div class="legend-view__swatch w-over-25"></div>
                        <div class="legend-view__swatch w-under-25"></div>
                        <div class="legend-view__swatch w-under-20"></div>
                        <div class="legend-view__swatch w-under-15"></div>
                        <div class="legend-view__swatch w-under-12"></div>
                        <div class="legend-view__swatch w-under-10"></div>
                        <div class="legend-view__swatch w-under-9"></div>
                        <div class="legend-view__swatch w-under-8"></div>
                        <div class="legend-view__swatch w-under-7"></div>
                        <div class="legend-view__swatch w-under-6"></div>
                        <div class="legend-view__swatch w-under-5"></div>
                        <div class="legend-view__swatch w-under-3"></div>
                    </div>

                    <div class="legend-view__labels-column">
                        <div class="legend-view__label-item">+</div>
                        <div class="legend-view__label-item">25</div>
                        <div class="legend-view__label-item">20</div>
                        <div class="legend-view__label-item">15</div>
                        <div class="legend-view__label-item">12</div>
                        <div class="legend-view__label-item">10</div>
                        <div class="legend-view__label-item">9</div>
                        <div class="legend-view__label-item">8</div>
                        <div class="legend-view__label-item">7</div>
                        <div class="legend-view__label-item">6</div>
                        <div class="legend-view__label-item">5</div>
                        <div class="legend-view__label-item">3</div>
                        <div class="legend-view__label-item">0</div>
                    </div>
                </div>
            `;

      return container;
    }
  });

  const createLegendControl = (options?: unknown) => new ((L.Control as unknown as { LegendView: new (o?: unknown) => unknown }).LegendView)(options);
  (map as unknown as Record<string, unknown>)['legendViewControl'] = (createLegendControl() as unknown as { addTo: (m: LeafletMap) => unknown }).addTo(map);
}
