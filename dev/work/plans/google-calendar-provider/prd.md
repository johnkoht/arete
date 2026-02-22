# PRD: Google Calendar Provider

**Version**: 1.0
**Status**: In Progress (Steps 1-3 complete, Step 4 code ready)
**Date**: 2026-02-22
**Branch**: `google-calendar`
**Depends on**: Calendar system (`CalendarProvider` interface, integration registry, credential storage)

---

## 1. Problem & Goals

### Problem

Areté's calendar integration only works on macOS via ical-buddy (Apple Calendar). This means:
- No Windows/Linux support — PMs on those platforms can't use calendar features
- Indirect access through ical-buddy → Calendar.app → synced calendars
- No direct Google Calendar API access for the many PMs who use it as primary

### Goals

1. **Google Calendar provider**: Implement `GoogleCalendarProvider` behind the existing `CalendarProvider` interface, using the Google Calendar REST API directly (no `googleapis` dependency)
2. **Zero-friction setup**: Embedded shared client ID/secret — users run one command, authenticate in browser, done. No GCP project creation required.
3. **Full parity with ical-buddy**: `arete pull calendar` works identically regardless of provider
4. **Backward compatible**: Existing macOS/ical-buddy flow completely unaffected
5. **Cross-platform**: Works on Windows, Linux, macOS

### Out of Scope

- Multi-account Google Calendar support
- Microsoft Calendar / Outlook provider
- Keychain / OS credential store
- User-created GCP projects (shared client ID only; env var override as escape hatch)
- Interactive calendar browser/picker during configure
- Calendar write operations (create/update/delete events)
- Google OAuth verification submission (document "unverified app" workaround)

---

## 2. Architecture Decisions

### Shared Client ID (Option B)

Areté ships a shared client ID/secret embedded in the source code. For Desktop/native OAuth apps, the client secret is not treated as a secret per Google's own docs. Security comes from the consent screen, not secret hiding. Env var override available for power users.

### Thin REST Client

Use `fetch` for Google Calendar API calls. No `googleapis` dependency (~80MB). Consistent with Krisp integration pattern from LEARNINGS.md.

### Localhost Redirect OAuth

Dynamic port 0, `http://127.0.0.1:{port}/callback`. Google deprecated OOB flow in 2022. Desktop app type enables loopback redirect without pre-registered port.

### Canonical String Table

| Context | Value |
|---------|-------|
| Registry name | `google-calendar` |
| Config provider | `google` |
| Factory match | `provider === 'google'` |
| Credential key | `google_calendar` |
| Configure command | `arete integration configure google-calendar` |

### Google OAuth Specifics

| Detail | Value |
|--------|-------|
| Authorization URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Scopes | `https://www.googleapis.com/auth/calendar.readonly` |
| Auth params | `access_type=offline`, `prompt=consent` |
| Client auth | POST body (not Basic auth) |
| Redirect | `http://127.0.0.1:{port}/callback` |

---

## 3. Tasks

### Task 1: Extract Shared Calendar Types ✅ COMPLETE

Move `CalendarProvider`, `CalendarEvent`, `CalendarOptions` from `ical-buddy.ts` to `types.ts`. Remove dead `CalendarEvent` from `models/integrations.ts`.

**Acceptance Criteria:**
- `packages/core/src/integrations/calendar/types.ts` exists with shared interfaces
- `ical-buddy.ts` and `index.ts` import from `types.ts`
- Dead `CalendarEvent` in `models/integrations.ts` removed
- `npm run typecheck` passes
- `npm test` passes

**Commit**: `117b50c`

---

### Task 2: Add Google Calendar Registry Entry ✅ COMPLETE

Add `google-calendar` to `INTEGRATIONS` in `registry.ts`.

**Acceptance Criteria:**
- Registry entry with `name: 'google-calendar'`, `implements: ['calendar']`, `auth: { type: 'oauth' }`, `status: 'available'`
- Registry structural validation tests added
- `npm run typecheck` passes

**Commit**: `55ddc1b`

