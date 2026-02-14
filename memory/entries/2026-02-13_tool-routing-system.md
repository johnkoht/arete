# Tool Routing System Implementation

**Date**: 2026-02-13  
**Type**: Feature Implementation  
**Status**: Complete  
**PRD**: N/A (Ad-hoc request)

## What Was Built

Extended the skill router to support lifecycle-based tools (onboarding, seed-context), making them discoverable through the same routing workflow that works for skills.

### Implementation Phases

**Phase 0: Prerequisites**
- Added `triggers` field to TOOL.md frontmatter for onboarding, seed-context, and _template
- Enables router to match tool-specific trigger phrases

**Phase 1: Tool Discovery Infrastructure**
- Created `src/commands/tool.ts` with tool management functions:
  - `getToolInfo()` - Parse TOOL.md frontmatter
  - `getToolsList()` - Discover tools in workspace
  - `getMergedToolsForRouting()` - Prepare tools for router with lifecycle→work_type mapping
- Added tool copying to `install.ts` and `update.ts` (parallel to skills)
- Registered CLI commands: `arete tool list`, `arete tool show <name>`
- **Key fix**: Used `statSync()` instead of `isDirectory()` to handle symlinked tool directories

**Phase 2: Router Extension**
- Extended `SkillCandidate` type: added `type`, `lifecycle`, `duration` fields
- Extended `ExtendedRoutedSkill` type: added `type`, `action`, `lifecycle`, `duration` fields
- Modified `routeToSkill()` to:
  - Accept both skills and tools in candidates array
  - Return `type: 'skill' | 'tool'`
  - Return `action: 'load' | 'activate'` to guide agent behavior
  - Include lifecycle metadata for tools

**Phase 3: CLI Integration**
- Updated `routeSkill()` in `skill.ts`: merges skills + tools, displays tool-specific info
- Updated `routeCommand()` in `route.ts`: unified skill/tool routing with model tier suggestion
- Both commands now support tools via dynamic import of `getMergedToolsForRouting()`

**Phase 4: Testing**
- Added 7 new tests to `test/core/skill-router.test.ts`:
  - Tool routing via trigger phrases
  - Skill+tool routing together without conflicts
  - Type and action field validation
  - Lifecycle metadata in responses
- All 465 tests passing

**Phase 5: Documentation**
- Updated `AGENTS.md`: tool management section, tool activation flow example, context summary table
- Updated `runtime/tools/README.md`: router discovery section
- Updated `README.md`: tools table with routing examples
- Updated `runtime/rules/pm-workspace.mdc`: tool activation pattern (6-step workflow)
- Updated `runtime/rules/routing-mandatory.mdc`: tool routing examples, type checking
- Updated doc comment in `skill-router.ts` to mention tools

## Key Technical Decisions

### 1. Lifecycle-to-WorkType Mapping

Tools don't have `work_type` in frontmatter, but the router scoring uses `work_type`. Solution:

```typescript
const LIFECYCLE_TO_WORK_TYPE: Record<string, WorkType> = {
  'time-bound': 'planning',
  'condition-bound': 'delivery',
  'cyclical': 'planning',
  'one-time': 'operations',
};
```

Applied in `getMergedToolsForRouting()` so tools participate in work_type-based scoring.

### 2. Symlink Handling Discovery

Initial implementation used `entry.isDirectory()` to filter directories in `getToolsList()`. This failed for symlinked tools (dev mode with `--source symlink`).

**Problem**: `readdir(..., { withFileTypes: true })` returns `isDirectory() = false` for symlinks, even if they point to directories.

**Solution**: Use `statSync(fullPath)` which follows symlinks and returns stats for the target. This works for both regular directories and symlinks.

```typescript
// Before (broken for symlinks)
if (!entry.isDirectory()) continue;

// After (works for both)
const stats = statSync(fullPath);
if (!stats.isDirectory()) continue;
```

