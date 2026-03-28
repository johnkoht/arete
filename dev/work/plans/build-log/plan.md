---
title: Build Log
slug: build-log
status: idea
size: large
tags: []
created: 2026-03-28T03:27:36.149Z
updated: 2026-03-28T03:57:00.780Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 6
---

# Build Log for Ship Workflow

## Problem

When a `/ship` session stalls (killed, timeout, error), a new agent has no structured way to resume. They must infer state from scattered artifacts. We need explicit state tracking that enables seamless handoff between sessions.

## Solution

Introduce `build-log.md` as the human-readable inter-session handoff artifact for `/ship`. It's the single file a resuming agent reads to understand where we are, what decisions were made, and how to continue.

**Authority model**: build-log.md = phase-level/inter-session; status.json = task-level/intra-session (within execute-prd).

**Scope**: Ship skill only (V1). Execute-prd and hotfix deferred to V2.

## Out of Scope

- Execute-prd integration
- Hotfix integration
- `/build status` CLI command
- Shared Phase 0 extraction
- Automatic conflict resolution

Plan:
1. Create build-log template at `.pi/skills/ship/templates/build-log.md` with Build Context table (Type, Skill link, Plan link, PRD link, Branch, Worktree, Created timestamp), Current Status block (Phase, State, Last Update, optional Reason), and Progress section structure with session markers
2. Add Phase 0 to ship skill by inserting "Initialize or Resume Build Log" before Phase 1 in SKILL.md — on invocation check for existing log, if exists and incomplete then resume mode with summary display, if exists and complete then warn, if not exists then create from template
3. Add verification to Phase 0 that sanity-checks logged state matches artifacts before resuming — if log says Phase 1.2 complete verify pre-mortem.md exists, if log says Phase 3.1 complete verify worktree exists, warn on mismatch and ask user how to proceed
4. Update all ship phases to write progress entries with Started timestamp on begin, Completed entry with Outcome/Decisions/Artifacts on finish, and atomic Current Status updates on each transition including BLOCKED state with reason on gate pauses
5. Add session boundary handling so when Phase 0 detects resume it appends session marker with Started timestamp, Resumed From phase, and optional Resolution note before continuing
6. Document in AGENTS.md by adding build-log.md to workspace artifacts section and adding resume workflow to workflows section, plus update ship skill Recovery section to reference build-log as the primary resume mechanism