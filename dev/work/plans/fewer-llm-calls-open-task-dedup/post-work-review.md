# Post-Work Review: fewer-llm-calls-open-task-dedup

**Reviewer**: senior-engineer role per `.pi/agents/reviewer.md` (grumpy mindset)
**Branch**: `worktree-fewer-llm-calls-open-task-dedup`
**Worktree**: `/Users/john/code/arete/.claude/worktrees/fewer-llm-calls-open-task-dedup`
**Commits reviewed**: 4 (bb56fd1d, a6c29a4b, f51a410d, 35a099b9)
**Diff against main**: 44 files, +1348 / -92 LOC

---

## Verdict

**REVISE BEFORE MERGE** — three material blockers plus two process gaps.

The implementation is genuinely strong in scope coverage and self-awareness about limitations. The author correctly routed `batchLLMReview` to the reconciliation tier in both CLI and backend, widened the ItemSource union with an honest forward-compat slot for `slack-resolved`, and caught the latent `'reconciled'` silent-drop bug with a dedicated regression test and E2E round-trip.

But three shippability issues block merge, the most serious of which contradicts the commit messages' "pre-existing failures" claim.

---

## Step 0: File Deletion Review

`git diff HEAD --name-status main..HEAD | grep '^D'` → **no deletions**. N/A.

---

## Step 1: Technical Review

| Check | Result |
|-------|--------|
| `.js` imports (NodeNext) | Pass (verified in `meeting.ts`, `agent.ts`, `workspace.ts`, `common.ts`) |
| No `any` types | Pass (new code uses `ItemSource`, `ProcessingOptions`, `ItemOwnerMeta` typed correctly) |
| Proper error handling | Pass (fail-fast emits structured JSON in `--json` mode; graceful degradation preserved) |
| Tests for happy path + edge cases | Pass in isolation; **fails integration — see Blocker 1** |
| Backward compatibility | **FAILS — see Blocker 2** (CLI `skipped` JSON shape changed from boolean to object) |
| Follows project patterns | Pass |
| Respects LEARNINGS.md | **FAILS — see Blocker 3** (LEARNINGS.md not updated after regression fix) |

---

## Step 2: AC Review — Per-Step Verification

### Step 1: Reconciliation-tier routing + `reconciledCount` log
- ✅ `callLLMReconciliation` declared in both `meeting.ts:799` and `agent.ts:186`.
- ✅ Passed to `batchLLMReview` at `meeting.ts:941` and `agent.ts:381`.
- ✅ Test `agent.test.ts:1275-1298` asserts `extractionCalls === 1 && reconciliationCalls === 1 && total === 2`. Strong.
- ✅ `agent.ts:291-303` now separates `reconciledCount` and `existingTaskCount` and logs distinct events. Matches C6 refinement.

### Step 2: Fail-fast on missing `tiers.standard`
- ✅ CLI check at `meeting.ts:539-547` — gated on `opts.reconcile`, after `loadConfig`.
- ✅ Backend check at `agent.ts:511-523` — uses `moduleAiService.getModelForTask('reconciliation')` probe (more robust than raw tier-map check).
- ⚠️ **Ordering bug**: CLI fail-fast runs at line 539 BEFORE the `effectiveImportance === 'skip'` early-return at line 729. This breaks the pre-existing test `--reconcile with --importance skip still skips early` (see Blocker 1). The step-2 AC said "Without `--reconcile`, behavior unchanged" but failed to consider the `--reconcile + --importance skip` combination, where no LLM call will happen anyway.

### Step 3: Widen `parseStagedItemSource` allowlist
- ✅ `workspace.ts:356-392` uses `VALID_ITEM_SOURCES` driven by the shared union (`isItemSource` guard).
- ✅ Defensive validation on unknown strings/non-strings tested at `workspace.test.ts:39-54`.
- ✅ Explicit regression test for 'reconciled' at `workspace.test.ts:94-111`.
- ✅ Step 8b E2E integration test at `workspace.test.ts:122-217` asserts every source value survives the full read path through `getMeeting()`. Closes the latent-drop bug class.

