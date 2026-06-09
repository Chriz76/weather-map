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
