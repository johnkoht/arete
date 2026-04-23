# Review: Reduce extraction LLM cost + fix action-item duplication across tasks & slack

**Type**: Plan
**Audience**: Builder (affects Areté CLI + backend + web — end-user-facing behaviors, but work lives in internal packages)
**Review Path**: Full (8 steps, ≥4 package boundaries, architectural decision: shared `StagedItemSource` type)
**Complexity**: Medium
**Recommended Track**: `standard` — full /ship flow

---

## Summary Verdict

**Revise** — blockers on slack-digest assumption and type-location; several significant concerns that materially change the shape of steps 4 and 6.

The plan is well-structured and the pre-mortem caught most of the load-bearing risks. But the pre-mortem missed four things that the evidence makes obvious, and those four things matter enough to send back for revision:

1. **The `## Reconciliation Summary` section is present in only 4 of 9 recent digests.** The whole step 6 primary-path will silently no-op for ~50% of days.
2. **The "exactly four files" claim in step 4 is wrong.** There are at least six duplication sites, and the type-location chosen by the plan has a dependency problem (`packages/apps/web` does not depend on `@arete/core`).
3. **A shared `ItemSource` type already exists** at `packages/core/src/services/meeting-processing.ts:23` and is already barrel-exported. The plan proposes creating a "new" shared type — it should extend the existing one in place and avoid naming churn.
4. **The threshold asymmetry (0.6 completed / 0.7 open+slack) is not justified in the plan.** The pre-mortem recommended either a stricter threshold OR min-token count, the plan adopts both — but then leaves completed at 0.6 with no rationale. This is exactly the kind of "two values for the same concept" drift that will bite later.

Everything else is a significant-concern or nit.

---

## Blockers (must address before approval)

### B1. Slack-digest schema is drifting too fast to depend on `## Reconciliation Summary` alone

**Severity**: Blocker for step 6.

Pre-mortem risk #5 ("slack-digest schema drift") is listed in the plan's risks section as mitigated by "fixture test covers all three sub-sections; graceful skip if section missing." But the **sampling evidence** is worse than the pre-mortem assumed:

| Digest | Has `## Reconciliation Summary` | Sub-sections present |
|--------|-------------------------------|----------------------|
| 2026-04-09 | Yes | `### Week Tasks Updated`, `### Commitments Resolved`, `### Commitments Added` (no "Waiting On") |
| 2026-04-13 | **No** | `## Conversations Processed`, `## Commitments Summary`, `## Signals` |
| 2026-04-14 | Yes | `### Week Tasks Updated`, `### New Tasks Added`, `### Waiting On Updated`, `### Commitments Added (7)`, `### Waiting On Added (4)` |
| 2026-04-15 | **No** | `## Task Updates`, `## Commitments Resolved`, `## Commitments Updated`, `## New Commitments`, `## Decisions`, `## Learnings`, `## People Signals`, `## Waiting On Updates` |
| 2026-04-16 | **No** | (older flat structure) |
| 2026-04-17 | **No** | `## Action Items Applied`, `## People Signals`, `## Notes` |
| 2026-04-20 | Yes | `### Week Tasks Updated`, `### Commitments Resolved`, `### Commitments Added`, `### Waiting On Cleared` |
| 2026-04-21 | **No** | (flat structure) |
| 2026-04-22 | Yes | `### Week Tasks Updated`, `### Commitments Resolved`, `### Waiting On Added`, `### Not Added (already resolved via other channels)` |

Only **4 of 9** digests have the exact `## Reconciliation Summary` header the plan assumes. The sub-section headings in those 4 digests also vary: `### Commitments Added` sometimes has a count suffix (`(7)`), sometimes doesn't; `### Waiting On Added` vs `### Waiting On Cleared` vs `### Waiting On Updated` are different semantic buckets.

What this means for step 6:
- Silent gap: on ~56% of days the post-filter gets zero slack evidence — users will still see the duplicated action items the plan promises to skip. The feature will appear to "work" on the days the loader happens to find a header and fail quietly on the other days. Worst outcome: the dedup is attributed to the Jaccard threshold, not the missing data, so the user chases the wrong knob.
- The plan's "graceful skip if section missing" IS the regression, not the mitigation.

