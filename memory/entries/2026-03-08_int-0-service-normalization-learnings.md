# INT-0 Service Normalization — Learnings

**Date**: 2026-03-08
**PRD**: `dev/archive/plans/intelligence-tuning/prd.md` (archived)
**Status**: Complete

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 4/4 |
| First-attempt success | 100% (all tasks approved on first iteration) |
| Tests added | 34 (26 core + 8 CLI) |
| Total tests passing | 1563 |
| Commits | 5 (4 tasks + 1 doc) |
| Token usage (est.) | ~45K total (~25K subagents + ~20K orchestrator) |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Type mismatch core/backend | Yes | Yes — kept backend's formatStagedSections | Yes |
| Backend typecheck gap | No | Yes — used build:apps:backend | Yes |
| LEARNINGS.md conflict (CLI LLM) | No | Yes — documented reversal | Yes |
| ActionItem format ambiguity | No | Yes — explicit format spec | Yes |
| Output regression | No | Yes — existing tests verified | Yes |
| Core export path | No | Yes — verified barrel export | Yes |
| Fresh context | No | Yes — explicit file lists | Yes |
| Idempotency | No | Yes — explicit test | Yes |

**Key pre-mortem value**: Risk #1 (type mismatch) materialized during Task 3 planning. Identified that core's `formatStagedSections` outputs rich format (`[@owner → @counterparty]`) while backend needs simple format. Resolved by prioritizing backward compatibility — backend keeps its simple formatter. Without pre-mortem, this would have caused a runtime regression.

---

## What Worked Well

1. **Pre-mortem risk identification caught a design conflict** — Risk #1 (type mismatch) predicted the exact issue that arose in Task 3. The mitigation (type adapter, don't unify) informed the resolution (keep backend's formatter, import only `updateMeetingContent`).

2. **Explicit format specifications** — Task 1 prompt included exact ActionItem format with 5 examples. Developer had zero ambiguity about output format. Reviewer called this out as "excellent."

3. **Architectural reversal documentation** — Task 2 explicitly flagged the reversal of the 2026-03-04 decision (CLI shouldn't require LLM access). Developer knew to update LEARNINGS.md with rationale. No confusion about "is this a mistake?"

4. **Backend typecheck mitigation** — LEARNINGS.md entry about `npm run build:apps:backend` was called out by Task 3 developer as "critical" — prevented broken code from being committed.

5. **Documentation synthesis during execution** — Caught that AGENTS.md sources needed updating for the new CLI command. Added during holistic review, not deferred.

---

## What Didn't Work (Scope Modifications)

1. **Task 3 AC conflict** — Original ACs said:
   - "Backend imports formatStagedSections from @arete/core"
   - "POST /api/meetings/:slug/process output unchanged"
   
   These were incompatible (core's formatter outputs different format). Required orchestrator decision to modify scope mid-execution. **Lesson**: PRD review should verify ACs don't conflict with each other.

---

## Subagent Insights (Aggregated from Reflections)

| Task | What Helped | Suggestion |
|------|-------------|------------|
| INT-0.1 | Explicit format spec with 5 examples | Continue this pattern for any string formatting |
| INT-0.2 | LEARNINGS.md entry flagged as "architecture reversal" | For deliberate reversals, mark prominently |
| INT-0.3 | Backend LEARNINGS.md on build:apps:backend | Single-most-critical gotcha |
| INT-0.4 | N/A (small doc task) | — |

**Common thread**: Explicit file lists in "Context - Read These Files First" prevented assumptions. Subagents didn't have to search.

---

## Collaboration Patterns

- **Scope conflict resolution**: When Task 3 ACs conflicted, I (orchestrator) proposed a resolution to the builder before executing. Builder approved quickly. Fast directional call once trade-offs were clear.
- **Pre-mortem → mitigations → prompts**: The flow worked. Mitigations identified in pre-mortem were explicitly embedded in subagent prompts. Reviewers verified mitigations were applied.

---

## Recommendations

### Continue
1. Pre-mortem before multi-task PRDs — caught the type mismatch before it became a runtime issue
2. Explicit format specifications with examples in prompts
3. "Context - Read These Files First" sections with specific paths
4. Backend-specific typecheck reminder (`npm run build:apps:backend`)
5. Architecture reversal labeling with rationale

### Stop
1. N/A — no patterns to stop this execution

### Start
1. **PRD review gate for AC conflicts** — before marking PRD "ready for build," scan ACs for logical conflicts (e.g., "import X from Y" + "output unchanged" when Y outputs different format)
2. **Documentation check at holistic review** — caught AGENTS.md sources gap. Add to close-out checklist: "If new CLI commands added, check AGENTS.md sources."

---

## Documentation Updates Applied

| File | What Changed |
|------|--------------|
| `packages/cli/src/commands/LEARNINGS.md` | Superseded 2026-03-04 entry with AIService architecture rationale |
| `.agents/sources/shared/cli-commands.md` | Added `arete meeting extract` command |
| `dist/AGENTS.md` | Rebuilt with new CLI command |

---

## Refactor Items

None — no technical debt identified during execution.

---

## Bonus Work (Testing Phase)

During user testing of `arete meeting extract`, discovered:

1. **Silent error swallowing** — AIService returned empty results when API errors occurred (e.g., insufficient credits). Fixed to throw when `response.stopReason === 'error'`.

2. **OAuth credential support added** — User had Claude Pro/Max subscription but no API credits. Added full OAuth support:
   - `arete credentials login [provider]` — OAuth flow for Claude Pro/Max, GitHub Copilot, Google Gemini, etc.
   - Updated `arete credentials show/test` to display and test OAuth credentials
   - Updated `arete onboard` to offer OAuth login or API key choice
   - AIService checks OAuth before API keys (priority: env > OAuth > file)
   - Auto-refresh expired OAuth tokens
   - 14 new OAuth tests added

3. **Model validation warning bug identified** (not fixed) — `arete config set ai.tiers.fast anthropic/claude-sonnet-4-20250514` shows "Model not found" warning because validation checks full string against model IDs without provider prefix. The command works correctly; just misleading warning.
