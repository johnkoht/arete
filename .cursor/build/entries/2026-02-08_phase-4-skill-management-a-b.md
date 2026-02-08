# Phase 4 (Parts A–B): Skill Management, Override UX, and Role Defaults

**Date**: 2026-02-08  
**Branch**: feature/product-os-architecture

## Part A: Override and Customization UX

- **`arete skill override <name>`**: Verified; copies default from `.cursor/skills-core/` to `.cursor/skills-local/`; router prefers local via `getMergedSkillsForRouting`.
- **`arete skill reset <name>`**: Added. Removes user override (deletes `.cursor/skills-local/<name>`), updates `skills.overrides` in arete.yaml. Confirms before delete unless `--yes`; warns if local SKILL.md differs from core (modified).
- **`arete skill diff <name>`**: Added. Line-by-line diff of default vs local SKILL.md; `-` from core, `+` from local. Supports `--json`.
- **`arete skill list`**: Improved. Labels: default / customized / third-party. Added `--verbose` for primitives, work_type, category. Overridden skills shown as "(customized)" instead of "(overridden)".

## Part B: Skill Defaults (Role Mapping)

- **Config**: `skills.defaults` in arete.yaml — `Record<string, string | null>`. Role (default skill name) → preferred skill name; `null` or absent = use Areté default. Types in `src/types.ts`, default in `src/core/config.ts`.
- **Router**: Defaults applied in command layer after `routeToSkill`. New helper `applySkillDefaults(routed, mergedSkills, config.skills?.defaults)` in `src/commands/skill.ts`. When matched skill has a mapping, resolve to that skill’s path; response includes `resolvedFrom` when a preference was applied. Used by `arete skill route` and top-level `arete route`.
- **CLI**:
  - `arete skill defaults` — shows role → preferred skill table (or "(default)").
  - `arete skill set-default <skill-name> --for <role>` — validates role (must be a core skill name) and skill (must be in merged list); writes `skills.defaults[role] = skillName` to arete.yaml.
  - `arete skill unset-default <role>` — removes mapping for role.

## Tests

- Config: `loadConfig` merges `skills.defaults` from arete.yaml.
- Skill commands: `applySkillDefaults` (no defaults, resolve to preferred, preferred not installed, null default, null routed), `getDefaultRoleNames`.

## References

- PRD: Phase 4 Ecosystem — Skill Management, Customization, and Documentation
- Vision: Skills Architecture, Adapter Pattern
- skill-interface.md: extended frontmatter, router impact
