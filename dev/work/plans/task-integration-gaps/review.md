# Plan Review: Task Integration Gaps

## Checklist

- [x] Gap 1 correctly identified as already solved — verified in backend/services/workspace.ts approveMeeting()
- [x] Gap 2 approach aligns with builder's confirmed decision (@due as canonical source)
- [x] Gap 3 leverages existing SSE infrastructure (broadcastSseEvent, useProcessingEvents)
- [x] All steps have clear ACs
- [x] File list is complete for each step
- [x] Risks identified

## Missing ACs / Edge Cases

### Step 3 (Task file watcher)
- What if week.md or tasks.md don't exist yet? Watcher should handle gracefully (like meeting watcher handles missing dir).
- Should debounce per-file (week.md and tasks.md independently) to avoid missing events.
- The watcher watches specific files, not a directory — different from meeting watcher which watches a directory. May need `fs.watchFile` or watch the `now/` directory.

### Step 4 (Frontend SSE)
- The `useProcessingEvents` hook is already well-structured. Adding a new event listener is minimal risk.
- Query key for tasks needs to match what task-related hooks use. Need to verify actual query keys.

## Hidden Dependencies

- No cross-step dependencies. Steps 1-2 are skill docs. Steps 3-4 are code.
- Step 4 depends on Step 3 (frontend needs backend events), but they're in different packages so can be built independently.

## Verdict

Plan is sound and appropriately scoped. Gap 1 being already solved reduces scope significantly.
