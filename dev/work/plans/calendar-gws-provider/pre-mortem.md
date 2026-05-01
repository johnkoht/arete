## Pre-Mortem: Calendar — gws Provider

### Risk 1: gws JSON shape diverges from REST API

**Problem**: The gws CLI may wrap or rename fields differently than the Google Calendar REST API. Hand-mapping fields based on REST API docs alone has burned this codebase before — see `packages/core/src/integrations/gws/LEARNINGS.md` ("the original GWS adapter was built without running `--help` first; the command structure was invented and broke immediately on real use, 2026-04-05"). Without real fixtures, the mapper passes typecheck and unit tests, then dies on first real use.

**Mitigation**: Before writing the mapper, capture real CLI output as fixtures:
- `gws calendar events list --params '{"calendarId":"primary","maxResults":3}' > test/fixtures/gws-calendar-events-list.json`
- `gws calendar calendarList list > test/fixtures/gws-calendar-list.json`
- `gws calendar freebusy query --params '{"timeMin":"...","timeMax":"...","items":[{"id":"primary"}]}' > test/fixtures/gws-calendar-freebusy.json`
- `gws calendar events insert --params '...'  > test/fixtures/gws-calendar-event-insert.json` (and immediately delete the test event)

Reference these fixtures in unit tests via `JSON.parse(readFileSync(...))`. Do NOT hand-craft fixture JSON.

**Verification**: Each test in `gws-calendar.test.ts` loads a real fixture and asserts the mapper output matches the existing `CalendarEvent` / `BusyBlock` / `CreatedEvent` shape. PR diff shows the fixture files were added as part of the change, not later.

---

### Risk 2: Configure UX silently strands old config

**Problem**: A user switching from `google-calendar` (OAuth) to `gws` may end up with stale OAuth credentials in storage and a `google-calendar` integration entry in `arete integration list`. Future debugging becomes confusing — "why does `arete integration list` show two calendar providers active?"

**Mitigation**: When the configure flow writes a new calendar provider, it MUST offer (default Y) to clear the others' config keys AND remove their integration entries. Specifically:
- Picking `gws` → delete `integrations.google-calendar.*` entries from `arete.yaml` AND clear stored OAuth credentials (`google-auth.ts:saveGoogleCredentials` writes to `.arete/secrets/google-calendar.json` — that file should be deleted).
- Picking `google-calendar` → delete `integrations.calendar.provider: gws` config block.
- Picking `ical-buddy` → delete both above.

If the user declines cleanup, log a warning: "Multiple calendar providers configured — `provider: gws` will be used. Run `arete integration configure calendar` again to clean up."

**Verification**: Manual test in worktree: configure `google-calendar` (mock if needed), then configure `calendar` and select `gws` with cleanup=Y. Verify (a) `arete.yaml` no longer has `google-calendar` block, (b) `.arete/secrets/google-calendar.json` is gone, (c) `arete integration list` shows only the `gws` calendar entry as active.

---

### Risk 3: `isAvailable` throws instead of returning false

**Problem**: The contract for `CalendarProvider.isAvailable()` is "never throw — return false on failure" (see `google-calendar.ts:436` for the reference implementation). If the gws provider lets `GwsAuthError` / `GwsNotInstalledError` escape, the pull command crashes instead of showing the helpful "Run: gws auth login" message.

**Mitigation**: Wrap the entire `isAvailable` body in try/catch. Return `true` only after a real round-trip (`gws calendar events list --params '{"maxResults":1}'`). On any thrown error — auth, network, missing binary, JSON parse — return `false` and log to debug only. Reference pattern: `google-calendar.ts:436-450`.

**Verification**: Unit test injects a `gwsExec` dep that throws each of `GwsNotInstalledError`, `GwsAuthError`, `GwsTimeoutError`, generic `Error`. All four assert `isAvailable()` returns `false` (no throw).

---

### Risk 4: Provider name leaks into error UX paths

**Problem**: `pull.ts:422-431` switches on `provider.name` to produce help messages — `'ical-buddy'` and `'google-calendar'` are the known values. A new provider named `'gws-calendar'` falls into the generic `else` branch with a vague message ("Check your integration configuration"). Beyond `pull.ts`, the codebase has at least three other consumer sites that the initial pre-mortem missed (review-surfaced):
- `packages/core/src/services/integrations.ts:122-137` — alias map from `integrations.calendar.provider` value → registry name. Without a `'gws'` case, `arete integration list` will silently show `gws-calendar` as inactive even after configure succeeds. Different bug pattern (config-side switch, not `provider.name`), same failure mode.
- `packages/cli/src/commands/availability.ts:135,139` — hardcodes "Availability requires Google Calendar". gws supports `getFreeBusy`, so the message is now wrong.
- `packages/cli/src/commands/calendar.ts:317,321` — hardcodes "Event creation requires Google Calendar". gws supports `createEvent`, same issue.

