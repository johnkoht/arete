# Independent review — single-pass-extraction + chef-holistic-reconcile (joint)

**Date**: 2026-06-10
**Reviewer**: independent second opinion (not involved in drafting, the benchmark, or the pre-mortem)
**Inputs read**: both plan.md files, benchmark-evidence.md, pre-mortem.md, review-plan SKILL.md
**Code spot-checks**: meeting-extraction.ts (caps, priorItems/exclusion-list, wiki const), meeting-processing.ts (0.65/0.8 thresholds, Parser-dropped), meeting.ts (--reconcile), agent.ts (reconcile + auto-approve), daily-winddown SKILL.md (jira 446–448, Rule-4 0.6 band at 583/632–642, directives, R7), weekly SKILL.md:111, models/entities.ts:571, models/integrations.ts, workspace meeting files (golden day + both series chains exist), MCP connector inventory.

## Verdict: REQUEST-CHANGES

The core thesis is sound and the evidence is real — I verified the cap-slice, the silent 0.65 `continue`, the Parser-dropped surface, the Rule-4 band, the flat batch window, and the series-chain files all exist as claimed. The pre-mortem was good. But the **revision response to the pre-mortem is incomplete and in one place actively wrong** (a planned test would codify the exact regression the pre-mortem flagged), there is a **cross-plan contradiction neither document noticed** (extract-time suppression vs. arc preservation), and several gate ACs are **unfalsifiable or gameable as written**. All fixes are plan-text-level; no re-investigation is needed.

---

## Findings (by importance)

### F1 — CRITICAL — Cross-plan contradiction: priorItems "SKIP framing" destroys the arc before the engine exists
**Hits**: SP § Layer 1 ("Same-day earlier extractions" row), SP D1/W2; CHR D3, D4, AC3.

Verified in code: the existing priorItems mechanism is `buildExclusionListSection` (meeting-extraction.ts:884–905) — it injects prior meetings' items into the prompt with **"positive 'SKIP' framing"**: the model is instructed *not to emit* items earlier meetings already produced. That is cross-meeting dedup *inside* extraction.

- SP's Layer-1 table cites this mechanism as "exists" and claims the second meeting will "emit `continuation_of`/duplicate marker itself." The existing mechanism does the **opposite** of marking — it suppresses. Nothing in W2 scopes rewriting the exclusion framing into mark-don't-skip framing.
- CHR D3 declares extraction "pure — no inline cross-meeting dedup," and D4 requires the flip-flop arc to survive to the engine. If meeting 2's prompt says SKIP what meeting 1 emitted, the same-day supersession (Anthony de_002 → workshop de_004, CHR's own AC3 fixture) can be silently destroyed at the source. The W7 raw-extraction snapshots **cannot detect this** — the raw snapshot is already arc-free. This is collapse-to-oldest reborn one layer up, the exact artifact both plans exist to kill, and it is invisible to every soak metric in either plan.

**Change**: SP W2 explicitly replaces the exclusion-list section with a "known items — re-emit with `continuation_of`/`supersedes` marker, never silently skip" block. Extend SP AC6: on the 6/9 chain replay, the workshop run must *re-emit* the superseding consolidation decision (marker attached), not omit it. CHR AC3's fixture must be generated from actual SP output for that day, not hand-built — otherwise AC3 tests an input shape production will never produce.

### F2 — CRITICAL — Roughly half the pre-mortem's fold-in checklist was silently dropped; one dropped item is now an enshrined regression
**Hits**: both plans vs. pre-mortem § "Mitigations to fold into the plans".

The plans visibly folded R1 (tier-derived approval + AC11), R2 (raw snapshots), R3 (sequencing + degraded contract), R4/R13 (drop-point enumeration + Parser-dropped), R5 (grep audit), R9 (jira respec). The following were **silently dropped with no recorded rationale** — a reader can't tell "rejected" from "forgotten":

