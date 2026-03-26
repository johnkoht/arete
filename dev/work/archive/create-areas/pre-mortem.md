---
plan: create-areas
status: active
created: 2026-03-25
---

# Pre-Mortem: Workspace Areas Refactor

## Overview

This pre-mortem analyzes risks for the Workspace Areas Refactor plan — 12 tasks across 3 phases introducing **Areas** as persistent work domains with recurring meeting mapping, context accumulation, and skill integration.

---

## 1. Architecture Risk

### Risk: Context Service Category Confusion

**Likelihood**: Medium  
**Impact**: High

**Problem**: The plan adds two new categories to context service — `'area-context'` for `context/{area-slug}/*.md` and `'area'` for `areas/*.md`. The existing `PRIMITIVE_FILE_MAP` and category logic is already complex. Adding nested scanning (`context/**/*.md`) alongside existing `context/*.md` scanning could create:
- Duplicate file inclusion (same file added twice with different categories)
- Confusion about which category applies when paths overlap
- Broken relevance scoring if the same file gets two different scores

**Mitigation**:
- Before modifying `context.ts`, add tests that verify current behavior for `context/` directory files
- Design clear path-matching rules: `context/*.md` = company-level context, `context/{subdirectory}/*.md` = area-context
- Use explicit path exclusion: skip nested directories when scanning root `context/`
- Add a test that creates both `context/business-overview.md` AND `context/glance/overview.md` and verifies no duplication

**Verification**: Review context.ts changes for explicit path-matching logic; check test coverage for overlap scenarios.

---

### Risk: Area Parser Coupling to Context Service

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: Task 3 creates a new `AreaParser` service. Task 2 modifies `ContextService` for area scanning. If these aren't designed together, the area parser might need to duplicate context scanning logic, or the context service might need to know about area semantics.

**Mitigation**:
- Design `AreaParser` to be a consumer of context service, not a parallel scanner
- `AreaParser.getAreaForMeeting()` should read area files directly (simple YAML parsing) — it doesn't need full context assembly
- Keep `ContextService` focused on assembly; `AreaParser` focused on lookup
- Document the boundary: ContextService knows *where* area files are; AreaParser knows *what* area files mean

**Verification**: Check that AreaParser imports from models/types, not from ContextService internals.

---

## 2. Integration Risk

### Risk: Skill Updates Break Without Area Parser

**Likelihood**: High  
**Impact**: High

**Problem**: Phase 2 tasks (7-11) all depend on Task 3's `AreaParser.getAreaForMeeting()`. If the area parser API changes during skill integration, or if skills make incorrect assumptions about the return type, every skill update becomes a regression risk.

**Mitigation**:
- Complete and test Task 3 fully before starting ANY Phase 2 task
- Define `AreaMatch` interface in `packages/core/src/models/` so skills import from stable types, not implementation
- Write integration tests for area parser BEFORE skill work: "Given area file with recurring_meetings, getAreaForMeeting returns correct AreaMatch"
- In each skill update prompt, include: "Read packages/core/src/models/area.ts for AreaMatch type"

**Verification**: Before Phase 2, confirm `npm test` includes area parser tests; confirm AreaMatch is exported from models/index.ts.

---

### Risk: PATTERNS.md get_area_context Pattern Inconsistency

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: Task 3 adds `get_area_context` pattern to PATTERNS.md. Tasks 7-10 update skills to "use" this pattern. If the pattern is underspecified or inconsistent with what AreaParser actually provides, each skill will interpret it differently.

**Mitigation**:
- Write the full `get_area_context` pattern (inputs, outputs, steps) in Task 3, not "TBD"
- Pattern should specify: exact CLI commands (if any), AreaParser methods to call, output structure
- Review existing patterns in PATTERNS.md (e.g., `get_meeting_context`) for format consistency
- In skill update prompts, require: "Follow get_area_context pattern exactly as documented in PATTERNS.md"

**Verification**: After Task 3, verify PATTERNS.md has a complete, numbered step list for get_area_context.

---

### Risk: Commitment Area Tagging Breaks Deduplication

**Likelihood**: Medium  
**Impact**: High

**Problem**: Task 8c adds area tagging to commitments and scopes deduplication "to area first". The current `CommitmentsService.sync()` uses a global hash for deduplication (`sha256(text + personSlug + direction)`). Adding area could mean:
- Same commitment in different areas treated as duplicates (wrong)
- Same commitment in same area not deduplicated if hash changes (wrong)
- Migration breaks existing commitments that have no area

