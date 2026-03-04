---
title: Agent Experts
slug: agent-experts
status: complete
size: large
tags: [infrastructure, agents, context]
created: 2026-03-01T05:01:42.408Z
updated: 2026-03-02T03:25:47.135Z
completed: 2026-03-02T00:00:00.000Z
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 9
---

## Summary

Refactor BUILD mode agent infrastructure from monolithic context (everything loaded into every conversation) to a two-dimensional composition model: **expertise profiles** (deep codebase knowledge) composed with **roles** (behavioral overlays). A **planner** agent is the default persona that routes to experts and synthesizes their feedback.

## Problem

The current system loads ~700+ lines of context into every conversation (AGENTS.md + APPEND_SYSTEM.md + cursor rules), with massive duplication across three sources. This causes:
- **Context flooding**: Planner gets coding conventions it doesn't need; developers get product vision they don't need
- **Shallow knowledge**: No agent deeply knows any part of the codebase
- **Triple duplication**: Quality gates, testing rules, and conventions exist in APPEND_SYSTEM.md, dev.mdc, AND conventions.md

## Success Criteria

1. Planner context is <150 lines (down from ~700+)
2. Subagents get relevant, task-appropriate context via the 4-layer stack (role + domain expertise, not everything)
3. Zero content duplication across context files
4. Expertise profiles enable agents to navigate codebase accurately
5. Smoke tests pass: experts know their domain, planner routes instead of answering

## Architecture

### The 4-Layer Subagent Context Stack

```
Layer 1: AGENTS.md (~80-100 lines)
         Vision, expertise awareness, skills index, memory refs

Layer 2: build-standards.md (~200-300 lines)
         Quality gates, testing, conventions, code review, commit format

Layer 3: {role}.md (existing, cleaned up)
         Behavioral overlay: developer, reviewer, orchestrator, eng-lead

Layer 4: {expertise}/PROFILE.md (~200-250 lines each)
         Domain map: architecture, components, invariants, anti-patterns
```

### New File Layout

```
.pi/
  agents/              # Layer 3 — Roles (existing, updated)
  skills/              # Build skills (moved from .agents/skills/, symlinks removed)
  expertise/           # Layer 2 — NEW expertise profiles
    core/PROFILE.md
    cli/PROFILE.md
  standards/           # NEW shared standards
    build-standards.md
  extensions/          # Unchanged
  settings.json        # Unchanged
  APPEND_SYSTEM.md     # REWRITTEN — lightweight planner context

AGENTS.md              # REWRITTEN — hand-written planner context (no pipeline)

.agents/
  sources/
    shared/            # Stays (GUIDE pipeline)
    guide/             # Stays (GUIDE pipeline)
    builder/           # DELETED (content migrated)
  skills/              # DELETED (moved to .pi/skills/)

.cursor/rules/         # DELETED (not used for BUILD)
```

---

## Behavioral Model

This section documents HOW the system works end-to-end — the workflow, synthesis patterns, and interaction model that the infrastructure must support. Steps 3, 7, and 8 encode this behavior into the actual files.

### The Planner Workflow (Steps 1-7)

```
Step 1: Init
  User opens pi. Default agent loaded with AGENTS.md + APPEND_SYSTEM.md.
  Generalized — knows what's available, how to route, product vision.
  Does NOT have coding conventions, deep codebase knowledge, or testing rules.

Step 2: Planning
  Planner IS the default agent. /plan triggers planning behavior.
  No extra context needed — planner knows product, vision, strategy.
  For PM-specific depth → spawn PM subagent (rare, most planning is conversational).

Step 3: Technical Assessment (subagent)
  Planner spawns: engineering-lead role + relevant expertise (core, CLI, etc.)
  Subagent gets 4-layer context stack.
  Subagent DIGS DEEP using tools — reads source, uses LSP, checks LEARNINGS.md.
  Returns: compressed summary (feasibility, concerns, architecture notes).
  → Only the summary stays in planner context, not the raw expertise.

Step 4: Pre-mortem (two-pass)
  Pass 1: Planner does general pre-mortem (process, scope risks).
  Pass 2: Spawn expert subagent (role + expertise) with planner's pre-mortem.
  Expert focuses on domain-specific "what will actually break" risks.
  Expert subagent can use fast/cheap model (structured work with clear input).

Step 5: Review (subagent)
  Spawn: engineering-lead + relevant expertise(s).
  Input: plan + technical assessment + pre-mortem.
  Output: final review with go/no-go.

Step 6: Build (subagent chain)
  Orchestrator + execute-prd skill.
  Orchestrator determines which expertise profile(s) each task needs.
  Spawns: developer + expertise, reviewer + expertise per task.

Step 7: Close (subagent per expertise area touched)
  Each expert reviews their area:
  - Updates LEARNINGS.md with new gotchas
  - Flags profile inaccuracies for correction
  - Updates documentation affected by the work
  - Reflects on what was hard to find, adds to profile (self-improving)
```

