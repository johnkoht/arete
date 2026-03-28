---
title: Documentation Audit
slug: documentation-audit
status: building
size: large
tags: []
created: 2026-03-28T05:02:35.536Z
updated: 2026-03-28T05:22:14.147Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 8
---

# Audit Skill

## Problem

Project documentation and capability registries drift from the actual codebase over time. There's no systematic way to detect and fix this drift. Currently requires manual inspection or waiting until someone hits a stale doc.

## Solution

Create a `/audit` skill that orchestrates domain-expert subagents to audit and fix documentation. Each expert owns their domain end-to-end: audit, fix, and report.

## Success Criteria

- `/audit` command runs full documentation audit via orchestrator + subagents
- `/audit --scope <domain>` runs single-domain audit
- Agents auto-fix safe changes (LEARNINGS.md gaps, minor doc updates)
- Agents flag structural changes for approval (capabilities.json, expertise profiles)
- Final report written to `dev/work/audits/{date}.md`
- Significant drift triggers memory entry consideration

## Scope

**In scope:**
- Skill creation (SKILL.md, orchestrator.md, domain definitions)
- Documentation inventory as auditable manifest
- Domain expert assignments
- Confirmation mode for structural changes
- Summary report generation

**Out of scope:**
- Broken external link detection (future enhancement)
- Package-level README creation (flag only)
- Test doc creation (MANUAL-SMOKE.md, TEST-SCENARIOS.md)

## Documentation Inventory

| Domain | Files | Expert |
|--------|-------|--------|
| **core** | packages/core/src/{services,integrations,adapters,search,models,storage}/, capabilities.json (services/integrations) | core-expert |
| **cli** | packages/cli/, capabilities.json (commands), README.md commands section | cli-expert |
| **runtime** | packages/runtime/, GUIDE.md, UPDATES.md | runtime-expert |
| **build** | .pi/{skills,extensions,standards,expertise,agents}/, memory/ | build-expert |
| **docs** | README.md, SETUP.md, DEVELOPER.md, AGENTS.md, ONBOARDING.md | docs-expert |

## Expert Assignments

| Agent | Expertise Profile | Scope | Auto-Fix | Flag for Approval |
|-------|-------------------|-------|----------|-------------------|
| core-expert | .pi/expertise/core/PROFILE.md | Core services, integrations, capabilities.json (partial) | LEARNINGS.md gaps | capabilities.json additions, PROFILE.md updates |
| cli-expert | .pi/expertise/cli/PROFILE.md | CLI commands, capabilities.json (partial) | LEARNINGS.md gaps | capabilities.json additions |
| runtime-expert | (use core profile) | Runtime skills, tools, GUIDE.md | Doc corrections | Skill additions/removals |
| build-expert | — | Standards, expertise profiles, agent definitions | Minor updates | Profile structural changes |
| docs-expert | — | Root docs, cross-references | Typos, dead internal links | Feature list changes |

## Orchestrator Responsibilities

1. Load skill, parse `--scope` if provided
2. Spawn domain experts (parallel or single based on scope)
3. Collect reports from each expert
4. Handle cross-cutting: AGENTS.md consistency, memory/MEMORY.md index accuracy
5. Present structural changes for approval
6. Apply approved changes (or delegate to experts)
7. Write final report to `dev/work/audits/{date}.md`
8. Suggest memory entry if significant drift found

## Skill Structure

```
.pi/skills/audit/
├── SKILL.md           # Skill definition, triggers, description
├── orchestrator.md    # Orchestrator instructions
├── manifest.yaml      # Documentation inventory (auditable list)
└── templates/
    └── audit-report.md  # Report template
```

---

Plan:
1. Create skill scaffold: `.pi/skills/audit/SKILL.md` with triggers, description, and basic structure
2. Create orchestrator: `.pi/skills/audit/orchestrator.md` with domain dispatch logic and report aggregation
3. Create documentation manifest: `.pi/skills/audit/manifest.yaml` listing all auditable docs by domain
4. Create report template: `.pi/skills/audit/templates/audit-report.md`
5. Add skill to AGENTS.md [Skills] section (or verify auto-generation picks it up)
6. Validate skill: Run `/audit --scope cli` to test single-domain flow
7. Full audit run: Run `/audit` to validate full orchestration
8. Fix any issues found during validation runs