# Google Calendar Provider

**Status**: Ready for PRD  
**Priority**: High  
**Effort**: Medium (4-6 tasks)  
**Owner**: TBD

---

## Overview

Add GoogleCalendarProvider to the calendar system to enable cross-platform calendar access via Google Calendar API. This removes the macOS/ical-buddy dependency and provides direct API control.

---

## Problem

Current calendar integration:
- ✅ Works great on macOS via ical-buddy
- ❌ Requires macOS + ical-buddy installed
- ❌ No Windows/Linux support
- ❌ Indirect access (ical-buddy → Calendar.app → synced calendars)

Many PMs use:
- Windows/Linux machines
- Google Calendar as primary calendar
- Want direct API access for reliability

---

## Solution

Implement `GoogleCalendarProvider` behind the existing `CalendarProvider` interface:

```typescript
// Reuses existing interface from src/core/calendar.ts
class GoogleCalendarProvider implements CalendarProvider {
  name = 'google-calendar';
  async isAvailable(): Promise<boolean> { /* check OAuth token */ }
  async getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]> { /* ... */ }
  async getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]> { /* ... */ }
}
```

**Key features**:
- OAuth2 authentication (consent screen, token storage in `.credentials/`)
- Token refresh handling
- Calendar filtering (match ical-buddy behavior)
- Person matching (attendee emails → workspace people files)
- Error handling (API rate limits, network issues, invalid token)

---

## Tasks (Draft)

1. **OAuth2 Flow Implementation**
   - Google Cloud Project setup instructions
   - OAuth2 consent screen + credentials
   - Token acquisition and storage
   - Token refresh logic

2. **Google Calendar API Client**
   - API client wrapper
   - getTodayEvents implementation
   - getUpcomingEvents implementation
   - Calendar list/filtering

3. **Provider Integration**
   - Implement CalendarProvider interface
   - Add to getCalendarProvider() factory
   - Config schema update (integrations.calendar.provider: 'google')

4. **Configuration Command**
   - `arete integration configure calendar` enhancement
   - Detect Google Calendar option
   - OAuth flow initiation
   - Credentials validation

5. **Testing & Documentation**
   - Tests with mocked Google API
   - SETUP.md update (Google Calendar setup)
   - AGENTS.md update (add Google provider to Calendar System section)

6. **Error Handling & Edge Cases**
   - Rate limiting
   - Token expiration
   - Network failures
   - Permission errors

---

## Dependencies

- ✅ Calendar system complete (CalendarProvider interface exists)
- ✅ Integration framework stable
- ⚠️ Need: Google Cloud Project (can provide instructions)
- ⚠️ Need: OAuth2 library decision (use googleapis npm package?)

---

## Benefits

- **Cross-platform**: Works on Windows, Linux, macOS
- **Direct access**: No ical-buddy dependency
- **Reliable**: Direct API control, better error handling
- **Extensible**: Pattern for other calendar providers (Microsoft, etc.)

---

## Open Questions

1. **OAuth flow UX**: CLI-based (open browser, paste code) or server-based?
2. **Credentials storage**: `.credentials/google-calendar.json` or integrate with system keychain?
3. **Multi-account**: Support multiple Google accounts?
4. **Shared calendars**: How to handle calendar ownership/sharing?

---

## Related

- **Existing**: IcalBuddy provider (`src/core/calendar-providers/ical-buddy.ts`)
- **Next**: Microsoft Calendar provider (similar pattern)
- **Integration**: Uses existing entity resolution for person matching
