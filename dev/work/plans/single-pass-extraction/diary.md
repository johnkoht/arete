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
