---
slug: soak-logging
status: approved
mode: single
has_pre_mortem: true
has_review: true
has_prd: false
---

# Soak logging — flag-gated usage log for the build→soak→review loop

## Context

When a feature is built in BUILD mode and soak-tested in `~/code/arete-reserv` over real days, the only record of those runs is scattered (winddown docs, `dev/diary/*`, `raw-extractions/`), the session transcript, and hand-typed `SOAK-FINDINGS.md`. There is no per-feature, discoverable usage log, so "I've been testing X, check the logs" requires a cold BUILD agent to already know where every artifact lands across two repos — and the highest-value signal (what the run did + gut reaction) lives nowhere structured. Finding #15 is the proof case: a whole soak night was confounded because a run silently dropped to Sonnet and hand-composed instead of calling the primitive, and nothing recorded it.

This adds a flag-gated step, baked into opted-in skills, that appends an **objective** usage entry per run to `~/code/arete-reserv/dev/soak/<skill-id>.md`. Subjective reaction is harvested later in BUILD via `/soak-review` (so it never nags daily users). Ships as a general opt-in (inert when off), not throwaway scaffolding.

**Decisions (this session):** full `/ship` path (rigor: inert-off invariant, the review skill, all three skills) — not the hand-applied build-now shortcut. Instrument **all three** named skills in v1: `daily-winddown`, `project-exit`, `update-project`. Execution follows the `/ship` protocol (`.pi/skills/ship/SKILL.md`), adapted below for a content-only change.

## What changed since the 2026-06-22 draft (verified today)

- The `winddown-approval` branch **merged into main** (v0.20.0). The old "add to the in-flight branch" recipe is dead — code lands in `feature/soak-logging` off main (the `/ship` worktree).
- All three target skills exist in canonical main (`packages/runtime/skills/{daily-winddown,project-exit,update-project}/SKILL.md`) **and** in the live workspace (`~/code/arete-reserv/.arete/skills/`).
- `packages/runtime` is a **content-only** package — no TS, no dist build for a markdown skill change. v1 needs zero compilation.
- **Sync is skip-if-exists for everything** (`workspace.ts:273-307`): per-skill subdirs AND root `.md` files only copy when the dest doesn't exist. PATTERNS.md is NOT in `SKILLS_DOC_FILES` (`workspace.ts:31-36`), so the stale comment at `:293` is wrong — but it's still skip-if-exists. **All four touched files need a manual `cp` to reach the existing workspace.**
- PATTERNS.md is a flat set of `## Section` patterns referenced by name from skills; `daily-winddown` already references it 9×. The mechanism is proven in guide mode.

## Design

### Files to change

Canonical source (edited in the `feature/soak-logging` worktree):

1. `packages/runtime/skills/PATTERNS.md` — add one `## Usage Logging` section (shared prose + entry format, below).
2. `packages/runtime/skills/daily-winddown/SKILL.md` — add a final-step reference line.
3. `packages/runtime/skills/project-exit/SKILL.md` — same reference line (currently 0 PATTERNS refs).
4. `packages/runtime/skills/update-project/SKILL.md` — same reference line.

New BUILD-mode skill:

5. `soak-review` — see harness-location note under Tier 2.

### `## Usage Logging` section content (PATTERNS.md)

Prose: **the literal first sentence is the hard gate** — "Read `usage_log` from `arete.yaml`; if absent or false, STOP — do nothing, create no directory." (pre-mortem R1: nothing, not even a `mkdir`, happens before the gate.) If true, after the skill completes its real work, append one entry to the absolute workspace path `<workspace-root>/dev/soak/<skill-id>.md` (pre-mortem R6: absolute, workspace-root-anchored — never a bare relative `dev/soak/`) using this format:

