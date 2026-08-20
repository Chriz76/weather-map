import { logger } from './logger';

export function parseModelTimestamp(timestampStr: string): Date {
    const year = parseInt(timestampStr.substring(0, 4), 10);
    const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
    const day = parseInt(timestampStr.substring(6, 8), 10);

    const parts = (timestampStr.split('_')[1] || '');
    let hour = 0;
    let minute = 0;

    if (parts.length === 2) {
        hour = parseInt(parts, 10);
    } else if (parts.length === 4) {
        hour = parseInt(parts.substring(0, 2), 10);
        minute = parseInt(parts.substring(2, 4), 10);
    } else {
        hour = parseInt(parts.substring(0, 2) || '0', 10);
        minute = parseInt(parts.substring(2, 4) || '0', 10);
    }

    const date = new Date(Date.UTC(year, month, day, hour, minute, 0));
    if (Number.isNaN(date.getTime())) throw new Error('Invalid model timestamp format');
    return date;
}

function normalizeToDate(input: string | Date): Date {
    const date = (input instanceof Date) ? input : new Date(input);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date input');
    return date;
}

export function formatModelTimestampToTime(timestampStr: string): string {
    try {
        const date = parseModelTimestamp(timestampStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error: unknown) {
            logger.error('❌ Error formatting model timestamp to time:', error);
        return timestampStr;
    }
}

export function formatModelTimestampToDateTime(timestampStr: string): string {
    try {
        const date = parseModelTimestamp(timestampStr);
        const datum = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        const uhrzeit = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${datum} ${uhrzeit}`;
    } catch (error: unknown) {
            logger.error('❌ Error formatting model timestamp to date-time:', error);
        return timestampStr;
    }
}

export function formatModelTimestampToTimeAndDescription(timestampStr: string): { time: string; description: string } {
    try {
        const date = parseModelTimestamp(timestampStr);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const today = new Date();
        const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const diffDays = Math.round((compareDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

        let description = '';
        if (diffDays === 0) description = 'Today';
        else if (diffDays === 1) description = 'Tomorrow';
        else if (diffDays === -1) description = 'Yesterday';
        else description = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        return { time: timeStr, description };
    } catch (error: unknown) {
            logger.error('❌ Error formatting model timestamp to time and description:', error);
        return { time: '--:--', description: '--' };
    }
}

export function formatToDateTime(input: string | Date): string {
    try {
        const date = normalizeToDate(input);
        const datum = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        const uhrzeit = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `${datum} ${uhrzeit}`;
    } catch (error: unknown) {
            logger.error('❌ Error formatting to date-time:', error);
        return String(input);
    }
}

export function formatMinutesAgo(input: string | Date): string {
    try {
        const date = normalizeToDate(input);
        const minutes = Math.round((Date.now() - date.getTime()) / 60000);
        return `${minutes} minutes ago`;
    } catch (error: unknown) {
            logger.error('❌ Error formatting minutes ago:', error);
        return '';
    }
}

export function formatToTime(input: string | Date): string {
    try {
        const date = normalizeToDate(input);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error: unknown) {
            logger.error('❌ Error formatting to time:', error);
        return String(input);
    }
}

export function determineActiveIndex(sortedTimestamps: string[], prevActiveTimestamp: string | null): number {
    if (!sortedTimestamps || sortedTimestamps.length === 0) return 0;

    if (prevActiveTimestamp) {
        const matchedIndex = findMatchingTimestampIndex(sortedTimestamps, prevActiveTimestamp);
        if (matchedIndex !== -1) return matchedIndex;
    }

    const now = new Date();
    for (let idx = 0; idx < sortedTimestamps.length; idx++) {
        try {
            const tDate = parseModelTimestamp(sortedTimestamps[idx]!);
            if (tDate >= now) return idx;
        } catch {
            continue;
        }
    }

    return sortedTimestamps.length - 1;
}

/**
 * Returns the timestamp truncated to the hour so mixed hh and hhmm keys can be compared.
 */
function getHourBucket(timestampStr: string): string {
    const date = parseModelTimestamp(timestampStr);
    return getHourBucketFromDate(date);
}

function getHourBucketFromDate(date: Date): string {
    const year = String(date.getUTCFullYear()).padStart(4, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}${month}${day}_${hour}`;
}

/**
 * Finds the closest timestamp index with a tolerant hour-bucket fallback.
 * Falls back to the globally closest timestamp when no matching hour bucket exists.
 * @param items Sorted timestamp-bearing items to search.
 * @param targetTimestamp Timestamp key to match.
 * @param getTimestamp Function that extracts a timestamp key from each item.
 * @returns The best matching index, or -1 when no match exists.
 */
export function findMatchingTimestampIndexBy<T>(
    items: T[],
    targetTimestamp: string | null | undefined,
    getTimestamp: (item: T) => string | null | undefined
): number {
    if (!items || items.length === 0 || !targetTimestamp) return -1;

    try {
        const targetBucket = getHourBucket(targetTimestamp);
        const targetDate = parseModelTimestamp(targetTimestamp);
        let bestIdx = -1;
        let bestDiff = Infinity;
        let bestSameHourIdx = -1;
        let bestSameHourDiff = Infinity;

        for (let i = 0; i < items.length; i++) {
            const candidate = getTimestamp(items[i]!);
            if (!candidate) continue;

            if (candidate === targetTimestamp) return i;

            try {
                const candidateDate = parseModelTimestamp(candidate);
                const diff = Math.abs(candidateDate.getTime() - targetDate.getTime());
                if (getHourBucketFromDate(candidateDate) === targetBucket) {
                    if (diff < bestSameHourDiff) {
                        bestSameHourDiff = diff;
                        bestSameHourIdx = i;
                    }
                }

                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIdx = i;
                }
            } catch {
                continue;
            }
        }

        if (bestSameHourIdx !== -1) {
            return bestSameHourIdx;
        }

        return bestIdx;
    } catch {
        return -1;
    }
}

/**
 * Finds the closest timestamp index with a tolerant hour-bucket fallback.
 * Falls back to the globally closest timestamp when no matching hour bucket exists.
 * @param sortedTimestamps Sorted timestamp keys to search.
 * @param targetTimestamp Timestamp key to match.
 * @returns The best matching index, or -1 when no match exists.
 */
export function findMatchingTimestampIndex(sortedTimestamps: string[], targetTimestamp: string | null | undefined): number {
    return findMatchingTimestampIndexBy(sortedTimestamps, targetTimestamp, (item) => item);
}

/**
 * Resolves the best matching timestamp string for a target key.
 * @param sortedTimestamps Sorted timestamp keys to search.
 * @param targetTimestamp Timestamp key to match.
 * @returns The matching timestamp key, or null when no match exists.
 */
export function findMatchingTimestamp(sortedTimestamps: string[], targetTimestamp: string | null | undefined): string | null {
    const index = findMatchingTimestampIndex(sortedTimestamps, targetTimestamp);
    return index === -1 ? null : (sortedTimestamps[index] ?? null);
}

export function addMinutesToIso(input: string | Date, minutes: number): Date | null {
    try {
        const d = (input instanceof Date) ? new Date(input.getTime()) : new Date(input);
        if (Number.isNaN(d.getTime())) return null;
        d.setMinutes(d.getMinutes() + Number(minutes));
        return d;
    } catch (e: unknown) {
            logger.error('❌ Error adding minutes to ISO/date:', e);
        return null;
    }
}
