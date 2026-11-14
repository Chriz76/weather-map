/**
 * Tests for the share wording.
 *
 * The strings are user visible in every shared link, so the cases cover all three providers with
 * and without a point forecast, plus the fallback for an unknown provider.
 */
import * as shareText from '../../src/utils/shareText';

const LAT = 54.4217;
const LON = 11.1022;

describe('shareText', () => {
  it('formats the position with two decimals', () => {
    expect(shareText.formatShareCoordinates(LAT, LON)).toBe('54.42, 11.10');
  });

  it('formats a title with the rounded wind value', () => {
    expect(shareText.formatShareTitle(LAT, LON, { speed: 22.6, gust: 36.4 })).toBe(
      'Wind forecast @ 54.42, 11.10 · 23 kn'
    );
  });

  it('omits the wind value when no point forecast exists', () => {
    expect(shareText.formatShareTitle(LAT, LON)).toBe('Wind forecast @ 54.42, 11.10');
    expect(shareText.formatShareTitle(LAT, LON, { speed: null, gust: null })).toBe(
      'Wind forecast @ 54.42, 11.10'
    );
    expect(shareText.formatShareTitle(LAT, LON, { speed: Number.NaN })).toBe(
      'Wind forecast @ 54.42, 11.10'
    );
  });

  it('describes ICON-D2 RUC with gusts and hourly runs', () => {
    expect(shareText.formatShareDescription('icon-d2', { speed: 23, gust: 36 })).toBe(
      'ICON-D2 RUC forecast map · 2.2 km · hourly runs · gusts 36 kn'
    );
    expect(shareText.formatShareDescription('icon-d2')).toBe(
      'ICON-D2 RUC forecast map · 2.2 km · hourly runs'
    );
  });

  it('describes AROME PI with its gust resolution and 15-min steps', () => {
    expect(shareText.formatShareDescription('arome', { speed: 18, gust: 24 })).toBe(
      'AROME PI forecast map · 1.3 km gusts · 15-min steps · 24 kn'
    );
    expect(shareText.formatShareDescription('arome', { gust: null })).toBe(
      'AROME PI forecast map · 1.3 km gusts · 15-min steps'
    );
  });

  it('describes HRRR with 3 km and hourly runs', () => {
    expect(shareText.formatShareDescription('hrrr', { gust: 19.5 })).toBe(
      'HRRR forecast map · 3 km · hourly runs · gusts 20 kn'
    );
  });

  it('falls back for an unknown provider id', () => {
    expect(shareText.formatShareDescription('something-else')).toBe(
      'RapidWind forecast map · hourly wind forecast'
    );
  });
});
