# Phase 4 (Parts C–D): Skills.sh Integration, Install, Sidecar, Docs, and Context Freshness

**Date**: 2026-02-08  
**Branch**: feature/product-os-architecture

## Part C: Skills.sh Integration and Install

- **`arete skill install <source>`**:  
  - If source looks like `owner/repo` (contains `/`, no path sep): runs `npx skills add <source>` from workspace root. After install, only scans `.cursor/skills-local/` for new skills and adds `.arete-meta.yaml` there (so core/package skills are not touched). If skills.sh installs elsewhere, user can copy to skills-local and run `arete skill install ./path`.  
  - If source is a local path: copies directory (or parent of SKILL.md) to `.cursor/skills-local/<name>/`, then generates `.arete-meta.yaml`.  
  - After install: reports name/description; best-guess work_type and primitives from description; optional prompt “Use for role X?” when overlap with a default role is detected (set-default flow).

- **`.arete-meta.yaml` sidecar**:  
  - Generated for third-party installs: `category: community`, `requires_briefing: true`, optional `work_type` and `primitives` from description.  
  - **`getSkillInfo()`** in `src/commands/skill.ts`: reads `.arete-meta.yaml` when present and merges into skill info (primitives, work_type, category, requires_briefing, triggers, etc.) so the router and list see extended metadata without editing SKILL.md.

- **Helpers**: `readAreteMeta()`, `writeAreteMeta()`, `guessWorkTypeFromDescription()`, `guessPrimitivesFromDescription()`, `detectOverlapRole()`.

## Part D: Documentation and Polish

- **`.cursor/skills/README.md`** (shipped with package): What are skills; default skills; customizing (override, edit, reset, diff); adding third-party (install from skills.sh or path); choosing a different skill for a role (set-default); viewing defaults; resetting to default; creating your own skill; adding new capabilities.

- **SETUP.md**: New “Customizing Skills” section with short summary and link to `.cursor/skills/README.md`.

- **Context freshness**:  
  - **`arete status`**: New “Context Freshness” section when any context file (`.md` in `context/`) has not been modified in 30+ days; lists those files and suggests periodic-review.  
  - **Context templates**: Added “Last Reviewed: [Date]” to `context/business-overview.md` and `context/users-personas.md` in DEFAULT_FILES.  
  - **periodic-review skill**: Step 1 now says to run `arete status` to see which context files haven’t been modified in 30+ days.

- **AGENTS.md**: New “Skill management” subsection under CLI: default skills, role defaults (skills.defaults), override/reset/diff, install, sidecar metadata, and pointer to `.cursor/skills/README.md`.

## Tests

- Sidecar: `getSkillInfo` / `getMergedSkillsForRouting` merge `.arete-meta.yaml` when SKILL.md lacks extended fields (test/commands/skill.test.ts).