**Lesson**: When working with directory listings that might include symlinks, use `statSync()` (follows symlinks) instead of `dirent.isDirectory()` (doesn't follow).

### 3. Backward Compatibility Strategy

To ensure no breaking changes:
- Added new fields to types (`type`, `action`, `lifecycle`, `duration`)
- Router returns these fields for all results (skills get `type: 'skill'`, `action: 'load'`)
- Existing skills continue to work exactly as before
- Tests verify both skill and tool routing

## Pre-Mortem Effectiveness

Created 8-category pre-mortem before implementation. **Result: 0/8 risks materialized.**

| Risk Category | Mitigation Applied | Outcome |
|---------------|-------------------|---------|
| Tool discovery | Added tool copying to install/update | ✅ Tools copied correctly |
| Metadata differences | Mapped lifecycle → work_type | ✅ Tools participate in routing |
| Test coverage | Added 7 new tests | ✅ All tests passing |
| Documentation | Updated all docs + rule files | ✅ Complete (after follow-up) |
| Backward compatibility | Added fields, preserved behavior | ✅ No regressions |
| Agent behavior | Added `action` field guidance | ✅ Clear load vs activate |
| Tool metadata parsing | Created `getToolInfo()` | ✅ Parses TOOL.md correctly |
| CLI naming | Unified routing, backward-compat commands | ✅ Both `arete skill route` and `arete route` work |

Pre-mortem was highly effective - identifying risks upfront led to proactive mitigations that prevented issues.

## Verification Results

```bash
# Tool discovery
$ arete tool list
✓ 2 tools available (onboarding, seed-context)

# Tool routing
$ arete route "I'm starting a new job"
Tool: onboarding
  Action: activate
  Lifecycle: time-bound

$ arete route "seed my context"
Tool: seed-context
  Action: activate
  Lifecycle: one-time

# Skill routing (unchanged)
$ arete route "prep for meeting"
Skill: meeting-prep
  Action: load

# JSON output includes all metadata
$ arete route "I'm starting a new job" --json
{
  "skill": {
    "skill": "onboarding",
    "type": "tool",
    "action": "activate",
    "lifecycle": "time-bound",
    "duration": "90-150 days",
    ...
  }
}
```

## Patterns Worth Remembering

### 1. Show-Don't-Tell in Tool Activation Docs

The tool activation pattern in `pm-workspace.mdc` uses numbered steps with specific examples, not abstract guidance:

```markdown
1. **Read the tool file**: `.cursor/tools/[tool-name]/TOOL.md`
2. **Ask about scope** (if applicable): Many tools offer comprehensive vs streamlined modes
3. **Create project structure**: `projects/active/[tool-name]/` with subdirectories...
```

This is clearer than "Follow the tool's activation workflow."

### 2. Type-Driven Behavior Guidance

The `action` field (`'load' | 'activate'`) guides agent behavior without requiring the agent to inspect the file first:

- `action: 'load'` → Read and execute (skill workflow)
- `action: 'activate'` → Read, ask scope, create project, guide phases (tool workflow)

Agents can branch on `action` before loading the file.

### 3. Merging Discovery with Routing

Rather than creating separate tool discovery, we merged tools into the existing `getMergedSkillsForRouting()` pattern:

```typescript
const skills = getMergedSkillsForRouting(paths);
const tools = getMergedToolsForRouting(paths);
const candidates = [...skills, ...tools];
const result = routeToSkill(query, candidates);
```

This reuses the existing scoring algorithm without modification.

## Learnings

### What Went Well

1. **Pre-mortem prevented issues**: All 8 risks were mitigated proactively
2. **Symlink fix was quick**: Caught early in testing, fixed before final commit
3. **Type safety**: TypeScript caught mismatches between type definitions
4. **Test-first approach**: Tests passed on first run after implementation
5. **Documentation as code**: Rule files provide actionable guidance

### What Could Be Better

1. **Initial doc gap**: Missed `pm-workspace.mdc` and `routing-mandatory.mdc` in first pass - these are critical for agent guidance
2. **Testing in dev workspace**: Should have tested in an installed workspace earlier to catch symlink issue sooner
3. **Build entry timing**: Should create build entries immediately after completion, not as follow-up

### Corrections Applied

- **Follow-up commit** added rule file updates and doc comment fix after code review
- Demonstrates importance of documentation checklist: even with plan, easy to miss rule files

## Metrics

- **Lines changed**: ~860 lines across 14 files
- **New files**: 1 (`src/commands/tool.ts`)
- **Tests added**: 7 (tool routing scenarios)
- **Test pass rate**: 465/465 (100%)
- **TypeScript**: Zero errors
- **Commits**: 3 (implementation, docs, symlink fix)
- **Time to implement**: ~2 hours (includes pre-mortem, testing, verification)

## Future Enhancements

Potential improvements for tool routing:

1. **Tool defaults**: Similar to skill defaults, allow users to prefer custom tools (e.g., `onboarding → acme-onboarding`)
2. **Tool discovery from skills.sh**: Support `arete tool install owner/repo` for community tools
3. **Tool sidecar metadata**: Like `.arete-meta.yaml` for skills, allow overriding tool metadata
4. **Active tool status**: `arete tool active` to show which tools are currently running in projects/active/
5. **Tool graduation assistant**: Skill to help users complete graduation criteria and archive tool projects

## References

- **Commits**: `feat(routing): add tool routing to skill router`, `docs(routing): complete documentation for tool routing`, `fix(tools): handle symlinked tool directories`
- **Tests**: `test/core/skill-router.test.ts` lines 253-348
- **Rule files**: `runtime/rules/pm-workspace.mdc`, `runtime/rules/routing-mandatory.mdc`
- **Plan**: `.cursor/plans/tool_routing_system_*.plan.md` (if preserved)
