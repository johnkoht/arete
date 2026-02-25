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
 * Format duration in minutes to human-readable string.
 *
 * @param minutes - Duration in minutes
 * @returns Human-readable string (e.g., "30 minutes", "1 hour", "1h 30m")
 */
export declare function formatDuration(minutes: number): string;
//# sourceMappingURL=dates.d.ts.map