### Context Isolation = The Core Design Principle

Subagents provide **context compression through delegation**. Each expert gets deep, focused context, does thorough investigation, and returns a compressed summary. The planner accumulates *conclusions*, not raw material.

This prevents context flooding: the planner never holds 500 lines of core architecture details. It holds "IntelligenceService needs to be extended, here's the approach and risks" — a paragraph, not a codebase tour.

### Planner Synthesis (Not Relay)

The planner **synthesizes** expert feedback — it doesn't just pass it through. When the core expert says "we need to extend the service layer" and the CLI expert says "this needs a new command group," the planner merges that into a unified plan with sequencing, dependencies, and trade-offs. This requires enough architectural understanding to merge intelligently, which is why AGENTS.md retains high-level architecture awareness.

### Ad-Hoc Expert Spawning

Not all interactions follow the full Steps 1-7 workflow. The planner can spawn experts for quick questions:

- "How does the search indexing work?" → spawn core expert → get architecture explanation
- "What CLI command handles skill installation?" → spawn CLI expert → get answer with file references
- "Would this change break any integrations?" → spawn core expert for cross-cutting assessment

This is a high-value use case — grounded answers from domain knowledge instead of hallucinated guesses.

### Maintenance Model (Two Tiers)

**Light maintenance (every expert run)**: Part of Step 7 / Close. Update LEARNINGS.md, flag profile inaccuracies. Cheap, default behavior encoded in role definitions.

**Deep maintenance (periodic, triggered by planner)**: When the planner identifies a significant architectural change ("this touched core architecture significantly"), it spawns an expert in a maintenance role to review and update their profile. This includes: updating PROFILE.md sections, reviewing LEARNINGS.md for entries that should graduate to profile-level knowledge, reorganizing profile structure if needed. **Deferred to future work** — not in scope for this plan.

---

## Plan

### Phase 1: Infrastructure Consolidation

**Step 1: Move skills to `.pi/skills/` (remove symlinks)**
- Remove symlinks in `.pi/skills/`
- Copy actual skill files from `.agents/skills/` to `.pi/skills/`
- Delete `.agents/skills/` directory
- Update `.pi/extensions/plan-mode/commands.ts` — change all 3 `.agents/skills/` path references to `.pi/skills/`. Run `npm run typecheck` to verify
- Update DEVELOPER.md — change all `.agents/skills/` references to `.pi/skills/`
- Update any other documentation references
- AC: All 7 build skills exist as real files in `.pi/skills/`, no symlinks. `grep -r "agents/skills" .pi/extensions/` returns nothing. Pi discovers skills correctly — verify by running `pi` and checking available_skills paths, or test `/pre-mortem` on a dummy plan

**Step 2: Create `build-standards.md`**
- Extract coding standards from `.agents/sources/builder/conventions.md`
- Extract testing requirements from `.cursor/rules/testing.mdc`
- Extract code review checklist, quality gates, commit format from `.pi/APPEND_SYSTEM.md`
- Merge into single `.pi/standards/build-standards.md`
- Remove duplicated content from role files (developer.md, reviewer.md)
- AC: Single file <500 lines with all coding/testing/review standards. No duplication in roles or APPEND_SYSTEM.md

