# Review: Week Plan Meeting Section

**Type**: Plan (pre-execution)
**Audience**: Builder (internal tooling — enhances week-plan skill in `runtime/`)
**Pre-mortem**: ✅ Completed (8 risks identified)

---

## Concerns

### 1. **Scope**: Steps 1-2 Could Be Combined

The plan separates "test infrastructure" (Step 1) and "refactor for testability" (Step 2). In practice, you can't write meaningful tests for `pullCalendar` without first extracting it into a testable function. The dependency injection pattern *is* the test infrastructure.

**Suggestion**: Combine into one step: "Extract pullCalendar helper with test suite." Write the helper and its tests together. This is how TDD actually works.

**Impact**: Reduces step count from 5 to 4; clearer execution flow.

---

### 2. **Patterns**: Agenda Lookup Not Using StorageAdapter

Step 3 mentions checking `now/agendas/` for matching files. The pre-mortem (R4) suggests `fs.existsSync()` or caching, but the CLI profile explicitly states:

> "Services never import `fs` directly — all file I/O through `StorageAdapter`."

While this is CLI code (not core services), it would be cleaner to use `services.storage.exists()` for consistency.

**Suggestion**: AC should specify: "Use `services.storage.list()` to get agenda files, not direct `fs` calls."

---

### 3. **Dependencies**: Step 3 JSON Format Needed Before Step 4

The pre-mortem (R2) identifies CLI→Skill integration risk but the plan doesn't specify how to communicate the JSON format between steps. Step 4 (skill update) needs to know exact field names.

**Suggestion**: Add explicit AC to Step 3: "Document JSON output structure in code comment or PR description for Step 4 reference."

---

### 4. **Completeness**: Missing WorkspacePaths for Agenda Lookup

Step 3 checks `now/agendas/` but the calendar pull happens before workspace paths are resolved. The `pullCalendar` function receives `services` and `workspaceRoot` but needs `WorkspacePaths` to know where `now/agendas/` lives.

**Suggestion**: Add to Step 3 AC: "Resolve `WorkspacePaths` and use `paths.now` for agenda directory lookup."

---

### 5. **Backward Compatibility**: JSON Output Change

Adding `importance`, `organizer`, and `notes` fields to JSON output is backward-compatible (additive), but consumers parsing the JSON strictly might log warnings for unknown fields.

**Suggestion**: Mention in Out of Scope: "No versioning of JSON output format (fields are additive)."

---

### 6. **Catalog**: Missing Capability Update

`dev/catalog/capabilities.json` has entries for `google-calendar-provider` and planning skills. After this work, the calendar pull capability should note the new `importance` field.

**Suggestion**: Add AC to Step 5 or create Step 6: "Update `dev/catalog/capabilities.json` to document new JSON fields."

---

## Strengths

✅ **Test-first approach**: Establishing test coverage before modifying `pullCalendar` is exactly right. This is the safety net.

✅ **Leverages existing code**: `inferMeetingImportance()` already exists with 10 tests. No new inference logic needed.

✅ **Clear user value**: The "confirmation without output is wasted interaction" insight is spot-on. The user confirms meetings; they should appear in output.

✅ **Pre-mortem is thorough**: 8 risks identified with concrete mitigations. High-impact risks (R1, R2, R8) are properly prioritized.

✅ **Example output included**: Showing exactly what the user sees helps validate the design.

✅ **Provider-agnostic**: Explicit handling for ical-buddy (no organizer) prevents a common failure mode.

---

## Devil's Advocate

### If this fails, it will be because...

**The skill instructions are too complex for agents to follow reliably.**

Step 4 asks the agent to:
1. Parse importance from calendar JSON
2. Group meetings by importance level
3. Show "why" explanations for each
4. Handle add/remove/skip interactions
5. Store confirmed list for later output
6. Handle empty state gracefully

That's 6 behaviors encoded in prose instructions. Agents may miss steps, especially the "store for later" requirement (pre-mortem R5). The skill has no enforcement mechanism — it's all trust.

**Mitigation already in plan?** Partially. R5 addresses this but the mitigation is vague ("rely on conversation context"). Consider adding a scratchpad pattern or explicit "## Confirmed Key Meetings" working section.

---

### The worst outcome would be...

**Users confirm meetings, see them in the step output, but they never appear in week.md.**

This is literally the current bug, but now with extra steps. If Step 4's "store confirmed list" instruction fails, users go through the confirmation interaction (improved UX) but still get no output (same broken behavior). 

The worst version: users *think* it's working because the confirmation step *looks* better, but the actual file output is unchanged.

**Mitigation**: Step 5's AC "Template includes `## Key Meetings` section" ensures the section exists. But the skill must populate it. Consider manual QA after Step 5: run week-plan end-to-end and verify Key Meetings appears in the output file.

---

## Recommendations

| # | Recommendation | Priority |
|---|----------------|----------|
| 1 | Combine Steps 1-2 (extract helper + tests together) | Medium |
| 2 | Specify StorageAdapter for agenda lookup | Low |
| 3 | Add JSON format documentation AC to Step 3 | Medium |
| 4 | Add WorkspacePaths resolution to Step 3 | Medium |
| 5 | Update dev/catalog/capabilities.json | Low |
| 6 | Add manual QA step after Step 5 | Medium |

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Summary**: Plan is solid. The test-first approach, pre-mortem analysis, and clear user value make this ready to build. Consider combining Steps 1-2 for cleaner execution, and add explicit JSON format documentation between Steps 3-4. The devil's advocate risks are real but manageable with the existing mitigations + manual QA.

**Riskiest part**: Step 4 skill instructions. The "store confirmed list for Step 4 output" behavior depends entirely on agent compliance with prose instructions. Consider a concrete working pattern (scratchpad, explicit section) to make this more deterministic.