**Mitigation**:
- Area is OPTIONAL on commitments (plan already specifies this) — don't include it in dedup hash
- Dedup logic stays global; area is metadata only
- "Scope deduplication to area" means: when checking for existing commitments, filter by area first to reduce search space, but still use global hash for actual dedup
- Add test: commitment without area still deduplicates correctly against commitment with area

**Verification**: Review CommitmentsService.sync() changes; confirm hash computation is unchanged.

---

## 3. Data Risk

### Risk: Existing Context Files Become Orphaned

**Likelihood**: Low  
**Impact**: Medium

**Problem**: Users may have existing files in `context/` that follow ad-hoc naming (e.g., `context/acme-project.md`). After areas, these might not be found by context service if scanning changes.

**Mitigation**:
- Existing `context/*.md` files continue to work exactly as before (company-level context)
- Only add NEW scanning for `context/{subdirectory}/*.md` — don't change existing root-level scanning
- Document in GUIDE.md: "Existing context files in context/ are unchanged. Area-specific context goes in context/{area-slug}/"
- Add test: existing context/business-overview.md still found after changes

**Verification**: Run existing context.test.ts after Task 2; all existing tests must pass.

---

### Risk: Area YAML Frontmatter Parsing Failures

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: Area files use YAML frontmatter with `recurring_meetings` array. YAML arrays in frontmatter are notoriously finicky (indentation, dash placement). If users create malformed areas, they get silent failures.

**Mitigation**:
- Use existing `yaml` package already in codebase (not custom parsing)
- Add graceful fallback: if frontmatter parsing fails, log warning but return empty recurring_meetings
- Add validation in `arete create area`: reject if template rendering produces invalid YAML
- Include edge case tests: empty recurring_meetings, single item, multi-item with attendees array

**Verification**: AreaParser tests include malformed YAML cases; verify graceful degradation.

---

### Risk: Decision Extraction Writes to Wrong Area

**Likelihood**: Medium  
**Impact**: High

**Problem**: Task 8b writes extracted decisions to area's `## Key Decisions` section. If area inference is wrong (confidence < 0.7 and user doesn't confirm), decisions pollute the wrong area file.

**Mitigation**:
- Plan already specifies: "infer from attendees + content, confirm if confidence < 0.7"
- ENFORCE this in skill: if confidence < 0.7 AND user doesn't confirm, write to memory files instead (existing behavior), not to area
- Add audit trail: decisions written to area files should note source meeting
- Add rollback path: document how to move a decision from area to memory or vice versa

**Verification**: Task 8b prompt includes explicit confidence threshold handling; review completed implementation.

---

## 4. Performance Risk

### Risk: Context Service Nested Directory Scanning

**Likelihood**: Low  
**Impact**: Low

**Problem**: Adding `context/**/*.md` recursive scanning could slow context assembly for large workspaces with many area subdirectories.

**Mitigation**:
- Areas are user-created, not auto-generated — typical workspace has 3-10 areas
- Each area has 1-5 context files — total additional scanning is minimal
- Add depth limit if needed: only scan `context/{area}/` not deeper nesting
- Measure: add timing logging in dev mode for context assembly

**Verification**: After Task 2, run `arete brief --for "test"` and confirm response time is acceptable.

---

### Risk: Area Lookup on Every Meeting Prep

**Likelihood**: Low  
**Impact**: Low

**Problem**: Meeting-prep skill (Task 7) will call `getAreaForMeeting()` for every prep request. If area files are large or numerous, this could slow prep.

**Mitigation**:
- Area lookup is simple: read all area files, check recurring_meetings arrays
- Cache area metadata on first call (areas change rarely during a session)
- Limit to `areas/` directory only — don't scan arbitrarily

**Verification**: Measure meeting-prep time before and after Task 7 changes.

---

## 5. Scope Risk

### Risk: Area-Goal Linking Scope Creep

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: Task 5 adds `area:` field to goals. The plan says "Add `arete goals list --area <slug>` filter (optional, can defer)". This "optional" could become "required" once developers see the implementation. Similarly, quarterly review features might creep in.

