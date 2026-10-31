import { logger } from './logger';
import { AROME, D2, HRRR } from '../weatherProvider/providerIds';

/**
 * Time zones whose users live inside the AROME PI model area (Iberia, France, Italy/Malta, the
 * British Isles).
 *
 * IANA time zone names are country based, so they separate Madrid from Berlin even though both
 * are CET. Every other `Europe/*` zone is served by ICON-D2.
 */
const AROME_EUROPE_TIME_ZONES: ReadonlySet<string> = new Set([
  // Iberia (D2 starts at 43°N, so Spain and Portugal are outside its area)
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/Gibraltar',
  'Africa/Ceuta',
  // France
  'Europe/Paris',
  'Europe/Monaco',
  'Europe/Andorra',
  // Italy and the Mediterranean
  'Europe/Rome',
  'Europe/Malta',
  // British Isles (D2 starts at 4.16°W, so Ireland is outside its area)
  'Europe/London',
  'Europe/Belfast',
  'Europe/Dublin',
  'Europe/Guernsey',
  'Europe/Jersey',
  'Europe/Isle_of_Man'
]);

/** Fixed-offset zone names that carry no country information. */
const AROME_UTC_TIME_ZONES: ReadonlySet<string> = new Set([
  'UTC',
  'GMT',
  'UCT',
  'Universal',
  'Zulu',
  'GMT0',
  'Greenwich'
]);

/**
 * Maps a device time zone to the model that covers the user's region.
 *
 * Rules are evaluated in order: the Americas keep HRRR (CONUS), the Atlantic and fixed-offset
 * zones fall back to AROME (closest European area), AROME covers Western and Southern Europe,
 * every other European zone uses ICON-D2. Zones outside all model areas keep HRRR instead of
 * guessing a region.
 *
 * @param timeZone IANA time zone name such as `Europe/Berlin`; `null`, empty or unknown values keep HRRR.
 * @returns The provider id to activate on a first visit.
 */
export function resolveProviderForTimeZone(timeZone: string | null | undefined): string {
  const zone = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!zone) return HRRR;

  if (zone.startsWith('America/')) return HRRR;
  if (zone.startsWith('Atlantic/')) return AROME;
  if (zone.startsWith('Etc/')) return AROME;
  if (AROME_UTC_TIME_ZONES.has(zone)) return AROME;
  if (AROME_EUROPE_TIME_ZONES.has(zone)) return AROME;
  if (zone.startsWith('Europe/')) return D2;
  return HRRR;
}

/**
 * Reads the IANA time zone of the current device.
 *
 * @returns The zone name, or `null` when the browser does not expose a usable value.
 */
export function getBrowserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 ? zone : null;
  } catch (error) {
    logger.debug('Could not resolve the browser time zone', error);
    return null;
  }
}
