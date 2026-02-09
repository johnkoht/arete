/**
 * Tests for IcalBuddy calendar provider
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IcalBuddyTestDeps } from '../../../src/core/calendar-providers/ical-buddy.js';
import {
  getProvider,
  parseEventBlock,
  parseIcalBuddyOutput,
  ICAL_BUDDY_PROVIDER_NAME,
} from '../../../src/core/calendar-providers/ical-buddy.js';

describe('IcalBuddy Calendar Provider', () => {
  describe('parseAttendee', () => {
    it('should parse attendee with name and email', () => {
      const block = `• Test Event
    attendees: Jane Doe <jane@example.com>
    2026-02-09 at 14:00 - 15:00`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.attendees.length, 1);
      assert.strictEqual(event.attendees[0].name, 'Jane Doe');
      assert.strictEqual(event.attendees[0].email, 'jane@example.com');
    });

    it('should parse attendee with name only', () => {
      const block = `• Test Event
    attendees: John Smith
    2026-02-09 at 14:00 - 15:00`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.attendees.length, 1);
      assert.strictEqual(event.attendees[0].name, 'John Smith');
      assert.strictEqual(event.attendees[0].email, undefined);
    });

    it('should parse multiple attendees', () => {
      const block = `• Test Event
    attendees: Jane Doe <jane@example.com>, John Smith, bob@example.com
    2026-02-09 at 14:00 - 15:00`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.attendees.length, 3);
      assert.strictEqual(event.attendees[0].name, 'Jane Doe');
      assert.strictEqual(event.attendees[0].email, 'jane@example.com');
      assert.strictEqual(event.attendees[1].name, 'John Smith');
      assert.strictEqual(event.attendees[2].name, 'bob@example.com');
      assert.strictEqual(event.attendees[2].email, 'bob@example.com');
    });
  });

  describe('parseEventBlock', () => {
    it('should parse basic event', () => {
      const block = `• Team Standup
    2026-02-09 at 10:00 - 10:30`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.title, 'Team Standup');
      assert.strictEqual(event.startTime.toISOString(), '2026-02-09T10:00:00.000Z');
      assert.strictEqual(event.endTime.toISOString(), '2026-02-09T10:30:00.000Z');
      assert.strictEqual(event.isAllDay, false);
      assert.strictEqual(event.attendees.length, 0);
    });

    it('should parse event with all fields', () => {
      const block = `• Product Review
    location: Conference Room A
    2026-02-09 at 14:00 - 15:00
    attendees: Jane Doe <jane@example.com>, John Smith
    notes: Discuss Q1 roadmap`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.title, 'Product Review');
      assert.strictEqual(event.location, 'Conference Room A');
      assert.strictEqual(event.notes, 'Discuss Q1 roadmap');
      assert.strictEqual(event.attendees.length, 2);
      assert.strictEqual(event.attendees[0].name, 'Jane Doe');
      assert.strictEqual(event.attendees[0].email, 'jane@example.com');
      assert.strictEqual(event.attendees[1].name, 'John Smith');
    });

    it('should parse all-day event', () => {
      const block = `• Company Holiday
    2026-02-09 (all-day)`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.title, 'Company Holiday');
      assert.strictEqual(event.isAllDay, true);
      assert.strictEqual(event.startTime.toISOString(), '2026-02-09T00:00:00.000Z');
      assert.strictEqual(event.endTime.toISOString(), '2026-02-09T23:59:59.000Z');
    });

    it('should parse event with calendar name', () => {
      const block = `• Personal Event
    calendar: Personal
    2026-02-09 at 18:00 - 19:00`;
      
      const event = parseEventBlock(block);
      assert.ok(event);
      assert.strictEqual(event.calendar, 'Personal');
    });

    it('should return null for invalid block', () => {
      const block = `invalid content without date`;
      const event = parseEventBlock(block);
      assert.strictEqual(event, null);
    });

    it('should return null for empty block', () => {
      const event = parseEventBlock('');
      assert.strictEqual(event, null);
    });
  });

  describe('parseIcalBuddyOutput', () => {
    it('should parse multiple events', () => {
      const output = `• Team Standup
    2026-02-09 at 10:00 - 10:30

• Product Review
    location: Conference Room A
    2026-02-09 at 14:00 - 15:00
    attendees: Jane Doe <jane@example.com>`;
      
      const events = parseIcalBuddyOutput(output);
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].title, 'Team Standup');
      assert.strictEqual(events[1].title, 'Product Review');
    });

    it('should return empty array for empty output', () => {
      const events = parseIcalBuddyOutput('');
      assert.strictEqual(events.length, 0);
    });

    it('should skip invalid blocks', () => {
      const output = `• Valid Event
    2026-02-09 at 10:00 - 10:30

• Invalid Event Without Date

• Another Valid Event
    2026-02-09 at 14:00 - 15:00`;
      
      const events = parseIcalBuddyOutput(output);
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].title, 'Valid Event');
      assert.strictEqual(events[1].title, 'Another Valid Event');
    });
  });

  describe('getProvider', () => {
    describe('isAvailable', () => {
      it('should return true when ical-buddy is installed', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => ({ stdout: '', stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        assert.strictEqual(provider.name, ICAL_BUDDY_PROVIDER_NAME);
        
        const available = await provider.isAvailable();
        assert.strictEqual(available, true);
      });

      it('should return false when ical-buddy is not installed', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 1, stdout: '' }),
          execFileAsync: async () => ({ stdout: '', stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        const available = await provider.isAvailable();
        assert.strictEqual(available, false);
      });

      it('should return false when which command throws', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => { throw new Error('Command failed'); },
          execFileAsync: async () => ({ stdout: '', stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        const available = await provider.isAvailable();
        assert.strictEqual(available, false);
      });
    });

    describe('getTodayEvents', () => {
      it('should return parsed events', async () => {
        const mockOutput = `• Team Standup
    2026-02-09 at 10:00 - 10:30

• Product Review
    location: Conference Room A
    2026-02-09 at 14:00 - 15:00
    attendees: Jane Doe <jane@example.com>`;

        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async (file, args) => {
            assert.strictEqual(file, 'ical-buddy');
            assert.ok(args.includes('eventsToday'));
            return { stdout: mockOutput, stderr: '' };
          },
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getTodayEvents();
        
        assert.strictEqual(events.length, 2);
        assert.strictEqual(events[0].title, 'Team Standup');
        assert.strictEqual(events[1].title, 'Product Review');
        assert.strictEqual(events[1].location, 'Conference Room A');
      });

      it('should apply calendar filter', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async (file, args) => {
            assert.strictEqual(file, 'ical-buddy');
            assert.ok(args.includes('-ic'));
            assert.ok(args.includes('Work,Personal'));
            return { stdout: '', stderr: '' };
          },
        };
        
        const provider = getProvider(testDeps);
        await provider.getTodayEvents({ calendars: ['Work', 'Personal'] });
      });

      it('should return empty array on error', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => {
            throw new Error('Command failed');
          },
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getTodayEvents();
        
        assert.strictEqual(events.length, 0);
      });

      it('should return empty array for no events', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => ({ stdout: '', stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getTodayEvents();
        
        assert.strictEqual(events.length, 0);
      });
    });

    describe('getUpcomingEvents', () => {
      it('should return parsed events for date range', async () => {
        const mockOutput = `• Future Meeting
    2026-02-10 at 10:00 - 11:00`;

        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async (file, args) => {
            assert.strictEqual(file, 'ical-buddy');
            assert.ok(args.includes('eventsFrom:today'));
            assert.ok(args.some(arg => arg.startsWith('to:')));
            return { stdout: mockOutput, stderr: '' };
          },
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getUpcomingEvents(7);
        
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].title, 'Future Meeting');
      });

      it('should apply calendar filter', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async (file, args) => {
            assert.strictEqual(file, 'ical-buddy');
            assert.ok(args.includes('-ic'));
            assert.ok(args.includes('Work'));
            return { stdout: '', stderr: '' };
          },
        };
        
        const provider = getProvider(testDeps);
        await provider.getUpcomingEvents(7, { calendars: ['Work'] });
      });

      it('should return empty array on error', async () => {
        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => {
            throw new Error('Command failed');
          },
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getUpcomingEvents(7);
        
        assert.strictEqual(events.length, 0);
      });
    });

    describe('Edge cases', () => {
      it('should handle events with no attendees', async () => {
        const mockOutput = `• Solo Task
    2026-02-09 at 09:00 - 09:30`;

        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => ({ stdout: mockOutput, stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getTodayEvents();
        
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].attendees.length, 0);
      });

      it('should handle events with no location', async () => {
        const mockOutput = `• Virtual Meeting
    2026-02-09 at 14:00 - 15:00`;

        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => ({ stdout: mockOutput, stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getTodayEvents();
        
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].location, undefined);
      });

      it('should handle malformed output gracefully', async () => {
        const mockOutput = `garbage data
not valid event format
random text`;

        const testDeps: IcalBuddyTestDeps = {
          whichSync: () => ({ status: 0, stdout: '/usr/local/bin/ical-buddy\n' }),
          execFileAsync: async () => ({ stdout: mockOutput, stderr: '' }),
        };
        
        const provider = getProvider(testDeps);
        const events = await provider.getTodayEvents();
        
        assert.strictEqual(events.length, 0);
      });
    });
  });
});