### Step 4: `ItemSource` consolidation
- ✅ Canonical `ItemSource` moved to `packages/core/src/models/common.ts:22` with full jsdoc enumerating values + sync-with-web comment.
- ✅ Re-exported from `services/meeting-processing.ts:24` for backward compat.
- ✅ `models/integrations.ts:7` imports from `common.js`.
- ✅ `routes/review.ts` migration (visible in commit a6c29a4b).
- ✅ `item-source-compat.test.ts` uses `satisfies readonly ItemSource[]` exhaustiveness + runtime `deepEqual`. Matches orchestrator refined AC precisely.
- ✅ Web UI badge added to `ReviewItems.tsx:103-117` with correct label "already tracked as a task".
- ⚠️ **Minor gap**: `packages/apps/backend/test/routes/review.test.ts:47` still has inline `source?: 'ai' | 'dedup' | 'reconciled';` — the step-4 grep AC limits to `/src/` so this is not a formal violation, but it's a stale fixture type that will drift.

### Step 5: `getOpenTasks` helper + load paths
- ✅ Pure helper at `utils/agenda.ts:87-100` — no service deps, `@tag(value)` stripped via regex.
- ✅ CLI loads `tasks.md` alongside `week.md` at `meeting.ts:879, 884-887`.
- ✅ Backend loads identically at `agent.ts:247, 253-256`.
- ✅ `agenda.test.ts:222-316` covers 11 cases: filter `[x]`/`[ ]`, tag stripping, nesting, empty-after-strip, co-existence with `getCompletedItems`, divergence from `getUncheckedAgendaItems`.

### Step 6: Jaccard post-filter + threshold unification
- ✅ `DEFAULT_RECONCILE_JACCARD = 0.7` (was 0.6); `MIN_MATCH_TOKENS = 4` on both sides.
- ✅ Ordering completed → open enforced at `meeting-processing.ts:408-452`.
- ✅ 9 new test cases in `meeting-processing.test.ts:1399-1585` covering: exact match, near-paraphrase match, stopword-dominated rejection, min-token guard, tie-breaking precedence, custom threshold, empty/undefined openTasks, short-candidate rejection.
- ✅ Explicit "DOES NOT catch synonym-level semantic duplicates" test at line 1450 documents the known limitation with a hook for later embedding work.

### Step 7: Per-source observability
- ✅ CLI `skipped: { reconciled, existingTask, slackResolved }` at `meeting.ts:1008-1020`.
- ✅ Human-readable summary at `meeting.ts:1076-1083`.
- ✅ Backend per-source log events at `agent.ts:292-303`.
- ✅ `agent.test.ts:1249-1273` asserts the "already tracked as open tasks" event fires.
- ❌ **Backward-compat break**: `skipped` JSON field changed semantics. Previously a boolean (`true` on `importance: skip` early-exit); now an object in the normal path. Two shapes in one API. See Blocker 2.

### Step 8: Regression + E2E + benchmark + manual QA
- ✅ 8a unit regression: covered by the 9 openTasks tests.
- ✅ 8b E2E: `workspace.test.ts:122-217` — fully validates the round-trip.
- ✅ 8c manual-qa.md: proper template with explicit commands, observation checklist, known-limitation flag at top. Not yet filled in — acceptable because the template is Step 8c's deliverable; the actual run is a separate human step.
- ✅ 8d benchmark: `meeting-processing.test.ts:1564-1584` at 145×20 with 500ms ceiling, `t.diagnostic` for drift tracking.
- ⚠️ **Pre-mortem spot-check**: benchmark synthesizes "distinct-content" open tasks (`Open task ${i} with distinct identifying content token ${i}`), which is the easy-case scenario — Jaccard computations exit early with low similarity. A more realistic stress case would include tasks that overlap but don't match (common stopwords + different nouns, as flagged in the user's pressure-test question). Current runtime is 3-4ms because the worst case isn't exercised. Not a blocker — 500ms is a generous ceiling — but the benchmark's protective value is lower than advertised.

---

## Pre-Mortem Mitigation Verification (spot-check 4 of 9 risks)

### Risk 1: Backend extraction path parallel update
`grep -n "callLLMReconciliation" packages/apps/backend/src/services/agent.ts` → declaration at 186, usage at 381. `grep -n "openTasks" packages/apps/backend/src/services/agent.ts` → loaded at 241/253-256, passed at 269. **Mitigated.**

### Risk 2: Backend frontmatter silent drop
`workspace.ts:356-362` uses `VALID_ITEM_SOURCES` driven by typed const. `workspace.test.ts:94-111` is the explicit regression test (previously ran → returned undefined before fix, returns 'reconciled' after). **Mitigated.**

