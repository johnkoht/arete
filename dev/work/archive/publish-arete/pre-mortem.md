# Pre-Mortem: Phase 1 — GitHub Distribution

## Risk Analysis

### 1. `prepare` script fails on fresh clone
**Likelihood:** Medium  
**Impact:** High — install fails completely

**Scenario:** Fresh clone runs `prepare` → `npm run build`, but TypeScript compilation fails due to missing types or broken imports.

**Mitigation:**
- Test Step 3 thoroughly: clone to temp dir, `npm install`, verify build
- Ensure all `@types/*` packages are in devDependencies
- Run `npm run typecheck` before any push

### 2. `workspace:*` protocol breaks GitHub install  
**Likelihood:** High (confirmed issue)  
**Impact:** High — npm can't resolve dependency

**Scenario:** Root package.json has `"@arete/core": "workspace:*"`. npm install from GitHub doesn't understand workspace protocol → dependency resolution fails.

**Mitigation:**
- Step 1 explicitly fixes this: change to `file:./packages/core`
- Test in isolation before full e2e test

### 3. `getSourcePaths()` returns wrong path
**Likelihood:** High (confirmed issue)  
**Impact:** High — `arete install` copies nothing or crashes

**Scenario:** Current logic checks for `node_modules` in path. GitHub install path won't match expected pattern → skills/tools/rules not found.

**Mitigation:**
- Step 2 simplifies to always use `packages/runtime/`
- Add integration test that verifies paths resolve correctly

### 4. Binary not linked correctly
**Likelihood:** Low  
**Impact:** High — `arete` command not found

**Scenario:** `bin` entry in package.json points to wrong path, or file isn't executable.

**Mitigation:**
- Verify `bin.arete` path: `./packages/cli/bin/arete.js`
- Check file has shebang: `#!/usr/bin/env node`
- Test with `npx arete` before global install

### 5. Slow install experience
**Likelihood:** Medium  
**Impact:** Low — annoying but not blocking

**Scenario:** GitHub install downloads full repo + runs TypeScript build. Could take 30-60 seconds.

**Mitigation:**
- Acceptable for Phase 1 (early sharing)
- Phase 2 npm publish will be faster (pre-built)
- Document expected install time in README

## Go/No-Go Checklist

Before declaring Phase 1 complete:
- [ ] Fresh clone in temp dir builds successfully
- [ ] `npx arete --version` works from fresh clone
- [ ] `npm install -g github:johnkoht/arete` works from clean machine state
- [ ] `arete install <dir>` creates workspace with all expected content
- [ ] Quality gates pass

## Rollback Plan

If GitHub install is broken after push:
1. Issues are in the repo — just fix and push
2. Users can pin to a known-good commit: `npm install -g github:johnkoht/arete#<sha>`
