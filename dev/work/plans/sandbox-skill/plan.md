---
title: "Sandbox Skill — Release Testing Against Real Workspace Data"
slug: sandbox-skill
status: draft
size: small
tags: [testing, skills, worktree, sandbox, intelligence]
created: "2026-04-05T00:00:00.000Z"
updated: "2026-04-05T00:00:00.000Z"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Sandbox Skill — Release Testing Against Real Workspace Data

## Goal

A `/sandbox` skill that spins up an isolated, repeatable testing environment for Areté releases — using real workspace data without touching the real workspace.

## Context

Testing the intelligence layer (meeting extraction, briefing, context) against synthetic fixtures is insufficient — extraction quality depends on real context: people files, prior meetings, decisions, projects. The solution is a persistent test workspace (`~/code/arete-reserv-test`, already exists) that mirrors `arete-reserv`, paired with a git worktree that builds the release branch in isolation.

The skill handles all mechanical setup and generates a targeted test plan based on what changed. Triggered by "let's test in the sandbox", "sandbox", or `/sandbox`.

Related: `dev/work/plans/meeting-extraction-eval/` — ground-truth eval suite; sandbox skill is the runtime environment that would eventually run those evals.

## Plan

### 1. Create `scripts/sandbox-sync.sh`
One-way rsync from `arete-reserv` → `arete-reserv-test` with appropriate exclusions (`.git/`, `node_modules/`, `.claude/`, `.cursor/`, `dev/`). Leaves `inputs/` intact (needed for extraction tests). Uses `--delete` to keep test workspace a clean mirror.

AC: Running the script updates `arete-reserv-test` and outputs rsync stats. Re-runnable safely.

### 2. Create `.pi/skills/sandbox/SKILL.md`
Main skill with 6 phases:

- **Phase 0 — Resolve Context**: get current branch, check for existing worktree, compute diff base (`git merge-base main HEAD`), capture changed files
- **Phase 1 — Worktree Setup**: create `~/code/arete.worktrees/sandbox` (force-remove if exists), verify worktree guard, set `ARETE_BIN`
- **Phase 2 — Build**: delete stale `.tsbuildinfo`, run `build:packages` (or full `build` if `packages/apps/` changed), verify binary
- **Phase 3 — Sync**: run `sandbox-sync.sh`, verify `arete.yaml` intact
- **Phase 4 — Analyze & Generate Test Plan**: map changed files to domains → targeted test commands (from `test-scenarios.md`)
- **Phase 5 — Present Instructions**: regression baseline + targeted tests + reference block (`ARETE_BIN`, pattern, cleanup command)
- **Phase 6 — Offer to Run & Review**: offer to run extraction on 1-2 meetings (latest 1:1 + team), read staged sections, flag quality issues (duplicates, wrong attribution, irrelevant items)

AC: Invoking `/sandbox` on a feature branch completes all phases and outputs a ready-to-use test plan.

### 3. Create `.pi/skills/sandbox/test-scenarios.md`
Domain-indexed catalog of test commands + "what to observe" quality checks. Referenced by the skill's Phase 4 when mapping changed files to test scenarios.

Domains: Meeting Extraction, Intelligence/Briefing, Search/Context, CLI Commands, GWS Integration, Krisp/Fathom, Calendar.

AC: Every domain in the mapping table has corresponding commands and quality checks.

### 4. Create `.pi/skills/sandbox/regression-checklist.md`
Always-run baseline (5 commands) with expected output and failure signals:
1. `status` — workspace health
2. `context --for "..."` — context retrieval
3. `brief --for "..."` — briefing pipeline
4. `meeting extract --latest` — extraction pipeline
5. `memory search "..."` — memory search

Failure protocol: compare against production `arete` on same command to isolate regression.

AC: Checklist is self-contained and copy-pasteable with `$ARETE_BIN` substituted.

## Key Decisions

- **Worktree**: persistent at `~/code/arete.worktrees/sandbox`, always force-recreated on invocation (avoids stale state)
- **Build target**: `build:packages` (core+cli) by default; escalate to full `build` only if `packages/apps/` changed
- **Sync**: one-way only, `arete-reserv` → `arete-reserv-test`, never the reverse
- **No auto-cleanup**: worktree stays after skill completes for ad-hoc testing
- **Run & review**: Phase 6 is opt-in — agent offers to run extraction and analyze output quality

## Edge Cases

| Situation | Handling |
|---|---|
| Called on `main` | Diff base = last tag; note targeted tests are limited |
| Worktree exists from prior session | Force-remove + recreate |
| Build fails | Halt at Phase 2, present error, do not continue |
| `packages/apps/` in diff | Full `npm run build`, warn it takes longer |