**Mitigation**:
- Mark CLI filter as "Phase 3 or future" — not Phase 1
- Accept criterion is just: "Goals with area: field are parsed correctly" — not "filtered in CLI"
- If developer asks about CLI filter, respond: "Out of scope for this PRD. Add to backlog."
- Document quarterly review as explicitly out of scope (already in plan)

**Verification**: Review Task 5 completion for scope adherence; reject CLI filter if implemented.

---

### Risk: Process-Meetings Subtask Expansion

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: Task 8 is split into 3 subtasks (8a, 8b, 8c). Each subtask touches different parts of a complex skill. Risk of each subtask expanding to "fix related issues" or "improve existing extraction".

**Mitigation**:
- Each subtask has focused acceptance criteria — enforce them strictly
- If existing bugs are discovered, log them in scratchpad, don't fix in this PRD
- 8a: "Processed meeting has area association" — that's it
- 8b: "New decision appears in correct area file" — that's it
- 8c: "Commitments from meeting are tagged with area" — that's it

**Verification**: Review each 8x subtask completion against its specific AC only.

---

## 6. Dependencies Risk

### Risk: BASE_WORKSPACE_DIRS Update Missing in Install

**Likelihood**: Medium  
**Impact**: High

**Problem**: Task 1 adds `areas/` to `BASE_WORKSPACE_DIRS`. If this isn't propagated correctly:
- New workspaces get `areas/` directory
- Existing workspaces don't (no migration)
- `arete update` should backfill missing directories — verify it does

**Mitigation**:
- After Task 1, test both paths:
  1. `arete install` creates workspace with `areas/` directory
  2. `arete update` in existing workspace creates `areas/` directory
- Check that `workspace-structure.ts` exports are used correctly by `install` and `update` commands

**Verification**: After Task 1, run both install and update paths manually.

---

### Risk: Template System Assumptions

**Likelihood**: Low  
**Impact**: Medium

**Problem**: Task 1 creates `packages/runtime/templates/area.md`. The existing template system (PATTERNS.md Template Resolution) expects templates in `templates/outputs/{skill-id}/` or similar paths. Area template may not follow this convention.

**Mitigation**:
- Area template is used by `arete create area` command (Task 4), not by skill template resolution
- Don't add area.md to PATTERNS.md template table — it's not a skill output template
- Keep it simple: `arete create area` reads template directly from runtime/templates/

**Verification**: Task 4 implementation reads template from runtime, not via template resolution system.

---

### Risk: Onboarding Tool State Assumptions

**Likelihood**: Medium  
**Impact**: Low

**Problem**: Task 12 adds area setup to onboarding tool. The onboarding tool is stateful and lifecycle-bound. If the tool assumes certain workspace structure that doesn't exist yet (areas/ not created), or if `arete create area` fails, onboarding breaks.

**Mitigation**:
- Onboarding runs AFTER workspace install — areas/ directory should exist
- If `arete create area` fails, catch error and continue onboarding with warning
- Make area setup optional: "Skip area setup? [y/N]"
- Test onboarding with fresh workspace after Phase 1 complete

**Verification**: Task 12 includes error handling for create area failures.

---

## 7. Testing Risk

### Risk: Skill Updates Without Behavior Tests

**Likelihood**: High  
**Impact**: High

**Problem**: Phase 2 updates 4 skills (meeting-prep, process-meetings, weekly, daily). These are markdown-in/markdown-out workflows without existing unit tests. Changes could break existing behavior without detection.

**Mitigation**:
- Before each skill update, document current behavior with manual test cases
- After each skill update, run the skill manually with:
  1. Meeting that HAS a matching area (should inject area context)
  2. Meeting that has NO matching area (should fall back gracefully)
- Add integration tests where possible: meeting-prep with area vs without area

**Verification**: Each Task 7-10 completion report includes manual test results for both scenarios.

---

### Risk: Context Service Regression

**Likelihood**: High  
**Impact**: Critical

**Problem**: Task 2 modifies the core context service. Existing tests (`context.test.ts`) must all pass. Any regression breaks `arete brief`, skill context injection, and intelligence layer.

**Mitigation**:
- Run `npm run typecheck && npm test` before and after Task 2
- Read existing context.test.ts BEFORE implementation
- Add new tests for area-context category BEFORE modifying production code (TDD)
- If any existing test fails, STOP and investigate before continuing

**Verification**: Task 2 must show before/after test output; all existing tests pass.

