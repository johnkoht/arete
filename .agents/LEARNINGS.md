# LEARNINGS.md — .agents/

Component-local gotchas and invariants for AGENTS.md generation and source management.

---

## 2026-03-31: Two AGENTS.md files serve different purposes

**Context**: Root AGENTS.md and dist/AGENTS.md are NOT the same thing.

| File | Mode | Content | Maintenance |
|------|------|---------|-------------|
| `AGENTS.md` (root) | BUILD | Identity, Expertise, Roles, build skills | Hand-written |
| `dist/AGENTS.md` | GUIDE | Skills, tools, workflows for PM users | Generated from `.agents/sources/` |

**What broke**: Root AGENTS.md (BUILD) was overwritten with dist/AGENTS.md content (GUIDE). This removed critical BUILD context like `[Identity]`, `[Expertise]`, `[Roles]` sections.

**How it happened**: After the `dev` target was removed from `build-agents.ts`, commits like c57e944 "regenerate AGENTS.md" manually copied generated content to root.

**Safeguard added**: `checkRootAgentsIntegrity()` in `scripts/build-agents.ts` now fails the build if root AGENTS.md has GUIDE-mode content.

**How to avoid**:
- Never copy `dist/AGENTS.md` to root `AGENTS.md`
- Edit root `AGENTS.md` directly for BUILD mode changes
- Run `npm run build` which now validates root AGENTS.md integrity

**How to restore** (if it happens again):
```bash
git show cd640c4:AGENTS.md > AGENTS.md
```

---

## 2026-03-31: README.md in sources/ is outdated

**Issue**: The README in `.agents/sources/README.md` references:
- A `builder/` subdirectory that no longer exists
- `npm run build:agents:dev` command that was removed
- A two-output build model that's no longer accurate

**Current reality**:
- Root AGENTS.md is hand-written (not generated)
- Only `dist/AGENTS.md` is generated from sources
- No `builder/` sources exist

**To fix**: Update `.agents/sources/README.md` to reflect current architecture.
