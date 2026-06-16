# Build diary — single-pass-extraction + CHR partial (overnight build)

Branch: `feat/single-pass-extraction`
Worktree: `/Users/john/code/arete/.claude/worktrees/agent-a5a33ca8a5d192df4`
Builder: ship suborchestrator (Claude Fable 5)

---

## 2026-06-11 ~00:05 — Phase 0: setup + orientation

**Done:**
- Verified worktree isolation (`git rev-parse --show-toplevel` → worktree path; main repo untouched).
- Created branch `feat/single-pass-extraction` off `worktree-agent-a5a33ca8a5d192df4` (HEAD 74370a1e).
- Plan docs (`single-pass-extraction/`, `chef-holistic-reconcile/`) were UNTRACKED in the main repo working dir — copied them into the worktree (read-only copy; main dir untouched) so they ride the branch.
- Read all five plan docs + AGENTS.md + ship SKILL.md header.
- Recon of the core surfaces: `meeting-extraction.ts` (2004 ln), `meeting-processing.ts` (1073 ln), `meeting-reconciliation.ts` (1070 ln), `cli/commands/meeting.ts` extract command (~460–1500), `config.ts`, `models/workspace.ts` (AreteConfig).

**Key recon findings (verified in source, this branch):**
- Cap slice: `meeting-extraction.ts:1637` (`dedupedActionItems.slice(0, limits.actionItems)`); overflow → validationWarnings (unpersisted except mirror-pairs). Matches plan.
- Silent drops confirmed: `meeting-processing.ts:393,489,528` — `if (confidence < confidenceInclude) continue;` bare, no record. Also parser-side `continue`s in `parseMeetingExtractionResponse` (garbage/trivial/direction) push validationWarnings but warnings are not persisted (except mirror-pair section).
- Exclusion list: `buildExclusionListSection` (`meeting-extraction.ts:892-995`) — SKIP framing exactly as review F1 described.
- `--reconcile` inline path: `meeting.ts:905-944` (reconcileMeetingBatch over `[...recentBatch, current]`), merge at `:998-1034`, batchLLMReview `:1042-1074`, wireExtractDedup `:1093-1147`. Backend twin at `apps/backend/src/services/agent.ts:362`.
- excludePath strict-`===` trap documented in `loadRecentMeetingBatch` JSDoc (`meeting-reconciliation.ts:1007-1011`).
- Config: `AreteConfig` has `intelligence.extraction.{confidence_threshold_*}` already. I will add top-level `extraction_mode` and `reconcile_mode` keys (matches plan text verbatim; deepMerge handles them for free).

**DEVIATION (important for reviewers):** The operator brief says to delegate heavily via an Agent tool. **No Agent/Task tool exists in this environment** (verified via ToolSearch — only EnterWorktree/Monitor/TaskStop/Web*/MCP connectors are available). I cannot spawn subagents. Mitigation: I do the work directly, sequentially, and replace "fresh-eyes subagent review" with a disciplined separate review pass over `git diff` after each work item (different lens: correctness + legacy-invariant audit), plus the full test suite per item. Logged here so reviewers know review independence is weaker than briefed.

