# PRD: Agent Experts — BUILD Mode Context Refactor

## Goal

Refactor BUILD mode agent infrastructure from monolithic context (~700+ lines loaded into every conversation with triple duplication) to a two-dimensional composition model: expertise profiles (deep codebase knowledge) composed with roles (behavioral overlays). Planner context drops to <150 lines; subagents get focused, relevant context via a 4-layer stack.

## Background

See `plan.md` for full architectural details, behavioral model, and decision history. See `pre-mortem.md` for 8 identified risks with mitigations. See `review.md` for the structured review and devil's advocate analysis.

Key references for implementers:
- **4-Layer Stack**: AGENTS.md (vision/awareness) + build-standards.md (coding/testing) + role.md (behavioral) + PROFILE.md (domain expertise)
- **Content Boundary**: AGENTS.md answers "what is available?"; APPEND_SYSTEM.md answers "how should I work?"
- **Profiles are maps, not encyclopedias**: Orient the agent WHERE to look. The agent digs deep using tools (read, LSP, grep)
- **Context isolation**: Subagents return compressed summaries. Planner accumulates conclusions, not raw material

## Tasks

### Task 1: Move Build Skills to `.pi/skills/`

Move build skills from `.agents/skills/` (source of truth) to `.pi/skills/` (was symlinks), making `.pi/skills/` the real source. Update all references.

**What to do:**
1. Remove all symlinks in `.pi/skills/`
2. Copy actual skill directories from `.agents/skills/` to `.pi/skills/`
3. Delete `.agents/skills/` directory
4. Update `.pi/extensions/plan-mode/commands.ts` — change all 3 `.agents/skills/` path references to `.pi/skills/`
5. Update DEVELOPER.md — change all `.agents/skills/` references to `.pi/skills/`
6. Search for and update any other references: `grep -r "agents/skills" . --include="*.ts" --include="*.md" | grep -v node_modules | grep -v .git | grep -v convo.txt | grep -v notes.md | grep -v topics.md`

**Acceptance Criteria:**
- All 7 build skills exist as real files (not symlinks) in `.pi/skills/`
- `.agents/skills/` directory no longer exists
- `grep -r "agents/skills" .pi/extensions/` returns nothing
- `npm run typecheck` passes
- Pi discovers skills correctly (available_skills in system prompt show `.pi/skills/` paths)

### Task 2: Create `build-standards.md`

Consolidate all coding standards, testing requirements, and code review checklists from three duplicated sources into a single `.pi/standards/build-standards.md`.

**What to do:**
1. Read all three source files: `.agents/sources/builder/conventions.md`, `.cursor/rules/testing.mdc`, `.pi/APPEND_SYSTEM.md`
2. Read role files for duplicated content: `.pi/agents/developer.md`, `.pi/agents/reviewer.md`
3. Extract all coding/testing/review content into `.pi/standards/build-standards.md`
4. Organize into clear sections: Quality Gates, TypeScript Conventions, Testing Requirements, Code Review Checklist, Commit Format, Before Committing
5. Remove duplicated coding standards from role files (developer.md, reviewer.md) — keep behavioral guidance, remove only clear duplicates

**Acceptance Criteria:**
- `.pi/standards/build-standards.md` exists and is <500 lines
- Contains all coding standards, testing rules, quality gates, code review checklist, commit format
- No coding standards duplicated in `.pi/agents/developer.md` or `.pi/agents/reviewer.md`
- Content from all three sources is captured (nothing lost)

### Task 3: Rewrite APPEND_SYSTEM.md and AGENTS.md

Rewrite both planner context files together. These share a content boundary — design both before writing either.

**Content boundary:**
- **AGENTS.md** answers "what is available?" — vision, what exists (expertise, roles, skills), memory references, BUILD vs GUIDE
- **APPEND_SYSTEM.md** answers "how should I work?" — workflow, routing, composition instructions, LEARNINGS.md rules, execution path

**What to do:**
1. Draft both files before writing either (they must be coherent together)
2. AGENTS.md: hand-written planner context with vision, BUILD vs GUIDE awareness, expertise map (profiles available, when to invoke), roles map, skills index, memory references
3. APPEND_SYSTEM.md: workflow (plan lifecycle, execution path decision tree), routing (when/how to spawn experts), composition instructions (how to assemble 4-layer subagent stack), process rules (LEARNINGS.md behavior, memory capture, documentation check)
4. Remove `build:agents:dev` from package.json build script — change to: `"build": "npm run build:agents:prod && npm run build:packages"`
5. Delete `.agents/sources/builder/` directory
6. Update DEVELOPER.md — change `build:agents:dev` references, update `.agents/sources/builder/` references
7. Verify: `npm run build` succeeds, `dist/AGENTS.md` still contains GUIDE content (pipeline intact)
8. Verify: `npm test` passes (no tests depend on dev build target)
9. Verify: no concept appears as a detailed section in BOTH files

