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
export declare function parseDate(dateStr: string | null | undefined): string | null;
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
export declare function isoWeekStamp(date?: Date): string;
/**
 * Format duration in minutes to human-readable string.
 *
 * @param minutes - Duration in minutes
 * @returns Human-readable string (e.g., "30 minutes", "1 hour", "1h 30m")
 */
export declare function formatDuration(minutes: number): string;
//# sourceMappingURL=dates.d.ts.map