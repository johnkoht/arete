# PRD: AGENTS.md Compilation System (Phase 2)

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-14  
**Branch**: `refactor/memory` (existing)  

---

## 1. Problem & Goals

### Problem

Current AGENTS.md (6KB, 145 lines) relies on router-based skill invocation:

1. Agent must **decide** to call `arete skill route`
2. Router must **match** correctly
3. Agent must **load** the skill file
4. Each step is a potential failure point

[Vercel's research](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) found that compressed 8KB docs index in AGENTS.md achieved **100% pass rate** vs skills at 79%. Passive context beats active retrieval because there's no decision point.

### Goals

1. **Create modular source files** in `.agents/sources/` — human-readable, easy to maintain
2. **Build compilation script** that generates compressed AGENTS.md from sources
3. **Two outputs**: BUILD (main repo) and GUIDE (npm package)
4. **Compressed format** following Vercel's pipe-delimited approach
5. **Heuristic testing** to validate agent comprehension before/after
6. **Update ALL documentation** — no stale references

### Out of Scope

- Removing the router CLI commands (keep as fallback/analytics)
- Changing skill file locations or formats
- Modifying rule files
- Memory system changes (fast-follow)

---

## 2. CRITICAL: Orchestrator Instructions

**This PRD creates new files and updates many docs. Risk of stale references is moderate but documentation coverage is critical.**

### Before Each Task

1. Provide subagent with **current state** (what files exist, what's been created)
2. Include explicit file paths to create/update
3. Reference the pre-mortem mitigations relevant to that task

### After Each Task

1. **Verify files created** at correct locations
2. **Run quality gates**: `npm run typecheck && npm test`
3. **Check for stale refs** (especially `config/agents/` which was superseded)
4. Only proceed after verification passes

### Between Tasks

1. Commit completed work with descriptive message
2. Update any cross-references if needed

### Documentation-Specific Instructions

For Task 13 (Update ALL documentation):
- Subagent MUST grep for ALL files mentioning AGENTS.md
- Subagent MUST check EVERY file in the documentation checklist
- Orchestrator MUST verify each file was actually checked/updated
- Do NOT trust "I updated the docs" — verify each file

---

## 3. Pre-Mortem: Risk Analysis

### Risk 1: Compression Breaks Agent Understanding

**Problem**: Pipe-delimited format is too terse; agent can't parse it or loses semantic meaning.

**Mitigation**:
- Start with moderate compression (not maximum)
- Include inline examples for complex patterns
- Test with heuristic prompts before finalizing format
- Keep skill triggers in natural language

**Verification**: Run heuristic tests after each format iteration.

---

### Risk 2: Stale Index After Skill/Rule Changes

**Problem**: Someone adds a skill but forgets to run build. AGENTS.md becomes out of sync.

**Mitigation**:
- Add build step to `npm run build` (always regenerates)
- Include "Generated at" timestamp in output
- CI check: compare AGENTS.md hash before/after build

**Verification**: `npm run build` always regenerates AGENTS.md; timestamp shows freshness.

---

### Risk 3: Build Script Complexity

**Problem**: `build-agents.ts` becomes complex, hard to maintain, or has bugs.

**Mitigation**:
- Keep script simple: read files → concatenate → compress → write
- Use string templates, not complex AST manipulation
- Add unit tests for the build script
- Include source file list in output for traceability

**Verification**: Test coverage for build-agents.ts; manual inspection of output.

---

### Risk 4: GUIDE vs BUILD Divergence

**Problem**: Someone updates BUILD content but forgets GUIDE (or vice versa).

**Mitigation**:
- `shared/` contains content that MUST appear in both
- Clear ownership: `builder/` = BUILD only, `guide/` = GUIDE only
- Review checklist: "Did this change affect both contexts?"

**Verification**: Shared content is identical in both outputs.

---

### Risk 5: Router Removal Breaks Existing Workflows

**Problem**: Removing router dependency might break existing patterns.

**Mitigation**:
- **Don't remove router initially** — just make it optional
- AGENTS.md provides awareness; router remains as fallback
- Deprecate router gradually after proving AGENTS.md works

**Verification**: Both paths work: direct from AGENTS.md index AND via router.

---

### Risk 6: Agent Ignores Compressed Content

**Problem**: Agent sees compressed format but doesn't know how to use it.

**Mitigation**:
- Include explicit "HOW TO USE THIS INDEX" section at top
- Add examples: "When user says X, find skill Y in index, read file at path Z"
- Test with naive prompts

**Verification**: Heuristic test shows agent correctly identifies skills from index.

---

### Risk 7: Context Window Bloat

**Problem**: Compressed AGENTS.md is still too large, crowds out user context.

**Mitigation**:
- Target: 8-10KB compressed (Vercel achieved 8KB)
- Monitor: track size after each change
- Prune: only include essential information

**Verification**: `wc -c AGENTS.md` stays under 10KB.

---

### Risk 8: Documentation Not Updated

**Problem**: Plan completes but docs are stale, causing future confusion.

**Mitigation**:
- Explicit documentation checklist in PRD
- Grep verification for key terms
- Orchestrator verifies EACH file in checklist

**Verification**: All files in checklist marked as checked/updated.

---

### Risk 9: config/agents/ Placeholder Left Behind

**Problem**: Phase 1 created `config/agents/` placeholder, now superseded by `.agents/sources/`.

**Mitigation**:
- Explicit task to remove placeholder
- Grep for `config/agents` references
- Verify directory deleted

**Verification**: `ls config/agents/` fails; `rg "config/agents"` returns 0.

---

## 4. Target Architecture

```
.agents/
├── skills/                    # Build skills (already exists)
│   ├── execute-prd/
│   ├── review-plan/
│   └── ...
└── sources/                   # NEW: AGENTS.md source files
    ├── README.md              # Explains the build system
    ├── shared/                # Both BUILD and GUIDE
    │   ├── vision.md          # Areté philosophy (brief)
    │   ├── workspace-structure.md # Directory layout
    │   └── cli-commands.md    # Essential CLI reference
    ├── builder/               # BUILD-specific (this repo)
    │   ├── skills-index.md    # Build skills (execute-prd, review-plan, etc.)
    │   ├── rules-index.md     # Build rules summary
    │   ├── conventions.md     # TypeScript, testing, commits
    │   └── memory.md          # memory/MEMORY.md usage
    └── guide/                 # GUIDE-specific (shipped to users)
        ├── skills-index.md    # Product skills (meeting-prep, create-prd, etc.)
        ├── tools-index.md     # Tools (onboarding, seed-context)
        ├── intelligence.md    # Context, memory, briefings
        └── workflows.md       # Common PM workflows

scripts/
└── build-agents.ts            # Compiles source → AGENTS.md
```

---

## 5. Compressed Output Format

Following Vercel's pipe-delimited approach (40KB → 8KB = 80% reduction):

```markdown
# Areté - Product Builder's Operating System
<!-- Generated by build-agents.ts at 2026-02-14T12:00:00Z -->
<!-- DO NOT EDIT MANUALLY - Edit source files in .agents/sources/ -->

## HOW TO USE THIS INDEX

When a user asks for help with a PM task:
1. Scan the [Skills] section below for matching triggers
2. Read the skill file at the path shown
3. Follow the skill's workflow

Example: User says "help me prep for my meeting" → find meeting-prep in [Skills] → read .agents/skills/meeting-prep/SKILL.md

---

[Vision]|Excellence (ἀρετή) for product builders|context+memory+workflows

[Skills]|root:.agents/skills
|meeting-prep:{triggers:"prep for meeting,meeting with",does:"attendee context → recent meetings → open items → brief"}
|create-prd:{triggers:"write prd,create prd,requirements",does:"problem → solution → requirements → acceptance criteria"}
...

[Memory]|entry:memory/MEMORY.md
|before_work:scan memory/MEMORY.md + memory/collaboration.md
|after_work:add entry to memory/entries/, update index
|recent:{2026-02-13_dev-cleanup,2026-02-12_rules-refactor}

[Rules]|auto-applied:.cursor/rules/
|dev.mdc:TypeScript conventions, quality practices, pre-mortem
|testing.mdc:Test requirements, patterns, commands
...
```

---

## 6. Testing Strategy: Heuristic Prompts

Run these prompts BEFORE (baseline) and AFTER implementation:

### Test 1: PRD Creation

**Prompt**: "How would you help me create a PRD? What skills and tools would you use?"

**Expected (after)**: Agent identifies `create-prd` skill from index, describes the workflow, mentions project structure.

**Failure indicators**: Agent improvises, doesn't mention skill, suggests generic approaches.

---

### Test 2: Meeting Prep

**Prompt**: "I have a meeting with Sarah tomorrow. What would you do to help me prepare?"

**Expected (after)**: Agent identifies `meeting-prep` skill from index, describes workflow, doesn't call router first.

**Failure indicators**: Agent starts searching without mentioning skill, calls router first.

---

### Test 3: Unknown Request

**Prompt**: "Can you help me with something that's not a PM workflow — like refactoring this function?"

**Expected (after)**: Agent recognizes this isn't a PM action, proceeds normally.

**Failure indicators**: Agent tries to force a skill or gets confused.

---

### Test 4: Build Skill (in main repo)

**Prompt**: "I want to execute a PRD autonomously. What should I do?"

**Expected (BUILD context)**: Agent identifies `execute-prd` skill from builder index, describes workflow.

**Failure indicators**: Agent doesn't know about execute-prd.

---

## 7. Implementation Tasks

### Phase A: Setup and Source Files

#### Task 1: Create .agents/sources/ directory structure

**Description**: Create the source file directory structure with README.

**Actions**:
- `mkdir -p .agents/sources/shared`
- `mkdir -p .agents/sources/builder`
- `mkdir -p .agents/sources/guide`
- Create `.agents/sources/README.md` explaining the build system

**README.md must include**:
- What this directory is for
- How to add/modify content
- How to rebuild AGENTS.md
- File format expectations

**Acceptance Criteria**:
- `.agents/sources/shared/` exists
- `.agents/sources/builder/` exists
- `.agents/sources/guide/` exists
- `.agents/sources/README.md` exists and is comprehensive

**Commit**: "feat: create .agents/sources/ directory structure"

---

#### Task 2: Create shared source files

**Description**: Extract shared content that appears in both BUILD and GUIDE outputs.

**Files to create**:
- `.agents/sources/shared/vision.md` — Areté philosophy (brief, from current AGENTS.md)
- `.agents/sources/shared/workspace-structure.md` — Directory layout reference
- `.agents/sources/shared/cli-commands.md` — Essential CLI commands

**Source**: Extract from current AGENTS.md, runtime/GUIDE.md, .cursor/rules/arete-vision.mdc

**Acceptance Criteria**:
- All three files exist
- Content is accurate and concise
- Files follow consistent format

**Commit**: "feat: add shared AGENTS.md source files"

---

#### Task 3: Create builder source files

**Description**: Create BUILD-specific content for the main repo.

**Files to create**:
- `.agents/sources/builder/skills-index.md` — Build skills table (execute-prd, review-plan, etc.)
- `.agents/sources/builder/rules-index.md` — Build rules summary
- `.agents/sources/builder/conventions.md` — TypeScript, testing, commit patterns
- `.agents/sources/builder/memory.md` — memory/MEMORY.md usage instructions

**Source**: Extract from .cursor/rules/dev.mdc, current AGENTS.md

**Acceptance Criteria**:
- All four files exist
- Skills index lists ALL build skills in `.agents/skills/`
- Rules index lists ALL rules in `.cursor/rules/`
- Content is accurate

**Commit**: "feat: add builder AGENTS.md source files"

---

#### Task 4: Create guide source files

**Description**: Create GUIDE-specific content for end users.

**Files to create**:
- `.agents/sources/guide/skills-index.md` — Product skills table (19 skills from runtime/skills/)
- `.agents/sources/guide/tools-index.md` — Tools (onboarding, seed-context)
- `.agents/sources/guide/intelligence.md` — Context, memory, briefings
- `.agents/sources/guide/workflows.md` — Common PM workflows

**Source**: Extract from runtime/GUIDE.md, runtime/skills/, runtime/tools/

**Acceptance Criteria**:
- All four files exist
- Skills index lists ALL product skills in runtime/skills/
- Tools index lists ALL tools in runtime/tools/
- Content matches GUIDE.md accuracy

**Commit**: "feat: add guide AGENTS.md source files"

---

### Phase B: Build Script

#### Task 5: Create scripts/build-agents.ts

**Description**: Create the compilation script that generates AGENTS.md.

**Script requirements**:
- Accept target argument: `dev` (BUILD) or `prod` (GUIDE)
- Read source files based on target (shared + builder OR shared + guide)
- Concatenate in order
- Write to target location (AGENTS.md for dev, dist/AGENTS.md for prod)
- Add timestamp header
- Add "DO NOT EDIT MANUALLY" warning

**File**: `scripts/build-agents.ts`

**Acceptance Criteria**:
- Script exists and compiles (`npm run typecheck`)
- Running `npx ts-node scripts/build-agents.ts dev` generates AGENTS.md
- Output includes timestamp and warning header
- Source file list included in output

**Commit**: "feat: add build-agents.ts compilation script"

---

#### Task 6: Add compression logic

**Description**: Add pipe-delimited compression to the build script.

**Compression rules**:
- Convert skill tables to pipe-delimited format
- Preserve natural language triggers (not abbreviated)
- Add "HOW TO USE THIS INDEX" header with examples
- Target: compress to <10KB

**Acceptance Criteria**:
- Output uses pipe-delimited format for indices
- HOW TO USE section appears at top
- `wc -c AGENTS.md` shows size reduction vs current

**Commit**: "feat: add compression logic to build-agents.ts"

---

#### Task 7: Integrate with npm scripts

**Description**: Add npm scripts for building AGENTS.md.

**Changes to package.json**:
- Add `"build:agents:dev": "ts-node scripts/build-agents.ts dev"`
- Update `"build"` to include GUIDE AGENTS.md generation

**Acceptance Criteria**:
- `npm run build:agents:dev` generates BUILD AGENTS.md
- `npm run build` generates both BUILD and GUIDE AGENTS.md
- Scripts work correctly

**Commit**: "feat: add npm scripts for AGENTS.md compilation"

---

### Phase C: Testing and Validation

#### Task 8: Run baseline heuristic tests

**Description**: Capture current agent behavior before changes.

**Actions**:
- Create `dev/prds/agents-md-compilation/baseline-tests.md`
- Run all 4 heuristic prompts (see Testing Strategy section)
- Document exact agent responses
- Note which skills were identified, whether router was called

**Acceptance Criteria**:
- Baseline file exists with all 4 test results
- Results capture actual agent behavior

**Commit**: "test: capture baseline heuristic test results"

---

#### Task 9: Generate new BUILD AGENTS.md

**Description**: Generate the new compressed AGENTS.md for this repo.

**Actions**:
- Run `npm run build:agents:dev`
- Verify output format matches spec
- Check size (`wc -c AGENTS.md`)
- Manual inspection of output

**Acceptance Criteria**:
- New AGENTS.md exists
- Size is under 10KB
- Contains HOW TO USE section
- Contains all build skills and rules
- Has timestamp and DO NOT EDIT warning

**Commit**: "feat: generate new compressed AGENTS.md"

---

#### Task 10: Run post-implementation heuristic tests

**Description**: Run same tests and compare to baseline.

**Actions**:
- Create `dev/prds/agents-md-compilation/post-tests.md`
- Run all 4 heuristic prompts
- Document responses
- Compare to baseline
- Note improvements/regressions

**Acceptance Criteria**:
- Post-test file exists with all 4 test results
- Comparison to baseline documented
- Agent correctly identifies skills from compressed index

**Commit**: "test: capture post-implementation heuristic test results"

---

#### Task 11: Iterate on format if needed

**Description**: Adjust compression based on test results.

**If tests show problems**:
- Identify which tests failed
- Adjust compression level (add more context if too terse)
- Add examples if agent struggles
- Re-run failing tests

**Acceptance Criteria**:
- All 4 heuristic tests pass (agent identifies correct skills)
- Format adjustments documented if made

**Commit**: "fix: adjust AGENTS.md format based on test results" (if needed)

---

### Phase D: GUIDE Output and Documentation

#### Task 12: Generate GUIDE AGENTS.md

**Description**: Generate the GUIDE version for npm package.

**Actions**:
- Run `npm run build`
- Verify dist/AGENTS.md exists
- Verify it contains GUIDE content (not BUILD)
- Check size

**Acceptance Criteria**:
- dist/AGENTS.md exists
- Contains guide skills (meeting-prep, create-prd, etc.)
- Does NOT contain build skills (execute-prd, review-plan)
- Size under 10KB

**Commit**: "feat: generate GUIDE AGENTS.md for npm package"

---

#### Task 13: Update ALL documentation

**Description**: Comprehensive documentation update. This is critical.

**MUST update these files**:

| File | What to update |
|------|----------------|
| `AGENTS.md` | Already generated — verify header says "DO NOT EDIT" |
| `DEVELOPER.md` | Add "AGENTS.md Compilation" section explaining the build system |
| `.cursor/rules/dev.mdc` | Add subsection about when to rebuild AGENTS.md |
| `scratchpad.md` | Remove/mark complete the Phase 2 deferred item |
| `memory/MEMORY.md` | Add index entry for this change |

**MUST check these files** (update if they mention AGENTS.md editing):

| File | Check for |
|------|-----------|
| `README.md` | Stale AGENTS.md editing instructions |
| `SETUP.md` | Stale references |
| `ONBOARDING.md` | Stale references |
| `runtime/GUIDE.md` | Stale user-facing docs |

**MUST run these verifications**:
- `rg "AGENTS.md" --type md` — review all mentions
- `rg "config/agents" --type md` — should return 0 (old placeholder)
- `rg "edit AGENTS" -i --type md` — find stale editing instructions

**Acceptance Criteria**:
- ALL files in "MUST update" table are updated
- ALL files in "MUST check" table are verified
- ALL grep verifications pass
- No stale references to editing AGENTS.md directly

**Commit**: "docs: update all documentation for AGENTS.md compilation system"

---

#### Task 14: Create memory entry

**Description**: Document this change in build memory.

**Create**: `memory/entries/2026-02-14_agents-md-compilation-system.md`

**Content must include**:
- What changed (compilation system)
- Why (Vercel research findings)
- How to use (commands, workflow)
- Learnings from implementation
- Execution path used

**Update**: `memory/MEMORY.md` — add index entry at top

**Acceptance Criteria**:
- Entry file exists with complete content
- MEMORY.md index updated

**Commit**: "docs: add memory entry for AGENTS.md compilation system"

---

#### Task 15: Remove config/agents/ placeholder

**Description**: Clean up the Phase 1 placeholder that's now superseded.

**Actions**:
- `rm -rf config/agents/`
- Grep for any remaining references
- Update any files that reference it

**Acceptance Criteria**:
- `ls config/agents/` fails (directory removed)
- `rg "config/agents" --type md` returns 0 results

**Commit**: "chore: remove config/agents/ placeholder (superseded by .agents/sources/)"

---

### Phase E: Final Verification

#### Task 16: Final verification

**Description**: Comprehensive verification that everything is complete.

**Verification steps**:

1. **Files exist**:
   - `ls .agents/sources/README.md`
   - `ls .agents/sources/shared/vision.md`
   - `ls .agents/sources/builder/skills-index.md`
   - `ls .agents/sources/guide/skills-index.md`
   - `ls scripts/build-agents.ts`

2. **Stale references check**:
   - `rg "config/agents"` — should return 0
   - `rg "edit AGENTS.md" -i` — should return 0 or only point to sources

3. **Build works**:
   - `npm run build:agents:dev` — succeeds
   - `npm run build` — succeeds

4. **Size check**:
   - `wc -c AGENTS.md` — under 10KB

5. **Quality gates**:
   - `npm run typecheck` — passes
   - `npm test` — passes

6. **Documentation checklist verified**:
   - All files in Task 13 checklist confirmed updated/checked

**Acceptance Criteria**:
- All verification steps pass
- No stale references
- Build system fully functional

**Commit**: "chore: complete AGENTS.md compilation system (Phase 2)"

---

## 8. Task Dependencies

```
Phase A: Source Files
1 (structure) → 2, 3, 4 (content, can be parallel)

Phase B: Build Script
5 (script) → 6 (compression) → 7 (npm integration)

Phase C: Testing
8 (baseline) → 9 (generate) → 10 (post-test) → 11 (iterate if needed)

Phase D: Documentation
12 (GUIDE output) → 13 (docs) → 14 (memory) → 15 (cleanup)

Phase E: Final
16 (verification)
```

**Suggested execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

---

## 9. Documentation Checklist

After implementation, verify ALL these files:

| File | Action | Status |
|------|--------|--------|
| `AGENTS.md` | Verify "Generated file" header | [ ] |
| `.agents/sources/README.md` | Create with build system docs | [ ] |
| `DEVELOPER.md` | Add AGENTS.md compilation section | [ ] |
| `.cursor/rules/dev.mdc` | Add rebuild instructions | [ ] |
| `scratchpad.md` | Mark Phase 2 complete | [ ] |
| `memory/MEMORY.md` | Add index entry | [ ] |
| `memory/entries/` | Create learnings entry | [ ] |
| `README.md` | Check for stale refs | [ ] |
| `SETUP.md` | Check for stale refs | [ ] |
| `runtime/GUIDE.md` | Check for stale refs | [ ] |
| `package.json` | Add build scripts | [ ] |
| `config/agents/` | Remove placeholder | [ ] |

---

## 10. Success Criteria

1. **Size**: AGENTS.md under 10KB compressed
2. **Heuristic tests**: Agent correctly identifies skills without router call
3. **Build integration**: `npm run build` regenerates both AGENTS.md files
4. **No regressions**: All existing tests pass
5. **Documentation**: Build system documented; ALL docs updated per checklist
6. **No stale references**: `rg "config/agents"` returns 0; no "edit AGENTS.md" instructions

---

## 11. References

- [Vercel blog: AGENTS.md outperforms skills](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- Previous discussion: transcript 82504ba9 (Feb 13 22:42)
- scratchpad.md: deferred Phase 2 note
- Plan file: `.cursor/plans/agents.md_compilation_system_4dfd1c69.plan.md`
