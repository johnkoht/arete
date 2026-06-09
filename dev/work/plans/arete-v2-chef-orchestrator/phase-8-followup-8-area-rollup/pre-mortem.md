---
title: "Phase 8 followup-8 — pre-mortem"
slug: phase-8-followup-8-area-rollup-pre-mortem
created: "2026-05-27"
parent: phase-8-followup-8-area-rollup
---

# Pre-mortem

If 8f8 ships and 2 weeks later we say "that was a mistake," what would have caused it?

## R1 — Inference misclassifies, populates wrong-area commitments

**Failure mode**: `getAreaForMeeting(title)` returns a >=0.7 confidence match for an ambiguous meeting (e.g., a one-off "Quick Sync" matches the keyword "sync" weakly tied to an area). Commitments derived from that meeting get the wrong area. Area-scoped views now show items that don't actually belong to the area — worse than "empty view", because the user can't tell what's noise vs signal.

**Mitigation**:
- Conservative confidence threshold (0.7) excludes weak matches; recurring rules are 1.0 confidence so those are safe
- Shadow validation step (build orch step 6) runs `--dry-run` against arete-reserv, captures proposed classifications, lets eng-lead spot-check before commit
- Backfill is reversible: `arete commitments backfill-area --reset` (planned in AC7) or manual JSON edit

**Residual**: a few wrong-area classifications likely slip through despite spot-checks. Acceptable if <5% of backfilled items; user can override per-commitment via future `arete commitments set-area` (out of scope here).

## R2 — Backfill job corrupts commitments.json

**Failure mode**: backfill subcommand has a bug — drops fields, malforms JSON, double-writes — and the user's commitments.json is broken. Open commitments lost, status drift, dedup hashes invalidated.

**Mitigation**:
- Default `--dry-run` mode (per AC3); writes only on explicit `--apply`
- Pre-write atomic backup: write commitments.json.bak before mutation
- Use `CommitmentsService` round-trip (load → mutate → save) rather than raw file IO — inherits existing pruning/validation
- Round-trip test in CI: load fixture, run backfill, re-load, assert all original IDs present

**Residual**: low. CommitmentsService is well-tested; the surface area for corruption is small.

## R3 — Extract-time fix changes commitment hash semantics

**Failure mode**: AC1 adds `area` to commitments returned from `sync()`. The dedup hash is `sha256(text + personSlug + direction)` and is documented as area-INDEPENDENT (`commitments.ts:559`). But if a reviewer or future change mistakenly folds area into the hash, every existing area-null commitment will be re-created with a new ID — duplicates everywhere, prior resolutions lost.

**Mitigation**:
- Explicit test in `commitments.test.ts`: same text/person/direction with different area produces SAME hash (idempotency contract)
- Build-report.md must include "hash invariance verified" line
- The comment at `commitments.ts:559` already calls this out; reviewers grep for it

**Residual**: low if the test exists. Without the test, this is the most dangerous silent regression.

## R4 — AreaParserService injection breaks factory wiring

**Failure mode**: AC2 requires AreaParserService in `entity.refreshPersonMemory()`. The service factory has constructor-injection order constraints (mirrored e.g. by `setCreateTaskFn` pattern in commitments). If injected wrong, runtime calls fail or AreaParserService is undefined and inference silently no-ops.

**Mitigation**:
- Follow the `setXxxFn` injection pattern already used in CommitmentsService (`setCreateTaskFn`, `setCompleteTaskFromCommitmentFn`)
- Or pass AreaParserService as direct constructor arg if EntityService can take it without circular dep
- Integration test: call `refreshPersonMemory` against a fixture workspace with one area-keyword-matching meeting; assert resulting commitment has area set

**Residual**: medium. Factory wiring is fiddly; expect 1-2 iteration cycles during build.

## R5 — Confidence threshold poorly tuned

**Failure mode**: 0.7 is either too permissive (R1: wrong areas) or too strict (no improvement: most meetings still null). Without empirical data on the workspace's title→area match distribution, we're guessing.

**Mitigation**:
- Shadow validation reports confidence distribution per backfill candidate
- Build-report.md captures the histogram; eng-lead reviews before merge
- Threshold is a single constant; trivial to tune in a fix-up commit

**Residual**: expect one iteration. Acceptable.

## R6 — Going-forward fix doesn't help meetings already in the workspace

**Failure mode**: AC1+AC2 fix Path B going forward, but the 26 area-null source meetings are already-processed. Their commitments stay null unless people-memory refresh re-runs over them. `refreshPersonMemory()` has stale-detection logic (`isMemoryStale`) that skips fresh memory — so re-running won't re-extract from those meetings.

**Mitigation**:
- AC3 backfill subcommand bypasses people-memory entirely; reads commitments.json directly, infers area from source meeting, writes back. This is exactly why backfill is in-scope rather than deferred.
- Alternative considered: force a full people-memory rebuild — too disruptive; backfill is cleaner

**Residual**: zero if AC3 lands. If AC3 deferred, this risk reactivates and the followup recovers only ~2/57 commitments.

## What's the single most likely thing to go wrong?

**R3 (hash invariance regression)**. The other risks are detectable: R1 surfaces in shadow validation, R2 is gated by `--dry-run`, R4 fails loudly at runtime, R5 is one-knob tuning, R6 is mitigated by AC3.

R3 is silent: a future developer (or even this build) inadvertently includes `area` in the hash, dedup becomes area-aware, and every existing commitment's identity changes on next sync. Symptoms appear gradually as new "duplicate-looking" commitments accrete in commitments.json. Detection latency is high because old + new IDs coexist until prune.

The mitigation (explicit hash-invariance test) is cheap and must be in AC5. Skipping it would be the single highest-regret omission of this followup.
