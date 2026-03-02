# People Intelligence PRD — Execution Learnings

**Date**: 2026-03-01  
**PRD**: `dev/work/plans/people-intelligence/prd.md`  
**Branch**: `people-intelligence`

## Metrics

- **Tasks**: 9/9 complete (100%)
- **First-attempt success**: 9/9 (100%)
- **Iterations required**: 0
- **Tests added**: ~120 new tests across 5 test files
- **Total tests**: 1046 passing (4 pre-existing adapter failures)
- **Commits**: 9
- **Token usage**: ~150K estimated (~30K orchestrator + ~120K subagents)
- **New modules**: 3 (`person-memory.ts`, `person-signals.ts`, `person-health.ts`)
- **Net lines added**: ~3,716 additions, 253 deletions

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Effective |
|------|:---:|:---:|
| LLM breaks service invariants | No | Yes — separate module pattern |
| God Object (entity.ts) | No | Yes — mandatory refactor first |
| Workspace owner identity | No | Yes — profile.md name field |
| Action items unbounded | No | Yes — stale/cap/dedup lifecycle |
| LLM non-determinism | No | Yes — mock LLM in all tests |
| Regex vs LLM quality gap | No | Yes — source citations on all |
| Test infra for LLM features | No | Yes — extract.ts pattern |
| Meeting prep is markdown | No | Yes — explicit markdown-only task |
| Scope creep | No | Yes — cut early |
| Process-meetings timing | No | Yes — ordering documented |

0/10 risks materialized. Pre-mortem was highly effective for this PRD.

## What Worked Well

1. **Mandatory refactor first (Task 1)**: Extracting `person-memory.ts` from entity.ts before adding features gave clean module boundaries. Every subsequent task had clear import paths.
2. **Parallel task execution**: Tasks 2, 3, 6 ran concurrently (stance extraction, action items, health) — significant time savings since they had no dependencies on each other.
3. **Detailed subagent prompts**: Listing specific files to read, patterns to follow, and explicit design decisions prevented ambiguity. 100% first-attempt success rate.
4. **Reviewer pre-work sanity checks**: Caught the render boundary ambiguity (Task 4 vs Task 5) before developer started, preventing a potential scope overlap.
5. **Extract.ts pattern as LLM test template**: The `buildPrompt/parseResponse/extractFunction` separation from conversations/extract.ts was a perfect model for stance extraction tests.

## What Didn't Work

1. **Minor: Parallel tasks creating the same file**: Tasks 2 and 3 both targeted `person-signals.ts`. One developer created the full file (stances + action items combined), the other found it already existed. No actual conflict, but the ordering was slightly messy in git history.

## Subagent Insights

- **Context files are critical**: Every developer reported that reading the listed files first guided their implementation. The "read these files first" section is the most valuable part of the prompt.
- **LEARNINGS.md referenced by multiple tasks**: The function-scoped Map cache pattern was used by Tasks 1 and 4 developers.
- **Reflection quality**: Small tasks gave 1-2 useful sentences. The medium task (Task 4) gave the most valuable insights (LLM mock matching, LEARNINGS impact).

## Recommendations for Next PRD

- **Continue**: Mandatory refactor-first for God Objects, parallel task execution, detailed file lists in prompts, reviewer pre-work checks
- **Start**: Consider splitting parallel tasks that target the same file into sequential to avoid commit confusion
- **Continue**: Pre-mortem with concrete mitigations — 0/10 risk materialization is a strong signal

## Learnings

- The `callLLM?: LLMCallFn` pattern (optional LLM injection via options, not constructor) is the right way to add LLM capabilities to services without breaking the DI pattern. Document this as the canonical pattern for future LLM integrations.
- Content-hash dedup (sha256 of normalized text + slug + direction) is effective for preventing accumulation across repeated extractions. Should be the default pattern for any incremental extraction feature.