**Mitigation**: Set `name: 'gws-calendar'` (mirroring `'google-calendar'`). Update all four sites:
1. `pull.ts:422-431` — add gws case: `Run: gws auth login`.
2. `services/integrations.ts:130-135` — add `if (calendarProvider === 'gws') configured['gws-calendar'] = calendarStatus`.
3. `availability.ts:135,139` and `calendar.ts:317,321` — replace hardcoded "Google Calendar" message with multi-provider: "Run: arete integration configure calendar (choose Google Workspace or Google Calendar)".

**Verification**: `rg "requires Google Calendar" packages/cli/src/` returns zero matches. `rg "provider\\.name\\s*===\\s*'" packages/cli/src/` returns zero unhandled cases. Manual test: configure gws calendar with broken auth, run `arete pull calendar`, confirm message says "Run: gws auth login". `arete integration list` for a `provider: gws` workspace shows `gws-calendar` as `active`.

---

### Risk 5: `recurringEventId` / `organizer` / all-day handling drift

**Problem**: `CalendarEvent` has `organizer`, `recurringEventId`, `isAllDay` fields populated by the OAuth provider. Downstream consumers (intelligence service, meeting-prep skill) may rely on them. If the gws CLI returns these fields under different keys (or omits them entirely), the gws-backed pull silently produces lower-fidelity events than the OAuth-backed one.

**Mitigation**: When capturing the events-list fixture (Risk 1), include at least one all-day event, one recurring event instance, and one event with `self: true` organizer. Verify the mapper populates all three fields. If a field genuinely isn't available via gws, document it in `gws/LEARNINGS.md` AND in the gws provider source as a comment ("gws CLI does not expose X — field will be undefined").

**Verification**: Fixture file contains at least one event of each type. Unit tests assert the mapper populates `organizer.self`, `recurringEventId`, and `isAllDay` correctly for each case.

---

### Risk 6: Smoke test in configure UX hangs on first-run auth

**Problem**: The plan calls for `gws calendar events list --params '{"maxResults":1}'` as a smoke test before writing config. If gws is installed but never authenticated, the CLI may launch a browser/keyring flow inline — bad UX inside an interactive `arete integration configure` prompt that's already mid-prompt.

**Mitigation**: Use the existing `detectGws()` helper (`gws/detection.ts`) plus `gwsExec` with a 5-second timeout. If `GwsAuthError` surfaces, surface "Run `gws auth login` first, then re-run configure" and abort BEFORE writing config. If timeout fires, treat as auth-flow-needed and same message. Do NOT silently write config if the smoke test failed.

**Verification**: Unit test on the configure command path with a mocked `gwsExec` that throws `GwsAuthError` — assert config is NOT written and stderr contains the `gws auth login` instruction.

---

### Risk 7: Reuse skipped — duplicate Google Calendar API logic

**Problem**: A subagent told to "implement gws calendar provider" may copy-paste the OAuth provider's pagination, calendar-name resolution, and date-range helpers, producing 200 lines that duplicate `google-calendar.ts:265-390` with only the auth path changed.

**Mitigation**: Extract the pure helpers from `google-calendar.ts` (`getTodayRange`, `getUpcomingRange`, `mapGoogleEvent`, `resolveCalendarNames`) into a shared module if and only if they're identical for gws. If the gws response shape differs even slightly, keep them separate — a 50-line duplication is cheaper than a wrong abstraction. Subagent prompt MUST include: "Read `google-calendar.ts:230-417` first. Reuse helpers IF and only IF gws response shape matches; otherwise duplicate with a comment explaining why."

**Verification**: Code review pass after Phase 4.1 — diff between `gws-calendar.ts` and `google-calendar.ts` should show meaningful divergence (auth path, command shape, response unwrapping), not parallel re-implementations of the same date logic.

---

### Risk 8: `.js` import discipline + dependency-injection pattern not followed

**Problem**: Areté uses ESM with explicit `.js` extensions on relative imports, and providers accept injected `deps` for testability (see `FreeBusyDeps`, `CreateEventDeps` in `google-calendar.ts`). A subagent may use `.ts` imports (typecheck error) or hardcode `gwsExec` (untestable).

**Mitigation**: Subagent prompt MUST include: (a) "Use `.js` extensions on all relative imports — see `google-calendar.ts:7` as reference"; (b) "Accept an optional `deps?: { exec?: GwsDeps['exec'] }` parameter on the factory and thread it through every `gwsExec` call — see `google-calendar.ts:43-52` and `gws/client.ts:25-31` as reference"; (c) reference fixture-driven test pattern from `gmail.ts` tests.

**Verification**: `npx tsc --noEmit -p packages/core/tsconfig.json` passes. `gws-calendar.test.ts` injects a mock `exec` and asserts the command shape — no real `child_process` calls.

---

## Summary

Total risks identified: 8
Categories covered: Reuse/Duplication (R1, R7), Documentation/UX (R2, R4), Code Quality (R3, R8), Integration (R4, R5), Test Patterns (R1, R8), Platform (R6), Context Gaps (R7, R8)

**No CRITICAL risks** — none of these block the plan; all have concrete mitigations.

**Ready to proceed with these mitigations.**
