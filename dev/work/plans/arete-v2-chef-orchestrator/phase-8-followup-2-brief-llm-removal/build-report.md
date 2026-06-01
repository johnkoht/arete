# Phase 8 Followup-2 — Build Report

**Branch**: `worktree-phase-8-followup-2-brief-llm-removal`
**Worktree**: `/Users/john/code/arete/.claude/worktrees/phase-8-followup-2-brief-llm-removal`
**Plan**: `dev/work/plans/arete-v2-chef-orchestrator/phase-8-followup-2-brief-llm-removal/plan.md`
**Date**: 2026-05-27

---

## Pre-flight

| Check | Result |
|-------|--------|
| Branch matches `worktree-phase-8-followup-2-brief-llm-removal` | PASS |
| `git log` includes `5ffece78` (plan), `a9db035e` (8f1), `f717b26f` (P8 merge) | PASS |
| `plan.md` + `pre-mortem.md` present in plan dir | PASS |
| `node_modules/@arete/core` symlinked | PASS |

No halt conditions triggered.

---

## Step 2 — R-grep findings (CRITICAL for go/no-go)

Per pre-mortem R1 (kitchen-sink payload risk), audited all consumers before deletion.

### `grep -rn "synthesizeBriefing" packages/ apps/ docs/`

| File | Type | Disposition |
|------|------|-------------|
| `packages/core/test/services/intelligence-brief.test.ts` | test | **Delete file** (AC2) |
| `packages/core/dist/services/intelligence.d.ts` + `.js` | dist | Rebuild (AC dist) |
| `packages/core/src/services/intelligence.ts` | **src — target** | Remove (AC2) |
| `packages/core/src/services/LEARNINGS.md` | doc | Mark superseded |
| `packages/cli/dist/commands/intelligence.js` | dist | Rebuild |
| `packages/cli/src/commands/intelligence.ts` | **src — target** | Remove (AC1) |
| `packages/cli/src/commands/LEARNINGS.md` | doc | Mark superseded |

### `grep -rn "\.synthesis\|\.synthesized\|\.truncated"`

| File | Notes |
|------|-------|
| `packages/core/test/services/area-memory.test.ts:698` | UNRELATED — `RefreshAreaMemoryResult.synthesis` from Phase 7b; left intact |
| `packages/core/test/services/intelligence-brief.test.ts` | Deleted with the test file |
| `packages/cli/test/commands/brief.test.ts` | Rewritten (AC1 test extension) |
| `packages/cli/dist/.../intelligence.js`, `packages/cli/src/.../intelligence.ts` | Target — removed |

### `grep -rn "synthesis\|synthesized" packages/runtime/.claude`

Empty.

### `find . -name ".claude" -type d`

Empty (no generated `.claude/commands/*.md` in this worktree — those live in target workspaces, not in repo).

### `grep "brief --for" packages/runtime/skills/`

Two hits, both in `_authoring-guide.md`. Updated as part of AC4.

### Go/No-Go

**No non-test consumers surfaced** outside the two target files. Safe to proceed. No escalation triggered.

---

## AC by AC

### AC1 — Remove LLM-synthesis branch from `arete brief`

**Commit**: `1b5a1bb9` — `phase-8-followup-2(cli): remove brief --for LLM-synthesis branch (AC1)`

- Deleted from `packages/cli/src/commands/intelligence.ts:822-937`:
  - `useAI` branch + `synthesizeBriefing` call (lines ~868-887)
  - Synthesis-vs-raw display logic (lines ~914-933)
  - `synthesized`, `truncated`, `synthesis` JSON fields
- Updated `.description()` to "Assemble raw context for a topic; downstream consumers apply judgment"
- **Per C1**: kept `--raw` as a hidden no-op (`.option('--raw', 'Deprecated: ...', false)`). Logs a one-line stderr note `"(--raw is now the only mode; flag accepted for backward compat)"` when flag is passed.
- Rewrote `packages/cli/test/commands/brief.test.ts` to assert:
  - Raw output in both JSON and non-JSON modes (always)
  - JSON shape includes `{success, task, confidence, assembledAt, contextFiles, memoryResults, entities, gaps, raw}`
  - `synthesized` / `synthesis` / `truncated` fields are **absent**
  - `--raw` flag still accepted (no-op) and returns raw
  - `--for` required error path unchanged
- Updated `cli/src/commands/LEARNINGS.md` to mark prior pattern (2026-04-12) as superseded.

**Test**: 5 tests, all pass (13.5s).

**Deviations from plan**: None.

### AC2 — Remove `synthesizeBriefing` from IntelligenceService

