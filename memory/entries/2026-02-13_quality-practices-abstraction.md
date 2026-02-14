# Quality Practices Abstraction

**Date**: 2026-02-13  
**Type**: Documentation + Build Skill  
**Files Changed**: 
- AGENTS.md (§ For Autonomous Development)
- dev/skills/run-pre-mortem/SKILL.md (new)

## Execution Path

- **Size assessed**: Medium (2-3 moderate steps, touches architecture/workflow)
- **Path taken**: Direct + pre-mortem
- **Decision tree followed?**: Yes
- **Notes**: Pre-mortem offered and accepted; 8 risks identified, 7/8 prevented. Scope creep mitigation kept work bounded.

## Summary

Abstracted quality practices (pre-mortem, code review, quality gates, memory capture) from execute-prd workflow so they're available for any development work, not just PRD execution. Added decision tree for execution path selection and standalone pre-mortem skill.

## What Changed

### 1. New Skill: run-pre-mortem
- Created `dev/skills/run-pre-mortem/SKILL.md`
- Standalone pre-mortem workflow (references PRE-MORTEM-TEMPLATE.md)
- ~140 lines, lightweight wrapper around template
- 8 risk categories, structured output format

### 2. AGENTS.md Updates
- **Execution Path Decision Tree** (new § after "For Autonomous Development" intro)
  - Tiny/Small/Medium-Large work classification
  - Clear guidance: when to use PRD vs direct execution
  - Examples table + anti-patterns
- **Quality Practices for Any Execution** (new §)
  - Pre-mortem (when, how, tool paths)
  - Quality gates (mandatory for all commits)
  - Code review checklist (6 points, inline)
  - Build memory capture (thresholds, workflow)
  - Reuse and avoid duplication (DRY/KISS)
- **Cross-reference in § 11** (Autonomous PRD Execution)
  - Note pointing to new Quality Practices section

## Pre-Mortem Review

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Inconsistent guidance | No | Terminology + cross-refs | ✅ Yes |
| Decision tree vague/rigid | No | Examples + anti-patterns | ✅ Yes |
| Pre-mortem duplication | No | Reference template | ✅ Yes |
| Memory capture unclear | No | Explicit thresholds | ✅ Yes |
| Scope creep | No | Doc + 1 skill only | ✅ Yes |
| Skill not discoverable | No | Paths in § Quality Practices | ✅ Yes |
| Testing blind spot | No | Manual verification | ✅ Yes |
| Integration with workflow | TBD | Early placement + builder feedback | TBD |

**Outcome**: 7/8 risks prevented, 1 TBD (will observe in next plan approval scenario).

## What Worked Well

1. **Pre-mortem itself** — Identified scope creep risk early, kept strict boundaries (doc + 1 skill)
2. **Clear structure** — Decision tree → Quality Practices → Documentation, logical flow
3. **Concrete examples** — Table with "Fix typo" vs "Add calendar integration" makes sizing obvious
4. **File path inclusion** — Agents can immediately find tools (dev/skills/run-pre-mortem/SKILL.md, PRE-MORTEM-TEMPLATE.md)
5. **Cross-reference** — § 11 points back to new section, connects PRD practices to broader context

## What Didn't Work

Nothing blocked; minor observations:
- **Decision tree placement** — Could have gone even earlier (right after item 4 in numbered list), but current placement (after numbered list, before Documentation Checklist) is reasonable
- **Section title** — "Quality Practices for Any Execution" is clear but verbose; alternatives: "Development Quality Practices", "Core Quality Practices"

## Learnings

### 1. Documentation as Code
- Pre-mortem for doc changes works just as well as for code changes
- Same risk categories apply: scope creep, inconsistency, discoverability
- Manual verification step (grep for paths) caught potential issues before they surfaced

### 2. Abstraction Pattern
- Practices were "locked" in execute-prd not by design but by lack of explicit guidance
- Agents need permission to apply practices broadly ("These apply to ALL work, not just PRD")
- Decision trees scale: tiny/small/large with examples → agents can pattern-match

### 3. Discoverability
- Inline file paths (dev/skills/X/SKILL.md) are critical
- Agents won't "discover" build skills via router (not registered)
- Must list paths explicitly in § Quality Practices or agents won't know they exist

### 4. Scope Discipline
- Pre-mortem flagged "modularize execute-prd" as scope creep → parked as future work
- Strict definition: "doc + 1 skill, no execute-prd changes" kept work bounded
- Temptation to "also refactor X" is real; pre-mortem mitigation worked

## Next Steps

1. **Observe in practice** — Next plan approval, check if agent follows decision tree
2. **Calibrate thresholds** — "3+ files OR 20+ minutes" for memory capture may need tuning based on builder feedback
3. **Phase 2 (future)** — Modularize execute-prd: extract orchestrator-review, reviewer-checklist as standalone skills

## References

- **New skill**: `dev/skills/run-pre-mortem/SKILL.md`
- **Template**: `dev/templates/PRE-MORTEM-TEMPLATE.md`
- **Updated**: AGENTS.md § "For Autonomous Development" (lines ~808-927)
- **Cross-ref**: AGENTS.md § 11 "Autonomous PRD Execution" (line ~582)
