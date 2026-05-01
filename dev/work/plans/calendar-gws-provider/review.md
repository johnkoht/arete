# Review: Calendar — gws Provider

**Type**: Plan
**Audience**: Builder
**Review Path**: Full
**Complexity**: Medium
**Recommended Track**: standard

---

## Summary

Strong plan with thorough pre-mortem. The provider abstraction is genuinely clean and the addition is mostly mechanical. However, the plan misses three concrete consumers of the calendar provider/config that need the same updates as `pull.ts:422-431` (cited in pre-mortem R4), and Step 4 understates the scope of the configure UX work — the current `name === 'calendar'` branch in `integration.ts` is non-interactive and writes `provider: 'macos'` unconditionally. There is also an orphan stub fixture in `gws/fixtures/calendar-events.json` that will mislead implementers if not replaced. None of these are blockers — all have one-line fixes.

---

## Concerns

### 1. **Coverage gap (critical)**: pre-mortem R4 only patched `pull.ts`; three other call sites are missed
   - `packages/core/src/services/integrations.ts:122-137` — the alias map from `integrations.calendar.provider` → registry name (`'google'` → `google-calendar`, `'macos'`/`'ical-buddy'` → `apple-calendar`). When the user picks `gws`, this map currently produces no entry, so `arete integration list` will NOT show the new `gws-calendar` registry entry as `active`. Step 3 (registry entry) is therefore incomplete on its own.
   - `packages/cli/src/commands/availability.ts:135,139` — error string hardcodes "Availability requires Google Calendar. Run: arete integration configure google-calendar". gws supports `getFreeBusy`, so this branch is no longer "Google-only" — but if a user without `getFreeBusy` (e.g. ical-buddy) hits this path, the message must mention `gws` as an alternative.
   - `packages/cli/src/commands/calendar.ts:317,321` — same issue for `createEvent`. Hardcoded "Event creation requires Google Calendar. Run: arete integration configure google-calendar".
   - **Suggestion**: Add a Step 2.5 ("Wire integration list alias mapping") to update `services/integrations.ts:130-135` to map `'gws'` → `'gws-calendar'`. Add an explicit bullet under Step 4 to update the two CLI error messages in `availability.ts` and `calendar.ts` to mention all three configure paths (or at least both Google-backed ones).

### 2. **Step 4 understates scope**: configure UX rewrite is larger than "extend"
   - Plan: "Extend the existing `arete integration configure calendar` prompt to offer three choices..."
   - Reality: `integration.ts:98-136` (the `name === 'calendar'` branch) is **non-interactive** — it does not currently prompt the user. It writes `provider: 'macos'` unconditionally and only consumes `--calendars` / `--all` flags. There are separate `name === 'google-calendar'` (L187-265) and `name === 'google-workspace'` (L268-349) branches that DO have flows. The plan is asking to introduce a new interactive picker on the `calendar` subcommand (at minimum the inquirer `select`) and decide what `arete integration configure calendar` (without flags) should do today.
   - **Suggestion**: In Step 4, explicitly state: "Convert the `name === 'calendar'` branch from non-interactive (writes `provider: 'macos'`) to an interactive `select` prompt with three options. Match the inquirer pattern from `onboard.ts` (pageSize: 12). Preserve `--calendars` / `--all` flags on macOS path. Add `--provider gws|google|macos` non-interactive flag for testability — see CLI LEARNINGS.md `'Non-interactive flags for testability'` pattern."

### 3. **Orphan fixture trap**: `gws/fixtures/calendar-events.json` is hand-crafted and minimal
   - `packages/core/test/integrations/gws/fixtures/calendar-events.json` is 10 lines, has only one event, NO `recurringEventId`, NO all-day event, NO `organizer.self`, NO `attendees` field. It is referenced by zero tests today (`rg calendar-events` returns nothing).
   - This fixture exactly matches the failure mode pre-mortem R1 warns about ("hand-crafted fixture passes typecheck and unit tests then dies on first real use"). An implementer who finds it will trust it.
   - **Suggestion**: Step 5 must explicitly state: "Delete or overwrite `packages/core/test/integrations/gws/fixtures/calendar-events.json` — it is a hand-crafted stub. Replace with real `gws calendar events list` output captured per pre-mortem R1." Also add a fixture for `calendarList list` and `freebusy query` and `events insert` (per R1 mitigation list).

