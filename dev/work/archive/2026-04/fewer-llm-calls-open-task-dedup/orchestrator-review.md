## Orchestrator AC + Testing Review: fewer-llm-calls-open-task-dedup

### Scope: AC quality + testing strategy only.

Architecture, scope, domain, and pre-mortem coverage were evaluated in `review.md` — not re-evaluated here. This review applies the mechanical AC rubric (`.pi/standards/ac-rubric.md`) and the Testing Requirements in `build-standards.md` to every step of `plan.md`.

---

### Per-step AC findings

**Step 1 — Route `batchLLMReview` to `reconciliation` tier + fix `reconciledCount` log**

- Current AC: *"Both extraction paths send `'extraction'` for the primary call and `'reconciliation'` for the review pass. `agent.ts` summary log counts skipped items by source accurately."*
- Issue: Partially OK. First clause is testable (and the "Verify" section nails it with the tuple-capture pattern). Second clause ("counts skipped items by source accurately") is vague — "accurately" is an anti-pattern phrase; no enumerated values or assertion shape.
- Refined AC: "In both `packages/cli/src/commands/meeting.ts` and `packages/apps/backend/src/services/agent.ts`, during one `extract --reconcile` run, `services.ai.call` / `deps.aiService.call` is invoked with task `'extraction'` exactly once for the primary extraction and task `'reconciliation'` exactly one or more times for the review pass. `agent.ts:272-285` emits a summary line of form `Skipped N items: X reconciled, Y existing-task` where X, Y are derived by filtering `processed.stagedItemSource` for each source value; when no items are skipped, no summary line is emitted."

**Step 2 — Fail-fast on missing `standard` tier when `--reconcile` is requested**

- Current AC: *"workspace without `tiers.standard` and `--reconcile` → immediate error before any LLM call. Without `--reconcile`, behavior unchanged."*
- Issue: "Immediate error" is not self-evidently observable. Needs the actual error string (already specified in step body — hoist it into the AC) and the exit-code / `success: false` signal. "Behavior unchanged" is vague (regression territory).
- Refined AC: "With `ai.tiers.frontier` set and `ai.tiers.standard` unset: `arete meeting extract <file> --reconcile --json` exits non-zero with `success: false` and an error message containing both `tiers.standard` and `arete.yaml`; the AI service is not called (assert via mock — zero `services.ai.call` invocations). Without `--reconcile`, the same workspace runs extraction successfully (one `'extraction'` call recorded, exit 0). Mirror for backend: `runProcessingSessionTestable` with reconcile enabled rejects before any `deps.aiService.call` invocation with the same message fragments."

**Step 3 — Fix backend source-drop bug + extend allowlist**

- Current AC: *"all five source values (`'ai'`, `'dedup'`, `'reconciled'`, `'existing-task'`, `'slack-resolved'`) survive the parser round-trip."*
- Issue: OK — specific, enumerated, testable. Minor gap: the "manual" verification ("renders the correct badge in the web UI") is not an acceptance criterion an automated reviewer can sign off on; label/class assertion belongs in step 4. The parser AC itself is fine.
- Refined AC: "Given frontmatter `staged_item_source: { k1: 'ai', k2: 'dedup', k3: 'reconciled', k4: 'existing-task', k5: 'slack-resolved' }`, `parseStagedItemSource` returns a record with all five keys, each mapped to the same string literal (no values dropped, no fallback to `'ai'`). Additionally: an unknown value such as `'bogus'` is dropped (assert the key is absent from the returned record) — documents the allowlist behavior explicitly."

**Step 4 — Consolidate `ItemSource` on core/cli/backend; guard web-side duplicate**