**Required change**: Step 6 must either:
- **(a) Broaden the loader scope**: parse `### Commitments Resolved`, `### Week Tasks Updated`, `### Task Updates`, `### Action Items Applied`, `### Commitments Summary` as equivalent "completion evidence" sources regardless of whether they're nested under `## Reconciliation Summary` or at the top level. Treat any top-level `## ` or nested `### ` section whose name contains "Resolved" | "Updated" | "Completed" | "Applied" as a source.
- **(b) Explicitly scope down**: drop slack-digest from this plan and move it to a follow-on that can also stabilize the digest producer. Keep open-task dedup (step 5/7 without slack) in this plan.

Either is acceptable; silently shipping a feature that works on half the inputs is not. Add an assertion-style unit test that loads the 9 real digest samples from `arete-reserv` (copied as fixtures) and asserts the loader extracts completion evidence from at least 8/9 — this is the only way to keep the loader honest when the digest schema drifts again.

**Bonus finding**: digests also sometimes carry per-commitment IDs like `` `fd38fa2c` `` in the Commitments Resolved section (see 2026-04-22). This is an exact-match key that can dedup even when Jaccard wouldn't (a commitment ID is a cryptographic hash of the normalized commitment text — so if an extraction produces new text for the same underlying commitment, Jaccard might miss it but the commitment ID comparison could catch it). The plan's "out of scope — Commitments service deep integration" bullet dismisses this, arguing the text form is enough — but that's only true if the slack-digest's IDs are accompanied by text AND the text matches the meeting's action item at Jaccard ≥ 0.7. When it doesn't, you'll miss the exact same commitment that has both IDs in view. Worth adding: if a slack-resolved entry carries a commitment ID, ALSO load the commitment's `text` from `CommitmentsService` and dedup against that. Cost: one extra `listResolved()` call — and `CommitmentsService` is already on `services`.

---

### B2. `StagedItemSource` location needs a real answer, not "meeting-processing.ts"

**Severity**: Blocker for step 4.

The plan says: *"Create a shared `type StagedItemSource = 'ai' | 'dedup' | 'reconciled' | 'existing-task' | 'slack-resolved'` in `packages/core/src/services/meeting-processing.ts`."*

Three problems:

**(a)** The type already exists there as `ItemSource` (line 23, `packages/core/src/services/meeting-processing.ts`) AND is already barrel-exported from `packages/core/src/services/index.ts:75`. The plan's acceptance criterion — *"grep returns zero matches for the string literal"* — can be satisfied today by extending the existing `ItemSource` in place. There is no reason to introduce a *new* `StagedItemSource` name alongside `ItemSource`; that just creates two names for the same thing and a follow-on naming migration.

Evidence:
```bash
$ grep -rn "'ai' | 'dedup' | 'reconciled'" packages/
packages/core/src/models/integrations.ts:36             # duplication #1
packages/core/src/services/meeting-processing.ts:23    # the canonical type
packages/core/src/services/meeting-processing.ts:81    # jsdoc only (OK)
packages/apps/web/src/api/types.ts:324                  # duplication #2
packages/apps/web/src/api/types.ts:412                  # duplication #3
packages/apps/web/src/api/meetings.ts:44                # duplication #4
packages/apps/backend/src/routes/review.ts:29          # duplication #5
packages/apps/backend/test/routes/review.test.ts:47    # duplication #6
```

The plan says "exactly four files". It's **six** sites (five files, plus a test). The plan will leave `packages/core/src/models/integrations.ts:36` (`StagedItem.source`) un-migrated because it's not in the list. That's the same kind of silent drop as pre-mortem risk #3.

**(b)** `packages/apps/web` does not currently depend on `@arete/core` (checked `packages/apps/web/package.json`; backend does, web does not). Putting the shared type in core means:

- Option 1: add `@arete/core` to `packages/apps/web` dependencies. This is non-trivial — core pulls a lot of Node-only code (fs, path, pi-ai, pi-coding-agent, gray-matter, yaml) that a Vite browser bundle won't digest cleanly. The plan doesn't discuss this.
- Option 2: add the type via a shared types-only package (e.g. `@arete/types`). There isn't one today.
- Option 3: duplicate the type on the web side and keep them in sync manually (which is exactly what the plan is trying to solve).
- Option 4: leave web with its own copy but have backend route types flow over-the-wire as `string`, and do the narrowing in the web mapping layer.

