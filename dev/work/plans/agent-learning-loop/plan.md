---
title: "Agent Learning Loop — Planner Identity, Patterns Guide, Maintenance Protocol"
slug: agent-learning-loop
status: building
size: small
tags: []
updated: 2026-03-02T04:59:23.938Z
has_review: true
---

# Agent Learning Loop

Three related improvements to the agent infrastructure we just built: give the planner an identity, document architectural patterns, and create a maintenance protocol so agents actively improve the system's knowledge as they work.

## Context

The agent-experts PRD established the 4-layer composition model (AGENTS.md → build-standards.md → role.md → PROFILE.md). What's missing:

1. **The planner has no identity.** Subagent roles all have personas ("You are the Orchestrator — a senior engineering manager...") but AGENTS.md and APPEND_SYSTEM.md tell the planner *what exists* and *how to work* without ever saying *who you are*. The planner needs a brief identity section — its role, how it thinks, when to act vs delegate.

2. **Mechanical rules exist but architectural patterns don't.** `build-standards.md` covers the *rules* (imports, types, naming, testing). The expertise profiles cover *where things are*. But nobody documents *how we build things* — the recurring design patterns and anti-patterns that apply across the whole codebase. The profiles have small Patterns/Anti-Patterns sections, but they're component-scoped. Codebase-level patterns (DI via constructor, testDeps injection, provider pattern, StorageAdapter abstraction, compat layer strategy) need a single reference.

3. **Agents don't own knowledge improvement.** Current state: LEARNINGS.md rules say "update after regressions" and maintenance checklists say "flag profile inaccuracies." But agents aren't empowered to *proactively* improve documentation. They don't create LEARNINGS.md for areas that need it, don't enrich profiles when they learn something new, don't turn start/stop/continue recommendations into system changes. Knowledge is write-once (post-mortem) with no feedback loop. The orchestrator/reviewer should review documentation changes, not just code changes.

## Plan

### Step 1: Add Planner Identity to AGENTS.md

Add a brief identity section at the top of AGENTS.md (before the Vision section). 5-10 lines.

**Content:**
- You are the planner — the builder's primary agent for Areté development
- You think before you act — explore, understand, then decide whether to act directly or delegate to an expert
- For small/clear tasks: act directly (with quality gates)
- For complex/multi-file tasks: plan first, then delegate (spawn experts with expertise profiles, or use PRD flow)
- You don't need to know everything — you route to experts who do. Your job is knowing WHAT to route WHERE.

**Why not a separate file?** The planner isn't a subagent role — it doesn't get loaded via Layer 3. Its identity belongs in AGENTS.md, the file it always sees.

### Step 2: Create Patterns Guide

Create `.pi/standards/patterns.md` (~100-150 lines) documenting codebase-level architectural patterns.

**Content (extracted from profiles + code):**
- **Service Composition**: DI via constructor, `createServices()` as only wiring point, services are stateless
- **Storage Abstraction**: All service I/O through `StorageAdapter`, adapters may use `fs` directly
- **testDeps Injection**: External binary dependencies use injectable deps objects (not module mocking)
- **Provider Pattern**: Integration factories return `Provider | null` (null = unavailable)
- **Compat Layer**: Legacy function-based APIs delegate to service classes for gradual migration
- **Error Handling**: When to throw vs return null vs fallback (graceful degradation convention)
- **Model Organization**: All types in `models/`, barrel-exported, services import from barrel
- **CLI → Core Boundary**: CLI handles UX (chalk, inquirer, ora), core handles logic. CLI destructures from `createServices()`.
- **Config Resolution**: Workspace `arete.yaml` > global `~/.arete/config.yaml` > defaults

**Reference from build-standards.md**: Add a line: "For architectural patterns and design conventions, see `.pi/standards/patterns.md`"

**Reference from expertise profiles**: Both profiles already have Patterns sections. Add a note: "For codebase-wide patterns, see `.pi/standards/patterns.md`"

