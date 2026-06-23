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

// Format an ISO date string or Date object to local display "DD.MM. HH:MM"
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
 * ZENTRALE ZEITLOGIK: Bestimmt den passenden Index für die Timeline.
 * Sucht bevorzugt nach dem exakten vorherigen Zeitstempel (Zustandserhalt).
 * Falls dieser nicht existiert, wird der zeitlich am nächsten liegende zukünftige Index ermittelt.
 * * @param {string[]} sortedTimestamps - Die sortierten Zeitstempel vom Server
 * @param {string|null} prevActiveTimestamp - Der aktuell im Modell aktive Zeitstempel
 * @returns {number} Der zu setzende aktive Index
 */
export function determineActiveIndex(sortedTimestamps, prevActiveTimestamp) {
    // Sicherheitsanker: Leere Listen abfangen
    if (!sortedTimestamps || sortedTimestamps.length === 0) return 0;

    // 1. Zustandserhalt: Wenn der alte Timestamp existiert, nimm direkt dessen Index
    if (prevActiveTimestamp) {
        const exactMatchIndex = sortedTimestamps.indexOf(prevActiveTimestamp);
        if (exactMatchIndex !== -1) return exactMatchIndex;
    }

    // 2. Fallback für Kaltstart / >24 Stunden Inaktivität:
    // Wir suchen den ERSTEN Eintrag, der JETZT oder in der Zukunft liegt.
    const now = new Date();
    
    for (let idx = 0; idx < sortedTimestamps.length; idx++) {
        const tKey = sortedTimestamps[idx]; // Format: "YYYYMMDD_HH"
        const year = parseInt(tKey.substring(0, 4), 10);
        const month = parseInt(tKey.substring(4, 6), 10) - 1;
        const day = parseInt(tKey.substring(6, 8), 10);
        const hour = parseInt(tKey.substring(9, 11), 10);

        const tDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        
        // Sobald wir einen Zeitschritt finden, der >= "Jetzt" ist, nehmen wir ihn sofort!
        if (tDate >= now) {
            return idx;
        }
    }

    // 3. Letzter Rettungsanker (Pipeline-Verzug): 
    // Sollten alle Stricke reißen und ALLE Daten in der Vergangenheit liegen,
    // nimm stur den neuesten verfügbaren Eintrag (das Ende der Liste).
    return sortedTimestamps.length - 1;
}