**Acceptance Criteria:**
- AGENTS.md is <100 lines, hand-written (no generation pipeline)
- APPEND_SYSTEM.md is <100 lines
- Neither file contains coding conventions, testing rules, or code review checklists
- No content duplication between the two files
- `npm run build` succeeds and `dist/AGENTS.md` contains GUIDE content
- `npm test` passes
- `.agents/sources/builder/` directory no longer exists
- `build:agents:dev` script no longer exists in package.json

### Task 4: Create Core Expertise Profile

Write `.pi/expertise/core/PROFILE.md` — the domain map for the `packages/core/` package.

**CRITICAL**: Must read actual source files before writing. Read every file in `packages/core/src/services/`, check all LEARNINGS.md files in core, use LSP to verify dependency chains. Do NOT write from memory or guesses.

**What to do:**
1. Read all service files: `packages/core/src/services/*.ts`
2. Read all LEARNINGS.md: `find packages/core -name LEARNINGS.md`
3. Read search, adapters, storage, integrations, models structure
4. Write PROFILE.md with sections: Purpose & Boundaries, Architecture Overview, Component Map (each service with what-it-does description), Key Abstractions & Patterns, Invariants, Anti-Patterns & Common Mistakes, Required Reading (files to check before working), Related Expertise (cross-references to CLI), LEARNINGS.md Locations
5. Cover: IntelligenceService (briefing assembly, skill routing), ContextService (context gathering, primitive mapping), MemoryService (search, create, timeline), EntityService (resolution, relationships, people), WorkspaceService (detection, install, update), SkillService (discovery, installation), IntegrationService, ToolService, Search (providers, indexing), Adapters (cursor, claude), Storage
6. After writing, spot-check 3 random claims against actual source code

**Acceptance Criteria:**
- `.pi/expertise/core/PROFILE.md` exists, ~200-250 lines
- Accurately describes the architecture (spot-check 3 claims — all verified against source)
- An agent reading it can identify which service to modify for a given task
- Cross-references CLI expertise profile
- Lists all LEARNINGS.md locations in core

### Task 5: Create CLI Expertise Profile

Write `.pi/expertise/cli/PROFILE.md` — the domain map for the `packages/cli/` package.

**CRITICAL**: Must read actual source files in `packages/cli/src/commands/` before writing. Do NOT write from memory.

**What to do:**
1. Read all command files: `packages/cli/src/commands/*.ts`
2. Read CLI entry point and utility files
3. Read any LEARNINGS.md in CLI package
4. Write PROFILE.md with sections: Purpose & Boundaries, Command Architecture (how commands are structured), Command Map (each command, what core service it uses), UX Patterns (inquirer, chalk conventions), Entry Points, Required Reading, Related Expertise (cross-references to core), LEARNINGS.md Locations
5. Map each CLI command to the core service it consumes
6. After writing, spot-check 3 random claims against actual source code

**Acceptance Criteria:**
- `.pi/expertise/cli/PROFILE.md` exists, ~200-250 lines
- Accurately maps CLI commands to core services (spot-check 3 claims — all verified)
- An agent reading it knows where CLI meets core
- Cross-references core expertise profile

### Task 6: Update Role Definitions for Composition

Add composition instructions to each role file so they work with expertise profiles and build-standards.md.

**What to do:**
1. Read `.pi/standards/build-standards.md` to understand what's there
2. For each role (developer.md, reviewer.md, orchestrator.md, engineering-lead.md, product-manager.md):
   a. Add a "Composition" section: "When loaded with an expertise profile, your technical knowledge comes from the profile. Follow its invariants, read its required files, respect its relationships."
   b. Add reference to build-standards.md: "For coding conventions, testing rules, and quality gates, read `.pi/standards/build-standards.md`"
   c. Diff role content against build-standards.md — remove only text that is clearly duplicated (not paraphrased or adapted behavioral guidance)
   d. Add light maintenance checklist: "After completing work: update LEARNINGS.md with any new gotchas, flag if the expertise profile has inaccuracies"
3. Keep changes minimal and additive — composition section is a new section, not a replacement

**Acceptance Criteria:**
- All 5 role files have a "Composition" section
- All 5 role files reference build-standards.md
- No coding standards duplicated between roles and build-standards.md
- Core behavioral sections of each role remain intact (compare before/after)
- All role files have maintenance checklist

### Task 7: Update Orchestrator for Expertise-Aware Spawning

Update the orchestrator and execute-prd skill to compose subagent context with the right expertise profile(s).