- Current AC: *"grep -rn `'ai' | 'dedup' | 'reconciled'` packages/core packages/cli packages/apps/backend returns zero inline duplicates (all import). Web sites have sync comment. `npm run typecheck` green across root."*
- Issue: Grep pattern is testable but will silently drift if someone adds `'existing-task'` or `'slack-resolved'` to a new literal union. "Sync comment" is untestable by inspection alone. The "compatibility assertion test" in the Verify line is not tied to a concrete assertion — what does it compare?
- Refined AC: "(a) `grep -Er \"'(ai|dedup|reconciled|existing-task|slack-resolved)'\\s*\\|\\s*'\" packages/core/src packages/cli/src packages/apps/backend/src` returns zero matches. (b) `packages/apps/web/src/api/types.ts:324`, `types.ts:412`, `meetings.ts:44` each contain the literal comment `// Keep in sync with @arete/core ItemSource` on the line immediately preceding the union. (c) A new test `packages/apps/backend/test/services/item-source-compat.test.ts` imports `ItemSource` from `@arete/core` and asserts a hardcoded tuple `['ai','dedup','reconciled','existing-task','slack-resolved'] satisfies readonly ItemSource[]` AND that the tuple length equals the number of valid `ItemSource` values (via a `satisfies` trick or exhaustiveness check). (d) `npm run typecheck` exits 0 at the repo root. (e) `packages/apps/web/src/components/ReviewItems.tsx` renders the string `'Already tracked as a task'` for an item with `source: 'existing-task'` — assert via an RTL test or a snapshot that includes the badge label text."

**Step 5 — Add `getOpenTasks(content)` helper + load open tasks in both paths**

- Current AC: *"open tasks loaded once per invocation, passed into processing regardless of `--reconcile` flag (same as completed-items behavior). Pure helper, no service dependency."*
- Issue: "once per invocation" is testable but needs an explicit signal. "Pure helper, no service dependency" is a code-review property, not a runtime AC. The AC omits the observable signature of `getOpenTasks` itself (return shape, tag stripping behavior).
- Refined AC: "(a) `getOpenTasks(content: string): string[]` exported from `packages/core/src/utils/agenda.ts` returns text of each `- [ ]` line in source order, with `@tag(value)` metadata stripped (match the `meeting-context.ts:909-922` regex behavior). (b) `[x]` / `[X]` lines are excluded. (c) Nested-indentation `- [ ]` lines are included. (d) In CLI extract (`meeting.ts`) and backend agent (`agent.ts`), for a workspace with `now/week.md` containing 3 open items and `now/tasks.md` containing 2 open items, `processMeetingExtraction` receives `options.openTasks` of length 5, in week-first order, regardless of whether `--reconcile` is passed (tested via mock of `processMeetingExtraction` that captures the options argument). (e) `getOpenTasks` does not import from `../services/` (verify via AST or simple grep: `grep \"from '\\.\\./services\" packages/core/src/utils/agenda.ts` returns zero lines)."

**Step 6 — Add Jaccard post-filter for open tasks + unify threshold**

- Current AC: *"new source value flows into frontmatter `staged_item_source`. Unique items unaffected. 'send the report' vs 'review the report' does NOT match at 0.7 + min-4-tokens."*
- Issue: OK but incomplete. The AC is missing (1) the ordering rule (`reconciled` wins when both hit), (2) the `stagedItemMatchedText[id]` population requirement, (3) what "new source value" means for skipped items (are they `status: 'skipped'`?). Also the min-tokens guard shape (which side must be ≥ 4? both? either?) is ambiguous in the plan — step body says "on both sides after `normalizeForJaccard`" — AC should assert that.
- Refined AC: "(a) When an extracted action item matches an open-task text with `jaccardSimilarity ≥ 0.7` AND both sides have ≥ 4 meaningful tokens after `normalizeForJaccard`, the item's `stagedItemSource[id] === 'existing-task'`, `stagedItemStatus[id] === 'skipped'`, and `stagedItemMatchedText[id]` equals the matched open-task text. (b) When the same extracted item matches BOTH a completed-items entry AND an open-tasks entry, `stagedItemSource[id] === 'reconciled'` (completed wins, first-match-wins order) and `matchedText` is the completed entry. (c) Unique items (no match on any source) have `stagedItemSource[id]` unset and are not skipped. (d) With the unified threshold bump to 0.7, any existing completed-items tests that previously passed at 0.6 but not at 0.7 are inspected individually — their updated expectations are documented in the test file with a comment `// previously matched at 0.6 — verified false-positive at scale, threshold raised`. (e) `DEFAULT_RECONCILE_JACCARD === 0.7` in `meeting-processing.ts`. (f) `processMeetingExtraction` with `openTasks: []` produces identical output to a run without the option (backward compat)."

