# Pre-Mortem: Meeting Processing CLI Parity

## Summary

**Plan**: Move backend's post-processing logic to core, enhance CLI extract, add CLI approve command
**Size**: Medium (5 steps)
**Risk Assessment**: Medium — refactoring existing code with 30+ tests, cross-package changes

---

## Risk 1: Backend Behavior Regression

**Problem**: When extracting logic from backend's `agent.ts` to core, subtle differences in implementation could cause the 30 existing tests to fail or, worse, pass while producing different behavior.

**Mitigation**: 
1. Before Step 1: Document exact behavior by reading all 30 agent.test.ts tests
2. Extract logic by moving code verbatim first, then refactor
3. After Step 2: Run full test suite — all 30 tests must pass unchanged
4. Create comparison test: same input → same output for backend vs CLI

**Verification**: `npm test --workspace=packages/apps/backend` shows 30/30 passing after refactor.

---

## Risk 2: Type Incompatibility Between Packages

**Problem**: Core, CLI, and backend may have different type definitions for the same concepts (e.g., `StagedItem`, `ItemSource`, confidence maps). Mismatched types cause compilation errors or runtime issues.

**Mitigation**:
1. Review existing shared types in `@arete/core`'s exports
2. Use types from core in both CLI and backend — don't duplicate
3. If new types needed, add to core first, import elsewhere
4. Run `npm run typecheck` after each step

**Verification**: `npm run typecheck` passes across all packages after each step.

---

## Risk 3: Frontmatter Parsing Inconsistency

**Problem**: Backend uses gray-matter for frontmatter. CLI's extract command currently doesn't write frontmatter. Different gray-matter usage patterns or YAML serialization could produce files that UI can't read.

**Mitigation**:
1. Review backend's gray-matter usage in `agent.ts` (the `matter()` and `matter.stringify()` calls)
2. CLI must use identical gray-matter patterns
3. Test: file written by CLI can be read by UI's backend route
4. Use same YAML serialization options (default gray-matter settings)

**Verification**: Manual test — process meeting via CLI, open in UI, verify all metadata visible.

---

## Risk 4: commitApprovedItems Path Resolution

**Problem**: `commitApprovedItems()` expects specific paths (meeting file, memory dir). When called from CLI vs backend, the path resolution might differ (relative vs absolute, workspace root detection).

**Mitigation**:
1. Review `commitApprovedItems()` signature and path expectations
2. CLI must resolve paths the same way backend does
3. Use `services.workspace.findRoot()` and `getPaths()` consistently
4. Test with actual workspace, not mocked paths

**Verification**: After CLI approve, check `.arete/memory/items/decisions.md` has the new entries.

---

## Risk 5: User Notes Dedup Scope

**Problem**: Backend's dedup compares extracted items against "user notes" (meeting body minus transcript/staged sections). The extraction function `extractUserNotes()` is currently inline in backend. Moving to core requires same exclusion logic.

**Mitigation**:
1. Extract `extractUserNotes()` to core alongside processing function
2. Unit test: verify same content is excluded (## Transcript, ## Staged *)
3. Use Jaccard threshold from config, not hardcoded

**Verification**: Unit test showing `extractUserNotes()` produces identical output to current backend.

---

## Risk 6: Confidence Threshold Configuration

**Problem**: Backend reads confidence thresholds from `config.intelligence.extraction`. If CLI doesn't load the same config, thresholds could differ, causing different auto-approval behavior.

**Mitigation**:
1. CLI already uses `loadConfig()` — verify it includes extraction config
2. Pass thresholds to `processMeetingExtraction()` as parameters
3. Default values in core match backend defaults

**Verification**: Change threshold in `arete.yaml`, verify both CLI and UI use the new value.

---

## Risk 7: CLI Extract Already Has Frontmatter

**Problem**: If a meeting file already has frontmatter (from previous processing), CLI's extract needs to merge new metadata without losing existing fields (title, date, attendees, etc.).

**Mitigation**:
1. Read existing frontmatter before writing
2. Merge new `staged_item_*` fields with existing frontmatter
3. Preserve all non-staged fields (clone frontmatter object before mutating)
4. Test: extract on already-processed file preserves original metadata

**Verification**: Unit test — extract on file with existing frontmatter preserves title, date, attendees.

---

## Total Risks: 7
**Categories Covered**: Context Gaps (1, 5), Test Patterns (1, 2), Integration (3, 4), Code Quality (2, 7), Dependencies (4, 6)

---

## Execution Checklist

Before each step, check which mitigations apply:

| Step | Applicable Mitigations |
|------|----------------------|
| Step 1: Create core function | Risk 1, Risk 2, Risk 5, Risk 6 |
| Step 2: Refactor backend | Risk 1, Risk 2 |
| Step 3: Enhance CLI extract | Risk 2, Risk 3, Risk 6, Risk 7 |
| Step 4: Add CLI approve | Risk 4 |
| Step 5: Add --clear-approved | Risk 7 |

---

**Ready to proceed with these mitigations?**
