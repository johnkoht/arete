---
title: "Calendar — gws Provider"
slug: calendar-gws-provider
status: planned
size: medium
tags: [integration, calendar, gws, google-workspace]
created: 2026-05-01T02:36:14.000Z
updated: 2026-05-01T02:36:14.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 8
---

# Calendar — gws Provider

## Goal

Add a third calendar provider backed by the `gws` CLI so users on Google Workspace via gws can use `arete pull calendar`, `arete availability find`, and `arete calendar create` without configuring the legacy Google Calendar OAuth flow.

## Context

The builder switched to `gws` for Google Workspace access (Gmail/Drive/Docs/Sheets/Directory already use it). Calendar is the holdout — it still requires standalone OAuth via `arete integration configure google-calendar`, so any skill that calls `arete pull calendar` fails post-switch with `auth_expired`.

The existing `CalendarProvider` interface (`packages/core/src/integrations/calendar/types.ts`) is already provider-agnostic: `name, isAvailable, getTodayEvents, getUpcomingEvents, getFreeBusy?, createEvent?`. Two concrete providers exist (`google-calendar.ts` for OAuth, `ical-buddy.ts` for macOS). The factory at `calendar/index.ts:21` switches on `config.integrations.calendar.provider`. Adding a third provider is a clean extension — no abstraction work needed.

The `gws` CLI confirmed-supports the full surface:
- `gws calendar events list --params '{...}'`
- `gws calendar calendarList list`
- `gws calendar freebusy query --params '{...}'`
- `gws calendar events insert --params '{...}'`

All wrapped via the existing `gwsExec` (`packages/core/src/integrations/gws/client.ts`).

## Plan

1. **Implement `gws-calendar.ts` provider** — New file at `packages/core/src/integrations/calendar/gws-calendar.ts` implementing the full `CalendarProvider` interface. Map gws JSON output to existing `CalendarEvent`, `BusyBlock`, `FreeBusyResult`, `CreatedEvent` shapes. Use `gwsExec('calendar', '...', params)` exclusively — no direct shelling out, no `googleapis` dep.
   - Reuse only `getTodayRange` and `getUpcomingRange` from a new `calendar/date-helpers.ts` module (extracted from `google-calendar.ts:372-390`). Do NOT share `mapGoogleEvent`, `resolveCalendarNames`, or `fetchCalendarList` — gws response shape may differ.
   - Acceptance:
     - Provider returns `name === 'gws-calendar'` (matches registry key, mirrors `'google-calendar'` shape).
     - Returned events match the `CalendarEvent` shape from `types.ts`; `startTime`/`endTime` are `Date` instances; `isAllDay === true` for items with `start.date`-only.
     - For an event with `organizer.self === true` in fixture, mapper preserves `event.organizer.self === true`. For a recurring instance, `event.recurringEventId` is populated.
     - `getFreeBusy` returns per-email busy blocks with `Date` instances in `BusyBlock.start/end`; `createEvent` returns `{ id, htmlLink, summary, start, end }`.
     - `isAvailable()` returns `false` (not throws) for each of: `GwsNotInstalledError`, `GwsAuthError`, `GwsTimeoutError`, generic `Error`. Verified by 4 separate unit tests.

2. **Wire factory** — Extend `getCalendarProvider` in `packages/core/src/integrations/calendar/index.ts` to return the gws provider when `config.integrations.calendar.provider === 'gws'`. Maintain existing branches (`google`, `ical-buddy`, `macos`).
   - Acceptance: factory test mirroring `factory.test.ts:87` (`'google'` case): pass `{ integrations: { calendar: { provider: 'gws' } } }` to `getCalendarProvider`, assert returned `provider.name === 'gws-calendar'`. This is the regression test for producer-consumer alignment per `integrations/LEARNINGS.md` (2026-02-11 incident).
   - JSON output of `arete pull calendar --json` for a `provider: gws` workspace contains `events[*].title`, `startTime`, `endTime`, `isAllDay`, `attendees[]`, `organizer.self` populated identically to OAuth output (verified by side-by-side diff against an OAuth-backed fixture).

3. **Registry entry** — Add `gws-calendar` to `packages/core/src/integrations/registry.ts` (`displayName: "Google Calendar (gws)"`, `implements: ['calendar']`, `auth: { type: 'none' }`).
   - Acceptance: `arete integration list` shows the new entry alongside `apple-calendar` and `google-calendar`.

4. **Wire integration list alias mapping** — Update `packages/core/src/services/integrations.ts:122-137` calendar provider alias map to handle the `gws` provider value. When `config.integrations.calendar.provider === 'gws'`, set `configured['gws-calendar'] = calendarStatus`.
   - Acceptance: when `integrations.calendar.provider === 'gws'`, `arete integration list` shows `gws-calendar` row with `status: active`. Regression test added in `integrations.test.ts` mirroring the existing `'google'` and `'macos'` alias tests.

