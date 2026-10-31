import { describe, it, expect } from 'vitest';
import { getBrowserTimeZone, resolveProviderForTimeZone } from '../../src/utils/region';

describe('resolveProviderForTimeZone', () => {
  it('keeps HRRR for the Americas', () => {
    expect(resolveProviderForTimeZone('America/New_York')).toBe('hrrr');
    expect(resolveProviderForTimeZone('America/Los_Angeles')).toBe('hrrr');
    expect(resolveProviderForTimeZone('America/Denver')).toBe('hrrr');
  });

  it('falls back to AROME for Atlantic zones and fixed-offset zone names', () => {
    expect(resolveProviderForTimeZone('Atlantic/Canary')).toBe('arome');
    expect(resolveProviderForTimeZone('Atlantic/Azores')).toBe('arome');
    expect(resolveProviderForTimeZone('Atlantic/Madeira')).toBe('arome');
    expect(resolveProviderForTimeZone('Atlantic/Reykjavik')).toBe('arome');
    expect(resolveProviderForTimeZone('Etc/GMT+5')).toBe('arome');
    expect(resolveProviderForTimeZone('Etc/UTC')).toBe('arome');
    expect(resolveProviderForTimeZone('UTC')).toBe('arome');
    expect(resolveProviderForTimeZone('GMT')).toBe('arome');
  });

  it('maps Western and Southern Europe to AROME', () => {
    const aromeZones = [
      'Europe/Paris',
      'Europe/Monaco',
      'Europe/Andorra',
      'Europe/Madrid',
      'Europe/Lisbon',
      'Europe/Gibraltar',
      'Europe/Rome',
      'Europe/Malta',
      'Europe/London',
      'Europe/Belfast',
      'Europe/Dublin',
      'Europe/Guernsey',
      'Europe/Jersey',
      'Europe/Isle_of_Man',
      'Africa/Ceuta'
    ];

    for (const zone of aromeZones) {
      expect(resolveProviderForTimeZone(zone), zone).toBe('arome');
    }
  });

  it('maps the remaining European zones to D2', () => {
    const d2Zones = [
      'Europe/Berlin',
      'Europe/Busingen',
      'Europe/Zurich',
      'Europe/Vienna',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Luxembourg',
      'Europe/Copenhagen',
      'Europe/Prague',
      'Europe/Bratislava',
      'Europe/Budapest',
      'Europe/Ljubljana',
      'Europe/Zagreb',
      'Europe/Warsaw',
      'Europe/Athens',
      'Europe/Helsinki',
      'Europe/Bucharest',
      'Europe/Sofia',
      'Europe/Kyiv',
      'Europe/Riga',
      'Europe/Tallinn',
      'Europe/Vilnius',
      'Europe/Istanbul',
      'Europe/Moscow'
    ];

    for (const zone of d2Zones) {
      expect(resolveProviderForTimeZone(zone), zone).toBe('icon-d2');
    }
  });

  it('keeps HRRR for zones outside all model areas and for missing values', () => {
    expect(resolveProviderForTimeZone('Asia/Tokyo')).toBe('hrrr');
    expect(resolveProviderForTimeZone('Australia/Sydney')).toBe('hrrr');
    expect(resolveProviderForTimeZone('Africa/Casablanca')).toBe('hrrr');
    expect(resolveProviderForTimeZone('Pacific/Auckland')).toBe('hrrr');
    expect(resolveProviderForTimeZone('')).toBe('hrrr');
    expect(resolveProviderForTimeZone('   ')).toBe('hrrr');
    expect(resolveProviderForTimeZone(null)).toBe('hrrr');
    expect(resolveProviderForTimeZone(undefined)).toBe('hrrr');
  });

  it('ignores surrounding whitespace', () => {
    expect(resolveProviderForTimeZone('  Europe/Berlin  ')).toBe('icon-d2');
    expect(resolveProviderForTimeZone('\tEurope/Paris\n')).toBe('arome');
  });
});

describe('getBrowserTimeZone (smoke)', () => {
  it('returns a string or null without throwing', () => {
    const zone = getBrowserTimeZone();
    expect(zone === null || typeof zone === 'string').toBe(true);
  });
});
