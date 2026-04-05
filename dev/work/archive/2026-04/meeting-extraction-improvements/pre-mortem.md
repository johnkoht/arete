# Pre-Mortem: Meeting Extraction Improvements

**Plan**: `dev/work/plans/meeting-extraction-improvements/plan.md`  
**Date**: 2026-03-25  
**Size**: Large (13 steps across 4 phases)

---

## Risk 1: Factory Wiring Breaks Existing Callers

**Category**: Dependencies / Integration

**Problem**: Step 7a adds `AreaParserService` to `AreteServices` interface and `createServices()`. This changes the shape of the return type. Currently `createServices()` returns an object, so adding a new property is *additive* and backward-compatible for existing callers. However:

1. If any existing code destructures `createServices()` with `...rest` or strict equality checks, it could break
2. The `AreaParserService` constructor requires `(storage, workspaceRoot)` — we need to ensure `workspaceRoot` is available in the factory (it is — `createServices(workspaceRoot)` receives it as the first argument)
3. If `AreaParserService` throws during construction (e.g., invalid path), all service creation fails

**Mitigation**:
- Verify `createServices()` signature already has `workspaceRoot` (confirmed: it does)
- Add `AreaParserService` construction *after* storage adapter creation (storage is needed)
- Ensure constructor is side-effect-free (no file reads on construction — verified: current implementation is lazy)
- Run `npm run typecheck` across ALL packages after factory change to catch type mismatches

**Verification**: 
- `npm run typecheck` passes with 0 errors
- Grep for `createServices(` across CLI and backend to confirm callers don't break

---

## Risk 2: CLI and Backend Diverge on priorItems Handling

**Category**: Integration

**Problem**: Steps 10 (CLI `--prior-items`) and 11 (backend `runProcessingSession`) both implement prior-items dedup, but could diverge in:
- How items are accumulated across meetings
- The shape of `priorItems` array (type vs. text vs. source)
- Whether confidence filtering happens before or after priorItems comparison
- Token budget enforcement for exclusion list

If they diverge, batch processing via CLI produces different results than the web app, which destroys user trust ("why did this item get extracted in CLI but not in the app?").

**Mitigation**:
- Define canonical `PriorItem` type in Step 4 (`packages/core/src/services/meeting-extraction.ts`)
- Export type from `packages/core/src/services/index.ts`
- Both CLI and backend MUST use the same type — import, don't recreate
- Step 11 AC includes explicit integration test: "CLI and backend produce identical dedup for same meeting"
- Add a shared test fixture: same meeting processed with same `priorItems` → same output

**Verification**:
- `PriorItem` type exists in `packages/core/src/services/index.ts`
- CLI imports `PriorItem` from `@arete/core`, not defining locally
- Integration test in Step 11 explicitly compares CLI vs. backend output

---

## Risk 3: LLM Ignores Exclusion List (Prompt Engineering Risk)

**Category**: Dependencies (LLM behavior)

**Problem**: Step 6 adds an "Exclusion List" to the extraction prompt asking the LLM to skip previously-extracted items. LLMs notoriously struggle with:
- Negation ("do NOT extract" → extracts anyway)
- Long lists (attention degradation with many items)
- Semantic equivalence detection (different wording = different item to LLM)

The plan mitigates this with Jaccard dedup in Step 5, but that's a safety net, not primary defense. If the LLM ignores the exclusion list consistently, we're relying entirely on post-processing, defeating the purpose of prompt-level dedup.

**Mitigation**:
- Step 6 prompt uses positive framing: "SKIP these" not "do NOT extract"
- Cap exclusion list at ~1000 tokens (plan AC) — prevents attention overflow
- Include explicit examples in prompt showing "transcript mentions X → skip because it's in exclusion list"
- Step 5 Jaccard dedup MUST use 0.7 threshold (matches existing `processMeetingExtraction`) as deterministic fallback
- Test with 3 meetings where same decision appears → verify extracted once

**Verification**:
- Prompt in Step 6 uses "SKIP" framing with positive examples
- Unit test: exclusion list with 3 items → LLM output doesn't duplicate them
- Integration test: batch of 3 meetings, same decision in each → appears once in output

---

## Risk 4: Over-Suppression of Legitimate Updates

**Category**: Scope Creep (feature behavior)

**Problem**: The exclusion list in Step 6 might over-suppress legitimate updates. Example:
- Meeting 1: "We decided to use React"
- Meeting 2: "We decided to switch from React to Vue" (this is an UPDATE, not duplicate)

If the prompt is too aggressive, Meeting 2's decision gets filtered as "semantically equivalent" to Meeting 1's. The plan acknowledges this with an "UPDATE exception" in the prompt AC.

