/**
 * Availability-finding algorithm.
 *
 * Pure utility: given busy blocks + constraints, find available slots
 * where both user and target calendars are free.
 *
 * Timezone Handling:
 * - All Date objects are in the system's local timezone (JavaScript default)
 * - BusyBlocks from FreeBusy API are UTC but already converted to local Date objects
 * - Working hours (e.g., 9-5) are interpreted as local time
 * - The algorithm compares Date objects directly using getTime() which is timezone-agnostic
 */
import type { BusyBlock } from '../integrations/calendar/types.js';
/**
 * A slot of available time for scheduling.
 */
export interface AvailableSlot {
    start: Date;
    end: Date;
    duration: number;
}
/**
 * Options for finding available slots.
 */
export interface FindAvailableSlotsOptions {
    /** Required meeting duration in minutes */
    duration: number;
    /** Working hours (default: { start: 9, end: 17 } for 9 AM - 5 PM) */
    workingHours?: {
        start: number;
        end: number;
    };
    /** Number of days to search (default: 7) */
    days?: number;
    /** Exclude weekends (default: true) */
    excludeWeekends?: boolean;
    /** Date to start searching from (default: now) */
    startFrom?: Date;
}
/**
 * Find available time slots where both user and target calendars are free.
 *
 * @param userBusy - Busy blocks from the user's calendar
 * @param targetBusy - Busy blocks from the target person's calendar
 * @param options - Search options (duration, working hours, days, etc.)
 * @returns Array of available slots, sorted chronologically
 */
export declare function findAvailableSlots(userBusy: BusyBlock[], targetBusy: BusyBlock[], options: FindAvailableSlotsOptions): AvailableSlot[];
//# sourceMappingURL=availability.d.ts.map