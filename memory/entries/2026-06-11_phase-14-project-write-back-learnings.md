# Phase 14 — Project write-back — build learnings

> Suborchestrator wrap entry, 2026-06-11. Branch `worktree-agent-a0e5ef1fddde3721c`, built on the phase-13 merge (`24b0f816`).

## Metrics

- 9/9 PRD tasks (incl. the AC5 stretch — shipped, not deferred); per-task commits throughout; 0 gate pauses
- Tests added: 37 across 5 new/appended files (12 core unit, 5 CLI subprocess, 2 june-fixation integration, 2 retro format-contract, 18 prose incl. 3 AC5) — all green at first or second run; 1,271 test LOC
- Logic LOC 281 vs ~220 estimate (1.28×, under the 1.5× tripwire); prose 175 md vs ~310 estimate (0.56× — prose under-ran again, same direction as phase 12, by leaning on the PATTERNS entry instead of restating it)
- Calibration: floor 0.35 fixed against live arete-reserv (read-only, mtime-verified) with the 23 W4 landing pads as validation material

## Pre-mortem effectiveness (delta pre-mortem, 7 risks)

| Risk | Materialized? | Mitigation effective? |
|---|---|---|
| D1 proposal dead zone | n/a until soak | soak instrumentation written into the skill prose (record proposed vs approved vs hand-edited-after) |
| D2 confident-wrong via backfilled areas | n/a until soak | provenance hint shipped + prose-pinned |
| D3 same-day suppression | pre-empted | fixture controls for it AND a named exclusion-control test pins the artifact |
| D4 retro dilution | n/a until soak | stable title key + Project bullet; soak step 4 checks findability |
| **D5 topic-refresh premise wrong** | **YES — at recon, before any code** | **build-changing: AC5 substrate test re-targeted to briefs/area-memory (the surfaces that actually integrate items/)** |
| D6 floor scale split | partially | calibration confirmed one constant separates both scales; margins asserted in fixtures |
| D7 comment-insertion corruption | pre-empted | substring dedup + own-line insertion + HTML-comment-body fixture |

D5 is the headline: the recon habit (read the actual integration code before trusting a plan's mechanism claim) caught an approved-plan premise error that would have shipped a no-op step and a failing substrate test.

## What worked / what didn't

+ Calibrate-before-CLI-tests ordering: running the live floor calibration BEFORE writing the CLI fixtures meant the fixtures were designed against the final constant, zero rework.
+ The byte-frozen-test-files rule (new tests in NEW files only) made the AC4 wall trivially provable: `git diff <base> -- <files>` → 0 lines.
+ Counting-adapter + snapshotTree dual-layer (services/LEARNINGS pattern) applied to a WRITE verb's no-op path, not just read flows — R2's "zero write calls" wording is now CI-literal.
+ Detached nohup suite + Monitor (phase-13 post-mortem lesson) — no watchdog risk, wrap work proceeded in parallel.
− First calibration run returned zero results everywhere: qmd emits workspace-relative paths and the script ran with the wrong cwd — the exact services/LEARNINGS trap, still easy to hit from a standalone script.
− The plan's grep expectation named two README writers; there are three (`resetBackfilledProjectAreas`). Small, but "enumerate writers" claims should be grepped, not recalled.

## Recommendations

- CONTINUE: recon-verify any "existing machinery will do X" plan claim against the actual call graph before building on it (D5 would have been a soak-time surprise otherwise).
- CONTINUE: order calibration/measurement tasks before the tests that depend on their constants.
- START: when a plan asserts "the only writers are A and B", encode the grep in the build task itself, not the review.
- STOP: nothing flagged.

## Follow-ups

- `relevantL2` in `topic-memory.ts` is a dark prompt channel (no production caller) — either wire it (would give retros true topic-page integration) or remove it; parked for John.
- Landing-pad finding: only 2/23 W4 landing pads surface for any CURRENT active project — input for published-doc-sync prioritization.
- OQ5 (day-granularity whatsNew) unchanged — promote only if live soak trips it.
- MC3 soak owns the real acceptance: 3 observed `/update-project` runs, first-write topics diffs, first live finalize-with-retro.
