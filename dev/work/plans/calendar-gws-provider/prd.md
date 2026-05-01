# PRD: Calendar — gws Provider

**Version**: 1.0
**Status**: Ready for Execution
**Date**: 2026-05-01
**Branch**: `feature/calendar-gws-provider`
**Plan**: `dev/work/plans/calendar-gws-provider/plan.md`
**Pre-mortem**: `dev/work/plans/calendar-gws-provider/pre-mortem.md`
**Review**: `dev/work/plans/calendar-gws-provider/review.md`
**Memory synthesis**: `dev/executions/calendar-gws-provider/memory-synthesis.md`

---

## 1. Problem & Goal

### Problem

The builder switched daily Google Workspace access from OAuth-based integrations to the `gws` CLI. Gmail, Drive, Docs, Sheets, and Directory already use it (`packages/core/src/integrations/gws/`). Calendar is the holdout — it still requires standalone OAuth via `arete integration configure google-calendar`. Skills calling `arete pull calendar`, `arete availability find`, or `arete calendar create` now fail with `auth_expired` because the OAuth tokens aren't being maintained.

### Goal

Add a third calendar provider backed by `gws` so users on `gws` can use the full calendar surface (read + freebusy + create) without configuring the legacy OAuth flow. Keep the existing OAuth-based provider intact for users who haven't switched.

### Out of Scope

- Refactoring `google-calendar.ts` (OAuth provider) — it stays as-is for users not on gws.
- Auto-fallback behavior (using gws when `google-workspace.status === 'active'` regardless of `calendar.provider`). Explicit-only by builder decision.
- Read/write parity with the OAuth provider for fields gws doesn't expose. Document gaps; do not paper over.
- Changing `arete pull calendar --json` output schema. Same shape regardless of provider.

---

## 2. Architecture

The existing `CalendarProvider` interface (`packages/core/src/integrations/calendar/types.ts`) is provider-agnostic. Extension is mechanical:

| Layer | Touch |
|-------|-------|
| Provider impl | Add `gws-calendar.ts` (new) — implements `CalendarProvider` via `gwsExec('calendar', ...)` |
| Provider factory | Extend `calendar/index.ts` switch — handle `provider === 'gws'` |
| Date helpers | Extract `getTodayRange` / `getUpcomingRange` to `calendar/date-helpers.ts` (shared) |
| Registry | Add `gws-calendar` entry to `integrations/registry.ts` |
| Alias map | Update `services/integrations.ts:122-137` — `'gws'` → `gws-calendar` |
| Configure UX | Convert `name === 'calendar'` branch in `cli/commands/integration.ts` from non-interactive (`provider: 'macos'`) to interactive `select` |
| Error messages | Update `pull.ts:422-431`, `availability.ts:135,139`, `calendar.ts:317,321` |
| Tests | New `gws-calendar.test.ts` + factory regression test + alias map regression test + CLI configure UX tests |
| Docs | `runtime/skills/calendar/SKILL.md`, `gws/LEARNINGS.md` |

---

## 3. Tasks

### task-1: Implement `gws-calendar.ts` provider

**Description**: Create `packages/core/src/integrations/calendar/gws-calendar.ts` implementing the full `CalendarProvider` interface using `gwsExec` exclusively. Mirror the structure of `google-calendar.ts` (factory function returning the provider object) but use `gws calendar events list / calendarList list / freebusy query / events insert` commands. Set `name: 'gws-calendar'`.

**Files to read first**:
- `packages/core/src/integrations/calendar/types.ts` (interface)
- `packages/core/src/integrations/calendar/google-calendar.ts` (reference shape, especially L43-52 DI pattern, L232-259 mapper, L429-585 factory)
- `packages/core/src/integrations/gws/client.ts` (gwsExec wrapper, error types)
- `packages/core/src/integrations/gws/gmail.ts` (DI + error-handling pattern in another gws provider)
- `packages/core/src/integrations/gws/LEARNINGS.md` (verified command paths)

