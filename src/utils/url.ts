import { D2, AROME } from '../weatherProvider/providerIds';

export interface InitialUrlParams {
  providerId: string | null;
  location: { lat: number; lng: number } | null;
  hadParams: boolean;
}

export function normalizeProviderId(value: string | null): string | null {
  if (!value) return null;
  if (value === D2 || value === AROME) return value;
  return null;
}

export function parseUrlParams(): InitialUrlParams {
  const urlParams = new URLSearchParams(window.location.search);
  const rawModel = urlParams.get('model');
  const providerId = normalizeProviderId(rawModel);

  const latParam = urlParams.get('lat');
  const lonParam = urlParams.get('lon');
  let location = null;
  if (latParam && lonParam) {
    const lat = parseFloat(latParam);
    const lng = parseFloat(lonParam);
    if (!isNaN(lat) && !isNaN(lng)) {
      location = { lat, lng };
    }
  }

  return {
    providerId,
    location,
    hadParams: Boolean(window.location.search),
  };
}

export function cleanUrlHistory(): void {
  if (window.location.search) {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}
