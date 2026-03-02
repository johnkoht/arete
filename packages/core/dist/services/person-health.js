/**
 * Relationship health computation for person profiles.
 *
 * Pure computation — no I/O, no external dependencies.
 * Accepts meeting dates and open item count, returns health metrics
 * with an indicator (active/regular/cooling/dormant).
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ACTIVE_THRESHOLD_DAYS = 14;
const REGULAR_THRESHOLD_DAYS = 30;
const COOLING_THRESHOLD_DAYS = 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
/**
 * Compute the number of whole days between two dates (date-only, ignoring time).
 * Both dates are normalized to midnight UTC to avoid timezone/DST issues.
 */
function daysBetween(a, b) {
    const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    return Math.floor(Math.abs(bDay - aDay) / MS_PER_DAY);
}
/**
 * Parse a YYYY-MM-DD string into a Date (midnight UTC).
 * Returns null for invalid strings.
 */
function parseDateString(dateStr) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const d = new Date(Date.UTC(year, month, day));
    // Validate the date components round-trip (catches e.g. Feb 30)
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
        return null;
    }
    return d;
}
function classifyIndicator(daysSinceLastMet) {
    if (daysSinceLastMet === null)
        return 'dormant';
    if (daysSinceLastMet <= ACTIVE_THRESHOLD_DAYS)
        return 'active';
    if (daysSinceLastMet <= REGULAR_THRESHOLD_DAYS)
        return 'regular';
    if (daysSinceLastMet <= COOLING_THRESHOLD_DAYS)
        return 'cooling';
    return 'dormant';
}
/**
 * Compute relationship health metrics from meeting dates and open item count.
 *
 * @param meetingDates - Array of YYYY-MM-DD date strings
 * @param openItemCount - Number of open action items / loops
 * @param referenceDate - Pin the "current date" for testability (defaults to now)
 */
export function computeRelationshipHealth(meetingDates, openItemCount, referenceDate) {
    const ref = referenceDate ?? new Date();
    // Parse and filter valid dates, sort descending
    const parsed = meetingDates
        .map((d) => ({ str: d, date: parseDateString(d) }))
        .filter((entry) => entry.date !== null)
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    if (parsed.length === 0) {
        return {
            lastMet: null,
            daysSinceLastMet: null,
            meetingsLast30Days: 0,
            meetingsLast90Days: 0,
            openLoopCount: openItemCount,
            indicator: 'dormant',
        };
    }
    const lastMet = parsed[0].str;
    const daysSinceLastMet = daysBetween(parsed[0].date, ref);
    let meetingsLast30Days = 0;
    let meetingsLast90Days = 0;
    for (const entry of parsed) {
        const days = daysBetween(entry.date, ref);
        if (days <= 30)
            meetingsLast30Days++;
        if (days <= 90)
            meetingsLast90Days++;
    }
    return {
        lastMet,
        daysSinceLastMet,
        meetingsLast30Days,
        meetingsLast90Days,
        openLoopCount: openItemCount,
        indicator: classifyIndicator(daysSinceLastMet),
    };
}
//# sourceMappingURL=person-health.js.map