# AGENTS.md Installation Fix

**Date**: 2026-02-23  
**Type**: Bug fix  
**Files**: `packages/core/src/adapters/cursor-adapter.ts`, `packages/core/src/adapters/claude-adapter.ts`, `packages/core/src/services/workspace.ts`, `packages/cli/src/commands/route.ts`

---

## What Changed

Fixed `arete install` and `arete update` to use the comprehensive pre-built `dist/AGENTS.md` instead of generating a minimal version at install time.

**Before**: Adapters generated a minimal AGENTS.md (~2KB) with just routing instructions and workspace structure. Missing: CLI commands, Skills index, Intelligence services, Workflows.

**After**: Adapters read the comprehensive `dist/AGENTS.md` (~6KB) built from `.agents/sources/guide/` and append a workspace-specific version footer. Contains full CLI reference (26 commands), Skills index, Tools index, Intelligence services, and Workflows.

**Additionally**: Enhanced `arete route` to show a helpful suggestion when no skill matches, pointing users to CLI commands in AGENTS.md or pm-workspace.mdc.

---

## Why This Matters

The comprehensive AGENTS.md provides agents with the context they need to:
1. Route queries to the right skill using the Skills index
2. Use CLI commands directly without loading skill files
3. Understand intelligence services (context, memory, briefing, routing)
4. Follow common PM workflows (week_start, meeting, discovery, project)

Without this, agents were missing 80% of the passive context that enables effective routing and task execution.

---

## Timeline

1. **Feb 14**: AGENTS.md compilation system built — generates `dist/AGENTS.md` with full CLI, Skills, Intelligence, Workflows
2. **Feb 14 (later)**: Adapter system implemented for multi-IDE support, but it generated its OWN minimal AGENTS.md from `routing-mandatory.mdc`
3. **Feb 23**: Bug discovered — `dist/AGENTS.md` was built but never copied to installed workspaces
4. **Feb 23**: Fixed — adapters now read `dist/AGENTS.md` and append version footer

---

## Implementation Details

### Adapter Changes

Both `CursorAdapter` and `ClaudeAdapter`:
1. Use `getPackageRoot()` to find the npm package root
2. Read `dist/AGENTS.md` from the package
3. Fall back to minimal version if `dist/AGENTS.md` not found
4. Append workspace-specific version footer with timestamp
5. Claude adapter transforms `.cursor/` paths to `.claude/` paths

### Workspace Service Changes

`WorkspaceService.update()` now regenerates AGENTS.md/CLAUDE.md on every update, ensuring users get the latest comprehensive version when they run `arete update`.

### Route Command Enhancement

When no skill matches a query, the route command now:
- JSON output: includes `suggestion` field with guidance
- Human output: shows `💡 No skill match. Check CLI commands in AGENTS.md...`

---

## Test Coverage

Added 27 new tests:
- `packages/core/test/adapters/cursor-adapter.test.ts` — 8 tests for CursorAdapter
- `packages/core/test/adapters/claude-adapter.test.ts` — 11 tests for ClaudeAdapter  
- `packages/cli/test/golden/route.test.ts` — 2 tests for no-match suggestion

Tests verify:
- AGENTS.md/CLAUDE.md generated with CLI section
- AGENTS.md/CLAUDE.md generated with Skills section
- AGENTS.md/CLAUDE.md generated with Intelligence section
- Version footer included
- Claude adapter path transformations
- Route command suggestion on no-match

---

## Metrics

- Tests: 762 total (27 new), 760 pass, 0 fail, 2 skipped
- Files changed: 5 (2 adapters, 1 service, 1 command, 1 test file)
- New files: 3 (2 test files, 1 LEARNINGS.md)

---

## Learnings

1. **Check asset delivery end-to-end**: The `dist/AGENTS.md` was built correctly but never delivered because the adapter system was implemented separately and didn't reference it. When adding new build artifacts, trace the full path from build → install → workspace.

2. **Adapters are infrastructure**: Unlike services (which use StorageAdapter), adapters can use `fs` directly because they run at install/update time and need to read from the npm package.

3. **Version footer is workspace-specific**: The pre-built `dist/AGENTS.md` is generic; the version and timestamp are workspace-specific and must be appended at install/update time.

4. **Update should refresh generated files**: Users expect `arete update` to bring them the latest. Regenerating AGENTS.md/CLAUDE.md ensures they get new commands, skills, and intelligence documentation.

---

## Related

- `memory/entries/2026-02-14_agents-md-compilation-system.md` — Original compilation system
- `memory/entries/2026-02-10_multi-ide-support-learnings.md` — Adapter system implementation
- `packages/core/src/adapters/LEARNINGS.md` — Component-local gotchas
