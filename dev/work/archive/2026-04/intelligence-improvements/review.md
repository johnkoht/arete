# Review: Meeting Intelligence Improvements

**Type**: Plan
**Audience**: Builder (internal Areté development)
**Review Path**: Full (25 steps, multiple packages, architectural decisions)
**Complexity**: Large
**Pre-Mortem**: ✅ Exists (8 risks identified)

---

## Expertise Profile Compliance

### Core Package Invariants Checked

| Invariant | Status | Notes |
|-----------|--------|-------|
| Services must NOT call `fs` directly | ✅ Compliant | reconciliation module is pure functions (no storage access) |
| DI via constructor for services | ✅ Compliant | AreaParserService extends existing DI pattern |
| Jaccard test strings must be verified mathematically | ⚠️ Flag | Step 10 uses 0.7 threshold - test strings must be calculated, not intuited |
| SearchProvider path normalization | ✅ Addressed | Step 11 uses SearchProvider via DI, no direct paths |

### LEARNINGS.md Compliance

- **`packages/core/src/services/LEARNINGS.md`**: Plan correctly uses pure functions pattern for reconciliation (like `meeting-processing.ts` pattern)
- **Jaccard gotcha** (from LEARNINGS.md): "Jaccard similarity test strings must be verified mathematically" — ensure Step 10 tests use calculated pairs (e.g., 5/7 words = 0.714)

---

## Concerns

### 1. Missing Context Loading Step

**What's wrong**: Step 16 says "load batch, reconcile, update staged items" but there's no explicit step for loading the reconciliation context (areaMemories, completedTasks, recentMemory). This is complex and deserves its own function/step.

**Suggestion**: Add a step before Step 16 (or within Step 9) that explicitly defines `loadReconciliationContext(workspace)` which gathers:
- All AreaMemory from areas/*/memory.md
- Recent committed items from .arete/memory/
- Completed tasks from area task lists

### 2. Phase 1 Template Location Inconsistency

**What's wrong**: Step 6 says "Template at `templates/memory.md`" but also "Template copied on `arete update`". The source would be `packages/runtime/templates/memory.md` (as listed in Files to Modify), not workspace `templates/`.

**Suggestion**: Clarify AC to: "Template source at `packages/runtime/templates/memory.md`; copied to workspace on `arete update`"

### 3. Step 7 Is Not Executable by Subagent

**What's wrong**: Step 7 says "Manually populate 2-3 real areas with memory.md for testing" — this requires access to the builder's real workspace, which subagents won't have.

**Suggestion**: Either:
- Move Step 7 out of the automated PRD (mark as "Builder action required")
- Replace with: "Create test fixture `memory.md` files in `test-data/areas/` for testing"

### 4. Recent Memory Window Inconsistency

**What's wrong**: 
- Architecture diagram says "Recent memory (last 7 days)"
- Step 13 AC says "Recent = last 30 days"

**Suggestion**: Align on one window (30 days seems more useful for dedup). Update architecture diagram.

---

## AC Validation Issues

| Task | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| 3 | "3+ real meeting transcripts" | Privacy concern — real transcripts in repo? | "3+ synthetic/anonymized transcripts with realistic structure" |
| 5 | "Returns null when file doesn't exist (no error)" | Compound criterion | Split: "Returns null for missing file" and "Does not throw for missing file" |
| 11 | "Falls back to skipping this step when QMD unavailable" | Vague "skipping" | "When QMD unavailable, all items retain `status: 'keep'` (no workspace matching performed)" |
| 15 | "why field is human-readable" | Subjective | "why field is 1-2 sentences explaining the primary match reason" |
| 22 | "Or split into..." | Ambiguous decision | Decide now: single `resources` scope OR split. Don't defer architectural decisions. |

---

## Test Coverage Check

| Task | Has Test Expectation? | Assessment |
|------|----------------------|------------|
| 1-3 | ✅ Yes | Good: unit + golden files |
| 4 | ⚠️ Implicit | "Type compilation" is implicit — acceptable for types |
| 5 | ✅ Yes | Good: valid/invalid/missing cases |
| 6 | ✅ Yes | Good: file exists + copied |
| 7 | ⚠️ Manual | N/A (not code) |
| 8-18 | ✅ Yes | Good: unit tests specified for each function |
| 19-22 | ✅ Yes | Good: collection creation tests |

**Verdict**: Test coverage is adequate. Note: Phase 2 tests should include Jaccard boundary tests with mathematically verified strings per LEARNINGS.md gotcha.

---

## Strengths

1. **Pure function design for reconciliation** — Excellent alignment with existing `meeting-processing.ts` pattern. Testable, no DI complexity.

2. **Conservative thresholds** — 0.7 for Jaccard, "low relevance" shows items (doesn't delete). Safe default.

3. **Explicit fallback behavior** — QMD unavailable falls back to Jaccard. Graceful degradation.

4. **Phase gates** — Clear checkpoints between phases prevent incomplete work from propagating.

5. **Files to Modify section** — Clear mapping of changes to packages. Helps with context loading.

6. **Pre-mortem already done** — 8 risks identified with mitigations (required for Large plans).

---

## Devil's Advocate

**If this fails, it will be because...**

The reconciliation context loading is underspecified. Step 16 assumes "load batch, reconcile, update staged items" but:
1. How does pullFathom know which areas to load AreaMemory for? 
2. How do we get completedTasks without reading every area's task files?
3. Recent memory (30 days) could be hundreds of items — is there a performance issue?

The most likely failure: reconciliation works in tests with small mock context, but fails in production because loading real workspace context takes 5+ seconds or exceeds memory.

**The worst outcome would be...**

False negatives — important items marked as "duplicate" or "completed" when they're not. The builder stops trusting the system and disables reconciliation, wasting the entire effort. Mitigated by: conservative thresholds and "duplicate" items are still visible (just annotated), not deleted.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Approve pending pre-mortem** — N/A (pre-mortem exists)
- [ ] **Revise** — Address concerns before proceeding

**Recommendation**: Proceed with execution. The concerns are addressable during implementation:
1. Add context loading function as part of Step 9 or 16
2. Fix template path in Step 6 AC
3. Convert Step 7 to test fixture creation OR mark as builder action
4. Align recent memory window (pick 30 days, update diagram)
5. Decide on Step 22 scope split now

These are refinements, not blockers. The architecture is sound, patterns are correct, and pre-mortem covers the main risks.

---

## Suggested Changes (for orchestrator to apply)

**Change 1**: Context Loading Gap
- **What's wrong**: No explicit step for loading reconciliation context
- **What to do**: Add to Step 9 AC: "Context loading: implement `loadReconciliationContext(workspace, options)` that gathers areaMemories, completedTasks, recentMemory"
- **Where to fix**: Step 9 description

**Change 2**: Template Path Clarification
- **What's wrong**: Step 6 says "templates/memory.md" (ambiguous)
- **What to do**: Change to "packages/runtime/templates/memory.md"
- **Where to fix**: Step 6 AC

**Change 3**: Recent Memory Window
- **What's wrong**: Architecture says 7 days, Step 13 says 30 days
- **What to do**: Update architecture diagram to say "last 30 days"
- **Where to fix**: Architecture section

**Change 4**: Step 22 Decision
- **What's wrong**: "Or split into..." defers a decision
- **What to do**: Decide: Use single `resources` scope (simpler, matches pattern of other scopes)
- **Where to fix**: Step 22 AC — remove the "Or split" option

---

*Reviewed by: review-plan skill*
*Review date: 2026-04-02*