**Step 7 — Observability: per-source skip-count in CLI/backend output**

- Current AC: *"`--json` output includes the per-source tally. Non-JSON output logs a one-line summary: `Skipped 3 items: 2 reconciled, 1 existing-task`."*
- Issue: Mostly OK. The JSON shape ("per-source tally") is not spelled out — is it `{skipped: {reconciled: 2, existingTask: 1}}` (plan body), or a flat `skippedReconciled: 2`? Agent log format for `agent.ts:272-285` isn't specified (line 272-285 is being modified per step 1; align with step 1's format).
- Refined AC: "(a) CLI `--json` response includes `skipped: { reconciled: number; existingTask: number }` as a top-level object; when no items skipped, both counts are 0 (not omitted). (b) CLI non-JSON stderr output includes a line matching regex `/^Skipped \\d+ items?: \\d+ reconciled, \\d+ existing-task$/` when total > 0, and no line when total is 0. (c) `agent.ts` `appendEvent` for `jobId` emits the same formatted summary line, replacing the current `reconciledCount`-only message at lines 272-285. (d) The summary fields count items by filtering `processed.stagedItemSource` — add a unit test that stubs `stagedItemSource = { a: 'reconciled', b: 'reconciled', c: 'existing-task' }` and asserts the output counts."

**Step 8 — Regression test + manual re-run on example meeting**

- Current AC (implicit, bulleted): "LEAP testing action item staged with `existing-task`/`skipped`/populated matchedText. Spot-check 5 meetings. Benchmark < 50ms. typecheck + test green."
- Issue: (1) "Spot-check 5 meetings, confirm no false positives" is **manual, subjective, and unverifiable by a separate person** — "no false positives" has no operational definition. (2) The benchmark "< 50ms" has no variance tolerance and no environment spec — CI runners are noisy; this target will flake. (3) The fixture file is not named. (4) `npm run typecheck && npm test` is a gate, not a unit AC.
- Refined AC: "(a) Create fixture `packages/core/test/fixtures/meeting-processing/leap-existing-task.md` containing a meeting with an `actionItems[]` entry whose description overlaps the reviewer-provided `week.md:76` text at Jaccard ≥ 0.7. The new test `processMeetingExtraction › matches LEAP testing against open task` loads the fixture, passes the real `week.md:76` string in `openTasks`, and asserts `stagedItemSource` contains one `'existing-task'` entry with the correct `matchedText`. (b) Benchmark test in `packages/core/test/services/meeting-processing.test.ts` runs `processMeetingExtraction` with 145 synthesized open-task strings × 20 synthesized action items and asserts wall time < 500ms (10× the plan's target to account for CI variance; use `node:test` `t.diagnostic` to log actual). Document the 10× buffer in a comment. (c) Manual verification step is separated out under a 'Manual QA' subheading — not claimed as AC — and specifies: workspace path, exact command, exact observation (screenshot or frontmatter inspection of a specific ai_XXX id)."

---

### Testing strategy findings

Overall: test strategy is *mostly* well-aligned. Issues:

