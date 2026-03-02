# Pre-Mortem: People Intelligence

**Date**: 2026-03-01  
**Plan Size**: Large (10 tasks across 4 phases)  
**Risk Level**: Medium-High — new extraction architecture + LLM integration into a service that has never used LLM calls

---

### Risk 1: LLM Integration into EntityService Breaks Service Layer Invariants

**Problem**: `EntityService` currently does zero LLM calls — it uses regex-based `collectSignalsForPerson()` for signal extraction and `StorageAdapter` for all I/O. Stance extraction requires LLM calls (per Engineering Lead review: stances are semantic, regex won't work). But the LEARNINGS.md states: "Services must NOT call `fs` directly" and all services use DI via constructor. There's no established pattern for injecting an LLM caller into `EntityService`. The `LLMCallFn` type exists in `conversations/extract.ts` but has never been wired through `createServices()` or any service constructor. Getting this wrong breaks testability (can't mock LLM in tests) or creates a precedent that violates the DI pattern.

**Mitigation**: 
- Add optional `LLMCallFn` parameter to `EntityService` constructor (same pattern as optional `SearchProvider` — added 2026-02-21, documented in LEARNINGS.md)
- Wire it in `factory.ts` `createServices()` — but **do not provide a default implementation**. CLI commands that need LLM extraction must pass one in.
- Alternative: Keep LLM extraction in a separate module (`person-signals.ts`) that accepts `LLMCallFn` as a function parameter, not injected into EntityService. This is cleaner — `EntityService` stays LLM-free, and `refreshPersonMemory()` calls the extraction module with a caller-provided LLM function.

**Verification**: After implementation, `EntityService` constructor still works with zero or one optional params. All existing tests pass without providing an LLM function. New stance tests use a mock `LLMCallFn`.

---

### Risk 2: entity.ts God Object — 1,746 Lines Before Adding 4 New Feature Areas

**Problem**: `entity.ts` is already 1,746 lines containing `EntityService` class + 15 module-level helpers + signal collection/aggregation/rendering. The plan adds stances, action items, relationship health, and rendering for each. Without decomposition, this file easily hits 2,500+ lines and becomes unmaintainable. New code will be harder to test in isolation, and merge conflicts become likely if multiple tasks touch it.

**Mitigation**: 
- **Task 0 is mandatory**: Extract existing person-memory functions (`collectSignalsForPerson`, `aggregateSignals`, `renderPersonMemorySection`, `upsertPersonMemorySection`, signal types) into `packages/core/src/services/person-memory.ts` BEFORE any new features.
- New extraction code goes in `packages/core/src/services/person-signals.ts` (stances, action items).
- New health computation goes in `packages/core/src/services/person-health.ts`.
- `EntityService.refreshPersonMemory()` becomes a thin orchestrator that calls into these modules.

**Verification**: After Task 0, `entity.ts` should be ~1,200 lines. `person-memory.ts` should have its own unit tests. All existing tests pass. `npm run typecheck` clean.

---

### Risk 3: Workspace Owner Identity — No Design, Blocks Action Item Direction

**Problem**: Bidirectional action items ("I owe them" / "they owe me") require knowing who "I" is. The system has no concept of workspace owner. `context/profile.md` exists as a path in the codebase (line 1532 of entity.ts reads it for intelligence) but there's no structured `owner` field. Without this, direction classification is impossible or unreliable.

**Mitigation**: 
- Design decision BEFORE Phase B: Read `context/profile.md` for the user's name/email. Use this as the "I" identity.
- Fallback: If no profile.md exists, infer from first-person language patterns ("I'll send", "I need to") — these are always "I owe them". Third-person references to the attendee ("Sarah will send") are "they owe me".
- Document the design decision in the PRD so subagents implementing Phase B don't have to figure this out.

**Verification**: Phase B task prompt includes explicit guidance on how to resolve "I" identity. Test cases cover both profile.md-present and profile.md-absent scenarios.

---

### Risk 4: Action Item Lifecycle — Unbounded Growth Without Aging

**Problem**: Every `refreshPersonMemory()` run extracts action items from meeting history. Without lifecycle management, a person's `## Open Items` section grows forever — items from 6 months ago persist alongside fresh ones. The section becomes noise, not signal. This is worse than not having the feature.

**Mitigation**: 
- Design and implement lifecycle rules in Phase B:
  - Auto-stale items older than 30 days (configurable)
  - Cap at 10 open items per person per direction (show most recent)
  - Optional: detect resolution by finding similar text in later meetings
- Content-normalized hash (`hash(normalize(text) + slug + direction)`) for dedup across refreshes
- Render stale items in a collapsed/dimmed format or omit from meeting prep

**Verification**: Test cases for: item added, item aged out after 30 days, item deduped on re-extraction, cap enforced at 10. Meeting prep output excludes stale items.

---

### Risk 5: LLM Extraction Non-Determinism — Different Results Each Refresh

**Problem**: LLM-based stance extraction is non-deterministic. Running `refreshPersonMemory()` twice on the same meetings may produce different stances. This creates a confusing UX where person profiles change without new data, and makes testing harder (can't assert exact output).

**Mitigation**: 
- **Cache by content hash**: Hash meeting file content → cache extraction results. Same content = same cached result, no re-extraction.
- **Append-only accumulation**: New stances are added; existing stances are never removed by re-extraction (only by user edit or aging).
- **Dedup by normalized topic**: Don't add a stance if a semantically similar one already exists (cosine similarity on normalized text, or simpler: normalized string prefix match).
- For tests: mock `LLMCallFn` to return deterministic results. Never test LLM output directly.

**Verification**: Test that re-running refresh on unchanged meetings produces identical person file content. Test that mock LLM produces predictable, assertable output.

---

### Risk 6: Regex vs. LLM Quality Gap Creates Inconsistent Person Profiles

**Problem**: Asks and concerns use regex extraction (fast, free, deterministic). Stances use LLM extraction (slower, costs tokens, non-deterministic). This creates a quality gap within the same person profile — some sections are reliable, others are fuzzy. Users may not understand why "Repeated asks" is precise while "Stances" is sometimes wrong.

**Mitigation**: 
- **Source citation on every item** (council policy: mandatory). Every stance includes "(from: [Meeting], [Date])". Users can verify.
- **Conservative extraction**: LLM prompt tuned for precision over recall. Miss real stances rather than invent fake ones.
- **Consistent labeling**: All auto-generated sections clearly marked as auto-generated with refresh date. No mixing of auto and manual content within the same marker block.
- Consider: keep existing regex-based ask/concern extraction AS-IS. Don't rewrite to LLM just for consistency. The regex works well for its domain.

**Verification**: Review LLM prompt for conservative stance extraction. Verify all rendered items include source citation. Manual test with real meeting content to check false positive rate.

---

### Risk 7: Test Infrastructure for LLM-Dependent Features

**Problem**: Existing person-memory tests (`person-memory.test.ts`, 602 lines) use in-memory `StorageAdapter` mocks and deterministic input. LLM-dependent tests need a different pattern: mock `LLMCallFn`, test prompt construction separately from response parsing, test the integration of LLM results with the aggregation pipeline. No established test pattern for this exists in the entity/person-memory test suite.

**Mitigation**: 
- Follow the `extractInsights()` test pattern from `packages/core/test/integrations/conversations/extract.test.ts` — it tests `buildExtractionPrompt()` and `parseExtractionResponse()` separately, then integration with a mock LLM.
- For stance extraction: test prompt generation, response parsing, and integration as three separate test groups.
- For action items (regex-based, not LLM): follow existing `collectSignalsForPerson()` test pattern.
- Before starting Phase A coding, read `extract.test.ts` to establish the pattern.

**Verification**: Each new extraction module has prompt test, parse test, and integration test. All tests use mock LLM (no real API calls). `npm test` passes with no network dependencies.

---

### Risk 8: Meeting Prep Skill Update is Prompt-Only, Not Code

**Problem**: Phase D updates the `meeting-prep` skill to consume stances, action items, and relationship health. But the meeting-prep skill is a **markdown file** (`SKILL.md`), not TypeScript code. The actual "consume" step happens when an agent reads the skill and follows its instructions, including the `get_meeting_context` pattern in `PATTERNS.md`. The plan might confuse skill prompt editing with code changes, leading to either: (a) subagents writing code that doesn't exist (no programmatic meeting prep), or (b) prompt changes that don't actually flow through because the pattern doesn't know about new data.

**Mitigation**: 
- Phase D tasks are explicitly: (1) update `meeting-prep/SKILL.md` to include stances, open items, relationship health in the brief format, (2) update `PATTERNS.md` `get_meeting_context` to include a step for reading person auto-memory sections, (3) no TypeScript code changes in Phase D.
- The key integration point is `arete people show <slug> --memory` — if this command outputs the enriched profile (stances, items, health), the meeting-prep skill's agent will see it when following get_meeting_context.

**Verification**: After Phase D, manually test "prep for meeting with X" and verify the brief includes stances and open items. Verify `SKILL.md` and `PATTERNS.md` reference the new sections.

---

### Risk 9: Scope Creep from "Communication Preferences" Ambiguity

**Problem**: The original plan includes "Communication Preferences" in Phase A. The Persona Council recommended cutting it from v1. The Engineering Lead didn't address it specifically. If not explicitly removed from the PRD, a subagent implementing Phase A may build it anyway, wasting effort on a cut feature that could introduce noise into person profiles.

**Mitigation**: 
- **Explicitly cut from PRD**: Communication Preferences is OUT OF SCOPE for this work. Add to "Out of Scope" section.
- Remove from Phase A task 1 ("Add optional structured sections..."). Only Stances and Open Items sections are in scope.
- Add to backlog as a post-v1 research item contingent on LLM extraction accuracy data.

**Verification**: PRD "Out of Scope" section lists Communication Preferences explicitly. No task references it.

---

### Risk 10: Process-Meetings Skill Coupling — Auto-Refresh Timing

**Problem**: Task 9 adds auto-triggered person memory refresh during meeting processing. But `process-meetings` is a markdown skill (agent-driven), not code. The actual meeting processing pipeline in code is `refreshPersonMemory()` which is called by the CLI `arete people memory refresh`. If the skill tells the agent to call `refreshPersonMemory()` after processing, but the person files don't exist yet (they're being created in the same processing run), stances and action items will be extracted from zero history.

**Mitigation**: 
- Ensure process-meetings workflow order: (1) create/update person files, (2) write `attendee_ids` to meeting frontmatter, (3) THEN refresh person memory. The refresh depends on person files existing and meetings having `attendee_ids`.
- Document this ordering dependency in the process-meetings SKILL.md update.
- Test: after processing a brand new meeting with a new person, the person file should have memory highlights from that meeting.

**Verification**: Manual test of end-to-end flow: new meeting → process-meetings → person file created → memory refreshed with stances from that meeting.

---

## Summary

**Total risks identified**: 10  
**Categories covered**: Context Gaps (1, 3), Test Patterns (7), Integration (8, 10), Scope Creep (9), Code Quality (2, 6), Dependencies (3), Platform Issues (1, 5), State Tracking (4)

**Highest severity risks**:
1. **Risk 2 (God Object)** — Must be resolved as Task 0, blocks everything
2. **Risk 1 (LLM into EntityService)** — Architectural decision needed before coding starts
3. **Risk 3 (Workspace Owner)** — Design decision blocks Phase B entirely
4. **Risk 4 (Action Item Lifecycle)** — Without this, the feature degrades over time

**Recommended pre-build decisions**:
- [ ] Confirm: LLM extraction lives in separate module, not injected into EntityService
- [ ] Confirm: Workspace owner identity via `context/profile.md` name/email
- [ ] Confirm: Communication Preferences cut from v1
- [ ] Confirm: Task 0 (extract person-memory module) is mandatory first step

**Ready to proceed with these mitigations?**
