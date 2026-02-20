---
title: Google Calendar Provider
slug: google-calendar-provider
status: idea
size: unknown
tags: [feature]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Google Calendar Provider

**Status**: Ready for PRD  
**Priority**: High  
**Effort**: Medium (4–6 tasks)  
**Owner**: TBD

---

## Overview

Add `GoogleCalendarProvider` to the calendar system to enable cross-platform calendar access via the Google Calendar API. This removes the macOS/ical-buddy-only limitation and provides direct API control for users on Windows, Linux, or macOS who use Google Calendar.

---

## Problem

Current calendar integration:
- ✅ Works on macOS via ical-buddy (Apple Calendar)
- ❌ Requires macOS + ical-buddy installed
- ❌ No Windows/Linux support
- ❌ Indirect access (ical-buddy → Calendar.app → synced calendars)

Many PMs use:
- Windows/Linux machines
- Google Calendar as primary calendar
- Want direct API access for reliability and cross-platform use

---

## Solution

Implement `GoogleCalendarProvider` behind the existing `CalendarProvider` interface in `src/core/calendar.ts`. The integration registry already has a `google-calendar` entry (`src/integrations/registry.ts`) with `implements: ['calendar']`, `auth: { type: 'oauth' }`, and `status: 'planned'`. This feature implements the provider and wires it into the calendar factory and configure flow.

**Provider shape** (matches existing interface):

```typescript
// src/core/calendar-providers/google-calendar.ts
// Reuses CalendarProvider from src/core/calendar.ts
function getProvider(options?: GoogleCalendarProviderOptions): CalendarProvider {
  return {
    name: 'google-calendar',
    async isAvailable(): Promise<boolean> { /* valid OAuth token present */ },
    async getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]> { /* ... */ },
    async getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]> { /* ... */ },
  };
}
```

**Key behaviors**:
- OAuth2 authentication (consent screen; token storage under `.credentials/`)
- Token refresh handling (transparent to callers)
- Calendar filtering via `CalendarOptions.calendars` (match ical-buddy semantics)
- Person matching: attendee emails → workspace people (same as existing `pull-calendar` behavior)
- Graceful degradation and clear errors (rate limits, network, invalid/expired token)

---

## Current State (for implementation)

- **Calendar factory** (`src/core/calendar.ts`): Today accepts `provider: 'ical-buddy' | 'macos'`. Add a branch for `provider === 'google'` (or `'google-calendar'`) that dynamic-imports the Google provider and returns it iff `isAvailable()`.
- **Configure calendar** (`src/commands/integration.ts`): Currently macOS-only — checks icalBuddy, calls `listCalendars()`, writes `provider: 'macos'` and `calendars: [...]`. Must be extended to support provider selection (macOS vs Google); for Google: OAuth flow → fetch calendar list from API → user selects calendars → write `provider: 'google'` and `calendars: [...]`.
- **Pull calendar** (`src/commands/pull-calendar.ts`): Uses `getCalendarProvider(config)`; no change needed once the factory returns the Google provider for `integrations.calendar.provider: 'google'`.
- **Credentials**: Existing pattern is `.credentials/credentials.yaml` for API keys (e.g. Fathom); workspace has `.credentials/README.md` and `.gitignore` for `credentials.yaml`. OAuth tokens can live in the same file under a key (e.g. `google_calendar`) or in a dedicated file (e.g. `.credentials/google-calendar.json`); decide in PRD.

---

## Tasks (Draft)

1. **OAuth2 flow**
   - Google Cloud Project setup (doc or in-repo instructions)
   - OAuth2 consent screen + client ID/secret (or env)
   - Token acquisition (CLI: open browser, paste code / redirect callback)
   - Token persistence and refresh logic
   - Where to store tokens: `.credentials/` (see Open Questions)

2. **Google Calendar API client**
   - Thin wrapper around Google Calendar API (e.g. `googleapis` package)
   - Map API responses to `CalendarEvent` / `CalendarAttendee`
   - `getTodayEvents(options?)` and `getUpcomingEvents(days, options?)`
   - Calendar list and filtering by `options.calendars`

3. **Provider integration**
   - Implement `CalendarProvider` in `src/core/calendar-providers/google-calendar.ts` (e.g. `getProvider()` returning the interface).
   - In `getCalendarProvider()`: when `integrations.calendar.provider === 'google'` (or `'google-calendar'`), load Google provider and return it if `isAvailable()`.
   - Config already supports `integrations.calendar.provider` and `calendars`; no schema change required.

4. **Configuration command**
   - Extend `configureCalendar()` to support provider choice: **macOS Calendar** vs **Google Calendar** (or first prompt “Which provider?” then branch).
   - For Google: run OAuth flow, persist tokens, fetch calendar list via API, prompt for which calendars to include (or support `--calendars "A,B"` / `--all` for non-interactive).
   - Write `integrations.calendar.provider: 'google'` and `calendars: [...]` to `arete.yaml`.
   - Follow existing CLI patterns (see `dev/collaboration.md`: established patterns over bare minimum; match setup/seed UX where applicable).

5. **Testing and documentation**
   - Unit tests with mocked Google API (or mocked wrapper) so we don’t call the real API in CI. Mirror patterns from `test/core/calendar.test.ts` and ical-buddy provider tests (testDeps / injectable deps).
   - **Docs**: SETUP.md (Google Calendar setup steps); AGENTS.md §10 Calendar System (provider table already has “(Future) GoogleCalendarProvider” — update when implemented; “Adding a new provider” steps are already correct); ONBOARDING.md if Google becomes a first-class config option.

6. **Error handling and edge cases**
   - Rate limiting (backoff or clear message)
   - Token expired / revoked (re-auth guidance)
   - Network failures (graceful message)
   - Permission errors (scope or consent guidance)

---

## Dependencies

- ✅ Calendar system and `CalendarProvider` interface
- ✅ Integration registry entry for `google-calendar`
- ✅ Pull calendar and skills use `getCalendarProvider(config)` — no change for callers
- ⚠️ Google Cloud Project (user or org creates project; we document or script)
- ⚠️ OAuth library: e.g. `googleapis` (or minimal OAuth2 + Calendar API); decide in PRD

---

## Benefits

- **Cross-platform**: Windows, Linux, macOS
- **Direct API**: No ical-buddy dependency for Google users
- **Reliable**: Explicit error handling and token refresh
- **Extensible**: Same pattern for future providers (e.g. Microsoft Graph)

---

## Open Questions (for PRD)

1. **OAuth UX**: CLI out-of-band (open browser, paste auth code) vs local redirect server. Out-of-band is common for CLIs and avoids binding to a port; document in PRD.
2. **Credentials storage**: Single file (e.g. `.credentials/credentials.yaml` key) vs dedicated `.credentials/google-calendar.json`. Keychain/OS credential store can be a follow-up.
3. **Multi-account**: Support multiple Google accounts in one workspace (e.g. profile or named credential)? Defer to “single account first” unless we have a clear use case.
4. **Shared calendars**: Include shared calendars in list and filter by name like owned calendars; document behavior in PRD.

---

## Related

- **Existing**: IcalBuddy provider `src/core/calendar-providers/ical-buddy.ts` (pattern: `getProvider()`, testDeps for tests).
- **AGENTS.md**: §10 Calendar System, “Adding a new provider” steps.
- **Registry**: `src/integrations/registry.ts` — `google-calendar` entry already present.
- **Next**: Microsoft Calendar provider (same interface, different OAuth/API).
- **Person matching**: Same as today — `pull-calendar` and skills use attendee emails; no change required.