### Risk 4: callLLM renaming hazard
`meeting.ts:790-792` keeps `callLLM` → `'extraction'`; new `callLLMReconciliation` → `'reconciliation'` at line 799-802. `extractMeetingIntelligence` at line 807 still uses `callLLM`; `batchLLMReview` at line 938-942 uses `callLLMReconciliation`. Discipline preserved. **Mitigated.**

### Risk 5: Jaccard 0.6 → 0.7 stopword false positives
`DEFAULT_RECONCILE_JACCARD = 0.7` + `MIN_MATCH_TOKENS = 4` on both sides (`meeting-processing.ts:119, 125`). Tests at line 1475 (stopword) and 1488 (min-token rejection at perfect Jaccard) cover the specific risk. **Mitigated.**

### Risk 6: Tier-missing mid-extraction throw
Fail-fast in CLI at `meeting.ts:539-547` and backend at `agent.ts:511-523`. Both run before extraction. **Mitigated** (with caveat on importance-skip ordering — Blocker 1).

All 4 spot-checked risks have code-level evidence. No gaps found.

---

## Orchestrator AC Refinement Verification

1. ✅ Step 1 regex/string capture (not snapshot): `agent.test.ts:1291-1297` uses `filter(...).length` assertions — not snapshot.
2. ✅ Step 4 `item-source-compat.test.ts` exists with `satisfies readonly ItemSource[]` pattern.
3. ✅ Step 6 unified 0.7 threshold: `meeting-processing.ts:119` const = 0.7.
4. ✅ Step 8d benchmark under 500ms: `meeting-processing.test.ts:1579` ceiling enforced.
5. ✅ Step 8b E2E exists: `workspace.test.ts:122-217`.

All 5 folded refinements honored.

---

## Step 5: Quality Gates

### Typecheck
`npm run typecheck` → **passes** (tsc clean).

### Tests
`npm test` → **2989 pass, 12 fail, 2 skipped out of 3003 total**.

Of the 12 failures, 9 are pre-existing (verified against `f7cbb703` release baseline via clean clone):
- 6 in `packages/core/test/services/person-memory-integration.test.ts` (parsing-based action-item extraction regressions — pre-existed)
- 1 in `packages/cli/test/commands/view.test.ts` (server/SIGINT — pre-existed)
- 1 integration test (`context + brief seeded journey` — pre-existed)
- 3 in `packages/apps/backend/test/services/agent.test.ts` (dedup/boundary/priorItems — pre-existed)

**But 3 are NEW failures introduced by this plan** (verified by running the same test files on `f7cbb703` — all pass there):

1. `packages/cli/test/commands/meeting-extract.test.ts:1124` — `CLI flag overrides frontmatter importance`
2. `packages/cli/test/commands/meeting-extract.test.ts:1269` — `--reconcile flag is accepted without error at option parsing`
3. `packages/cli/test/commands/meeting-extract.test.ts:1320` — `--reconcile with --importance skip still skips early`

**This contradicts the commit message claim** ("pre-existing test failures… not addressed here"). See Blocker 1 below.

### Dist files
**Uncommitted CLI dist changes are present**:
```
M packages/cli/dist/commands/commitments.js
M packages/cli/dist/commands/meeting.js
M packages/cli/dist/index.js
(plus maps)
```

The plan's source changes to `packages/cli/src/commands/meeting.ts` (fail-fast guard, `callLLMReconciliation`, `openTasks` load, new `skipped` object shape, per-source summary) are not reflected in the committed `packages/cli/dist/*`. Per `.pi/standards/build-standards.md:27-36` and the MEMORY.md entry "Always commit dist/ build artifacts; users install from GitHub directly": this blocks merge. See Blocker 3.

---

## BLOCKERS

### Blocker 1: Three new CLI test failures caused by the implementation

**Evidence**:
- Baseline `f7cbb703`: `packages/cli/test/commands/meeting-extract.test.ts` passes 44/44.
- Worktree HEAD: `packages/cli/test/commands/meeting-extract.test.ts` is 42/45 (new test `errors early when --reconcile is used without ai.tiers.standard` is one of the new ones and passes; three others now fail).

**Failure 1 — `CLI flag overrides frontmatter importance`** (line 1124):

Caused by Step 7's breaking API change to the `skipped` field. The test does NOT use `--reconcile`; it sets `importance: skip` in frontmatter and passes `--importance normal`. The CLI flag override works correctly in terms of behavior — extraction proceeds — but the test assertion `assert.ok(!result.skipped, ...)` now fails because `skipped` is no longer `undefined` on the non-skipped path; it's `{reconciled: 0, existingTask: 0, slackResolved: 0}`, which is truthy.

