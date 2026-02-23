# Pi Dev Workflow Migration — Learnings

**Date**: 2026-02-16  
**PRD**: `dev/prds/pi-dev-workflow/prd.md`  
**Branch**: `refactor/pi-monorepo`  
**Status**: Complete (7/7 tasks)

---

## Metrics

- **Tasks completed**: 7/7 (100%)
- **Success rate**: 100% first-attempt (no iterations needed)
- **Tests**: 209 passing, 2 skipped (unchanged)
- **Iterations**: 0 (all tasks accepted on first review)
- **Tests added**: 0 (infrastructure-only changes)
- **Token usage**: ~80K total (~15K orchestrator + ~65K subagents)
- **Commits**: 8 commits

---

## Pre-Mortem Analysis

### Risks vs Outcomes

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| AGENTS.md format compatibility | Not tested | Yes (monitoring plan) | N/A |
| Extension TypeScript errors | No | Yes (incremental) | Yes |
| Symlink platform issues | No | Yes (relative paths) | Yes |
| APPEND_SYSTEM.md token bloat | No | Yes (concise) | Yes (~1200 tokens) |
| Safe command gaps | No | Yes (allowlist) | Yes |
| Missing Pi installation | Yes | Yes (install check) | Yes |
| Documentation impact | Minor | Yes (checklist) | Mostly |
| Agent definition format | No | Yes (Pi format) | Yes |

**Which mitigations were effective:**
- Pre-work checks (Pi installation, validation script) caught issues early
- Incremental adaptation (copy first, then modify) prevented extension errors
- Relative symlinks worked across the repo
- Concise content kept APPEND_SYSTEM.md under target

**Surprises not in pre-mortem:**
- **Positive**: Pi's jiti loader made extension integration seamless (no build step)
- **Negative**: Build script compression function hardcoded workspace structure, needed manual update

---

## What Worked Well

1. **Pre-mortem pattern**: Identified 8 risks upfront, created mitigations, none became blocking issues
2. **Validation script**: Created reusable validation script for future Pi work (`dev/prds/pi-dev-workflow/scripts/validate-startup.sh`)
3. **Symlinks for skills**: Preserved single source of truth; Pi ignores unknown frontmatter so no modification needed
4. **Fast model for subagents**: Used `model: fast` for all 7 tasks, kept costs low while maintaining quality
5. **Systematic doc updates**: AGENTS.md sources, dev.mdc, backlog decision item all updated systematically

---

## What Didn't Work

1. **Build script compression assumptions**: `compressWorkspaceStructure()` function in `scripts/build-agents.ts` had hardcoded values; updating `.agents/sources/` wasn't enough, needed to update compression function too
2. **No automated check for generated file sync**: Should have verified AGENTS.md content matched sources after rebuild

---

## Subagent Insights

All 7 subagents used `model: fast`. Reflections synthesized:

### Common Patterns That Helped
- **AGENTS.md and dev.mdc**: Provided structure, conventions, and quality gates
- **Pre-mortem mitigations**: Subagents referenced specific mitigations (e.g., "use relative paths", "test symlink resolution")
- **Existing examples**: Pi extension example, Cursor rules as references
- **Clear acceptance criteria**: Specific, testable AC prevented ambiguity

### Suggestions
- None — all subagents completed successfully on first attempt
- Fast model was sufficient for infrastructure tasks

---

## Collaboration Patterns

### Builder Response
- Approved pre-mortem without changes
- Requested cheaper models for subagents (applied `model: fast`)
- No interruptions during execution (autonomous flow worked)

### What Builder Preferred
- Clear pre-mortem risk table format
- Systematic validation (script-based)
- Additive approach (no removal of Cursor workflow)

---

## Recommendations for Next PRD

### Continue
1. Pre-mortem → task execution → validation pattern
2. Using fast model for infrastructure/setup tasks
3. Creating reusable validation scripts
4. Symlinks for maintaining single source of truth

### Stop
1. Assuming generated files will automatically include new content from sources
2. Skipping checks of code that processes source files

### Start
1. When updating source files for generated output (like AGENTS.md), also grep for functions that process those sources and check for hardcoded values
2. Add automated sync check after rebuilding generated files (verify content matches sources)
3. Consider adding tests for compression functions in build scripts

---

## Refactor Backlog Items

None created during this PRD.

---

## Documentation Gaps

None — all docs updated systematically:
- AGENTS.md sources updated and rebuilt
- dev.mdc References section updated
- Backlog decision item created
- Build script updated for future builds

---

## Technical Artifacts

### Files Created (Infrastructure)
- `.pi/settings.json` — Pi project configuration
- `.pi/APPEND_SYSTEM.md` — Dev rules for Pi (consolidated from Cursor rules)
- `.pi/extensions/plan-mode/index.ts` — Plan mode extension (adapted from Pi example)
- `.pi/extensions/plan-mode/utils.ts` — Extension utilities with safe commands
- `.pi/skills/*` — 7 symlinks to `.agents/skills/`
- `.pi/agents/orchestrator.md` — Sr. Eng Manager agent definition
- `.pi/agents/reviewer.md` — Sr. Engineer agent definition
- `.pi/agents/task-agent.md` — Task execution agent definition
- `dev/prds/pi-dev-workflow/scripts/validate-startup.sh` — Validation script
- `dev/backlog/decisions/cursor-vs-pi-dev-agent.md` — Decision item for future evaluation

### Files Modified
- `.agents/sources/builder/rules-index.md` — Added Pi mention
- `.agents/sources/shared/workspace-structure.md` — Added `.pi/` to build structure
- `.cursor/rules/dev.mdc` — Added Pi workflow reference
- `AGENTS.md` — Rebuilt with Pi support
- `scripts/build-agents.ts` — Updated compression function to include `.pi/`
- `dev/backlog/README.md` — Documented decisions/ subfolder

---

## Next Steps

**For Builder:**
1. Use Pi in daily development for 2-4 weeks
2. Evaluate context quality, skill execution, plan mode effectiveness
3. Revisit `dev/backlog/decisions/cursor-vs-pi-dev-agent.md` after evaluation period

**Future Work (Out of Scope):**
- Subagent extension for Pi (separate PRD)
- Pi as product runtime for end users (separate PRD)

---

## Success Criteria: Achieved

✅ Running `pi` from Arete repo root gives fully functional dev environment  
✅ Quality gates, testing requirements, code review checklist enforced via APPEND_SYSTEM.md  
✅ Plan mode works with `/plan` command, pre-mortem references, PRD gateway  
✅ All 7 build skills discoverable and invocable via `/skill:name`  
✅ Agent definitions ready for future subagent extension  
✅ Cursor workflow completely unaffected (additive approach successful)
