# Phase 9 Followup-6 Build Report

**Built**: 2026-06-05
**Scope**: Jaccard cross-session stance dedup + per-meeting cap 3 → 5 (Task A) + full test verification across recent work (Task B). Code only — no LLM calls against arete-reserv, no production data writes.

## Task A — Commits

| SHA | Description |
|---|---|
| `ecc2cc39` | `phase-9-followup-6(core): Jaccard cross-session stance dedup (was exact-string)` — replaces exact `topic.toLowerCase():direction` key with token-level Jaccard similarity, threshold 0.7, direction-scoped, first-occurrence wins. Adds 21 new tests in `entity.test.ts`. |
| `c03561ca` | `phase-9-followup-6(core,prompt): per-meeting stance cap 3 → 5` — raises both the prompt instruction ("AT MOST 5", "Maximum 5", "yields 5 is exceptional") and the parser-level `slice(0, 5)`. Updates 2 existing cap tests in `person-signals.test.ts` (now asserting cap=5, with 7- and 9-stance fixtures). |

## Files changed — Task A

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/src/services/entity.ts`

- Added 3 new exports + 1 const:
  - `normalizeStanceTokens(text: string): Set<string>` — lowercase, replace non-alphanumeric with space, split on whitespace, drop tokens of length ≤ 2 (filters stopword-ish "by", "of", "on", "a", "an").
  - `stanceJaccardSimilarity(a: Set<string>, b: Set<string>): number` — `|intersection| / |union|`, returns 0 for two empty sets.
  - `dedupeStancesByJaccard(stances, threshold = 0.7): PersonStance[]` — iterates stances in order, computes token set on `topic`, compares against previously-kept stances of the **same direction**, drops the new one if any Jaccard ≥ threshold. Uses a per-direction map of token sets so the inner loop only compares against direction-matched candidates.
  - `STANCE_JACCARD_DEDUP_THRESHOLD = 0.7` named const so callers + tests reference the same number.
- `EntityService.refreshPersonMemory` (around line 1547): the old `for (const stance ...) seenStanceKeys.add(key)` block replaced with a single call to `dedupeStancesByJaccard(rawStances)`. Comment updated to call out the followup-6 rationale (semantic re-wordings across meetings missed by exact-string dedup).

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/test/services/entity.test.ts`

- Added import block at top: `normalizeStanceTokens`, `stanceJaccardSimilarity`, `dedupeStancesByJaccard`, `STANCE_JACCARD_DEDUP_THRESHOLD` from the entity module, plus `type PersonStance` from person-signals.
- New suites at end of file (+199 lines, 21 tests across 3 describe blocks):
  - **`normalizeStanceTokens`** (4 tests) — lowercase, drop ≤2-char tokens, dedup via Set, hyphen→space (no token concatenation).
  - **`stanceJaccardSimilarity`** (5 tests) — identical=1, disjoint=0, both-empty=0, one-empty=0, intersection/union spot check.
  - **`dedupeStancesByJaccard`** (10 tests) — default threshold 0.7, first-occurrence stable (oldest source.md wins), high-Jaccard same-direction → dedup, low-Jaccard different domains → keep, same-topic different-direction → keep (direction scoping), threshold boundary exactly 0.7 → DROP (≥), boundary 0.69 → KEEP, chain comparison against all kept stances (not just last), empty input → empty output, identical topic across all 3 directions → all 3 kept.

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/src/services/person-signals.ts`

- `buildStancePrompt()` body — 3 text changes:
  - `"Output a MAXIMUM of 3 stances ... A meeting that yields 3 is exceptional"` → `"Output AT MOST 5 stances ... A meeting that yields 5 is exceptional"`
  - `"Maximum 3 stances ... pick the 3 most distinctive"` → `"Maximum 5 stances ... pick the 5 most distinctive"`
  - `"A meeting that yields 3 is exceptional"` (second occurrence) → `"A meeting that yields 5 is exceptional"`
  - `"Most meetings should yield 0-2"` left unchanged (distribution shape unchanged, only the ceiling moves).
- `parseStanceResponse()` exit: `stances.slice(0, 3)` → `stances.slice(0, 5)`, comment updated to reference followup-6 lineage.

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/test/services/person-signals.test.ts`

- Block comment above `parseStanceResponse — Proposal C invariants` suite updated from "Hard-cap of 3" → "Hard-cap of 5" with the yield-too-low rationale.
- `hard-caps output at 3 stances even when LLM returns 5` → renamed to `hard-caps output at 5 stances even when LLM returns 7`; fixture grown to 7 stances; assertions check positions 0-4 survive.
- `validation runs before slice: dropped stances do not count toward the cap` — fixture grown from 3 valid + 3 invalid → 6 valid + 3 invalid; assertions check the cap of 5 trims `valid-6` (the cap still applies, slice still happens after validation).

