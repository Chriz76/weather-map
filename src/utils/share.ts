import { weatherProviderModel } from '../models/weatherProviderModel';
import type { Map as LeafletMap } from 'leaflet';

const SHARE_TEXT = 'High-res ICON-D2 & AROME wind nowcasting. Free & open-source.';

function buildShareUrl(lat: number, lng: number, providerId: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('lat', lat.toFixed(4));
  url.searchParams.set('lon', lng.toFixed(4));
  url.searchParams.set('model', providerId);
  return url.toString();
}

function getShareLatLng(map: LeafletMap) {
  return weatherProviderModel.lastClickedLatLng ?? map.getCenter();
}

/**
 * Shares the current location using the Web Share API or clipboard fallback.
 */
export async function shareCurrentLocation(map: LeafletMap): Promise<void> {
  const latlng = getShareLatLng(map);
  const providerId = weatherProviderModel.getActiveProviderId();
  const shareUrl = buildShareUrl(latlng.lat, latlng.lng, providerId);
  const shareData = {
    title: `Wind @ ${latlng.lat.toFixed(2)}, ${latlng.lng.toFixed(2)}`,
    text: SHARE_TEXT,
    url: shareUrl,
  };

  if (navigator.share) {
    await navigator.share(shareData).catch(() => {});
    return;
  }

  await navigator.clipboard.writeText(shareUrl);
  alert('Link in die Zwischenablage kopiert!');
}