The plan presumes option 1 (import from `@arete/core`) without acknowledging that it doesn't work today. This is a real architectural decision and needs a real answer.

**(c)** `packages/core/src/models/integrations.ts` is the right "types home" per the core profile (models/ is the canonical home for TypeScript type definitions). `services/meeting-processing.ts` is where the type is *produced*; that's a different question from where it should be *defined*. If the choice is core, prefer `models/integrations.ts` (where `StagedItem.source` already lives) and re-export from `services/meeting-processing.ts` for ergonomics.

**Required change**: Step 4 should:
1. Acknowledge `ItemSource` already exists — *extend the existing type*, don't introduce a parallel `StagedItemSource`.
2. Move the canonical definition to `packages/core/src/models/integrations.ts` (where `StagedItem.source` is already typed) and re-export from `services/meeting-processing.ts`.
3. Enumerate all **six** duplication sites, not four.
4. Explicitly decide the web dependency question. Most likely correct answer: duplicate the type in `packages/apps/web/src/api/types.ts` with a `// keep in sync with @arete/core ItemSource` comment and add a tsx test that fails if the literal unions drift. Do not add `@arete/core` to web deps in this plan.

---

## Significant Concerns

### C1. Ordering `completed → slack-resolved → open-task` is probably wrong

**Severity**: Significant — user-visible semantic choice.

Step 7 fixes the order at `completed → slack → open` with first-match-wins. Pre-mortem #8 correctly identifies that ordering matters and must be tested explicitly. But it doesn't argue *why this specific order*. Thinking about user expectations:

- If an action item was BOTH completed as a task (`- [x]` in week.md) AND resolved in slack, the slack evidence is almost always *more specific* (includes resolution note, channel context, date) and *more recent* (same-day slack activity vs. week.md items that can be days old).
- Users who see "already done — matched [task from week.md]" will wonder where that task came from. Users who see "resolved in Slack [channel, date]" will immediately recognize why.
- But reconciled status already has a working UI (`already done` badge + tooltip with matched text). slack-resolved is new.
- The slack-digest write also *updates* week.md (`### Week Tasks Updated` is literally a log of week.md mutations). So in practice, a slack-resolved item will almost always ALSO match a completed item. First-match-wins with `completed` first means slack-resolved essentially never wins.

I'd flip the order to **slack-resolved → completed → open**, with the rationale that the most specific evidence should win. But I'm not confident enough to make this a blocker — it's a judgment call. At minimum, the plan should explicitly argue the order, not just state it.

**Suggestion**: Flip to slack → completed → open OR explicitly justify the current order with a sentence. Either way, add the test from pre-mortem risk #8 for the *actual* chosen order.

### C2. Threshold asymmetry (0.6 completed / 0.7 open+slack) will confuse maintainers

**Severity**: Significant — internal-consistency.

After this plan, `processMeetingExtraction` will have:
- `reconcileJaccard = 0.6` for completed-items (unchanged, default remains)
- Effectively `0.7 + min-4-tokens` for open-tasks (new)
- Effectively `0.7 + min-4-tokens` for slack-resolved (new)

Completed-items is the SAME class of comparison as open-tasks (both are text extracted from workspace files, compared against a new meeting action item). The pre-mortem recommended 0.7 + min-4-tokens to avoid stopword false positives at scale. But the completed list is capped by week.md size (~20-30 items typically) — it doesn't hit the 145-scale problem. So 0.6 is defensible for completed.

BUT: the inconsistency is asymmetric for no declarative reason. A future developer looking at this code will not know whether 0.6 and 0.7 are deliberate or accidental. The jsdoc at line 62 of meeting-processing.ts currently says completed's 0.6 is "lower because completed tasks in week.md are often abbreviated." That rationale ALSO applies to slack's `Week Tasks Updated` section — which is a LOG of week.md mutations. So the stated rationale contradicts the plan's chosen threshold for slack.

**Suggestion**: Either (a) Normalize to 0.7 + min-4-tokens across all three (completed, open, slack) and update the existing jsdoc. Users lose minor completed-item dedup accuracy; they gain consistency and fewer false positives. OR (b) Explicitly document in `ProcessingOptions` jsdoc that the three thresholds are different on purpose, with a one-line rationale for each. Current plan does (b) partially — it addresses open/slack's 0.7 rationale but leaves completed's 0.6 unchanged and unjustified-in-the-new-world.

