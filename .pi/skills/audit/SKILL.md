---
name: audit
description: Orchestrate domain-expert subagents to audit and fix project documentation. Each expert audits their domain, reports findings, and applies safe fixes. Structural changes require approval.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# Audit Skill

Systematically audit project documentation and capability registries by dispatching domain-expert subagents. Each expert owns their domain end-to-end: audit, report, and fix (with approval gates for structural changes).

⚠️ **INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- `/audit` — Full documentation audit across all domains
- `/audit --scope <domain>` — Single-domain audit (core, cli, runtime, build, docs)
- `/audit --dry-run` — Report findings without applying fixes
- "Audit the documentation"
- "Check if capabilities.json is up to date"
- "Are there missing LEARNINGS.md files?"

## Prerequisites

- Working directory is the Areté repository

## Pre-Flight Check (MANDATORY — Before Dispatching Any Expert)

**Check 1: Subagent tool availability**

```
subagent tool available? → Dispatch domain experts normally (standard mode)
subagent tool unavailable? → Single-agent fallback mode
```

If subagent tool is unavailable, run each domain audit sequentially as the orchestrator — no expert dispatch. Output audit findings directly. Prepend the final report:

```
⚠️ Single-agent fallback mode (subagent tool unavailable). All domains audited sequentially by orchestrator. Expert depth may be reduced.
```

**Check 2: manifest.yaml existence**

```bash
ls .pi/skills/audit/manifest.yaml
```

If missing: use the inline domain table (Domain Assignments section below) as the configuration. **Note**: Without manifest.yaml, any project-specific customizations (custom scope overrides, skip lists, extra experts) are unavailable. Default audit coverage is full but project-specific tuning won't apply. No HALT.

## Tool Reference

This skill uses the `subagent` tool to dispatch domain experts.

```typescript
// Dispatch a domain expert (using developer agent with profile injection)
subagent({
  agent: "developer",
  task: `<expertise profile content>
  
<domain-specific audit instructions>`,
  agentScope: "project"
})
```

**Pattern**: Use the `developer` agent with expertise profile content injected in the task prompt. This follows the execute-prd pattern and avoids creating new agent definitions.

## Flags

### `--scope <domain>`

Audit only the specified domain. Valid domains:
- `core` — packages/core/, capabilities.json (services/integrations)
- `cli` — packages/cli/, capabilities.json (commands)
- `runtime` — packages/runtime/, GUIDE.md, UPDATES.md
- `build` — .pi/{skills,extensions,standards,expertise,agents}/, memory/
- `docs` — README.md, SETUP.md, DEVELOPER.md, AGENTS.md, ONBOARDING.md

### `--dry-run`

Run full audit and generate reports but suppress all auto-fixes:
- Reports still written to `dev/work/audits/{date}.md`
- Proposed changes shown but not applied
- Experts run with `DRY_RUN=true` context
- Useful for validation and preview before committing to changes

## Workflow Overview

```
[1] Load skill, parse flags (--scope, --dry-run)
[2] Read manifest.yaml for audit configuration
[3] Dispatch domain experts (parallel or single based on scope)
    └── Each expert writes to dev/work/audits/{date}/expert-{domain}.md
[4] Collect all expert reports
[5] Extract structural changes requiring approval
[6] Present approval gate (if not --dry-run)
    └── Options: [Y] Apply all, [N] Skip all, [#] Select items
[7] Apply approved changes (orchestrator owns capabilities.json edits)
[8] Write final report to dev/work/audits/{date}.md
[9] Suggest memory entry if significant drift found
```

See [orchestrator.md](./orchestrator.md) for detailed dispatch logic and report aggregation.

## Domain Assignments

| Domain | Scope | Expertise Profile | Auto-Fix | Require Approval |
|--------|-------|-------------------|----------|------------------|
| core | packages/core/src/ | .pi/expertise/core/PROFILE.md | LEARNINGS.md gaps | capabilities.json, PROFILE.md |
| cli | packages/cli/ | .pi/expertise/cli/PROFILE.md | LEARNINGS.md gaps | capabilities.json |
| runtime | packages/runtime/ | (use core profile) | Doc corrections | Skill additions |
| build | .pi/, memory/ | — | Minor updates | Profile structural changes |
| docs | Root docs | — | Typos, dead links | Feature list changes |

## Report Format

Experts produce reports with this schema:

```markdown
# Audit: {domain}

## Findings
- [✅|⚠️|❌] {file/component}: {description}

## Auto-Fixed
- {file}: {what changed}

## Proposed Changes (require approval)

### capabilities.json additions
```json
{ "id": "...", "type": "...", ... }
```

### Profile updates
- File: {path}
- Change: {description}
```

## Approval Gate

When structural changes are proposed (not in --dry-run mode):

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Proposed Changes                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. capabilities.json: Add 'conversations' integration          │
│  2. capabilities.json: Add 'template' commands                  │
│  3. .pi/expertise/core/PROFILE.md: Update invariants section    │
│                                                                 │
│  [Y] Apply all  [N] Skip all  [1,2,3] Select items             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Skipped items are saved to `dev/work/audits/{date}-deferred.md` for future action.

## Exit Conditions

- All domains audited (or single domain if --scope)
- Report written to `dev/work/audits/{date}.md`
- Approved changes applied (or none if --dry-run)
- Deferred items saved if any skipped

## References

- **Orchestrator**: `orchestrator.md` (domain dispatch, report aggregation)
- **Manifest**: `manifest.yaml` (what to audit per domain)
- **Report template**: `templates/audit-report.md`
- **Expertise profiles**: `.pi/expertise/{domain}/PROFILE.md`
- **Pattern source**: `.pi/skills/execute-prd/SKILL.md` (subagent dispatch pattern)
