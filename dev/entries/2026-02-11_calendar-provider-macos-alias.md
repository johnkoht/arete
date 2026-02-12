# Calendar: provider "macos" Alias and Config Producer–Consumer Alignment

**Date**: 2026-02-11

## What Happened

User ran `arete integration configure calendar`, which wrote `provider: 'macos'` to `arete.yaml`. Then `arete pull calendar --days 7` reported "Calendar not configured." The calendar factory in `src/core/calendar.ts` only accepted `provider === 'ical-buddy'`, so config written by one command was rejected by another.

## Fix

- **Factory** (`getCalendarProvider`): Accept both `ical-buddy` and `macos`; ical-buddy is the implementation for macOS Calendar, and configure intentionally writes the user-facing value `macos`.
- **Tests**:
  - `test/core/calendar.test.ts`: Unit test that `provider: 'macos'` is accepted (same outcome as ical-buddy).
  - `test/commands/pull-calendar.test.ts`: **Regression test** — with `arete.yaml` containing `provider: macos`, run `pullCalendar` without injecting a test provider; assert output does **not** contain "Calendar not configured". This fails if someone removes the `macos` alias.
- **Comments**: In calendar.test.ts and the factory, noted that configure writes `macos` and the factory must accept it.

## Learning: Config Producer–Consumer Alignment

**When one command writes a config value, every consumer of that config must accept that value.**

- **Producer**: `arete integration configure calendar` writes `provider: 'macos'` (and `calendars: [...]`).
- **Consumer**: `getCalendarProvider(config)` in `src/core/calendar.ts` was only checking for `'ical-buddy'`.

**Practice for future work:**

1. **Trace config flow**: For any "configure" or "setup" command that writes to arete.yaml (or other config), list all readers (factory, commands, status, etc.) and ensure they accept the exact keys/values written.
2. **Regression test at the boundary**: Add a test that exercises the path "config produced by configure → consumed by command" so that reverting the fix (e.g. dropping `macos`) fails the test. Here: pull-calendar test with `provider: macos` and no mock provider, asserting we never see "Calendar not configured".
3. **Comment at the consumer**: A one-line comment at the factory (e.g. "configure writes 'macos'; accept both") helps future refactors avoid dropping the alias.

## References

- `src/core/calendar.ts` — `getCalendarProvider` accepts `ical-buddy` and `macos`.
- `src/commands/integration.ts` — `configureCalendar` writes `provider: 'macos'`.
- `test/core/calendar.test.ts` — unit test for macos alias.
- `test/commands/pull-calendar.test.ts` — regression test "regression: provider \"macos\" (written by configure) is accepted".
