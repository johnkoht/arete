---
title: Publish Areté to GitHub
slug: publish-arete
status: building
size: small
tags: [distribution, github, npm]
created: 2026-02-25T22:45:00.000Z
updated: 2026-02-25T23:05:50.293Z
completed: null
execution: null
has_review: false
has_pre_mortem: true
has_prd: true
steps: 4
---

# Phase 1: Publish Areté to GitHub

## Goal

Make Areté installable directly from GitHub so early users can try it without waiting for npm publish.

```bash
npm install -g github:johnkoht/arete
arete install ~/my-workspace
```

## Context

- Repo is already on GitHub: `github.com/johnkoht/arete`
- Monorepo structure: `packages/core`, `packages/cli`, `packages/runtime`
- Currently works for local dev but has issues blocking external install
- This is the faster path to sharing — no npm account/publish ceremony

## Size

Small (4 steps)

---

## Steps

### Step 1 — Fix root `package.json` for GitHub install

**Changes needed:**
- Fix `workspace:*` dependency → `file:./packages/core` (workspace protocol not supported outside monorepo npm install context)
- Fix dependency mismatch: `inquirer` → `@inquirer/prompts` (CLI code uses the latter)
- Add `repository` field: `{ "type": "git", "url": "git+https://github.com/johnkoht/arete.git" }`
- Add `author`: `"John Koht"`
- Verify `prepare` script runs clean build from fresh clone

**Acceptance Criteria:**
- [ ] No `workspace:*` in dependencies
- [ ] `@inquirer/prompts` in dependencies (not `inquirer`)
- [ ] `repository` field present
- [ ] `npm install` from fresh clone succeeds

### Step 2 — Fix `getSourcePaths()` for external install

**File:** `packages/core/src/compat/workspace.ts`

**Current issue:** 
```typescript
const useRuntime = !packageRoot.includes('node_modules');
```
This logic is wrong for GitHub installs — the path won't contain `node_modules` during the initial install, but it also won't have `dist/` ready yet on first run.

**Fix:** Always use `packages/runtime/` as the source of truth:
```typescript
export function getSourcePaths(packageRoot: string): SourcePaths {
  const base = join(packageRoot, 'packages', 'runtime');
  return {
    root: packageRoot,
    skills: join(base, 'skills'),
    tools: join(base, 'tools'),
    rules: join(base, 'rules'),
    integrations: join(base, 'integrations'),
    templates: join(base, 'templates'),
    guide: join(base, 'GUIDE.md'),
  };
}
```
- Drop the `useRuntime` parameter entirely
- Update all callers (grep for `getSourcePaths` and `useRuntime`)

**Acceptance Criteria:**
- [ ] `getSourcePaths()` always returns `packages/runtime/` paths
- [ ] `useRuntime` parameter removed from function signature
- [ ] All callers updated
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

### Step 3 — Test fresh clone + local install

```bash
cd /tmp
git clone https://github.com/johnkoht/arete.git arete-test
cd arete-test
npm install          # Should trigger prepare → build
npx arete --version  # Should work
npx arete install ./test-workspace  # Should create workspace
ls ./test-workspace/.cursor/rules/  # Should have rules
```

**Acceptance Criteria:**
- [ ] Fresh clone builds without error
- [ ] `npx arete --version` returns version
- [ ] `npx arete install` creates workspace with skills, tools, rules

### Step 4 — Test global GitHub install end-to-end

```bash
# Clean slate
npm uninstall -g arete 2>/dev/null || true

# Install from GitHub
npm install -g github:johnkoht/arete

# Verify
arete --version
arete install ~/test-workspace
ls ~/test-workspace/.cursor/rules/
ls ~/test-workspace/.agents/skills/
```

**Acceptance Criteria:**
- [ ] `npm install -g github:johnkoht/arete` completes without error
- [ ] `arete --version` works globally
- [ ] `arete install <dir>` creates working workspace
- [ ] Workspace has: `.cursor/rules/`, `.agents/skills/`, `context/`, etc.

---

## Definition of Done

- [ ] `npm install -g github:johnkoht/arete` works from any machine with Node 18+
- [ ] `arete --version` returns version after install
- [ ] `arete install <dir>` scaffolds a complete workspace
- [ ] Quality gates pass (`npm run typecheck && npm test`)

---

## Out of Scope

- npm registry publish (see: `publish-to-npm` plan)
- CHANGELOG.md (nice for npm, not required for GitHub)
- `files` array optimization (GitHub gets whole repo anyway)
- README polish

---

## Follow-up

After Phase 1 is validated with early users:
→ Execute `publish-to-npm` plan for broader distribution