**Step 3: Rewrite APPEND_SYSTEM.md and AGENTS.md (planner context)**

These two files must be designed together — they share a content boundary and both load into every pi conversation. Design both before writing either.

**Content boundary**:
- **AGENTS.md**: Static product/system awareness — vision, what exists (expertise, roles, skills), memory references, BUILD vs GUIDE. Answers: "what is available?"
- **APPEND_SYSTEM.md**: Dynamic process rules — how to behave (workflow, routing, composition instructions, LEARNINGS.md rules, execution path). Answers: "how should I work?"

APPEND_SYSTEM.md changes:
- Strip all coding standards, testing rules, code review checklists
- Keep: workflow (plan lifecycle, execution path), routing (when to spawn experts, available roles/expertise), process (LEARNINGS.md rules, memory capture, documentation check)
- Add: expertise awareness section (what profiles exist, when to invoke)
- Add: composition instructions (how to assemble 4-layer stack for subagents)

AGENTS.md changes:
- Replace generated AGENTS.md with hand-written planner context
- Content: vision, BUILD vs GUIDE awareness, expertise map, roles map, skills index, memory references
- Remove `build:agents:dev` from package.json scripts
- Update `build` script to: `"build:agents:prod && build:packages"` (just remove the dev step)
- Delete `.agents/sources/builder/` directory
- Update DEVELOPER.md — change `build:agents:dev` references, update `.agents/sources/builder/` references

Verification:
- Run `npm run build` — verify `dist/AGENTS.md` still generates correctly (GUIDE pipeline intact)
- Run `npm test` — verify no tests depend on the dev build target
- Check: no concept appears as a detailed section in BOTH files

- AC: AGENTS.md <100 lines, APPEND_SYSTEM.md <100 lines. Neither contains coding conventions. No content duplication between them. `npm run build` succeeds. `dist/AGENTS.md` contains GUIDE content

### Phase 2: Expertise Profiles

**Step 4: Create core expertise profile**
- Write `.pi/expertise/core/PROFILE.md` (~200-250 lines)
- Sections: Purpose & Boundaries, Architecture Overview, Component Map (each service explained), Key Abstractions & Patterns, Invariants, Anti-Patterns & Common Mistakes, Required Reading, Related Expertise, LEARNINGS.md Locations
- Must cover: IntelligenceService (briefing assembly, skill routing), ContextService (context gathering, primitive mapping, inventory), MemoryService (search, create, timeline, themes), EntityService (resolution, relationships, people management), WorkspaceService (detection, install, update), SkillService (discovery, installation), IntegrationService, ToolService, Search (providers, indexing), Adapters (cursor, claude), Storage
- **CRITICAL**: Must read actual source files before writing. Read every file in `packages/core/src/services/`, check LEARNINGS.md files, use LSP to verify dependency chains. Do not write from memory or guesses
- After writing, spot-check 3 claims against actual source code
- AC: Profile accurately describes architecture. An agent reading it can identify which service to modify for a given task. Spot-check passes

**Step 5: Create CLI expertise profile**
- Write `.pi/expertise/cli/PROFILE.md` (~200-250 lines)
- Cover: command structure, how commands consume core services, UX patterns (inquirer, chalk), CLI-specific patterns, entry points
- Cross-reference core profile
- **CRITICAL**: Must read actual source files in `packages/cli/src/commands/` before writing. Do not write from memory
- After writing, spot-check 3 claims against actual source code
- AC: Profile accurately maps CLI commands to core services. An agent reading it knows where CLI meets core. Spot-check passes

### Phase 3: Role Cleanup & Composition

**Step 6: Update role definitions for composition**
- Add composition instructions to each role: "When loaded with an expertise profile, your technical knowledge comes from the profile. Follow its invariants, read its manifest files, respect its relationships."
- Add instruction to read `build-standards.md` for coding conventions
- Remove any duplicated coding standards baked into roles
- Add light maintenance checklist: "After completing work, update LEARNINGS.md with any new gotchas. Flag if the expertise profile has inaccuracies."
- Keep changes minimal: composition section is additive (new section, not replacement). Only remove text that's clearly duplicated with build-standards.md, not paraphrased or adapted behavioral guidance
- AC: Roles are behavioral-only (no codebase knowledge embedded). Each role references build-standards.md and expertise profiles. Core behavioral sections remain intact

