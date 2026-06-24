# PRD: Soak Logging — flag-gated usage log

## Goal

Add a flag-gated, objective per-run usage log to opted-in skills so a cold BUILD agent can resolve "I've been testing X, check the logs." One shared `## Usage Logging` pattern in `packages/runtime/skills/PATTERNS.md`, referenced as a gated terminal step by `daily-winddown`, `project-exit`, `update-project`. Plus a `soak-review` BUILD skill (Tier 2) that reads the log across the repo boundary. Content-only (markdown): no TypeScript, no dist rebuild. Inert when `usage_log` is absent/false.

## Global constraints

- Run ENTIRELY in the worktree `feature/soak-logging`. Never switch branches in the main repo.
- `~/code/arete-reserv` is READ-ONLY during the build. No writes, commits, or `cp` there until the post-merge re-sync gate.
- **Content-only change: NO `npm run build`, NO dist commit** (the usual commit-dist rule does not apply — `packages/runtime` has no build step; skills ship as raw markdown).
- **Preserve the inert-off invariant.** The gate ("if `usage_log` absent/false, STOP — do nothing, no `mkdir`") is the literal first sentence of the pattern AND restated in every SKILL.md ref line (pre-mortem R1). No state mutation before the gate.
- Do not break existing PATTERNS.md references (daily-winddown refs it 9×). Append the new section; don't reorder existing ones.

## Required reading

- `dev/work/plans/soak-logging/plan.md` — full design, entry format, scope tiers.
- `dev/work/plans/soak-logging/pre-mortem.md` — risk mitigations R1/R3/R4/R5/R6 (embed per-task).
- `dev/work/plans/soak-logging/review.md` — structural verification + Observation A (project-exit Step 7).
- `packages/runtime/skills/PATTERNS.md` — existing `## Section` pattern style (e.g. `do-all-work-then-engage`, `reconcile-engine`).
- `memory/entries/2026-06-22_winddown-approval-stack-learnings.md` — "fail loud, never silently switch formats" (finding-#15 family → why model-tier is mandatory).

## Tasks

- **T1 — `## Usage Logging` pattern in PATTERNS.md.** Append after the last pattern. Gate-first prose; absolute workspace-anchored append path `<workspace-root>/dev/soak/<skill-id>.md`; the labeled entry format from the plan with model-tier mandatory and every field present each entry (`· —` for empty). ACs: gate is literal first sentence; no existing pattern reordered; daily-winddown's 9 refs still resolve.
- **T2 — daily-winddown ref line.** Add the gated terminal-step line after the skill's always-run report/apply step (Step 6), before `## References`/`## Rollback` (pre-mortem R5). AC: line carries the gate; not inside References/Rollback.
- **T3 — project-exit Step 7.** Add a new **Step 7 (Post-report instrumentation)** carrying the gate, so it survives the silent fast-path (review Obs A). AC: Step 7 always-reached on both the full and fast-path flows.
- **T4 — update-project ref line.** Add the gated terminal-step line after its Step 5 (Report). AC: line carries the gate; placed after report.
- **T5 — `soak-review` BUILD skill (Tier 2).** Reads `~/code/arete-reserv/dev/soak/<feature>.md` + pointed-at artifacts + arete-reserv git diff since last checkpoint; **first step diffs live workspace skill copies vs canonical and flags drift** (pre-mortem R3); prompts for one-line gut reaction per run/cluster; synthesizes into `SOAK-FINDINGS.md` by severity, fixes cheapest-first. Authored in the current BUILD harness (`.pi/skills/soak-review/`); revisit if the Claude-port has landed. Separable commit from T1–T4 (capture has standalone value, pre-mortem R7).

## Out of scope (Tier 3, evidence-gated)

Deterministic CLI writer `arete usage-log append` + inert-off unit test — only if Tier 1 shows model-fidelity drift.

## Verification

Per plan: `dev/` gitignored check in arete-reserv (R6); flag-off smoke (explicit pass/fail in build log — no `dev/soak/` dir); flag-on capture (one well-formed entry, model-tier populated); multi-skill; review-loop dry run.