### C3. Step 5's use of `TaskService.listTasks` is heavier than needed

**Severity**: Significant — reuse/complexity tradeoff.

Plan says: *"Use the existing `TaskService.listTasks({ completed: false })` from `packages/core/src/services/tasks.ts:328` — it already parses `- [ ]` lines from `week.md` + `tasks.md`, handles `@tag(value)` metadata via `parseMetadata`, and returns `WorkspaceTask` objects. Extract `.text` for Jaccard comparison."*

`TaskService.listTasks` is real, well-tested, and does handle the parsing. But:

- It returns a rich `WorkspaceTask[]` with metadata (area, project, person, due, from, source file+section) that extract-time code throws away.
- Creating a `TaskService` requires a constructor with `(storage, paths, commitmentsService?)`. The constructor takes an optional `CommitmentsService` for the task-completion auto-resolution feature. If you skip it, fine — but you've just wired up the whole task-commitment machinery to ignore it in the extraction path.
- `createServices()` factory already instantiates `TaskService` and exposes `services.tasks` (per `factory.ts`). So in both `meeting.ts` (CLI) and `agent.ts` (backend), the call is just `services.tasks.listTasks({ completed: false })`. That's fine.
- BUT: the completed-items path uses the plainer `getCompletedItems(content)` from `packages/core/src/utils/agenda.ts:66` — which is a pure function taking a markdown string and returning completed texts. This is a lighter, purpose-built primitive.

For symmetry, an `getOpenTasks(content: string): string[]` sibling in `packages/core/src/utils/agenda.ts` would be a better match: same shape as `getCompletedItems`, same file, trivially testable, no service dependency. Extraction-time code would look like:

```ts
const weekContent = await services.storage.read(join(paths.now, 'week.md')) ?? '';
const tasksContent = await services.storage.read(join(paths.now, 'tasks.md')) ?? '';
const openTasks = [...getOpenTasks(weekContent), ...getOpenTasks(tasksContent)];
```

This mirrors the existing completed-items code block exactly (meeting.ts ~lines 850-856), is a minimal change, doesn't require metadata stripping via TaskService (the meeting-context.ts inline parser already did metadata stripping with a regex — copy that line into `getOpenTasks`).

**Suggestion**: Add a pure `getOpenTasks(content: string): string[]` to `packages/core/src/utils/agenda.ts` alongside `getCompletedItems`. Use that in step 5 instead of `TaskService.listTasks`. Optional bonus: swap `meeting-context.ts:907-922` over to use the same helper — eliminates the duplication the pre-mortem risk #7 was worried about. (Pre-mortem correctly flagged this; plan's answer to pick `TaskService` works but is heavier than necessary and doesn't help with the `meeting-context.ts` duplication.)

### C4. No observability / feature-flag / rollout strategy

**Severity**: Significant — silent regression risk.

The plan changes (a) LLM tier routing for reconciliation review, (b) dedup behavior for action items. Both are silent: if tier routing breaks, extractions still complete but at the wrong quality; if dedup over-matches, users lose real action items to the `skipped` bucket.

Things the plan is missing:
- **Cost telemetry**: Plan mentions "spot-check one `--reconcile` run's AI usage log to confirm review pass hits Sonnet, main extraction hits Opus." Manual spot-check is fragile. The CLI already emits the task string via `services.ai.call('task', ...)`; verify the existing AI usage log (wherever pi-ai records it) captures the tier used so we can grep it post-hoc. If no such log exists, the verification step is vaporware.
- **Feature flag**: No environment variable or config flag to disable the new dedup behavior. If it over-matches at scale, the only recovery is shipping another release. Suggest: `ARETE_DISABLE_OPEN_TASK_DEDUP=1` / `ARETE_DISABLE_SLACK_DEDUP=1` guards in `processMeetingExtraction` (one-line `if (process.env.X) options.openTasks = undefined;`). Optional for open-task (low risk); more valuable for slack-resolved (higher risk given B1).
- **Rollout check**: No mention of running the new path on *both* real workspaces (arete-reserv-test AND a second one) to ensure generalizability. The plan only mentions arete-reserv-test.
- **Logging**: In the CLI, the user sees "Batch review dropped N item(s)" but no breakdown by source. After this change, users should see the counts: `Skipped N: X reconciled, Y existing-task, Z slack-resolved` so they can validate the dedup pipeline matches their expectations.