**Mitigation**:
- Step 6 prompt MUST include explicit language: "Exception: Extract if the transcript contains an UPDATE to an existing item"
- Jaccard dedup (Step 5) should have a lower bound — items that share some words but have contradictory qualifiers ("use React" vs. "switch from React") should pass
- Consider adding a "contradiction detection" heuristic (contains negation words like "not", "instead", "changed")

**Verification**:
- Prompt includes "UPDATE exception" language
- Test case: prior item "Use React" + transcript "Switched to Vue" → new item extracted (not deduped)
- Jaccard similarity for contradictory statements < 0.7

---

## Risk 5: Double YAML Parse Regression in Step 1

**Category**: Code Quality

**Problem**: Step 1 aims to fix "double YAML parse" in `findRecentMeetings()`. Looking at the current code:

```typescript
// Current: parseMeetingFile() parses frontmatter
const parsed = parseMeetingFile(content);

// Then later: second YAML parse for attendee_ids
const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
```

The fix adds `attendee_ids` to `ParsedMeetingFrontmatter`, but `parseMeetingFile()` is used in MULTIPLE places:
- `findRecentMeetings()` (target)
- `buildMeetingContext()` (uses same function)
- Possibly others

Adding a new field is safe (additive), but we must ensure:
1. The existing `parseMeetingFile()` extracts `attendee_ids` correctly (array of strings)
2. The removal of the second YAML parse block doesn't break callers expecting `fm.attendee_ids`

**Mitigation**:
- Grep for ALL usages of `parseMeetingFile()` before modifying
- Ensure `ParsedMeetingFrontmatter.attendee_ids` is `string[] | undefined` (optional)
- Unit test: frontmatter with `attendee_ids: [john-smith, jane-doe]` → parsed correctly
- Unit test: frontmatter WITHOUT `attendee_ids` → returns `undefined` (not error)

**Verification**:
- `grep -r "parseMeetingFile" packages/core/src/` shows all call sites reviewed
- Test passes with and without `attendee_ids` in frontmatter

---

## Risk 6: Performance Not Actually Improved (False Positive)

**Category**: Platform Issues / Integration

**Problem**: Steps 1-3 claim performance improvements, but "performance" is relative and measurable. Without benchmarks:
- "60-day cutoff" (Step 2) might not help if most meetings are recent anyway
- "Batch across attendees" (Step 3) claims "3× fewer file reads" but doesn't define baseline
- `findRecentMeetings()` might be I/O-bound (disk), CPU-bound (YAML parse), or neither

If we ship "performance improvements" without measurement, we can't verify the claim.

**Mitigation**:
- Step 2 AC includes "Unit test: old meetings excluded" — but should also include timing
- Step 3 AC includes "3× fewer file reads verified in test" — make this a concrete assertion
- Add a performance test fixture: 100 meeting files, 5 attendees → time `findRecentMeetingsForAttendees()` vs. 5× `findRecentMeetings()`
- Add console.time/timeEnd in development to validate

**Verification**:
- Test explicitly counts file reads (via mock that tracks calls)
- Before: N file reads per attendee × 5 attendees = 5N
- After: N file reads total (batched) → assertion: fileReadCount === N (not 5N)

---

## Risk 7: priorItems Memory Bloat at Scale

**Category**: Platform Issues / Performance

**Problem**: Step 5 caps `priorItems` at 50 items "to prevent memory bloat." But:
- At 5 meetings/day × 20 days = 100 meetings
- Average 3 decisions + 3 learnings + 5 action items per meeting = 11 items
- Total: 1,100 items across a month

If processing a month of meetings (catch-up scenario), 50-item cap means later meetings don't see earlier items → duplicates still occur.

The real constraint isn't memory (50 × ~100 chars = 5KB, trivial), it's prompt token budget. Step 6 caps exclusion list at ~1000 tokens, which is ~200-250 items at ~4 tokens each.

**Mitigation**:
- Clarify: is 50 items per-meeting or cumulative? Plan implies cumulative ("prevent memory bloat"), but should be explicit
- Consider: recent 50 items (rolling window) vs. first 50 items (truncated history)
- Step 5 should specify: "Most recent 50 items by timestamp, or if no timestamp, by processing order"
- Document that catch-up scenarios (100+ meetings) may have diminished dedup efficacy

**Verification**:
- AC specifies "cap at 50 items" — refine to "most recent 50 items"
- Test: processing 100 meetings with 10 items each → `priorItems.length <= 50` throughout
- Document limitation in `process-meetings/SKILL.md` (Step 12)

---

## Risk 8: Context Bundle Fails Silently

**Category**: Context Gaps

**Problem**: Step 7-8 add `areaParser` to `MeetingContextDeps` and `areaContext` to `MeetingContextBundle`. The AC specifies "Falls back to constructing internally if not provided (backward compat)" and "No error if no area match."