**Embedded mitigations** (from pre-mortem):
- **R3** — `isAvailable()` MUST wrap entire body in try/catch and return `false` on every error type (`GwsNotInstalledError`, `GwsAuthError`, `GwsTimeoutError`, generic). Reference: `google-calendar.ts:436-450`.
- **R7** — Reuse only `getTodayRange` and `getUpcomingRange` (extract to new `calendar/date-helpers.ts`). Do NOT share `mapGoogleEvent`, `resolveCalendarNames`, `fetchCalendarList` — gws response shape may differ.
- **R8** — Use `.js` extensions on relative imports. Accept optional `deps?: { exec?: GwsDeps['exec'] }` and thread through every `gwsExec` call.

**Acceptance Criteria**:
1. File exists at `packages/core/src/integrations/calendar/gws-calendar.ts` and exports `getGwsCalendarProvider(deps?: { exec?: GwsDeps['exec'] }): CalendarProvider`.
2. New `packages/core/src/integrations/calendar/date-helpers.ts` exports `getTodayRange(): { timeMin: string; timeMax: string }` and `getUpcomingRange(days: number): { timeMin: string; timeMax: string }`. `google-calendar.ts` is updated to import from this module (no behavior change).
3. Returned provider has `name === 'gws-calendar'`.
4. `getTodayEvents` / `getUpcomingEvents` call `gwsExec('calendar', 'events list', { calendarId, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250 })` with proper pagination via `pageToken`.
5. Mapper produces `CalendarEvent` instances where `startTime`/`endTime` are `Date` instances and `isAllDay === true` for events with `start.date`-only.
6. For an event with `organizer.self === true` in fixture, mapper preserves `event.organizer.self === true`. For a recurring instance, `event.recurringEventId` is populated.
7. `getFreeBusy` calls `gwsExec('calendar', 'freebusy query', { timeMin, timeMax, items: [{id:'primary'},...] })` and returns `FreeBusyResult` with `Date` instances in `BusyBlock.start/end`.
8. `createEvent` calls `gwsExec('calendar', 'events insert', { calendarId, summary, start: {dateTime}, end: {dateTime}, ... })` and returns `{ id, htmlLink, summary, start, end }`.
9. `isAvailable()` returns `true` only after a successful `gws calendar events list --params '{"maxResults":1}'` round-trip; returns `false` (not throws) for `GwsNotInstalledError`, `GwsAuthError`, `GwsTimeoutError`, and generic `Error`. Verified by 4 separate unit tests (see task-7).

---

### task-2: Wire provider factory

**Description**: Update `packages/core/src/integrations/calendar/index.ts` `getCalendarProvider` to handle `provider === 'gws'` by importing and returning `getGwsCalendarProvider()`. Maintain existing branches for `'google'`, `'ical-buddy'`, `'macos'` exactly. Add a one-line comment per the existing convention ("configure writes 'gws' — keep in sync").

**Files to read first**:
- `packages/core/src/integrations/calendar/index.ts` (current factory)
- `packages/core/test/integrations/calendar/factory.test.ts` (existing pattern at L87 for `'google'` case is the template)

**Embedded mitigations**:
- **R1 (memory)** — The 2026-02-11 producer-consumer alignment incident is the canonical failure here. The regression test pattern from `packages/core/test/integrations/calendar.test.ts` ("accepts provider 'macos' as alias") is what the factory test must mirror.

**Acceptance Criteria**:
1. `getCalendarProvider({ integrations: { calendar: { provider: 'gws' } } }, storage, root)` returns a provider with `name === 'gws-calendar'`.
2. Factory regression test added in `packages/core/test/integrations/calendar/factory.test.ts` mirroring the `'google'` case at L87 — explicitly asserts the producer-consumer alignment.
3. Existing factory tests for `'google'`, `'ical-buddy'`, `'macos'`, `null` provider all still pass.

---

### task-3: Add registry entry

**Description**: Add `'gws-calendar'` entry to `packages/core/src/integrations/registry.ts`: `displayName: 'Google Calendar (gws)'`, `description: 'Google Calendar via gws CLI (no OAuth required)'`, `implements: ['calendar']`, `auth: { type: 'none' }`, `status: 'available'`. Place adjacent to the existing `google-calendar` entry.

**Files to read first**:
- `packages/core/src/integrations/registry.ts` (current shape)

**Acceptance Criteria**:
1. `INTEGRATIONS['gws-calendar']` is defined with the exact shape above.
2. `arete integration list` shows `gws-calendar` in the available integrations list (verified by snapshot or assertion in existing integration list test).

