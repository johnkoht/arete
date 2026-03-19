# Progress: Commitments-Goals Feature

## Task 3: Manual goal linking during extraction
**Status**: Complete  
**Commit**: c717400edbf33cb9b293208b79f434771a674869

### Summary
Implemented manual goal linking during `arete meeting approve`:
- Added `goalSlug` field to `PersonActionItem` type
- Updated `CommitmentsService.sync()` to copy goalSlug from action items to commitments
- Added goal selection UI in CLI approve command:
  - 0 goals: Shows "No active goals found, skipping goal linking"
  - 1-2 goals: Inline confirm prompt per goal
  - 3+ goals: Numbered select list with "None" option
- Updated backend approval workflow to accept and pass goalSlug through pipeline
- Added tests for goalSlug in CommitmentsService.sync()

### Files Changed
- `packages/core/src/services/person-signals.ts` — Added goalSlug to PersonActionItem
- `packages/core/src/services/commitments.ts` — Updated sync() to copy goalSlug
- `packages/core/src/index.ts` — Exported parseStagedItemOwner
- `packages/cli/src/commands/meeting.ts` — Goal selection UI + commitments sync
- `packages/apps/backend/src/routes/meetings.ts` — Accept goalSlug in approve API
- `packages/apps/backend/src/services/workspace.ts` — Pass goalSlug through approval
- `packages/core/test/services/commitments.test.ts` — Added goalSlug tests

### Quality Checks
- typecheck: ✓
- tests: ✓ (1881 passed)

### Reflection
The implementation was more complex than expected because the CLI and backend have different approval flows:
- CLI calls `commitApprovedItems` directly from core, then needed to sync commitments manually
- Backend uses `refreshPersonMemory` which re-extracts action items

The solution was to sync commitments directly in CLI after approving items, and to sync commitments before refreshPersonMemory in backend (so items with goalSlug are added first and deduped). This ensures goalSlug is preserved regardless of which path approves the meeting.
