/**
 * Calendar provider factory.
 */

import type { AreteConfig } from '../../models/workspace.js';
import type { StorageAdapter } from '../../storage/adapter.js';
import { getIcalBuddyProvider } from './ical-buddy.js';
import type { CalendarProvider } from './types.js';

export type {
  BusyBlock,
  CalendarEvent,
  CalendarOptions,
  CalendarProvider,
  CreateEventInput,
  CreatedEvent,
  FreeBusyCalendarResult,
  FreeBusyResult,
} from './types.js';

export async function getCalendarProvider(
  config: AreteConfig,
  storage?: StorageAdapter,
  workspaceRoot?: string
): Promise<CalendarProvider | null> {
  const calendarConfig = config.integrations?.calendar as
    | { provider?: string; calendars?: string[] }
    | undefined;
  if (!calendarConfig?.provider) return null;

  // configure writes 'google' — keep in sync
  if (calendarConfig.provider === 'google') {
    if (!storage || !workspaceRoot) return null;
    const { getGoogleCalendarProvider } = await import('./google-calendar.js');
    return getGoogleCalendarProvider(storage, workspaceRoot);
  }

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
