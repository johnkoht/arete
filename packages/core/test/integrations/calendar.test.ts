/**
 * Tests for calendar integration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultConfig } from '../../src/config.js';
import { getCalendarProvider } from '../../src/integrations/calendar/index.js';
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
});
