/**
 * Tests for src/core/calendar.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCalendarProvider,
  type CalendarProvider,
  type CalendarEvent,
  type CalendarAttendee,
  type CalendarOptions,
  type AttendeeStatus,
} from '../../src/core/calendar.js';
import { getDefaultConfig } from '../../src/core/config.js';
import type { AreteConfig } from '../../src/types.js';

describe('calendar', () => {
  describe('getCalendarProvider', () => {
    it('returns null when no calendar integration configured', () => {
      const config = getDefaultConfig();
      const provider = getCalendarProvider(config);
      assert.equal(provider, null);
    });

    it('returns null when calendar config exists but no provider specified', () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            calendars: ['Work', 'Personal'],
          },
        },
      };
      const provider = getCalendarProvider(config);
      assert.equal(provider, null);
    });

    it('returns null when calendar config has empty provider', () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            provider: '',
          },
        },
      };
      const provider = getCalendarProvider(config);
      assert.equal(provider, null);
    });

    it('returns null for now even with valid provider (C2 implementation pending)', () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            provider: 'ical-buddy',
            calendars: ['Work'],
          },
        },
      };
      const provider = getCalendarProvider(config);
      // For now, always returns null - providers will be added in C2
      assert.equal(provider, null);
    });
  });

  describe('types', () => {
    it('CalendarEvent type has required fields', () => {
      const event: CalendarEvent = {
        title: 'Team Meeting',
        startTime: new Date('2026-02-09T10:00:00'),
        endTime: new Date('2026-02-09T11:00:00'),
        calendar: 'Work',
        attendees: [],
        isAllDay: false,
      };
      assert.equal(event.title, 'Team Meeting');
      assert.ok(event.startTime instanceof Date);
      assert.ok(event.endTime instanceof Date);
      assert.equal(event.isAllDay, false);
    });

    it('CalendarEvent type accepts optional fields', () => {
      const event: CalendarEvent = {
        title: 'Team Meeting',
        startTime: new Date('2026-02-09T10:00:00'),
        endTime: new Date('2026-02-09T11:00:00'),
        calendar: 'Work',
        location: 'Conference Room A',
        notes: 'Discuss Q1 goals',
        attendees: [
          {
            name: 'Jane Doe',
            email: 'jane@example.com',
            status: 'accepted',
          },
        ],
        isAllDay: false,
      };
      assert.equal(event.location, 'Conference Room A');
      assert.equal(event.notes, 'Discuss Q1 goals');
      assert.equal(event.attendees.length, 1);
    });

    it('CalendarAttendee type has required name field', () => {
      const attendee: CalendarAttendee = {
        name: 'Jane Doe',
      };
      assert.equal(attendee.name, 'Jane Doe');
    });

    it('CalendarAttendee type accepts optional fields', () => {
      const attendee: CalendarAttendee = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        status: 'accepted',
      };
      assert.equal(attendee.email, 'jane@example.com');
      assert.equal(attendee.status, 'accepted');
    });

    it('AttendeeStatus type accepts valid values', () => {
      const statuses: AttendeeStatus[] = ['accepted', 'declined', 'tentative', 'none'];
      assert.equal(statuses.length, 4);
    });

    it('CalendarOptions type accepts calendars filter', () => {
      const options: CalendarOptions = {
        calendars: ['Work', 'Personal'],
      };
      assert.deepEqual(options.calendars, ['Work', 'Personal']);
    });

    it('CalendarOptions type can be empty', () => {
      const options: CalendarOptions = {};
      assert.ok(options);
    });

    it('CalendarProvider interface has expected methods', () => {
      // This is a compile-time check - if types are wrong, TypeScript will error
      const mockProvider: CalendarProvider = {
        name: 'mock',
        async isAvailable() {
          return true;
        },
        async getTodayEvents(options?: CalendarOptions) {
          return [];
        },
        async getUpcomingEvents(days: number, options?: CalendarOptions) {
          return [];
        },
      };
      assert.equal(mockProvider.name, 'mock');
      assert.equal(typeof mockProvider.isAvailable, 'function');
      assert.equal(typeof mockProvider.getTodayEvents, 'function');
      assert.equal(typeof mockProvider.getUpcomingEvents, 'function');
    });
  });
});