---

### task-4: Wire integration list alias mapping

**Description**: Update `packages/core/src/services/integrations.ts:122-137` calendar provider alias map. Add a third branch: when `calendarProvider === 'gws'` and `calendarStatus` is set, set `configured['gws-calendar'] = calendarStatus as IntegrationStatus`.

**Files to read first**:
- `packages/core/src/services/integrations.ts:108-140` (alias map block)
- Any test file covering `IntegrationService.list` (find via `grep -rn "list.*configured" packages/core/test/services/`)

**Embedded mitigations**:
- **R4-extended** — This is the consumer-side counterpart to task-2's factory wiring. The 2026-02-11 incident pattern: producer writes `'gws'`, consumer doesn't accept it → `arete integration list` silently shows the new entry as inactive. Test must use the exact value written by configure.

**Acceptance Criteria**:
1. With `arete.yaml` containing `integrations: { calendar: { provider: 'gws', status: 'active' } }`, `IntegrationService.list()` includes `'gws-calendar': 'active'` in `configured`.
2. Regression test added mirroring existing `'google'` and `'macos'` alias tests in the same file.
3. Existing alias tests for `'google'` and `'macos'`/`'ical-buddy'` still pass.

---

### task-5: Configure UX — interactive picker + cleanup + smoke test

**Description**: Convert the `name === 'calendar'` branch in `packages/cli/src/commands/integration.ts:98-136` from non-interactive to interactive. Currently it writes `provider: 'macos'` unconditionally. Replace with:

1. Inquirer `select` prompt offering three choices: `macOS (ical-buddy)`, `Google Calendar (OAuth)`, `Google Workspace (gws)`. Match `onboard.ts` `runIntegrationPhase()` style (pageSize: 12).
2. Add `--provider <gws|google|macos>` non-interactive flag (per CLI LEARNINGS.md "Non-interactive flags for testability"). When passed, skip the prompt.
3. Selecting `gws` runs a smoke test (`gws calendar events list --params '{"maxResults":1}'` with 5s timeout) BEFORE writing config. On `GwsAuthError` or timeout: print `Run 'gws auth login' first, then re-run configure` and abort without writing.
4. After a provider is chosen, prompt to clear the others' config (default Y):
   - Picking `gws` → delete `integrations.google-calendar.*` block AND delete `.arete/secrets/google-calendar.json` via `services.storage.delete()` (NOT `fs`).
   - Picking `google` → delete `integrations.calendar.provider: gws` config.
   - Picking `macos` → both above (when applicable).
5. Preserve the existing `--calendars` / `--all` flags for the `macos` path.

**Files to read first**:
- `packages/cli/src/commands/integration.ts:80-140` (current calendar branch)
- `packages/cli/src/commands/onboard.ts` (look for `runIntegrationPhase` — pattern reference for inquirer + confirm)
- `packages/cli/src/commands/LEARNINGS.md` ("Non-interactive flags for testability", "Integration phase pattern")
- `packages/core/src/integrations/gws/client.ts` (timeout + error types)

**Embedded mitigations**:
- **R2** — Cleanup uses `storage.delete()` for `.arete/secrets/google-calendar.json`, NOT `fs.unlink`. Cleanup uses `services.integrations.configure(root, 'google-calendar', null)` (or equivalent that clears the manifest block).
- **R6** — Smoke test must run BEFORE writing config. If `GwsAuthError` surfaces, do not write. Display `Run 'gws auth login' first` exactly.
- **Memory: CLI established patterns over bare minimum** — Match `onboard.ts` pattern, do not invent a lesser inquirer UX.