---

### Risk: Area Parser Mocking Complexity

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: New AreaParser service will need mocking in skill tests. If the service interface isn't designed for testability, skill tests become complex.

**Mitigation**:
- Design AreaParser with constructor injection (StorageAdapter like other services)
- Export a test helper: `createMockAreaParser({ areas: [...] })`
- In Task 3, include test file that demonstrates how to mock the parser
- Follow pattern from existing services (CommitmentsService, ContextService)

**Verification**: Task 3 test file includes at least one test using mock storage.

---

## 8. Documentation Risk

### Risk: GUIDE.md Out of Sync

**Likelihood**: High  
**Impact**: Medium

**Problem**: Task 11 updates GUIDE.md with area documentation. If this is done as an afterthought or by a different subagent than core implementation, documentation may not match reality.

**Mitigation**:
- Task 11 should be done by same context as Phase 1 tasks (not fresh subagent)
- Or: Task 11 prompt explicitly includes "Read the completed area.md template, AreaParser implementation, and process-meetings skill to document actual behavior"
- Include examples that match actual CLI output

**Verification**: After Task 11, manually verify: `arete create area test-area` matches documented behavior.

---

### Risk: PATTERNS.md Incomplete After Task 3

**Likelihood**: Medium  
**Impact**: Medium

**Problem**: Task 3 adds `get_area_context` to PATTERNS.md. If this pattern is incomplete or uses placeholder text, Phase 2 skills will implement inconsistently.

**Mitigation**:
- Task 3 AC should be: "PATTERNS.md has complete get_area_context pattern with numbered steps, inputs/outputs, and example"
- Compare to existing patterns (get_meeting_context is ~50 lines) for completeness
- Do NOT proceed to Phase 2 until pattern is reviewed and complete

**Verification**: After Task 3, read PATTERNS.md get_area_context section; verify it's production-ready.

---

### Risk: Missing Skill Update Documentation

**Likelihood**: Medium  
**Impact**: Low

**Problem**: Each skill (meeting-prep, process-meetings, etc.) has its own SKILL.md. Phase 2 tasks update skill behavior but may forget to update SKILL.md.

**Mitigation**:
- Each Task 7-10 prompt should include: "Update the skill's SKILL.md to document new area integration"
- Add to AC: "SKILL.md documents area context injection"
- Review completed skill SKILL.md against implementation

**Verification**: After each Phase 2 task, confirm SKILL.md mentions area integration.

---

## Summary: Top 5 Risks to Watch

| Rank | Risk | Likelihood | Impact | Key Mitigation |
|------|------|------------|--------|----------------|
| 1 | Context Service Regression | High | Critical | TDD: add tests before modifying; run full suite |
| 2 | Skill Updates Break Without Area Parser | High | High | Complete Task 3 fully before Phase 2 |
| 3 | Skill Updates Without Behavior Tests | High | High | Manual test both scenarios (with/without area) |
| 4 | Commitment Area Tagging Breaks Deduplication | Medium | High | Don't change hash; area is metadata only |
| 5 | PATTERNS.md Incomplete After Task 3 | Medium | Medium | Require complete pattern before Phase 2 |

---

## Execution Recommendations

1. **Phase 1 Gate**: After Task 3, pause and verify:
   - All existing context.test.ts tests pass
   - AreaParser has tests for happy path and edge cases
   - PATTERNS.md get_area_context is complete
   - `arete create area` works end-to-end

2. **Phase 2 Strategy**: Execute skill updates one at a time with manual testing:
   - Task 7 → test meeting-prep → ✓
   - Task 8a → test area mapping → ✓
   - Task 8b → test decision extraction → ✓
   - etc.

3. **Parallel Safety**: Tasks within Phase 1 have dependencies (1 → 2 → 3 → 4 → 5 → 6). Don't parallelize.

4. **Rollback Preparation**: If context service changes cause regressions, be prepared to:
   - Revert to pre-modification state
   - Re-approach with smaller increments
   - Consider feature flag for area scanning

---

## References

- Plan: `dev/work/plans/create-areas/plan.md`
- Context Service: `packages/core/src/services/context.ts`
- Commitments Service: `packages/core/src/services/commitments.ts`
- PATTERNS.md: `packages/runtime/skills/PATTERNS.md`
- Workspace Structure: `packages/core/src/workspace-structure.ts`