**Suggestion**: Add a brief "Observability" subsection with: (1) CLI output should surface per-source skip counts, (2) add `ARETE_DISABLE_OPEN_TASK_DEDUP` / `ARETE_DISABLE_SLACK_DEDUP` escape hatches, (3) verify pi-ai usage logs capture the task string.

### C5. Step 6 loader location — belongs in a new file, not meeting-processing.ts

**Severity**: Significant — code organization.

Plan says the slack-digest loader goes "in `packages/core/src/services/meeting-processing.ts` (or adjacent helper)". meeting-processing.ts is already 782 lines and its purpose is *post-extraction filtering* — confidence, dedup, formatting. A loader that reads markdown files, walks a 14-day window, and parses subsections is orthogonal to that responsibility.

It also looks a lot like the same class of function as `loadReconciliationContext` in `meeting-reconciliation.ts:761` (loads workspace markdown, extracts domain evidence, returns a typed context object).

**Suggestion**: Put the slack-digest loader in a new file `packages/core/src/services/slack-digest-loader.ts` (or `slack-evidence.ts`) alongside meeting-reconciliation.ts. Barrel-export from services/index.ts. That keeps meeting-processing.ts focused and gives the digest code a clear place to grow (the pre-mortem flagged that digest schema is drifting; this loader will need iteration, not a monolith edit to meeting-processing.ts).

### C6. `reconciledCount` log in agent.ts:273-275 will under-count after changes

**Severity**: Significant — minor observability bug the pre-mortem explicitly called out.

Pre-mortem #1 mitigation says: *"Also update `reconciledCount` logging (line 273-275) — today it counts only `'reconciled'`; if `'existing-task'` is added as a new source it needs to be counted too or the log becomes misleading."*

The plan does NOT incorporate this into step 5 (which touches agent.ts). Grep the plan's "Acceptance" items for step 5/7 — no mention of updating the log to also count `'existing-task'` and `'slack-resolved'`. Someone following the plan verbatim will miss it.

**Required change**: Add to step 5 (or step 7) acceptance: *"agent.ts:273-285 `reconciledCount` / `dedupCount` logging must count all dedup sources (`reconciled`, `existing-task`, `slack-resolved`) separately so jobs stream output remains accurate."*

---

## Nits

### N1. Step 2 fail-fast wording: early-check location

The plan says "around line 507-518". The correct block in meeting.ts is the `if (!services.ai.isConfigured())` check at 508-518 — but the new check should come AFTER `findRoot()` and `loadConfig()` because we need `config.ai.tiers.standard`. That's around line 530-535 area (after config loads). Minor but the plan says ~507-518 which is before config loads and therefore impossible.

### N2. "Verify: `grep -n \"services.ai.call|deps.aiService.call\"`" in step 1 acceptance

Fine for evidence but note the backend path uses `deps.aiService.call('extraction', prompt)` at line 178 — the grep will need to match both literal strings. The plan's grep pattern already covers both (OR-delimited). Confirmed correct.

### N3. Step 7 jsdoc update

Step 7 says "Document rationale in `ProcessingOptions` jsdoc." Good. Extending `ProcessingOptions` adds two new fields (`openTasks`, `slackResolvedItems`). The existing `completedItems`/`reconcileJaccard` jsdocs (lines 60-63) should also be updated to clarify the new 3-way ordering, not just the new fields.

### N4. Out-of-scope bullet about skill doc

Plan says *"Updating `packages/runtime/skills/process-meetings/SKILL.md` batch example to use `--reconcile`. Doc-only follow-on."* Fine to defer, but **track it** — the whole reason this plan cares about `--reconcile`'s cost is that the winddown skill uses it; if the skill still demos without `--reconcile`, users won't opt in and the new code paths don't exercise.

### N5. `ItemStatus` type has `'skipped'` but web `StagedMemoryItem` doesn't expose it

