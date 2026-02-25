---
title: "Refactor: Extract formatSlotTime to shared formatter"
slug: refactor-format-slot-time
status: idea
size: tiny
---

# Refactor: Extract formatSlotTime to shared formatter

**Source**: PRD calendar-events, Task 2 — reviewer code review

## What

The `formatSlotTime` helper function is duplicated between:
- `packages/cli/src/commands/availability.ts` (lines 24-32)
- `packages/cli/src/commands/calendar.ts` (lines 22-30)

Both implementations are identical — format a Date with weekday, month, day, time, and timezone abbreviation.

## Why

DRY / maintainability — single place to change datetime display format.

## Suggested Direction

1. Add `formatSlotTime(date: Date): string` to `packages/cli/src/formatters.ts`
2. Update availability.ts and calendar.ts to import from formatters.ts
3. Remove local implementations
4. Add test for the formatter

## Acceptance Criteria

- [ ] formatSlotTime exported from formatters.ts
- [ ] availability.ts imports from formatters.ts
- [ ] calendar.ts imports from formatters.ts
- [ ] No duplicate implementations remain
- [ ] npm run typecheck passes
- [ ] npm test passes