**Acceptance Criteria**:
1. Running `arete integration configure calendar` (no flags, TTY) presents an inquirer `select` with exactly three labeled choices in this order: `macOS (ical-buddy)`, `Google Calendar (OAuth)`, `Google Workspace (gws)`. `pageSize: 12`.
2. `arete integration configure calendar --provider gws --json` runs non-interactively (no prompts), runs the smoke test, writes `integrations.calendar.provider: gws` only if the smoke test passes, prints `{ success: true, integration: 'calendar', provider: 'gws' }`.
3. **Smoke-test failure unit test** (in `packages/cli/test/commands/integration.test.ts`): inject a `gwsExec` that throws `GwsAuthError`. Assert: (a) command exits non-zero, (b) `arete.yaml` is unchanged (no `integrations.calendar.provider: gws` written), (c) stderr contains the literal string `gws auth login`.
4. **Three transition tests** (each in `packages/cli/test/commands/integration.test.ts`), with `--provider <X>` non-interactive + a synthetic `confirm` injection seeded to Y:
   - Pre-state: `arete.yaml` has `integrations.google-calendar.{api_key, status}` populated AND `.arete/secrets/google-calendar.json` exists in mock storage. Run `--provider gws`. Assert post-state: `integrations.google-calendar` block removed; storage `delete('.arete/secrets/google-calendar.json')` was called; `integrations.calendar.provider === 'gws'`.
   - Pre-state: `integrations.calendar.provider: gws`. Run `--provider macos`. Assert: `integrations.calendar.provider === 'macos'`; no `provider: gws` lingers in the manifest.
   - Pre-state: `integrations.calendar.provider: gws`. Run `--provider google`. Assert: `integrations.calendar` block cleared; `integrations.google-calendar` configured (per existing google-calendar OAuth flow).
5. **Cleanup-decline test**: same gws→macos transition with confirm seeded to N — assert prior config IS preserved (no cleanup).
6. **Non-interactive backward compat**: existing test "configures calendar integration with default macos provider" (`integration.test.ts:25-54`) is updated to pass `--provider macos` explicitly, OR no-flag invocation in non-TTY (CI) defaults to `macos` to preserve backward compat. Pick the explicit-flag option per CLI LEARNINGS "Non-interactive flags for testability".
7. The existing `--calendars` / `--all` flags continue to work when paired with `--provider macos` OR alone (auto-implies `macos`).
8. `--provider` accepts only `gws`, `google`, `macos` — invalid value exits with a clear error listing the valid options.

---

### task-6: Update CLI error messages for multi-provider

**Description**: Three CLI files hardcode "Google Calendar" in error messages where gws now also satisfies the requirement:
1. `packages/cli/src/commands/availability.ts:135,139` — replace `Availability requires Google Calendar. Run: arete integration configure google-calendar` with `Availability requires a calendar provider supporting free/busy. Run: arete integration configure calendar`.
2. `packages/cli/src/commands/calendar.ts:317,321` — replace `Event creation requires Google Calendar. Run: arete integration configure google-calendar` with `Event creation requires a calendar provider supporting event creation. Run: arete integration configure calendar`.
3. `packages/cli/src/commands/pull.ts:422-431` — extend the `provider.name` switch to add a `'gws-calendar'` case: `errorMsg = 'Google Workspace not authenticated'`, `helpMsg = 'Run: gws auth login'`.

**Files to read first**:
- All three files at the cited line ranges.

**Acceptance Criteria**:
1. `rg "requires Google Calendar" packages/cli/src/` returns zero matches.
2. **Unit test in `packages/cli/test/commands/availability.test.ts`** (or create if missing): with no calendar provider returning `getFreeBusy`, the JSON output contains `error: 'Availability requires a calendar provider supporting free/busy'` and `message: 'Run: arete integration configure calendar'`.
3. **Unit test in `packages/cli/test/commands/calendar.test.ts`** (or create if missing): with no calendar provider returning `createEvent`, JSON output contains `error: 'Event creation requires a calendar provider supporting event creation'`.
4. **Unit test in `packages/cli/test/commands/pull.test.ts`** (extend existing): for a provider stub with `name === 'gws-calendar'` and `isAvailable() → false`, JSON output contains `error: 'Google Workspace not authenticated'` and `message: 'Run: gws auth login'`.
5. `rg "provider\\.name\\s*===\\s*'" packages/cli/src/` shows the `gws-calendar` case is handled in `pull.ts:422-431` alongside `'ical-buddy'` and `'google-calendar'`.
6. The generic `else` branch in `pull.ts:428-431` is reachable only for truly unknown provider names (not for our three known providers).

---

### task-7: Tests — gws-calendar provider + fixture replacement

