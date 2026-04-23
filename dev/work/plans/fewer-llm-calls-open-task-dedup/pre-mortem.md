## Pre-Mortem: Reduce extraction LLM cost + fix open-task duplication

### Risk 1: Backend extraction path (`agent.ts`) not updated in parallel

**Problem**: `packages/apps/backend/src/services/agent.ts:177-356` has a parallel extraction pipeline (used when the web app triggers extraction) that builds its own `callLLM` bound to `deps.aiService.call('extraction', ...)` and passes that same `callLLM` to `batchLLMReview` on line 356. The plan only mentions `packages/cli/src/commands/meeting.ts`. Shipping the CLI fix alone means:
- Web-triggered extractions continue paying Opus on the review pass (cost fix only half-applied).
- Web-triggered extractions don't get the new open-task dedup (correctness bug still live for the web path).
- The "Files touched" list omits this file entirely — a subagent following the plan verbatim would skip it.

**Mitigation**: Extend step 1 to explicitly list `packages/apps/backend/src/services/agent.ts:177-356`. Create a second `callLLMReconciliation` wrapper there (bound to `'reconciliation'`) and pass it to `batchLLMReview` on line 356. Extend step 2/4 to load open tasks before line 248 and pass them through the existing `processMeetingExtraction` options object. Also update `reconciledCount` logging (line 273-275) — today it counts only `'reconciled'`; if `'existing-task'` is added as a new source it needs to be counted too or the log becomes misleading.

**Verification**: `grep -n "services.ai.call\|deps.aiService.call" packages/apps/backend/src/services/agent.ts` should show both `'extraction'` and `'reconciliation'` callers. `grep -n "completedItems\|openTasks" packages/apps/backend/src/services/agent.ts` should show an `openTasks` load mirroring the completed-items block at lines 228-243.

---

### Risk 2: Backend frontmatter parser strips `'existing-task'` silently

**Problem**: `packages/apps/backend/src/services/workspace.ts:356-373`'s `parseStagedItemSource` has a hardcoded allowlist: `if (val === 'ai' || val === 'dedup') { result[key] = val; }`. Values outside that set (including the existing `'reconciled'` value!) are silently dropped. That means today, reconciled items in the CLI-written frontmatter already lose their source when read by the web app — items fall back to `'ai'` via the `?? 'ai'` on lines 441/453/458. Adding `'existing-task'` will hit the exact same silent-drop. Because the drop is silent and falls back to `'ai'`, there is NO runtime error — the skipped-with-matched-text UI just never renders. The plan's step 5 only mentions updating the web app, not this backend parser.

**Mitigation**: Expand the allowlist in `workspace.ts:366` to `val === 'ai' || val === 'dedup' || val === 'reconciled' || val === 'existing-task'`, and widen the return type on line 356 from `Record<string, 'ai' | 'dedup'>` to the full union. Also fix the latent `'reconciled'` bug while here (this is a pre-existing bug the plan will surface). Add a test in `packages/apps/backend/test/services/workspace.test.ts` asserting all four source values round-trip through `parseStagedItemSource`.

**Verification**: Write a unit test with frontmatter `staged_item_source: { ai_001: 'existing-task', ai_002: 'reconciled' }` and assert both values survive. Also manually confirm in the real meeting file that `staged_item_source: ai_XXX: existing-task` reaches the web UI without being stripped.

---

### Risk 3: Three web-side type aliases must stay in sync

**Problem**: The `source` enum is hardcoded as a TypeScript string literal union in exactly three locations, with no shared type:
- `packages/apps/web/src/api/types.ts:324` (`StagedMemoryItem.source`)
- `packages/apps/web/src/api/types.ts:412` (different shape, same union)
- `packages/apps/web/src/api/meetings.ts:44` (`RawStagedItem.source`)
- Plus `packages/apps/backend/src/routes/review.ts:29` (`StagedMemoryItem` on the server)

Missing any one of these produces a compile error in strict mode, or worse, `never` narrowing at consumption sites (`ReviewItems.tsx:80,87`) that silently hide the new badge. The plan says "search for existing values" but doesn't enumerate the four places, so a subagent may miss one.

**Mitigation**: Step 5 should explicitly list these four file:line pairs. Consider introducing a shared `type StagedItemSource = 'ai' | 'dedup' | 'reconciled' | 'existing-task'` in one location (likely `packages/core/src/integrations/staged-items.ts` or `models/`) and have backend/web types import it. At minimum, update all four sites in the same commit.

**Verification**: `grep -rn "'ai' | 'dedup' | 'reconciled'" packages/` should return zero results after the change (all replaced with the extended union or a shared alias). Run `npm run typecheck` across root to catch any missed narrowing.

