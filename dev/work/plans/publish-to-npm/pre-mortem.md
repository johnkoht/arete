# Pre-Mortem: Publish arete-workspace to npmjs

## Risk 1: `getSourcePaths()` breaks for npm users after removing `dist/`

**Category**: Integration

**Problem**: `getSourcePaths()` uses `useRuntime = !packageRoot.includes('node_modules')`. When installed via npm, the path *does* include `node_modules`, so `useRuntime = false` → it looks in `dist/` for skills/tools/rules. If we remove `dist/` from `files`, `arete install` will silently fail to copy any runtime content (skills, rules, tools, templates) into the user's workspace. This is the #1 "published but broken" risk.

**Mitigation**: Change `getSourcePaths()` logic to check if `packages/runtime/` exists and prefer it unconditionally. The `useRuntime` flag and `node_modules` heuristic should be replaced with a simple existence check: `existsSync(join(packageRoot, 'packages', 'runtime'))`. This works in both dev (monorepo) and npm install (packages/runtime/ is shipped in files). Test by mocking the path and asserting the correct base is returned.

**Verification**: After the change, run `npm pack`, extract the tarball to a temp dir, and verify `getSourcePaths()` returns `packages/runtime/` paths from that location. Add a unit test that simulates the npm-installed path structure.

---

## Risk 2: `@arete/core` bare imports in `packages/cli/dist/` fail at runtime

**Category**: Dependencies

**Problem**: `packages/cli/dist/` uses `import { createServices } from '@arete/core'` (bare specifier). In dev, npm workspaces symlink `@arete/core` into `node_modules`. When published as a single package, there's no `@arete/core` in `node_modules` — the package doesn't depend on a published `@arete/core`. Every CLI command that imports from `@arete/core` will crash with `ERR_MODULE_NOT_FOUND`.

**Mitigation**: The root `package.json` already has `"@arete/core": "workspace:*"` which npm will resolve during install. Changing this to `"file:packages/core"` (or keeping workspaces active) should make npm create the symlink. However, the cleaner fix is: verify that `npm pack` + `npm install` from the tarball correctly resolves `@arete/core` via the workspace declaration. If not, consider adding a `postinstall` script or restructuring imports. **Test this explicitly** by installing from the packed tarball in an isolated directory before publishing.

**Verification**: `npm pack && cd /tmp && mkdir test-install && cd test-install && npm init -y && npm install /path/to/arete-workspace-0.1.0.tgz && npx arete --version`. If this fails, the bare import resolution needs fixing before publish.

---

## Risk 3: Version mismatch — CLI reads `packages/cli/package.json` not root

**Category**: Integration

**Problem**: The CLI entry point reads version from `join(__dirname, '..', 'package.json')` which resolves to `packages/cli/package.json`. When published, users running `arete --version` will see `packages/cli/package.json` version (0.1.0) not the root published version. If these ever drift, it's confusing. More critically, `npm version prerelease` only bumps the ROOT `package.json` — so `arete --version` would show stale version numbers after every release.

**Mitigation**: Either (a) change the CLI to read from root `package.json` (two levels up from `packages/cli/dist/`), or (b) add a build step that syncs versions across all three package.json files before publish. Option (a) is simpler and more reliable.

**Verification**: After fix, run `arete --version` and confirm it matches root `package.json` version. Add to the dry-run checklist.

---

## Risk 4: `workspace:*` protocol in published `package.json`

**Category**: Platform Issues

**Problem**: npm does NOT support the `workspace:*` protocol in published packages. If the root `package.json` ships with `"@arete/core": "workspace:*"`, `npm install` will fail with a resolution error. The plan says change to `"*"` but `"*"` means "any version from the registry" — and `@arete/core` isn't published to the registry.

**Mitigation**: Remove `@arete/core` from root `dependencies` entirely. It's not a separate registry package — it's baked into the tarball via `packages/core/dist/`. The workspace protocol is a dev-time concern only. If bare `@arete/core` imports need to resolve at runtime (Risk 2), use npm workspaces (`"workspaces": ["packages/*"]`) in the published package — npm will wire up local resolution.

