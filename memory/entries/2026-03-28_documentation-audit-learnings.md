# Documentation Audit Skill — Learnings

**Date**: 2026-03-28
**PRD**: `dev/work/plans/documentation-audit/prd.md`
**Branch**: `feature/documentation-audit`

---

## Summary

Created the `/audit` skill that orchestrates domain-expert subagents to audit and fix project documentation. The skill uses the profile injection pattern (spawn `developer` agent with expertise profile content) rather than creating new agent definitions.

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 8/8 complete |
| First-attempt success | 100% |
| Pre-mortem risks | 0/8 materialized |
| Files created | 4 (SKILL.md, orchestrator.md, manifest.yaml, audit-report.md) |
| Duration | ~30 minutes |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Skill pattern inconsistency | No | Yes (read execute-prd/ship patterns) | Yes |
| Subagent context gaps | No | Yes (explicit file lists in prompts) | Yes |
| Conflicting capabilities.json edits | No | Yes (single-point edit rule) | Yes |
| AGENTS.md registration | No | Yes (verified auto-discovery) | Yes |
| manifest.yaml drift | No | Yes (glob patterns) | Yes |
| Report aggregation | No | Yes (defined schema) | Yes |
| No expert agent definitions | No | Yes (profile injection) | Yes |
| Validation expense | No | Yes (structural validation) | Yes |

---

## What Worked Well

1. **Profile injection pattern**: Following execute-prd's approach of injecting expertise profiles into developer agent prompts was simpler than creating 5 new agent definitions. Keeps the agent roster lean.

2. **Thorough pre-mortem → cleaner PRD**: The pre-mortem identified the report schema gap before building, so the orchestrator.md included the schema upfront rather than discovering the need during validation.

3. **Cross-model review caught gaps**: The reviewer identified that approval gate UX and --dry-run behavior were underspecified. Addressing these in the PRD tasks prevented iteration during implementation.

---

## What Didn't Work

Nothing significant — the pre-mortem and review caught the major gaps before building.

---

## Patterns to Continue

- **Pre-mortem mitigations in task descriptions**: Including "Pre-mortem mitigations: ..." sections in PRD tasks ensures developers see the mitigations.

- **Approval gate UX pattern**: Using `[Y] Apply all, [N] Skip all, [#] Select` with deferred items file is reusable for other skills with approval flows.

- **manifest.yaml for auditable inventories**: Declarative YAML for what-to-check is more maintainable than hardcoded file lists.

---

## Recommendations

**Continue**: Profile injection for domain experts, declarative manifests, interactive approval gates

**Start**: Consider adding a LEARNINGS.md to `.pi/skills/audit/` after first real usage

**Future**: Could add `--fix` mode that applies all auto-fixes without approval gate (opposite of --dry-run)

---

## Documentation Gaps

None identified — skill is self-documenting with SKILL.md and orchestrator.md.

---

## References

- **Skill files**: `.pi/skills/audit/`
- **PRD**: `dev/work/plans/documentation-audit/prd.md`
- **Related skills**: execute-prd, ship (pattern sources)
