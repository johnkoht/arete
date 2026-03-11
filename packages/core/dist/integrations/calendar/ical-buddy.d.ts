/**
 * IcalBuddy calendar provider — macOS Calendar via icalBuddy CLI.
 * Integrations may use fs/child_process (infrastructure).
 */
import type { CalendarProvider } from './types.js';
export declare function getIcalBuddyProvider(): CalendarProvider;
/**
 * Parse `icalBuddy calendars` output into calendar names.
 * Calendar names are lines starting with `• ` (U+2022 bullet + space).
 * Metadata lines (type, UID, etc.) are indented and do not start with `• `.
 */
export declare function parseIcalBuddyCalendars(stdout: string): string[];
export interface IcalBuddyCalendarDeps {
    which?: (cmd: string) => {
        status: number | null;
        stdout: string;
    };
    exec?: (cmd: string, args: string[]) => Promise<{
        stdout: string;
    }>;
}
/**
 * List available macOS calendars via `icalBuddy calendars`.
 * Returns `{ available: false, calendars: [] }` when icalBuddy is not found
 * or the command fails for any reason (no throw).
 */
export declare function listIcalBuddyCalendars(deps?: IcalBuddyCalendarDeps): Promise<{
    available: boolean;
    calendars: string[];
}>;
//# sourceMappingURL=ical-buddy.d.ts.map