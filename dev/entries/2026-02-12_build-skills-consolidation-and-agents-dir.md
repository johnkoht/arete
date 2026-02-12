# Build skills consolidation and AGENTS.md directory structure

**Date**: 2026-02-12  
**Context**: Single location for build skills; directory tree in AGENTS.md aligned with current repo.

---

## Skill consolidation

**Problem**: Two execute-prd skills existed (canonical in `dev/skills/execute-prd/`, duplicate in `dev/autonomous/skills/execute-prd/`). prd-to-json lived only under `dev/autonomous/skills/`, which was inconsistent with the canonical execute-prd and plan-to-prd in `dev/skills/`.

**Changes**:

1. **Removed duplicate execute-prd**  
   Deleted `dev/autonomous/skills/execute-prd/`. Canonical skill remains `dev/skills/execute-prd/SKILL.md`.

2. **Moved prd-to-json to dev/skills**  
   Created `dev/skills/prd-to-json/SKILL.md`, removed `dev/autonomous/skills/prd-to-json/`. All build skills now live under `dev/skills/`: execute-prd, plan-to-prd, prd-to-json, prd-post-mortem, synthesize-collaboration-profile.

3. **Removed empty dev/autonomous/skills/**  
   After moving prd-to-json and deleting the duplicate execute-prd, `dev/autonomous/skills/` was empty and was removed. `dev/autonomous/` now holds only runtime/artifacts: schema, prd.json.example, progress.txt.template, archive, and (when present) prd.json and progress.txt.

4. **Reference updates**  
   - plan-to-prd, autonomous README, TESTING.md: point to `dev/skills/prd-to-json/` and `dev/skills/execute-prd/`.  
   - dev/entries/2026-02-10_memory-boundaries-and-path-cleanup.md: added "Subsequent cleanup" note.  
   - AGENTS.md Autonomous PRD Execution References: added plan-to-prd and prd-to-json skill paths.

**Router**: No code change. The skill router only uses `.agents/skills/` (user workspace); build skills are loaded by path, not routed.

---

## AGENTS.md directory structure

**Problem**: The Architecture "Directory Structure" tree still showed `.cursor/build/` (autonomous, entries, MEMORY) from before the 2026-02-09/2026-02-10 migration to `dev/`. That caused doc drift.

**Change**: Updated the tree to match the current repo:

- **dev/** — Build system: autonomous/, entries/, MEMORY.md, skills/, agents/, backlog/, prds/.
- **runtime/** — Product assets shipped to users (skills, rules, tools, integrations); replaces the old .cursor/ product listing in the tree.

Historical entries in dev/entries/ that reference `.cursor/build/` are unchanged (historical record).

---

## Learnings

- One place for build skills (`dev/skills/`) keeps references simple and avoids "which execute-prd?" confusion.
- Keeping the directory tree in AGENTS.md aligned with the repo avoids subtle drift after migrations; worth touching when doing path or layout changes.