**Step 7: Update orchestrator for expertise-aware spawning**
- Update orchestrator.md to understand expertise profiles
- Add instructions for composing subagent context: which expertise to attach based on task area
- Update execute-prd SKILL.md to pass expertise profiles when spawning developer/reviewer subagents
- AC: Orchestrator can determine which expertise profile(s) a task needs and passes them to subagents

### Phase 4: Cleanup & Validation

**Step 8: Delete deprecated files**
- Delete `.cursor/rules/dev.mdc`, `testing.mdc`, `plan-pre-mortem.mdc`
- Delete `.cursor/rules/` directory (if empty)
- Verify no active code depends on deleted files
- Update DEVELOPER.md, SETUP.md — change remaining `.cursor/rules/` references
- Update `dev/catalog/capabilities.json` — update `pi-append-system-dev-rules` entry: replace cursor rules paths with `build-standards.md`, remove "keep both in sync" note
- AC: No `.cursor/rules/` directory. No broken references in active documentation. All `capabilities.json` paths point to existing files

**Step 9: Create smoke test document**
- Write `dev/work/plans/agent-experts/smoke-tests.md`
- Include 8-10 test scenarios across agent types:
  - Planner: routes technical questions instead of answering directly
  - Planner: knows what expertise profiles exist
  - Developer + core: identifies correct service for a feature change
  - Developer + core: references LEARNINGS.md locations
  - Developer + CLI: knows how CLI commands consume core services
  - Reviewer + core: applies invariants during review
  - Engineering-lead + core + CLI: assesses cross-cutting impact
  - Orchestrator: assigns correct expertise to tasks
- Each test: prompt, expected behavior, red flags
- AC: Document exists with ≥8 actionable test scenarios. Can be run manually to validate the system

---

## Out of Scope

- GUIDE mode changes (user-facing AGENTS.md, runtime skills, rules)
- New expertise profiles beyond core + CLI (runtime, integrations — future work)
- Automated test runner for smoke tests (manual for now)
- Deep maintenance triggers (Phase 4 from original notes — deferred)
- Changes to execute-prd's subagent spawning mechanism (just the context it passes)

## Dependencies

- Steps 1 and 2 can be done in parallel (no dependency between them)
- Step 3 depends on Step 2 (APPEND_SYSTEM.md and AGENTS.md reference build-standards.md; shared content boundary requires coordinated design)
- Steps 4-5 depend on Steps 2-3 (profiles must not duplicate build-standards.md content; must reference AGENTS.md expertise map)
- Steps 6-7 depend on Steps 4-5 (roles reference profiles that must exist)
- Steps 8-9 depend on everything else (cleanup and validation)

## Risks

See `pre-mortem.md` for full analysis (8 risks). Key risks and mitigations incorporated into steps:

1. **Plan-mode extension paths** (Critical): `.pi/extensions/plan-mode/commands.ts` hardcodes `.agents/skills/` in 3 places. → Addressed in Step 1
2. **GUIDE pipeline regression** (Critical): Incorrect build script modification could break npm package. → Addressed in Step 3 with explicit verification
3. **Profile accuracy** (Critical): Inaccurate profiles are worse than no profiles. → Addressed in Steps 4-5 with mandatory source code reading and spot-checks
4. **AGENTS.md/APPEND_SYSTEM.md overlap**: Without clear boundary, duplication returns. → Addressed in Step 3 with explicit content boundary definition
5. **AGENTS.md too thin**: Planner can't have useful conversations without constantly spawning experts. → Mitigated by keeping product/vision/strategy in planner, only stripping implementation details
6. **Scope creep in role cleanup**: Over-stripping roles breaks orchestration model. → Addressed in Step 6 with minimal-change guidance
7. **build-standards.md scope creep**: Could exceed 500 lines. → Split into separate files if needed
8. **DEVELOPER.md stale references**: Path changes spread across multiple steps. → Each step updates DEVELOPER.md for its changes
