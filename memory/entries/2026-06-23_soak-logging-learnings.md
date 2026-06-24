# Soak logging — flag-gated usage log for the build→soak→review loop (2026-06-23)

A flag-gated, objective per-run usage log baked into opted-in skills via one shared `## Usage Logging` pattern in `packages/runtime/skills/PATTERNS.md`, referenced as a gated terminal step by `daily-winddown`, `project-exit`, `update-project`. Plus `soak-review` (`.pi/skills/soak-review/`), the BUILD-side consumer that reads the log across the repo boundary and harvests the subjective reaction at review time. Content-only (markdown): no TypeScript, no dist. Inert when `usage_log` is absent/false. Built via an adapted `/ship` from Claude Code (subagents for pre-mortem/review/final-review; merge gate interactive).

## Metrics
- 5 tasks (T1–T5). 5 files: 4 edited (`PATTERNS.md` +39, three SKILL.md +4 each) + 1 new (`soak-review/SKILL.md`). 2 implementation commits (capture / review, kept separable per R7).
- No TS changed → typecheck/test suite unaffected (full 5000-test suite not re-run for a markdown-only change; stated honestly rather than rubber-stamped).
- Functional verification (inert-off smoke + capture) is post-merge + flag-on, in the workspace.

## Pre-mortem effectiveness
- **R1 (HIGH, materialized-risk averted):** gate must be carried in each SKILL.md ref line, not only inside PATTERNS.md, AND be the first actionable instruction. Folded in; final review confirmed inert-off holds.
- **R3 (HIGH):** skip-if-exists workspace sync means a forgotten post-merge `cp` lets the soak generate data from stale prose. Mitigated by making `soak-review`'s first step a workspace-vs-canonical `diff`.
- **R5:** anchor after the always-run report step, never in trailing References/Rollback. daily-winddown → Step 8 (after the existing end-log); project-exit → Step 7 (fast-path row updated to chain to it, per final-review note); update-project → Step 6.
- **R6 (confirmed real):** `dev/` is NOT gitignored in arete-reserv → soak entries naming people/commitments would be auto-committed. Surfaced as a flag-on prerequisite.
- **R2 (accepted):** the capture step is itself an agent instruction, so a silent weaker-model drop can skip it — the exact failure the log exists to catch. Mitigated by self-written mandatory model-tier; Tier-3 deterministic CLI writer deferred until drift is observed.

## What worked / what didn't
- **+** Cross-model review (Sonnet) verified every load-bearing claim against real code before any edit — no green-but-wrong assumptions.
- **+** Pre-mortem's R1/R5 turned a plausible-but-fragile "final-step reference" into a gate-carrying terminal step; the inert-off invariant is the whole justification for shipping this as a general opt-in, so it was worth the rigor.
- **+** Reused the existing PATTERNS.md "reference a shared pattern" mechanism (daily-winddown already refs it 9×) — new feature = one ref line + flip the flag, no per-skill prose drift.
- **−** `dev/executions/` is gitignored in this repo, so the /ship build log stayed local (fine, but worth knowing for resume).

## Recommendations
- **Continue:** flag-gated default-off + adversarial pre-mortem/review for skill-prose changes that carry an invariant.
- **Start:** treat "carry the gate in the ref line" and "anchor after the report step" as standing skill-authoring rules (now in skills LEARNINGS.md).
- **Watch:** model-fidelity of the agent-written entry across a real soak; if it drifts, build Tier-3 (`arete usage-log append`).

## Follow-ups
- Post-merge: `cp` the 4 files into `~/code/arete-reserv/.arete/skills/` (skip-if-exists won't propagate), confirm `dev/` is gitignored there, then set `usage_log: true`.
- Tier-2 harness: `soak-review` authored in `.pi/skills/`; re-home to a native Claude Code skill if the BUILD→Claude port lands.
- Tier-3 (conditional): deterministic CLI writer + inert-off unit test, only on observed drift.

Detail: `dev/work/plans/soak-logging/{plan,prd,pre-mortem,review}.md`.
