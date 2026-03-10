# BUG: /plan close save may wipe plan content

**Reported**: 2026-03-10
**Priority**: High
**Status**: Needs investigation

## Description

User ran `/plan close`, was prompted "You have unsaved plan changes. Save before closing?", selected "yes", and the plan.md content was wiped/replaced with minimal content.

User had the file open in Cursor and was able to recover via undo.

## Expected Behavior

When user confirms save during `/plan close`, the existing plan content should be preserved (or the save should be skipped if there are no real changes).

## Investigation Notes

The `handlePlanClose` flow:
1. Calls `hasUnsavedPlanChanges(state)` - compares disk content to `state.planText`
2. If different, prompts user
3. If user confirms, calls `handlePlanSave(undefined, ctx, pi, state)`
4. `handlePlanSave` writes `state.planText` to disk

The bug suggests `state.planText` was corrupted/empty at save time.

### Potential causes:
1. **`loadedFromDisk` state lost**: If `loadedFromDisk` becomes false, `agent_end` will overwrite `state.planText` with the last assistant message
2. **Session state not restored correctly**: `loadedFromDisk` might not be persisted in all `appendEntry` calls (only `persistState()` includes it)
3. **Race condition**: Async operation modifying state between check and save

### Files to investigate:
- `.pi/extensions/plan-mode/commands.ts` - `handlePlanClose`, `handlePlanSave`, `hasUnsavedPlanChanges`
- `.pi/extensions/plan-mode/index.ts` - `agent_end` hook, `session_start` restore logic

## Proposed Fix

1. Add defensive logging to track `state.planText` and `loadedFromDisk` at key points
2. Ensure all `appendEntry` calls include `loadedFromDisk` state
3. Consider adding a confirmation showing the content diff before saving loaded plans
4. Add a backup mechanism before overwriting (e.g., `.plan.md.bak`)

## Workaround

Keep the plan file open in your editor while using plan mode. If wipe occurs, use editor undo or `git checkout` to recover.
