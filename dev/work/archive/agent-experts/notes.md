# Agent Experts — Exploration Notes

## Problem Statement

The current BUILD mode system prompt tries to make one agent know everything — BUILD vs GUIDE, product vision, CLI commands, code conventions, memory practices, plan lifecycle, skill routing, AND the codebase. This leads to:
- Context confusion (e.g., not knowing `arete route` is GUIDE-only)
- Agents lacking deep knowledge of specific areas, causing bugs and regressions
- Context flooding — too much loaded, not enough of it relevant to the task at hand

## Core Concept: Two-Dimensional Agent Composition

### Dimension 1: Specialty (Expertise Profiles)
Agents that deeply know a specific area — its architecture, invariants, relationships, key files, design rationale.

Examples (could split by package or feature):
- **Core** — services, intelligence layer, integrations framework
- **CLI** — commands, UX patterns, how CLI connects to core
- **Intelligence** — context, memory, entity resolution, briefing
- **Integrations** — calendar, Fathom, provider patterns
- **Skills Manager** — skill lifecycle, templates, routing
- **Configuration** — workspace structure, settings, runtime assets

### Dimension 2: Role (Behavioral Overlays)
How the agent behaves — orchestrator, developer, reviewer, engineering lead, etc. These compose with expertise profiles.

### The Three Layers

```
Layer 1: Planner (default persona, always loaded)
         → vision, BUILD/GUIDE awareness, workflow, routing to experts
         → synthesizes expert feedback into unified plans
         → the ONLY agent the human directly talks to

Layer 2: Expertise Profile (loaded when work touches that area)
         → architecture, invariants, relationships, key files
         → design rationale, patterns, gotchas
         → self-maintaining (agents update their own profiles)

Layer 3: Role (composed when entering build/execution)
         → orchestrator behavior, developer behavior, reviewer behavior
         → applied as behavioral overlay on top of expertise
```

## The Planner (Default Agent Persona)