`packages/apps/web/src/api/types.ts:392` has `ItemStatus = 'pending' | 'approved' | 'skipped'`. Good. Just double-check that the web review UI actually surfaces skipped items distinctly — otherwise the new `existing-task` and `slack-resolved` badges are styled correctly but the items are not visible because the page filters to `status !== 'skipped'` (haven't checked, but worth a manual smoke test).

### N6. Batch processing concern from pre-mortem #9 — not a bench, a scale test

Plan step 8 says: *"Benchmark: `processMeetingExtraction` with 145 open tasks + 20 extracted items < 50ms."* Fine target. But better test: run against the *actual* arete-reserv workspace (not arete-reserv-test) for baseline, check that 5 parallel invocations (winddown's pattern) don't share mutable state and produce different results. At 50ms × 5 parallel, there's no reason for contention, but it's cheap to verify.

---

## Strengths Worth Preserving

- **Pre-mortem integration is done well.** All 9 risks are addressed as first-class plan steps (1, 2, 3) or explicitly documented in step 7 (threshold rationale). No footnote hiding.
- **Variable-naming discipline.** Plan explicitly says "do NOT rename `callLLM`" in step 1. This is exactly the kind of pre-mortem risk #4 that shipping-discipline matters for. Good.
- **Step 3 treats the latent `'reconciled'` drop as a bug, not just scope.** The plan calls it out (line 58: "This step also stabilizes the `'reconciled'` badge in the web UI that is currently broken silently") and fixes it. That's the right posture.
- **"Files touched" section lists approximate LOC per file.** Makes reviewer's job easier and makes scope drift detectable.
- **Deferred-to-follow-on block is explicit.** Computed topic/area memory, prompt tuning, `MAX_EXISTING_TASKS`, etc. — all acknowledged, not quietly dropped.
- **CLI error messages are specific.** Step 2's fail-fast message includes the `arete.yaml` path and the `arete credentials configure` command. This is the standard established by the reviewer profile.

---

## Devil's Advocate

**If this fails, it will be because...** the slack-digest loader was built against the one digest the author had in front of him (the 2026-04-22 sample referenced in the plan's context block), and when shipped it quietly no-ops on the 5/9 days the heading doesn't match. The user will see the expected dedup on high-salience days (when the digest is well-formed) and will attribute the *absence* of dedup on other days to the LLM extractor being bad at its job — because there will be no observable signal that the slack step ran and produced zero evidence. We'll iterate on prompts to fix a data-loading bug.

**The worst outcome would be...** the `'existing-task'` Jaccard match over-fires on a legitimate new commitment — one that happens to share 5-6 tokens with an old `- [ ]` item in tasks.md that's been sitting there for three months. The new commitment gets auto-skipped. The user doesn't notice for two weeks because `skipped` items are de-emphasized in the UI. When they do notice, the `staged_item_matched_text` frontmatter points at the stale task, so the user assumes the LLM was just confused. They un-skip it manually, move on. Next meeting, a different action item matches the same stale task. This time they don't notice at all. Trust erodes in the dedup feature; three months later the user silently turns the whole thing off via an env flag (if we added one) or by reverting to Sonnet (if we didn't). The feature ships, degrades, and retires quietly.

Mitigation: include **one more** acceptance test in step 7 — match a real action item from the user's actual meeting history (2 weeks ago) against the *current* state of the user's actual week.md/tasks.md. Count false positives at 0.7 + min-4-tokens. If >2, tune threshold up before merging. The plan already says "Manually run against the user's actual 145-task workspace... and count false positives in staged output" (pre-mortem #5 verification). Promote that from pre-mortem verification to step 7 acceptance.

---

## Verdict

- [x] **Revise** — Address B1 (slack-digest schema) and B2 (type location) before approval. C1-C6 are strongly recommended fixes; N1-N6 are polish.

### Pre-mortem gating: N/A — pre-mortem already completed (9 risks, all addressed or explicitly deferred in plan). `Approve pending pre-mortem` is off the table.

### Recommended next step

Author revises plan to resolve B1 and B2 (30-45 minutes of work: rewrite step 6's loader spec with multi-heading scanner + fixture test against 9 real digests; rewrite step 4 to extend existing `ItemSource` and enumerate all 6 sites + decide web-side dependency question). Re-submit for approval. No need for a second pre-mortem — the risks are already identified, only the execution spec needs tightening.
