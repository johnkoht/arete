---
title: "Review: Cross-Area Synthesis"
plan: cross-area-synthesis
reviewer: eng-lead
created: "2026-04-06"
---

# Review: Cross-Area Synthesis

**Type**: Plan
**Audience**: Builder
**Review Path**: Full
**Complexity**: Small (3 steps, 4 files)
**Recommended Track**: express

---

## Expertise Loaded

- Core PROFILE.md (Invariants, Anti-Patterns, Key Abstractions)
- CLI PROFILE.md (Purpose & Boundaries, Command Architecture)
- `packages/core/src/services/LEARNINGS.md`
- `packages/cli/src/commands/LEARNINGS.md`

## LEARNINGS.md Compliance

Checked against relevant documented patterns:

| Pattern | Status | Notes |
|---------|--------|-------|
| Services must NOT call `fs` directly | ✅ | Plan uses `StorageAdapter` via existing service |
| `callLLM` via method options, not constructor | ✅ | Explicitly stated in resolved decisions |
| CLI commands check `isConfigured()` before AI calls | ⚠️ | Not mentioned in plan — see Concern #2 |
| Commands writing files should call `refreshQmdIndex()` | ✅ | Synthesis file is in QMD-indexed directory, refresh already happens in memory refresh flow |
| `--json` output must be complete and parseable | ⚠️ | Step 3 doesn't mention JSON output — see Concern #3 |

---

## Checklist

| Concern | Status | Notes |
|---------|--------|-------|
| Audience | ✅ | Clearly builder tooling |
| Scope | ✅ | Well-scoped — 3 steps, single new method + CLI wiring |
| Risks | ✅ | Pre-mortem covers 6 risks, all mitigated |
| Dependencies | ✅ | Steps are sequential and correctly ordered |
| Patterns | ✅ | Follows `callLLM` function injection pattern from EntityService |
| Multi-IDE | N/A | No runtime/agents changes |
| Backward compat | ✅ | `callLLM` is optional — no breakage if not provided |
| Catalog | ⚠️ | Minor — see Concern #5 |
| Completeness | ⚠️ | See concerns below |
| Test coverage | ⚠️ | Step 1 has AC for tests, but Steps 2/3 don't — see Concern #4 |
| Quality gates | ❌ | No mention of `typecheck && test` at any step — see Concern #1 |

## AC Validation

| Step | AC Text | Issue | Suggested Fix |
|------|---------|-------|---------------|
| Step 1 | "Unit test with mocked area files and mocked LLM response verifies prompt construction and response parsing" | "response parsing" is vague — what specifically is parsed? Per pre-mortem Risk #1, the plan should NOT parse structurally. | "Unit test with mocked area files and mocked `callLLM` verifies: (1) prompt contains all area names and content, (2) LLM response written to `_synthesis.md` with correct frontmatter, (3) `callLLM` not provided → no synthesis file written" |
| Step 2 | "The synthesis file contains specific, evidence-based connections" | Untestable — who judges "specific" and "evidence-based"? This is an LLM output quality concern, not a code AC. | "Synthesis file written to `.arete/memory/areas/_synthesis.md` with YAML frontmatter (`type`, `last_refreshed`, `areas_analyzed`) and LLM response body. File not written when `callLLM` is absent or when refreshing a single area." |
| Step 3 | "CLI output includes synthesis summary" | Acceptable but could be more specific. | "CLI output includes synthesis line (e.g., 'Cross-area synthesis: updated' or 'Cross-area synthesis: skipped (no AI configured)'). `--json` output includes `synthesis: { updated: boolean }`." |
| Step 3 | "LLM failure degrades gracefully" | Good intent but vague. | "If `callLLM` throws, the error is logged as a warning and `refreshAllAreaMemory` still returns success. No `_synthesis.md` is written on failure." |

---

## Concerns

### Concern 1: No quality gates in any step

**What's wrong**: None of the 3 steps mention running `npm run typecheck && npm test` as a verification step.
**Suggestion**: Add to each step's AC or add a global note: "After each step: `npm run typecheck && npm test` must pass."

### Concern 2: Missing `isConfigured()` guard in CLI

