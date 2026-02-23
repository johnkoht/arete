# Tools Copy Regression Fix

**Date**: 2026-02-21  
**Type**: Regression fix  
**Execution Path**: Direct (targeted bug fix with tests)

## What Changed

Fixed a regression where `arete install` and `arete update` never copied tools (e.g. `.cursor/tools/onboarding/`) into user workspaces. Users saw an empty `.cursor/tools/` directory regardless of IDE flag, and agents looking for `TOOL.md` files reported "tool definition file hasn't been created yet."

### Root Cause

The bug was introduced in commit `e3bc217` ("feat(cli): rebuild CLI as thin service wrapper over @arete/core", 2026-02-15). Before that refactor, `src/commands/install.ts` had an explicit tool copy block:

```typescript
// Copy/symlink tools to IDE-specific tools directory
if (existsSync(sourcePaths.tools)) {
  copyDirectoryContents(sourcePaths.tools, workspacePaths.tools, { symlink: useSymlinks });
}
```

When `WorkspaceService` was created to replace this direct-copy logic, skills and rules were ported in but tools were silently omitted. The `sourcePaths.tools` field was wired through in `install.ts` → `WorkspaceService.create()` but the service never used it.

The 30/60/90 onboarding tool was fully built (`packages/runtime/tools/onboarding/TOOL.md` + templates) — it simply never reached user workspaces.

### Files Changed

- `packages/core/src/models/workspace.ts` — added `tools: string[]` to `InstallResult` type
- `packages/core/src/services/workspace.ts` — added tool copy block in `create()`, tool backfill block in `update()`
- `packages/cli/src/commands/install.ts` — added "Tools installed: N" to install output
- `packages/core/test/services/workspace.test.ts` — 4 new regression tests (create cursor, create claude, update backfill, update no-overwrite)
- `packages/core/src/services/LEARNINGS.md` — regression documented

## Metrics

- Tests added: 4
- Tests passing: 410/412 (2 skipped, 0 failed)
- TypeScript: zero errors

## Learnings

**When porting "copy assets" logic into a service, explicitly enumerate all asset types and confirm each has a corresponding implementation.** In this case: skills ✅, tools ❌ (missed), rules ✅. A simple checklist at PR time would have caught this.

**The --ide flag was not the cause** — users correctly diagnosed an empty tools dir but incorrectly attributed it to the IDE flag. The real bug existed for both `cursor` and `claude` targets since `WorkspaceService.create()` never conditionally skipped tools.

**The feature was complete; only delivery was broken.** The onboarding tool content, templates, router integration, and rule guidance were all correctly built. The gap was purely in the install/update pipeline — a good reminder to smoke-test `arete tool list` after any install refactor.