---

### Task 3: Implement OAuth2 Flow + Credential Storage ✅ COMPLETE

Create `google-auth.ts` with full OAuth2 flow, credential persistence, and token refresh.

**Acceptance Criteria:**
- Embedded client ID/secret constants with env var override
- Localhost redirect with dynamic port 0
- `access_type=offline` and `prompt=consent` in auth URL
- Atomic credential write under `google_calendar` key (read-modify-write)
- Token refresh with 5-minute expiry buffer
- 23 tests passing (isTokenValid, getClientCredentials, loadGoogleCredentials, saveGoogleCredentials, refreshToken)
- Existing credentials (Fathom, Krisp) not clobbered
- `npm run typecheck` && `npm test` passes

**Commit**: `df1cadd`

---

### Task 4: Implement Google Calendar API Client + Provider

Create `google-calendar.ts` — thin REST wrapper implementing `CalendarProvider`. No `googleapis` dependency.

**Files to read:**
- `packages/core/src/integrations/calendar/types.ts` — interface to implement
- `packages/core/src/integrations/calendar/google-auth.ts` — OAuth functions to use
- `packages/core/src/integrations/calendar/ical-buddy.ts` — existing provider pattern
- `packages/core/src/integrations/LEARNINGS.md` — invariants (null return, isAvailable contract)

**Acceptance Criteria:**
- `CalendarProvider` interface fully implemented with `name: 'google-calendar'`
- `isAvailable()` checks credentials, attempts refresh before returning false, never throws
- `getTodayEvents()` and `getUpcomingEvents()` query Google Calendar API
- Always passes `singleEvents=true` and `orderBy=startTime`
- All-day events (`date` field) vs timed events (`dateTime` field) correctly mapped to `CalendarEvent.isAllDay`
- Attendees mapped: `displayName` → name, `email` → email
- Pagination handled via `nextPageToken` with `maxResults=250`
- Calendar filtering via `options.calendars`
- `listCalendars()` exported for configure command
- Error mapping: 401 → refresh + retry, 403 → permission error, 404 → not found, 429 → rate limit
- No `googleapis` dependency added to `package.json`
- Tests: timed events, all-day events, multi-day events, empty/missing attendees, pagination, calendar filtering, isAvailable (no creds, valid creds, expired → refresh), 401 retry, 429 error, listCalendars
- `npm run typecheck` && `npm test` passes

**Note:** Implementation and tests exist as uncommitted work from prior session. Review, verify, and commit.

---

### Task 5: Wire Into Factory, Configure Command, Pull Command, Integration Status

Connect all pieces. Four sub-tasks:

**Files to read:**
- `packages/core/src/integrations/calendar/index.ts` — factory to update
- `packages/cli/src/commands/integration.ts` — configure command
- `packages/cli/src/commands/pull.ts` — pull command with hardcoded icalBuddy errors
- `packages/core/src/services/integrations.ts` — IntegrationService status
- `packages/core/src/integrations/LEARNINGS.md` — producer-consumer alignment

**5a. Factory** — Update `getCalendarProvider()`:
- When `provider === 'google'`, dynamic-import Google provider, check `isAvailable()`
- Comment: `// configure writes 'google' — keep in sync`

**5b. Configure** — Add `google-calendar` handler:
- `arete integration configure google-calendar`: OAuth flow → calendar list → select calendars → write config
- Write `integrations.calendar.provider: 'google'` and `calendars: [...]`
- No client ID prompt (embedded)

**5c. Pull command** — Fix hardcoded icalBuddy errors:
- Remove hardcoded "icalBuddy not installed" messages (lines ~139-153)
- Make error messages provider-aware using `provider.name`

**5d. Integration status** — Add google-calendar to status check