**What's wrong**: Per CLI LEARNINGS: "CLI commands should use AIService; check `services.ai.isConfigured()` before AI calls." Step 3 mentions graceful degradation for LLM errors but doesn't mention checking if AI is configured before creating the `callLLM` wrapper.
**Suggestion**: Add to Step 3 (or Step 2's CLI wiring): "Only create and pass `callLLM` when `services.ai.isConfigured()` returns true. When AI is not configured, skip synthesis silently (no warning needed — same as current behavior without AI)."

### Concern 3: `--json` output not specified for synthesis

**What's wrong**: Per CLI LEARNINGS, `--json` output must be complete and parseable. The `memory refresh` command already supports `--json`. Step 3 doesn't specify what the JSON output should include for synthesis.
**Suggestion**: Add to Step 3 AC: "`--json` output includes `synthesis: { updated: boolean }` (or `synthesis: { skipped: true, reason: string }` when skipped)."

### Concern 4: Steps 2 and 3 lack test expectations

**What's wrong**: Step 1 specifies unit tests, but Steps 2 and 3 have no test expectations. Step 2 modifies core service behavior (calling synthesis at end of `refreshAllAreaMemory`). Step 3 modifies two CLI commands.
**Suggestion**: Step 2 AC should include: "Test verifies `refreshAllAreaMemory` calls `synthesizeCrossArea` when `callLLM` provided and skips when not." Step 3: CLI test coverage is lower priority (express track), but note it explicitly: "CLI output changes — manual verification acceptable for express track."

### Concern 5: `_synthesis.md` exclusion from `listAreaMemoryStatus()`

**What's wrong**: Pre-mortem Risk #5 identified this but the plan doesn't include it as an explicit step. `listAreaMemoryStatus()` (lines 434-448) iterates area files — if `_synthesis.md` isn't filtered, it appears as an area in `arete status`.
**Suggestion**: Add to Step 2: "Ensure `listAreaMemoryStatus()` excludes `_synthesis.md` (filter files starting with `_`). Verify `arete status` area count is unchanged after synthesis."

### Concern 6: Critical files table lists wrong CLI file

**What's wrong**: The critical files table lists `packages/cli/src/commands/intelligence.ts` but the resolved decisions and step descriptions reference it correctly. Minor inconsistency — the original table listed `memory.ts` which doesn't exist. The current table is correct. *(Self-correction: this is fine, no action needed.)*

---

## Strengths

- **Resolved decisions are excellent** — all three open questions answered with specific patterns, file references, and rationale. The `callLLM` function injection approach is exactly right.
- **Pre-mortem is thorough** — 6 risks with concrete mitigations. Risk #1 (parsing fragility) is the most valuable insight.
- **Scope discipline** — resisting token budgets and incremental refresh for v1 is the right call.
- **Evidence-based prompt design** — the plan correctly emphasizes the LLM should cite actual data, not fabricate.

---

## Devil's Advocate

**If this fails, it will be because...** the LLM produces generic, unhelpful synthesis ("Engineering and Product are related because they both involve people") rather than specific, actionable connections. The plan instructs the LLM to be evidence-based, but prompt engineering is iterative — the first prompt will likely need 2-3 rounds of refinement based on real workspace data. The plan doesn't account for this iteration loop.

**The worst outcome would be...** the synthesis file becomes noise that users learn to ignore, undermining trust in area memory overall. If the connections are consistently low-quality, users may stop running `arete memory refresh` entirely. Mitigation: make synthesis opt-in initially (only when `callLLM` is provided), and iterate on prompt quality before making it default.

---

## Verdict

- [x] **Approve with suggestions** — Address Concerns #1-5 before execution

### Suggested Changes

**Change 1**: Quality Gates
- **What's wrong**: No `typecheck && test` verification in any step
- **What to do**: Add global note or per-step AC
- **Where to fix**: Each step's AC section

**Change 2**: `isConfigured()` Guard
- **What's wrong**: Missing AI availability check
- **What to do**: Add guard before creating `callLLM` wrapper
- **Where to fix**: Step 2 or Step 3, CLI wiring section

**Change 3**: JSON Output Spec
- **What's wrong**: `--json` output for synthesis not specified
- **What to do**: Add `synthesis` field to JSON output schema
- **Where to fix**: Step 3 AC

**Change 4**: Test Expectations for Steps 2-3
- **What's wrong**: Only Step 1 has test AC
- **What to do**: Add integration test expectation for Step 2, manual verification note for Step 3
- **Where to fix**: Steps 2 and 3 AC sections

**Change 5**: `_synthesis.md` Exclusion
- **What's wrong**: Not an explicit task despite being a known risk
- **What to do**: Add filtering step and verification
- **Where to fix**: Step 2, integration into refresh flow