1. **Integration-level coverage is thin for a 4-package plan.** Only step 2 explicitly requires an integration test (the fail-fast path). Steps 1, 5, 7 touch both CLI and backend but only specify unit tests with mocked AI. There's no integration test that drives one meeting end-to-end through CLI → `processMeetingExtraction` → frontmatter write → `parseStagedItemSource` → web type mapping. Given the latent `'reconciled'` drop bug that went un-noticed because no test exercised the full pipe, at least one such test is justified.
   - **Recommendation**: Add an end-to-end test in `packages/cli/test/commands/meeting-extract.test.ts` that runs `arete meeting extract --stage --reconcile` against a stub AI that returns one item matching an open task, then reads the written meeting file, parses the frontmatter, and asserts `staged_item_source.ai_001 === 'existing-task'`. Mirrors the pattern already in `meeting-extract.test.ts` (tmpdir + `runCli`).

2. **Snapshot test in step 1 is brittleness risk.** The plan says "Snapshot test on the `agent.ts` summary log asserts new `existing-task` count renders." Summary strings with dynamic counts (`Skipped 3 items: 2 reconciled, 1 existing-task`) are exactly the pattern that bit-rots every time someone tweaks formatting. Also, `node:test` does not have a first-class snapshot API — the existing test at `meeting-processing.test.ts` uses direct string/regex assertion, not snapshots.
   - **Recommendation**: Drop "snapshot" framing. Use `assert.match(lastAppendedLine, /Skipped \d+ items: \d+ reconciled, \d+ existing-task/)` with exact count assertions for the fixture under test. Matches the existing agent.test.ts style (see the `appended` array capture pattern around lines 15-32).

3. **Step 4's "compatibility assertion test" location and shape are not specified.** The plan says "in `packages/apps/backend/test/`" but no file name or assertion shape. Without a spec, two reviewers will produce two different tests.
   - **Recommendation**: Name the file `packages/apps/backend/test/services/item-source-compat.test.ts`. Assertion shape: import both core's `ItemSource` and the web's local union (via relative import from `../../../web/src/api/types.js` — or duplicate the string tuple and type-assert). Use `satisfies readonly ItemSource[]` to force exhaustiveness. Existing backend tests use `node:test` + `node:assert/strict`, so follow that.

4. **Step 5's `getOpenTasks` test location is standard, good.** `packages/core/test/utils/agenda.test.ts` already exists — the new tests extend it. No change needed. Confirm the existing test file uses `node:test` — it does (verified via `packages/core/test/utils/` listing).

5. **Step 6's threshold-bump fallout is under-planned.** The plan says "existing completed-items tests adjusted for 0.7 threshold (expect some previously-passing cases to now correctly NOT match — review each; document any that shift as false-positive fixes)." This is a test-review process, not an AC. If a developer is implementing, they need to know: which tests? How many shifts are acceptable? What if 10 tests break?
   - **Recommendation**: Before implementation, grep `packages/core/test/services/meeting-processing.test.ts` for the string `reconcileJaccard` and `'reconciled'` — enumerate the affected tests in the step body. Target: "≤ 3 test cases shift expectation from 'match' to 'no-match'; each documented with a comment explaining the stopword-false-positive rationale."

6. **Step 7 benchmark target (`< 50ms`) is not CI-enforceable as written.** Locally on a fast MacBook, 50ms is easy. On a shared CI runner with neighbor noise, it will occasionally flake.
   - **Recommendation**: Either (a) set a 10× ceiling (`< 500ms`) and log the actual time via `t.diagnostic()` for manual review; (b) mark the benchmark `test.skip` in CI with a comment pointing to a separate local-only perf script; or (c) measure relative overhead (pre/post) rather than absolute. Option (a) is simplest and matches build-standards.md's "tests must not depend on environment state" posture. Already reflected in the refined AC for step 8.

7. **No regression test explicitly planned for the existing latent `'reconciled'` UI-drop bug.** Step 3 fixes it but the AC only asserts round-trip of `parseStagedItemSource`. A regression test that reads a real frontmatter snippet WITH `reconciled` items and asserts the web mapping layer surfaces them would close the loop.
   - **Recommendation**: Add a test to step 3 asserting the full path: frontmatter YAML → `parseStagedItemSource` → `StagedMemoryItem.source === 'reconciled'`. Today this silently falls back to `'ai'`; the test fails before the fix and passes after.