**Acceptance Criteria:**
- Factory returns Google provider for `provider: 'google'`
- Factory still returns ical-buddy for `provider: 'macos'` and `'ical-buddy'` (regression tests)
- `arete integration configure google-calendar` completes OAuth and writes config
- Configure writes exact string `provider: 'google'` (producer-consumer regression test)
- `arete pull calendar` works with Google provider
- Pull command shows provider-appropriate errors (not hardcoded icalBuddy)
- `arete integration list` shows Google Calendar status
- Existing macOS flow completely unaffected
- `npm run typecheck` && `npm test` passes

---

### Task 6: Integration Tests and Round-Trip Regression Tests

End-to-end test coverage with mocked Google API.

**Acceptance Criteria:**
- Configure → Pull round-trip: config written by configure accepted by factory, returns events
- macOS configure → Pull round-trip still works (regression)
- Token expiry → auto-refresh → successful pull (mocked)
- Expired refresh token → actionable error message
- Calendar with 0 events returns empty array (not error)
- Realistic Google API fixture tests (timed, all-day, multi-day, recurring expanded, declined events)
- `npm run typecheck` && `npm test` passes

---

### Task 7: Error Handling Hardening + Documentation

**Files to read (for docs updates):**
- `SETUP.md`, `ONBOARDING.md`, `packages/runtime/GUIDE.md`
- `packages/runtime/integrations/README.md`, `packages/runtime/integrations/registry.md`
- `.agents/sources/guide/intelligence.md`, `.agents/sources/shared/cli-commands.md`
- `packages/core/src/integrations/LEARNINGS.md`
- `dev/catalog/capabilities.json`

**Error handling:**
- Rate limiting: clear message with retry guidance
- Token expired/revoked: actionable re-auth message
- Network failures: graceful message, not stack trace
- "Unverified app" warning documented

**Documentation updates (all 9 files):**

| File | Change |
|------|--------|
| `SETUP.md` | Add "Google Calendar Setup" — just run configure + unverified app note |
| `ONBOARDING.md` | "Calendar (macOS only)" → "Calendar (macOS or Google)" |
| `packages/runtime/GUIDE.md` | Remove "Future: Google Calendar planned" → show available |
| `packages/runtime/integrations/README.md` | Google Calendar "Planned" → "Available" |
| `packages/runtime/integrations/registry.md` | Google Calendar "Planned" → "Available" |
| `.agents/sources/guide/intelligence.md` | Add `configure google-calendar` |
| `.agents/sources/shared/cli-commands.md` | Add `configure google-calendar` |
| `packages/core/src/integrations/LEARNINGS.md` | Add Google Calendar section |
| `dev/catalog/capabilities.json` | Add `google-calendar-provider` entry |

After updating AGENTS.md sources: `npm run build:agents:dev` and `npm run build`

**Acceptance Criteria:**
- All error paths produce user-friendly messages (no raw stack traces)
- SETUP.md has Google Calendar instructions
- "Unverified app" warning documented
- All 9 docs updated
- AGENTS.md rebuilt after source updates
- LEARNINGS.md updated with Google Calendar patterns and gotchas
- capabilities.json updated
- `npm run typecheck` && `npm test` passes

---

## 4. Key Risks (from pre-mortem and review)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Producer-consumer string mismatch | High | Canonical string table; regression test in Task 6 |
| `pullCalendar()` hardcoded icalBuddy errors | High | Fixed in Task 5c |
| Google OAuth ≠ Krisp OAuth | Medium | Google-specific details in architecture section |
| "Unverified app" warning scares users | Medium | Document workaround; verification later |
| REST client missing API edge cases | Medium | Realistic fixtures; `singleEvents=true` always |
| Credential storage clobbers other keys | Medium | Atomic read-modify-write (validated in Task 3 tests) |

---

## 5. References

- **Pre-mortem**: `dev/work/plans/google-calendar-provider/pre-mortem.md`
- **Engineering review**: `dev/work/plans/google-calendar-provider/review.md`
- **Existing provider**: `packages/core/src/integrations/calendar/ical-buddy.ts`
- **LEARNINGS.md**: `packages/core/src/integrations/LEARNINGS.md`
- **Krisp credential pattern**: `packages/core/src/integrations/krisp/config.ts`
