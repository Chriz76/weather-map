import { formatToDateTime, addMinutesToIso, formatToTime } from '../utils/time';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { logger } from '../utils/logger';

import type { Map as LeafletMap } from 'leaflet';

export function registerModelInfoView(map: LeafletMap): void {
  const infoEl = document.querySelector('.model-info') as HTMLElement | null;
  if (!infoEl) return;

  if (infoEl.innerText === '--' || !infoEl.innerText) infoEl.innerText = 'Model run: Loading...';
  if (!infoEl.hasAttribute('tabindex')) infoEl.setAttribute('tabindex', '0');

  function dispatchModelInfoClicked() { window.dispatchEvent(new CustomEvent('ui:model-info-clicked')); }

  infoEl.addEventListener('click', (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); dispatchModelInfoClicked(); });
  infoEl.addEventListener('keydown', (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); dispatchModelInfoClicked(); } });

  weatherProviderModel.addEventListener('model:model-metadata-updated', () => {
    try {
      let displayStr = '';

      if (weatherProviderModel.modelGeneratedAt) {
        displayStr += `Updated ${formatToDateTime(weatherProviderModel.modelGeneratedAt)} `;
      }

      if (weatherProviderModel.modelGeneratedAt) {
        const nextDate = addMinutesToIso(weatherProviderModel.modelGeneratedAt, 65);
        if (nextDate) displayStr += ` | Next ~${formatToTime(nextDate)}`;
      }

      infoEl.innerText = displayStr.trim() || 'Model data active';
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('🚨 Error formatting model info:', errorMessage);
      infoEl.innerText = 'Error loading model info';
    }
  });
}
