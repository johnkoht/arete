# Debug: `arete update` not copying tool files on other machine

**Date**: 2026-02-21  
**Status**: In progress — fix is in the code but not working on the other machine

---

## What was broken

Tools (`tools/onboarding/templates/`, `resources/`) were never copied by `arete install`
due to a regression in `e3bc217` (2026-02-15). `WorkspaceService.create()` forgot to copy
tools when the CLI was refactored into a service wrapper.

## What was fixed (already committed)

- `packages/core/src/services/workspace.ts` — `create()` now copies tools; `update()` now
  does **file-level backfill** (walks every file in source tool dirs, copies any missing at dest)
- `packages/core/test/services/workspace.test.ts` — 4 regression tests added, all passing
- Commits: `482fe32`, `3ccb562`

## The remaining problem

On the other machine, `arete update --json` returned `added: []` — tools backfill silently
skipped. Skills were correctly updated (appeared in `updated: [...]`) so the CLI is running
fine, but tools are not being added.

## What we know so far

The compiled `packages/core/dist/services/workspace.js` on the DEV machine has the fix
(confirmed via grep). The issue on the other machine is unknown — most likely:

**`getPackageRoot()` is resolving to the wrong directory**, making `basePaths.tools` point
to a path that doesn't exist. When `storage.exists(toolsSrc)` returns `false`, the entire
tools backfill block silently skips with no error.

## Diagnostic to run on this machine

From the **arete repo root** on this machine:

```bash
node --input-type=module << 'EOF'
import { getPackageRoot, getSourcePaths } from '@arete/core';
import { existsSync } from 'fs';
const root = getPackageRoot();
const useRuntime = !root.includes('node_modules');
const paths = getSourcePaths(root, useRuntime);
console.log('packageRoot:', root);
console.log('useRuntime:', useRuntime);
console.log('tools path:', paths.tools);
console.log('tools exists:', existsSync(paths.tools));
EOF
```

**Expected output** (if working correctly):
```
packageRoot: /path/to/arete          ← should be the monorepo root
useRuntime: true                      ← should be true (not in node_modules)
tools path: /path/to/arete/packages/runtime/tools
tools exists: true
```

If `tools exists: false` or `packageRoot` is wrong (e.g. the workspace dir or cwd),
that's the bug.

## Also check: is the compiled fix actually present?

```bash
grep "file-level backfill" packages/core/dist/services/workspace.js
```

Should print the comment line. If empty — build didn't compile the fix. Run:

```bash
npm run build
```

Then try `arete update` again in the workspace.

## Quick manual fix (if you just need the files now)

From the arete repo on this machine, copy directly into the workspace:

```bash
cp -r packages/runtime/tools/onboarding/templates /path/to/workspace/.cursor/tools/onboarding/
cp -r packages/runtime/tools/onboarding/resources /path/to/workspace/.cursor/tools/onboarding/
```

## Next steps after running diagnostic

Share the output of the `node` diagnostic command above and we can pinpoint the root cause
and fix `getPackageRoot()` or `getSourcePaths()` so `arete update` works correctly on any
machine setup.
