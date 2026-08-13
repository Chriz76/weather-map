/**
 * Minimal special data service used by tests and controllers.
 */
export function selectForecastEntries(entries: unknown[] | null, startDayIso: string): Record<string, unknown>[] {
  if (!Array.isArray(entries)) return [];
  const idx = entries.findIndex((e: unknown) => {
    return !!e && (e as Record<string, unknown>)['day'] === startDayIso;
  });
  const start = idx === -1 ? 0 : idx;
  const slice = entries.slice(start, start + 3);
  return slice.filter(e => e && typeof e === 'object').map(e => e as Record<string, unknown>);
}

export function buildSpecialDataSummary(entries: Record<string, unknown>[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const vals = entries.map(e => {
    const raw = e['foehn_probability_pct'];
    const v = typeof raw === 'number' ? Math.round(raw) : 0;
    return String(v);
  });
  return vals.join('/') + '%';
}

export async function fetchSpecialData(url?: string): Promise<Record<string, unknown>[] | null> {
  // If no URL provided, return empty entries so callers can gracefully continue.
  if (!url) return [];
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json)) return null;
    return json.filter((e: unknown) => e && typeof e === 'object').map((e: unknown) => e as Record<string, unknown>);
  } catch {
    return null;
  }
}

export default { selectForecastEntries, buildSpecialDataSummary, fetchSpecialData };
