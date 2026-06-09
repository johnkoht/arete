---
title: "Phase 8 followup-7 — build report"
slug: phase-8-followup-7-build-report
created: "2026-06-01"
parent: phase-8-followup-7-reconciler-dedup
status: built; awaiting eng-lead review
---

# Build report — Phase 8 followup-7 (Reconciler dedup, Rule 4)

Built per plan revised post review-1 (C1 recurring-item guard, C2
mirror-pair signature exclusion, C3 Rule 1 precedence — all mandatory).

## Pre-flight

- Branch: `worktree-arete-v2-chef-orchestrator` (parent worktree per
  hotfix shape). PASS.
- Recent commits include followup-6 build-report `82144888`. PASS.
- Plan + pre-mortem at
  `dev/work/plans/arete-v2-chef-orchestrator/phase-8-followup-7-reconciler-dedup/`.
  PASS.

## What shipped (AC by AC)

### AC1 — Rule 4 added to Step 2 reconciler (+ C1/C2/C3 revisions)

Source: `packages/runtime/skills/daily-winddown/SKILL.md`.

Inserted new `#### Rule 4 — Intent → already-tracked open commitment`
sub-section between Rule 3 and Rule 1. Step 2 intro updated from
"three skip rules" to "four skip rules" with explicit cheap-first
rule-order note: `Rule 3 → Rule 4 → Rule 1 → Rule 2`.

Rule 4 prose includes:

- **Concrete match** at ≥0.7 Jaccard + counterparty match + direction
  match → propose collapse with `skip staging this item (already
  tracked as commitment <ID>)`. Doc-pointer to `commitments.ts:233-239`
  for the shared `normalize()` helper + `jaccardSimilarity()` from
  `utils/similarity.js`.
- **Direction guard** (required match): open commitment direction
  must match loop kind direction.
- **C1 — Recurring-item guard** (pre-mortem R3 mitigation): if matched
  open commitment is < 5 days old AND `source_meeting.recurring: true`,
  drop to `## Uncertain` regardless of Jaccard. Neutralizes the
  weekly-1:1 cadence false-collapse John's workflow most directly
  exposes.
- **C2 — Mirror-pair signature exclusion**: two open commitments with
  same counterparty + ≥0.9 overlap + opposite directions → exclude
  BOTH from Rule 4 candidate set, surface to `## Uncertain` with
  `parser-bug-suspect` flag. Prevents Rule 4 from masking the
  parser-bug mirror-pair issue.
- **C3 — Rule 1 precedence**: if matched commitment ID also appears
  as a Rule 1 fulfillment candidate in the same loop ledger, prefer
  the Rule 1 CT line (resolve + cite fulfillment) over the Rule 4
  CT line (skip-stage).
- **Fuzzy band** (0.5 ≤ Jaccard < 0.7, or counterparty
  name-string-only fallback, or direction-ambiguous) → `## Uncertain`.
- **Below 0.5** → no match; proceed to Rules 1 + 2 then normal stage.

Commit: `8df51795`.

### AC3 — Step 4 output template (CT4 example)

Added a `[CT4]` example to the `## Closed today (proposed)` output
template demonstrating Rule 4 collapse rendering with the
`arete:commitments/<8-char ID>` evidence pointer scheme (parallel to
`slack:`, `calendar:`, `meeting:` schemes in Rules 1-3). Example shows
Jaccard score + counterparty-match call-out + direction + age inline
so the user can verify the match at approve time.

Commit: `ca0df803`.

### AC4 — Test (with C3 regex assertion)

Added nested `describe('AC4 — Rule 4 dedup against open commitments
(Phase 8 followup-7)')` block to
`packages/core/test/services/chef-orchestrator-skills.test.ts` inside
the existing `Phase 8 — daily-winddown cross-skill chef-orchestrator`
block.

11 new assertions:

