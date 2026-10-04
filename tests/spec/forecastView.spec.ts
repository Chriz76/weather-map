/**
 * TODO: minimal smoke test for src/views/forecastView.ts, added alongside the class-based
 * rewrite of the forecast control. Extend with real rendering/interaction coverage
 * (row contents, active-column highlighting) when a stable test seam exists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { controlNamespace } = vi.hoisted(() => ({
  controlNamespace: {} as Record<string, unknown>
}));

vi.mock('leaflet', () => {
  class Control {
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
    }

    // Mirrors Leaflet's Control.addTo(), which invokes onAdd() and mounts the returned element.
    addTo(map: Record<string, unknown>): this {
      const element = (this as unknown as { onAdd?: () => HTMLElement }).onAdd?.();
      if (element) {
        document.body.appendChild(element);
        map['forecastViewControlElement'] = element;
      }
      return this;
    }
  }

  return {
    Control,
    control: controlNamespace,
    DomUtil: {
      create: (tagName: string, className: string): HTMLElement => {
        const element = document.createElement(tagName);
        element.className = className;
        return element;
      }
    },
    DomEvent: {
      disableClickPropagation: vi.fn(),
      stop: vi.fn()
    }
  };
});

describe('forecast view', () => {
  beforeEach(() => {
    delete controlNamespace['forecastView'];
    document.body.innerHTML = '';
  });

  it('registers the L.control.forecastView factory and mounts the control', async () => {
    const { registerForecastView } = await import('../../src/views/forecastView');
    const map = {} as Record<string, unknown>;

    registerForecastView(map as never);

    expect(typeof controlNamespace['forecastView']).toBe('function');
    expect(map['forecastViewControl']).toBeDefined();

    const container = document.querySelector('.forecast-view');
    expect(container).toBeTruthy();
    expect(container?.querySelector('.forecast-view__row-header')).toBeTruthy();
    expect(container?.querySelector('.forecast-view__row-values')).toBeTruthy();
    expect(container?.querySelector('.forecast-view__row-gusts')).toBeTruthy();
    expect(container?.querySelector('.forecast-view__row-direction')).toBeTruthy();
  });
});