**Commit**: `6328a846` — `phase-8-followup-2(core): remove synthesizeBriefing service (AC2)`

- Deleted from `packages/core/src/services/intelligence.ts`:
  - `synthesizeBriefing` method (~32 lines)
  - `BRIEF_MAX_CONTEXT_CHARS`, `BRIEF_SYNTHESIS_PROMPT` constants
  - `AIService` type import (no longer needed)
  - `SynthesizedBriefing` type import
- Removed `SynthesizedBriefing` type from `packages/core/src/models/intelligence.ts`
- Removed re-export from `packages/core/src/models/index.ts`
- Deleted `packages/core/test/services/intelligence-brief.test.ts` entirely (263 lines — file was exclusively `synthesizeBriefing` tests)
- Confirmed no service re-exports (`grep` empty in `services/index.ts` and `core/src/index.ts`)
- Updated `core/src/services/LEARNINGS.md` to mark the method-parameter-DI entry as superseded.

**Test**: `intelligence.test.ts` 49 tests pass (no synthesizeBriefing assertions remain).

**Deviations**: None.

### AC3 — Update skill-command generator comment

**Commit**: `0939d5af` — `phase-8-followup-2(core): clarify skill-commands generator comment (AC3)`

- Emit-line unchanged in `packages/core/src/generators/skill-commands.ts:22`: still `arete brief --for "$ARGUMENTS" --skill ${skill.id} --json`.
- Updated surrounding comment + emitted instruction text:
  - "First, run the briefing to gather raw context:" (was "First, run the briefing:")
  - "Use the raw context to inform the skill workflow; filter to what the skill needs." (was "Present the briefing results, then proceed with the skill workflow.")
- Added inline TS comment in source explaining the raw-only model.
- Updated `packages/core/test/generators/skill-commands.test.ts` to assert new text.

**Test**: 9 tests pass.

**Deviations**: None.

### AC4 — review-plan SKILL.md + docs

**Commit**: `970234ec` — `phase-8-followup-2(runtime,docs): review-plan + docs for raw-only brief (AC4)`

**AC4 finding (load-bearing for review)**: review-plan/SKILL.md was **already neutral** — no mention of LLM-synthesized briefing anywhere in the file. Per C3 (load-bearing concern), did the **short-addition** path, not the broader rewrite.

- `packages/runtime/skills/review-plan/SKILL.md`: added one paragraph at top of `## Workflow` section explaining that:
  - `requires_briefing` returns raw context, not synthesis
  - Review should anchor on the plan/PRD/completed work itself (not the briefing)
  - Memory hits, entity relationships, gaps are usually noise for reviews
  - "Don't make the briefing the lens; the artifact under review is the lens."
- `packages/runtime/skills/_authoring-guide.md`:
  - Recipe 2 (Full Briefing): clarified output is raw context, no LLM synthesis, agent filters
  - `requires_briefing: true` table row: updated to "Triggers the generated slash command to emit `arete brief --for "$ARGUMENTS"` before the skill workflow / Agent gathers raw assembled context (not synthesized) and applies judgment"
  - Tip below table: clarified `arete brief` is raw-context-assembly only
- `packages/runtime/GUIDE.md`: updated Briefing Assembly section to specify "raw briefing ... No LLM synthesis is performed."
- `packages/runtime/skills/README.md`: had **no synthesis-specific reference** to brief; no change needed.

**Test**: No new tests; docs/SKILL.md changes are content-only.

**Deviations**: None (chose short-addition path per C3 since SKILL.md was neutral; reported as required).

---

## AC5 — Full test sweep

All per-file `tsx --test` invocations, no `npm test` at root.

| File | Tests | Pass |
|------|-------|------|
| `packages/cli/test/commands/brief.test.ts` (post-AC1 rewrite) | 5 | 5 |
| `packages/core/test/services/intelligence.test.ts` | 49 | 49 |
| `packages/core/test/generators/skill-commands.test.ts` | 9 | 9 |
| `packages/core/test/services/chef-orchestrator-skills.test.ts` | (bundle) | PASS |
| `packages/core/test/services/topic-memory.test.ts` | (bundle) | PASS |
| `packages/core/test/services/meeting-frontmatter.test.ts` | (bundle) | PASS |
| `packages/core/test/services/commitments.test.ts` | (bundle) | PASS |
| `packages/core/test/services/tasks.test.ts` | (bundle) | PASS |
| `packages/core/test/services/entity.test.ts` | (bundle) | PASS |
| `packages/core/test/services/area-memory.test.ts` | (bundle) | PASS |
| **Core regression bundle subtotal** | **460** | **460** |
| `packages/cli/test/commands/commitments.test.ts` | (bundle) | PASS |
| `packages/cli/test/commands/areas.test.ts` | (bundle) | PASS |
| `packages/cli/test/commands/people.test.ts` | (bundle) | PASS |
| `packages/cli/test/commands/search.test.ts` | (bundle) | PASS |
| `packages/cli/test/commands/status.test.ts` | (bundle) | PASS |
| **CLI regression bundle subtotal** | **123** | **123** |