### 4. **Skill SKILL.md update is underspecified**
   - Step 6: "Update `packages/runtime/skills/calendar/SKILL.md` error-handling table to mention the `gws` path."
   - The existing SKILL.md L35,40,82,84 hardcodes `google-calendar` / `icalBuddy` references. The "Look for an active calendar integration" line at L35 will need updating, and the error table at L82-84 needs a row for `auth_expired (gws)` → `Run: gws auth login`.
   - **Suggestion**: Spell out the exact lines that change. Add an AC: "SKILL.md L35 lists three providers; error table includes `auth_expired (gws)` row pointing to `gws auth login`."

### 5. **Test coverage gap**: factory test for `provider === 'gws'` is implicit
   - Step 5 mentions "an integration test for the factory selecting the right provider per config" but doesn't reference the existing pattern at `packages/core/test/integrations/calendar/factory.test.ts:87,115,129` or `integration.test.ts:223,255`. The 2026-02-11 producer-consumer mismatch (documented in `integrations/LEARNINGS.md` Gotchas §1) is the canonical example of why this regression test matters.
   - **Suggestion**: Step 5 ACs should explicitly call out: "Add a test in `factory.test.ts` mirroring the `'google'` case at L87 — pass `{ integrations: { calendar: { provider: 'gws' } } }` to `getCalendarProvider`, assert `provider.name === 'gws-calendar'`. This is the regression test for producer-consumer alignment per LEARNINGS.md."

### 6. **Configure-UX cleanup logic is unspecified at the storage level**
   - Pre-mortem R2 lists the cleanup steps but the plan body just says "offer to clear the others' config (default Y)" without specifying *what* gets cleared. Specifically: clearing `.arete/secrets/google-calendar.json` is filesystem (not config) work. This needs to use the `StorageAdapter.delete` method, not `fs.unlink`.
   - **Suggestion**: Add to Step 4 ACs: "Cleanup uses `services.storage.delete(...)` for `.arete/secrets/google-calendar.json` — not `fs`. Cleanup uses `services.integrations.configure(root, 'google-calendar', null)` or equivalent to remove the manifest block."

---

## AC Validation Issues

| Task | AC text | Issue | Suggested Fix |
|------|---------|-------|---------------|
| Step 1 | "provider returns valid `CalendarEvent[]` for today + upcoming windows" | "valid" is undefined | "Returned events match the `CalendarEvent` shape from types.ts; `startTime`/`endTime` are `Date` instances; `isAllDay === true` for items with `start.date`-only (no time)" |
| Step 1 | "`isAvailable` returns false (not throws) on missing/auth-expired gws" | Single concern but missing failure modes | Split: "Returns `false` when `GwsNotInstalledError` thrown" + "Returns `false` when `GwsAuthError` thrown" + "Returns `false` when `GwsTimeoutError` thrown" + "Returns `false` on generic `Error`" — matches pre-mortem R3 verification |
| Step 2 | "`arete pull calendar --json` works end-to-end on a workspace configured with `provider: gws`" | "works" is vague | "JSON output matches the schema produced by the OAuth provider for the same calendar — `events[*].title`, `startTime`, `endTime`, `isAllDay`, `attendees[]`, `organizer.self` all present" — also matches Out of Scope §4 invariant |
| Step 3 | "`arete integration list` shows the new entry alongside `apple-calendar` and `google-calendar`" | Doesn't verify `active`/`configured` mapping | "When `integrations.calendar.provider === 'gws'`, `arete integration list` shows `gws-calendar` row with `status: active` (verifies the alias map in `services/integrations.ts:130-135` was updated)" |
| Step 4 | "fresh interactive run picks any of the three" | Untestable claim about user behavior | "Inquirer `select` prompt offers exactly three choices: `macOS (ical-buddy)`, `Google Calendar (OAuth)`, `Google Workspace (gws)` — verified by snapshotting prompt state" — or via a non-interactive `--provider` flag test |
| Step 4 | "switching from one to another offers cleanup" | Single concern but spans 3 transitions | Split into 3 ACs (gws→macos, macos→gws, google↔gws) — each verifies (a) confirm prompt fires, (b) writes correct cleanup if Y, (c) leaves config alone if N |
| Step 4 | "smoke test failure surfaces a clear error pointing to `gws auth login`" | Good — matches pre-mortem R6 | OK as-is |
| Step 5 | "new tests pass, no regressions in existing calendar/gws tests" | Vague — true of every PR | Drop or replace with specific count: "≥8 unit tests in `gws-calendar.test.ts` covering events list / freebusy / insert / 4 isAvailable error paths; factory regression test added per LEARNINGS.md producer-consumer pattern" |
| Step 6 | "skill markdown and LEARNINGS reflect the new path" | "reflect" is vague | "SKILL.md L35 lists three providers; error table at L82 includes `auth_expired (gws)` row; LEARNINGS.md Verified command paths table at L14-27 adds rows for `events list`, `calendarList list`, `freebusy query`, `events insert`" |

