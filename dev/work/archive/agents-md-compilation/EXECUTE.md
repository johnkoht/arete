# Execute agents-md-compilation PRD

Execute this PRD using the autonomous agent loop.

**Copy the prompt below into a new chat to begin:**

---

Execute the agents-md-compilation PRD. Load the execute-prd skill from `.agents/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/agents-md-compilation/prd.md`. Run the full workflow: pre-mortem → task execution loop → post-mortem.

**Critical orchestrator requirements:**

1. **Documentation coverage is paramount** — Task 13 requires checking/updating 12+ files. Do NOT trust subagent's "done" report. Independently verify EACH file.

2. **Heuristic testing** — Tasks 8, 10, 11 involve testing agent behavior. These require actual prompts in separate contexts. Document results accurately.

3. **config/agents/ cleanup** — Phase 1 created a placeholder at `config/agents/`. This PRD supersedes it with `.agents/sources/`. Task 15 must remove it. Verify with `ls config/agents/` (should fail).

4. **Size target** — AGENTS.md must be under 10KB. If it's larger, compression needs adjustment.

---

## Quick Reference

| Item | Location |
|------|----------|
| PRD | `dev/prds/agents-md-compilation/prd.md` |
| Skill | `.agents/skills/execute-prd/SKILL.md` |
| Progress log | `dev/autonomous/progress.txt` |
| Source files | `.agents/sources/` (created by Task 1) |
| Build script | `scripts/build-agents.ts` (created by Task 5) |

## Task Summary (16 tasks)

### Phase A: Source Files (Tasks 1-4)
1. Create `.agents/sources/` directory structure
2. Create shared source files (vision, workspace, cli)
3. Create builder source files (skills-index, rules-index, conventions, memory)
4. Create guide source files (skills-index, tools-index, intelligence, workflows)

### Phase B: Build Script (Tasks 5-7)
5. Create `scripts/build-agents.ts`
6. Add compression logic
7. Integrate with npm scripts

### Phase C: Testing (Tasks 8-11)
8. Run baseline heuristic tests (capture current behavior)
9. Generate new BUILD AGENTS.md
10. Run post-implementation tests
11. Iterate on format if needed

### Phase D: Documentation (Tasks 12-15)
12. Generate GUIDE AGENTS.md
13. **Update ALL documentation** (12 files — verify each!)
14. Create memory entry
15. Remove `config/agents/` placeholder

### Phase E: Final (Task 16)
16. Final verification (files, greps, builds, tests)

## Verification Commands

After each task:
```bash
npm run typecheck && npm test
```

After Task 9 (size check):
```bash
wc -c AGENTS.md  # Should be < 10KB
```

After Task 15 (placeholder removed):
```bash
ls config/agents/  # Should fail
rg "config/agents" --type md  # Should return 0
```

Final verification:
```bash
npm run build:agents:dev  # Should succeed
npm run build  # Should succeed
rg "config/agents"  # Should return 0
rg "edit AGENTS.md" -i  # Should return 0 or only point to sources
```
