# Project Updates PRD Learnings

**Date**: 2026-02-25
**PRD**: project-updates
**Status**: Complete (6/6 tasks)

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 6/6 (100%) |
| First-attempt success | 6/6 (100%) |
| Reviewer iterations | 0 |
| Tests | 787 passing (+9 routing tests) |
| Commits | 5 |
| Token usage | ~25K total (orchestrator ~7K + subagents ~18K) |

## Pre-Mortem Analysis

All 7 pre-mortem risks were mitigated and none materialized:

| Risk | Materialized | Mitigation Applied | Effective |
|------|--------------|-------------------|-----------|
| Routing conflict | No | Negative triggers + 9 routing tests | Yes |
| Auto-trigger aggressive | No | "Suggest, don't auto-apply" language | Yes |
| Pattern adoption failure | No | Dedicated numbered steps in skills | Yes |
| Index checkpoint scatter | No | Standard phrase used consistently | Yes |
| Template doesn't fit | No | Optional markers + minimal guidance | Yes |
| Missing skill updates | No | Pre-implementation audit (found 2) | Yes |
| Output verbosity | No | Structural limits (bullet caps, etc.) | Yes |

## Deliverables

1. **general-project skill** (`packages/runtime/skills/general-project/`)
   - SKILL.md with triggers, negative triggers, workflow
   - templates/project.md with optional sections and minimal project guidance
   - 9 routing tests verifying disambiguation

2. **research_intake pattern** (`packages/runtime/skills/PATTERNS.md`)
   - 6-step workflow (scan → analyze → synthesize → update → index → cleanup)
   - Analysis template (Summary, Key Points, Questions, Relevance)
   - Structural limits (5-7 bullets, 2-3 sentences, max 10 paragraphs)
   - Suggest language (no auto-apply)

3. **Skill updates**
   - discovery/SKILL.md — added step 5 "Process Bulk Inputs"
   - general-project/SKILL.md — added step 5 "Process Bulk Inputs"
   - save-meeting/SKILL.md — added index checkpoint
   - process-meetings/SKILL.md — added index checkpoint

## What Worked Well

1. **Pre-mortem thoroughness**: 7 risks identified during planning, all mitigated in PRD, none materialized during execution
2. **Reviewer pre-work sanity checks**: Caught missing details (negative triggers format, YAML frontmatter values) before developer started
3. **Task C/D consistency**: Using identical text in discovery and general-project skills ensures consistent UX
4. **Pre-implementation audit**: Scope cap (max 8 skills) prevented scope creep; actual audit found only 2 skills needed updates

## What Could Improve

1. **Documentation gap**: general-project not in `.agents/sources/guide/skills-index.md` — ✅ Fixed in post-review
2. **Path references in skills**: Used absolute build-time paths instead of relative paths — ✅ Fixed, LEARNINGS.md created
3. **QMD consistency deferred**: 3 skills still use `qmd update` instead of `arete index` (finalize-project, periodic-review, synthesize) — not touched, deferred to follow-up

## Engineering Lead Review

**Verdict**: ITERATE → APPROVED after fixes

**Blocking issue found**: Skills referenced PATTERNS.md with absolute paths (`packages/runtime/skills/PATTERNS.md`) instead of relative paths (`../PATTERNS.md`). This would break in installed user workspaces.

**Fix applied**: Updated discovery/SKILL.md and general-project/SKILL.md to use relative markdown links.

**LEARNINGS.md created**: `packages/runtime/skills/LEARNINGS.md` documents the relative path requirement for cross-skill references.

## Subagent Insights

- Developer agents consistently reported ~2-5K tokens per task (small, focused tasks)
- Reference files (discovery/SKILL.md, capture-conversation/SKILL.md) were consistently cited as most helpful
- Task prompts with exact content to add (template structures, standard phrases) resulted in zero iterations

## Recommendations

1. **Continue**: 
   - Pre-mortem before PRD execution — 100% effective in this PRD
   - Detailed task prompts with exact content/format
   - Reviewer pre-work sanity checks (caught issues early)

2. **Start**: 
   - Add documentation gap check to holistic review checklist
   - Consider auto-generating skills-index.md from runtime/skills/

3. **Follow-up work**:
   - Add general-project to `.agents/sources/guide/skills-index.md`
   - Standardize qmd update → arete index (tiny task)
