/**
 * Minimal special data service used by tests and controllers.
 */
export function selectForecastEntries(entries: any[] | null, startDayIso: string): any[] {
  if (!Array.isArray(entries)) return [];
  const idx = entries.findIndex((e: any) => e && e.day === startDayIso);
  const start = idx === -1 ? 0 : idx;
  return entries.slice(start, start + 3);
}

export function buildSpecialDataSummary(entries: any[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const vals = entries.map(e => {
    const v = typeof e.foehn_probability_pct === 'number' ? Math.round(e.foehn_probability_pct) : 0;
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