```
## 2026-06-20T18:42 · daily-winddown · feat/single-pass-extraction · Opus 4.8

- **Config:** extraction_mode=single_pass · reconcile_mode=inline · winddown_render=theme · reconcile_shadow=true
- **Commands:** meeting extract ×6 · winddown render 2026-06-20 · winddown apply 2026-06-20
- **Artifacts:** winddown-2026-06-20.md (62 anchors) · .baseline.md · raw-extractions/ (6 snapshots)
- **Outcome:** 23 approved→memory · 27 skipped · 6 commitments · 2 meetings scheduled
- **Anomalies:** Anthony 1:1 extracted 0 items (chef flagged + recovered); staged_item_owner present
- **Agent notes:** dedup caught ai_005→2530e74b; no hand-author fallback
```

Mandatory fields and why: **Model tier** (finding #15 — catches silent Sonnet drops; the model writes its own tier, so a Sonnet run that logs says "Sonnet" loudly); **Config** (which `arete.yaml` flag arm this run exercised); **Commands/Artifacts** (what ran, with *pointers* to heavy files — never paste a winddown doc in); **Outcome** (headline counts); **Anomalies** (fail-loud breadcrumbs). No subjective field by design. **Every field is present every entry** (pre-mortem R4: use `· —` for an empty field rather than dropping the bullet, so all entries share one greppable shape); the bold labels are mandatory.

### Skill reference line (3 SKILL.md files)

A single terminal-step line that **carries the gate itself** (pre-mortem R1 — don't rely only on the gate inside PATTERNS.md) and is anchored **after each skill's always-run report step**, never in a trailing `## References`/`## Rollback` block (pre-mortem R5). Wording: "After the final report, if `usage_log` is true in `arete.yaml`, apply the **Usage Logging** pattern (PATTERNS.md § Usage Logging); otherwise do nothing." For `project-exit` this lands as a new **Step 7 (Post-report instrumentation)** so it survives the silent fast-path (review Observation A); for `daily-winddown` and `update-project` it attaches after their report step.

## Scope tiers (feature scope — NOT /ship phases)

- **Tier 1 — capture (this build):** the `## Usage Logging` section + the 3 skill reference lines.
- **Tier 2 — review (this build):** a `soak-review` BUILD skill that reads `~/code/arete-reserv/dev/soak/<feature>.md` (+ pointed-at artifacts + `git log`/diffs since the last checkpoint), diffs against the last review checkpoint, asks for a one-line gut reaction per run/cluster, and synthesizes into `SOAK-FINDINGS.md` grouped by severity with fixes cheapest-first (tier bump → prompt tighten → architecture). **First step (pre-mortem R3): diff the live workspace skill copies against canonical** (`diff ~/code/arete-reserv/.arete/skills/{PATTERNS.md,<skill>/SKILL.md}` vs `packages/runtime/skills/…`) and flag any drift before trusting the log — a forgotten `cp` means the soak generated data from prose that no longer matches canonical. **Harness location:** original plan said `.pi/skills/soak-review/`; the BUILD→Claude Code port is pending (`project_build_mode_claude_port`). Author it wherever BUILD skills currently live (`.pi/` today); confirm at execution if the port has landed.
- **Tier 3 — harden (deferred, evidence-gated):** deterministic CLI writer `arete usage-log append --skill <id> --json '{...}'` + inert-off unit test, only if Tier 1 shows model-fidelity drift.

## Inert-off invariant (the cost of shipping)

When `usage_log` is absent/false: no `dev/soak/` dir, no extra agent step, zero behavior delta. For a skill-level step this is prompt discipline + a smoke check, not a unit test — the pattern's first line is a hard gate ("if not true, STOP"). Known risk (accepted for v1): a weaker model could skip the agent-instruction step (the finding-#15 mode); lower stakes than render anchors (a missed entry costs a data point, not a corrupted commit), and review tolerates gaps. Tier 3 is the hardening path if it proves flaky.

## /ship execution (adapted for a content-only change)

Driven from Claude Code, substituting Agent subagents where `/ship` dispatches Pi agents, and manual `gh`/git for the merge gate. Mapping `.pi/skills/ship/SKILL.md` phases:

- **Phase 0 — Build log.** Initialize `dev/executions/soak-logging/build-log.md` from the template; update at each phase boundary.
- **Phase 1 — Pre-build (main):** save the approved plan here with frontmatter. Pre-mortem → `pre-mortem.md` (gate: pause on any CRITICAL). Cross-model review → `review.md` (gate: pause on structural blockers).
- **Phase 2 — Memory & PRD (main):** scan `memory/entries/` (last 14d + plan keywords) + `memory/collaboration.md` → 3-5 bullets; write `prd.md` + `prd.json` (tasks = the 4 edits + soak-review skill); commit `plan: soak-logging - artifacts` on main.
- **Phase 3 — Worktree:** create `feature/soak-logging` off main; verify CWD is the worktree before any code edit (Worktree Guard).
- **Phase 4 — Build (worktree):** make the 4 markdown edits + author `soak-review`. Final review subagent → READY/NEEDS_REWORK. **Dark-code audit is N/A** (no TS exports) — record "0 new exports" in the build log.
- **Phase 5 — Wrap & report (worktree):** memory entry + MEMORY.md index line; update touched `LEARNINGS.md` (or "no new learnings — verified"); commit `feat: soak-logging - implementation`; run `/wrap`; ship report; merge gate (interactive). **No dist rebuild** (content-only), so no dist commit.
- **Phase 6 — Cleanup:** after merge, remove the worktree + delete `feature/soak-logging`.

**Gates that pause for John:** any CRITICAL pre-mortem risk (1.2), structural review blocker (1.3), build NEEDS_REWORK (4.2), `/wrap` failure (5.4), and the merge gate (5.6, always interactive).

## Workspace re-sync (post-merge, to make the soak live)

All four files exist in the workspace already → skip-if-exists will NOT propagate them. After merge to main, copy from main:
```
A=/Users/john/code/arete
cp $A/packages/runtime/skills/PATTERNS.md                ~/code/arete-reserv/.arete/skills/PATTERNS.md
cp $A/packages/runtime/skills/daily-winddown/SKILL.md     ~/code/arete-reserv/.arete/skills/daily-winddown/SKILL.md
cp $A/packages/runtime/skills/project-exit/SKILL.md       ~/code/arete-reserv/.arete/skills/project-exit/SKILL.md
cp $A/packages/runtime/skills/update-project/SKILL.md     ~/code/arete-reserv/.arete/skills/update-project/SKILL.md
```
Turn on: add `usage_log: true` to `~/code/arete-reserv/arete.yaml`.

## Verification

- **`dev/` gitignored (pre-mortem R6):** before turning the flag on, confirm `dev/` (or `dev/soak/`) is gitignored in arete-reserv so entries naming people/commitments never get committed.
- **Flag-off smoke (recorded as explicit pass/fail in the build log):** with `usage_log` absent, run `/daily-winddown` in the workspace → assert no `dev/soak/` dir created, no extra step, run otherwise unchanged.
- **Flag-on capture:** add `usage_log: true`, run `/daily-winddown` → exactly one entry appended to `~/code/arete-reserv/dev/soak/daily-winddown.md`, with the **model tier** field populated (the finding-#15 check), config arm matching `arete.yaml`, pointers (not pasted bodies) for heavy artifacts.
- **Multi-skill:** run `project-exit` and `update-project` with the flag on → each writes its own `dev/soak/<skill-id>.md`.
- **Review loop:** from BUILD, run `soak-review daily-winddown` → reads the log across the repo boundary, prompts for gut reaction, produces a severity-grouped findings synthesis.

## Open items

- **Tier 2 harness location** — `.pi/` vs native Claude Code skill, pending the BUILD-mode port. Decide at execution.
- **Log rotation** — append-only per feature could grow over a long soak. Fine for v1 (review + reset). Later: per-week sub-headers or archive-on-review.
