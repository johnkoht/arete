# PRD: Publish Areté to GitHub

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-25  
**Feature**: publish-arete

---

## 1. Problem & Goals

### Problem

Areté works for local development but cannot be installed from GitHub by external users. Several issues block `npm install -g github:johnkoht/arete`:

1. **workspace:* protocol** — Root package.json uses `"@arete/core": "workspace:*"`, which npm doesn't understand outside a monorepo context
2. **Dependency mismatch** — Root lists `inquirer` but CLI code imports `@inquirer/prompts`
3. **Path detection bug** — `getSourcePaths()` uses `node_modules` path detection that fails for GitHub installs
4. **Missing metadata** — No `repository` or `author` fields

### Goals

1. Fix root `package.json` so `npm install` works from a fresh GitHub clone
2. Simplify `getSourcePaths()` to always use `packages/runtime/` as the canonical source
3. Verify the full install flow works end-to-end (fresh clone → global install → workspace creation)

### Out of Scope

- npm registry publish (see: `publish-to-npm` plan)
- CHANGELOG.md
- `files` array optimization (GitHub gets whole repo anyway)
- README polish

---

## 2. Tasks

### Task 1: Fix root package.json for GitHub install

**Description**: Update root `package.json` to fix dependency resolution and add required metadata for GitHub-based npm installs.

**Changes**:
- Change `"@arete/core": "workspace:*"` → `"@arete/core": "file:./packages/core"`
- Change `"inquirer": "^9.2.0"` → `"@inquirer/prompts": "^8.3.0"`
- Add `repository` field: `{ "type": "git", "url": "git+https://github.com/johnkoht/arete.git" }`
- Add `author`: `"John Koht"`

**Acceptance Criteria**:
- [ ] No `workspace:*` in dependencies
- [ ] `@inquirer/prompts` in dependencies (not `inquirer`)
- [ ] `repository` field present with correct GitHub URL
- [ ] `author` field set
- [ ] `npm install` succeeds locally after changes

---

### Task 2: Fix getSourcePaths() for external install

**Description**: Simplify `getSourcePaths()` in `packages/core/src/compat/workspace.ts` to always return `packages/runtime/` paths. The current logic uses `node_modules` path detection which fails for GitHub installs.

**Changes**:
- Remove `useRuntime` parameter from function signature
- Always use `packages/runtime/` as the base path
- Update all callers to remove `useRuntime` argument:
  - `packages/cli/src/commands/install.ts`
  - `packages/cli/src/commands/update.ts`
  - `packages/cli/src/commands/skill.ts`

**Acceptance Criteria**:
- [ ] `getSourcePaths()` signature is `getSourcePaths(packageRoot: string): SourcePaths`
- [ ] Function always returns paths under `packages/runtime/`
- [ ] No references to `useRuntime` in `packages/` directory
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

### Task 3: Test fresh clone + local install

**Description**: Verify the fix works by cloning the repo fresh and testing the install flow locally.

**Test procedure**:
```bash
cd /tmp
rm -rf arete-test
git clone https://github.com/johnkoht/arete.git arete-test
cd arete-test
npm install          # Should trigger prepare → build
npx arete --version  # Should return version
npx arete install ./test-workspace
ls ./test-workspace/.cursor/rules/
```

**Acceptance Criteria**:
- [ ] Fresh clone `npm install` completes without error
- [ ] `npx arete --version` returns version string
- [ ] `npx arete install ./test-workspace` creates workspace
- [ ] Workspace contains `.cursor/rules/`, `.agents/skills/`, `context/`

---

### Task 4: Test global GitHub install end-to-end

**Description**: Test the full user experience: global install from GitHub, then create a workspace.

**Test procedure**:
```bash
npm uninstall -g arete 2>/dev/null || true
npm install -g github:johnkoht/arete
arete --version
arete install ~/arete-test-workspace
ls ~/arete-test-workspace/.cursor/rules/
ls ~/arete-test-workspace/.agents/skills/
```

**Acceptance Criteria**:
- [ ] `npm install -g github:johnkoht/arete` completes without error
- [ ] `arete --version` works after global install
- [ ] `arete install <dir>` creates a complete workspace
- [ ] Workspace has: `.cursor/rules/`, `.agents/skills/`, `context/`, `now/`, `goals/`

---

## 3. Definition of Done

- [ ] `npm install -g github:johnkoht/arete` works from any machine with Node 18+
- [ ] `arete --version` returns version after install
- [ ] `arete install <dir>` scaffolds a complete workspace with all runtime assets
- [ ] Quality gates pass (`npm run typecheck && npm test`)
- [ ] Changes committed and pushed to GitHub

---

## 4. Technical Notes

### Why file: instead of workspace:

The `workspace:*` protocol is an npm workspaces feature that only works during local development when npm is aware of the workspace configuration. When installing from GitHub, npm downloads the tarball and doesn't set up workspace linking — it needs a resolvable path.

`file:./packages/core` tells npm to look for the package at that relative path within the downloaded repo, which works correctly.

### Why always use packages/runtime/

The original design had two paths:
- Development: `packages/runtime/` (source of truth)
- Published: `dist/` (copied during build)

For GitHub installs, `packages/runtime/` is always present and correct. The `dist/` path was for npm tarball optimization which isn't relevant for GitHub distribution. Simplifying to one path eliminates a class of bugs.
