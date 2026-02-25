/**
 * Calendar provider factory.
 */
import { getIcalBuddyProvider } from './ical-buddy.js';
export async function getCalendarProvider(config, storage, workspaceRoot) {
    const calendarConfig = config.integrations?.calendar;
    if (!calendarConfig?.provider)
        return null;
    // configure writes 'google' — keep in sync
    if (calendarConfig.provider === 'google') {
        if (!storage || !workspaceRoot)
            return null;
        const { getGoogleCalendarProvider } = await import('./google-calendar.js');
        return getGoogleCalendarProvider(storage, workspaceRoot);
    }
    const useIcalBuddy = calendarConfig.provider === 'ical-buddy' ||
        calendarConfig.provider === 'macos';
    if (useIcalBuddy) {
        const provider = getIcalBuddyProvider();
        const available = await provider.isAvailable();
        if (available)
            return provider;
    }
    return null;
}
//# sourceMappingURL=index.js.map