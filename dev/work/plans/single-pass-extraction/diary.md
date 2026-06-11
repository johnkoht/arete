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
