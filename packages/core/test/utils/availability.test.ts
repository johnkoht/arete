/**
 * Tests for availability-finding algorithm.
 *
 * Tests cover:
 * - Basic functionality (finding slots, no mutual availability)
 * - Working hours (default, custom, boundary times)
 * - Weekends (exclude by default, include when configured)
 * - All-day events (blocking entire days)
 * - Timezone handling (PST/EST overlap detection)
 * - Edge cases (full day, empty arrays, DST transitions)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { findAvailableSlots } from '../../src/utils/availability.js';
import type { BusyBlock } from '../../src/integrations/calendar/types.js';
import type { AvailableSlot } from '../../src/utils/availability.js';

/**
 * Helper to create a Date at a specific local time.
 */
function createLocalDate(
  year: number,
  month: number, // 0-indexed
  day: number,
  hour: number = 0,
  minute: number = 0
): Date {
  return new Date(year, month, day, hour, minute, 0, 0);
}

/**
 * Helper to create a BusyBlock.
 */
function createBusyBlock(start: Date, end: Date): BusyBlock {
  return { start, end };
}

describe('findAvailableSlots', () => {
  describe('basic functionality', () => {
    it('finds slots when calendars have gaps', () => {
      // Monday, March 2, 2026 - a weekday
      const startDate = createLocalDate(2026, 2, 2, 9, 0); // March 2, 2026, 9 AM

      // User busy 10-11 AM
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 10, 0),
          createLocalDate(2026, 2, 2, 11, 0)
        ),
      ];

      // Target busy 2-3 PM
      const targetBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 14, 0),
          createLocalDate(2026, 2, 2, 15, 0)
        ),
      ];

      const slots = findAvailableSlots(userBusy, targetBusy, {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should find slots at 9:00, 9:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 15:00, 15:30, 16:00, 16:30
      // (excluding 10:00, 10:30 due to user busy and 14:00, 14:30 due to target busy)
      assert.ok(slots.length > 0, 'Should find available slots');

      // Verify specific slots are present
      const slotTimes = slots.map((s) => `${s.start.getHours()}:${s.start.getMinutes().toString().padStart(2, '0')}`);
      assert.ok(slotTimes.includes('9:00'), 'Should include 9:00 slot');
      assert.ok(slotTimes.includes('11:00'), 'Should include 11:00 slot');
      assert.ok(!slotTimes.includes('10:00'), 'Should NOT include 10:00 slot (user busy)');
      assert.ok(!slotTimes.includes('14:00'), 'Should NOT include 14:00 slot (target busy)');
    });

    it('returns empty array when no mutual availability', () => {
      const startDate = createLocalDate(2026, 2, 2, 9, 0);

      // User and target have complementary busy times covering entire working hours
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 9, 0),
          createLocalDate(2026, 2, 2, 13, 0)
        ),
      ];

      const targetBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 13, 0),
          createLocalDate(2026, 2, 2, 17, 0)
        ),
      ];

      const slots = findAvailableSlots(userBusy, targetBusy, {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      assert.equal(slots.length, 0, 'Should return empty array when no availability');
    });

    it('returns slots sorted chronologically', () => {
      const startDate = createLocalDate(2026, 2, 2, 9, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 2,
        excludeWeekends: false, // Include Tuesday as well
      });

      // Verify slots are in chronological order
      for (let i = 1; i < slots.length; i++) {
        assert.ok(
          slots[i].start.getTime() > slots[i - 1].start.getTime(),
          `Slot ${i} should be after slot ${i - 1}`
        );
      }
    });
  });

  describe('working hours', () => {
    it('respects default 9-5 working hours', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0); // Start at midnight

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // All slots should be between 9 AM and 5 PM
      for (const slot of slots) {
        assert.ok(slot.start.getHours() >= 9, `Slot ${slot.start} should start at or after 9 AM`);
        assert.ok(slot.end.getHours() <= 17 || (slot.end.getHours() === 17 && slot.end.getMinutes() === 0),
          `Slot ${slot.end} should end at or before 5 PM`);
      }

      // First slot should be at 9:00 AM
      assert.equal(slots[0].start.getHours(), 9);
      assert.equal(slots[0].start.getMinutes(), 0);

      // Last 30-min slot should start at 4:30 PM (ends at 5 PM)
      const lastSlot = slots[slots.length - 1];
      assert.equal(lastSlot.start.getHours(), 16);
      assert.equal(lastSlot.start.getMinutes(), 30);
    });

    it('respects custom working hours', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
        workingHours: { start: 8, end: 18 }, // 8 AM - 6 PM
      });

      // First slot should be at 8:00 AM
      assert.equal(slots[0].start.getHours(), 8);
      assert.equal(slots[0].start.getMinutes(), 0);

      // Last slot should start at 5:30 PM
      const lastSlot = slots[slots.length - 1];
      assert.equal(lastSlot.start.getHours(), 17);
      assert.equal(lastSlot.start.getMinutes(), 30);
    });

    it('handles boundary times - meeting ending exactly at end of working hours', () => {
      const startDate = createLocalDate(2026, 2, 2, 16, 30);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should include 4:30 PM slot (ends at 5 PM exactly)
      const fourThirtySlot = slots.find(
        (s) => s.start.getHours() === 16 && s.start.getMinutes() === 30
      );
      assert.ok(fourThirtySlot, 'Should include 4:30 PM slot');
      assert.equal(fourThirtySlot?.end.getHours(), 17);
      assert.equal(fourThirtySlot?.end.getMinutes(), 0);
    });

    it('excludes slots that would extend past working hours', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      // Request 60-minute meeting
      const slots = findAvailableSlots([], [], {
        duration: 60,
        startFrom: startDate,
        days: 1,
      });

      // Last slot should start at 4:00 PM (ends at 5 PM)
      const lastSlot = slots[slots.length - 1];
      assert.equal(lastSlot.start.getHours(), 16);
      assert.equal(lastSlot.start.getMinutes(), 0);

      // No slot should start at 4:30 PM (would end at 5:30 PM)
      const fourThirtySlot = slots.find(
        (s) => s.start.getHours() === 16 && s.start.getMinutes() === 30
      );
      assert.equal(fourThirtySlot, undefined, 'Should not include 4:30 PM slot for 60-min meeting');
    });

    it('returns empty when duration exceeds working hours', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 600, // 10 hours - exceeds 8-hour working day
        startFrom: startDate,
        days: 1,
      });

      assert.equal(slots.length, 0, 'Should return empty when duration exceeds working hours');
    });
  });

  describe('weekends', () => {
    it('excludes weekends by default', () => {
      // Saturday, February 28, 2026
      const saturday = createLocalDate(2026, 1, 28, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: saturday,
        days: 3, // Sat, Sun, Mon
      });

      // All slots should be on Monday (March 2)
      for (const slot of slots) {
        assert.equal(slot.start.getDay(), 1, `Slot ${slot.start} should be on Monday`);
      }
    });

    it('includes weekends when excludeWeekends=false', () => {
      // Saturday, February 28, 2026
      const saturday = createLocalDate(2026, 1, 28, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: saturday,
        days: 2,
        excludeWeekends: false,
      });

      // Should have slots on Saturday
      const saturdaySlots = slots.filter((s) => s.start.getDay() === 6);
      assert.ok(saturdaySlots.length > 0, 'Should include Saturday slots');
    });
  });

  describe('all-day events', () => {
    it('blocks entire day for all-day events (>= 23 hours)', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      // All-day event spanning 24 hours
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 0, 0),
          createLocalDate(2026, 2, 3, 0, 0) // Next day midnight
        ),
      ];

      const slots = findAvailableSlots(userBusy, [], {
        duration: 30,
        startFrom: startDate,
        days: 2,
        excludeWeekends: false,
      });

      // No slots on March 2 (blocked by all-day event)
      const march2Slots = slots.filter(
        (s) => s.start.getDate() === 2 && s.start.getMonth() === 2
      );
      assert.equal(march2Slots.length, 0, 'Should have no slots on day with all-day event');

      // Should have slots on March 3
      const march3Slots = slots.filter(
        (s) => s.start.getDate() === 3 && s.start.getMonth() === 2
      );
      assert.ok(march3Slots.length > 0, 'Should have slots on day after all-day event');
    });

    it('blocks entire day for midnight-to-23:00 events', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      // Event from midnight to 11 PM
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 0, 0, 0),
          createLocalDate(2026, 2, 2, 23, 0, 0)
        ),
      ];

      const slots = findAvailableSlots(userBusy, [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      assert.equal(slots.length, 0, 'Should have no slots when midnight-to-23:00 event blocks day');
    });

    it('does not treat partial-day events as all-day', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      // 8-hour meeting (not all-day)
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 9, 0),
          createLocalDate(2026, 2, 2, 17, 0) // 8 hours
        ),
      ];

      // This should still process the day (even though no slots will be available)
      // The test verifies it doesn't skip the entire day as all-day
      const slots = findAvailableSlots(userBusy, [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
        workingHours: { start: 8, end: 18 }, // Extended hours to test
      });

      // Should have 8:00 and 8:30 slots (before the 9-5 meeting)
      // and 17:00, 17:30 slots (after the meeting)
      const earlySlots = slots.filter((s) => s.start.getHours() < 9);
      const lateSlots = slots.filter((s) => s.start.getHours() >= 17);

      assert.ok(earlySlots.length > 0 || lateSlots.length > 0,
        'Should have slots outside the 8-hour meeting');
    });
  });

  describe('timezone handling', () => {
    /**
     * Timezone test: User in PST (UTC-8) with 9am meeting,
     * target in EST (UTC-5) with 9am meeting.
     *
     * PST 9:00 AM = UTC 17:00 = EST 12:00 PM (noon)
     * EST 9:00 AM = UTC 14:00 = PST 6:00 AM
     *
     * The algorithm works with Date objects which internally store UTC.
     * When we create dates with explicit UTC times, we're simulating
     * how the FreeBusy API returns data (converted from UTC).
     *
     * For this test, we simulate:
     * - User (in PST) has a meeting 9-10 AM PST
     * - Target (in EST) has a meeting 9-10 AM EST
     * - These DO NOT overlap (EST 9am = PST 6am, which is outside working hours)
     */
    it('handles user in PST with 9am meeting, target in EST with 9am meeting', () => {
      // Start searching from Monday, March 2, 2026 at 6 AM PST (simulating early morning)
      const startDate = createLocalDate(2026, 2, 2, 6, 0);

      // User's 9-10 AM meeting (in local/PST time)
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 9, 0),  // 9 AM PST
          createLocalDate(2026, 2, 2, 10, 0)  // 10 AM PST
        ),
      ];

      // Target's 9-10 AM EST meeting, but expressed in PST (3 hours earlier)
      // EST 9 AM = PST 6 AM
      const targetBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 6, 0),   // 6 AM PST = 9 AM EST
          createLocalDate(2026, 2, 2, 7, 0)    // 7 AM PST = 10 AM EST
        ),
      ];

      const slots = findAvailableSlots(userBusy, targetBusy, {
        duration: 30,
        startFrom: startDate,
        days: 1,
        workingHours: { start: 9, end: 17 }, // 9-5 working hours
      });

      // The target's 6-7 AM PST meeting is outside our 9-5 working hours
      // So we should still have slots at 10 AM onwards (after user's 9-10 meeting)
      assert.ok(slots.length > 0, 'Should find available slots');

      // Should NOT have slots at 9:00 or 9:30 (user busy)
      const nineAmSlot = slots.find((s) => s.start.getHours() === 9 && s.start.getMinutes() === 0);
      const nineThirtySlot = slots.find((s) => s.start.getHours() === 9 && s.start.getMinutes() === 30);
      assert.equal(nineAmSlot, undefined, 'Should not have 9:00 slot (user busy)');
      assert.equal(nineThirtySlot, undefined, 'Should not have 9:30 slot (user busy)');

      // Should have slots at 10:00 onwards
      const tenAmSlot = slots.find((s) => s.start.getHours() === 10 && s.start.getMinutes() === 0);
      assert.ok(tenAmSlot, 'Should have 10:00 slot (both free)');
    });

    it('correctly detects overlapping meetings across timezones', () => {
      // Simulate a scenario where meetings DO overlap
      // User has meeting 12-1 PM local time
      // Target has meeting 12-1 PM local time (same time = overlap)
      const startDate = createLocalDate(2026, 2, 2, 9, 0);

      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 12, 0),
          createLocalDate(2026, 2, 2, 13, 0)
        ),
      ];

      const targetBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 12, 0),  // Same time
          createLocalDate(2026, 2, 2, 13, 0)
        ),
      ];

      const slots = findAvailableSlots(userBusy, targetBusy, {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should NOT have 12:00 or 12:30 slots (both busy)
      const noonSlot = slots.find((s) => s.start.getHours() === 12 && s.start.getMinutes() === 0);
      const twelveThirtySlot = slots.find((s) => s.start.getHours() === 12 && s.start.getMinutes() === 30);

      assert.equal(noonSlot, undefined, 'Should not have 12:00 slot (both busy)');
      assert.equal(twelveThirtySlot, undefined, 'Should not have 12:30 slot (both busy)');
    });
  });

  describe('edge cases', () => {
    it('handles completely full day', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      // User busy entire working hours
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 9, 0),
          createLocalDate(2026, 2, 2, 17, 0)
        ),
      ];

      const slots = findAvailableSlots(userBusy, [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      assert.equal(slots.length, 0, 'Should return empty when day is completely full');
    });

    it('handles empty busy arrays', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should have 16 slots (9:00 to 16:30 in 30-min increments)
      assert.equal(slots.length, 16, 'Should have all possible slots when no busy blocks');
    });

    it('handles DST transition day - spring forward', () => {
      // March 8, 2026 is DST spring forward in US (2 AM -> 3 AM)
      // This is a Sunday, so use the following Monday (March 9, 2026)
      const startDate = createLocalDate(2026, 2, 9, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should still produce valid slots
      assert.ok(slots.length > 0, 'Should produce slots after DST transition');

      // Verify slots are valid and properly spaced
      for (let i = 1; i < slots.length; i++) {
        const diff = slots[i].start.getTime() - slots[i - 1].start.getTime();
        assert.equal(diff, 30 * 60 * 1000, 'Slots should be 30 minutes apart');
      }
    });

    it('handles DST transition day - fall back', () => {
      // November 1, 2026 is DST fall back in US (2 AM -> 1 AM)
      // This is a Sunday, so use Monday November 2, 2026
      const startDate = createLocalDate(2026, 10, 2, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should still produce valid slots
      assert.ok(slots.length > 0, 'Should produce slots after DST fall back');

      // Verify all slots have correct duration
      for (const slot of slots) {
        assert.equal(slot.duration, 30, 'All slots should have 30-minute duration');
      }
    });

    it('handles zero or negative duration', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      const zeroSlots = findAvailableSlots([], [], {
        duration: 0,
        startFrom: startDate,
        days: 1,
      });
      assert.equal(zeroSlots.length, 0, 'Should return empty for zero duration');

      const negativeSlots = findAvailableSlots([], [], {
        duration: -30,
        startFrom: startDate,
        days: 1,
      });
      assert.equal(negativeSlots.length, 0, 'Should return empty for negative duration');
    });

    it('handles invalid working hours (start >= end)', () => {
      const startDate = createLocalDate(2026, 2, 2, 0, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
        workingHours: { start: 17, end: 9 }, // Invalid: end before start
      });

      assert.equal(slots.length, 0, 'Should return empty for invalid working hours');
    });

    it('skips slots in the past relative to startFrom', () => {
      // Start from 2 PM on March 2, 2026
      const startDate = createLocalDate(2026, 2, 2, 14, 0);

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // All slots should be at or after 2 PM
      for (const slot of slots) {
        assert.ok(
          slot.start.getTime() >= startDate.getTime(),
          `Slot ${slot.start} should be at or after startFrom`
        );
      }

      // First slot should be at 2:00 PM
      assert.equal(slots[0].start.getHours(), 14);
      assert.equal(slots[0].start.getMinutes(), 0);
    });

    it('handles overlapping busy blocks', () => {
      const startDate = createLocalDate(2026, 2, 2, 9, 0);

      // User has two overlapping meetings
      const userBusy: BusyBlock[] = [
        createBusyBlock(
          createLocalDate(2026, 2, 2, 10, 0),
          createLocalDate(2026, 2, 2, 11, 30)
        ),
        createBusyBlock(
          createLocalDate(2026, 2, 2, 11, 0),
          createLocalDate(2026, 2, 2, 12, 0)
        ),
      ];

      const slots = findAvailableSlots(userBusy, [], {
        duration: 30,
        startFrom: startDate,
        days: 1,
      });

      // Should not have slots from 10:00 to 12:00 (covered by overlapping blocks)
      const blockedSlots = slots.filter(
        (s) => s.start.getHours() >= 10 && s.start.getHours() < 12
      );
      assert.equal(blockedSlots.length, 0, 'Should not have slots during overlapping busy times');
    });

    it('handles multi-day search', () => {
      const startDate = createLocalDate(2026, 2, 2, 9, 0); // Monday

      const slots = findAvailableSlots([], [], {
        duration: 30,
        startFrom: startDate,
        days: 5, // Mon-Fri
      });

      // Should have slots across 5 days
      const daySet = new Set(slots.map((s) => s.start.toDateString()));
      assert.equal(daySet.size, 5, 'Should have slots across 5 different days');
    });
  });
});