5. **Configure UX** — The current `name === 'calendar'` branch in `packages/cli/src/commands/integration.ts:98-136` is **non-interactive** and writes `provider: 'macos'` unconditionally. Convert it to an interactive `select` prompt offering three choices: macOS (ical-buddy), Google Calendar (OAuth), Google Workspace (gws). Match the inquirer pattern from `onboard.ts` (pageSize: 12). Add `--provider <gws|google|macos>` non-interactive flag for testability per CLI LEARNINGS.md "Non-interactive flags for testability" pattern. Preserve `--calendars` / `--all` flags for the macOS path.
   - When the user picks one, prompt (default Y) to clear the others' config:
     - Picking `gws` → delete `integrations.google-calendar.*` block AND delete `.arete/secrets/google-calendar.json` via `services.storage.delete()` (NOT `fs`).
     - Picking `google` → delete `integrations.calendar.provider: gws` config.
     - Picking `macos` → both above.
   - Selecting `gws` runs a smoke test (`gws calendar events list --params '{"maxResults":1}'`, 5s timeout) BEFORE writing config. On `GwsAuthError` or timeout: print "Run `gws auth login` first, then re-run configure" and abort without writing.
   - Acceptance:
     - Inquirer `select` prompt offers exactly three choices labeled `macOS (ical-buddy)`, `Google Calendar (OAuth)`, `Google Workspace (gws)`.
     - Three transition unit tests: gws→macos, macos→gws, google↔gws. Each verifies (a) confirm prompt fires when the other side has config, (b) writes correct cleanup if Y, (c) leaves config alone if N.
     - Smoke-test failure unit test: mocked `gwsExec` throws `GwsAuthError` → config is NOT written, stderr contains `gws auth login`.
     - `--provider gws` non-interactive run writes `integrations.calendar.provider: gws` and skips the prompt.

6. **Update CLI error messages for multi-provider** — `availability.ts:135,139` and `calendar.ts:317,321` hardcode "requires Google Calendar". gws now supports both `getFreeBusy` and `createEvent`. Replace with multi-provider messages: "Run: arete integration configure calendar (choose Google Workspace or Google Calendar)".
   - Acceptance: grep audit (`rg "requires Google Calendar" packages/cli/src/`) returns zero matches. Updated message renders correctly in both JSON and human paths.
   - Update `pull.ts:422-431` switch on `provider.name` to add the `gws-calendar` case: error "Google Workspace not authenticated", help "Run: gws auth login".

7. **Tests** — Unit tests for `gws-calendar.ts` mirror `packages/core/test/integrations/calendar/google-calendar.test.ts` structure exactly: mock `gwsExec` deps via DI, verify command shapes (`service: 'calendar'`, `command: 'events list'` etc.), verify response mapping using **real captured fixtures** per pre-mortem R1.
   - **Replace** `packages/core/test/integrations/gws/fixtures/calendar-events.json` (currently a 10-line hand-crafted stub — orphan, referenced by zero tests) with real `gws calendar events list` output. Capture additional fixtures: `gws-calendar-list.json`, `gws-calendar-freebusy.json`, `gws-calendar-event-insert.json`.
   - Acceptance:
     - The replacement events-list fixture contains ≥1 all-day event, ≥1 recurring event instance, ≥1 event with `organizer.self === true`.
     - ≥8 unit tests in `gws-calendar.test.ts` covering: events list (today + upcoming), freebusy, insert, 4 isAvailable error paths.
     - Factory regression test (per Step 2 AC).
     - `services/integrations.ts` alias mapping regression test (per Step 4 AC).

8. **Skill + docs** — Update SKILL.md and LEARNINGS.md with line-specific edits.
   - `packages/runtime/skills/calendar/SKILL.md`: L35 — list three providers (macOS / Google Calendar / Google Workspace); error table at L82 — add `auth_expired (gws)` row pointing to `gws auth login`.
   - `packages/core/src/integrations/gws/LEARNINGS.md`: Verified command paths table (L14-27) — add four rows for `events list`, `calendarList list`, `freebusy query`, `events insert`. Document any gws response-shape gaps observed during fixture capture (e.g. if `recurringEventId` is reshaped or missing).
   - Acceptance: SKILL.md and LEARNINGS.md changes match the line specs above.

## Risks

- **gws JSON shape drift from REST API** — The gws CLI may rename or wrap fields differently than the Google Calendar REST API. Mitigation: snapshot real `gws calendar events list` / `freebusy query` / `events insert` output as fixtures before writing the mapper; reference fixtures in tests.
- **Coexistence with `google-calendar` OAuth config** — If a user has both configured, behavior must be deterministic. Mitigation: explicit `provider` field is the source of truth; configure UX offers to clear the loser; document precedence in skill SKILL.md.
- **`auth_expired` UX** — gws auth failures surface via `GwsAuthError` from the wrapper. Mitigation: `isAvailable` catches it and returns `false`; pull command surfaces the same `Run: gws auth login` hint that other gws integrations use.
- **Recurring event handling** — REST API exposes `recurringEventId` on instances; verify gws CLI passes it through. If not, the `CalendarEvent.recurringEventId` field becomes optional/null for gws — acceptable.
- **Timezone precision in `events insert`** — `dateTime` ISO strings should round-trip via gws. Smoke test in step 4 catches mismatches early.

## Out of Scope

- Refactoring the OAuth-based `google-calendar.ts` provider — leave it intact for users who haven't switched to gws.
- Auto-fallback (using gws when `google-workspace.status === 'active'` regardless of `calendar.provider`). Explicit-only per builder decision.
- Read/write parity with the OAuth provider for fields gws doesn't expose (e.g. extended properties). Best-effort mapping; document gaps in LEARNINGS.
- `arete pull calendar` JSON output schema changes — must remain identical regardless of provider.