**Failure 2 — `--reconcile flag is accepted without error at option parsing`** (line 1269):

The test's workspace fixture has only `tiers.fast` configured — no `standard`. The new fail-fast fires with the expected error message: ``--reconcile requires `ai.tiers.standard`…``. The pre-existing test assertion `assert.ok(!result.error?.includes('--reconcile'))` was written to exclude "unknown option" errors; it now incorrectly excludes the legitimate new fail-fast error. The test fixture needs `tiers.standard` added.

**Failure 3 — `--reconcile with --importance skip still skips early`** (line 1320):

This is the most serious of the three — a genuine behavior regression, not just a test-fixture mismatch. When `--reconcile --importance skip` is passed together, the test expects `code === 0 && result.skipped === true` because importance=skip should short-circuit before any LLM machinery. But the Step-2 fail-fast at `meeting.ts:539-547` runs BEFORE the effectiveImportance resolution at line 706-726. Ordering:
1. `loadConfig` (line 531)
2. **Fail-fast on `--reconcile` + missing `tiers.standard`** (line 539) ← exits 1
3. (never reached) Resolve importance → short-circuit on 'skip' (line 729)

A user who explicitly says "skip this meeting entirely" while also passing `--reconcile` as a global flag (e.g. in a batch loop) now gets exit code 1 instead of a clean skip. No LLM call would have happened regardless, so the fail-fast is firing spuriously.

