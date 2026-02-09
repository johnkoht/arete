# Repo reorganization (runtime/ and dev/)

**Date**: 2026-02-09

## Summary

Major repository reorganization: moved product assets to `runtime/`, build-only assets to `dev/`, and simplified skill management to a single location `.agents/skills/`.

## What changed

### Directory structure

- **runtime/** — Shipped assets: `runtime/skills/`, `runtime/tools/`, `runtime/integrations/`, `runtime/rules/`, `runtime/templates/`. Build copies these into `dist/` so the published package contains `dist/skills/`, `dist/templates/`, etc.
- **dev/** — Build-only (never shipped): `dev/entries/`, `dev/prds/`, `dev/autonomous/`, `dev/backlog/`, `dev/skills/`, `dev/templates/`, `dev/agents/`, `dev/docs/`, plus `dev/MEMORY.md`, `dev/collaboration.md`, and other build docs. Replaces `.cursor/build/` and `.cursor/agents/`, `.cursor/docs/`.
- **.cursor/rules/** — Dev rules (dev.mdc, testing.mdc) stay here. Product rules are *copied* from `.cursor/rules/` to `runtime/rules/` (source of truth for install remains in repo; install copies from package `dist/rules/`).

### Skills

- **Single location**: All skills in `.agents/skills/` (last-in-wins). No more `.cursor/skills-core/` or `.cursor/skills-local/`.
- **Dropped commands**: `arete skill override`, `arete skill reset`, `arete skill diff` removed. Simplify customization by editing or replacing skills in `.agents/skills/` directly.
- **Install/update**: `arete install` and `arete update` copy/link from package `runtime/skills` (dev) or `dist/skills` (compiled) into workspace `.agents/skills/`.
- **getSourcePaths()**: Detects dev vs compiled (running from `src/` vs `dist/`) and returns `runtime/` or `dist/` as base for skills, tools, rules, integrations, templates.

### Build pipeline

- **package.json**: `"files": ["bin/", "dist/"]`; `"build": "tsc && node scripts/copy-runtime.js"`; `"prepare": "npm run build"`.
- **scripts/copy-runtime.js**: Copies `runtime/{skills,tools,rules,integrations,templates}` into `dist/` after tsc.
- **npm pack**: Package contains `dist/` (compiled JS + copied runtime assets). No top-level skills/tools/rules in package.

### Dev setup

- **.gitignore**: `.agents/` (workspace skills dir); `dev/autonomous/prd.json`, `dev/autonomous/progress.txt`. Removed `.cursor/skills-core/`, `.cursor/tools-core/`.
- **scripts/dev-setup.sh**: Copies `runtime/skills/` to `.agents/skills/` and creates workspace dirs for local dev. Run `npm run dev:setup` when developing in repo.
- **Workspace dirs**: `context/`, `projects/`, `people/`, etc. remain at repo root for dev testing; plan said to gitignore them—currently only `.agents/` and dev runtime files are ignored.

### Documentation and rules

- **AGENTS.md**: All path references updated: `.cursor/build/` → `dev/`, `.cursor/skills-core/` / `.cursor/skills-local/` → `.agents/skills/`, `.cursor/skills/` → `.agents/skills/`. Skill management section simplified (no override/reset/diff).
- **runtime/rules/** (product rules): `.cursor/build/` → `dev/`, `.cursor/skills/` → `.agents/skills/`.
- **runtime/skills/README.md**: Updated paths to `.agents/skills/`.
- **dev/MEMORY.md**: Note at top: paths in entries before 2026-02-09 reference pre-reorganization structure. Entry paths in index remain `entries/...` (relative).

## Decisions

- **Single skill location**: One directory `.agents/skills/`; no core/local merge logic.
- **Dev rules stay in .cursor/rules/**: Only the *source* of product rules moved to `runtime/rules/`; dev.mdc and testing.mdc remain in `.cursor/rules/` and are filtered by PRODUCT_RULES_ALLOW_LIST on install.
- **getSourcePaths() dev vs compiled**: Use `import.meta.url` to detect if code is under `src/` (tsx) or `dist/` (node); return `runtime/` or `dist/` accordingly.
- **Do not edit dev/entries/** historical files: Paths in old entries stay as-written for history; MEMORY.md note explains the mapping.

## Learnings

- Phase 1 (file moves only) then Phase 2 (code changes) kept commits clean and made it easy to fix type errors by changing `src/types.ts` first and letting the compiler find all references.
- `git mv` for moves preserved history; copying product rules to `runtime/rules/` kept originals in `.cursor/rules/` for this repo.
- Pre-mortem rule: getSourcePaths() dev vs compiled was the #1 runtime risk; implementing it up front avoided broken install/route in dev vs published package.
