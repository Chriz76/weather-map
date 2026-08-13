import { logger } from '../utils/logger';

const SPECIAL_DATA_URL = 'https://christian-fey.github.io/Koechelt_der_Kochel/forecast.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache: { data: Record<string, unknown>[] | null; timestamp: number } = { data: null, timestamp: 0 };
let inFlight: Promise<Record<string, unknown>[]> | null = null;

type NormalizedEntry = { day: string; foehnProbabilityPct: number };

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeForecastEntries(payload: unknown): NormalizedEntry[] {
  if (!isObject(payload)) return [];

  const maybeForecast = payload['forecast'];
  const list = Array.isArray(maybeForecast) ? maybeForecast : [];

  return list
    .filter(isObject)
    .map(item => {
      const day = item['day'];
      if (!isString(day)) return null;

      const raw = item['foehn_probability_pct'] ?? item['foehnProbabilityPct'] ?? item['foehn'] ?? null;
      const num = toFiniteNumber(raw) ?? 0;

      return { day, foehnProbabilityPct: num };
    })
    .filter((it): it is NormalizedEntry => it !== null && Number.isFinite(it.foehnProbabilityPct));
}

export function selectForecastEntries(entries: unknown[] | null, startDayIso: string): Record<string, unknown>[] {
  if (!Array.isArray(entries)) return [];

  const normalized: NormalizedEntry[] = entries
    .filter(isObject)
    .map(obj => {
      const day = obj['day'];
      if (!isString(day)) return null;
      const raw = obj['foehnProbabilityPct'] ?? obj['foehn_probability_pct'] ?? obj['foehn_probability'] ?? obj['foehn'] ?? null;
      const num = toFiniteNumber(raw) ?? 0;
      return { day, foehnProbabilityPct: num };
    })
    .filter((it): it is NormalizedEntry => it !== null);

  const sorted = [...normalized].sort((a, b) => a.day.localeCompare(b.day));
  const idx = sorted.findIndex(e => e.day === startDayIso);
  const start = idx === -1 ? 0 : idx;
  const slice = sorted.slice(start, start + 3);

  // Return as generic records so callers that expect raw keys still work.
  return slice.map(s => ({ day: s.day, foehn_probability_pct: s.foehnProbabilityPct, foehnProbabilityPct: s.foehnProbabilityPct }));
}

export function buildSpecialDataSummary(entries: Record<string, unknown>[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';

  const vals = entries.slice(0, 3).map(e => {
    if (!isObject(e)) return '0';
    const raw = e['foehnProbabilityPct'] ?? e['foehn_probability_pct'] ?? 0;
    const num = toFiniteNumber(raw) ?? 0;
    return String(Math.round(num));
  });

  return vals.join('/') + '%';
}

export async function fetchSpecialData(): Promise<Record<string, unknown>[]> {
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL_MS) return cache.data;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${SPECIAL_DATA_URL}?cb=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Special data request failed (${res.status})`);
      const json: unknown = await res.json();
      const normalized = normalizeForecastEntries(json).map(e => ({ day: e.day, foehn_probability_pct: e.foehnProbabilityPct }));
      cache.data = normalized as Record<string, unknown>[];
      cache.timestamp = Date.now();
      return cache.data;
    } catch (err: unknown) {
      logger.error('Error loading special data:', err);
      // On error, return empty array so callers can continue gracefully
      return [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export default { selectForecastEntries, buildSpecialDataSummary, fetchSpecialData };
