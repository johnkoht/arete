# Phase 13 — Area edge completion: build learnings

**Date**: 2026-06-11 · **Slug**: phase-13-area-edge-completion · **Wrap completed by**: prime orchestrator (builder agent watchdog-killed at suite run — see below)

## Metrics
- 15/15 PRD tasks, slices A/B/C in order, per-task commits throughout
- Net logic ≈ +702 vs ~+685 ledger (**1.03×** — the review's re-anchoring on phase-12 actuals fixed the 2.5× estimation problem); AC3 1.2×, AC2 1.1×, both under the 1.5× tripwire
- Tests: full suite 4646 pass / 0 fail (+70 new); typecheck clean; dark-code 0 (all new exports CLI-wired)
- Delta pre-mortem: no CRITICAL; D1 (signal-typed area matches: summary-only name matches refused, title-only flagged `name-only` + grouped last) and D4 (mtime-guard zero + surfaced abstains) landed in the build, not just the doc

## Pre-mortem effectiveness
| Seed | Materialized? | Mitigation effective? |
|---|---|---|
| 0.8 name-substring mislabel | designed-for (live apply pending) | D1 signal provenance + name-only flagging shipped in AC3 |
| Multi-area recall loss | tested (named exclusion fixture) | bounded as designed |
| Phase-14 input contamination | n/a until live apply | MC3 preview obligation carries it |

## What worked / what didn't
+ Slice-A-first discipline: read-side gate (fixtures + live shadow, zero AC1 diffs, workspace hash identical) verified before funding the write surface
+ Ledger anchored to phase-12 ACTUALS — calibration landed at 1.03×
− **Agent watchdog vs full suite**: the suite now runs ~64 min with no streamed progress; the builder agent was killed at wrap "checking the suite." Standing fix: run full suites as DETACHED background commands (output to file) or leave AC9 to the merge-gate runner; never block an agent's stream on `npm test`
− Test-fixture gotcha (recorded in LEARNINGS too): an owner-only action item (`[@john →]`, no counterparty) produces NO commitment at approve — silently. Fixtures need `[@a → @b]` notation
- Observed punch #10 directly: first baseline CLI run lacked the wiki section, 3 reruns showed it — qmd-warmth variance in the BEFORE state, pre-existing, now documented

## Recommendations
- Continue: actuals-anchored ledgers; slice-gate-then-fund; delta pre-mortems with seeds
- Start: detached suite runs for any agent-driven wrap
- Watch: meeting backfill live apply (MC3 table) is John-operated and pending; phase-14 soak depends on it

## Follow-ups
- Punch #10 (qmd-warmth wiki-section variance) now has a reproducible observation — promote from watch item if it recurs in briefs
