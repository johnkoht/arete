# Phase 12 — Projects first-class (slices A+B+C) — learnings

**Date**: 2026-06-10
**Source**: `dev/work/plans/arete-v2-chef-orchestrator/phase-12-projects-first-class/` (plan + amendment), suborchestrator /ship run in worktree `agent-a4515b3b04126e6e0`

## Metrics

- **Tasks**: 9/9 complete (slices A: 4, B: 1, C: 3, wrap: 1); 100% first-attempt (0 iterate loops)
- **AC11 hard gate**: PASS — `arete brief --project glance-2-mvp` **2 → 5 sections** (Project context, Recent activity (10), Open work (2), Decisions & learnings (139), Related wiki pages (2)), `metadata.area` resolved; live workspace byte-untouched; fleet shadow across 11 projects: zero regressions, zero mislabels
- **Tests**: +~40 new (13 parser, 3 AC6, 11 AC4, 6 core backfill/what's-new/zero-write, 9 CLI subprocess, 5 skill-prose); full suite green
- **LOC**: +842/-7 src (≈608 logic + 234 comment/blank), +1292 test, +104 skill prose vs plan estimate ~+240 — overage itemized in ship report (review-driven additions: qmd wiring, archived handling, disambiguation, divergence warnings; plan's per-AC estimates were thin vs the mirrored `commitments backfill-area` precedent)
- **Commits**: 12 per-task commits on worktree branch

## Pre-mortem effectiveness

| Risk | Materialized? | Mitigation applied? | Effective? |
|---|---|---|---|
| R1 open-mutates-README | No | Yes (scope cut + zero-write tests, two layers) | Yes |
| R2 topics-cache churn | No (AC5 deferred entirely) | Yes (amendment) | Yes |
| R3 area mislabel | No | Yes (0.7 floor, never-guess-from-display-name, preview default) | Yes — fleet shadow showed no mislabels |
| R4 multi-area projects | No | Yes (`areas:[0]` tolerated, not promoted) | Yes |
| R5 wrong-project resolution | No | Yes (tie → top-N, never auto-load; exact-slug short-circuit) | Yes |
| R6 creation-prompt friction | N/A (prose only this phase) | Yes (optional, default+skip) | TBD in dogfood |
| R9 fm/prose divergence | No | Yes (fm wins + visible warning) | Yes |

## What worked / what didn't

- **+ Cross-model review (headless opus, fresh context) earned its cost**: caught the partial-regex failure mode that a naive section-count gate would miss → AC11 gained the `metadata.area` assertion; also drove qmd wiring, archived handling, permissive-regex variation tests, --json completeness. 1 of its 5 concerns was factually wrong (claimed no mtime surface; `StorageAdapter.getModified` exists) — reviewer claims still need verification.
- **+ AC11 as a hard gate with live before/after numbers** made "done" unambiguous; the MC3 fleet shadow (11 projects before/after, read-only) converted the skeptic's mislabel worry into data (zero mislabels — parser only resolves real signals).
- **+ Mirroring an existing command end-to-end** (`commitments backfill-area`) meant AC2 shipped with zero design debate: same flags, same provenance contract, same JSON discipline.
- **+ Zero-write contract proven two ways** (counting adapter + tree snapshot) — cheap and decisive for trust-sensitive read paths.
- **− Plan LOC estimates were ~2.5× light** for CLI-bearing ACs; future ledgers should calibrate against the precedent command being mirrored, not gut feel.
- **− Worktree branch was cut one commit before the plan amendment** — first act of the build was fast-forwarding to pick up the governing scope. Harness-created worktrees should verify plan freshness on entry (now in diary as a pattern).

## Recommendations

- **Continue**: hard gates with live numbers; cross-model review with verified-facts block; per-task commits; phantom-recon before build.
- **Stop**: trusting plan LOC ledgers for CLI work without checking the mirrored precedent's actual size.
- **Start**: when a suborchestrator enters a pre-created worktree, diff the plan dir against main's tip before reading the plan.

## Follow-ups

- Slices D (AC5 topics cache + AC7 `/update-project`) and E (AC8 close→retro) — deferred phase, gated on `/project` dogfooding + workspace restructure (per amendment).
- Post-merge operational order (amendment): AC11 live verify → John extracts child projects via area-aware creation → re-audit → backfill preview (MC3 table) → John approves `--apply`.
- `dist/AGENTS.md` is at 12.7KB (over the 10KB threshold, pre-existing) — compression pass candidate.
