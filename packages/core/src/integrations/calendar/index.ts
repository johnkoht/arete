/**
 * Calendar provider factory.
 */

import type { AreteConfig } from '../../models/workspace.js';
import { getIcalBuddyProvider } from './ical-buddy.js';
import type { CalendarProvider } from './types.js';

export type { CalendarEvent, CalendarOptions, CalendarProvider } from './types.js';

export async function getCalendarProvider(
  config: AreteConfig
): Promise<CalendarProvider | null> {
  const calendarConfig = config.integrations?.calendar as
    | { provider?: string; calendars?: string[] }
    | undefined;
  if (!calendarConfig?.provider) return null;

  const useIcalBuddy =
    calendarConfig.provider === 'ical-buddy' ||
    calendarConfig.provider === 'macos';

  if (useIcalBuddy) {
    const provider = getIcalBuddyProvider();
    const available = await provider.isAvailable();
    if (available) return provider;
  }
  return null;
}