### Step 3: Create Maintenance & Learning Protocol

Add a new section to APPEND_SYSTEM.md (or a new file `.pi/standards/maintenance.md` if it pushes APPEND_SYSTEM.md past 120 lines) defining how agents maintain and improve documentation.

**Two modes:**

**Light mode** (tiny/small tasks, bug fixes):
- Update LEARNINGS.md if you found a new gotcha
- Flag inaccuracies in profiles if you noticed any
- Done

**Detailed mode** (medium/large tasks, PRDs, after execution):
- Review and update LEARNINGS.md for all directories touched
- Review expertise profiles for accuracy — update if you found something wrong or missing
- Review patterns.md — add new patterns discovered, flag anti-patterns encountered
- If a subsystem needs deeper documentation than the profile provides, create it (e.g., `.pi/expertise/core/intelligence-deep-dive.md`)
- Apply start/stop/continue recommendations: update the relevant system files (standards, rules, role definitions, skill instructions) — don't just document them in memory entries

**Who does what:**
- **Developer**: Creates/updates LEARNINGS.md and flags profile issues in their completion report
- **Reviewer**: Verifies LEARNINGS.md updates happened, reviews documentation changes for accuracy
- **Orchestrator**: During holistic review, assigns documentation improvement tasks. Reviews profile/pattern updates. Ensures start/stop/continue items are applied to system files, not just memory entries.

**Key principle**: Agents are empowered to create documentation proactively — they don't need permission to create a LEARNINGS.md, add to a profile, or write a deep-dive doc. The orchestrator/reviewer reviews these as part of normal review flow.

### Step 4: Update Role Files for Learning Ownership

Update the developer, reviewer, and orchestrator role files to codify the learning protocol:

**Developer.md**: 
- Add to responsibilities: "After completing work, if you learned something about the domain that isn't in the expertise profile or LEARNINGS.md, document it. You're closest to the code — your insights are the most valuable."
- Expand maintenance checklist to include: check patterns.md, propose profile updates

**Reviewer.md**:
- Add to code review flow: Step 3.7 — "Documentation Review: Did the developer update LEARNINGS.md? Are their profile/pattern suggestions accurate? Review documentation changes with the same rigor as code."
- Add to maintenance checklist: review documentation changes for accuracy

**Orchestrator.md**:
- Add to holistic review: "Assign documentation improvement as a task when the execution revealed gaps. Treat profile/patterns updates as deliverables, not afterthoughts."
- Add to close-out: "Apply start/stop/continue to system files. Don't just write them in the memory entry — update the rules, standards, and role files they affect."
- Add to between-task intelligence: "If a subagent's reflection reveals a pattern or gotcha, feed it into the next subagent's context AND note it for profile/patterns update."

### Step 5: Update execute-prd Skill for Learning Loop

Update `.pi/skills/execute-prd/SKILL.md` to close the feedback loop:

- In Phase 3 (holistic review), add a documentation improvement step between the existing holistic review and the memory entry:
  - "Review subagent reflections for documentation improvements"
  - "Assign a developer to update profiles, patterns, LEARNINGS.md if gaps were found"
  - "Apply start/stop/continue to system files (standards, role definitions, skill instructions)"
- In the final report template, add a "System Improvements Applied" section showing what was updated beyond just code

## What This Achieves

**Before**: Agents follow rules mechanically. Knowledge captured in post-mortems sits in memory entries. Start/stop/continue recommendations are written once and never read again. The planner has no identity.

**After**: Agents actively improve the system's knowledge as they work. The developer closest to the code documents what they learn. The reviewer ensures documentation quality. The orchestrator closes the feedback loop by applying recommendations to system files. The planner knows who it is and when to delegate.

## Out of Scope

- New expertise profiles (runtime, integrations) — future work, will be created naturally as agents work in those areas
- Automated profile validation (checking claims against source) — too complex for now
- Changes to GUIDE mode or user-facing AGENTS.md
