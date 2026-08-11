/**
 * Minimal special data service used by tests and controllers.
 */
export function selectForecastEntries(entries: unknown[] | null, startDayIso: string): unknown[] {
  if (!Array.isArray(entries)) return [];
  const idx = entries.findIndex((e: unknown) => {
    return !!e && (e as Record<string, unknown>)['day'] === startDayIso;
  });
  const start = idx === -1 ? 0 : idx;
  return entries.slice(start, start + 3);
}

export function buildSpecialDataSummary(entries: unknown[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const vals = entries.map(e => {
    const raw = (e as Record<string, unknown>)['foehn_probability_pct'];
    const v = typeof raw === 'number' ? Math.round(raw) : 0;
    return String(v);
  });
  return vals.join('/') + '%';
}

export async function fetchSpecialData(url?: string): Promise<any[] | null> {
  // If no URL provided, return empty entries so callers can gracefully continue.
  if (!url) return [];
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default { selectForecastEntries, buildSpecialDataSummary, fetchSpecialData };
