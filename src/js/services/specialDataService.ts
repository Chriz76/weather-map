import { logger } from '../utils/logger';

export interface SpecialDataEntry {
  day: string;
  foehnProbabilityPct: number;
}

const SPECIAL_DATA_URL = 'https://christian-fey.github.io/Koechelt_der_Kochel/forecast.json';
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { data: SpecialDataEntry[] | null; timestamp: number } = { data: null, timestamp: 0 };
let inFlight: Promise<SpecialDataEntry[]> | null = null;

function normalizeForecastEntries(payload: any): SpecialDataEntry[] {
  if (!payload || !Array.isArray(payload.forecast)) {
    return [];
  }

  return payload.forecast
    .filter((item: any) => item && typeof item.day === 'string')
    .map((item: any) => ({
      day: item.day,
      foehnProbabilityPct: Number(item.foehn_probability_pct),
    }))
    .filter((item: SpecialDataEntry) => Number.isFinite(item.foehnProbabilityPct));
}

export function selectForecastEntries(entries: SpecialDataEntry[], referenceDay: string): SpecialDataEntry[] {
  const sortedEntries = [...entries].sort((a, b) => a.day.localeCompare(b.day));
  const referenceIndex = sortedEntries.findIndex((entry) => entry.day === referenceDay);

  if (referenceIndex === -1) {
    return sortedEntries.slice(0, 3);
  }

  return sortedEntries.slice(referenceIndex, referenceIndex + 3);
}

export function buildSpecialDataSummary(entries: SpecialDataEntry[]): string {
  const summary = entries.slice(0, 3).map((entry) => Math.round(entry.foehnProbabilityPct)).join('/');
  return `${summary}%`;
}

export async function fetchSpecialData(): Promise<SpecialDataEntry[]> {
  const now = Date.now();

  if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const response = await fetch(`${SPECIAL_DATA_URL}?cb=${Date.now()}`, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Special data request failed (${response.status})`);
      }

      const payload = await response.json();
      const normalizedEntries = normalizeForecastEntries(payload);
      cache = { data: normalizedEntries, timestamp: Date.now() };
      return normalizedEntries;
    } catch (error) {
      logger.error('❌ Error loading special data:', error);
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