---

## Test Coverage Gaps

- **Factory regression test for `provider === 'gws'`** — should mirror `factory.test.ts:87` exactly, asserts `provider.name === 'gws-calendar'`. This is the canonical regression test from LEARNINGS.md (2026-02-11 incident).
- **`services/integrations.ts` alias mapping** — needs a test in `services/integrations.test.ts` (or wherever `IntegrationService.list` is tested) asserting that `provider: 'gws'` produces `configured['gws-calendar'] = 'active'`.
- **CLI error message audit** — at minimum a grep test that no error message in `packages/cli/src/commands/` says "requires Google Calendar" without also mentioning `gws` (or splits providers cleanly).
- **Smoke-test failure path in configure** — pre-mortem R6 verification calls for a unit test where `gwsExec` throws `GwsAuthError` and config is NOT written. The plan's Step 4 ACs should reference this test explicitly.

---

## Pre-Mortem Cross-Check Against Code

The pre-mortem is genuinely thorough, but two gaps remain when validated against actual code:

1. **R4 "provider.name leaks"** identifies `pull.ts:422-431` but does NOT identify the alias map in `services/integrations.ts:130-135`. That's not a `provider.name` switch — it's a `config.provider` switch on the producer side — but the same bug pattern (new value falls through), and `arete integration list` will silently mis-report. Recommend adding an R4b or extending R4.

2. **R7 "duplicate Google Calendar API logic"** — Validated against the actual code:
   - `getTodayRange` (L372-380) and `getUpcomingRange` (L382-390) — pure date helpers, no API shape coupling. Genuinely safe to share.
   - `mapGoogleEvent` (L232-259) — heavy REST API coupling (`item.start.dateTime`, `item.start.date`, `item.organizer.self`). gws output shape is not yet known, so duplication is correct here — pre-mortem R7's guidance ("duplicate with a comment") is right.
   - `resolveCalendarNames` (L344-366) — depends on `fetchCalendarList` (L307-338) which is REST-coupled. Skip extraction.
   - **Bottom line**: R7's "extract IF identical, otherwise duplicate" rule is the right call. Plan should add an explicit AC: "Extract only `getTodayRange` and `getUpcomingRange` to a `calendar/date-helpers.ts` module — leave all other logic separate." Concrete extraction scope keeps subagents from over-eager refactoring.

3. **Test pattern reference** — pre-mortem R8 references `gmail.ts` tests but the closer model is `packages/core/test/integrations/calendar/google-calendar.test.ts:628` (already validates `provider.name === 'google-calendar'`). Mirror that file's structure exactly.

---

## Strengths

- Clean extension to a genuinely well-factored `CalendarProvider` interface — no abstraction work.
- Pre-mortem is thorough (8 risks, all with concrete mitigations) and correctly identifies the highest-stakes risk (R1: hand-crafted fixtures) up front.
- Out-of-scope section is disciplined — no auto-fallback, no OAuth refactor, no JSON schema change. All three are correct calls.
- Reuse vs duplication framing in R7 is exactly right ("duplication is cheaper than wrong abstraction").
- DI pattern (R8) correctly matches the established `FreeBusyDeps`/`CreateEventDeps` shape from `google-calendar.ts:43-52`.

---

## Devil's Advocate

**If this fails, it will be because…** the implementer captures fixtures from `gws calendar events list` against a calendar without a recurring event or all-day event, the mapper passes all unit tests, and the first real-world `arete pull calendar` produces `CalendarEvent[]` where `isAllDay` is wrong on every all-day item or `recurringEventId` is silently missing — breaking downstream meeting-importance inference (`integrations/LEARNINGS.md` "Meeting Importance Inference" L222-242 reads `organizer.self` directly). Pre-mortem R5 already calls this out — but only if Step 5 ACs hard-require fixtures that include each event type.

**The worst outcome would be…** silent fidelity loss. The OAuth provider and gws provider both succeed (no error), produce structurally identical `CalendarEvent[]`, but the gws version is missing `organizer.self` or `recurringEventId` — so the importance inference quietly downgrades `'important'` → `'normal'` for every meeting where the user is organizer. The user notices weeks later when `arete brief` recommendations feel "off" but can't trace why. This is much worse than a hard failure because there's no error to grep for.

