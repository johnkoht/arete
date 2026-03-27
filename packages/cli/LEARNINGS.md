# CLI Package Learnings

Gotchas, invariants, and lessons learned from working on `packages/cli/`.

---

## 2026-03-26 — TypeScript Incremental Build Cache Staleness

**What broke**: CLI changes made in worktrees weren't reflected in the global `arete` command, even after `npm run build`. Users ran `arete onboard` and got old behavior (missing calendar integration, old messaging).

**Why**: `tsc -b` (TypeScript build mode) uses `.tsbuildinfo` files for incremental compilation. When working across git worktrees or after certain git operations, the cache can become stale — TypeScript thinks outputs are current when sources have actually changed.

**Symptoms**:
- CLI commands show old behavior despite source changes being committed
- `npm run build` completes instantly with "nothing to compile"
- `ls -la packages/cli/dist/` shows old timestamps

**Fix**: Delete the `.tsbuildinfo` files to force a full rebuild:
```bash
npm run clean    # removes dist/ and *.tsbuildinfo
npm run build    # full rebuild
```

Or use the combined:
```bash
npm run rebuild  # clean + build in one step
```

**Prevention**:
- After merging worktree work back to main: `npm run rebuild`
- If CLI behavior seems wrong: check dist file timestamps vs source timestamps
- When in doubt: `npm run rebuild`

---

## Guidelines

- **Add entries when**: You fix a regression, discover a non-obvious gotcha, or find something that would have saved time if you'd known earlier.
- **Format**: `## [Date] — [Short description]` with What broke / Why / Fix / Prevention.
- **Keep it actionable**: Future developers should know exactly what to do.
