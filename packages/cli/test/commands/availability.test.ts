import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';
import { findAvailability, type AvailabilityDeps } from '../../src/commands/availability.js';
import type { CalendarProvider, FreeBusyResult } from '@arete/core';

describe('availability command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-availability');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('validation errors', () => {
    it('errors when not in a workspace', () => {
      const nonWorkspace = createTmpDir('arete-test-nonworkspace');
      try {
        const { stdout, stderr, code } = runCliRaw(
          ['availability', 'find', '--with', 'test@example.com'],
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

    it('errors when --with is missing', () => {
      const { stderr, code } = runCliRaw(['availability', 'find'], { cwd: tmpDir });
      assert.notEqual(code, 0);
      assert.ok(stderr.includes('--with'));
    });

    it('errors when person not found', () => {
      const { stdout, stderr, code } = runCliRaw(
        ['availability', 'find', '--with', 'NonExistent Person'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const output = stderr || stdout;
      assert.ok(
        output.includes("Could not find 'NonExistent Person' in people/"),
        `Expected person not found error, got: ${output}`
      );
      assert.ok(
        output.includes('arete people list'),
        `Expected hint about people list, got: ${output}`
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
        ['availability', 'find', '--with', 'Jamie Smith'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const output = stderr || stdout;
      assert.ok(
        output.includes('Jamie Smith found but no email on file'),
        `Expected no email error, got: ${output}`
      );
      assert.ok(
        output.includes('people/internal/jamie-smith.md'),
        `Expected file path hint, got: ${output}`
      );
    });

    it('JSON output for person not found', () => {
      const { stdout, code } = runCliRaw(
        ['availability', 'find', '--with', 'NonExistent Person', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
      assert.equal(json.error, 'Person not found');
      assert.ok(json.message.includes("Could not find 'NonExistent Person'"));
    });

    it('JSON output for no email', () => {
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

      const { stdout, code } = runCliRaw(
        ['availability', 'find', '--with', 'Jamie Smith', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
      assert.equal(json.error, 'No email on file');
      assert.ok(json.message.includes('Jamie Smith found but no email on file'));
    });
  });

  describe('calendar provider checks', () => {
    it('errors when calendar not configured (no provider)', () => {
      // Create person with email
      const personDir = join(tmpDir, 'people', 'internal');
      mkdirSync(personDir, { recursive: true });
      writeFileSync(
        join(personDir, 'jamie-smith.md'),
        `---
name: "Jamie Smith"
category: "internal"
email: "jamie@example.com"
---

# Jamie Smith
`,
        'utf8'
      );

      const { stdout, stderr, code } = runCliRaw(
        ['availability', 'find', '--with', 'jamie@example.com'],
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
        ['availability', 'find', '--with', 'test@example.com', '--json'],
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
      // This will fail at calendar check, but verifies parsing works
      const { stdout, code } = runCliRaw(
        ['availability', 'find', '--with', 'test@example.com', '--duration', '60', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      // Just verifying it got past argument parsing
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
    });

    it('parses --days flag', () => {
      const { stdout, code } = runCliRaw(
        ['availability', 'find', '--with', 'test@example.com', '--days', '14', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
    });

    it('parses --limit flag', () => {
      const { stdout, code } = runCliRaw(
        ['availability', 'find', '--with', 'test@example.com', '--limit', '10', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      const json = JSON.parse(stdout);
      assert.equal(json.success, false);
    });

    it('accepts email directly with --with flag', () => {
      const { stdout, code } = runCliRaw(
        ['availability', 'find', '--with', 'direct@example.com', '--json'],
        { cwd: tmpDir }
      );
      assert.notEqual(code, 0);
      // Should get to calendar check, not person not found
      const json = JSON.parse(stdout);
      assert.equal(json.error, 'Calendar not configured');
    });
  });

  describe('help output', () => {
    it('shows availability in help', () => {
      const stdout = runCli(['--help'], { cwd: tmpDir });
      assert.ok(stdout.includes('availability'));
      assert.ok(stdout.includes('find'));
    });

    it('shows availability find help', () => {
      const stdout = runCli(['availability', 'find', '--help'], { cwd: tmpDir });
      assert.ok(stdout.includes('--with'));
      assert.ok(stdout.includes('--duration'));
      assert.ok(stdout.includes('--days'));
      assert.ok(stdout.includes('--limit'));
      assert.ok(stdout.includes('--json'));
    });
  });

  describe('provider integration (DI tests)', () => {
    // Helper to create mock services
    function createMockServices(root: string) {
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
          resolve: async () => null,
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

    it('errors when provider does not support FreeBusy', async () => {
      // Provider without getFreeBusy method (like ical-buddy)
      const providerWithoutFreeBusy: CalendarProvider = {
        name: 'mock-ical-buddy',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        // No getFreeBusy method
      };

      const deps: AvailabilityDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithoutFreeBusy,
      };

      process.chdir(tmpDir);

      try {
        await findAvailability(
          { with: 'test@example.com', duration: 30, days: 7, limit: 5, json: true },
          deps
        );
      } catch {
        // Expected: process.exit called
      }

      assert.equal(exitCode, 1, 'Should exit with code 1');
      const output = consoleOutput.join('\n');
      assert.ok(output.includes('Availability requires Google Calendar'), `Expected FreeBusy not supported error, got: ${output}`);
    });

    it('errors when calendar is not accessible', async () => {
      const targetEmail = 'colleague@example.com';

      // Provider that returns accessible: false
      const providerWithInaccessibleCalendar: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        getFreeBusy: async (): Promise<FreeBusyResult> => ({
          userBusy: [],
          calendars: {
            [targetEmail]: {
              accessible: false,
              busy: [],
              error: 'notFound',
            },
          },
        }),
      };

      const deps: AvailabilityDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => providerWithInaccessibleCalendar,
      };

      process.chdir(tmpDir);

      try {
        await findAvailability(
          { with: targetEmail, duration: 30, days: 7, limit: 5, json: true },
          deps
        );
      } catch {
        // Expected: process.exit called
      }

      assert.equal(exitCode, 1, 'Should exit with code 1');
      const output = consoleOutput.join('\n');
      assert.ok(output.includes("couldn't see"), `Expected "couldn't see" in error, got: ${output}`);
      assert.ok(output.includes('availability'), `Expected "availability" in error, got: ${output}`);
    });

    it('displays slots with timezone in output', async () => {
      const targetEmail = 'colleague@example.com';
      const now = new Date();
      // Tomorrow at 10 AM
      const tomorrow10am = new Date(now);
      tomorrow10am.setDate(tomorrow10am.getDate() + 1);
      tomorrow10am.setHours(10, 0, 0, 0);
      // Skip weekend if tomorrow is Sat/Sun
      while (tomorrow10am.getDay() === 0 || tomorrow10am.getDay() === 6) {
        tomorrow10am.setDate(tomorrow10am.getDate() + 1);
      }

      // Provider that returns successful FreeBusy with no busy blocks (all free)
      const successfulProvider: CalendarProvider = {
        name: 'mock-google',
        isAvailable: async () => true,
        getTodayEvents: async () => [],
        getUpcomingEvents: async () => [],
        getFreeBusy: async (): Promise<FreeBusyResult> => ({
          userBusy: [],
          calendars: {
            [targetEmail]: {
              accessible: true,
              busy: [],
            },
          },
        }),
      };

      const deps: AvailabilityDeps = {
        createServicesFn: async () => createMockServices(tmpDir) as ReturnType<typeof import('@arete/core').createServices> extends Promise<infer T> ? T : never,
        loadConfigFn: async () => ({ version: 1, integrations: {} }),
        getCalendarProviderFn: async () => successfulProvider,
      };

      process.chdir(tmpDir);

      // Call with JSON output for easier parsing
      await findAvailability(
        { with: targetEmail, duration: 30, days: 7, limit: 5, json: true },
        deps
      );

      const output = consoleOutput.join('\n');
      const parsed = JSON.parse(output);

      assert.equal(parsed.success, true, 'Should succeed');
      assert.ok(parsed.slots.length > 0, 'Should find at least one slot');

      // Check that display field contains a timezone abbreviation
      // Common US timezone abbreviations: CT, ET, PT, MT, CST, EST, PST, MST, CDT, EDT, PDT, MDT
      const tzPattern = /\b(CT|ET|PT|MT|CST|EST|PST|MST|CDT|EDT|PDT|MDT|UTC|GMT)\b/;
      const firstSlotDisplay = parsed.slots[0].display;
      assert.ok(
        tzPattern.test(firstSlotDisplay),
        `Expected timezone abbreviation in slot display, got: ${firstSlotDisplay}`
      );
    });
  });
});
