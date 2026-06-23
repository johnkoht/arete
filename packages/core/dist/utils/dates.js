/**
 * Date parsing and duration formatting utilities.
 *
 * Ported from scripts/integrations/utils.py
 */
/**
 * Parse various date formats to YYYY-MM-DD.
 *
 * @param dateStr - Date string in various formats
 * @returns Date string in YYYY-MM-DD format, or null if unparseable
 */
export function parseDate(dateStr) {
    if (dateStr == null || dateStr === '') {
        return null;
    }
    // Already in correct format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    // ISO format with time
    if (dateStr.includes('T')) {
        return dateStr.split('T')[0] ?? null;
    }
    // Try common formats
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch)
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const slashMatch = dateStr.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (slashMatch)
        return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
    const usSlashMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usSlashMatch)
        return `${usSlashMatch[3]}-${usSlashMatch[1]}-${usSlashMatch[2]}`;
    const usDashMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (usDashMatch)
        return `${usDashMatch[3]}-${usDashMatch[1]}-${usDashMatch[2]}`;
    // Long month format: February 05, 2026
    const longMonthMatch = dateStr.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/);
    if (longMonthMatch) {
        const months = {
            January: '01', February: '02', March: '03', April: '04',
            May: '05', June: '06', July: '07', August: '08',
            September: '09', October: '10', November: '11', December: '12',
        };
        const month = months[longMonthMatch[1]];
        const day = longMonthMatch[2].padStart(2, '0');
        const year = longMonthMatch[3];
        return `${year}-${month}-${day}`;
    }
    // Short month format: Feb 05, 2026
    const shortMonthMatch = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/);
    if (shortMonthMatch) {
        const months = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04',
            May: '05', Jun: '06', Jul: '07', Aug: '08',
            Sep: '09', Oct: '10', Nov: '11', Dec: '12',
        };
        const month = months[shortMonthMatch[1]];
        const day = shortMonthMatch[2].padStart(2, '0');
        const year = shortMonthMatch[3];
        return `${year}-${month}-${day}`;
    }
    return null;
}
/**
 * ISO-8601 week-numbering stamp for a date, as `YYYY-Www` (e.g. `2026-W26`).
 *
 * Uses the canonical ISO rule (the week's Thursday determines the
 * week-numbering year), computed in UTC to avoid local-timezone drift — the
 * same class of bug prior Areté date code has hit. Reused by the week-memory
 * store for week-aware archiving (see services/week-memory.ts).
 *
 * @param date - The date to stamp (defaults to now).
 * @returns Week stamp in `YYYY-Www` format with a zero-padded week number.
 */
export function isoWeekStamp(date = new Date()) {
    // Work on a UTC copy normalized to midnight.
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // ISO weekday: Mon=1 .. Sun=7.
    const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    // Shift to the Thursday of this week — its year is the ISO week-year.
    d.setUTCDate(d.getUTCDate() + 4 - isoDay);
    const isoYear = d.getUTCFullYear();
    // Week 1 contains Jan 4th; count weeks from Jan 1st of the ISO year.
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
/**
 * Format duration in minutes to human-readable string.
 *
 * @param minutes - Duration in minutes
 * @returns Human-readable string (e.g., "30 minutes", "1 hour", "1h 30m")
 */
export function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (remaining === 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `${hours}h ${remaining}m`;
}
//# sourceMappingURL=dates.js.map