**Description**: Create `packages/core/test/integrations/calendar/gws-calendar.test.ts` mirroring `google-calendar.test.ts` structure. Mock `gwsExec` deps via DI (NOT real `child_process`). Use real captured CLI output as fixtures.

**CRITICAL**: The existing `packages/core/test/integrations/gws/fixtures/calendar-events.json` is a **hand-crafted 10-line stub** referenced by zero tests. Per pre-mortem R1, this is the highest-stakes failure mode for this build. **Replace** it with real captured `gws` output BEFORE writing the mapper.

**Files to read first**:
- `packages/core/test/integrations/calendar/google-calendar.test.ts` (mirror structure exactly)
- `packages/core/test/integrations/gws/gmail.test.ts` (DI-via-fixtures pattern in another gws provider)
- `packages/core/test/integrations/gws/fixtures/calendar-events.json` (the orphan stub to replace)

**Embedded mitigations**:
- **R1** — Capture real fixtures via:
  ```bash
  gws calendar events list --params '{"calendarId":"primary","maxResults":10,"singleEvents":true,"orderBy":"startTime"}' > test/integrations/gws/fixtures/calendar-events-list.json
  gws calendar calendarList list > test/integrations/gws/fixtures/calendar-list.json
  gws calendar freebusy query --params '{"timeMin":"<now>","timeMax":"<+7d>","items":[{"id":"primary"}]}' > test/integrations/gws/fixtures/calendar-freebusy.json
  # For events insert: create a test event, capture, immediately delete
  gws calendar events insert --params '...' > test/integrations/gws/fixtures/calendar-event-insert.json
  ```
- **R5** — Captured events-list fixture MUST include ≥1 all-day event, ≥1 recurring event instance, ≥1 event with `organizer.self === true`. If the captured run doesn't include these naturally, capture additional events or add them to the test calendar before recapture.

**Acceptance Criteria**:
1. The orphan `packages/core/test/integrations/gws/fixtures/calendar-events.json` is REPLACED (or deleted in favor of new `calendar-events-list.json`); no orphan stubs remain.
2. The replacement events-list fixture contains ≥1 event with `start.date` only (all-day), ≥1 event with `recurringEventId` set, ≥1 event with `organizer.self === true`. Verified by jq-based assertion or test-time sanity check.
3. Three additional fixtures captured: `calendar-list.json`, `calendar-freebusy.json`, `calendar-event-insert.json`.
4. ≥8 unit tests in `gws-calendar.test.ts` covering:
   - `getTodayEvents` returns mapped `CalendarEvent[]` with correct `Date` instances.
   - `getUpcomingEvents(7)` returns mapped events for the 7-day window.
   - Mapper preserves `organizer.self`, `recurringEventId`, `isAllDay` (asserted on real fixture data).
   - `getFreeBusy` returns `FreeBusyResult` with `Date` instances and per-email `accessible` flags.
   - `createEvent` returns `{ id, htmlLink, summary, start, end }`.
   - `isAvailable()` returns `false` on `GwsNotInstalledError`.
   - `isAvailable()` returns `false` on `GwsAuthError`.
   - `isAvailable()` returns `false` on `GwsTimeoutError`.
   - `isAvailable()` returns `false` on generic `Error`.
5. Factory regression test added (per task-2 AC).
6. `IntegrationService.list` alias-mapping regression test added (per task-4 AC).
7. All new tests + existing calendar/gws tests pass: `npm test -w @arete/core`.

---

### task-8: Skill + LEARNINGS docs

**Description**: Update SKILL.md and LEARNINGS.md with line-specific edits.

**Files to edit**:
- `packages/runtime/skills/calendar/SKILL.md`:
  - Around L35 — update active-integration list to include gws.
  - L38-41 — update the "no calendar" hint to suggest all three configure paths.
  - Error table (L82-86) — add `auth_expired (gws)` row pointing to `Run: gws auth login`.
- `packages/core/src/integrations/gws/LEARNINGS.md`:
  - Verified command paths table (L14-27) — add four new rows for `events list`, `calendarList list`, `freebusy query`, `events insert` with the exact `--params` shapes used in `gws-calendar.ts`.
  - If fixture capture revealed gws response-shape gaps (e.g. fields missing or reshaped), add a documented section "Calendar Response Shape Notes" capturing them.

