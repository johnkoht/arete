---
title: "Reduce extraction LLM cost + fix open-task duplication"
slug: fewer-llm-calls-open-task-dedup
status: building
size: medium
tags: [cli, core, backend, web, meetings, extraction, reconciliation, cost]
created: "2026-04-22T00:00:00.000Z"
updated: "2026-04-22T00:00:00.000Z"
completed: null
execution: "branch: worktree-fewer-llm-calls-open-task-dedup; 5 commits; awaiting manual QA + merge"
has_review: true
has_pre_mortem: true
has_prd: false
steps: 8
---

# Reduce extraction LLM cost + fix open-task duplication

## Goal

Cut per-meeting Opus usage during batch extraction and stop emitting action items that duplicate open tasks already tracked in `now/week.md` / `now/tasks.md`.

## Context

Two concrete problems observed on 2026-04-22 meetings in the `arete-reserv` workspace:

1. **`batchLLMReview` uses the extraction tier.** Both the CLI extract path (`packages/cli/src/commands/meeting.ts:774-777`, reused at `906-910`) and the backend agent path (`packages/apps/backend/src/services/agent.ts:177-356`) build a single `callLLM` bound to `'extraction'` and reuse it for the reconciliation review pass. John's workspace has `extraction: frontier` (Opus) and `reconciliation: standard` (Sonnet). Winddown runs ~5 parallel meetings → every run pays Opus on a review pass that was architected to be cheap.

2. **Open tasks in `week.md`/`tasks.md` are only a prompt hint.** `packages/core/src/services/meeting-context.ts:904-934` loads up to 20 unchecked tasks and injects them as an "Existing Tasks (do not duplicate)" block. There is no rule-based post-filter. With 145 open tasks, duplicates leak through. Example: `ai_002` ("Create testing spreadsheet for LEAP templates…") duplicated `week.md:76` ("Update LEAP testing assignment sheet…") — both were in the prompt, LLM missed the semantic match, nothing caught it.

The completed-items path in `packages/core/src/services/meeting-processing.ts:60-62` already has the right pattern (Jaccard-based match against `- [x]` items from week.md/scratchpad.md). We're extending it to cover open tasks.

### Pre-mortem + review mitigations embedded

Pre-mortem flagged 9 risks (`pre-mortem.md`). Reviewer then flagged 2 blockers + 6 significant concerns (`review.md`). Both sets are folded into the steps below.

Key revisions from review:
- **Slack-digest deferred** to follow-on plan `slack-evidence-dedup` (status: idea). Reviewer found 4/9 historical digests match the assumed `## Reconciliation Summary` schema; other 5 use variants. Data-shape investigation required before re-including. Shared `ItemSource` type keeps `'slack-resolved'` reserved as a forward-compat member so the follow-on plan doesn't re-churn the 5 type sites.
- **Type-sharing strategy**: option (e) — consolidate the core/cli/backend sites on the existing `ItemSource` type in `meeting-processing.ts:23`; keep the web side as a standalone duplicated union with a header comment and a backend-side compatibility assertion test. Reasoning: `packages/apps/web` has zero `@arete/*` deps today; adding `@arete/core` as a dep leaks server concepts into the Vite bundle. New `@arete/types` package is premature for a single string-literal union with 4 members.
- **Jaccard thresholds unified at 0.7** with min-4-tokens guard for both open and completed items (promoted completed from 0.6 per reviewer C2). The existing 0.6 jsdoc rationale ("week.md items are abbreviated") is weaker than expected at 145-task scale; stopword-dominated false positives dominate.
- **Open-task parser**: use a new pure `getOpenTasks(content)` helper in `packages/core/src/utils/agenda.ts`, mirroring the existing `getCompletedItems`. Reviewer C3: `TaskService.listTasks` does extra work (commitment resolution, area filtering) not needed here.

### Deferred to follow-on plans

