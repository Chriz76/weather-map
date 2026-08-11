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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
        logger.error('❌ Error formatting to date-time:', error);
        return String(input);
    }
}

export function formatMinutesAgo(input: string | Date): string {
    try {
        const date = normalizeToDate(input);
        const minutes = Math.round((Date.now() - date.getTime()) / 60000);
        return `${minutes} minutes ago`;
    } catch (error: any) {
        logger.error('❌ Error formatting minutes ago:', error);
        return '';
    }
}

export function formatToTime(input: string | Date): string {
    try {
        const date = normalizeToDate(input);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error: any) {
        logger.error('❌ Error formatting to time:', error);
        return String(input);
    }
}

export function determineActiveIndex(sortedTimestamps: string[], prevActiveTimestamp: string | null): number {
    if (!sortedTimestamps || sortedTimestamps.length === 0) return 0;

    if (prevActiveTimestamp) {
        const exactMatchIndex = sortedTimestamps.indexOf(prevActiveTimestamp);
        if (exactMatchIndex !== -1) return exactMatchIndex;

        try {
            const prevDate = parseModelTimestamp(prevActiveTimestamp);
            let bestIdx = 0;
            let bestDiff = Infinity;

            for (let i = 0; i < sortedTimestamps.length; i++) {
                try {
                    const d = parseModelTimestamp(sortedTimestamps[i]);
                    const diff = Math.abs(d.getTime() - prevDate.getTime());
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestIdx = i;
                    }
                } catch {
                    continue;
                }
            }

            return bestIdx;
        } catch {
            // fallback
        }
    }

    const now = new Date();
    for (let idx = 0; idx < sortedTimestamps.length; idx++) {
        try {
            const tDate = parseModelTimestamp(sortedTimestamps[idx]);
            if (tDate >= now) return idx;
        } catch {
            continue;
        }
    }

    return sortedTimestamps.length - 1;
}

export function addMinutesToIso(input: string | Date, minutes: number): Date | null {
    try {
        const d = (input instanceof Date) ? new Date(input.getTime()) : new Date(input);
        if (Number.isNaN(d.getTime())) return null;
        d.setMinutes(d.getMinutes() + Number(minutes));
        return d;
    } catch (e: any) {
        logger.error('❌ Error adding minutes to ISO/date:', e);
        return null;
    }
}
