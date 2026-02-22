---
title: Google Calendar Provider
slug: google-calendar-provider
status: building
size: large
tags: [feature, integration, oauth]
created: 2026-02-20T03:47:16Z
updated: 2026-02-22T22:37:14.661Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 7
---

# Google Calendar Provider

**Status**: Draft (reviewed, pre-mortem complete, ready for PRD)
**Priority**: High
**Size**: Large (7 steps)

---

## Problem

Current calendar integration only works on macOS via ical-buddy (Apple Calendar). No Windows/Linux support, no direct Google Calendar API access. Many PMs use Google Calendar as primary and want cross-platform, direct API access.

## Success Criteria

- `arete integration configure google-calendar` opens browser → user consents → done (no GCP setup required from user)
- `arete pull calendar` works identically for Google Calendar as it does for ical-buddy
- Existing macOS/ical-buddy flow is completely unaffected (regression-free)
- `arete integration list` shows Google Calendar status correctly
- Token refresh is transparent — user doesn't re-auth unless refresh token is revoked

---

## Key Design Decisions

### Client ID Distribution: Shared (Option B)

Areté ships a **shared client ID/secret embedded in the source code**. Users never create a Google Cloud project.

**Rationale**: Areté's target audience is PMs. Asking them to create a GCP project kills adoption. For Desktop/native OAuth apps, the client secret is not treated as a secret per Google's own docs — security comes from the consent screen and PKCE, not secret hiding.

**What this means**:
- Client ID/secret are constants in `packages/core/src/integrations/calendar/google-auth.ts`
- They ship with the npm package
- Env var override (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) available as escape hatch for power users who want their own project
- Until Google OAuth verification is completed, users see "unverified app" warning and click "Advanced → Go to Arete (unsafe)"

**Future**: Submit for Google OAuth verification to remove the "unverified app" warning. This requires a privacy policy URL and homepage. Not blocking for initial release.

### Thin REST Client (no `googleapis`)

Use `fetch` for Google Calendar API calls. No `googleapis` dependency (~80MB). Consistent with Krisp integration pattern.

### Localhost Redirect OAuth

Dynamic port 0, `http://127.0.0.1:{port}/callback`. Google deprecated OOB flow in 2022. Desktop app type in GCP console enables loopback redirect without pre-registered port.

---

## Canonical String Table

> Every step references this table. Prevents the producer-consumer mismatch from 2026-02-11.

| Context | Value |
|---------|-------|
| Registry name | `google-calendar` |
| Config provider | `google` |
| Factory match | `provider === 'google'` |
| Credential key | `google_calendar` |
| Configure command | `arete integration configure google-calendar` |
| Display name | `Google Calendar` |

---

## Google OAuth Specifics

| Detail | Value |
|--------|-------|
| Authorization URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Scopes | `https://www.googleapis.com/auth/calendar.readonly` |
| Auth params | `access_type=offline`, `prompt=consent` (required for refresh token) |
| Client auth at token endpoint | POST body (client_id + client_secret in body, not Basic auth) |
| Redirect | `http://127.0.0.1:{port}/callback` (loopback IP, dynamic port) |
| App type | Desktop app (already created in Areté's GCP project) |
| Client ID source | Embedded constants in code; env var override available |

---

## Plan

### Step 1: Extract shared calendar types + resolve duplicate CalendarEvent

Move `CalendarProvider`, `CalendarEvent`, `CalendarOptions` interfaces from `ical-buddy.ts` to `packages/core/src/integrations/calendar/types.ts`. Update imports in `ical-buddy.ts`, `index.ts`, and re-exports.

**Also resolve**: `packages/core/src/models/integrations.ts` has a different `CalendarEvent` type (uses `string` dates, `string[]` attendees, has `id` field). Verified zero consumers (only re-exported from `models/index.ts`, never imported). Remove the dead type.

**Acceptance criteria**:
- [ ] `types.ts` exists with `CalendarProvider`, `CalendarEvent`, `CalendarOptions`
- [ ] `ical-buddy.ts` imports types from `./types.js`
- [ ] `index.ts` re-exports from `./types.js`
- [ ] Dead `CalendarEvent` in `models/integrations.ts` is removed
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all existing calendar tests green)

**Files**: `packages/core/src/integrations/calendar/ical-buddy.ts`, `packages/core/src/integrations/calendar/index.ts`, `packages/core/src/models/integrations.ts`, `packages/core/src/models/index.ts`

---

### Step 2: Add Google Calendar registry entry