- **Slack-digest evidence** → `slack-evidence-dedup` (stub at `dev/work/plans/slack-evidence-dedup/plan.md`). Depends on this plan landing first (shared type + post-filter infrastructure).
- **Computed topic/area memory layer** (single `getCompletionEvidence()` primitive; `.arete/memory/summaries/` as computed cache). Separate plan. Per MEMORY.md entry "L3 memory should be automated."
- **Semantic task dedup** (`semantic-task-dedup`, pending): catches synonym-level duplicates that Jaccard misses — e.g. "Create testing spreadsheet for LEAP templates" ≈ "Update LEAP testing assignment sheet" at Jaccard ≈ 0.17. Two candidate implementations: (a) embedding similarity + cosine distance on candidate pairs, (b) one batched `reconciliation`-tier LLM-judge call over unflagged action items (natural extension of `batchLLMReview`). Blocked on this plan landing (needs the shared type + post-filter seam). Natural fit inside `computed-topic-memory` if that plan activates first.
- **Populate `staged_item_matched_text` for cross-meeting reconciliation**: the Jaccard paths (completed-tasks, open-tasks) set `stagedItemMatchedText[id]` so the web UI tooltip explains *why* items are skipped. The cross-meeting path in `meeting.ts:914-921` (and `agent.ts` analog) only sets status + source, leaving `reconciled` items with no matched-text explanation in the UI. Small change, pure observability improvement, low-risk.
- Prompt tuning for decision/learning/action taxonomy.
- Raising / area-scoping `MAX_EXISTING_TASKS = 20`.
- Cross-invocation reconciliation-context cache for parallel winddown.

## Plan