**Acceptance Criteria**:
1. SKILL.md L35 lists three calendar providers (macOS / Google Calendar / Google Workspace).
2. SKILL.md error table includes `auth_expired (gws)` row pointing to `gws auth login`.
3. `gws/LEARNINGS.md` Verified command paths table includes 4 new calendar rows with real `--params` JSON.
4. Any gws response-shape gaps observed during fixture capture are documented in a new section in `gws/LEARNINGS.md` (or noted as "no gaps observed" if so).

---

## 4. Testing Strategy

### 4.1 Test Pyramid

| Layer | Goal | Files | Count |
|-------|------|-------|-------|
| **Fixture-driven unit** | Verify response mapping matches real gws CLI output | `gws-calendar.test.ts` (new) | ≥10 tests |
| **Provider unit** | Verify command shapes + error handling | `gws-calendar.test.ts` (new) | ≥6 tests |
| **Producer-consumer regression** | Lock factory + alias map alignment with config writer | `factory.test.ts` (extend), `integrations.test.ts` (extend) | 2 tests |
| **CLI integration** | Verify configure UX writes correct config + cleanup | `integration.test.ts` (extend) | ≥6 tests |
| **CLI error path** | Verify multi-provider error messages | `availability.test.ts`, `calendar.test.ts`, `pull.test.ts` (extend) | 3 tests |
| **Manual UX smoke** | Full flow against builder's real `gws` workspace | (manual, gated before merge) | 6 scenarios — see §4.5 |

### 4.2 Fixture Capture Protocol (Pre-mortem R1)

**Run BEFORE writing any mapper code.** Capture from the builder's authenticated `gws` CLI:

```bash
# From the worktree root:
mkdir -p packages/core/test/integrations/gws/fixtures

# 1. Events list — must include all-day, recurring, organizer.self===true
gws calendar events list --params '{"calendarId":"primary","maxResults":50,"singleEvents":true,"orderBy":"startTime","timeMin":"<7-days-ago>","timeMax":"<7-days-out>"}' --format json \
  > packages/core/test/integrations/gws/fixtures/calendar-events-list.json

# Sanity check the captured fixture meets R5 requirements:
jq '[.items[] | select(.start.date)] | length' < calendar-events-list.json   # must be ≥1 (all-day)
jq '[.items[] | select(.recurringEventId)] | length' < calendar-events-list.json   # must be ≥1
jq '[.items[] | select(.organizer.self == true)] | length' < calendar-events-list.json   # must be ≥1

# 2. Calendar list
gws calendar calendarList list --format json \
  > packages/core/test/integrations/gws/fixtures/calendar-list.json

# 3. FreeBusy (pick two real attendees from the workspace people/ index)
gws calendar freebusy query --params '{"timeMin":"<now>","timeMax":"<+7d>","items":[{"id":"primary"},{"id":"<email1>"},{"id":"<email2>"}]}' --format json \
  > packages/core/test/integrations/gws/fixtures/calendar-freebusy.json

# 4. Events insert (create test event, capture, immediately delete)
gws calendar events insert --params '{"calendarId":"primary","summary":"arete fixture capture — DELETE","start":{"dateTime":"<+1d>"},"end":{"dateTime":"<+1d+30m>"}}' --format json \
  > packages/core/test/integrations/gws/fixtures/calendar-event-insert.json
gws calendar events delete --params '{"calendarId":"primary","eventId":"<id-from-insert>"}'

# 5. DELETE the orphan stub
rm packages/core/test/integrations/gws/fixtures/calendar-events.json
```

Commit the captured fixtures in the same commit as the mapper. **Do not redact email domains** — the test calendar is the builder's; PII risk is acknowledged and accepted (consistent with existing fixtures like `gmail-messages.json`).

### 4.3 Test File Map

