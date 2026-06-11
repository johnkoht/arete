# Winddown A/B benchmark — executable checklist (Phase C)

Purpose: John's in-production A/B of `extraction_mode: single_pass` against
the legacy pipeline, measured at the level that actually matters — the
nightly winddown — feeding TWO gate decisions:

1. **Flip `extraction_mode` default** (SP plan AC11 approval budget + AC2/AC3
   quality bars over the soak window).
2. **Proceed to CHR W4** (daily-winddown engine rewire) — requires the SP
   soak complete AND day-level/shadow telemetry healthy.

Everything here is observational on real winddowns — no separate eval spend.
The committed scoring contract is `eval/judge-rubric.md` (FIXED; iterating a
judge prompt to move grades without changing that file is out of bounds) and
`eval/ground-truth-manifest.json`. Methodology precedent:
`benchmark-evidence.md` (the 2026-06-10 session).

---

## 0. Setup (once, before night 1)

- [ ] Baseline freeze: archived winddowns
      `/Users/john/code/arete-reserv/now/archive/daily-winddown/winddown-2026-06-0*.md`
      are the comparison corpus (READ-ONLY). Wall-clock baseline = the
      6/8–6/10 runs (per the SP soak abort triggers). Format reference: the
      6/09 file (richest day: 6 CTs w/ evidence, tier-ranked staging,
      Uncertain incl. the de_002→de_004 supersession + the
      `b0e57c25`↔`ce091a38` mirror pair, pruning, sidecar of 14).
- [ ] In `arete-reserv/arete.yaml` set:
      ```yaml
      extraction_mode: single_pass   # the A/B arm under test
      reconcile_shadow: true         # CHR-W7: raw snapshots + shadow log
      # reconcile_mode stays UNSET (= inline) until the day-level decision
      # below — one variable at a time.
      ```
- [ ] Confirm snapshots land: after the first extract,
      `dev/diary/raw-extractions/<date>-<slug>.json` exists per meeting
      (gitignored). If not, instrumentation is broken — fix before counting
      any soak day.
- [ ] Note the models in play (`ai.tiers.*`) in the log table — the prompt
      was smoke-tested on Opus 4.6 (extraction: frontier); a mid-soak alias
      move restarts the soak clock (model is a confound, pre-mortem risk 6).

## 1. Per-day metrics (fill nightly, ~3 min)

Append one row per winddown to the table at the bottom of this file (or a
sidecar `WINDDOWN-BENCHMARK-LOG.md` if it gets long):

| Metric | How to read it |
|---|---|
| `meetings` | count from Step 1h |
| `staged blocker / high / normal / oq` | from the staging view tier counts (W4 frontmatter maps); legacy baseline has no tiers — record flat count |
| `pending decisions` | items requiring a user decision this winddown (staged pending + Uncertain + CT approvals). THE approval-budget number (AC11) |
| `blockers surfaced` | blocker-tier items that reached the curated view (incl. item-tier override pull-ups from deferred meetings — AC9) |
| `sidecar size` | deferred-items count (the `N items deferred` line) |
| `wall-clock` | start→curated-view-rendered, minutes. The abort-trigger line |
| `CT closures (by evidence class)` | proposed CTs split slack-ref / meeting-ref / calendar-ref / week.md — parity check vs the 6/09 baseline's 6 |
| `mirror-pair events` | telemetry events + whether a human confirms each as a real parser pair (AC4 / AC10) |
| `auto-approved` | count + tiers. ANY non-blocker auto-approval = AC11 breach, investigate same night |
| `unmerge/pull-back` | user corrections issued — false-collapse proxy (CHR AC6a) |
| `notes` | anything weird: missing snapshot, LLM retries, deferred-meeting blocker, flag flips |

p50/p90 of `pending decisions` are computed over the whole window at gate
time — don't average nightly.

## 2. Judge re-audit protocol (weekly, ~20 min agent + 10 min John)

Sampled junk/fabrication audit on REAL winddown output (the silent-loss
detector user-correction metrics can't be — pre-mortem risk 7):

1. Sample **N=10 random staged items** from the week's meetings (stratify:
   ≥3 normal-tier, ≥2 ⚠-flagged, ≥2 from sidecar-deferred meetings, ≥1
   blocker) + **N=5 random engine/reconcile-SKIPPED items** (from
   `staged_item_skip_reason` / dedup log).
2. Judge agent re-audits each AGAINST THE TRANSCRIPT per
   `eval/judge-rubric.md` item-level verdicts (REAL / REAL-MISTYPED /
   VERBOSE / JUNK / FABRICATION; closeability + direction checks). Record
   the judge model id. Manifest withheld (blind).
3. For the 5 skipped items: was the skip RIGHT (true duplicate/fulfilled)?
   Any wrong skip = a **false collapse** — hard bar is **0/5, no "or
   explained"** (CHR AC6b). One confirmed false collapse blocks the CHR-W4
   decision until root-caused and the fix re-soaked.
