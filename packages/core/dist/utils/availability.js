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
const DEFAULT_WORKING_HOURS = { start: 9, end: 17 };
const DEFAULT_DAYS = 7;
const SLOT_INCREMENT_MINUTES = 30;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const ALL_DAY_THRESHOLD_HOURS = 23;
/**
 * Check if a busy block represents an all-day event.
 * An all-day event either:
 * - Spans >= 23 hours, OR
 * - Starts at midnight (00:00:00) and ends at or after 23:00
 */
function isAllDayEvent(block) {
    const durationHours = (block.end.getTime() - block.start.getTime()) / (1000 * 60 * 60);
    if (durationHours >= ALL_DAY_THRESHOLD_HOURS) {
        return true;
    }
    // Check for midnight start with late end
    const startHours = block.start.getHours();
    const startMinutes = block.start.getMinutes();
    const startSeconds = block.start.getSeconds();
    const endHours = block.end.getHours();
    if (startHours === 0 && startMinutes === 0 && startSeconds === 0 && endHours >= 23) {
        return true;
    }
    return false;
}
/**
 * Check if a date falls on a weekend (Saturday = 6, Sunday = 0).
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}
/**
 * Check if two time ranges overlap.
 * Overlap occurs when: start1 < end2 AND start2 < end1
 */
function rangesOverlap(start1, end1, start2, end2) {
    return start1.getTime() < end2.getTime() && start2.getTime() < end1.getTime();
}
/**
 * Check if a candidate slot overlaps with any busy block.
 */
function overlapsWithBusy(slotStart, slotEnd, busyBlocks) {
    return busyBlocks.some((block) => rangesOverlap(slotStart, slotEnd, block.start, block.end));
}
/**
 * Check if a day is completely blocked by an all-day event.
 */
function isDayBlockedByAllDayEvent(date, busyBlocks) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return busyBlocks.some((block) => {
        if (!isAllDayEvent(block)) {
            return false;
        }
        // Check if the all-day event covers this day
        return rangesOverlap(dayStart, dayEnd, block.start, block.end);
    });
}
/**
 * Generate candidate slot start times for a single day.
 * Slots are generated at SLOT_INCREMENT_MINUTES intervals within working hours.
 */
function generateCandidateSlotsForDay(date, workingHours, duration) {
    const candidates = [];
    const dayStart = new Date(date);
    dayStart.setHours(workingHours.start, 0, 0, 0);
    // Calculate the latest possible start time (must end before working hours end)
    const latestStartMinutes = workingHours.end * MINUTES_PER_HOUR - duration;
    const earliestStartMinutes = workingHours.start * MINUTES_PER_HOUR;
    for (let minutes = earliestStartMinutes; minutes <= latestStartMinutes; minutes += SLOT_INCREMENT_MINUTES) {
        const slotStart = new Date(date);
        slotStart.setHours(0, 0, 0, 0);
        slotStart.setMinutes(minutes);
        candidates.push(slotStart);
    }
    return candidates;
}
/**
 * Find available time slots where both user and target calendars are free.
 *
 * @param userBusy - Busy blocks from the user's calendar
 * @param targetBusy - Busy blocks from the target person's calendar
 * @param options - Search options (duration, working hours, days, etc.)
 * @returns Array of available slots, sorted chronologically
 */
export function findAvailableSlots(userBusy, targetBusy, options) {
    const { duration, workingHours = DEFAULT_WORKING_HOURS, days = DEFAULT_DAYS, excludeWeekends = true, startFrom = new Date(), } = options;
    // Validate inputs
    if (duration <= 0) {
        return [];
    }
    if (workingHours.start >= workingHours.end) {
        return [];
    }
    // Check if duration fits within working hours
    const workingHoursDuration = (workingHours.end - workingHours.start) * MINUTES_PER_HOUR;
    if (duration > workingHoursDuration) {
        return [];
    }
    const allBusy = [...userBusy, ...targetBusy];
    const availableSlots = [];
    // Iterate through each day
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const currentDate = new Date(startFrom);
        currentDate.setDate(currentDate.getDate() + dayOffset);
        currentDate.setHours(0, 0, 0, 0);
        // Skip weekends if configured
        if (excludeWeekends && isWeekend(currentDate)) {
            continue;
        }
        // Skip if any all-day event blocks this day
        if (isDayBlockedByAllDayEvent(currentDate, allBusy)) {
            continue;
        }
        // Generate candidate slots for this day
        const candidates = generateCandidateSlotsForDay(currentDate, workingHours, duration);
        // Filter out slots that overlap with busy blocks
        for (const slotStart of candidates) {
            // Skip slots in the past
            if (slotStart.getTime() < startFrom.getTime()) {
                continue;
            }
            const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
            if (!overlapsWithBusy(slotStart, slotEnd, allBusy)) {
                availableSlots.push({
                    start: slotStart,
                    end: slotEnd,
                    duration,
                });
            }
        }
    }
    // Sort chronologically (should already be sorted, but ensure)
    availableSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    return availableSlots;
}
//# sourceMappingURL=availability.js.map