Add `google-calendar` to `INTEGRATIONS` in `packages/core/src/integrations/registry.ts`.

**Acceptance criteria**:
- [ ] Registry entry: `name: 'google-calendar'`, `displayName: 'Google Calendar'`, `implements: ['calendar']`, `auth: { type: 'oauth' }`, `status: 'available'`
- [ ] `arete integration list` shows Google Calendar (not yet active)
- [ ] `npm run typecheck` passes

**Files**: `packages/core/src/integrations/registry.ts`

---

### Step 3: Implement OAuth2 flow + credential storage (with tests)

Create `packages/core/src/integrations/calendar/google-auth.ts`.

**Key behaviors**:
- **Embedded client ID/secret** as exported constants (ship with npm package)
- Env var override: if `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set, use those instead (power user escape hatch)
- Localhost redirect with port 0 (dynamic), using `http://127.0.0.1:{port}/callback`
- Open browser for consent, wait for callback
- Token exchange: POST to `https://oauth2.googleapis.com/token` with `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code` in body
- Include `access_type=offline` and `prompt=consent` in auth URL for refresh token
- Atomic credential write to `.credentials/credentials.yaml` under `google_calendar` key (follow read-modify-write pattern from `packages/core/src/integrations/krisp/config.ts`)
- Token refresh: check `expires_at - now < 300` (5-min buffer); on refresh, write new tokens atomically before returning
- On 401 API response: retry once after refreshing (handles clock skew)
- Credential fields stored: `access_token`, `refresh_token`, `expires_at` (Unix timestamp seconds)
- Client ID/secret are NOT stored in credentials (they're in the code)

**Tests** (in `packages/core/test/integrations/calendar/google-auth.test.ts`):
- [ ] Token exchange with mocked token endpoint
- [ ] Token refresh when expired (mocked)
- [ ] Token refresh with 5-minute buffer
- [ ] Credential read-modify-write doesn't clobber other keys
- [ ] Env var override takes precedence over embedded constants
- [ ] Expired refresh token returns actionable error message

**Acceptance criteria**:
- [ ] OAuth flow functions exported: `authenticate()`, `refreshToken()`, `loadGoogleCredentials()`, `isTokenValid()`
- [ ] Client ID/secret embedded as constants with env var override
- [ ] Credentials stored atomically under `google_calendar` key
- [ ] Existing credentials (Fathom, Krisp) not affected by write
- [ ] `npm run typecheck` && `npm test` passes

**Files**: `packages/core/src/integrations/calendar/google-auth.ts`, `packages/core/test/integrations/calendar/google-auth.test.ts`
**Reference**: `packages/core/src/integrations/krisp/config.ts` (credential storage pattern), `packages/core/src/integrations/LEARNINGS.md`

---

### Step 4: Implement Google Calendar API client + provider (with tests)

Create `packages/core/src/integrations/calendar/google-calendar.ts`. Thin REST wrapper — no `googleapis` dependency.

**Key behaviors**:
- Implement `CalendarProvider` interface from `types.ts`
- `name: 'google-calendar'`
- `isAvailable()`: credentials exist AND (token valid OR token can be refreshed). Attempt refresh before returning false. Return `false` (not throw) when unavailable.
- `getTodayEvents(options?)`: Query Google Calendar API events list for today
- `getUpcomingEvents(days, options?)`: Query events for date range
- Always pass `singleEvents=true` (expands recurring events) and `orderBy=startTime`
- Handle `date` (all-day) vs `dateTime` (timed) fields in API response → map to `CalendarEvent.isAllDay`
- Map `attendees[].email` and `attendees[].displayName` to `CalendarEvent.attendees`
- Handle pagination (`nextPageToken`) with `maxResults=250`
- Calendar filtering via `options.calendars` — query each calendar ID separately or use `calendarId` parameter
- `listCalendars()`: fetch calendar list for configure step (used by Step 5)
- Error mapping: 403 → permission error, 404 → calendar not found, 429 → rate limit, 401 → trigger refresh

**Tests** (in `packages/core/test/integrations/calendar/google-calendar.test.ts`):
- [ ] Maps timed event correctly (dateTime field)
- [ ] Maps all-day event correctly (date field)
- [ ] Maps multi-day event
- [ ] Handles empty attendees and missing attendees field
- [ ] Handles pagination (nextPageToken)
- [ ] Calendar filtering works
- [ ] `isAvailable()` returns false when no credentials
- [ ] `isAvailable()` attempts refresh before returning false
- [ ] 401 triggers token refresh and retry
- [ ] 429 returns rate limit error message
- [ ] macOS regression: `provider: 'macos'` config still returns ical-buddy provider

**Acceptance criteria**:
- [ ] `CalendarProvider` interface fully implemented
- [ ] `singleEvents=true` always sent
- [ ] All-day vs timed events correctly mapped
- [ ] Pagination handled
- [ ] Error responses mapped to clear messages
- [ ] No `googleapis` dependency added
- [ ] `npm run typecheck` && `npm test` passes

**Files**: `packages/core/src/integrations/calendar/google-calendar.ts`, `packages/core/test/integrations/calendar/google-calendar.test.ts`
**Reference**: `packages/core/src/integrations/calendar/ical-buddy.ts` (provider pattern), `packages/core/src/integrations/LEARNINGS.md`

---

### Step 5: Wire into factory, configure command, pull command, and integration status

**5a. Factory** — Update `getCalendarProvider()` in `packages/core/src/integrations/calendar/index.ts`:
- When `provider === 'google'`, dynamic-import Google provider, call `isAvailable()`, return if available
- Comment: `// configure writes 'google' — keep in sync`

**5b. Configure** — Add handler in `packages/cli/src/commands/integration.ts`:
- `arete integration configure google-calendar` as separate handler
- Simplified flow (shared client ID): run OAuth flow → browser opens → user consents → tokens stored → fetch calendar list via API → user selects calendars (or `--calendars` / `--all`) → write `integrations.calendar.provider: 'google'` and `calendars: [...]` to config
- No "provide your client ID" prompt (it's embedded)
- Follow existing CLI patterns (match setup/seed UX)

**5c. Pull command** — Update `pullCalendar()` in `packages/cli/src/commands/pull.ts`:
- Remove hardcoded icalBuddy error messages (lines ~139-153)
- Make `isAvailable()` failure message provider-aware: use `provider.name` to show appropriate error
- Google: "Google Calendar tokens expired — run: arete integration configure google-calendar"
- icalBuddy: "icalBuddy not installed — run: brew install ical-buddy"

**5d. Integration status** — Update `IntegrationService` in `packages/core/src/services/integrations.ts`:
- Add `google-calendar` case to status check (look for stored credentials)
- Ensures `arete integration list` shows correct status

**Tests**:
- [ ] Factory returns Google provider for `provider: 'google'`
- [ ] Factory still returns ical-buddy for `provider: 'macos'` (regression)
- [ ] Factory still returns ical-buddy for `provider: 'ical-buddy'` (regression)
- [ ] Configure writes exact string `provider: 'google'` (producer-consumer regression test)
- [ ] Pull command shows provider-appropriate error when unavailable
- [ ] Integration list shows Google Calendar as active when configured

**Acceptance criteria**:
- [ ] `arete integration configure google-calendar` completes OAuth and writes config
- [ ] `arete pull calendar` works with Google provider
- [ ] `arete integration list` shows Google Calendar status
- [ ] Existing macOS flow completely unaffected
- [ ] No hardcoded icalBuddy references in provider-agnostic code paths
- [ ] `npm run typecheck` && `npm test` passes

**Files**: `packages/core/src/integrations/calendar/index.ts`, `packages/cli/src/commands/integration.ts`, `packages/cli/src/commands/pull.ts`, `packages/core/src/services/integrations.ts`

---

### Step 6: Integration tests and round-trip regression tests

End-to-end test coverage that validates the full flow with mocked Google API.

**Tests**:
- [ ] Configure → Pull round-trip: config written by configure is accepted by factory and returns events
- [ ] macOS configure → Pull round-trip still works (regression)
- [ ] Token expiry → auto-refresh → successful pull (mocked)
- [ ] Expired refresh token → actionable error message
- [ ] Calendar with 0 events returns empty array (not error)
- [ ] Google API fixture tests with realistic response shapes (timed, all-day, multi-day, recurring expanded, declined)

**Acceptance criteria**:
- [ ] Round-trip regression test exists for Google provider
- [ ] Round-trip regression test exists for macOS provider
- [ ] All tests pass: `npm run typecheck` && `npm test`

**Files**: `packages/core/test/integrations/calendar/` (new test files), `packages/cli/test/commands/` (integration configure + pull tests)

---

### Step 7: Error handling hardening + documentation

**Error handling**:
- Rate limiting: clear message with retry guidance
- Token expired/revoked: actionable re-auth message
- Network failures: graceful message, not stack trace
- "Unverified app" warning: document in setup that users click "Advanced → Go to Arete (unsafe)" until OAuth verification is completed

**Documentation updates** (explicit list):

| File | Change |
|------|--------|
| `SETUP.md` | Add "Google Calendar Setup" section — just `arete integration configure google-calendar` + note about "unverified app" warning |
| `ONBOARDING.md` | Update "Calendar (macOS only)" → "Calendar (macOS or Google)". Add configure command. |
| `packages/runtime/GUIDE.md` | Update "Calendar (macOS)" section. Remove "Future: Google Calendar support planned" → show as available. |
| `packages/runtime/integrations/README.md` | Update Google Calendar from "Planned" → "Available" |
| `packages/runtime/integrations/registry.md` | Update Google Calendar row from "Planned" → "Available" |
| `.agents/sources/guide/intelligence.md` | Add `configure google-calendar` command |
| `.agents/sources/shared/cli-commands.md` | Add `configure google-calendar` command |
| `packages/core/src/integrations/LEARNINGS.md` | Add Google Calendar section (patterns, gotchas, OAuth specifics) |
| `dev/catalog/capabilities.json` | Add `google-calendar-provider` entry |

After updating AGENTS.md sources, rebuild:
```bash
npm run build:agents:dev   # Rebuild BUILD AGENTS.md
npm run build              # Rebuild GUIDE AGENTS.md
```

**Acceptance criteria**:
- [ ] All error paths produce user-friendly messages (no raw stack traces)
- [ ] SETUP.md has Google Calendar instructions (simple: just run configure)
- [ ] "Unverified app" warning documented
- [ ] All 9 docs in the table above updated
- [ ] AGENTS.md rebuilt after source updates
- [ ] LEARNINGS.md updated with Google Calendar patterns
- [ ] capabilities.json updated
- [ ] `npm run typecheck` && `npm test` passes

---

## Dependencies

```
Step 1 (types) → Step 2 (registry) → Step 3 (OAuth) → Step 4 (provider) → Step 5 (wiring) → Step 6 (integration tests) → Step 7 (docs)
```

- Steps 1-2: Low risk, mechanical. Gate: `npm run typecheck` after each.
- Steps 3-4: Core implementation. Step 4 depends on Step 3 (auth for API calls).
- Step 5: Wiring layer. Depends on all prior steps.
- Step 6: Integration tests. Validates full round-trip.
- Step 7: Docs and institutional memory. Should reflect final state.

**Critical gate**: After Step 5, run full test suite before proceeding.

---

## Out of Scope

- Multi-account Google Calendar support
- Microsoft Calendar / Outlook provider
- Keychain / OS credential store
- User-created GCP projects (shared client ID only; env var override as escape hatch)
- Interactive calendar browser/picker during configure (use `--calendars` flag)
- Calendar write operations (create/update/delete events)
- Google OAuth verification submission (future — document "unverified app" workaround for now)

---

## Key Risks (from pre-mortem and review)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Producer-consumer string mismatch | High | Canonical string table above; regression test in Step 6 |
| Duplicate CalendarEvent types | High | Resolved in Step 1 (remove dead type) |
| `pullCalendar()` hardcoded icalBuddy errors | High | Fixed in Step 5c |
| Google OAuth ≠ Krisp OAuth | Medium | Google-specific details table above; don't cargo-cult |
| "Unverified app" warning scares users | Medium | Document workaround; submit for verification later |
| REST client missing API edge cases | Medium | Realistic fixtures in tests; `singleEvents=true` always |
| Types extraction breaks imports | Medium | `npm run typecheck` gate after Step 1 |
| Credential storage clobbers other keys | Medium | Atomic read-modify-write pattern from Krisp |

---

## References

- **Existing provider**: `packages/core/src/integrations/calendar/ical-buddy.ts`
- **LEARNINGS.md**: `packages/core/src/integrations/LEARNINGS.md`
- **Krisp credential pattern**: `packages/core/src/integrations/krisp/config.ts`
- **Registry**: `packages/core/src/integrations/registry.ts`
- **Factory**: `packages/core/src/integrations/calendar/index.ts`
- **Configure**: `packages/cli/src/commands/integration.ts`
- **Pull**: `packages/cli/src/commands/pull.ts`
- **Review**: `dev/work/plans/google-calendar-provider/review.md`
- **Pre-mortem**: `dev/work/plans/google-calendar-provider/pre-mortem.md`
