/**
 * Converts a model timestamp key to local date and time string.
 * @param {string} timestampStr Timestamp key in format YYYYMMDD_HH.
 * @returns {string} Localized date/time representation.
 */
export function formatToLocalDateTimeString(timestampStr) {
    try {
        const year = parseInt(timestampStr.substring(0, 4), 10);
        const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
        const day = parseInt(timestampStr.substring(6, 8), 10);
        const hour = parseInt(timestampStr.substring(9, 11), 10);

        const utcDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        return utcDate.toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error("?? Error converting to local date-time:", error);
        return timestampStr;
    }
}

/**
 * Converts a model timestamp key to local time string.
 * @param {string} timestampStr Timestamp key in format YYYYMMDD_HH.
 * @returns {string} Localized time representation.
 */
export function formatToLocalTimeString(timestampStr) {
    try {
        const year = parseInt(timestampStr.substring(0, 4), 10);
        const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
        const day = parseInt(timestampStr.substring(6, 8), 10);
        const hour = parseInt(timestampStr.substring(9, 11), 10);

        const utcDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error("?? Error converting to local time:", error);
        return timestampStr;
    }
}

/**
 * Converts a model timestamp key to a local time string and a relative day description.
 * @param {string} timestampStr Timestamp key in format YYYYMMDD_HH.
 * @returns {{time: string, description: string}} Object containing localized time and day description.
 */
export function formatToLocalTimeAndDescription(timestampStr) {
    try {
        // 1. Parsing analog zu deinen bestehenden Methoden
        const year = parseInt(timestampStr.substring(0, 4), 10);
        const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
        const day = parseInt(timestampStr.substring(6, 8), 10);
        const hour = parseInt(timestampStr.substring(9, 11), 10);

        const utcDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        
        // 2. Lokale Uhrzeit formatieren
        const timeStr = utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // 3. Relative Beschreibung (Today, Tomorrow, etc.) ermitteln
        const today = new Date();
        const compareDate = new Date(utcDate.getFullYear(), utcDate.getMonth(), utcDate.getDate());
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const diffTime = compareDate - todayDate;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        let description = '';
        if (diffDays === 0) {
            description = 'Today';
        } else if (diffDays === 1) {
            description = 'Tomorrow';
        } else if (diffDays === -1) {
            description = 'Yesterday';
        } else {
            // Fallback für ältere/weitere Daten (z.B. "Jun 28")
            description = utcDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        return { time: timeStr, description: description };

    } catch (error) {
        console.error("❌ Error converting to local time and description:", error);
        return { time: '--:--', description: '--' };
    }
}


/**
 * Formats an ISO date string or Date object to local display text.
 * @param {string|Date} input ISO date string or Date instance.
 * @returns {string} Localized short display string.
 */
export function formatIsoOrDateToLocalDisplay(input) {
    try {
        const d = (input instanceof Date) ? input : new Date(input);
        if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
        return d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        console.error('?? Error formatting ISO/date to local display:', e);
        return String(input);
    }
}

/**
 * Determines the active timeline index after metadata updates.
 * Prefers the previous active timestamp when still available, otherwise picks
 * the nearest future timestamp, or the newest available fallback.
 * @param {string[]} sortedTimestamps Sorted timestamp keys from the backend.
 * @param {string|null} prevActiveTimestamp Previously selected timestamp.
 * @returns {number} Index that should become active.
 */
export function determineActiveIndex(sortedTimestamps, prevActiveTimestamp) {
    // Safety anchor: Catch empty lists
    if (!sortedTimestamps || sortedTimestamps.length === 0) return 0;

    // 1. State preservation: If old timestamp exists, take its index directly
    if (prevActiveTimestamp) {
        const exactMatchIndex = sortedTimestamps.indexOf(prevActiveTimestamp);
        if (exactMatchIndex !== -1) return exactMatchIndex;
    }

    // 2. Fallback for cold start / >24 hours inactivity:
    // We search for first entry that is now or in future.
    const now = new Date();
    
    for (let idx = 0; idx < sortedTimestamps.length; idx++) {
        const tKey = sortedTimestamps[idx]; // Format: "YYYYMMDD_HH"
        const year = parseInt(tKey.substring(0, 4), 10);
        const month = parseInt(tKey.substring(4, 6), 10) - 1;
        const day = parseInt(tKey.substring(6, 8), 10);
        const hour = parseInt(tKey.substring(9, 11), 10);

        const tDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        
        // As soon as we find a time step >= 'now', take it immediately!
        if (tDate >= now) {
            return idx;
        }
    }

    // 3. Last resort (pipeline delay):
    // If all else fails and ALL data is in past,
    // stubbornly take newest available entry (end of list).
    return sortedTimestamps.length - 1;
}
