# PRD: plan-context-injection

Generated from `plan.md` (approved, eng-lead review + pre-mortem incorporated). Machine spec in `prd.json`.

**Goal:** make in-flight project documents reach planning surfaces — a deterministic, no-LLM project-doc selection engine feeding agendas (WS-1), a composing `arete plan-context` aggregator feeding week-plan (WS-2) and daily-plan (WS-3), and week→daily invocation fidelity (WS-4). WS-5 cache DEFERRED.

**Branch:** `feature/plan-context-injection` (worktree only).

## Tasks (build order)
| ID | Workstream | Area | Summary |
|----|-----------|------|---------|
| T1 | WS-1 | core | `selectProjectDocs` service — traverse + deterministic lexical selection + budget (the contract WS-2/3 consume) |
| T2 | WS-1 | core | scaffold `project-doc` extractor + routing + recurring-template fix; wire into agenda path |
| T3 | WS-1 | cli | agenda integration test + read-only spike-compare harness (AC1.9 stand-in) |
| T4 | WS-2 | cli | `arete plan-context --week` aggregator + frozen JSON schema + week-plan wiring + AGENTS.md norm |
| T5 | WS-3 | cli | `--day` mode + daily-plan wiring |
| T6 | WS-4 | docs | week→daily fidelity contract + `@due` reconciliation (SKILL.md doc work) |

## Global constraints
- Worktree only; arete-reserv READ-ONLY (snapshot for spike harness); commit dist/.
- Quality gates per task (typecheck + test); never weaken/skip AC tests (R8) — blocked AC → STOP & report.
- Compose, don't duplicate (R6); no LLM/embeddings in selection (R2); keep `brief-no-llm` green.

## Gate held for human
Merge is **NOT** autonomous. The AC1.9 spike-comparison (spike agendas vs post-build `arete agenda scaffold` against an arete-reserv snapshot) is the release gate — John reviews in the morning before merge.

Pre-mortem HIGH risks (R1, R2, R3, R5) are embedded per-task in `prd.json`. Full risk list in `pre-mortem.md`.
