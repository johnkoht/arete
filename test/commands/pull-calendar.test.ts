/**
 * Tests for src/commands/pull-calendar.ts
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pullCalendar } from '../../src/commands/pull-calendar.js';
import type { CalendarProvider, CalendarEvent } from '../../src/core/calendar.js';

describe('pullCalendar', () => {
  let tmpWorkspace: string;
  let origCwd: string;
  let origExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleOutput: string[];

  // Mock calendar provider
  const mockProvider: CalendarProvider = {
    name: 'mock',
    async isAvailable() {
      return true;
    },
    async getTodayEvents() {
      return [
        {
          title: 'Morning Standup',
          startTime: new Date('2026-02-09T09:00:00'),
          endTime: new Date('2026-02-09T09:30:00'),
          calendar: 'Work',
          location: 'Zoom',
          attendees: [
            { name: 'Jane Doe', email: 'jane@acme.com', status: 'accepted' },
            { name: 'Bob Builder', email: 'bob@example.com', status: 'tentative' },
          ],
          isAllDay: false,
        },
      ];
    },
    async getUpcomingEvents(days: number) {
      return [
        {
          title: 'Morning Standup',
          startTime: new Date('2026-02-09T09:00:00'),
          endTime: new Date('2026-02-09T09:30:00'),
          calendar: 'Work',
          location: 'Zoom',
          attendees: [
            { name: 'Jane Doe', email: 'jane@acme.com', status: 'accepted' },
            { name: 'Bob Builder', email: 'bob@example.com', status: 'tentative' },
          ],
          isAllDay: false,
        },
        {
          title: 'Product Review',
          startTime: new Date('2026-02-10T14:00:00'),
          endTime: new Date('2026-02-10T15:00:00'),
          calendar: 'Work',
          attendees: [{ name: 'Alice Smith', email: 'alice@acme.com' }],
          isAllDay: false,
        },
        {
          title: 'All Day Event',
          startTime: new Date('2026-02-11T00:00:00'),
          endTime: new Date('2026-02-11T23:59:59'),
          calendar: 'Personal',
          attendees: [],
          isAllDay: true,
        },
      ];
    },
  };

  beforeEach(() => {
    origCwd = process.cwd();
    tmpWorkspace = mkdtempSync(join(tmpdir(), 'pull-calendar-test-'));

    // Create workspace structure
    writeFileSync(
      join(tmpWorkspace, 'arete.yaml'),
      `version: 1
integrations:
  calendar:
    provider: ical-buddy
    calendars:
      - Work
      - Personal
`
    );

    mkdirSync(join(tmpWorkspace, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'people', 'internal'), { recursive: true });
    mkdirSync(join(tmpWorkspace, 'people', 'customers'), { recursive: true });
    mkdirSync(join(tmpWorkspace, '.cursor'), { recursive: true });

    // Create test person files
    writeFileSync(
      join(tmpWorkspace, 'people', 'internal', 'jane-doe.md'),
      `---
name: Jane Doe
email: jane@acme.com
role: Product Manager
team: Product
---

# Jane Doe

Product Manager on the core team.
`
    );

    writeFileSync(
      join(tmpWorkspace, 'people', 'customers', 'bob-builder.md'),
      `---
name: Bob Builder
email: bob@example.com
role: Engineering Lead
company: Example Corp
---

# Bob Builder

Engineering Lead at Example Corp.
`
    );

    process.chdir(tmpWorkspace);

    // Mock console.log
    consoleOutput = [];
    mock.method(console, 'log', (msg: unknown) => {
      consoleOutput.push(String(msg));
    });

    // Mock process.exit
    exitCode = undefined;
    origExit = process.exit;
    (process as unknown as { exit: typeof process.exit }).exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`exit ${exitCode}`);
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpWorkspace, { recursive: true, force: true });
    process.exit = origExit;
    mock.restoreAll();
  });

  describe('error handling', () => {
    it('fails when not in workspace', async () => {
      process.chdir(tmpdir());

      try {
        await pullCalendar({ json: false });
      } catch (e) {
        assert.ok((e as Error).message.includes('exit'));
      }

      assert.equal(exitCode, 1);
    });

    it('fails when calendar not configured', async () => {
      // Remove calendar config
      writeFileSync(join(tmpWorkspace, 'arete.yaml'), 'version: 1\n');

      try {
        await pullCalendar({ json: false });
      } catch (e) {
        assert.ok((e as Error).message.includes('exit'));
      }

      assert.equal(exitCode, 1);
    });

    it('outputs JSON error when calendar not configured with --json', async () => {
      // Remove calendar config
      writeFileSync(join(tmpWorkspace, 'arete.yaml'), 'version: 1\n');

      try {
        await pullCalendar({ json: true });
      } catch (e) {
        assert.ok((e as Error).message.includes('exit'));
      }

      assert.equal(exitCode, 1);
      const output = consoleOutput.join('\n');
      assert.ok(output.includes('Calendar not configured'));
      const parsed = JSON.parse(output);
      assert.equal(parsed.success, false);
    });
  });

  describe('--today flag', () => {
    it('fetches only today\'s events', async () => {
      const getTodaySpy = mock.method(mockProvider, 'getTodayEvents');

      await pullCalendar({ today: true, json: false, _testProvider: mockProvider });

      assert.equal(getTodaySpy.mock.calls.length, 1);
      const output = consoleOutput.join('\n');
      assert.ok(output.includes('Today'));
      assert.ok(output.includes('Morning Standup'));
      assert.ok(output.includes('Total: 1 event'));
    });
  });

  describe('default behavior', () => {
    it('fetches upcoming 7 days by default', async () => {
      const getUpcomingSpy = mock.method(mockProvider, 'getUpcomingEvents');

      await pullCalendar({ json: false, _testProvider: mockProvider });

      assert.equal(getUpcomingSpy.mock.calls.length, 1);
      assert.deepEqual(getUpcomingSpy.mock.calls[0].arguments, [7]);
      const output = consoleOutput.join('\n');
      assert.ok(output.includes('Next 7 days'));
      assert.ok(output.includes('Morning Standup'));
      assert.ok(output.includes('Product Review'));
      assert.ok(output.includes('All Day Event'));
      assert.ok(output.includes('Total: 3 events'));
    });
  });

  describe('person matching', () => {
    it('matches attendee emails to person files', async () => {
      await pullCalendar({ today: true, json: false, _testProvider: mockProvider });

      const output = consoleOutput.join('\n');
      // Jane should be matched to internal person
      assert.ok(output.includes('jane@acme.com'));
      assert.ok(output.includes('Product Manager'));
      assert.ok(output.includes('[internal]'));

      // Bob should be matched to customer person
      assert.ok(output.includes('bob@example.com'));
      assert.ok(output.includes('Engineering Lead'));
      assert.ok(output.includes('[customers]'));
    });

    it('includes person info in JSON output', async () => {
      await pullCalendar({ today: true, json: true, _testProvider: mockProvider });

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);

      assert.equal(parsed.success, true);
      assert.equal(parsed.events.length, 1);

      const event = parsed.events[0];
      assert.equal(event.attendees.length, 2);

      // Jane should be matched
      const jane = event.attendees.find((a: any) => a.email === 'jane@acme.com');
      assert.ok(jane);
      assert.equal(jane.personSlug, 'jane-doe');
      assert.equal(jane.personRole, 'Product Manager');
      assert.equal(jane.personCategory, 'internal');

      // Bob should be matched
      const bob = event.attendees.find((a: any) => a.email === 'bob@example.com');
      assert.ok(bob);
      assert.equal(bob.personSlug, 'bob-builder');
      assert.equal(bob.personRole, 'Engineering Lead');
      assert.equal(bob.personCategory, 'customers');
    });
  });

  describe('output formatting', () => {
    it('formats events for terminal output', async () => {
      await pullCalendar({ today: true, json: false, _testProvider: mockProvider });

      const output = consoleOutput.join('\n');
      // Check for emoji and formatting
      assert.ok(output.includes('📅'));
      assert.ok(output.includes('👥'));
      assert.ok(output.includes('📍'));
      // Check for time formatting
      assert.ok(output.includes('09:00-09:30'));
      // Check for date
      assert.ok(output.includes('2026-02-09'));
      // Check for calendar name
      assert.ok(output.includes('(Work)'));
      // Check for location
      assert.ok(output.includes('Zoom'));
    });

    it('outputs structured JSON with --json', async () => {
      await pullCalendar({ today: true, json: true, _testProvider: mockProvider });

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);

      assert.equal(parsed.success, true);
      assert.ok(Array.isArray(parsed.events));
      assert.equal(parsed.events.length, 1);

      const event = parsed.events[0];
      assert.equal(event.title, 'Morning Standup');
      assert.ok(event.startTime);
      assert.ok(event.endTime);
      assert.equal(event.calendar, 'Work');
      assert.equal(event.location, 'Zoom');
      assert.equal(event.isAllDay, false);
      assert.ok(Array.isArray(event.attendees));
    });

    it('handles all-day events', async () => {
      await pullCalendar({ json: false, _testProvider: mockProvider });

      const output = consoleOutput.join('\n');
      assert.ok(output.includes('All Day Event'));
      assert.ok(output.includes('All day'));
    });

    it('handles events with no attendees', async () => {
      await pullCalendar({ json: false, _testProvider: mockProvider });

      const output = consoleOutput.join('\n');
      assert.ok(output.includes('All Day Event'));
      // Should not crash with empty attendees
    });
  });

  describe('no events', () => {
    it('handles empty event list gracefully', async () => {
      const emptyProvider: CalendarProvider = {
        name: 'mock',
        async isAvailable() {
          return true;
        },
        async getTodayEvents() {
          return [];
        },
        async getUpcomingEvents() {
          return [];
        },
      };

      await pullCalendar({ json: false, _testProvider: emptyProvider });

      const output = consoleOutput.join('\n');
      assert.ok(output.includes('No events found'));
    });

    it('outputs empty array in JSON when no events', async () => {
      const emptyProvider: CalendarProvider = {
        name: 'mock',
        async isAvailable() {
          return true;
        },
        async getTodayEvents() {
          return [];
        },
        async getUpcomingEvents() {
          return [];
        },
      };

      await pullCalendar({ json: true, _testProvider: emptyProvider });

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);
      assert.equal(parsed.success, true);
      assert.deepEqual(parsed.events, []);
    });
  });
});
