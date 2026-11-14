/**
 * Wording for shared locations.
 *
 * Kept free of DOM and model access so the same strings can later feed the social preview tags
 * (`og:title` / `og:description`) - the share sheet and the link preview then cannot drift apart.
 */
import { AROME, D2, HRRR } from '../weatherProvider/providerIds';

/** Wind values of the active point forecast. Absent when no point has been selected yet. */
export type ShareValues = {
  speed?: number | null;
  gust?: number | null;
};

type ProviderShareInfo = {
  /** Model name as the UI shows it. */
  label: string;
  /** Resolution and refresh cadence - the two facts that separate the models. */
  details: string;
  /** Wording in front of the gust value; empty when `details` already mentions gusts. */
  gustPrefix: string;
};

const PROVIDER_SHARE_INFO: Readonly<Record<string, ProviderShareInfo>> = {
  [D2]: { label: 'ICON-D2 RUC', details: '2.2 km · hourly runs', gustPrefix: 'gusts ' },
  [AROME]: { label: 'AROME PI', details: '1.3 km gusts · 15-min steps', gustPrefix: '' },
  [HRRR]: { label: 'HRRR', details: '3 km · hourly runs', gustPrefix: 'gusts ' }
};

/** Used for provider ids the table does not know, so a share never renders an empty description. */
const FALLBACK_SHARE_INFO: ProviderShareInfo = {
  label: 'RapidWind',
  details: 'hourly wind forecast',
  gustPrefix: 'gusts '
};

/** Two decimals are roughly one kilometre - precise enough for a spot, short enough for a title. */
const COORDINATE_DECIMALS = 2;
const SEPARATOR = ' · ';

/** Reads a finite number, treating missing and malformed values as absent. */
function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Formats a position for display; the share URL keeps four decimals so the spot stays exact. */
export function formatShareCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(COORDINATE_DECIMALS)}, ${lon.toFixed(COORDINATE_DECIMALS)}`;
}

/** Share title: position plus the current wind value when a point forecast exists. */
export function formatShareTitle(lat: number, lon: number, values?: ShareValues | null): string {
  const title = `Wind forecast @ ${formatShareCoordinates(lat, lon)}`;
  const speed = toFiniteNumber(values?.speed);
  return speed === null ? title : `${title}${SEPARATOR}${Math.round(speed)} kn`;
}

/** Share description: provider facts plus the gust value when one is known. */
export function formatShareDescription(providerId: string, values?: ShareValues | null): string {
  const info = PROVIDER_SHARE_INFO[providerId] ?? FALLBACK_SHARE_INFO;
  const description = `${info.label} forecast map${SEPARATOR}${info.details}`;
  const gust = toFiniteNumber(values?.gust);
  return gust === null ? description : `${description}${SEPARATOR}${info.gustPrefix}${Math.round(gust)} kn`;
}