8. **Manual-vs-automated in step 8 is muddled.** The step mixes automated fixture test, manual `arete-reserv-test` run, manual `arete-reserv` spot-check, benchmark, and CI gate. Split them.
   - **Recommendation**: Structure step 8 as `### Automated` (fixture test + benchmark) and `### Manual QA` (the two workspace runs with explicit "record these observations" checklist). See step 8 refined AC above.

---

### Missing ACs

- **Step 1**: No AC covers the `reconciledCount` log extension to count `existing-task` (reviewer's C6 escalation). The step body mentions it but the AC only says "counts skipped items by source accurately." Hoist into an explicit AC as done in the refined AC above.
- **Step 4**: No AC covers the web-side label string `'Already tracked as a task'` actually rendering (the step body mentions the mapping but the AC leaves it to `typecheck`). A web-side render test (or at minimum a unit test of the label-mapping function) should be an AC.
- **Step 5**: No AC specifies `getOpenTasks` is pure (no side effects, no I/O). Since the plan uses purity as a selling point over `TaskService.listTasks`, assert it — `import` check + no `async` signature.
- **Step 6**: No AC specifies the `matchedText` points to the OPEN task when `existing-task` wins (only implied by step 8's fixture). State it in step 6.
- **Step 7**: No AC specifies behavior when all counts are zero (omit the line? print `Skipped 0 items`?). The refined AC above picks "omit."
- **Step 8**: No AC for the "5 spot-checked meetings" manual run — what counts as a pass? The plan currently leaves this as vibes. Move to Manual QA section with an explicit record-keeping rubric (e.g., "For each of 5 meetings, record: (a) count of skipped items, (b) count of false positives — action items that were legitimately new but matched an old task").

---

### Verdict

- [ ] **Ready** — ACs and testing strategy are solid
- [x] **Ready with minor refinements** — apply listed nits and proceed
- [ ] **Refine before /build** — significant AC or test gaps to close

Most ACs are directionally correct; the gaps are in precision (vague phrases, missing observable signals) rather than missing coverage. Architecture and scope are solid per `review.md`. The fixes above are mechanical — 30-60 min of AC rewriting, no re-planning.

---

### Recommended refinements prioritized

1. **Step 8: split automated vs manual, fix benchmark variance.** The current `< 50ms` + "spot-check 5 meetings, no false positives" AC is the most CI-unfriendly and subjective item in the plan. Bump bench ceiling to 500ms with diagnostic logging; pull manual runs into a separate Manual QA block with explicit observation rubric.
2. **Step 4: name the compatibility-assertion test file and spell out its assertion shape.** Currently just "add a test in `packages/apps/backend/test/`" — a builder will invent something and reviewers will argue over it. Pick `item-source-compat.test.ts`, use `satisfies readonly ItemSource[]`, and include all 5 string literals.
3. **Step 6: enumerate the completed-items tests that shift at 0.7.** Grep the existing `meeting-processing.test.ts` now and list the affected `it()` blocks in the step body so the developer knows the fallout before starting. Prevents "tests break, dev panics, rollback 0.7 change" churn.
4. **Step 1: hoist `reconciledCount` log extension into an explicit AC.** Reviewer C6 flagged it, plan acknowledges it in step body, but AC doesn't test it. Easy miss during review.
5. **Add one end-to-end integration test** (CLI → frontmatter → backend parse) in step 3 or step 7. The latent `'reconciled'` drop bug that step 3 fixes existed precisely because no test exercised the full pipe. Don't ship the fix without a test that would have caught the original bug.
6. **Step 2: add AC assertion that zero LLM calls happen on fail-fast path.** Current AC says "before any LLM call" but doesn't specify how to assert — spell out the mock-based check (zero invocations on `services.ai.call`).
7. **Step 7: spell out the JSON response shape.** `{ skipped: { reconciled: N, existingTask: M } }` vs flat fields is a compatibility concern for downstream consumers (`arete-reserv` shell scripts, the web API client). Lock it in.