1. **Route `batchLLMReview` to the `reconciliation` tier in BOTH extraction paths + fix `reconciledCount` log** — In `packages/cli/src/commands/meeting.ts` around line 774, keep the existing `callLLM` variable name bound to `'extraction'` (do NOT rename; avoids accidentally demoting the main path to Sonnet). Add a distinct `callLLMReconciliation` bound to `services.ai.call('reconciliation', prompt)`. Pass `callLLMReconciliation` to `batchLLMReview` at line 906-910 only. Mirror the same change in `packages/apps/backend/src/services/agent.ts:177-356`: add a second wrapper bound to `'reconciliation'`, pass to `batchLLMReview` on line 356. Also update `reconciledCount` / skipped-source aggregation around `agent.ts:273-285` so the summary count reflects the expanded source union (don't count only `'reconciled'`; also include `'existing-task'`).
   - Acceptance: Both extraction paths send `'extraction'` for the primary call and `'reconciliation'` for the review pass. `agent.ts` summary log counts skipped items by source accurately.
   - Verify: unit tests in both paths mock `services.ai.call` / `deps.aiService.call`, capture `(task, prompt)` tuples in a recorded array, assert **exactly one** `'extraction'` and **exactly one** `'reconciliation'` invocation per extract-with-reconcile run. `agent.ts` test uses regex/string capture against the existing `appended[]` pattern (consistent with `node:test` conventions in `packages/apps/backend/test/`) — NOT a snapshot test (no first-class snapshot API in `node:test`). Assert summary string matches `/existing-task:\s*\d+/` after extraction with at least one existing-task skip.

2. **Fail-fast on missing `standard` tier when `--reconcile` is requested** — In `meeting.ts` after config load but before the first LLM call (i.e., NOT the early-check block at 507-518 which runs before config — correction from prior plan draft) and the equivalent spot in `agent.ts`, when reconcile is enabled, verify `config.ai.tiers.standard` is set. If not, error with a clear actionable message: "`--reconcile` requires `ai.tiers.standard` to be set in arete.yaml. See `arete credentials configure`." Don't rely on catching the tier-missing error downstream in `batchLLMReview`'s generic catch block — by then the main Opus extraction has already run and cost has been paid.
   - Acceptance: workspace without `tiers.standard` and `--reconcile` → immediate error before any LLM call. Without `--reconcile`, behavior unchanged.
   - Verify: integration test with stub config `ai.tiers: { frontier: 'claude-opus-4-7' }` (no standard). Run `arete meeting extract --reconcile` → expect early exit with "standard" in the message.

3. **Fix the latent backend source-drop bug + extend allowlist** — In `packages/apps/backend/src/services/workspace.ts:356-373`, `parseStagedItemSource` currently has a hardcoded allowlist `val === 'ai' || val === 'dedup'`, which silently drops `'reconciled'` (pre-existing bug we inherit) and would drop the new `'existing-task'` (and future `'slack-resolved'`) values. Widen the allowlist to the full shared `ItemSource` union and widen the return type on lines 356/364 from `Record<string, 'ai' | 'dedup'>` to `Record<string, ItemSource>`. Import `ItemSource` from `@arete/core`. This step also stabilizes the `'reconciled'` badge in the web UI that is currently broken silently.
   - Acceptance: all five source values (`'ai'`, `'dedup'`, `'reconciled'`, `'existing-task'`, `'slack-resolved'`) survive the parser round-trip.
   - Verify: new unit test in `packages/apps/backend/test/services/workspace.test.ts`. Manual: a meeting file with `staged_item_source.ai_001: reconciled` renders the correct badge in the web UI after this change.

4. **Consolidate `ItemSource` on core/cli/backend; guard web-side duplicate** — Source enum lives in **6 sites** (not 4 as the earlier draft claimed):
   1. `packages/core/src/services/meeting-processing.ts:23` — canonical `ItemSource` type
   2. `packages/core/src/models/integrations.ts:36` — inline duplicate
   3. `packages/apps/backend/src/services/workspace.ts:356/364` — inline (handled by step 3)
   4. `packages/apps/backend/src/routes/review.ts:29` — inline duplicate
   5. `packages/apps/web/src/api/types.ts:324` — inline (web side)
   6. `packages/apps/web/src/api/types.ts:412` — inline (web side)
   7. `packages/apps/web/src/api/meetings.ts:44` — inline (web side)

   **Action**: (a) Extend canonical `ItemSource` to `'ai' | 'dedup' | 'reconciled' | 'existing-task' | 'slack-resolved'` in `meeting-processing.ts:23`. Keep `'slack-resolved'` with a jsdoc comment `// reserved for slack-evidence-dedup follow-on; no producer today`. (b) Update sites 2, 3, 4 to `import type { ItemSource } from '@arete/core'`. (c) Keep sites 5, 6, 7 (web) as standalone duplicates with header comment `// Keep in sync with @arete/core ItemSource`. (d) **Add the compatibility assertion test at `packages/apps/backend/test/services/item-source-compat.test.ts`** using the exhaustiveness pattern:
   ```ts
   import type { ItemSource } from '@arete/core';
   const expected = ['ai', 'dedup', 'reconciled', 'existing-task', 'slack-resolved'] as const;
   const _check: readonly ItemSource[] = expected satisfies readonly ItemSource[];
   // And a runtime assertion that the web-side literals (hard-coded here) match expected:
   const webLiterals: readonly string[] = ['ai', 'dedup', 'reconciled', 'existing-task', 'slack-resolved'];
   assert.deepEqual([...webLiterals].sort(), [...expected].sort());
   ```
   If a future change adds to `ItemSource` but not `expected`, the `satisfies` fails. If web drifts, the runtime assertion fails.
   - Web-side label mapping: `'existing-task'` → "Already tracked as a task"; `'slack-resolved'` → existing label can remain ("Resolved elsewhere") or empty until follow-on lands.
   - Acceptance: `grep -rn "'ai' | 'dedup' | 'reconciled'" packages/core packages/cli packages/apps/backend` returns zero inline duplicates (all import). Web sites have sync comment. `npm run typecheck` green across root. `item-source-compat.test.ts` passes.
   - Verify: compatibility assertion test passes; ReviewItems.tsx renders correct labels for `'existing-task'` (manual spot-check via `npm run dev` on the web app with a fixture meeting file).

5. **Add `getOpenTasks(content)` helper + load open tasks in both extraction paths** — In `packages/core/src/utils/agenda.ts`, add a new export `getOpenTasks(content: string): string[]` that mirrors the existing `getCompletedItems` at line 66 — parses `- [ ]` lines, strips `@tag(value)` metadata, returns clean text. In both `packages/cli/src/commands/meeting.ts` (~line 850, alongside the completed-items load) and `packages/apps/backend/src/services/agent.ts` (~line 228), read `week.md` + `tasks.md`, call `getOpenTasks` on each, concatenate. Pass as `openTasks: string[]` via `processMeetingExtraction` options.
   - Acceptance: open tasks loaded once per invocation, passed into processing regardless of `--reconcile` flag (same as completed-items behavior). Pure helper, no service dependency.
   - Verify: unit test for `getOpenTasks` covering tag-stripping, nested indentation, mixed `[x]/[ ]` (should only return `[ ]`). CLI test asserts processing options receive expected open-task list; backend test likewise. Existing `meeting-context.ts:909-922` open-task regex can optionally migrate to this helper for consistency (nice-to-have, not required).

6. **Add Jaccard post-filter for open tasks in `processMeetingExtraction` + unify threshold** — In `packages/core/src/services/meeting-processing.ts`, extend `ProcessingOptions` with `openTasks?: string[]`. Mirror the completed-items tokenization path. **Ordering**: completed-items check → open-task check. First match wins; source assigned accordingly (`'reconciled'` for completed, `'existing-task'` for open). Record matched text in `stagedItemMatchedText[id]`.
   **Threshold unification per reviewer C2**: promote `DEFAULT_RECONCILE_JACCARD` from 0.6 → **0.7** for BOTH completed AND open items. Add a **min-4-tokens guard** on both sides after `normalizeForJaccard`. Rationale (updated jsdoc): stopword-dominated false positives at the current 145-task scale make 0.6 too loose; symmetric behavior across completed/open avoids user confusion. If reviewers/users want the old 0.6 for completed items, expose it via `ProcessingOptions.reconcileJaccard` (already present) so workspaces can opt down.
   - Acceptance: new source value flows into frontmatter `staged_item_source`. Unique items unaffected. "send the report" vs "review the report" does NOT match at 0.7 + min-4-tokens.
   - Verify: unit tests covering (a) exact match → skipped, (b) paraphrase over threshold → skipped, (c) stopword-dominated near-match → NOT skipped, (d) unrelated → kept, (e) completed match wins when both completed AND open hit, (f) min-token-count guard rejects ≤3-token matches.
   - **Existing completed-items tests affected by the 0.6 → 0.7 threshold bump** (enumerated upfront so the dev knows the fallout before starting):
     - `packages/core/test/services/meeting-processing.test.ts:1213` — `'marks action item as skipped when matching completedItems (Jaccard ≥ 0.6)'` — test name must change to "≥ 0.7"; input `'Send auth doc to Alex soon'` vs `'Send auth doc to Alex'` yields Jaccard 5/6 = 0.833, still passes 0.7. Assertion unchanged.
     - `packages/core/test/services/meeting-processing.test.ts:1231` (vicinity) — `'does NOT mark action item when no match (Jaccard < 0.6)'` — test name must change to "< 0.7". Assertion unchanged.
     - Line 1260 (long-text match), 1308 (both completed+userNotes match precedence), 1366 (multiple items match), 1385 (multiple items same batch) — all use 5/6 = 0.833 cases that survive 0.7 threshold. Title/comment adjustments only.
     - Line 1342 — `'uses custom reconcileJaccard threshold when provided'` — test passes explicit `reconcileJaccard: 0.9` so unaffected by default bump.
   - **Rationale note for LEARNINGS.md**: if any test surprises by failing at 0.7 when it passed at 0.6, document as a false-positive fix (not a regression).

7. **Observability: per-source skip-count in CLI/backend output** — In both extract paths, after `processMeetingExtraction` completes, tally skipped items by source (`'reconciled'` vs `'existing-task'`) and emit in the JSON response + stderr summary. Format: `skipped: { reconciled: N, existingTask: M }`. For `agent.ts`, include in the summary log at ~lines 273-285 (modified by step 1). No feature flag — false positives are bounded (items are `skipped`, not deleted; user recovers in web UI).
   - Acceptance: `--json` output includes the per-source tally. Non-JSON output logs a one-line summary: `Skipped 3 items: 2 reconciled, 1 existing-task`.
   - Verify: CLI integration test inspects JSON output; snapshot test on summary string.

8. **Regression test + end-to-end integration test + manual QA** — Three sub-deliverables:

   **8a. Unit regression test** — Add a fixture-based test at `packages/core/test/services/meeting-processing.test.ts` that loads a meeting extraction result containing an action item matching a fixture week.md open task (LEAP testing spreadsheet) and asserts `stagedItemSource['ai_XXX'] === 'existing-task'`, `stagedItemStatus['ai_XXX'] === 'skipped'`, `stagedItemMatchedText['ai_XXX']` populated with the matched task text.

   **8b. End-to-end integration test (NEW — closes the latent-drop bug class)** — Add at `packages/apps/backend/test/services/workspace.test.ts` (or new file if cleaner) a test that: (i) writes a fixture meeting file to a temp dir with frontmatter `staged_item_source: { ai_001: 'existing-task', ai_002: 'reconciled', ai_003: 'ai' }`, (ii) runs backend's `parseStagedItemSource` + full frontmatter parse → HTTP response shape, (iii) asserts all three source values survive into the response payload. Rationale: the `'reconciled'` silent drop (fixed in step 3) existed precisely because no such test existed. This catches the bug class, not just one instance.

   **8c. Manual QA block** (explicit, not hand-wavy) —
   - **Workspace**: `/Users/john/code/arete-reserv-test` (NOT `arete-reserv` — don't overwrite real approvals).
   - **Command**: `arete meeting extract resources/meetings/2026-04-22-john-lindsay-11.md --stage --reconcile --clear-approved --json > /tmp/extract-out.json`
   - **Observations to record** (in `dev/work/plans/fewer-llm-calls-open-task-dedup/manual-qa.md`):
     - `jq '.skipped' /tmp/extract-out.json` — expected structure: `{ reconciled: N, existingTask: M }` (per step 7).
     - `grep -A 2 "staged_item_source:" resources/meetings/2026-04-22-john-lindsay-11.md` — LEAP testing action item should show `existing-task`.
     - AI usage log for this run — confirm review pass hit Sonnet (reconciliation tier), main extraction hit Opus (extraction tier).
   - **Spot-check 5 meetings in `arete-reserv` (real workspace, read-only — use `--dry-run`)** to count false positives on real data. Record in same `manual-qa.md`. Criterion: ≤ 1 false positive across 5 meetings is acceptable; ≥ 2 triggers threshold re-tuning.

   **8d. Benchmark** — `processMeetingExtraction` with 145 open tasks + 20 extracted items must complete in **< 500ms** (bumped from 50ms to reduce CI flakiness). Log actual value via `t.diagnostic(\`processing took \${ms}ms\`)` in the test so we can track drift. If consistently > 250ms, optimize (cache tokenized open tasks) — but don't block merge on 251-499ms.

   - Acceptance: 8a/8b unit+integration tests pass; 8c manual-qa.md exists with recorded observations; 8d benchmark < 500ms.
   - Verify: `npm run typecheck && npm test` green across root.

## Verification

- `npm run typecheck && npm test` green across root (packages/cli, packages/core, packages/apps/backend, packages/apps/web).
- Manual extract re-runs in both `arete-reserv-test` (safe) and `arete-reserv` (real) show correct source tagging and no false positives on 5 spot-checked meetings.
- No regression on web UI rendering of existing `'reconciled'` items — they should actually start rendering correctly now (step 3 fixes the latent drop).
- Cost sanity check: spot-check one `--reconcile` run's AI usage log to confirm review pass hits Sonnet (reconciliation tier), main extraction hits Opus (extraction tier). This is the primary observability signal for step 1's cost-fix correctness.

## Risks (mitigations)

- **Jaccard false positives at 145-task scale** → 0.7 unified threshold + min-4-tokens guard (step 6).
- **Threshold change regresses existing completed-items tests** → step 6 acceptance explicitly requires reviewing each shift; items that "fail" at 0.7 are false-positive fixes, not regressions. Document in LEARNINGS.md if any surprising.
- **Backend extraction path drift** → steps 1, 5 explicitly update `agent.ts` in parallel.
- **Silent frontmatter drop** → step 3 widens allowlist; fixes latent `'reconciled'` bug too.
- **Enum fragmentation** → step 4 consolidates core/cli/backend; web-side guard test catches drift.
- **Web↔core dep** → option (e) avoids adding `@arete/core` to web; keeps Vite bundle clean.
- **Mid-extraction tier-missing throw** → step 2 fail-fast before any LLM call.
- **Wrong parser** → step 5 uses new pure helper `getOpenTasks` in `utils/agenda.ts`; no `TaskService` dependency.
- **Ordering regression** → step 6 tests explicitly cover tie-breaking.
- **Cap mismatch (prompt 20 / post-filter uncapped)** → documented; covered by post-filter.
- **Silent cost regression** → step 7 observability surfaces skip counts; tier verification via manual usage-log spot-check in Verification section.

## Out of scope

- Slack-digest evidence (deferred to `slack-evidence-dedup` plan).
- Computed topic/area memory layer (`getCompletionEvidence()` primitive + `.arete/memory/summaries/` population).
- Prompt tuning for decision/learning boundary.
- Raising / area-scoping `MAX_EXISTING_TASKS = 20`.
- Cross-invocation reconciliation-context cache for parallel winddown.
- Extracting `@arete/types` package. Revisit when shared-type surface exceeds 3-5 types.
- Updating `packages/runtime/skills/process-meetings/SKILL.md` batch example to use `--reconcile`. Doc-only follow-on.

## Files touched

- `packages/cli/src/commands/meeting.ts` — second callLLM, fail-fast, load open tasks, per-source skip log (~60 LOC)
- `packages/apps/backend/src/services/agent.ts` — same as CLI; plus `reconciledCount` log update (~60 LOC)
- `packages/apps/backend/src/services/workspace.ts` — allowlist fix + type widening (~5 LOC)
- `packages/apps/backend/src/routes/review.ts` — import shared `ItemSource` (~3 LOC)
- `packages/core/src/services/meeting-processing.ts` — `ItemSource` union widened, `openTasks` option + matching logic, threshold bump to 0.7 + min-token guard (~60 LOC)
- `packages/core/src/models/integrations.ts` — import shared `ItemSource` (~3 LOC)
- `packages/core/src/utils/agenda.ts` — new `getOpenTasks` export (~20 LOC)
- `packages/core/src/services/meeting-context.ts` — optional migration from inline regex to `getOpenTasks` (~5 LOC, nice-to-have)
- Web-side types (unchanged duplicate, adds sync comment): `packages/apps/web/src/api/types.ts`, `packages/apps/web/src/api/meetings.ts` (~3 LOC total)
- Web-side labels: label-mapping site (~3 LOC)
- Tests: `packages/cli/test/commands/meeting-extract.test.ts`, `packages/core/test/services/meeting-processing.test.ts`, `packages/core/test/utils/agenda.test.ts`, `packages/apps/backend/test/services/workspace.test.ts`, `packages/apps/backend/test/services/agent.test.ts`, new compatibility assertion test