### Dist rebuilds

- `packages/core/dist/services/entity.{js,d.ts,.map}` — picks up the 4 new exports + dedupeStancesByJaccard call site.
- `packages/core/dist/services/person-signals.{js,.map}` — picks up the prompt text + slice change. `.d.ts` is unchanged because no public types moved.

## Per-file test status (Task A) — pass / fail / total

| File | Pass | Fail | Tests |
|---|---|---|---|
| `packages/core/test/services/entity.test.ts` | 41 | 0 | 41 |
| `packages/core/test/services/person-signals.test.ts` | 54 | 0 | 54 |

## Task B — Full verification across tonight's work

Per-file `tsx --test` results (no `npm test`).

### Phase 9 followup-1 — Proposal C stance prompt

| File | Pass | Fail | Tests |
|---|---|---|---|
| `packages/core/test/services/person-signals.test.ts` | 54 | 0 | 54 |
| `packages/core/test/services/person-memory-unit.test.ts` | 67 | 0 | 67 |

### Phase 10a-pre — createdAt + restore + R4 + lockfile + callConcurrent + baseline (commits `4e0dc6d0` `567a4db9` `6880a281` `885956c2` `fa59ec0d` `5ec5fa7b`)

| File | Pass | Fail | Tests |
|---|---|---|---|
| `packages/core/test/services/migrations/add-created-at.test.ts` (commit `4e0dc6d0`) | 9 | 0 | 9 |
| `packages/cli/test/commands/commitments.test.ts` (commit `567a4db9`) | 36 | 0 | 36 |
| `packages/core/test/services/commitments-counterparty-overlap.test.ts` (commit `6880a281`) | 21 | 0 | 21 |
| `packages/core/test/services/commitments-withlock.test.ts` (commit `885956c2`) | 8 | 0 | 8 |
| `packages/core/test/services/ai-call-concurrent.test.ts` (commit `fa59ec0d`) | 5 | 0 | 5 |
| `packages/core/test/services/commitments.test.ts` (touched in `49733df7` review fixes) | 111 | 0 | 111 |

Note: commit `5ec5fa7b` added baseline fixtures + measurement script — no new test file.

### Phase 10a-pre review fixes (commit `49733df7`)

Touched 3 files, all listed above (commitments-counterparty-overlap, commitments-withlock, commitments). Re-run via the same files.

### Phase 10 followup-2 — chef-mutates-staged-status (7 commits ending at `6b157ba3`)

| File | Pass | Fail | Tests |
|---|---|---|---|
| `packages/core/test/integrations/chef-skip-e2e.test.ts` (commit `6b157ba3`) | 4 | 0 | 4 |
| `packages/core/test/services/chef-skip-directives.test.ts` (commit `9f2ac7b4`) | 21 | 0 | 21 |
| `packages/core/test/services/chef-orchestrator-skills.test.ts` (commit `012453f9`) | 154 | 0 | 154 |
| `packages/core/test/integrations/staged-items.test.ts` (commits `9bc07d87` + `fcf084b7`) | 63 | 0 | 63 |
| `packages/core/test/services/chef-skip-log.test.ts` (commit `e704049e`) | 6 | 0 | 6 |
| `packages/core/test/services/meeting-lock.test.ts` (commit `0462ef5c`) | 8 | 0 | 8 |

### Task A — this session

| File | Pass | Fail | Tests |
|---|---|---|---|
| `packages/core/test/services/entity.test.ts` | 41 | 0 | 41 |
| `packages/core/test/services/person-signals.test.ts` | 54 | 0 | 54 |

(entity.test.ts is exclusive to Task A in this list; person-signals.test.ts appears under both Phase 9 followup-1 and Task A because both edited it — same file, same 54 passing tests.)

## Total

| Bucket | Tests | Pass | Fail |
|---|---|---|---|
| Phase 9 followup-1 | 121 | 121 | 0 |
| Phase 10a-pre (incl. review fixes) | 190 | 190 | 0 |
| Phase 10 followup-2 | 256 | 256 | 0 |
| Task A (entity.test.ts only; person-signals deduped with Phase 9) | 41 | 41 | 0 |
| **Total (deduped)** | **608** | **608** | **0** |

## Pre-existing failures

**None.** All 608 tests pass.