---

### Risk 4: `callLLM` param signature doesn't need to change, but call-site refactor can regress the main path

**Problem**: The question "does `batchLLMReview`'s callLLM param surface need to change" is answered NO: `batchLLMReview` takes `callLLM: (prompt: string) => Promise<string>` and is agnostic to which tier produced it. But the call-site refactor in `meeting.ts` is subtle. The main extraction path uses `callLLM` at line 782; the review path uses the same `callLLM` at line 909. Introducing a second variable name `callLLMReconciliation` is fine, but a hasty find/replace could accidentally change line 782's extraction call to reconciliation, silently demoting the entire extraction tier from Opus to Sonnet — which produces plausible-looking but lower-quality extractions that are hard to detect without A/B comparison.

**Mitigation**: Keep the variable name `callLLM` for the original (extraction) wrapper and add a distinct `callLLMReconciliation` for the new one. Do NOT do a find/replace. Explicitly leave line 782's call to `extractMeetingIntelligence` using `callLLM` (extraction tier). Only pass `callLLMReconciliation` to `batchLLMReview` on line 909, and its analog in `agent.ts:356`. Add a unit test that mocks `services.ai.call` and asserts the extraction path received `'extraction'` exactly once and the review path received `'reconciliation'` exactly once.

**Verification**: Test double for `services.ai.call` tracks `(task, prompt)` tuples. After running extract with `--reconcile`, assert the call log contains `['extraction', ...]` for the main extraction and `['reconciliation', ...]` for the review — not the reverse.

---

### Risk 5: Jaccard 0.6 threshold produces noisy false positives at 145-task scale

**Problem**: `DEFAULT_RECONCILE_JACCARD = 0.6` (meeting-processing.ts:96) was tuned for completed items (typically 5-15 per week). With 145 open tasks, the comparison surface grows 10-20×. At 0.6, short tasks with common stopwords ("review the document", "update the spreadsheet") can match by shared function words even after `normalizeForJaccard`. Because the plan says "skipped" (not deleted) and argues users can un-skip in the UI, the harm is bounded — but a noisy false-positive rate will erode trust in the dedup mechanism and train users to stop checking skipped items.

**Mitigation**: Either (a) use a stricter threshold for open-task matching (e.g. 0.7, matching `DEFAULT_DEDUP_JACCARD`) since open tasks are less likely to be abbreviated than completed check marks, or (b) require a minimum token count on both sides (e.g. ignore matches where either side has < 4 meaningful tokens after normalization) to defuse stopword-dominated matches. Add a test asserting "send the report" does NOT match "review the report" at the chosen threshold. Document the chosen threshold and rationale in the `ProcessingOptions` jsdoc.

**Verification**: Add test cases covering (a) real meeting-action paraphrases of open tasks → match, (b) tasks that share only stopwords (e.g. "update X spreadsheet" vs "review Y spreadsheet" where X≠Y are distinct topics) → no match. Manually run against the user's actual 145-task workspace in `arete-reserv-test` before shipping and count false positives in staged output.

---

### Risk 6: `reconciliation` tier unset throws mid-extraction with partial side effects

**Problem**: If a workspace has `ai.tiers.standard` unset (user removed it or never set it), `AIService.getModelForTier('standard')` throws (ai.ts:162-178) with a clear message. But the throw happens at `callLLMReconciliation` invocation time inside `batchLLMReview`, which is AFTER:
- The main extraction has already completed (paying Opus cost).
- Reconciliation has run (line 825-828 in meeting.ts).
- `processMeetingExtraction` has run (line 858).

The existing try/catch around `batchLLMReview` at line 919-923 catches ALL errors including this config-error and logs only "Batch LLM review skipped due to error" without surfacing WHICH tier is missing. User wastes an Opus extraction, gets a vague warning, no guidance on the fix.

**Mitigation**: Option A (minimal): In the catch block at line 919-923, inspect the error message for "tier" and surface it distinctly (e.g. `warn(\`Batch LLM review skipped: ${msg}\`)` unconditionally rather than a generic message). Option B (better): Check `ai.tiers.standard` is set upfront in the extract command's early-check block (meeting.ts:507-518 region) when `--reconcile` is passed, and fail-fast with actionable guidance before any LLM call happens. Note that framework defaults in `config.ts:32` set `reconciliation: 'standard'` but do NOT set `tiers.standard` to any model — so a workspace with no AI config at all will hit this. Document this in the plan's "Risks" section.

**Verification**: Integration test with a stub config where `ai.tiers = { frontier: 'claude-opus-4-7' }` (no standard). Run `arete meeting extract --reconcile` and assert either (a) early failure with "set ai.tiers.standard" message, or (b) extraction completes, review is skipped, and the warning message includes "tier" and "standard".