**What to do:**
1. Update `.pi/agents/orchestrator.md`:
   - Add section on expertise profiles: what they are, where they live (`.pi/expertise/{area}/PROFILE.md`)
   - Add instructions for determining which expertise profile(s) a task needs based on which package/area it touches
   - Add instructions for composing the 4-layer context stack when spawning subagents
2. Update `.pi/skills/execute-prd/SKILL.md`:
   - Add guidance for passing expertise profiles when spawning developer and reviewer subagents
   - Include instruction to read the relevant PROFILE.md and pass it as context

**Acceptance Criteria:**
- Orchestrator.md describes how to determine which expertise to attach to a task
- Orchestrator.md describes the 4-layer composition model
- execute-prd SKILL.md includes guidance for expertise-aware spawning
- An orchestrator following these instructions would attach `core` expertise to core tasks and `cli` expertise to CLI tasks

### Task 8: Delete Deprecated Files and Update References

Clean up deprecated files and update all remaining stale references.

**What to do:**
1. Delete `.cursor/rules/dev.mdc`, `.cursor/rules/testing.mdc`, `.cursor/rules/plan-pre-mortem.mdc`
2. Delete `.cursor/rules/` directory if empty
3. Update DEVELOPER.md — change any remaining `.cursor/rules/` references
4. Update SETUP.md — change any `.cursor/rules/` references
5. Update `dev/catalog/capabilities.json`:
   - Find the `pi-append-system-dev-rules` capability entry
   - Replace `.cursor/rules/dev.mdc` and `.cursor/rules/testing.mdc` in `implementationPaths` and `readBeforeChange` with `.pi/standards/build-standards.md`
   - Remove the "Keep both in sync" note
6. Search for any other references: `grep -r "cursor/rules" . --include="*.ts" --include="*.md" --include="*.json" | grep -v node_modules | grep -v .git | grep -v archive | grep -v convo.txt`

**Acceptance Criteria:**
- `.cursor/rules/` directory no longer exists
- No references to `.cursor/rules/` in DEVELOPER.md, SETUP.md, or capabilities.json
- All `capabilities.json` paths in `implementationPaths` and `readBeforeChange` point to files that exist
- No broken references in active documentation (archive files excluded)

### Task 9: Create Smoke Test Document

Write a smoke test document with 8-10 test scenarios to manually validate the new agent composition model.

**What to do:**
1. Write `dev/work/plans/agent-experts/smoke-tests.md`
2. Include test scenarios across all agent types. For each test: prompt to use, expected behavior, red flags that indicate failure
3. Cover at minimum:
   - Planner routes technical questions instead of answering directly
   - Planner knows what expertise profiles exist and when to invoke them
   - Developer + core expertise identifies correct service for a feature change
   - Developer + core expertise references LEARNINGS.md locations from profile
   - Developer + CLI expertise knows how CLI commands consume core services
   - Reviewer + core expertise applies invariants during review
   - Engineering-lead + core + CLI assesses cross-cutting impact
   - Orchestrator assigns correct expertise profile(s) to tasks

**Acceptance Criteria:**
- `smoke-tests.md` exists with ≥8 test scenarios
- Each scenario has: prompt, expected behavior, red flags
- Scenarios cover all agent types: planner, developer, reviewer, engineering-lead, orchestrator
- Scenarios test both single-expertise and multi-expertise cases

## Out of Scope

- GUIDE mode changes (user-facing AGENTS.md, runtime skills, rules)
- New expertise profiles beyond core + CLI (runtime, integrations — future work)
- Automated test runner for smoke tests (manual for now)
- Deep maintenance triggers (deferred to future work)
- Changes to execute-prd's subagent spawning mechanism (just the context it passes)
- Any changes to `packages/core/src/` or `packages/cli/src/` source code
- Any changes to `.agents/sources/shared/` or `.agents/sources/guide/`

## Pre-Mortem Risks

See `pre-mortem.md` for full analysis. Key mitigations incorporated into tasks:

1. **Plan-mode extension paths**: Task 1 explicitly updates `.pi/extensions/plan-mode/commands.ts`
2. **GUIDE pipeline regression**: Task 3 includes `npm run build` + `npm test` verification
3. **Profile accuracy**: Tasks 4-5 require reading actual source + spot-checking 3 claims
4. **Content overlap**: Task 3 defines explicit AGENTS.md/APPEND_SYSTEM.md boundary
5. **Role over-stripping**: Task 6 specifies minimal, additive changes only
6. **DEVELOPER.md staleness**: Tasks 1, 3, and 8 each update DEVELOPER.md for their changes
7. **capabilities.json staleness**: Task 8 explicitly updates the capability entry
