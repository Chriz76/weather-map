
/**
// ==========================================
// I. INTERNE HELPER (Parser)
// ==========================================

/**
 * Parses a custom model timestamp key ("YYYYMMDD_HH") into a UTC Date object.
 * @param {string} timestampStr
 * @returns {Date}
 */
function parseModelTimestamp(timestampStr) {
    const year = parseInt(timestampStr.substring(0, 4), 10);
    const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
    const day = parseInt(timestampStr.substring(6, 8), 10);
    const hour = parseInt(timestampStr.substring(9, 11), 10);
    
    const date = new Date(Date.UTC(year, month, day, hour, 0, 0));
    if (Number.isNaN(date.getTime())) throw new Error("Invalid model timestamp format");
    return date;
}

/**
 * Normalizes an ISO string or Date instance into a valid Date object.
 * @param {string|Date} input
 * @returns {Date}
 */
function normalizeToDate(input) {
    const date = (input instanceof Date) ? input : new Date(input);
    if (Number.isNaN(date.getTime())) throw new Error("Invalid date input");
    return date;
}


// ==========================================
// II. PUBLIC FORMATTERS (Einheitlich benannt)
// ==========================================

/**
 * Formats a model timestamp ("YYYYMMDD_HH") to local time (e.g., "14:30").
 * @param {string} timestampStr
 * @returns {string}
 */
import { logger } from './logger.js';

export function formatModelTimestampToTime(timestampStr) {
    try {
        const date = parseModelTimestamp(timestampStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        logger.error("❌ Error formatting model timestamp to time:", error);
        return timestampStr;
    }
}

/**
 * Formats a model timestamp ("YYYYMMDD_HH") to local date and time (e.g., "24.12., 14:30").
 * @param {string} timestampStr
 * @returns {string}
 */
export function formatModelTimestampToDateTime(timestampStr) {
    try {
        const date = parseModelTimestamp(timestampStr);
        const datum = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        const uhrzeit = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${datum} ${uhrzeit}`;
    } catch (error) {
        logger.error("❌ Error formatting model timestamp to date-time:", error);
        return timestampStr;
    }
}

/**
 * Formats a model timestamp ("YYYYMMDD_HH") to local time and a relative day description (e.g., "Today", "Tomorrow").
 * @param {string} timestampStr
 * @returns {{time: string, description: string}}
 */
export function formatModelTimestampToTimeAndDescription(timestampStr) {
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
    } catch (error) {
        logger.error("❌ Error formatting model timestamp to time and description:", error);
        return { time: '--:--', description: '--' };
    }
}

/**
 * Formats an ISO string or Date to local date and time (e.g., "24.12., 14:30").
 * @param {string|Date} input
 * @returns {string}
 */
export function formatToDateTime(input) {
    try {
        const date = normalizeToDate(input);
        const datum = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        const uhrzeit = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `${datum} ${uhrzeit}`;
    } catch (error) {
        logger.error('❌ Error formatting to date-time:', error);
        return String(input);
    }
}

/**
 * Formats an ISO string or Date to a relative age in minutes.
 * @param {string|Date} input
 * @returns {string}
 */
export function formatMinutesAgo(input) {
    try {
        const date = normalizeToDate(input);
        const minutes = Math.round((Date.now() - date.getTime()) / 60000);
        return `${minutes} minutes ago`;
    } catch (error) {
        logger.error('❌ Error formatting minutes ago:', error);
        return '';
    }
}

/**
 * Formats an ISO string or Date to local time (e.g., "14:30").
 * @param {string|Date} input
 * @returns {string}
 */
export function formatToTime(input) {
    try {
        const date = normalizeToDate(input);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        logger.error('❌ Error formatting to time:', error);
        return String(input);
    }
}


// ==========================================
// III. BUSINESS LOGIC
// ==========================================

/**
 * Determines the active timeline index based on current time or historical state.
 * @param {string[]} sortedTimestamps
 * @param {string|null} prevActiveTimestamp
 * @returns {number}
 */
export function determineActiveIndex(sortedTimestamps, prevActiveTimestamp) {
    if (!sortedTimestamps || sortedTimestamps.length === 0) return 0;

    if (prevActiveTimestamp) {
        const exactMatchIndex = sortedTimestamps.indexOf(prevActiveTimestamp);
        if (exactMatchIndex !== -1) return exactMatchIndex;
    }

    const now = new Date();
    for (let idx = 0; idx < sortedTimestamps.length; idx++) {
        try {
            const tDate = parseModelTimestamp(sortedTimestamps[idx]);
            if (tDate >= now) return idx;
        } catch {
            continue; // Falls ein fehlerhafter Timestamp in der Liste ist, überspringen
        }
    }

    return sortedTimestamps.length - 1;
}

/**
 * Adds minutes to an ISO date string or Date and returns a Date.
 * @param {string|Date} input ISO date string or Date instance.
 * @param {number} minutes Minutes to add.
 * @returns {Date|null}
 */
export function addMinutesToIso(input, minutes) {
    try {
        const d = (input instanceof Date) ? new Date(input.getTime()) : new Date(input);
        if (Number.isNaN(d.getTime())) return null;
        d.setMinutes(d.getMinutes() + Number(minutes));
        return d;
    } catch (e) {
        logger.error('❌ Error adding minutes to ISO/date:', e);
        return null;
    }
}
