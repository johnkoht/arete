# Consolidate Quarter Goals Format

**Date**: 2026-04-03
**Scope**: 6 runtime skills + 1 template + PATTERNS.md
**Type**: Simplification / format migration

## Summary

Reversed the individual goal files approach (from 2026-03-19 goals-refactor) back to a single `goals/quarter.md`. The individual file format with per-goal YAML frontmatter (`id`, `title`, `orgAlignment`, `successCriteria`, etc.) was over-engineered for the use case. Simple markdown headings with Area/Success/Status fields are sufficient.

## Changes

| File | What Changed |
|------|-------------|
| `goals-alignment/SKILL.md` | Reads `goals/quarter.md` as primary. Removed individual file parsing, `orgAlignment` field, Goal File Frontmatter section. Org alignment now inferred by matching against `goals/strategy.md` pillars. |
| `week-plan/SKILL.md` | Reads `goals/quarter.md`. Removed `goals/*.md` glob, frontmatter parsing, fallback logic. |
| `week-review/SKILL.md` | Reads `goals/quarter.md`. Removed individual file refs, frontmatter parsing, Goal File Frontmatter section. |
| `quarter-plan/SKILL.md` | Output is single `goals/quarter.md`. Removed `goals/YYYY-Qn-N-title-slug.md` format, per-goal YAML frontmatter, migration section, template command reference. |
| `prepare-meeting-agenda/SKILL.md` | Reads `goals/quarter.md`. Removed individual file glob, frontmatter parsing, Goal File Frontmatter section. |
| `daily-winddown/SKILL.md` | Updated `goals/*.md` references to `goals/quarter.md` (3 locations). |
| `quarter-plan/templates/quarter-goals.md` | Rewrote from per-goal YAML frontmatter template to single-file markdown format. |
| `PATTERNS.md` | Updated `goals/*.md` reference to `goals/quarter.md` in contextual_memory_search pattern. |

## New Quarter Goals Format

```markdown
---
quarter: "2026-Q1"
status: active
---
# Q1 2026 Goals

## Goal Title
- **Area**: [Area Name](../areas/area-slug.md)
- **Success**: Measurable criteria
- **Status**: Active
```

## Learnings

- The individual goal files approach added complexity (frontmatter parsing, glob patterns, fallback logic, migration tooling) without proportional value for a single-user PM tool.
- `goals/strategy.md` remains unchanged — org alignment is inferred by matching goals against strategy pillars rather than explicit `orgAlignment` YAML fields.