This means context failures are silent. If `areaParser` is misconfigured or throws:
- Developer doesn't know area context is missing
- Extraction proceeds without area context (degraded, but works)
- Hard to debug "why didn't my area context show up?"

**Mitigation**:
- Add `warnings` to `MeetingContextBundle` (it already has this field!)
- When `areaParser` fails or returns null, push warning: "No area matched for meeting title"
- When area context fetch fails, push warning: "Failed to load area context: {slug}"
- `arete meeting context --json` should surface these warnings

**Verification**:
- After Step 8, `arete meeting context --json` output includes `warnings: ["No area matched for..."]` when appropriate
- No silent failures — every degradation path adds a warning

---

## Risk 9: Subagent Context Gaps on Factory Pattern

**Category**: Context Gaps

**Problem**: Steps 7-7a-8 require understanding of:
- Core DI pattern (`MeetingContextDeps`, `testDeps` injection)
- Factory wiring (`createServices()`, `AreteServices` interface)
- How `AreaParserService` constructor works
- How `buildMeetingContext()` uses `deps.areaParser`

A subagent without explicit file-reading instructions will guess at patterns and potentially:
- Wire `AreaParserService` incorrectly in factory
- Forget to export new types from `index.ts`
- Break `testDeps` pattern in tests

**Mitigation**: Orchestrator prompt for Steps 7-7a-8 MUST include:
- "Before starting, read: `packages/core/src/factory.ts`, `packages/core/src/services/meeting-context.ts`, `packages/core/src/services/area-parser.ts`"
- "Follow factory pattern: add to AreteServices interface, construct in createServices(), pass deps"
- "Export new types from `packages/core/src/services/index.ts`"
- "Preserve testDeps pattern: `deps.areaParser ?? new AreaParserService(storage, root)`"

**Verification**:
- Subagent prompt includes explicit file list
- After Step 7a, `npm run typecheck` passes
- `AreaParserService` appears in `AreteServices` interface

---

## Risk 10: Skill Documentation (Step 12) Gets Skipped

**Category**: Scope Creep / State Tracking

**Problem**: Step 12 updates `runtime/skills/process-meetings/SKILL.md` — documentation. Historically, documentation tasks get deprioritized when the "real code" is done. Risk:
- Skill file doesn't document `priorItems` accumulation pattern
- Users (or LLMs following the skill) don't know chronological ordering matters
- Batch processing fails silently because meetings processed in wrong order

**Mitigation**:
- Step 12 is explicit in the plan (good)
- Include Step 12 in pre-merge checklist: "Is skill documentation updated?"
- AC includes "Documents chronological ordering requirement" and "Documents priorItems accumulation pattern" — these are verifiable

**Verification**:
- `grep -i "chronological" runtime/skills/process-meetings/SKILL.md` returns matches
- `grep -i "priorItems" runtime/skills/process-meetings/SKILL.md` returns matches
- Example CLI pipeline in skill shows `--prior-items` usage

---

## Summary

| # | Risk | Category | Severity | Mitigation Status |
|---|------|----------|----------|-------------------|
| 1 | Factory wiring breaks callers | Dependencies | Medium | Typecheck + grep verification |
| 2 | CLI/Backend priorItems divergence | Integration | High | Shared type + integration test |
| 3 | LLM ignores exclusion list | Dependencies | High | Jaccard safety net + positive framing |
| 4 | Over-suppression of updates | Scope | Medium | UPDATE exception + test case |
| 5 | Double YAML parse regression | Code Quality | Low | Grep all usages + unit tests |
| 6 | Performance not measured | Platform | Medium | Explicit file-read counting |
| 7 | priorItems bloat at scale | Platform | Medium | Rolling window + documented limits |
| 8 | Context fails silently | Context | Low | Warnings in bundle |
| 9 | Subagent context gaps | Context | High | Explicit file lists in prompts |
| 10 | Skill docs skipped | Scope | Low | AC verification in review |

**Total risks identified**: 10  
**Categories covered**: Context Gaps, Dependencies, Integration, Scope Creep, Code Quality, Platform Issues

---

## Recommendations

### Critical (address before execution)
1. **Risk 2**: Define `PriorItem` type early (Step 4) and enforce import-not-recreate in reviews
2. **Risk 9**: Build explicit file-reading prompts for Steps 7-7a-8-9 now

### Monitor During Execution
3. **Risk 3**: After Step 6, manually test with 3 overlapping meetings to verify dedup works
4. **Risk 6**: Add timing assertions to Step 3 tests

### Document Limitations
5. **Risk 7**: Add "50-item rolling window" note to skill documentation
6. **Risk 4**: Add "UPDATE exception" test case to prevent regression

---

**Ready to proceed with these mitigations?**
