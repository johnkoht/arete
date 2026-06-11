# Judge rubric — single-pass extraction eval (W5 / AC3, AC5, AC7)

Committed per the 2026-06-11 adjudication (review F3: "judge grade ≥ B+" with
no rubric, judge prompt unwritten, and shared authorship with the system under
test is gameable). This rubric is the FIXED scoring contract: the judge prompt
embeds it verbatim; iterating the judge prompt to move grades without changing
this file is out of bounds. The rubric was written BEFORE any W5 gate run.

## Judge setup

- The judge agent receives: the full transcript, the extraction output
  (both modes when comparing), and this rubric. It does NOT receive the
  ground-truth manifest for blind-set meetings (that would leak).
- Judge model: any frontier-tier model; record model id in the scorecard.
- Anti-circularity rails (F3): (1) the judge audits AGAINST THE TRANSCRIPT,
  item by item, not impressionistically; (2) one full meeting per gate run is
  additionally audited end-to-end by John — including items the judge passed;
  (3) judge prompt + this rubric are committed, so a grade can be re-derived
  later (model bumps, prompt drift).

## Item-level verdicts (every extracted item gets exactly one)

| Verdict | Definition (anchored) |
|---|---|
| **REAL** | Traces to something actually said; a reasonable PM would want it recorded; correct type. |
| **REAL-MISTYPED** | Traces + worth recording, but wrong category (e.g., standing policy as action item, status update as decision). |
| **VERBOSE** | Traces + true, but below recording threshold for this meeting shape (observational detail, finer-grained restatement of another kept item). NOT junk for scoring if ⚠-flagged. |
| **JUNK** | "John would never want this recorded": personal trivia, logistics, common knowledge, transcript artifacts. |
| **FABRICATION** | No transcript trace, or materially distorts what was said (wrong owner, inverted decision, invented deadline). Summary-echo that contradicts the transcript counts here. |

Closeability check (AC5, action items only): does the description contain a
completion condition — could a reader say unambiguously "done now"? A standing
policy emitted as an action = REAL-MISTYPED + closeability fail.

Direction check (AC4): for items the manifest marks `expected_direction:
none`, any `i_owe_them`/`they_owe_me` is a direction fail. Mirror pairs (same
utterance, opposite directions, different owners) = one direction fail each.

Tier check (AC2): every manifest item with `tier: blocker` must be extracted
AND carry `importance: blocker`. Blocker definition for adjudication: blocks a
launch/person/dependency, legal/compliance gate, or explicit "X can't happen
until Y" — even mentioned once in passing.

## Meeting-level grade (AC7, blind set)

Compute first, then grade — no vibes:

- **recall_critical**: of the meeting's decisions/commitments/blockers a
  careful human reader of the transcript would record (judge enumerates them
  FIRST, before reading the extraction), fraction captured.
- **junk_rate**: JUNK / total extracted.
- **fabrication_count**: FABRICATION verdicts.
- **flag_discipline**: fraction of JUNK+VERBOSE items carrying the model's own ⚠.

| Grade | Anchored definition |
|---|---|
| **A** | recall_critical = 100%, junk ≤ 5%, 0 fabrications, flag_discipline ≥ 80%, 0 closeability/direction fails. |
| **A-/B+** | recall_critical ≥ 90% with NO blocker missed, junk ≤ 15%, 0 fabrications, flag_discipline ≥ 60%, ≤ 1 closeability or direction fail. |
| **B** | recall_critical ≥ 80% OR one non-blocker critical miss; junk ≤ 20%; 0 fabrications. |
| **C** | Any blocker missed, OR junk > 20%, OR flag_discipline < 40%. |
| **F** | Any fabrication, OR ≥ 2 blockers missed. |

**AC7 pass bar: ≥ B+ (i.e., the A-/B+ row or better) on ALL FOUR blind
meetings.** Any fabrication anywhere in the corpus fails AC3 outright
regardless of grades.

## Scorecard format (committed to eval/scorecards/)

One JSON per run: `scorecards/<date>-<mode>-<meeting-id>.json`:

```json
{
  "run_date": "", "mode": "single_pass | legacy", "model": "", "judge_model": "",
  "meeting_id": "", "counts": {"extracted": 0, "real": 0, "real_mistyped": 0, "verbose": 0, "junk": 0, "fabrication": 0},
  "recall": {"expected": 0, "matched": 0, "missed_items": []},
  "blockers": {"expected": [], "captured": [], "tier_correct": []},
  "direction": {"none_expected": 0, "none_correct": 0, "directional_violations": []},
  "closeability_fails": [], "flag_discipline": 0.0,
  "continuation": {"expected_markers": [], "found": [], "unmarked_duplicates": []},
  "approval_funnel": {"auto_approved": 0, "pending": 0, "skipped": 0},
  "tokens": {"prompt": 0, "completion": 0},
  "grade": "", "judge_notes": ""
}
```

## Gate procedure

1. Run `scripts/eval-extraction-2026-06.ts` (local, uncommitted) — both modes,
   full corpus. It writes raw outputs + scorecard skeletons.
2. Judge agent fills verdicts per this rubric.
3. John's human audit: ONE full meeting end-to-end (rotate per gate run).
4. Commit scorecards to `eval/scorecards/`; record AC pass/fail table in the
   plan dir.
5. AC11 (approval budget) is measured during the soak, not here — but the
   scorecard's approval_funnel column feeds the projection (median ≤ 25 AND
   p90 ≤ 40 pending items/winddown).