### What the Planner Knows
- BUILD vs GUIDE distinction (what's dev tooling vs product)
- Vision, strategy, product architecture (high-level)
- The backlog, current work state, plan lifecycle
- Which expertise profiles exist and when to invoke them
- SDLC workflow — idea → plan → build → ship
- Tools and agents available in BUILD mode
- How to synthesize expert feedback into unified plans

### What the Planner Does NOT Need
- Deep code internals of any package
- Implementation patterns, file structures, invariants
- How specific integrations work under the hood
- dev.mdc details (conventions, testing rules, code review checklists)
- testing.mdc details

### What the Planner Does
- Discusses ideas and tasks with the human
- Scopes problems, features, and potential solutions at a high level
- Spawns expert agents (with appropriate role) for feasibility, technical planning, feedback
- Synthesizes expert responses into unified plans (not just pass-through)
- Manages multiple rounds of expert consultation when needed
- Routes approved plans to the right orchestrator for execution

### Planner Synthesis
The planner synthesizes — it doesn't just relay. When the core expert says "we need to extend the service layer" and the CLI expert says "this needs a new command group," the planner merges that into a unified plan. This requires enough architectural understanding to merge intelligently.

## Workflow Example: New Gmail Integration

1. **Human + Planner** scope the high-level idea (problem, features, potential solution)
2. **Planner** spawns **core expert + engineering lead role** → "here's the context, assess feasibility, what needs to change in core?"
3. **Planner** spawns **CLI expert + engineering lead role** → "here's the context + core expert's findings, what CLI changes needed?"
4. **Planner** synthesizes both into a unified plan, may go back for refinement rounds
5. **Human + Planner** review, approve, run pre-mortem/review
6. On `/build`, **Planner** passes context (high-level info, PRD, plan) to **orchestrator**
7. **Orchestrator** (who can load relevant profiles) spawns:
   - **Core expert + developer role** for core tasks
   - **CLI expert + developer role** for CLI tasks
   - **Core expert + reviewer role** for code review (at orchestrator's discretion)

## Back-and-Forth Model (v1)

Sequential subagent calls with planner synthesis:
- Planner spawns expert, gets response
- Planner decides if another round is needed based on response
- Planner feeds previous expert responses into next calls as context
- Planner synthesizes all responses into unified output for human

Works with existing pi subagent infrastructure. No new tooling needed for v1.

---

## Artifact Structure & Locations

### Current State → New State

#### 1. AGENTS.md (Root — BUILD mode)

**Current**: Monolithic compressed file with everything — vision, workspace structure, CLI commands, skills index, rules index, conventions, memory, personas. Compiled from `.agents/sources/shared/` + `.agents/sources/builder/`.

**New**: Becomes the **Planner's context**. Dramatically lighter:
- ✅ Keep: Vision, high-level product architecture, BUILD vs GUIDE awareness
- ✅ Keep: Available expertise profiles (names, what they cover, when to invoke)
- ✅ Keep: Available roles (names, what they do)
- ✅ Keep: Plan lifecycle, skills index (planner needs to know what skills exist)
- ✅ Keep: Memory references (MEMORY.md, collaboration.md)
- ❌ Remove: Conventions, testing details, import rules, code review checklists → move into role instructions
- ❌ Remove: Deep CLI command reference → moves into CLI expertise profile
- ❌ Remove: Workspace structure details → moves into relevant profiles

The `.agents/sources/builder/` files get reorganized. Some content stays (for the planner), some migrates to profiles or roles.

**Mechanism**: Option A preferred — restructure `.agents/sources/builder/` content so the existing build script produces a planner-focused AGENTS.md. No new loading mechanism needed.

#### 2. `.pi/agents/` — Role Definitions (Layer 3)

**Current**: developer.md, orchestrator.md, engineering-lead.md, reviewer.md, product-manager.md

**New**: Stay as **role behavioral overlays**, with two changes:

1. **Extract shared conventions**: Testing rules, import conventions, commit format currently baked into developer.md. These should be in a shared "build-standards.md" that roles reference, not duplicated across roles.

2. **Add composition instructions**: Each role needs a section like "When loaded with an expertise profile, your technical knowledge comes from the profile. Follow its invariants, read its manifest files, respect its relationships."

Roles become cleaner — they define *how you behave* without encoding *what you know about the codebase*.

#### 3. `.agents/expertise/` — Expertise Profiles (Layer 2) — **NEW**

Sibling to `.agents/skills/` and `.agents/sources/`.

```
.agents/expertise/
  core/
    PROFILE.md          # Architecture, design philosophy, key abstractions
    MANIFEST.md         # Files to ALWAYS read before working here
    RELATIONSHIPS.md    # How core connects to CLI, runtime, etc.
  cli/
    PROFILE.md
    MANIFEST.md
    RELATIONSHIPS.md
```

**PROFILE.md** contains:
- Package purpose and boundaries
- Key architectural decisions
- Module map
- Invariants
- Design rationale

**MANIFEST.md** contains:
- "Before ANY work in this area, read these files first"
- Organized by sub-area
- Includes relevant LEARNINGS.md locations

**RELATIONSHIPS.md** contains:
- Cross-package dependency map
- "Changes to X may affect Y"
- Integration points

**Key distinction from LEARNINGS.md**:
- LEARNINGS.md = reactive, specific: "this broke because X, avoid Y" (captures incidents)
- Profiles = proactive, structural: "this system works like X, always consider Y" (captures understanding)

#### 4. `.cursor/rules/` — Auto-loaded Rules

**Current**: dev.mdc, testing.mdc, plan-pre-mortem.mdc — auto-loaded into every conversation with full detail.

**Challenge**: IDE auto-loads these, so planner gets them even though it doesn't need the detail.

**Options**:
- **Thin them out**: testing.mdc becomes "tests are required, experts know the details" — one line instead of a page
- **Move detail into roles/profiles**: Testing rules, code review checklists, import conventions → developer/reviewer role definitions or shared "build-standards.md"
- **Rules become routing hints**: dev.mdc tells the planner "use the execution path decision tree" and "spawn the right experts" rather than "here's how to write TypeScript"

This is the trickiest part — IDE mechanics constrain what we can do.

#### 5. Build Skills (`.agents/skills/`)

**Current**: execute-prd, review-plan, run-pre-mortem, etc.

**New**: Mostly unchanged, but execute-prd needs updating to support composition model — spawning `expertise + role` instead of just `role`.

#### 6. LEARNINGS.md Files

**Unchanged**. Co-located with code. Expertise profiles reference their locations in MANIFEST.md.

#### 7. GUIDE Mode AGENTS.md

**Unchanged** for now. `.agents/sources/shared/` + `.agents/sources/guide/` still compile into the user-facing AGENTS.md.

### Summary: Where Everything Lives

```
.pi/
  agents/            # Layer 3 — Role behavioral overlays
    developer.md     # Behavioral only, no codebase knowledge
    reviewer.md
    orchestrator.md
    engineering-lead.md
    product-manager.md
  skills/            # Build skills (moved from .agents/skills/, symlinks removed)
    execute-prd/     # Updated for expertise + role composition
    review-plan/
    run-pre-mortem/
    plan-to-prd/
    prd-post-mortem/
    prd-to-json/
    synthesize-collaboration-profile/
  expertise/         # NEW — Layer 2 profiles
    core/
      PROFILE.md
      MANIFEST.md
      RELATIONSHIPS.md
    cli/
      PROFILE.md
      MANIFEST.md
      RELATIONSHIPS.md
  extensions/        # Pi extensions (unchanged)
  settings.json      # Pi config (unchanged)

.agents/
  sources/           # AGENTS.md generation pipeline (stays for now)
    shared/          # Compiles into both BUILD + GUIDE AGENTS.md
    builder/         # Restructured → planner-focused BUILD AGENTS.md
    guide/           # GUIDE-mode AGENTS.md (unchanged)

.cursor/rules/       # Thinned out for planner
  dev.mdc            # Lighter, routing-focused
  testing.mdc        # Minimal, details move to roles
  plan-pre-mortem.mdc # Probably stays similar

AGENTS.md            # Rebuilt as planner context (lighter)
```

---

## Maintenance Model (Two Tiers)

### Light Maintenance (every expert agent run)
- Lightweight checklist in role instructions
- Update LEARNINGS.md with any new gotchas
- Flag if profile has inaccuracies discovered during work
- Quick cleanup of docs touched during the work

### Deep Maintenance (triggered by planner for large/complex changes)
- Planner identifies: "this touched core architecture significantly"
- Spawns expert in a **maintenance role** to review and update their profile
- Update PROFILE.md, MANIFEST.md, RELATIONSHIPS.md as needed
- Review LEARNINGS.md for entries that should graduate to profile-level knowledge

---

## Phased Implementation Plan (Draft)

### Phase 0: Consolidate Build Infrastructure in `.pi/`
- Move skills from `.agents/skills/` to `.pi/skills/` (remove symlinks, make `.pi/skills/` the source of truth)
- Update any references in AGENTS.md sources, skill loading, documentation
- Decide on `.agents/sources/` location (stay or move)

### Phase 1: Expertise Profiles
- Create 2 profiles in `.pi/expertise/`: core + CLI
- Just markdown files: PROFILE.md, MANIFEST.md, RELATIONSHIPS.md
- Test manually — load profiles into conversations during real work
- Validate: do they actually reduce mistakes and improve agent quality?

### Phase 2: Planner Prompt
- Restructure `.agents/sources/builder/` for planner-focused AGENTS.md
- Strip deep implementation details
- Add: expert awareness, routing logic, synthesis responsibilities
- Thin out `.cursor/rules/` — move detail into roles/profiles

### Phase 3: Role Cleanup & Composition
- Extract shared conventions from roles into shared doc
- Add composition instructions to roles
- Update execute-prd skill for expertise + role spawning
- Light maintenance checklist in role instructions

### Phase 4: Deep Maintenance Triggers
- Planner identifies when deep profile updates are needed
- Maintenance role definition
- Graduation logic: when LEARNINGS.md entries become profile knowledge

---

## Decision: Go All-In on `.pi/` for BUILD Mode (2026-03-01)

### Context

Explored the `.agents/` vs `.pi/` split. Found:
- `.pi/skills/` contains symlinks back to `.agents/skills/` (commit 781a0d3, 2026-02-16). No memory entry or learning about why — just needed pi to discover skills from `.pi/skills/` when source of truth was `.agents/skills/`.
- `.pi/agents/` has the role definitions (orchestrator, developer, reviewer, etc.) — pi-specific, uses `subagent()` tool.
- `.agents/sources/` builds AGENTS.md for both BUILD and GUIDE modes.
- `.agents/skills/` has build skills that fundamentally depend on pi's `subagent()` tool — they can't run in Cursor.

### Decision: `.pi/` is the home for all BUILD mode infrastructure

Rationale:
1. **No portability to preserve.** Build skills (execute-prd, subagent orchestration, review-plan) depend on pi's `subagent()` tool. They literally can't run in Cursor.
2. **The symlinks prove it.** Having to symlink `.agents/skills/` → `.pi/skills/` means pi is the real consumer. `.agents/` was a middleman adding indirection for no benefit.
3. **Simplicity.** One directory to understand, one place to look. No "is this the symlink or the source?" confusion.

### Updated Structure

```
.pi/
  agents/              # Role definitions (already here)
    developer.md
    reviewer.md
    orchestrator.md
    engineering-lead.md
    product-manager.md
  skills/              # Build skills (move here, drop symlinks from .agents/)
    execute-prd/
    review-plan/
    run-pre-mortem/
    ...
  expertise/           # NEW — expertise profiles (was .agents/expertise/)
    core/
      PROFILE.md
      MANIFEST.md
      RELATIONSHIPS.md
    cli/
      PROFILE.md
      MANIFEST.md
      RELATIONSHIPS.md
  extensions/          # Pi extensions (already here)
  settings.json        # Pi config (already here)

.agents/
  sources/             # KEEPS — AGENTS.md generation pipeline
    shared/            # Shared between BUILD and GUIDE AGENTS.md
    builder/           # BUILD-mode AGENTS.md sources (restructured for planner)
    guide/             # GUIDE-mode AGENTS.md sources (unchanged)
  skills/              # REMOVE — was source of truth, now .pi/skills/ is
```

### Why `.agents/sources/` stays

`.agents/sources/` is a build artifact pipeline — it compiles into AGENTS.md for both BUILD and GUIDE contexts. GUIDE-mode AGENTS.md ships to users in the npm package. This is genuinely IDE-agnostic (it's content generation, not tool infrastructure). Could move to `.pi/sources/` or `dev/agents-sources/` but no strong reason to — it's fine where it is.

### Open question

Where does `.agents/sources/` go? Options:
- **Stay in `.agents/sources/`** — it's a build pipeline, works fine there
- **Move to `.pi/sources/`** — full consolidation under `.pi/`
- **Move to `dev/agents-sources/`** — since it's a dev build artifact

Builder's call. Low stakes — it's a build input, not runtime.

---

## Open Questions

- How many expertise profiles to start with? (Decision: core + CLI for phase 1)
- Where do profiles live? (Decision: `.pi/expertise/` — updated from `.agents/expertise/`)
- How does the planner prompt get loaded? (Leaning: restructure AGENTS.md compilation)
- What's the minimum content for a useful PROFILE.md?
- How do we handle cross-cutting work that spans multiple profiles?
- `.cursor/rules/` auto-loading — how to thin out without breaking GUIDE mode?
- Where does `.agents/sources/` end up? (see decision section above)