1. Rule 4 framing present (`/Rule 4.*Intent.*already-tracked.*commitment/i`).
2. 0.7 Jaccard threshold cited (`/0\.7\s+Jaccard|Jaccard.*0\.7/`).
3. `arete:commitments/` evidence pointer scheme present.
4. Direction guard language present.
5. Exactly **4** `#### Rule ` sub-sections in Step 2 (was 3 pre-followup-7).
6. Rule order `3 → 4 → 1 → 2` per `/3.*4.*1.*2/s`.
7. C1 recurring-item guard + 5-day age threshold.
8. C2 mirror-pair signature exclusion with ≥0.9 + opposite directions
   + parser-bug-suspect flag.
9. **C3 Rule 1 precedence** regex `/Rule 1.*precedence|prefer.*Rule 1/i`
   (mandatory per plan revisions).
10. Doc-pointer to `commitments.ts:233-239`.
11. CT4 example present in Step 4 output template.

Commit: `9c6c9b36`.

### AC2 — Reuse `CommitmentsService.reconcile()` logic (doc-only)

Per D7 / D4: Rule 4 stays SKILL.md prose, NOT a new CLI verb. Prose
includes the doc-pointer to `commitments.ts:233-239` so agent + code
share one similarity definition by reference. Verified by AC4
assertion #10.

### AC5 — Discipline ledger (actual)

Plan estimate: ~+68 markdown + ~+25 test, net code 0. Actual:

| Item | LOC actual |
|---|---|
| `packages/runtime/skills/daily-winddown/SKILL.md` Step 2 Rule 4 + intro update | ~+100 markdown |
| `packages/runtime/skills/daily-winddown/SKILL.md` Step 4 CT4 example | +7 markdown |
| `packages/core/test/services/chef-orchestrator-skills.test.ts` new describe block | +103 test |
| `dist/AGENTS.md` timestamp regen | +1 / -1 |
| **Net (markdown source)** | **~+107** |
| **Net (test)** | **+103** |
| **Net (non-test code)** | **0** |

Markdown delta came in higher than estimate (+107 vs +68 plan estimate
of +60 for Rule 4 body) because C1 + C2 + C3 guards each required
their own bullet + rationale paragraph per review-1 mandate (plan
revisions were locked AFTER the +60 estimate). Test delta came in
larger too (+103 vs +25) because C1 / C2 / C3 each got dedicated
assertions per the review-1 mandate. Substitution argument unchanged:
prose-only ledger; no Core / CLI change; cumulative ledger from
7a+7b+8 stays negative on the code-only line.

### AC6 — Rollback path

`git revert 1cacadae 9c6c9b36 ca0df803 8df51795` cleanly restores the
three-rule reconciler. No data migration, no fork drift. SKILL.md +
one test file are the only artifacts.

## Test counts

Per-file `npx tsx --test`:

| Test file | Tests | Pass | Fail |
|---|---|---|---|
| `packages/core/test/services/chef-orchestrator-skills.test.ts` | 148 | 148 | 0 |
| `packages/core/test/services/commitments.test.ts` | 102 | 102 | 0 |
| `packages/core/test/services/tasks.test.ts` | 109 | 109 | 0 |
| `packages/core/test/services/area-memory.test.ts` | 41 | 41 | 0 |
| `packages/core/test/services/topic-memory.test.ts` | 52 | 52 | 0 |
| `packages/core/test/services/meeting-frontmatter.test.ts` | 9 | 9 | 0 |
| `packages/core/test/services/meeting-extraction.test.ts` | 290 | 290 | 0 |

All adjacent tests pass clean. No regressions.

## Dist rebuild

`npm run build` ran clean (no errors; pre-existing chunk-size warning
unrelated). Only `dist/AGENTS.md` mtime/timestamp regen'd — followup-7
is prose-only (SKILL.md served from `packages/runtime/` at runtime, not
bundled into compiled JS/TS), so no compiled output changed.

Commit: `1cacadae`.

## Commit graph (newest → oldest)

```
1cacadae phase-8-followup-7(dist): rebuild
9c6c9b36 phase-8-followup-7(test): Rule 4 prose assertions + Rule 1 precedence (AC4+C3)
ca0df803 phase-8-followup-7(runtime): CT4 closed-today example (AC3)
8df51795 phase-8-followup-7(runtime): add Rule 4 reconciler dedup with C1/C2/C3 guards (AC1+revisions)
```