---

### Risk 7: Open-task parser duplication with `tasks.ts`'s existing `parseTaskLine`

**Problem**: Step 3 proposes extracting a shared parser into `packages/core/src/utils/` (which does not exist — core has `src/utils/` under a different module, and utilities typically live under `packages/core/src/services/utils/`). But `packages/core/src/services/tasks.ts:134` already has `parseTaskLine` that handles `- [ ] text @tag(value)` including metadata stripping via `parseMetadata`. Creating a new parser under a new directory both duplicates logic that already exists AND creates a second "canonical" home for task parsing, which is the exact drift risk step 3 is trying to prevent.

**Mitigation**: Either:
(a) Use the existing `TaskService.listTasks({ completed: false })` in `tasks.ts:328` — it already parses open tasks from week.md and tasks.md, strips metadata, and returns structured `WorkspaceTask` objects. Extract `.text` for Jaccard comparison. This also gets proper metadata handling for free.
(b) If the dependency on `TaskService` is too heavy for the CLI extract path, extract ONLY the currently-inlined `meeting-context.ts:909-922` logic into a small helper in `packages/core/src/services/utils/` (the directory that exists) and have both `meeting-context.ts` AND the new call site use it. Do NOT create `packages/core/src/utils/`.

The plan should state explicitly which option it picks. Right now step 3 invents a directory that doesn't exist and ignores `tasks.ts`.

**Verification**: `ls packages/core/src/utils/` either returns existing utilities or errors (directory doesn't exist). `grep -rn "TASK_LINE_PATTERN\|- \\\\[ \\\\]" packages/core/src` should return one canonical parser after the change, not multiple.

---

### Risk 8: Tests for completed-items path miss `'existing-task'` ordering semantics

**Problem**: Step 4 says "Open-task matching runs **after** the completed-items check so a completed match wins if both hit." This is a subtle tie-breaking rule that's easy to implement wrong during refactor. The existing test at `packages/core/test/services/meeting-processing.test.ts` likely doesn't exercise the ordering dimension because `'existing-task'` doesn't exist yet. A future change to meeting-processing.ts that inverts the check order would pass all current tests but change semantics silently (completed and open task both match → source should be `'reconciled'`, not `'existing-task'`).

**Mitigation**: Add an explicit test case titled something like "when both completed and open task match, reconciled (completed) wins". Provide a fixture where the SAME meeting action item matches BOTH a completed check in week.md AND an open `- [ ]` line in tasks.md. Assert `stagedItemSource[id] === 'reconciled'`, not `'existing-task'`. Also assert `stagedItemMatchedText[id]` points at the completed text, not the open one.

**Verification**: Run the new test. Then invert the order of checks in `meeting-processing.ts` locally and confirm the new test fails.

---

### Risk 9: `MAX_EXISTING_TASKS = 20` cap in prompt + uncapped post-filter creates inconsistent behavior

**Problem**: `meeting-context.ts:908` caps prompt tasks at 20 so LLM sees a short list. The new post-filter (plan step 2: "no cap — local matching is cheap") sees all 145. If the LLM produces an action item duplicating open task #50 (not in prompt), the post-filter catches it and skips it. That's the intended behavior. But if the LLM produces an action item for open task #50 DESPITE the hint system — and the post-filter misses it (Jaccard below threshold) — the user sees a staged item that duplicates a task they already have, but now they ALSO lost the prompt-based protection. Net: marginal regression in the "long tail" of the open-task list.

This is also an issue for the plan's acceptance criteria for step 2: "no cap (local matching is cheap)" means the post-filter loops over potentially hundreds of open tasks × extracted items. At ~20 extracted items × 145 tasks × token normalization, this is still fast, but worth measuring.

**Mitigation**: (a) Accept this as marginal and document in the plan — step 2 should say "Open tasks beyond the prompt's MAX=20 are still dedup'd via Jaccard post-filter." (b) Add a perf test or benchmark noting the expected O(N*M) comparison. (c) The "out of scope" bullet about raising `MAX_EXISTING_TASKS` is probably less important now that the post-filter catches the tail — this should be called out explicitly.

**Verification**: Benchmark `processMeetingExtraction` with 145 open tasks × 20 extracted items. Target: < 50ms total. If slower, consider caching tokenized open tasks across meetings.

---

## Summary

Total risks identified: 9
Categories covered: Context Gaps, Integration, Scope Creep, Code Quality, Reuse / Duplication, Dependencies, State Tracking, Test Patterns, Documentation

**Ready to proceed with these mitigations?**