| Dropped item | Where it bites |
|---|---|
| **Threshold band (CHR risk 12)** | CHR D5 still says "One Jaccard threshold (0.7)"; W2 nominates at 0.7; and Layer-1's **"threshold-unity (one constant, all paths)" invariant test would make deleting Rule 4's deliberate 0.6 + 0.5–0.7 fuzzy band a *passing* condition**. Verified: daily SKILL.md:583 sets 0.6 "because Rule 4 acts pre-stage"; :632–642 routes the 0.5–0.7 band to Uncertain with parser-bug-suspect flagging. As specced, 0.6–0.7 pairs are never even nominated. This is worse than pre-revision: a test codifies the bug. |
| Weekly decoupling (risk 11) | CHR sequencing still ships W5 *before* the W7 soak and W6; AC12 still gates on a weekly replay for which no week-scale ground truth exists. |
| Soak-validity event minima (risk 2, part 3) | CHR AC5 has no "≥2 real-duplicate days + ≥1 arc day (synthetic if needed)" requirement — a quiet week still passes the soak vacuously, raw snapshots notwithstanding. |
| SP-rollback-pauses-soak (risk 3) | The degraded-mode contract was folded but the soak-clock rule wasn't. Irony: degraded mode makes the engine *survive* legacy input, which means a mid-soak SP rollback now silently contaminates the soak report that gates irreversible W6 instead of crashing it. |
| D4 permanent telemetry (risk 6) | SP D4 still says "if silent for ~2 weeks, delete" — deleting the only model-independent drift canary right before the `frontier` alias inevitably moves. |
| AC12 cost bound (risk 18) | SP ACs end at AC11. No per-meeting spend bound anywhere. |
| Committed scorecards (risk 16) | SP W5 and CHR Layer 2 both still say "uncommitted." See F4. |
| W1.5 negative AC (risk 8) | AC6 tests only positive continuation. No AC that an ad-hoc John+Anthony escalation does NOT get series context / get collapsed into the weekly. |
| open_questions surface (risk 15) | D3 adds the category; W1/W4 never itemize staging IDs, approval UX, render, wiki feed. |
| 'reconciled' provenance forever-reader + test (risk 14); UI-approval interleaving test (risk 17) | CHR W6 still says "readers migrate"; D5 says "replaces". Neither test exists in the plan. |

**Change**: one pass over the pre-mortem checklist; each box either folded or marked "REJECTED: <reason>". Non-negotiable subset: fix D5/Layer-1 to "one *duplicate-certain* constant (0.7), preserve the 0.5–0.7 nomination band routing to Uncertain, Layer-1 test pins the band"; decouple W5 weekly per the pre-mortem; add soak event minima to AC5; add the rollback-pauses-soak rule to W7.

### F3 — HIGH — Several gate ACs are unfalsifiable or gameable as written
**Hits**: SP AC2, AC3, AC7, AC11; CHR AC5, AC6.

