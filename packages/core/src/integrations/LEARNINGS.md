## How This Works

Integrations follow a provider pattern: a factory function reads `AreteConfig` and returns a provider instance (or `null` if not configured/available). The calendar integration lives in `packages/core/src/integrations/calendar/` — `index.ts` exports `getCalendarProvider(config)`, which delegates to `ical-buddy.ts` for the macOS implementation. The Fathom integration is in `packages/core/src/integrations/fathom/`. Integration metadata (names, auth type, display info) is registered in `registry.ts`. The `IntegrationService` in `packages/core/src/services/integrations.ts` orchestrates pull operations. Tests for calendar live in `packages/core/test/` (pulled from the pre-monorepo structure; coverage for edge cases may have gaps per `2026-02-15_monorepo-intelligence-refactor-learnings.md`).

## Key References

- `packages/core/src/integrations/calendar/index.ts` — `getCalendarProvider(config)`, `'macos'` alias handling
- `packages/core/src/integrations/calendar/ical-buddy.ts` — `CalendarProvider` interface, `getIcalBuddyProvider()`, `icalBuddy` binary, calendar list parsing
- `packages/core/src/integrations/registry.ts` — `INTEGRATIONS` map (`fathom`, `apple-calendar`)
- `packages/core/src/services/integrations.ts` — `IntegrationService`, pull orchestration
- `packages/cli/src/commands/integration.ts` — `configureCalendar()`, writes `provider: 'macos'` to `arete.yaml`
- `packages/cli/src/commands/pull.ts` — `pullCalendar()`, calls `getCalendarProvider(config)`
- Memory entries: `2026-02-11_calendar-provider-macos-alias.md`, `2026-02-11_calendar-integration-ux-and-learnings.md`

## Gotchas

- **`arete integration configure calendar` writes `provider: 'macos'` but the binary is called `icalBuddy`.** The Homebrew formula is `ical-buddy`; the installed binary is `icalBuddy` (camelCase). The factory (`calendar/index.ts` L14-18) must accept both `'ical-buddy'` and `'macos'` as provider values. In 2026-02-11, `getCalendarProvider` was only checking `provider === 'ical-buddy'`, so config written by `configure` was silently rejected by `pull`. Fix and regression test are in `test/core/calendar.test.ts` ("unit test that `provider: 'macos'` is accepted") and `test/commands/pull-calendar.test.ts` ("regression: provider 'macos' written by configure is accepted"). See `2026-02-11_calendar-provider-macos-alias.md`.

- **Use `icalBuddy` (camelCase) for `which` checks and `execFile` calls; keep `ical-buddy` only in user-facing install messages.** In 2026-02-11 the code was checking/invoking `ical-buddy` (wrong) — the binary on disk is `icalBuddy`. Using the wrong name causes "command not found" even when icalBuddy is installed. See `ical-buddy.ts` and `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **`icalBuddy calendars` output is multi-line blocks, not one calendar per line.** Lines starting with `• ` are calendar names; following lines (`type: CalDAV`, `UID: ...`, etc.) are metadata. A naive `output.split('\n')` will include metadata lines as calendar choices. Parse by filtering for lines starting with `• `. Before the 2026-02-11 fix, raw icalBuddy output was displayed directly as options, producing broken UX. See `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **Config producer–consumer alignment: trace every reader when a `configure` command writes a config value.** When `configureCalendar()` in `integration.ts` writes a value like `provider: 'macos'`, every reader of that config field (`getCalendarProvider`, status commands, etc.) must accept the exact key/value written. The 2026-02-11 incident was caused by the producer and consumer using different string values for the same concept. Pattern from `2026-02-11_calendar-provider-macos-alias.md`: "When one command writes a config value, every consumer of that config must accept that value."

- **`getCalendarProvider()` returns `null` (not throws) when the provider is unavailable.** Callers in `pull.ts` check for `null` before using the provider. Adding a new provider that might not be installed must follow this null-return pattern — never throw from the factory when the dependency is simply absent.

## Invariants

- All integration providers must implement the provider interface (e.g. `CalendarProvider` with `name`, `isAvailable()`, and event-fetch methods). `getCalendarProvider()` must call `isAvailable()` and return `null` if false.
- The `INTEGRATIONS` registry in `registry.ts` is the canonical list of supported integrations for `arete integration list`. Keep it in sync with actual implemented providers.
- `IntegrationService` in `services/integrations.ts` does not know about specific integration implementations — it delegates to provider factories.

## Testing Gaps

- Calendar provider edge cases (all-day events, events with no attendees, multi-line notes fields in icalBuddy output) had reduced test coverage after the monorepo refactor cleanup (`2026-02-15` risk 5 note: "calendar provider edge cases" specifically called out).
- No test covers the `icalBuddy calendars` multi-line parsing against real icalBuddy output fixtures.

## Patterns That Work

- **Regression test at the config boundary**: Add a test that uses the exact value written by `configure` and asserts the `pull` command does NOT error. This catches the producer-consumer mismatch before it reaches production. Pattern from `2026-02-11_calendar-provider-macos-alias.md`.
- **Comment at the consumer**: A one-line comment at the factory ("configure writes 'macos'; accept both") helps future refactors avoid dropping the alias. Already in `calendar/index.ts`.

## Pre-Edit Checklist

- [ ] If adding a new calendar config field: check every consumer in `pull.ts`, `integration.ts`, `status.ts` for alignment
- [ ] If changing the `provider` string written by `configure`: update `getCalendarProvider()` to accept the new value, and update the regression test in `test/commands/pull-calendar.test.ts`
- [ ] Verify `which icalBuddy` (camelCase) is used, not `which ical-buddy`, in any availability check
- [ ] Run `npm test` to verify regression test "provider 'macos' is accepted" still passes
- [ ] If adding a new integration: register it in `registry.ts`, implement provider interface, add factory to `calendar/index.ts` pattern