## Regressions caused by Task A

**None.** Task A only changes:
- The stance-dedup helper in `entity.ts` (replaces a local inline loop, semantics is "stricter or equal" — Jaccard at 0.7 collapses fewer pairs than… wait, actually broader: exact-string only caught literal `topic+direction` duplicates; Jaccard 0.7 catches additional near-restatements. No callers relied on exact-string behavior — `EntityService.refreshPersonMemory` is the sole call site.)
- The cap in `parseStanceResponse` (3 → 5) and 3 prompt-text strings. Tests that asserted cap=3 were updated to cap=5; no tests that should still pass at cap=3 remain.

Pre-existing `person-memory-unit.test.ts` and `entity.test.ts` upstream tests were re-run after Task A and continue to pass (121 / 121 and 41 / 41 respectively).

## Verification commands for the user

```bash
# Worktree root
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator

# Task A direct
npx tsx --test packages/core/test/services/entity.test.ts
npx tsx --test packages/core/test/services/person-signals.test.ts

# Full bucket from this report
npx tsx --test packages/core/test/services/person-signals.test.ts
npx tsx --test packages/core/test/services/person-memory-unit.test.ts
npx tsx --test packages/core/test/services/entity.test.ts
npx tsx --test packages/core/test/services/migrations/add-created-at.test.ts
npx tsx --test packages/cli/test/commands/commitments.test.ts
npx tsx --test packages/core/test/services/commitments-counterparty-overlap.test.ts
npx tsx --test packages/core/test/services/commitments-withlock.test.ts
npx tsx --test packages/core/test/services/ai-call-concurrent.test.ts
npx tsx --test packages/core/test/services/commitments.test.ts
npx tsx --test packages/core/test/integrations/chef-skip-e2e.test.ts
npx tsx --test packages/core/test/services/chef-skip-directives.test.ts
npx tsx --test packages/core/test/services/chef-orchestrator-skills.test.ts
npx tsx --test packages/core/test/integrations/staged-items.test.ts
npx tsx --test packages/core/test/services/chef-skip-log.test.ts
npx tsx --test packages/core/test/services/meeting-lock.test.ts
```

## Behavioral notes / caveats

### Threshold 0.7 is conservative for arbitrary paraphrases

The user-supplied motivating example —
- A: "product focus prioritization by revenue concentration"
- B: "product focus on dominant revenue line over full portfolio coverage"

— shares only 3 of 11 union tokens (`product`, `focus`, `revenue`), Jaccard ≈ 0.27, **below the 0.7 threshold**. The Jaccard layer catches near-restatements (one or two word substitutions) but NOT arbitrary paraphrases. The "5 semantic duplicates in Lindsay's 13" problem is partly addressable here (the verbatim or near-verbatim re-emissions) and partly an LLM-prompt-discipline problem (Proposal C is the layer for that).

This caveat is captured in the `dedupeStancesByJaccard` "semantic duplicates" test, which uses a deliberately tight pair ("engineering velocity over careful planning" vs "engineering velocity over planning") that does exceed 0.7. The test comment explicitly cites the Lindsay example pair and the 0.27 number.

If post-rebuild data shows the Jaccard layer still missing too many duplicates, follow-up options (NOT in scope here):
- Lower the threshold (0.5 or 0.6)
- Switch from token Jaccard to embedding cosine similarity
- Add a second pass at brief-assembly time that LLM-deduplicates the top-N

### Phase 10a in flight — touched files contained

Per invariant in the prompt, **none of `packages/core/src/models/entities.ts`, `packages/core/src/services/commitments.ts`, `packages/cli/src/commands/commitments.ts`, or files matching `packages/core/src/services/migration*.ts`** were edited by Task A. The `tsc` rebuild did regenerate `dist/` for Phase 10a's pending source edits (e.g. `dist/models/entities.{js,d.ts}` show diffs from Phase 10a Step 1's added `Stakeholder` type) — **those diffs were NOT staged into either Task A commit**. Only entity- and person-signals-scoped dist files were staged.

### Phase 10a Step 3 commit `3c6a2039` landed between Task A commits

While Task A was in progress, Phase 10a committed `phase-10a(core): extractCounterpartiesFromText parser (Step 3)` as `3c6a2039`. Task A's commits sit on top of it cleanly — no merge resolution needed because Task A's files (`entity.ts`, `entity.test.ts`, `person-signals.ts`, `person-signals.test.ts`) are disjoint from Phase 10a's edits.

## Exit condition

**Normal** — both commits land, all tests across the listed buckets pass (608 / 608), build report written.
