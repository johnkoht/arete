# Benchmark evidence — single-pass extraction (2026-06-10 session)

Ground truth produced during the 6/9 winddown audit + two benchmark runs. This file
is the corpus reference for the W5 eval gate. Naive runs used the same prompt shape:
full transcript + ~5 lines of context, no caps, closeability rule, one-utterance-
one-type, ⚠-if-unsure, importance tiers (blocker/high/normal), open questions.

## Corpus (5 meetings, transcripts in arete-reserv/resources/meetings/)

| Meeting | File | Pipeline baseline | Baseline source |
|---|---|---|---|
| Compliance workshop 6/9 | `2026-06-09-glance-20-compliance-workshop-heather-kim.md` | 4 ai / 7 de / 6 le | staged sections (pre-approval) |
| Anthony 1:1 6/9 | `2026-06-09-anthony-john-weekly.md` | 7 ai / 3 de / 3 le (+2 skips) | reconstructed below (file mutated by UI approval) |
| Nate 1:1 6/8 | `2026-06-08-john-nate.md` | 1 ai / 3 de / 2 le (+1 skip) | Approved sections in file |
| Sprint planning 6/4 | `2026-06-04-glance-sprint-planning-and-retro.md` | 2 ai / 2 de / 2 le | Approved sections in file |
| Shadowing (Amanda) 6/4 | `2026-06-04-adjuster-shadowing-session-amanda-handy.md` | 0 ai / 0 de / 5 le | Approved sections in file |

## Anthony 6/9 baseline (reconstructed — original staged list pre-approval)

Actions: ai_001 UX section in future PRDs (→ skipped, non-closeable);
ai_002 review status-letter user stories + mockups; ai_003 ping Jess re FE tickets +
send epic; ai_004 tech spike w/ Nick+James (recipient table); ai_005 talk to Phil re
Anthony scope; ai_006 confirm consolidation rules w/ Compliance (→ chef-skip,
answered same-day at workshop); ai_007 start recipient-table TDD (dup-flagged vs
commitment `acc2a220`).
Decisions: de_001 PRDs get UX section; de_002 V1 may default per-exposure no
consolidation (superseded same-day); de_003 Kafka event-driven recipient table.
Learnings: le_001 PRDs w/o UX force eng-written user stories; le_002 Kafka serial
consumers; le_003 Anthony isolation costs velocity+morale.

## Result 1 — Compliance benchmark (architecture A/B, model confound ruled out)

Pipeline misses (found by transcript audit, confirmed): (1) license-profile
auto-assignment launch blocker + interim plan ["it can't roll out without that"],
(2) liability draft→final workflow w/ CA adverse-decision trigger, (3) subro/
adverse-carrier exclusion, (4) Kim's quality-audit-of-letters ask, (5) James's
claim-narrative source validation (this week).
Naive single-pass: **5/5 misses recovered + 17/17 pipeline staged items also
captured**; 24 decisions (6 blocker) / 8 actions / 19 learnings / 7 open questions;
0 fabrications; repaired transcript garbling ("01:30 rule"→15/30, "anrogation"→
subrogation). New real items neither audit nor pipeline had: letter-content
minimum (what+from whom — compliance-mandatory), "don't tell adjusters the
automation end-goal", track recommendation-vs-adjuster-behavior, John→Kim template
precondition.

## Result 2 — Junk test (4 routine meetings)

| Meeting | Naive items | Judged junk | Notes |
|---|---|---|---|
| Anthony 1:1 | 33 | ~1 | Recovered ALL baseline items. Correctly classified ai_001 as decision + closeable instance (⚠). New real: **John owns all Glance 2.0** (biggest fact of the meeting, pipeline missed entirely), 3-4 eng team build, auto-enroll recipient decision, manager-check action. Caught Krisp summary contradicting transcript ("I choose to get blocked"). |
| Nate 1:1 | 26 | ~1 | All baseline recovered; finer-grained deferral decisions (not junk); self-flagged redundancy between its own items. |
| Sprint planning | 21 | ~3 | All baseline recovered. **Marked all actions `direction: neither`** — refused the forced binary; GitHub-OOO-setting class learnings = the junk. |
| Shadowing | 22 | ~4 | 16 learnings vs baseline 5 — verbosity not falsity (8-external-systems map, Copilot-skip rationale = good discovery material; Amanda's personal habits = the junk). 2 routine-work actions correctly ⚠-flagged "not John's". |

**Totals: ~102 items, ~9% junk, 0 fabrication, marginal items overwhelmingly
⚠-self-flagged.**

## Failure-mode → mechanism map (from the 6/9 audit)

| Failure | Mechanism | Plan fix |
|---|---|---|
| Blocker dropped | `CATEGORY_LIMITS` first-N-in-response-order slice (`meeting-extraction.ts:1637`); overflow → unpersisted `validationWarnings` | no caps (D1) + persist everything (AC5) + tiers (D3) |
| Triple-record | within-category-only Jaccard dedup | one-utterance-one-type prompt rule (D6/W2) |
| Non-closeable actions | rubric lacks completion-condition test | closeability rule (D6) |
| Mirror-pair commitments | two-value direction enum forces binary on non-John meetings | `direction: none` (D3, AC4) |
| Krisp-summary echo | pipeline trusts recorder summary over transcript | full-transcript single pass (D1) |

## Caveats for the eval gate

- Benchmark/junk-test agents ran on Fable; production `extraction: frontier` =
  Opus 4.6. W5 must run through the real `callLLM` path — the gate is on
  production-model output.
- Shadowing transcript is truncated mid-session (~27 min); fine for eval, noted.
- Anthony/Nate/sprint/shadowing baselines are post-approval reconstructions;
  approved sections preserve full pipeline output, so reconstruction is faithful.
- Full naive outputs live in the 2026-06-10 Claude Code session transcript; this
  file preserves the scoring-relevant facts.
