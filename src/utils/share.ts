import { weatherProviderModel } from '../models/weatherProviderModel';
import * as shareText from './shareText';
import type { Map as LeafletMap } from 'leaflet';

/** Marks links created by the in-app share button so analytics can attribute them. */
const SHARE_UTM_SOURCE = 'share';

/** Decimal places kept in the URL; the visible coordinates are rounded to two. */
const URL_COORDINATE_DECIMALS = 4;

function buildShareUrl(lat: number, lng: number, providerId: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('lat', lat.toFixed(URL_COORDINATE_DECIMALS));
  url.searchParams.set('lon', lng.toFixed(URL_COORDINATE_DECIMALS));
  url.searchParams.set('model', providerId);
  url.searchParams.set('utm_source', SHARE_UTM_SOURCE);
  return url.toString();
}

function getShareLatLng(map: LeafletMap) {
  return weatherProviderModel.lastClickedLatLng ?? map.getCenter();
}

/** Wind values of the selected point; both stay null when the user shares without a point. */
function getShareValues(): shareText.ShareValues {
  return { speed: weatherProviderModel.windSpeed, gust: weatherProviderModel.windGust };
}

/**
 * Shares the current location using the Web Share API or clipboard fallback.
 *
 * The title carries position and wind value, the body the provider facts. The link preview itself
 * is static (`index.html`), so this text is the only per-share information a recipient sees.
 */
export async function shareCurrentLocation(map: LeafletMap): Promise<void> {
  const latlng = getShareLatLng(map);
  const providerId = weatherProviderModel.getActiveProviderId();
  const values = getShareValues();
  const shareUrl = buildShareUrl(latlng.lat, latlng.lng, providerId);
  const shareData = {
    title: shareText.formatShareTitle(latlng.lat, latlng.lng, values),
    text: shareText.formatShareDescription(providerId, values),
    url: shareUrl,
  };

  if (navigator.share) {
    await navigator.share(shareData).catch(() => {});
    return;
  }

  await navigator.clipboard.writeText(shareUrl);
  alert('Link copied to the clipboard.');
}