**Decisions (adjudicated by John, applied tonight):**
- CHR-W0 Stage-0: YES, behind `reconcile_mode: inline | day-level` (default inline).
- SP-W6: CUT from tonight, pinned after CHR-W6.
- Eval rigor ×4: committed manifest + scorecards in `eval/`, judge rubric doc, AC11 p90, one full-meeting human audit per gate (John's morning task).
- Soak abort triggers added to both plans.
- Pre-mortem dropped checkboxes: each folded or explicitly rejected (see Work Item 0 entry below).

**Plan for the night** (order): WI-0 plan-doc adjudication updates → SP-W1 (consumer audit + schema + tier approval) → SP-W1.5 (series resolver) → SP-W2 (single-pass prompt + flag) → SP-W3 (telemetry flip + drop-point persistence) → SP-W4 (winddown view ranking) → SP-W5 (eval harness + manifest + rubric + 1-meeting smoke) → CHR-W0 → CHR-W1 (engine spec) → CHR-W2 (nominate primitive) → CHR-W7 infra → WINDDOWN-BENCHMARK.md → wrap (dist, build-report, final review).

---

## 2026-06-11 ~01:30 — SP W1 + W1.5 + W2 + W3 (commit f3111f86)

**Consumer audit** (consumer-audit.md): grep-verified ~50 files touching `direction`. Key finding vs the plan draft: there are THREE direction type families; only the extraction/staging family gains `none`. `CommitmentDirection` does NOT (review F7 was right to worry — `direction` IS part of both commitment hash schemes, so widening that type would have changed hash identity semantics; avoided entirely by keeping `none` out of the commitment domain). The single chokepoint for D7 inertness is `meeting-parser.ts` — it feeds BOTH commitments (`CommitmentsService.sync`) and person memory.

**Design decisions a reviewer should scrutinize:**
1. **`·` marker for direction none** in body lines (`[@slug ·]` staged, `(@slug ·)` approved). Chosen because it's not in `ARROW_VARIANTS`, so legacy parsers can't misread it as directional; meeting-parser additionally has an explicit skip guard on the raw line BEFORE the no-notation inference heuristics (which would otherwise infer i_owe_them from "Tim to fix X" when parsing for tim). Belt-and-suspenders guard in commitments.sync warns + skips any non-binary direction.
2. **Tier/⚠/links persist as frontmatter maps** (`staged_item_importance`, `staged_item_uncertain`, `staged_item_links`), NOT as body-line markers — `ITEM_PATTERN` (`- ai_001: text`) and Jaccard text matching would both be contaminated by in-text markers. W4 view reads the maps. Single-pass patch explicitly writes `undefined` when empty so re-extracts clear stale maps under writeWithLock partial-merge (same pattern as could_include D1 fix).
3. **Invalid direction in single_pass defaults to `none` + telemetry** (not drop, not i_owe_them — dropping is AC8 data loss, i_owe_them fabricates commitments).
4. **`uncertainty_reason` implies `uncertain: true`** even if the model forgot the boolean.
5. **Light-importance meetings stay on the light prompt** even in single_pass — importance triage is orthogonal to pipeline mode.
6. **Caught my own legacy-invariant bug in self-review**: I initially added 'Open Questions' to STAGED_HEADERS — that would make a LEGACY re-extract strip a USER-authored "## Open Questions" section. Fixed via `SINGLE_PASS_STAGED_HEADERS` opt-in param on updateMeetingContent + regression test for both directions.
7. Telemetry events go to item-fates.jsonl as `type: 'extraction_telemetry'` records (same stream per W3, distinguishable from `item_fate` records; existing consumers filter by type).
8. **Backend (`agent.ts`) extraction stays legacy regardless of flag** — winddown drives extraction through the CLI; documented gap for build-report.

**W1.5**: series = title-Jaccard ≥ 0.5 AND attendee-overlap ≥ 0.5 (conjunction = the AC13 negative case), window 35d strictly-before-target (same-day = priorItems, not series), strict-=== excludePath per the LEARNINGS trap, recurring_meetings config rescues drifted titles. One documented soft spot: a shared organizer + same title matches even if other attendees rotate (overlap = 1/min) — test documents this as acceptable.

**W2**: judgment-first prompt keeps the legacy prompt's proven pieces verbatim-in-spirit (delta directive + confirmation-of-uncertainty escape hatch, topic bias block, context bundle) and replaces IS/IS-NOT lists with 8 judgment rules. Known-items block is MARK-don't-skip (review F1) — asserts "Never omit a superseding item" and the exclusion phrase is test-banned from the prompt.

**Verification**: typecheck green; full suite 4569 pass / 0 fail (incl. 39 new tests: single-pass parsing, tier approval, AC8 persistence, D7 inertness ×3 layers, prompt content, series resolver ±, golden legacy fixture byte-stable).

---

## 2026-06-11 ~02:30 — SP W4 + W5 (commits 6e9?+: W4 SKILL.md, W5 eval)

**W4** (daily-winddown SKILL.md, additive): tier-ranking spec added to Step 4 "Stage for approval" — sort blocker→high→normal, `[BLOCKER]`/⚠/link markers read from the W1 frontmatter maps, normal-collapse (>5 normals from a routine meeting → first 2 + count line; never collapse blockers/highs/⚠), blocker-never-hidden incl. sidecar pull-out, direction:none follows sidecar rules, oq_NNN render as informational list. Plus an item-tier override rule in Importance handling: blocker items override per-meeting deferral in ONE direction only (promote item, never demote; never promote whole meeting). No core renderer change needed — the curated view is chef-composed in-context; the W1 frontmatter maps are the data contract. Gated on `staged_item_importance` presence; legacy renders as today.

**W5**: manifest derived from benchmark-evidence.md + the POST-AUDIT Approved sections of the corpus files (read-only). Notable: the compliance file's approved sections already include the license-assignment gate decision — i.e., the audit misses were approved into the file after the audit; I used the post-audit sections as canonical ground truth and marked origin (pipeline vs audit-miss vs naive-new-real) per item. Blind set: lindsay-11 6/3, doi-sync 5/28, cx-deep-dive 6/1, genesys vendor demo 6/4; F5 extension candidates (boring + observer) listed but not gating. Rubric: anchored verdict taxonomy (REAL/REAL-MISTYPED/VERBOSE/JUNK/FABRICATION), computed meeting grades, B+ bar = "A-/B+" row; judge enumerates expected items from the transcript BEFORE seeing the extraction (anti-leak); manifest withheld from the judge on blind meetings.

**SMOKE TEST (the night's headline)** — compliance-0609, real `callLLM` path, workspace tier routing (extraction: frontier = claude-opus-4-6), READ-ONLY:
- legacy: 3 ai / 7 de / 6 le in 62.3s. Decisions sat at EXACTLY the 7-cap — the cap is demonstrably binding on this meeting on today's model.
- single_pass: 5 ai / 13 de / 8 le / **9 open questions**, **3 blocker-tier** items, 2 ⚠ (both with crisp reasons — e.g., "Jamie relayed James is working on it this week but no firm commitment made in this meeting"), 2 direction:none, in 86.4s (+39% wall).
- **AC2 canary PASS on the smoke**: "Automated claim assignment by adjuster license profile MUST exist before Snapsheet sunset; interim plan..." extracted AND tier-marked blocker — the exact item the legacy cap loses.
- Volume is ~26 items + 9 oq vs legacy 16 — consistent with the benchmark's volume expectations and the reason AC11/W4 collapse exist.
- Production-model (Opus) behavior matches the Fable-observed benchmark on the load-bearing behaviors (⚠ self-flagging, none-refusal, blocker cue pickup) — pre-mortem risk 6's first real datapoint.

Raw outputs in eval/runs/ (local, gitignored). Full corpus run + judge pass = John's morning call (token spend).

**Housekeeping**: harness + runs gitignored (house rule); manifest/rubric/scorecards-README committed.

---

## 2026-06-11 ~09:40 — CHR-W0: day-level reconcile (continuation orchestrator)

Resumed after the previous orchestrator died on API limits mid-W0. Inspected
the uncommitted draft rather than trusting it; found and fixed real bugs:

1. **`setAt` missing from `staged_item_skip_reason` writes** —
   `parseStagedItemSkipReason` shape-validates and silently DROPS entries
   without `setAt` (staged-items.ts:291). The draft's skips would have been
   honored by status but invisible to every skip_reason reader. Added.
2. **Doubled meetingsDir join** — `join(root, paths.resources, 'meetings')`
   where `paths.resources` is ALREADY absolute (getPaths joins root) →
   `/ws/ws/resources/meetings`, and `storage.list` returns `[]` silently for
   missing dirs. Fixed in reconcile-day AND in the W1.5 series-resolver
   block (our branch's new code — series context was always empty).
   **Discovery with reach**: the LEGACY inline `--reconcile` (meeting.ts:1006)
   and CLI `wireExtractDedup` (:1217) carry the same doubled join since
   46152a75 — the CLI inline cross-meeting recent-batch has been a silent
   no-op (memory/completed-task matching still worked; they use context, not
   the batch). The production collapse-to-oldest came via the BACKEND twin
   (packages/apps/backend agent.ts:550,685), which joins correctly. LEFT
   UNTOUCHED in legacy per the flags-off bit-identity invariant; documented
   for build-report + a comment at the series-resolver fix site.
3. **No-change writes now abstain** instead of rewriting the file
   (writeWithLock `{abstain}`) — no mtime churn on idempotent re-runs.
4. Finished the test file (3 tests: visible-skip + user-decisions-win +
   idempotent re-run + clean no-meetings) and added the extract-side gating
   test (day-level skips the `--reconcile` standard-tier fail-fast) as an
   inversion of the existing tier test in meeting-extract.test.ts.
5. SKILL.md wiring per plan W0: Step 1h note (keep `--reconcile`; CLI defers
   + reports `reconcileDeferred`) and Step 2 opens with
   `arete meeting reconcile-day` — both gated on `reconcile_mode: day-level`,
   default `inline` text untouched.

Semantics kept from the draft (verified against source): batch sorted ASC by
filename = first-occurrence-wins oldest-canonical, identical to inline's
`[...recent, current]`; visible `status: 'skipped'` + `source: 'reconciled'`
flips ONLY (no silent merge — day-level apply is post-write); approved/
skipped never touched; ONE batched LLM review over the day's surviving
actions, gated on isConfigured + standard tier + ARETE_NO_LLM, graceful
degrade.

**Verification**: full suite 4575 tests / 4573 pass / 0 fail / 2 skipped
(+4 new). cli rebuild clean.

---

## 2026-06-11 ~10:10 — CHR-W1: engine spec + PATTERNS entry

`dev/work/plans/chef-holistic-reconcile/engine-spec.md` (spec v1) +
`packages/runtime/skills/PATTERNS.md` § reconcile-engine (envelope summary
pointing at the spec).

Coverage per brief: ledger shape (gather-loop composition + extraction
entries w/ single-pass fields; raw-not-post-inline rule; arcs-survive-
composition rule), R0–R4, rule definitions with ALL Rule-4 guards and the
judgment-band parameter table — threshold-unity deliberately scoped to R2
nomination only; Rule 4 concrete ≥0.7 / 0.5–0.7 Uncertain band
(SKILL.md:583,632–642) and CommitmentsService.reconcile()'s 0.6 preserved
as named engine parameters (review F2's "regression-by-test" inversion
guarded in prose). Arc assembly with THREE worked examples per review F7:
(1) Anthony de_002 → workshop de_004 same-day supersession (the AC3
fixture), (2) A→B→A′ flip-flop reversal (high Jaccard between non-adjacent
arc members = arc evidence, not dedup evidence), (3) three-meeting
continuation chain (continuation vs supersession vs duplicate collapse
directions distinguished). Provenance: writers emit 'chef-dedup', readers
accept 'reconciled' forever; skip_reason carries {reason, evidence,
matched_ref, setBy, setAt} with greppable reason prefixes. Degraded-mode
contract table (tier→normal, confidence-as-staging-signal semantics noted
per review F8, claims→nomination-only). R7 idempotency as a four-mechanism
stack. Jira: generic `workspace-evidence` APPEND extension point, NOT core
(per 2026-06-11 adjudication; no core CLI/MCP ever). Scope fence § 9.

---

## 2026-06-11 ~10:45 — CHR-W2: `arete reconcile nominate` primitive

Pure-function core (`packages/core/src/services/reconcile-nominate.ts`)
+ thin CLI (`arete reconcile nominate --ledger <file.json> [--days 7]
--json`, per review F7 the ledger is a FILE) + 16 Layer-1 unit tests +
2 CLI smoke tests. NOTHING deleted: findDuplicates / matchRecentMemory /
matchCompletedTasks / scoreRelevance are REUSED from
meeting-reconciliation.ts (FlattenedItem recovered structurally via
`Parameters<typeof findDuplicates>[0][number]` — no export widening);
reconcileMeetingBatch and the inline path untouched.

Design notes for reviewers:
- Nomination semantics inherit findDuplicates exactly (strict > 0.7,
  same-type only, different-owners-never) — exactly-0.7 lands in the
  0.5–0.7 `uncertain-band` (complementary inclusive bounds), which exists
  to FEED Rule 4's fuzzy routing, never as a collapse candidate.
- Threshold-unity test is nomination-scoped per review F2, and there is a
  test that FAILS if someone "unifies" matchCompletedTasks' deliberate 0.6
  band into the constant (a 0.65 pair must complete-match but NOT
  duplicate-nominate).
- Window-coverage invariant: same fixture through reconcileMeetingBatch
  (inline) and nominateCandidates — every inline duplicate must be covered
  by a nomination, canonical placement must match first-occurrence-wins.
- excludePath regression repointed at the W2 loader pathway
  (loadRecentMeetingBatch IS the loader, reused not rewritten): exact-match
  excludes; `./`-prefix and symlink-alias do NOT (trap documented). CLI
  generalizes excludePath to a strict-=== source_ref SET (ledger meetings
  filtered from the batch — the self-nomination guard, ledger edition).
- Degraded mode: `degraded: true` iff extraction entries exist and none
  carry `tier` — legacy-shaped fixture verifies dupes/memory/completed
  still nominate after an SP rollback.
- continuation_of / supersedes nominate unconditionally as `claimed`
  (claims to VERIFY in R3, per D3).

**Verification**: 16+2 new tests green; meeting-reconciliation (122) green;
core + cli typecheck/build clean.

---

## 2026-06-11 ~11:15 — CHR-W7 infra: raw snapshots + shadow-log scaffolding

`packages/core/src/services/reconcile-shadow.ts` + extract-command wiring +
8 unit tests + .gitignore entries (`dev/diary/raw-extractions/`,
`dev/diary/reconcile-shadow.log`).

- **Insertion point verified genuinely pre-mutation** (the pre-mortem R2
  requirement): snapshot writes immediately after
  `extractMeetingIntelligence` returns (meeting.ts, right before the W0
  day-level gate) — upstream of the inline cross-meeting reconcile,
  `processMeetingExtraction` (confidence filter / completed-open-task
  matching / silent merges), `batchLLMReview`, AND `wireExtractDedup`.
  Known limit documented in the service header per review F1: prompt-level
  exclusion-list suppression happens INSIDE extraction and no snapshot can
  see it — snapshots record `extractionMode` so soak analysis segments
  legacy vs single_pass days.
- **Gated on new config `reconcile_shadow: true` (default false)** — NOT
  on reconcile_mode (the soak runs while inline is still live, so coupling
  them would be wrong), and zero writes with flags off preserves the
  bit-identity invariant. Best-effort try/catch; instrumentation never
  fails extraction. Skipped on --dry-run.
- Snapshot shape versioned (`v: 1`): {capturedAt, meetingPath, date, slug,
  extractionMode, intelligence, validationWarnings?}. Re-extract overwrites
  (the soak wants the snapshot that fed the day's run).
- Shadow log: JSONL via the storage adapter's atomic `append` (O_APPEND —
  safe under the winddown's wave-of-4 parallel extracts), read-modify-write
  fallback for adapters without it.

---

## 2026-06-11 ~11:45 — Phase C: WINDDOWN-BENCHMARK.md

Executable A/B checklist for John, grounded in the real artifacts: read the
06-04 and 06-09 archived winddowns (READ-ONLY) for format + baseline numbers
(06-09 = richest day: 6 CTs with evidence classes, 14-item sidecar, the
de_002→de_004 supersession and the b0e57c25↔ce091a38 mirror pair both
visible in Uncertain — i.e., the baseline already exhibits the exact
phenomena the gates measure). Sections: setup (flags incl. reconcile_shadow,
one-variable-at-a-time note on reconcile_mode, model-confound note),
per-day metric table (tier counts, pending-decisions as THE AC11 number
with p90 computed at gate time not nightly, blockers incl. override
pull-ups, sidecar size, wall-clock, CT evidence classes, mirror events,
auto-approvals, unmerge), weekly judge re-audit protocol (N=10 staged
stratified + N=5 skipped; skipped-item false-collapse hard bar 0/5 no
escape hatch per CHR AC6; one full-meeting human audit per gate per rubric
rail; judge model id recorded; manifest withheld), what raw snapshots
enable (offline engine replay via reconcile nominate, re-scoring after
model bumps, arc reconstruction, second golden day), decision rules
(Gate A = extraction_mode flip: AC11 median≤25 AND p90≤40 + zero
non-blocker auto-approvals + AC2/AC3/AC9 + wall-clock + AC12; Gate B =
CHR W4: detector soak + day-level exercised + soak event minima + zero
sampled false collapses + second golden day; independent day-level flip
rule), and the five abort triggers verbatim incl. SP-rollback-resets-
soak-clock. Log table seeded with the 06-09 baseline row.

---

## 2026-06-11 ~12:30 — Phase D: wrap (continuation orchestrator)

**Test state across ALL packages:**
- core+cli (root `npm test`): **4601 / 4599 pass / 0 fail / 2 skipped**
  (pre-branch 4530; +69 branch tests).
- backend: 363/367 — the 4 failures are PRE-EXISTING. Proven, not assumed:
  ran the backend suite at the merge-base (74370a1e) in a throwaway
  detached worktree (`git worktree add --detach /tmp/arete-main-check`,
  removed after) → identical failure set. Branch touches zero backend
  files. Also: root `npm test` does NOT include backend/web — the earlier
  "full suite green" claims were core+cli only; build-report says so.
- web: untouched by branch; vitest devDeps not installed in this monorepo
  checkout, suite not runnable here (pre-existing condition).

**Fresh-eyes review** — DEVIATION (same as Phase 0): no Agent/Task tool
exists in this environment (re-verified via ToolSearch at Phase D), so the
review was a disciplined separate pass over `git diff main...HEAD` rather
than an independent subagent. What it checked + found:
- Legacy invariance at every detector seam (telemetry-only is `if
  (singlePass)`-gated; else-branches keep warn+continue verbatim); config
  clamps; D7 inertness at all 3 layers; SKILL.md diffs additive.
- W0 semantics parity with inline (ordering, visible-skip-only, user-
  decisions-win, abstain-on-noop) re-verified post-fix.
- Bugs found DURING the build (not after): the W0 draft's missing `setAt`
  (reader silently drops the entry), the meetingsDir double-join family
  (fixed in branch-new code, documented-not-fixed in legacy per the
  invariant), and the suite-coverage blind spot above. Findings were fixed
  before their commits; no post-hoc fixes were needed from the final pass.

**Artifacts:** build-report.md (flags + flip rules, smoke results, AC
status tables for BOTH plans, discoveries, known gaps incl. backend-stays-
legacy), WINDDOWN-BENCHMARK.md (Phase C), engine-spec.md + PATTERNS entry
(W1), this diary. dist/ rebuilt + committed for core and cli (house rule).

**Branch ready-state:** all scope items committed, worktree clean, NOT
merged/pushed. John's queue: (1) review build-report Discoveries #1 (the
legacy double-join disposition call), (2) flip `reconcile_shadow: true` +
`extraction_mode: single_pass` in arete-reserv when ready to start the
soak per WINDDOWN-BENCHMARK § 0, (3) morning eval run (token spend) for
AC1/AC3/AC5/AC7.

---

## 2026-06-11 review fixes (independent-review pass applied)

An independent reviewer audited the whole branch; this entry applies every
finding. Disposition per finding:

**MUST-FIX 1 — W7 snapshot mode label (FIXED).** `meeting.ts` passed the
PROMPT mode (`light|normal|thorough`) as `extractionMode`; the snapshot
schema requires `legacy|single_pass`. Now `extractionMode: singlePassMode ?
'single_pass' : 'legacy'`, with the prompt depth recorded separately as a
new optional `promptMode` field (schema + writer updated in
`reconcile-shadow.ts`). Added CLI-level tests
(`meeting-extract-snapshot.test.ts`) that run the REAL `arete meeting
extract` subprocess against a stubbed Anthropic fetch (NODE_OPTIONS
preload, `test/fixtures/mock-anthropic-fetch.mjs` — zero network/LLM
calls) and assert the snapshot on disk records `legacy` / `single_pass` +
`promptMode` — the class of bug the literal-passing unit tests missed.

**SHOULD-FIX 2 — D7 inertness test gaps (FIXED).** Guards existed at 3
layers but only layer 1 (meeting-parser) was tested. Added: (a)
`CommitmentsService.sync()` test with a direction:'none'-shaped item —
asserts console.warn + skip, zero commitments created (commitments.test.ts);
(b) `loadSameDayStagedItems` canonical-guard test with a `·`-marked /
`direction: none` item — excluded from dedup canonicals
(extract-dedup-wiring.test.ts). Fixed the overclaiming header comment in
single-pass-extraction.test.ts (now says layer 1 only + points at where
the other layers are tested) and the build-report AC4 row ("tests ×3
layers" → guards ×3, tests originally ×1, now ×3 via these fixes).

**SHOULD-FIX 3 — reconcile-day --dry-run fidelity (FIXED).** Dry-run
returned before staged-line matching and user-decision checks, so it could
not predict a real run (and the flip rule trusts dry-run). Now dry-run
reads each file and runs the SAME `allStaged.find` + prior-status logic
read-only, populating real ids, `unmatched`, and `skippedExisting` — no
more `(dry-run)` placeholder ids. Test added (reconcile-day.test.ts):
a Format-B (Approved-section) duplicate creates genuine text drift; the
dry-run's `unmatched`/`applied`/`preservedUserDecisions` sets are asserted
identical to a subsequent real run's, and files are byte-untouched.

**SHOULD-FIX 4 — series resolver doc/impl mismatch (FIXED, impl
tightened).** Comment claimed the attendee gate is skipped only when BOTH
sides lack attendees; impl skipped when EITHER was empty. Adjudicated
decision applied: when the TARGET has attendees but the candidate has
none, the title bar tightens to Jaccard ≥ 0.7 (new exported
`SERIES_TITLE_JACCARD_NO_ATTENDEE`; explicit shared recurring-config still
passes); when the target lacks attendees, behavior is unchanged. Module
header now describes exactly this. Asymmetric-case test added (blocks at
J≈0.6 without candidate attendees; passes at J=1).

**DOC/POLISH 5 — engine-spec §2/§3 boundaries (FIXED).** Aligned with
shipped code: duplicates are strict `J > 0.7` (`findDuplicates` uses `>`);
uncertain band is `0.5 ≤ J ≤ 0.7` INCLUSIVE both ends
(`sim >= UNCERTAIN_BAND_FLOOR && sim <= NOMINATION_JACCARD_THRESHOLD`).
§3 table rows updated; noted the clean partition at the 0.7 boundary.

**DOC/POLISH 6 — AC8 residual telemetry (FIXED, code).** Two remaining
silent drop points in the single_pass parse path now emit
extraction-telemetry events: (a) empty-text decision/learning entries →
`unparseable_item`; (b) open_questions truncation at OPEN_QUESTIONS_MAX →
`category_limit` with new itemType `open_question` (one event per dropped
question). Legacy path bit-identical (events are singlePass-gated). Test
added to single-pass-extraction.test.ts.

**DOC/POLISH 7 — WINDDOWN-BENCHMARK AC11 clause (FIXED).** `source: dedup`
items are now explicitly EXCLUDED from the "any non-blocker auto-approval
= breach" rule (they retain pre-existing 10b auto-approve semantics); both
the §1 log-table row and the Gate-A checklist line carry the exclusion.

**DOC/POLISH 8 — CHR plan.md W0 text (FIXED).** "Step 1h drops
--reconcile" rewritten to describe what shipped: flag kept; CLI-side
deferral under `reconcile_mode: day-level` (skips inline reconcile +
batchLLMReview, info line, `reconcileDeferred: 'day-level'` in --json).

**DOC/POLISH 9 — build-report corrections (FIXED).** The "invalid values
are clamped" sentence now states that only `extraction_mode` /
`reconcile_mode` are clamped in `normalizeConfig`; `reconcile_shadow` is
protected by the strict `=== true` activation gate, not clamping. Reviewer
NOTES 8/10/11 appended to the Known-gaps section (substance reconstructed
from the findings — the review transcript itself is not in-repo; flagged
as such in the report).

**Process:** every fix verified by its package tests, then the full
core+cli suite; dist/ rebuilt + committed for core and cli (house rule).
Zero LLM calls (the new CLI snapshot tests stub fetch at the transport
layer). Not merged, not pushed; arete-reserv untouched.

## 2026-06-16 — baseline-completeness fix (SOAK finding #6)

**Root cause.** The W3 `arete winddown render <date> --write` path persisted
ONLY the frontmatter-derived staged-items block as the apply baseline. But the
agent's real SKILL.md flow hand-composes `## Proposed actions`
(`<!-- act:verb:id -->`) into the doc AFTER render runs — those anchors never
existed in the staged-block-only baseline. So in `winddown-apply.ts:299-304`,
every `act:` anchor in the edited doc hit the no-match branch
(`warnings.push("unknown anchor not in baseline"); continue`) and was SILENTLY
DROPPED — half the approval surface (DMs / invites / resolves) never executed.
SKILL.md was self-contradictory: the render step (~1162) claimed apply
classifies the hand-written actions, while the baseline step (~1375) declared
the staged-block-only baseline "sufficient." It is not. The render-build test
only round-tripped render output against itself, so it never exercised a doc
whose actions are absent from a partial baseline — the coverage gap that let
this through to soak prep.

**Fix (chosen: SKILL.md + CLI doc, no core change).** The apply mapper is
already correct: it keys purely on anchors and ignores non-anchored narrative,
so a COMPLETE-doc baseline correctly contains every anchor (items + ⛔/⚠
choices + actions). The fix is the W3-era `cp` approach, restored:
1. Checklist-render step now calls `arete winddown render <date> --stdout`
   (NOT `--write`) — render only knows the staged block.
2. Step 5 persists the baseline by `cp`-ing the FINALIZED complete doc
   (`cp winddown-<date>.md winddown-<date>.baseline.md`) as the LAST step
   before engaging the user — the agree-path round-trip is then byte-for-byte
   zero-drift (AC1).
3. Self-contradiction removed: both the render step (~1162) and the baseline
   step (~1375) now agree the baseline is the complete doc.
No core logic changed. `--write` is kept but documented as DEPRECATED-as-a-
baseline-source (it omits the proposed actions). The apply "baseline not found"
error and the render `--write`/command help now point at the `cp` flow.

**New test.** `packages/core/test/integrations/winddown-apply.test.ts` →
describe `finding #6: complete-doc baseline classifies actions (no silent
drop)`, two cases: (1) baseline = complete doc (narrative + staged items +
choices + 3 `## Proposed actions`) → all 3 action anchors classify, ZERO
"unknown anchor not in baseline" warnings, items still classify; (2) a toggled
action + an edited action body round-trip (both resolves execute, DM drafts
with the verbatim edited body). +2 tests; full core+cli suite green
(4924 pass / 0 fail / 2 skip). Zero LLM calls. core+cli dist rebuilt +
committed; backend pre-existing TS2322 in review.ts is unrelated and untouched.
Not merged, not pushed; arete-reserv untouched.

---

## 2026-06-16 — findings #7 + #8 fix (winddown approval doc)

Branch: `feat/winddown-approval-doc` (worktree `winddown-approval`). Zero LLM calls.

**FIX A (finding #8) — owner/direction render + `direction: none` split out.**
The checklist renderer showed tier + text only, and `direction: none` action
items (other people's actions — 6/8 on claim-portal-comms) were pre-filled
`[x]` in the MAIN "Action items" list, burying John's real to-dos. Data
already existed in `staged_item_owner` frontmatter (and inline action-item
text). `parseStagedItemOwner` already lived in staged-items.ts — wired it in:
- `ChecklistItemMeta` gains `direction` / `ownerSlug` / `counterpartySlug`.
- `buildChecklistMeeting` populates them, frontmatter `staged_item_owner` taking
  precedence over inline text-parsed values.
- New `ownerTag(meta)` renders the suffix relative to workspace owner
  `john-koht`: `i_owe_them` → `· (you → @counterparty)`; `they_owe_me` →
  `· (@owner → you)`; `none` → `· (@owner's — FYI)`. Empty for decisions/
  learnings + untyped items. Applied to action-item lines only.
- `renderMeeting` splits action items: John's (`i_owe_them`/`they_owe_me`) stay
  in the pre-filled `### Action items` list; `direction: none` route to a new
  `#### Others' actions (FYI)` subsection rendered FORCE-UNCHECKED `[ ]` (D7
  visibility-only — never reads as John's to-do). FYI items keep their item
  anchors, so apply (which only acts on `[x]` lines + treats `none` as inert)
  ignores them harmlessly — no finding-#6 round-trip regression. All-`none`
  meeting → no `### Action items` heading, everything under FYI (desired
  collapse, e.g. eng standup).
- +7 tests in winddown-checklist.test.ts (ownerTag per direction; suffix on
  actionable lines; none→FYI un-pre-filled; all-none collapse; FYI anchor
  recoverable + `[ ]`; buildChecklistMeeting from frontmatter AND inline-text
  fallback). Files: `packages/core/src/integrations/winddown-checklist.ts`,
  test file. staged-items.ts untouched (parser already present).

**FIX B (finding #7) — wait-gate hardening + route execution through apply.**
SKILL.md only (daily-winddown). Mid-review, a question + partial CT1 edit was
treated as approval and the agent hand-ran the resolves/week.md batch
conversationally, bypassing apply's confirm summary.
- Step 5 gains an explicit **WAIT-GATE** block: a clarifying QUESTION → answer
  + re-wait; a PARTIAL EDIT ("keep CT1 open", "reframe X") → absorb into the
  persisted doc + re-wait; mixed → both, still wait. A question/edit NEVER
  trips execution even when it names CTs/actions. Only an explicit proceed
  (`proceed`/`approve all`/`run 1,3`/`CT1,CT2`/`approve all staged`) OR the
  user running `arete winddown apply <date>` executes anything. Sharpened the
  "free-form pushback / questions" response-list line to point at the gate.
- Step 6 (checklist apply) gains a **ROUTE ALL EXECUTION THROUGH `apply`**
  paragraph: `arete winddown apply <date>` is the single gated commit point;
  do NOT hand-run `commitments resolve` / `meeting approve` / week.md edits as
  the primary path. Conversational primitives only for things outside apply's
  surface (MCP sends apply echoes as DRAFT), and only after an explicit
  proceed. File: `packages/runtime/skills/daily-winddown/SKILL.md`.

**Wrap.** core+cli dist rebuilt + committed (winddown-checklist.js/.d.ts).
Full core+cli suite green: 4931 pass / 0 fail / 2 skip. Zero LLM calls.
Not merged, not pushed; arete-reserv untouched.
Re-sync reminder: `cp` SKILL.md → `arete-reserv/.arete/skills/daily-winddown/`;
dist auto-picked-up via npm link.
