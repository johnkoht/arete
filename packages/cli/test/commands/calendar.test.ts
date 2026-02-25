import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';
import { parseNaturalDate, createCalendarEvent, type CalendarDeps } from '../../src/commands/calendar.js';
import type { CalendarProvider, CreatedEvent } from '@arete/core';

describe('calendar command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-calendar');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('parseNaturalDate', () => {
    it('parses ISO date format', () => {
      const result = parseNaturalDate('2026-02-26T14:00:00');
      assert.equal(result.getFullYear(), 2026);
      assert.equal(result.getMonth(), 1); // February
      assert.equal(result.getDate(), 26);
      assert.equal(result.getHours(), 14);
      assert.equal(result.getMinutes(), 0);
    });

    it('parses ISO date with timezone', () => {
      const result = parseNaturalDate('2026-02-26T14:00:00-06:00');
      // Should parse correctly (exact hours depend on local timezone)
      assert.ok(!isNaN(result.getTime()));
    });

    it('parses "today" keyword', () => {
      const now = new Date();
      const result = parseNaturalDate('today');
      assert.equal(result.getDate(), now.getDate());
      assert.equal(result.getMonth(), now.getMonth());
      assert.equal(result.getFullYear(), now.getFullYear());
      // Should be at next hour with 0 minutes
      assert.equal(result.getMinutes(), 0);
    });

    it('parses "tomorrow" keyword', () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = parseNaturalDate('tomorrow');
      assert.equal(result.getDate(), tomorrow.getDate());
      assert.equal(result.getMonth(), tomorrow.getMonth());
      assert.equal(result.getHours(), 9); // 9am default
      assert.equal(result.getMinutes(), 0);
    });

    it('parses "tomorrow 2pm"', () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = parseNaturalDate('tomorrow 2pm');
      assert.equal(result.getDate(), tomorrow.getDate());
      assert.equal(result.getHours(), 14);
      assert.equal(result.getMinutes(), 0);
    });

    it('parses "tomorrow 10:30am"', () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = parseNaturalDate('tomorrow 10:30am');
      assert.equal(result.getDate(), tomorrow.getDate());
      assert.equal(result.getHours(), 10);
      assert.equal(result.getMinutes(), 30);
    });

    it('parses "today 3pm"', () => {
      const now = new Date();
      const result = parseNaturalDate('today 3pm');
      assert.equal(result.getDate(), now.getDate());
      assert.equal(result.getHours(), 15);
      assert.equal(result.getMinutes(), 0);
    });

    it('parses day + time format like "monday 2pm"', () => {
      const result = parseNaturalDate('monday 2pm');
      assert.equal(result.getDay(), 1); // Monday
      assert.equal(result.getHours(), 14);
      assert.equal(result.getMinutes(), 0);
    });

    it('parses day + time format like "friday 10:30am"', () => {
      const result = parseNaturalDate('friday 10:30am');
      assert.equal(result.getDay(), 5); // Friday
      assert.equal(result.getHours(), 10);
      assert.equal(result.getMinutes(), 30);
    });

    it('parses "next monday"', () => {
      const now = new Date();
      const result = parseNaturalDate('next monday');

      assert.equal(result.getDay(), 1); // Monday
      assert.equal(result.getHours(), 9); // 9am default

      // Should be at least 1 day in the future
      assert.ok(result > now, 'next monday should be in the future');
    });

    it('parses "next week"', () => {
      const now = new Date();
      const result = parseNaturalDate('next week');

      assert.equal(result.getDay(), 1); // Monday
      assert.equal(result.getHours(), 9); // 9am default

      // Should be at least 7 days in the future (next week's Monday)
      const daysAhead = Math.floor((result.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      assert.ok(daysAhead >= 7, `next week should be at least 7 days ahead, got ${daysAhead}`);
    });

    it('handles case insensitivity', () => {
      const result1 = parseNaturalDate('TOMORROW 2PM');
      const result2 = parseNaturalDate('Tomorrow 2pm');
      const result3 = parseNaturalDate('tomorrow 2pm');

      // All should produce same time
      assert.equal(result1.getHours(), result2.getHours());
      assert.equal(result2.getHours(), result3.getHours());
    });

    it('throws on invalid format', () => {
      assert.throws(
        () => parseNaturalDate('invalid date'),
        /Invalid date format/
      );
    });

    it('error message includes valid formats', () => {
      try {
        parseNaturalDate('not a date');
        assert.fail('Should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        assert.ok(message.includes('ISO'), 'Should mention ISO format');
        assert.ok(message.includes('today'), 'Should mention today');
        assert.ok(message.includes('tomorrow'), 'Should mention tomorrow');
        assert.ok(message.includes('monday 2pm'), 'Should mention day+time');
        assert.ok(message.includes('next monday'), 'Should mention next day');
      }
    });

    it('parses 12:00pm as noon', () => {
      const result = parseNaturalDate('tomorrow 12pm');
      assert.equal(result.getHours(), 12);
    });

    it('parses 12:00am as midnight', () => {
      const result = parseNaturalDate('tomorrow 12am');
      assert.equal(result.getHours(), 0);
    });

    it('parses 24-hour time format', () => {
      const result = parseNaturalDate('tomorrow 14:30');
      assert.equal(result.getHours(), 14);
      assert.equal(result.getMinutes(), 30);
    });
  });

  describe('validation errors (CLI)', () => {
    it('errors when not in a workspace', () => {
      const nonWorkspace = createTmpDir('arete-test-nonworkspace');
      try {
        const { stdout, stderr, code } = runCliRaw(
          ['calendar', 'create', '--title', 'Test', '--start', 'tomorrow 2pm'],
          { cwd: nonWorkspace }
        );
        assert.notEqual(code, 0);
        assert.ok(
          stderr.includes('Not in an Areté workspace') || stdout.includes('Not in an Areté workspace'),
          `Expected "Not in an Areté workspace" error, got: ${stderr || stdout}`
        );
      } finally {
        cleanupTmpDir(nonWorkspace);
      }
    });

    it('errors when --title is missing', () => {
      const { stderr, code } = runCliRaw(
        ['calendar', 'create', '--start', 'tomorrow 2pm'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      assert.ok(stderr.includes('--title'));
    });

    it('errors when --start is missing', () => {
      const { stderr, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Test Event'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      assert.ok(stderr.includes('--start'));
    });

    it('errors when person not found', () => {
      const { stdout, stderr, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Meeting', '--start', 'tomorrow 2pm', '--with', 'NonExistent Person'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const output = stderr || stdout;
      assert.ok(
        output.includes("Could not find 'NonExistent Person' in people/"),
        `Expected person not found error, got: ${output}`
      );
    });

    it('errors when person has no email', () => {
      // Create person without email
      const personDir = join(tmpDir, 'people', 'internal');
      mkdirSync(personDir, { recursive: true });
      writeFileSync(
        join(personDir, 'jamie-smith.md'),
        `---
name: "Jamie Smith"
category: "internal"
---

# Jamie Smith
`,
        'utf8'
      );

      const { stdout, stderr, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Meeting', '--start', 'tomorrow 2pm', '--with', 'Jamie Smith'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const output = stderr || stdout;
      assert.ok(
        output.includes('Jamie Smith found but no email on file'),
        `Expected no email error, got: ${output}`
      );
    });

    it('JSON output for person not found', () => {
      const { stdout, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Meeting', '--start', 'tomorrow 2pm', '--with', 'NonExistent', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
      assert.equal(json.error, 'Person not found');
    });

    it('JSON output for invalid date', () => {
      const { stdout, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Meeting', '--start', 'not a valid date', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
      assert.equal(json.error, 'Invalid date');
      assert.ok(json.message.includes('Valid formats'));
    });
  });

  describe('calendar provider checks', () => {
    it('errors when calendar not configured (no provider)', () => {
      const { stdout, stderr, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Meeting', '--start', 'tomorrow 2pm'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const output = stderr || stdout;
      assert.ok(
        output.includes('Calendar not configured') ||
        output.includes('calendar not configured') ||
        output.includes('integration configure'),
        `Expected calendar not configured error, got: ${output}`
      );
    });

    it('JSON output for calendar not configured', () => {
      const { stdout, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Meeting', '--start', 'tomorrow 2pm', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
      assert.equal(json.error, 'Calendar not configured');
    });
  });

  describe('argument parsing', () => {
    it('parses --duration flag', () => {
      const { stdout, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Test', '--start', 'tomorrow 2pm', '--duration', '60', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      // Just verifying it got past argument parsing
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
    });

    it('parses --description flag', () => {
      const { stdout, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Test', '--start', 'tomorrow 2pm', '--description', 'Test description', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
    });

    it('accepts email directly with --with flag', () => {
      const { stdout, code } = runCliRaw(
        ['calendar', 'create', '--title', 'Test', '--start', 'tomorrow 2pm', '--with', 'direct@example.com', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      // Should get to calendar check, not person not found
      const json = JSON.parse(stdout);
      assert.equal(json.error, 'Calendar not configured');
    });
  });

  describe('help output', () => {
    it('shows calendar in help', () => {
      const stdout = runCli(['--help'], { cwd: tmpDir });
      assert.ok(stdout.includes('calendar'));
    });

    it('shows calendar create help', () => {
      const stdout = runCli(['calendar', 'create', '--help'], { cwd: tmpDir });
      assert.ok(stdout.includes('--title'));
      assert.ok(stdout.includes('--start'));
      assert.ok(stdout.includes('--duration'));
      assert.ok(stdout.includes('--with'));
      assert.ok(stdout.includes('--description'));
      assert.ok(stdout.includes('--json'));
    });
  });

  describe('provider integration (DI tests)', () => {
    // Helper to create mock services
    function createMockServices(root: string, personEmail?: string) {
      return {
        workspace: {
          findRoot: async () => root,
          getPaths: (r: string) => ({
            root: r,
            now: join(r, 'now'),
            goals: join(r, 'goals'),
            context: join(r, 'context'),
            projects: join(r, 'projects'),
            resources: join(r, 'resources'),
            people: join(r, 'people'),
            templates: join(r, 'templates'),
            arete: join(r, '.arete'),
            memory: join(r, '.arete', 'memory'),
          }),
        },
        entity: {
          resolve: async (query: string) => {
            if (personEmail) {
              return {
                name: 'Sarah Johnson',
                slug: 'sarah-johnson',
                metadata: { email: personEmail, category: 'internal' },
              };
            }
            return null;
          },
        },
        storage: {},
        search: {},
        memory: {},
      };
    }

    // Capture console output for assertion
    let consoleOutput: string[] = [];
    const originalLog = console.log;
    const originalCwd = process.cwd();
    let exitCode: number | undefined;

    beforeEach(() => {
      consoleOutput = [];
      exitCode = undefined;
      console.log = (...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      };
      // Mock process.exit to capture exit code without actually exiting
      (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
        exitCode = code;
        throw new Error('process.exit called');
      }) as never;
    });

    afterEach(() => {
      console.log = originalLog;
      process.chdir(originalCwd);
    });

    it('errors when provider does not support createEvent', async () => {
      // Provider without createEvent method (like ical-buddy)
      const providerWithoutCreateEvent: CalendarProvider = {
        name: 'mock-ical-buddy',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        // No createEvent method
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithoutCreateEvent,
      };

      process.chdir(tmpDir);

      try {
        await createCalendarEvent(
          { title: 'Test', start: 'tomorrow 2pm', duration: 30, json: true },
          deps
        );
      } catch {
        // Expected: process.exit called
      }

      assert.equal(exitCode, 1, 'Should exit with code 1');
      const output = consoleOutput.join('\n');
      assert.ok(output.includes('Event creation requires Google Calendar'), `Expected createEvent not supported error, got: ${output}`);
    });

    it('successfully creates event with all options', async () => {
      const mockCreatedEvent: CreatedEvent = {
        id: 'event-123',
        htmlLink: 'https://calendar.google.com/event?eid=abc123',
        summary: '1:1 with Sarah',
        start: new Date('2026-02-26T14:00:00'),
        end: new Date('2026-02-26T14:30:00'),
      };

      const providerWithCreateEvent: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        createEvent: async (input) => {
          // Verify input
          assert.equal(input.summary, '1:1 with Sarah');
          assert.equal(input.description, 'Weekly sync');
          assert.deepEqual(input.attendees, ['sarah@example.com']);
          return mockCreatedEvent;
        },
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir, 'sarah@example.com') as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithCreateEvent,
      };

      process.chdir(tmpDir);

      await createCalendarEvent(
        {
          title: '1:1 with Sarah',
          start: '2026-02-26T14:00:00',
          duration: 30,
          with: 'sarah',
          description: 'Weekly sync',
          json: true,
        },
        deps
      );

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);

      assert.equal(parsed.success, true);
      assert.equal(parsed.event.id, 'event-123');
      assert.equal(parsed.event.title, '1:1 with Sarah');
      assert.equal(parsed.event.duration, 30);
      assert.equal(parsed.event.htmlLink, 'https://calendar.google.com/event?eid=abc123');
      assert.equal(parsed.event.attendee.name, 'Sarah Johnson');
      assert.equal(parsed.event.attendee.email, 'sarah@example.com');
    });

    it('creates event without --with (block time)', async () => {
      const mockCreatedEvent: CreatedEvent = {
        id: 'event-456',
        htmlLink: 'https://calendar.google.com/event?eid=def456',
        summary: 'Focus time',
        start: new Date('2026-02-26T09:00:00'),
        end: new Date('2026-02-26T11:00:00'),
      };

      const providerWithCreateEvent: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        createEvent: async (input) => {
          // Verify no attendees for block time
          assert.equal(input.attendees, undefined);
          return mockCreatedEvent;
        },
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithCreateEvent,
      };

      process.chdir(tmpDir);

      await createCalendarEvent(
        {
          title: 'Focus time',
          start: '2026-02-26T09:00:00',
          duration: 120,
          json: true,
        },
        deps
      );

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);

      assert.equal(parsed.success, true);
      assert.equal(parsed.event.title, 'Focus time');
      assert.equal(parsed.event.duration, 120);
      assert.ok(!parsed.event.attendee, 'Block time should not have attendee');
    });

    it('handles API errors gracefully', async () => {
      const providerWithError: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        createEvent: async () => {
          throw new Error('Google Calendar authentication failed — run: arete integration configure google-calendar');
        },
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithError,
      };

      process.chdir(tmpDir);

      try {
        await createCalendarEvent(
          { title: 'Test', start: 'tomorrow 2pm', duration: 30, json: true },
          deps
        );
      } catch {
        // Expected: process.exit called
      }

      assert.equal(exitCode, 1, 'Should exit with code 1');
      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);
      assert.equal(parsed.success, false);
      assert.equal(parsed.error, 'Calendar API error');
      assert.ok(parsed.message.includes('authentication'));
    });

    it('displays times with timezone in JSON output', async () => {
      const mockCreatedEvent: CreatedEvent = {
        id: 'event-789',
        htmlLink: 'https://calendar.google.com/event?eid=ghi789',
        summary: 'Test Event',
        start: new Date('2026-02-26T14:00:00'),
        end: new Date('2026-02-26T14:30:00'),
      };

      const providerWithCreateEvent: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        createEvent: async () => mockCreatedEvent,
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithCreateEvent,
      };

      process.chdir(tmpDir);

      await createCalendarEvent(
        { title: 'Test Event', start: '2026-02-26T14:00:00', duration: 30, json: true },
        deps
      );

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);

      // Check that display field contains a timezone abbreviation
      const tzPattern = /\b(CT|ET|PT|MT|CST|EST|PST|MST|CDT|EDT|PDT|MDT|UTC|GMT)\b/;
      assert.ok(
        tzPattern.test(parsed.display.start),
        `Expected timezone abbreviation in start display, got: ${parsed.display.start}`
      );
      assert.ok(
        tzPattern.test(parsed.display.end),
        `Expected timezone abbreviation in end display, got: ${parsed.display.end}`
      );
    });

    it('accepts email directly without resolution', async () => {
      const mockCreatedEvent: CreatedEvent = {
        id: 'event-direct',
        htmlLink: 'https://calendar.google.com/event?eid=direct',
        summary: 'Meeting',
        start: new Date('2026-02-26T14:00:00'),
        end: new Date('2026-02-26T14:30:00'),
      };

      const providerWithCreateEvent: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        createEvent: async (input) => {
          // Verify email is passed through directly
          assert.deepEqual(input.attendees, ['direct@example.com']);
          return mockCreatedEvent;
        },
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithCreateEvent,
      };

      process.chdir(tmpDir);

      await createCalendarEvent(
        {
          title: 'Meeting',
          start: '2026-02-26T14:00:00',
          duration: 30,
          with: 'direct@example.com',
          json: true,
        },
        deps
      );

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);
      assert.equal(parsed.success, true);
      // Email should be shown as both name and email since no resolution occurred
      assert.equal(parsed.event.attendee.email, 'direct@example.com');
    });

    it('calculates end time correctly from duration', async () => {
      let capturedInput: { start: Date; end: Date } | undefined;

      const providerWithCreateEvent: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        createEvent: async (input) => {
          capturedInput = { start: input.start, end: input.end };
          return {
            id: 'test',
            htmlLink: 'https://example.com',
            summary: input.summary,
            start: input.start,
            end: input.end,
          };
        },
      };

      const deps: CalendarDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithCreateEvent,
      };

      process.chdir(tmpDir);

      await createCalendarEvent(
        {
          title: 'Test',
          start: '2026-02-26T14:00:00',
          duration: 90, // 90 minutes
          json: true,
        },
        deps
      );

      assert.ok(capturedInput, 'Should have captured input');
      const durationMs = capturedInput!.end.getTime() - capturedInput!.start.getTime();
      const durationMinutes = durationMs / (1000 * 60);
      assert.equal(durationMinutes, 90, 'End time should be 90 minutes after start');
    });
  });
});