- **SP AC2** (blocker recall 100%): no enumerated ground-truth blocker list exists in any durable artifact — benchmark-evidence.md:76 says full naive outputs "live in the 2026-06-10 Claude Code session transcript." An AC scored against a chat transcript is unfalsifiable in three weeks, let alone at the next model bump.
- **SP AC7** ("judge grade ≥ B+"): no rubric, judge prompt unwritten, judge is the same model family that tuned the extraction prompt. A motivated builder iterates the judge prompt until B+ appears. Same circularity infects AC3's "judge verdict" junk definition and AC5's "judge-checked" closeability.
- **SP AC3** ⚠-coverage ≥80% of judged-junk: expected junk n ≈ 9–15 items; 80% on that n is one-item noise.
- **SP AC11** median pending ≤25/winddown: the motivating failure was the *richest* meeting; median hides exactly that tail. A compliance-workshop day at 80 pending passes a median gate.
- **CHR AC6** "0/10 or explained": "or explained" is an open escape hatch on the *only* metric guarding silent data loss (the pre-mortem's whole point in R7 was that this failure self-conceals).
- **CHR AC5** "≥90% agreement": agreement denominator undefined (union of nominations? inline decisions? per-item or per-pair?).

**Change**: commit to the plan dir a ground-truth manifest (items + tier labels, incl. the enumerated blocker set) and the eval scorecards (scripts stay uncommitted per house convention — *results* are not the harness). Write the judge rubric into the plan with anchored grade definitions; require John to hand-audit ONE full meeting end-to-end per gate (not only judge-flagged items — flagged-only sampling never catches what the judge wrongly passes). AC11 gains a p90 bound (e.g., median ≤25 AND p90 ≤40). CHR AC6: any confirmed sampled false collapse = soak window restarts after fix; delete "or explained". Define AC5's denominator.

### F4 — HIGH — Jira connector almost certainly doesn't exist; resolve the spike before approval, not during W3
**Hits**: CHR W3, D6, "Why now" #5, R3 rule extension, AC11.

The current harness connector inventory has Slack, Gmail, Calendar, Drive, Krisp, Granola, monday.com, Superhuman, Box — **no Jira/Atlassian MCP**. W3's "spike precondition" is a five-minute check that will very likely fail on day one. Carrying a probably-cut work item through planning distorts the effort picture and leaves jira evidence threaded through the engine spec (W1 rule definitions, R1 ledger, Rule 1 extension) for a source that won't exist.
**Change**: run the spike now. If no connector: move Jira wholesale to follow-ups, strip it from W1's rule definitions (leave a one-line extension point), keep AC11's degradation posture as the permanent v1 statement. If a connector exists: name it in the plan.

### F5 — MEDIUM-HIGH — The golden-day oracle is single-week, single-author, legacy-shaped, and self-judged
**Hits**: SP W5 corpus; CHR Testing Layer 2, AC1–AC4.

2026-06-09 is a *good* stress day (6 meetings, richest workshop, two real parser-bug mirror pairs, a genuine same-day supersession — all confirmed present in the workspace), but as the sole regression oracle it has four correlated weaknesses: (a) all ground-truth meetings come from one week of one calendar (no John-absent meeting, no pure-status/zero-signal meeting, no badly garbled transcript beyond the truncated shadowing session); (b) ground truth, extraction prompt, and judge protocol share an author and a model family — nobody independent has audited any of it; (c) the day is legacy-shaped for CHR purposes (pre-mortem risk 10 — only half-fixed: the "boring second golden day" recorded during W7 will incidentally be single-pass-shaped, but the plan frames it only as a low-signal test and AC1–AC4 still gate exclusively on the legacy-shaped day); (d) it is *atypically rich* — an oracle tuned on the hardest day says little about the modal Tuesday, which is where approval-volume fatigue actually accrues.
**Change**: state in CHR Layer 2 that the second golden day is the *representative-input* gate (single-pass-shaped) and give it teeth (at minimum: zero false collapses, sidecar tier sanity). Add one deliberately boring/low-signal meeting and one John-as-pure-observer meeting to the SP blind set. Record blind-set ground truth for at least one meeting *before* looking at any model output.

### F6 — MEDIUM — No abort tripwire for the soaks; the primary user is the test rig for ~7–10 weeks
**Hits**: SP Sequencing/Rollback; CHR W7/Rollback.

Realistic calendar: SP W1 (a ~20-file direction audit plus parser, approval rework, resolver — this is 40% of SP disguised as one line) ≈ 1–2 weeks → W5 eval plus an *unbudgeted* Opus-4.6 retune loop if ⚠/volume behavior drifts from the Fable-observed benchmark → W4 → flip → 2-week detector soak → CHR gated on all of that → CHR build → ≥5-day shadow soak (longer if event minima from F2 are adopted and the calendar is quiet) → W6 → weekly. That's 7–10 weeks during which every winddown John runs is the experiment. Both plans define rollback *mechanisms* but no rollback *triggers* — the pre-mortem itself named "primary user churns" as project-killing, yet nothing says when to pull the cord.
**Change**: add explicit abort criteria to the SP soak (e.g., 3 consecutive winddowns > N minutes wall-clock or pending count > X ⇒ auto-revert to legacy, soak postmortem before retry) and a wall-clock-per-winddown line to the soak telemetry (the pre-mortem suggested it; the plan's AC11 counts items, not John's minutes).

### F7 — MEDIUM — Work items mis-sized or mis-placed
**Hits**: SP W1, W6; CHR W1, W2.

- SP W1 bundles the ~20-file direction audit, dual-format parser, tier→approval rework, and the unscoped open_questions surface. Split W1a (audit + models + `none` inertness tests) from W1b (parser + staging) so the audit can't be timeboxed away. Note specifically: `commitments-hash-v2.ts` and the dedup pipelines are in the consumer list — verify `direction` does not participate in content-hash identity before adding a third value.
- SP W6 (agentic tool loop) is the weakest-evidenced item in either plan (Layer 1 alone won the benchmark) and its timing is unspecified relative to CHR: if W6 flips on during CHR's W7 soak, the soak's input distribution shifts mid-window. Cut W6 to a follow-up plan, or pin it explicitly after CHR W6.
- CHR W1 hides the hardest novel design in the initiative — arc-assembly rules (D4) — inside "spec, rules lifted verbatim." Lifting is clerical; arc assembly is new, has exactly one test fixture (AC3), and is the project-memory-flagged risk ("dedup hiding arc by collapse-to-oldest"). Give it ≥3 worked examples in the spec (flip-flop, A→B→A reversal, three-meeting chain) and fixtures for each.
- CHR W2's `--ledger <json>` as a CLI arg won't survive a real day's ledger size; make it a file path. (Nit.)

### F8 — LOW — Coherence nits
- Pre-mortem cross-reference labels in the plans don't match the pre-mortem's own numbering (CHR AC6 cites "pre-mortem R5" = pre-mortem risk **7**; "R-jira" = risk 9; SP cites R1/R3 = risks 1/3). Future readers will mis-look-up. Renumber or use stable slugs.
- SP W6 says "the 4 read-only tools"; Layer 2 lists **5** (read_topic_page, list_commitments, read_meeting, search_wiki, find_meetings).
- CHR degraded contract "missing ⚠ → trust confidence" is fine for legacy input, but post-SP-W3 the confidence *filter* semantics changed to staging-signal-with-persistence — say which semantics the engine assumes.

---

## What the pre-mortem missed

The pre-mortem was strong on what it checked (I re-verified its corrections; all hold). It missed:

1. **The priorItems exclusion-list contradiction (F1)** — it audited the *mechanical* dedup paths (Jaccard, wireExtractDedup) but not the *prompt-level* dedup channel. SKIP-framed exclusion lists are inline cross-meeting dedup too, and they defeat arc preservation upstream of everything the pre-mortem fixed in W7.
2. **Whether its own mitigations got applied.** A pre-mortem that produces a checklist needs a closure step; ~9 of ~20 boxes were dropped without trace, and one revision (threshold-unity test) inverted a mitigation into a regression-by-test (F2).
3. **The connector inventory check (F4)** — it flagged Jira MCP availability as "unverified" but the verification is trivially available; it should have just been done.
4. **Gameability of the judge-anchored ACs (F3)** — it caught the metric-blindness of AC6 but not that B+ grades, junk verdicts, and closeability checks all route through a judge with no rubric and shared authorship with the system under test.
5. **Soak abort triggers (F6)** — it named user-churn as the kill scenario and approved multi-week soaks without defining when to abort one.
6. **SP-W6 × CHR-soak interleaving (F7)** — the dependency seam it analyzed was SP-rollback; the SP-*forward*-motion seam (tool loop landing mid-soak) is unsequenced in both plans.

## Simpler path neither document considered

The minimal change that kills collapse-to-oldest is **moving the existing `reconcileMeetingBatch` call from per-file extract time (Step 1h) to a single day-level call at Step 2** — no new engine, no ledger spec, no provenance migration; days of work, not weeks. It doesn't fix threshold drift or weekly parity, and CHR's engine is the better end state — but as a Stage-0 it de-risks the supersession goal immediately and gives CHR a cleaner baseline to soak against. Recommend adding it as an explicit considered-and-decided item (do it, or record why not).

## If I could only change 3 things

1. **Fix the extract-time suppression seam (F1)**: SP W2 rewrites the exclusion list to mark-don't-skip; AC6 extended to require re-emission of superseding items; CHR AC3 fixture generated from real SP output.
2. **Close the pre-mortem loop (F2)**: fold or explicitly reject every checklist item — at minimum un-break D5/threshold-unity (preserve the 0.5–0.7 Uncertain band), decouple the weekly rewire, add soak event minima + rollback-pauses-soak.
3. **Make the gates real (F3 + F6)**: committed ground-truth manifest and scorecards (including the enumerated blocker list), written judge rubric + one full-meeting human audit per gate, AC11 p90 bound, AC6 without "or explained", and concrete soak abort criteria.
