/**
 * Tests for calendar integration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultConfig } from '../../src/config.js';
import { getCalendarProvider, listIcalBuddyCalendars, parseIcalBuddyCalendars } from '../../src/integrations/calendar/index.js';
import type { AreteConfig } from '../../src/models/workspace.js';

describe('calendar', () => {
  describe('getCalendarProvider', () => {
    it('returns null when no calendar integration configured', async () => {
      const config = getDefaultConfig();
      const provider = await getCalendarProvider(config);
      assert.equal(provider, null);
    });

    it('returns null when calendar config exists but no provider specified', async () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            calendars: ['Work', 'Personal'],
          },
        },
      };
      const provider = await getCalendarProvider(config);
      assert.equal(provider, null);
    });

    it('returns null or provider when ical-buddy specified', async () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            provider: 'ical-buddy',
            calendars: ['Work'],
          },
        },
      };
      const provider = await getCalendarProvider(config);
      assert.ok(provider === null || provider.name === 'ical-buddy');
    });

    it('accepts provider "macos" as alias for ical-buddy', async () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            provider: 'macos',
            calendars: ['Work', 'Home'],
          },
        },
      };
      const provider = await getCalendarProvider(config);
      assert.ok(provider === null || provider.name === 'ical-buddy');
    });
  });

  describe('parseIcalBuddyCalendars', () => {
    it('parses multiple calendars with metadata lines', () => {
      const output = [
        '\u2022 Work',
        '    type: CalDAV',
        '    UID: ABC-123',
        '\u2022 Personal',
        '    type: Local',
        '    UID: DEF-456',
        '\u2022 Holidays',
        '    type: Subscribed',
        '    UID: GHI-789',
      ].join('\n');
      assert.deepEqual(parseIcalBuddyCalendars(output), ['Work', 'Personal', 'Holidays']);
    });

    it('returns empty array for empty output', () => {
      assert.deepEqual(parseIcalBuddyCalendars(''), []);
    });

    it('returns empty array for whitespace-only output', () => {
      assert.deepEqual(parseIcalBuddyCalendars('   \n  \n'), []);
    });

    it('ignores metadata-only lines (no bullet prefix)', () => {
      const output = [
        '    type: CalDAV',
        '    UID: ABC-123',
      ].join('\n');
      assert.deepEqual(parseIcalBuddyCalendars(output), []);
    });

    it('handles single calendar', () => {
      const output = '\u2022 My Calendar\n    type: Local\n    UID: X-1';
      assert.deepEqual(parseIcalBuddyCalendars(output), ['My Calendar']);
    });

    it('trims whitespace from calendar names', () => {
      const output = '\u2022   Spaced Name  \n    type: Local';
      assert.deepEqual(parseIcalBuddyCalendars(output), ['Spaced Name']);
    });
  });

  describe('listIcalBuddyCalendars', () => {
    const fixtureOutput = [
      '\u2022 Work',
      '    type: CalDAV',
      '    UID: ABC-123',
      '\u2022 Personal',
      '    type: Local',
      '    UID: DEF-456',
    ].join('\n');

    it('returns calendars when icalBuddy is available', async () => {
      const result = await listIcalBuddyCalendars({
        which: () => ({ status: 0, stdout: '/usr/local/bin/icalBuddy\n' }),
        exec: async () => ({ stdout: fixtureOutput }),
      });
      assert.deepEqual(result, { available: true, calendars: ['Work', 'Personal'] });
    });

    it('returns available: false when binary is not found', async () => {
      const result = await listIcalBuddyCalendars({
        which: () => ({ status: 1, stdout: '' }),
        exec: async () => ({ stdout: '' }),
      });
      assert.deepEqual(result, { available: false, calendars: [] });
    });

    it('returns available: false when exec throws (command error)', async () => {
      const result = await listIcalBuddyCalendars({
        which: () => ({ status: 0, stdout: '/usr/local/bin/icalBuddy\n' }),
        exec: async () => { throw new Error('permission denied'); },
      });
      assert.deepEqual(result, { available: false, calendars: [] });
    });

    it('returns available: false when which throws', async () => {
      const result = await listIcalBuddyCalendars({
        which: () => { throw new Error('spawn error'); },
        exec: async () => ({ stdout: '' }),
      });
      assert.deepEqual(result, { available: false, calendars: [] });
    });

    it('returns empty calendars array when output is empty', async () => {
      const result = await listIcalBuddyCalendars({
        which: () => ({ status: 0, stdout: '/usr/local/bin/icalBuddy\n' }),
        exec: async () => ({ stdout: '' }),
      });
      assert.deepEqual(result, { available: true, calendars: [] });
    });
  });
});