**Total: 646 tests, 646 pass, 0 fail.**

Note: `packages/core/test/services/intelligence-brief.test.ts` was deleted in AC2 (was 263 lines, all synthesizeBriefing — no tests remain to preserve).

---

## Dist rebuild

**Commit**: `58ee6c43` — `phase-8-followup-2(dist): rebuild after AC1-AC4`

`npm run build` succeeded (3.14s for web app; all packages built). 16 dist files changed (CLI command, core service, core models, generator, web `dist/AGENTS.md`).

---

## AC6 — Ledger (actual vs estimate)

```
git diff 5ffece78..HEAD --shortstat -- ':!**/dist/**' ':!dist/**'
13 files changed, 54 insertions(+), 480 deletions(-)
```

**Net: -426 LOC (non-dist).**

- Plan estimate: ~-205
- Reviewer suggestion: ~-275 to -325
- **Actual: -426**

**Why bigger than estimate**: the plan estimate likely under-counted the deletion of `intelligence-brief.test.ts` in full (263 lines is the single biggest contributor) and the rewrite of `brief.test.ts` from synthesis-heavy fixtures to a leaner raw-output suite (-100 / +35 ≈ -65 net). Reviewer's wider band already anticipated this; actual is just outside.

Per-file breakdown (excluding dist):

```
packages/cli/src/commands/LEARNINGS.md             |   2 +-
packages/cli/src/commands/intelligence.ts          |  58 +----    (~-50)
packages/cli/test/commands/brief.test.ts           | 100 ++----   (~-65)
packages/core/src/generators/skill-commands.ts     |   9 +-       (+5)
packages/core/src/models/index.ts                  |   1 -
packages/core/src/models/intelligence.ts           |  13 -
packages/core/src/services/LEARNINGS.md            |   2 +-
packages/core/src/services/intelligence.ts         |  65 -----    (~-60)
packages/core/test/generators/skill-commands.test.ts|  5 +-       (+3)
packages/core/test/services/intelligence-brief.test.ts | 263 --- (-263)
packages/runtime/GUIDE.md                          |   2 +-
packages/runtime/skills/_authoring-guide.md        |  12 +-
packages/runtime/skills/review-plan/SKILL.md       |   2 +
```

---

## Commits (chronological)

| Hash | Subject |
|------|---------|
| `5ffece78` | (plan) phase-8-followup-2 plan + pre-mortem (APPROVE WITH MINOR) |
| `1b5a1bb9` | phase-8-followup-2(cli): remove brief --for LLM-synthesis branch (AC1) |
| `6328a846` | phase-8-followup-2(core): remove synthesizeBriefing service (AC2) |
| `0939d5af` | phase-8-followup-2(core): clarify skill-commands generator comment (AC3) |
| `970234ec` | phase-8-followup-2(runtime,docs): review-plan + docs for raw-only brief (AC4) |
| `58ee6c43` | phase-8-followup-2(dist): rebuild after AC1-AC4 |

---

## Open questions for meta / eng-lead

1. **Hidden no-op `--raw` lifespan**: how long do we keep the backward-compat flag? Suggest a 1-2 cycle soak then full removal in a future cleanup (separate from this phase to keep changes bounded). Plan to revisit in Phase 9 cleanup pass?
2. **Cost-tier route for `brief`**: the `'brief'` AITask entry in `services.ai.getTierForTask()` (referenced in the deleted test at line 253) is now an orphan — there are no `'brief'` tier callers. Should it be removed in a separate AI-tier-cleanup commit, or left until the next AI-config audit? Left intact in this phase to keep scope tight (no ai.ts changes here).
3. **Skill-side filtering guidance**: review-plan SKILL.md now tells the skill to filter the briefing, but other skills with `requires_briefing: true` (e.g., week-plan, create-prd, meeting-prep) get the same raw payload. Consider a broader pass that adds skill-by-skill filtering guidance — out of scope here.
4. **brief tier routing test artifact**: the deleted test had `tier = aiService.getTierForTask('brief'); assert.equal(tier, 'standard')` — that assertion was already inside a synthesizeBriefing test. No replacement test was added (no consumer remains). If `'brief'` tier routing is independently load-bearing, a dedicated test in `ai.test.ts` could pin it.

No blockers; phase complete.
