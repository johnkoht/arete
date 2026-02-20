---
title: Publish arete-workspace to npmjs
slug: publish-to-npm
status: draft
size: medium
created: 2026-02-17T21:00:00Z
updated: 2026-02-17T21:00:00Z
completed: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 6
tags: []
---

# Publish arete-workspace to npmjs

## Goal

Publish Arete as a single npm package (`arete-workspace`) so product managers and builders can install it globally and use the `arete` CLI to set up their workspace.

```
npm install -g arete-workspace
arete install ~/my-workspace
```

## Context

- The repo is a 3-package monorepo (core, cli, runtime) but only the ROOT package publishes to npm
- `packages/core` and `packages/cli` remain internal (marked private) — users never install them directly
- `packages/runtime` contains the workspace content (skills, rules, tools, templates) that gets copied into the user's workspace on `arete install`
- `arete-workspace` is confirmed available on npmjs.com

## Package Architecture (post-publish)

```
arete-workspace (published to npm)
  ├── bin/arete.js              ← CLI entrypoint
  ├── packages/core/dist/       ← compiled engine (baked in)
  ├── packages/cli/dist/        ← compiled CLI commands (baked in)
  └── packages/runtime/         ← skills, rules, tools, templates
```

Users install one package → get the `arete` command → run `arete install` → runtime content lands in their workspace.

## Steps

### Step 1 — Fix root `package.json`
- Rename: `@arete/cli` → `arete-workspace`
- Fix `bin`: `./packages/cli/bin/arete.js` (verify this path resolves post-install)
- Fix `files` array: ensure it includes all compiled output and runtime assets
- Fix `workspace:*` dependency on `@arete/core` → `"*"` (npm doesn't support pnpm workspace protocol)
- Add `publishConfig: { access: "public" }`
- Add `description`, `keywords`, `repository`, `homepage` metadata

### Step 2 — Fix `packages/cli/package.json`
- Rename: `@arete/cli-next` → `@arete/cli`
- Add `private: true` (prevents accidental separate publish)
- Add `files` field

### Step 3 — Fix `packages/runtime/package.json`
- Add `private: true`
- Add `files` field (only ship skills/, rules/, tools/, templates/, GUIDE.md)
- Add `description` and `keywords`

### Step 4 — Fix `packages/core/package.json`
- Add `private: true`
- Verify `files` field covers `dist/` output

### Step 5 — Build + quality gates
- `npm run build` (compiles all packages)
- `npm run typecheck` (must pass)
- `npm test` (must pass)

### Step 6 — Dry-run verify
- `npm pack --dry-run` from root
- Review file list: confirm runtime assets ship, no dev files leak, bin path is correct
- Check package size is reasonable

### Step 7 — Publish (owner executes)
- `npm login` (verify logged in as correct account)
- `npm publish --access public`
- Verify: `npm view arete-workspace`
- Test clean install: `npm install -g arete-workspace` in a temp dir

## Out of Scope (follow-up plans)
- GitHub Actions CI/CD for automated publish on git tag
- Changelog / versioning automation (changesets, release-please)
- npm page README polish / badges
- `@arete/core` as a separately published package for programmatic use

## Definition of Done
- [ ] `npm view arete-workspace` returns the correct package metadata
- [ ] `npm install -g arete-workspace` installs cleanly
- [ ] `arete --version` works after install
- [ ] `arete install` can scaffold a workspace (runtime assets present)
- [ ] Quality gates pass (`typecheck` + `test`)
- [ ] No dev files or test files in the published package