Mitigation: Step 5 ACs must include "Mapper unit test for an event with `organizer.self === true` asserts `event.organizer.self === true`" — concrete field-level parity test.

---

## Verdict

- [ ] Approve
- [x] **Approve with suggestions** — Apply Concerns 1-6 and the AC sharpening above. Most are one-line edits; only Concern 2 (configure UX scope) and Concern 1 (alias map) require non-trivial implementation additions. The pre-mortem already covers the highest-stakes risks; this review surfaces three additional consumer sites (`services/integrations.ts:130`, `availability.ts:135`, `calendar.ts:317`) that the pre-mortem missed.
- [ ] Revise

---

## Suggested Changes (Concrete, file:line specific)

**Change 1**: Add Step 2.5 — Wire alias map
- **What's wrong**: `services/integrations.ts:130-135` has no `'gws'` case. `arete integration list` will not show the new entry as `active`.
- **What to do**: Add a third branch: `if (calendarProvider === 'gws') configured['gws-calendar'] = calendarStatus as IntegrationStatus;`
- **Where to fix**: `packages/core/src/services/integrations.ts:130-135`; add regression test mirroring the existing pattern.

**Change 2**: Expand Step 4 to include CLI error message updates
- **What's wrong**: `availability.ts:135,139` and `calendar.ts:317,321` hardcode "Google Calendar"; gws now supports both `getFreeBusy` and `createEvent`.
- **What to do**: Replace single-provider error messages with multi-provider ones. Example: "Run: arete integration configure calendar (choose Google Workspace or Google Calendar)".
- **Where to fix**: `packages/cli/src/commands/availability.ts:135,139`, `packages/cli/src/commands/calendar.ts:317,321`.

**Change 3**: Add explicit `provider.name` value to Step 1 AC
- **What's wrong**: Pre-mortem R4 says "set `name: 'gws-calendar'`" but plan body Step 1 doesn't lock the value, leaving room for `'gws'` confusion.
- **What to do**: Step 1 AC: "Provider returns `name === 'gws-calendar'` (matches registry key, mirrors `'google-calendar'` shape)."
- **Where to fix**: plan.md Step 1 AC bullet.

**Change 4**: Update Step 4 to acknowledge `name === 'calendar'` branch is non-interactive today
- **What's wrong**: "Extend the existing prompt" implies a prompt exists.
- **What to do**: "The current `name === 'calendar'` branch (`integration.ts:98-136`) is non-interactive and writes `provider: 'macos'` unconditionally. Convert to an interactive `select` prompt with three options. Add `--provider <gws|google|macos>` flag for non-interactive testability per CLI LEARNINGS.md pattern."
- **Where to fix**: plan.md Step 4 first sentence.

**Change 5**: Replace orphan fixture
- **What's wrong**: `packages/core/test/integrations/gws/fixtures/calendar-events.json` is a hand-crafted stub (10 lines, 1 event, missing recurring/all-day/organizer fields).
- **What to do**: Step 5 AC: "Replace existing `calendar-events.json` fixture with real `gws` output captured per R1. Fixture must include ≥1 all-day event, ≥1 recurring event instance, ≥1 event with `organizer.self === true`."
- **Where to fix**: plan.md Step 5; pre-mortem R1 verification block.

**Change 6**: Make Step 6 line-specific
- **What's wrong**: "reflect the new path" doesn't tell the implementer where to edit.
- **What to do**: Step 6: "(a) `runtime/skills/calendar/SKILL.md` L35 — add gws to the active-integration list; L82-84 — add `auth_expired (gws)` row pointing to `gws auth login`. (b) `core/src/integrations/gws/LEARNINGS.md` L14-27 — add four rows to the Verified command paths table for `events list`, `calendarList list`, `freebusy query`, `events insert`."
- **Where to fix**: plan.md Step 6.

**Change 7**: Lock the helper-extraction scope
- **What's wrong**: R7 leaves the "extract IF identical" judgment to the implementer; that's where over-eager refactoring sneaks in.
- **What to do**: Add to Step 1 AC: "Reuse only `getTodayRange` and `getUpcomingRange` from a new `calendar/date-helpers.ts` module (extracted from `google-calendar.ts:372-390`). Do NOT share `mapGoogleEvent`, `resolveCalendarNames`, or `fetchCalendarList` — gws response shape may differ."
- **Where to fix**: plan.md Step 1 + pre-mortem R7 verification.