Four commits, each `phase-8-followup-7(<area>):` prefix per discipline.

## Concerns for reviewer

1. **Rule order regex is loose**: `/3.*4.*1.*2/s` matches any
   occurrence of those digits in that sequence somewhere in the file.
   It catches the cheap-first order in the Step 2 intro AND survives
   if Rule 4's body content shifts. But it would also pass falsely
   if e.g. some unrelated prose mentioned years `2023, 2024, 2021, 2022`.
   For followup-7's hotfix shape this is acceptable per loose-regex
   convention (Phases 2 + 3.5 + 7a + 8); a stricter assertion would
   match the literal "Rule 3 → Rule 4 → Rule 1 → Rule 2" rule-order
   string but would brittle against prose drift. Flagging for review
   visibility.

2. **C1 guard ships with hard 5-day threshold**. Plan/pre-mortem
   parking-lot acknowledges this is a starting point; soak findings
   may push it to e.g. 7 days (match weekly cadence) or split by
   meeting frequency. The literal `5 days` is asserted in the test,
   so any future tuning surfaces as a deliberate prose + test edit
   (auditable).

3. **C2 mirror-pair signature exclusion uses 0.9 overlap**. This is
   a higher bar than the parent Rule 4 0.7 threshold deliberately —
   only a near-identical text pair counts as the parser-bug
   signature. If parser bugs emit pairs at 0.85 overlap (e.g.,
   slightly different phrasing on each side), C2 won't catch them.
   Pre-mortem R5 + Phase 5 parser-bug fix are the structural
   solution; C2 is symptomatic relief.

4. **C3 Rule 1 precedence is prose-only cross-rule join**. The chef
   agent has to remember: "did Rule 4 match? then check if that
   commitment ID also surfaces in Rule 1's candidate set — if yes,
   prefer Rule 1." Pre-mortem R4 flags this as the kind of join that
   reads cleanly in prose but adds reasoning steps for the agent.
   Soak-window detection signal: user sees CT4 `skip-stage` when
   they actually fulfilled the commitment via slack today → flagged
   for triage.

5. **Rule 4 in Step 2 is now 87 lines of prose** (vs Rule 1 at ~36
   lines, Rule 2 at ~30, Rule 3 at ~15). Largest sub-section in
   Step 2 by weight. Pre-mortem R6 flagged agent-cognitive-load —
   the per-guard rationale paragraphs add length but each guard is
   load-bearing (R3/R4/R5 mitigations are all live failure modes).
   Acceptable per the prose explicitly state "evidence required" +
   "fuzzy → Uncertain" + "no auto-execute" reinforcement.

6. **No new tests for runtime behavior** — per D7, no end-to-end
   reconciler test exists. AC4 is prose-regex only. Soak window
   (7 days post-merge per plan) is the validation layer. First
   winddown post-merge should be hand-verified by the user
   spot-checking every Rule 4 proposed collapse.

## Soak window onboarding note

Per plan recommendation: **first 7 winddowns post-merge, user
spot-checks every Rule 4 proposed-collapse** against the named
commitment to confirm semantic match. Detection signals:

- **R3 (recurring-item false positive)**: user marks a Rule-4-collapsed
  commitment as resolved, but the underlying obligation persists
  (weekly status not actually sent). Triage: ship a v2 with tighter
  recurring guard (e.g., 7-day window) OR revert.
- **R1 (silent over-dedup)**: user notices a fresh capture never
  surfaced; finds it was Rule-4-collapsed against a textually-similar
  but semantically-different commitment. Triage: revert + reassess
  0.7 threshold.
- **R2 (threshold tuning wrong)**: count of Rule 4 proposed-collapses
  approved vs rejected. If reject-rate > 30%, raise threshold. If
  user manually creates duplicates (Rule 4 didn't fire when it
  should have), lower threshold.

## Ready for eng-lead review

All four ACs (AC1, AC2 doc-pointer, AC3 CT4, AC4 tests) gated.
All three mandatory revisions (C1, C2, C3) in prose + asserted in
tests. Test sweep clean. Dist rebuilt + committed.