**Required fix**: resolve effective importance and short-circuit `importance === 'skip'` BEFORE the `--reconcile` fail-fast check. Or: gate the fail-fast on `opts.reconcile && effectiveImportance !== 'skip'`. Either preserves the cost protection (user wouldn't pay Opus anyway on a skipped meeting) and restores the documented behavior.

---

### Blocker 2: CLI `skipped` JSON field has two incompatible shapes

**Current state**:
- `meeting.ts:743` (importance-skip early-return path): `skipped: true` (boolean)
- `meeting.ts:1033` (normal extract path): `skipped: { reconciled, existingTask, slackResolved }` (object)

A downstream consumer (e.g. `arete-reserv` shell scripts, the `skill` batch runner, `jq '.skipped' /tmp/extract-out.json` in the author's own `manual-qa.md:49`) cannot use `skipped` polymorphically without runtime type-checking. The manual-qa checklist at line 50 even documents the object shape, which would fail silently if run on a skip-importance meeting.

**Required fix**: pick one shape. Options:
- (a) Always emit `{reconciled, existingTask, slackResolved}`; rename the importance-skip boolean to `skippedEntire: true` or the existing `reason: 'importance: skip'` is already the discriminator.
- (b) Rename the new per-source tally to something else (`skipSummary`, `skippedBySource`) and keep `skipped` as a boolean meaning "was the whole meeting skipped".

Whichever is picked, update:
- `meeting-extract.test.ts:1124-1156` (assertion `!result.skipped`)
- `meeting-extract.test.ts:1320-1333` (assertion `result.skipped === true`)
- `manual-qa.md:49-51` (expected-shape comment)

---

### Blocker 3: Missing dist commits + missing LEARNINGS.md updates

**3a. CLI dist files not committed.**

`git status` shows 7 unstaged CLI dist files after `npm run build`:
```
M packages/cli/dist/commands/commitments.js
M packages/cli/dist/commands/commitments.js.map
M packages/cli/dist/commands/meeting.d.ts.map
M packages/cli/dist/commands/meeting.js
M packages/cli/dist/commands/meeting.js.map
M packages/cli/dist/index.js
M packages/cli/dist/index.js.map
```

The 4 worktree commits only rebuilt `packages/core/dist/*`. Per build-standards.md and the explicit MEMORY entry "Always commit dist/ build artifacts; users install from GitHub directly": users who `npm i github:user/arete-repo` on main after this merges will get source changes (fail-fast, openTasks load, new skipped field) without the corresponding compiled dist, meaning the installed CLI binary will NOT have the fix.

**Required fix**: `npm run build`, then commit `packages/cli/dist/*` (and any backend/web dist changes). Preferably in a trailing `build: rebuild dist` commit or as amendments to the source commits.

**3b. LEARNINGS.md not updated after latent-bug fix.**

Step 3 fixed a pre-existing latent bug (`parseStagedItemSource` hardcoded allowlist dropped `'reconciled'` silently for months). This is textbook regression knowledge that must be captured. Per reviewer.md Step 3.7: "If the developer fixed a bug or regression, did they update the nearest LEARNINGS.md? **Block approval if missing.**"

Candidate LEARNINGS locations:
- `packages/apps/backend/src/services/LEARNINGS.md` (doesn't exist yet; create it with this entry)
- Or `packages/core/src/services/LEARNINGS.md` (exists; add entry about the `ItemSource` consolidation + fallback-to-'ai' gotcha)

The plan itself even anticipates this in step 6: *"Rationale note for LEARNINGS.md: if any test surprises by failing at 0.7 when it passed at 0.6, document as a false-positive fix (not a regression)."* Nothing was written.

**Required fix**: add a LEARNINGS entry documenting the hardcoded-allowlist bug pattern (why the parser had it, why it silently dropped values, the `ItemSource` + `isItemSource` defensive pattern as the fix).

---

## Follow-ups for post-merge (not blocking)

1. **Benchmark realism** (Step 8d): synthesize open tasks that share stopwords with candidate extraction items so the 145×20 loop exercises actual Jaccard computations, not early-exit cases. Current 3-4ms is misleading.
2. **Stale test-mock type** at `packages/apps/backend/test/routes/review.test.ts:47`: mock `MockStagedItem.source` still uses inline `'ai' | 'dedup' | 'reconciled'`. Not load-bearing (it's a test fixture) but will drift.
3. **Synonym limitation** is well-documented in jsdoc, test, and manual-qa. Follow-on plan (embedding or LLM-judge pass) tracked in `slack-evidence-dedup` / `computed-topic-memory` plans — good.
4. **Sync-comment drift risk**: the web-side `types.ts` and `meetings.ts` only have `// Keep in sync with @arete/core ItemSource` style comments. If a future contributor adds a 6th ItemSource value and forgets the web side, the runtime `deepEqual` in `item-source-compat.test.ts` catches it. Defense-in-depth adequate.

---

## Notable strengths

- **Honest about the known limitation**: the synonym-level semantic duplicate case (the user's original LEAP complaint) is flagged in jsdoc, a dedicated test with a "flip to assert" hook (`meeting-processing.test.ts:1450-1462`), and at the top of `manual-qa.md`. This is the right level of honesty for a rule-based shim.
- **E2E integration test closing the bug class** (`workspace.test.ts:122-217`): the latent `'reconciled'` drop existed precisely because no test exercised the full pipe. The fix ships with a test that would have caught the original bug. Exemplary.
- **Tuple-capture test for tier routing** (`agent.test.ts:1275-1298`): asserts `extractionCalls === 1 && reconciliationCalls === 1 && total === 2` with a regression comment explaining the Opus-on-review-pass bug being closed. High-signal test.
- **Forward-compat `'slack-resolved'`**: plumbed through all 5 consolidation sites plus the frontmatter parser plus the backend→response pipe, even though no producer exists yet. Follow-on plan won't need to re-churn the type surface.

---

## Devil's advocate one-liner

*If this feature fails in production, it will be because a user runs a batch-skip command (`arete meeting extract … --reconcile --importance skip`) on a workspace that happens to lack `tiers.standard`, hits the spurious fail-fast exit(1), and loses confidence that `--importance skip` means what it says — all while no LLM call was ever needed.*

---

## Summary

| Dimension | Status |
|-----------|--------|
| AC coverage | ✅ All 8 plan steps implemented; refinements honored |
| Technical quality | ⚠️ Correct in concept; JSON shape regression in Step 7 |
| Test quality | ⚠️ Strong new coverage; 3 pre-existing tests broken, not acknowledged |
| Pre-mortem mitigations | ✅ All 4 spot-checked risks have code-level evidence |
| Typecheck | ✅ Pass |
| Test suite (full) | ❌ 3 new failures + 9 pre-existing |
| Dist committed | ❌ CLI dist uncommitted |
| LEARNINGS.md | ❌ Not updated after latent-bug fix |

**Verdict: REVISE BEFORE MERGE**. Fix the importance-skip ordering (Blocker 1, Failure 3), pick a consistent `skipped` JSON shape and update the 3 broken tests (Blocker 2), commit CLI dist (Blocker 3a), and add LEARNINGS entry (Blocker 3b). Estimated work: 60-90 minutes.