| New / Extended File | What It Covers | Pattern Mirror |
|---------------------|----------------|----------------|
| `packages/core/test/integrations/calendar/gws-calendar.test.ts` (NEW) | Provider shape + mapper + isAvailable error paths | `google-calendar.test.ts` describe blocks (L161-650) |
| `packages/core/test/integrations/calendar/factory.test.ts` (EXTEND) | Factory selects gws-calendar for `provider: 'gws'` | Existing `'google'` case at L87 |
| `packages/core/test/services/integrations.test.ts` (EXTEND) | Alias map maps `provider: 'gws'` → `gws-calendar` | Existing block L328-402 ("calendar provider mapping") |
| `packages/cli/test/commands/integration.test.ts` (EXTEND) | Configure UX: picker, `--provider`, smoke test, 4 transitions | Existing test L25-54 (update to use `--provider macos`) |
| `packages/cli/test/commands/availability.test.ts` (NEW or EXTEND) | Multi-provider error message | If file doesn't exist, create per `integration.test.ts` boilerplate |
| `packages/cli/test/commands/calendar.test.ts` (NEW or EXTEND) | Multi-provider error message | Same as above |
| `packages/cli/test/commands/pull.test.ts` (EXTEND) | gws-calendar provider.name case | Existing `'google-calendar'` case |

### 4.4 Critical Regression Tests (Producer-Consumer Alignment)

Two tests are non-negotiable per the 2026-02-11 incident pattern:

1. **Factory regression** (`factory.test.ts`): exact value `'gws'` written by configure → factory returns `name === 'gws-calendar'`. If this test passes but `pull` errors on a real workspace, the test is wrong.
2. **Alias map regression** (`integrations.test.ts`): exact value `'gws'` in `arete.yaml` → `IntegrationService.list()` returns `gws-calendar` with `configured: 'active'`. Mirrors the existing google/macos tests in the same describe block.

These two tests + the configure UX writing exactly `'gws'` form the producer-consumer triangle. Reviewer must verify all three vertices use the same string literal.

### 4.5 Manual UX Smoke Test (Gates Merge)

**Run by the builder in the worktree before merge approval.** No automation — these exist because the UX is the point.

1. **Fresh interactive picker** — `arete integration configure calendar` (no flags). Verify three choices appear, labels are friendly, pageSize feels right.
2. **Pick gws on a fresh workspace** — verify smoke test runs, "looks fast", config is written.
3. **Pick gws when google-calendar is already configured** — verify cleanup prompt fires with `default: Y`. Press Enter. Verify `arete.yaml` and `.arete/secrets/google-calendar.json` are gone.
4. **`arete pull calendar --today`** — verify events list, attendees, organizer, all-day events render correctly. Compare side-by-side with old OAuth pull if you can.
5. **`arete availability find --with <person>`** — verify free/busy works without OAuth.
6. **`arete calendar create --title "test" --start "<future>" --end "<future>"`** — verify event is created, `htmlLink` returns, event appears in Google Calendar UI.

If any of the 6 scenarios feels off, halt and report. Do not merge on "tests pass" alone.

### 4.6 Quality Gates (Per Task)

Before marking any task `passes: true`:
- `npm run typecheck -w @arete/core` passes (zero new errors).
- `npm run typecheck -w @arete/cli` passes (zero new errors).
- `npm test -w @arete/core` passes (all relevant suites).
- `npm test -w @arete/cli` passes (all relevant suites).
- For tasks 1, 2, 4, 7: the producer-consumer regression triangle (factory + alias map + configure writer write the same `'gws'` literal) passes — non-negotiable per `2026-02-11_calendar-provider-macos-alias.md`.
- No `any` types in new code; explicit return types on exported functions.
- All relative imports use `.js` extensions (per `packages/core/src/integrations/gws/LEARNINGS.md`).
- No new `child_process` calls outside `gws/client.ts` (use `gwsExec`).

## 5. Final Review (Before Merge)

End-to-end review per `2026-04-23 topic-wiki-memory` learnings:
- **Dark-code audit** — every new export has a non-test caller. Specifically: `getGwsCalendarProvider` called from `calendar/index.ts`; `gws-calendar` registry entry referenced; alias map case present in `services/integrations.ts`; provider.name case present in `pull.ts`.
- **Reviewer prompt** must include: "candid engineering judgment, not diplomatic hedging."
- **Producer-consumer alignment check**: every config value `'gws'` written by configure has a matching reader in factory + alias map + provider.name switch.
- **Builder UX testing gate**: STOP before merge. The builder will manually exercise the configure flow + pull + availability + create against their live workspace before approving merge.
