# Review: Meeting Extraction Improvements

**Date**: 2026-03-25
**Reviewer**: Engineering Lead (with core/cli expertise profiles)
**Expertise Loaded**: `.pi/expertise/core/PROFILE.md`, `.pi/expertise/cli/PROFILE.md`

---

## Review Method

This review was conducted with domain expertise profiles injected into the reviewer context. Key patterns, invariants, and anti-patterns from the profiles were used to validate the plan against Areté's established architecture.

---

## Concerns (Specific Issues)

### 🔴 CRITICAL: Backend path is wrong
The plan references `apps/backend/src/services/agent.ts` (Step 11), but the actual path is:
```
packages/apps/backend/src/services/agent.ts
```

**Action**: Correct path in Step 11 before execution.

---

### 🔴 CRITICAL: `AreaParserService` not wired in `createServices()` factory

The `AreaParserService` class exists (`packages/core/src/services/area-parser.ts`) and is exported from `services/index.ts`, but it's **not wired in `createServices()`** (`packages/core/src/factory.ts`).

Step 7 adds `areaParser?: AreaParserService` to `MeetingContextDeps` but doesn't address how callers get an instance.

**Per core PROFILE.md**: "CLI commands never construct services directly — always `createServices(process.cwd())`"

**Action**: Add Step 7a: "Wire `AreaParserService` into `createServices()` factory"

---

### 🟡 Naming inconsistency: `priorStagedItems` vs `priorItems`

- Step 4 adds `priorStagedItems` to `meeting-extraction.ts` options
- Step 5 adds `priorItems` to `ProcessingOptions` in `meeting-processing.ts`

Different names for the same concept creates confusion.

**Action**: Unify naming (recommend `priorItems` everywhere — shorter, matches existing `priorItems` in processing)

---

### 🟡 Missing explicit export additions

Step 4 says "Type exported from `packages/core/src/services/index.ts`" but doesn't specify which new types:
- Updated `MeetingContextBundle` with `areaContext`
- Updated `ProcessingOptions` with `priorItems`
- New `PriorItem` type (if created)

**Action**: Add AC to Step 4 and Step 8: "Verify types re-exported from index.ts"

---

## Strengths

1. **Phased execution with independent value** — Phase 1 (perf) can ship alone without Phases 2-4. Good for de-risking.

2. **Explicit backward compatibility** — Step 7's `areaParser?` optional field ensures existing callers don't break.

3. **Belt-and-suspenders dedup** — Both prompt-based (Step 6) AND post-processing Jaccard (Step 5). If LLM ignores instructions, filtering catches it.

4. **Follows core DI patterns** — `StorageAdapter` used throughout, no direct `fs` imports, `testDeps` pattern acknowledged.

5. **Existing infrastructure leveraged** — `AreaParserService` already exists with `getAreaForMeeting()` and `getAreaContext()`. No new services to build.

6. **Clear thresholds** — Jaccard 0.7 reused from existing `processMeetingExtraction()`.

---

## Devil's Advocate

**"If this fails, it will be because..."**

1. **The LLM prompt changes (Step 6) over-suppress legitimate updates.** The "UPDATE exception" is vague. What counts as an update? "Cover Whale is next priority" vs "Cover Whale is still next priority" — is that an update? The Jaccard fallback may not distinguish either.

2. **Area context adds token bloat that degrades extraction quality.** Adding "Current State" (500 chars), "Key Decisions" (5 items), and "Exclusion List" could push prompts past the context window sweet spot. No token budget analysis in the plan.

3. **Backend divergence causes subtle bugs.** CLI and backend both call `processMeetingExtraction()` but with different callers assembling `priorItems`. If one forgets, dedup only works in one path.

---

## Required Changes (Before PRD)

| Issue | Change |
|-------|--------|
| Backend path wrong | Fix `apps/backend/` → `packages/apps/backend/` |
| AreaParserService not wired | Add Step 7a: Wire into `createServices()` factory |
| Naming inconsistency | Unify to `priorItems` everywhere |

---

## Suggested Improvements (Not Blocking)

| Suggestion | Rationale |
|------------|-----------|
| Add token budget note to Step 9 | Area context could add ~1000 tokens |
| Add `priorItems` cap (e.g., 50 items) to Step 5 | Prevent memory bloat in large batches |
| Add integration test AC to Step 11 | "CLI and backend produce identical dedup for same meeting" |

---

## Verdict: **Approve with Suggestions**

The plan is architecturally sound and follows core patterns. Ready to convert to PRD after addressing the 3 required changes above.

**Recommended next step**: `/pre-mortem` focusing on LLM prompt sensitivity and backend/CLI divergence.

---

## Expertise Profile Gaps Noted

1. **Backend package has no expertise profile** — `packages/apps/backend/` is referenced but `.pi/expertise/backend/PROFILE.md` doesn't exist. Consider creating one.

2. **Meeting processing partially documented** — `meeting-context.ts` and `meeting-extraction.ts` are mentioned in core PROFILE.md but not fully detailed. Consider expanding after this work completes.
