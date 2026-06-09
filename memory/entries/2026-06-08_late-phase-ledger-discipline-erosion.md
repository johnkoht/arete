# Discipline-ledger erosion in late phases of a long program

**Date**: 2026-06-08
**Context**: Areté v2 chef-orchestrator close-out (Phases 0–12)

## What happened
The "no add without a remove" / AC8 ledger held ≤0 cumulatively through Phase 8 — Phase 4 was
the negative milestone (−12 skill directories; "the discipline-rule story landed"). Phases 9–12
then regrew net +13,274 production source LOC (155 removed vs ~13.4k added). This was regrowth,
not substitution. It is defensible per-item (Phase 9 brief restored a *regressed* capability;
Phase 10 Commitment-v2/dedup + Phase 11 external-resolution are net-new substrate) but the
per-phase ledger gate that was vivid in phases 0–8 simply stopped being applied for 9–12. No
one decided to drop it; it eroded.

## Learning
- Ledger discipline decays predictably as a long program shifts from "get slimmer" to "build
  net-new capability." The early-phase rigor is not self-sustaining.
- If a ledger gate matters, gate EVERY phase — including honestly net-additive ones. The value
  is the eyes-open accounting (accepted exception, recorded), not a forced zero.
- A program that overruns its own roadmap (planned 7 phases ending at a conditional Phase 6;
  shipped through Phase 12 + ~15 followups) should re-affirm its discipline machinery at the
  overrun point, not let it thin out with the phase count.
- "Restore a regressed capability" phases feel low-risk and tend to skip their post-build review
  (Phase 9 did) — exactly where stale fixtures / path bugs hide.

## Evidence
- `phase-4-skills-audit/build-report.md` (negative-ledger milestone)
- `POST-MERGE-WORKLOG.md` I-9 (+13.3k accepted exception); diary 2026-06-08 entry
- `POST-MORTEM.md` §3, §4