4. John hand-audits **one full meeting end-to-end** per gate decision —
   including items the judge passed (rubric anti-circularity rail #2).
5. Log: junk_rate, fabrication_count, flag_discipline (⚠ coverage of
   judged junk/verbose, AC3 bar ≥80%), false-collapse count.

## 3. What the raw snapshots enable (replay — why W7 infra exists)

`dev/diary/raw-extractions/*.json` is the PURE pre-reconcile extraction per
meeting (pre-mortem R2). With them you can, at any later date:

- **Replay a day through the CHR engine offline** (`arete reconcile
  nominate --ledger <built-from-snapshots>`) and diff engine decisions vs
  what inline/day-level actually did that night — the W7 three-way diff
  (raw → inline vs raw → engine), without re-running any LLM extraction.
- **Re-score quality after a model/prompt change** — re-audit old days
  under the same rubric with zero re-extraction cost.
- **Reconstruct arcs that inline collapsed** — the snapshot still has both
  sides of a same-day supersession even if the night's pipeline ate one.
- Build the **second golden day** (CHR Layer 2's representative-input gate):
  pick a soaked single-pass-shaped day (one boring/low-signal day
  preferred), record ground truth from the snapshots + transcripts.

Snapshots are overwrite-on-re-extract, gitignored, and cost nothing while
`reconcile_shadow: true`.

## 4. Decision rules

### Gate A — flip `extraction_mode` default to `single_pass`

After **≥5 winddown days** on single_pass (and W4 view-ranking confirmed
live in the same release — pre-mortem R3 ordering), flip when ALL hold:

- [ ] **AC11 approval budget**: median pending-decisions/winddown ≤ 25 AND
      **p90 ≤ 40** over the window; **zero non-blocker auto-approvals**.
- [ ] **AC2**: no known blocker missed on any soaked day (spot-check
      against meeting outcomes; the license-assignment canary class).
- [ ] **AC3 bars via § 2 sampling**: junk ≤ 15%, **fabrication = 0**,
      flag_discipline ≥ 80% of judged junk.
- [ ] **AC9**: tier-sorted staging rendered every night; ≥1 observed
      normal-collapse working; no blocker hidden by a meeting deferral.
- [ ] **Wall-clock**: median ≤ 1.2× the 6/8–6/10 baseline (target; hard
      abort is 1.5× — see § 5).
- [ ] AC12 cost sanity: per-meeting spend ≤ 2× legacy (smoke datapoint:
      86.4s vs 62.3s wall on compliance-0609; check the bill, not vibes).

Breach handling: tighten tier mapping / collapse rules / prompt "don't pad"
(cheapest-first per house escalation), re-soak the failing metric; do NOT
flip on a partial window.

### Gate B — proceed to CHR W4 (engine rewire)

All of Gate A shipped + stable, PLUS:

- [ ] SP detector soak complete (AC10 2-week telemetry report written).
- [ ] `reconcile_mode: day-level` exercised ≥3 winddowns with healthy
      output (reconcile-day applied counts sane, zero unmatched-text
      warnings trending, user-decisions-win verified once by hand).
- [ ] Soak event minima met (CHR W7 validity): ≥2 real cross-meeting-
      duplicate days and ≥1 same-day supersession-arc day in the window —
      quiet calendar ⇒ replay a synthetic day from snapshots; a vacuous
      soak does NOT gate.
- [ ] § 2 false-collapse sampling at 0 across the window.
- [ ] Second golden day recorded (single-pass-shaped, from snapshots).

### Day-level flip (`reconcile_mode: day-level`) — may precede Gate B

Flip after Gate A when the first reconcile-day dry-run
(`arete meeting reconcile-day --date <day> --dry-run --json`) over a real
day produces decisions a hand-check agrees with (≥1 day with actual
cross-meeting duplicates). It is independently reversible (set back to
`inline`; the inline path never changed).

## 5. Soak abort triggers (verbatim from the adjudicated plans — pull the cord, don't negotiate)

- **3 consecutive winddowns with wall-clock > 1.5× the 6/8–6/10 baseline**
  ⇒ revert `extraction_mode: legacy` immediately.
- **Any data-loss event** (an item John saw extracted that is later in no
  file, no sidecar, no skip-reason, no snapshot) ⇒ revert immediately,
  incident in the build diary, postmortem before retry.
- **Any confirmed fabrication acted on** (a CT/commitment created from a
  fabricated item) ⇒ revert immediately.
- SP rollback mid-CHR-soak ⇒ shadow soak auto-pauses, soak clock RESETS
  (legacy-shaped days must not contaminate the report gating W6); log a
  `soak-pause` entry to `dev/diary/reconcile-shadow.log`.
- Pending-decisions p90 breach on any 2 consecutive days ⇒ pause (stay on
  single_pass but stop the gate clock), tighten collapse rules, resume.

## 6. Log

| date | meetings | blocker/high/normal/oq | pending | blockers | sidecar | wall-clock | CTs (evidence) | mirror | auto-appr | unmerge | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| _baseline 06-09 (legacy)_ | 6 | — (flat ~29 staged) | ~29 eval'd + 7 Uncertain | n/a (no tiers) | 14 | (baseline) | 6 (slack×2, meeting, week.md×2, slack-carryover) | 1 pair (real) | high-conf auto | 0 | reference day |
|  |  |  |  |  |  |  |  |  |  |  |  |