**Verification**: After removing `@arete/core` from deps, run `npm pack --dry-run` and confirm `package.json` in the tarball has no `workspace:` references. Then test install from tarball.

---

## Risk 5: `prepare` script runs during `npm install -g` and fails

**Category**: Platform Issues

**Problem**: The root `package.json` has `"prepare": "npm run build"` which runs on `npm install`. The build script runs `build:agents:dev` (requires `.agents/sources/` which is NOT in `files`) and `build:agents:prod` (requires `.agents/sources/`). Both will fail during a global install because source files aren't shipped. `tsc` compilation may also fail without dev source files.

**Mitigation**: Remove or condition the `prepare` script. For published packages, all compiled output should already be in the tarball — `prepare` should only run in the git repo (for contributors). Use `prepublishOnly` for the build gate (already in plan). Remove `prepare` from the published `package.json`, or guard it with an environment check.

**Verification**: Install from tarball in a clean directory. Confirm no build step runs and the package works immediately.

---

## Risk 6: Renaming root package breaks local development

**Category**: Scope Creep

**Problem**: Renaming `@arete/cli` → `arete-workspace` in root `package.json` could break npm workspace resolution, IDE integrations, or scripts that reference the old name. The `node_modules/.package-lock.json` and `package-lock.json` have the old name baked in.

**Mitigation**: After renaming, run `rm -rf node_modules package-lock.json && npm install` to regenerate. Then run full test suite (`npm run typecheck && npm test`) to confirm nothing references the old name. Grep the entire repo for `@arete/cli` (excluding `packages/cli/` which has its own name) to find stale references.

**Verification**: `grep -r "@arete/cli" . --include="*.ts" --include="*.json" --include="*.md" | grep -v node_modules | grep -v packages/cli` returns nothing (or only the sub-package itself).

---

## Risk 7: Package size bloat — shipping unnecessary files

**Category**: Code Quality

**Problem**: The `files` array includes `packages/runtime/` which ships ALL of `packages/runtime/` including any LEARNINGS.md, README.md, and potentially test fixtures. Current dry-run shows 672 files / 2.3MB. Some of this may be unnecessary (e.g. `packages/runtime/rules/LEARNINGS.md`, `packages/core/dist/` source maps).

**Mitigation**: After fixing `files`, run `npm pack --dry-run` and review the full list. Exclude: LEARNINGS.md files, source maps (`.js.map`, `.d.ts.map`), any README.md that's not user-facing. Consider adding `.npmignore` as a safety net for files that shouldn't ship from within included directories.

**Verification**: Final tarball < 1MB unpacked. No LEARNINGS.md, no `.map` files, no test fixtures in the pack output.

---

## Risk 8: First publish is permanent — can't unpublish after 72 hours

**Category**: State Tracking

**Problem**: npm's unpublish policy allows removal within 72 hours only. After that, the version is permanent. If we publish 0.1.0 with a broken install path, that version number is burned forever. We'd have to publish 0.1.1 as the "real" first version.

**Mitigation**: Use `--dry-run` extensively. Test install from the actual tarball (`npm pack && npm install -g ./arete-workspace-0.1.0.tgz`). Consider publishing `0.1.0-beta.1` first with `--tag beta` so `latest` isn't affected. Only promote to `latest` after confirming the beta works.

**Verification**: Full end-to-end test from tarball install before any `npm publish`. Beta tag strategy confirmed with builder.

---

## Summary

**Total risks identified**: 8  
**Categories covered**: Integration (2), Dependencies (1), Platform Issues (2), Scope Creep (1), Code Quality (1), State Tracking (1)

**Highest severity**: Risk 1 (getSourcePaths), Risk 2 (@arete/core resolution), Risk 5 (prepare script) — any of these makes the published package non-functional.

**Key recommendation**: Before publishing, do a full end-to-end test: `npm pack → install from tarball in /tmp → arete --version → arete install /tmp/test-workspace → verify workspace has skills/rules/tools`. This catches Risks 1, 2, 3, 4, and 5 in one pass.

**Ready to proceed with these mitigations?**
