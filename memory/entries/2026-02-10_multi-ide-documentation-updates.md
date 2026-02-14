# Multi-IDE Documentation Updates

**Date**: 2026-02-10  
**Scope**: User-facing docs + self-guided-onboarding backlog

## Summary

Updated documentation to reflect multi-IDE support (`arete install --ide claude` for Claude Code, `--ide cursor` default for Cursor).

## Changes

### README.md
- Positioning: "Cursor-native" → "workspace for Cursor and Claude Code"
- Use This Template: Added note for Claude users
- Structure: `.cursor/ or .claude/` with `.agents/skills/`; IDE-dependent paths
- Documentation: IDE-appropriate paths, `arete install --ide claude` note

### SETUP.md
- Overview: "for Cursor" → "for Cursor and Claude Code"
- Workspace structure: Intro on IDE config dir; diagram shows both variants
- **New section**: "Choosing Your IDE" — install commands, `ide_target`, status warning
- Customizing Skills: `.cursor/skills-core/` → `.agents/skills/`; removed override/reset (per repo reorganization)
- Architecture: Skills at `.agents/skills/`; tools at `.cursor/` or `.claude/`
- Quick Start: Added `./arete install --ide claude` example
- Troubleshooting: "Rules not loading (Claude Code)" entry

### AGENTS.md
- Context: Source of truth paths for both Cursor and Claude
- CLI: `arete install --ide cursor|claude`
- Config: `ide_target` field and adapter behavior
- Rules table: Both IDE paths

### ONBOARDING.md
- Next Steps: `.cursor/skills/` → `.agents/skills/`
- Multi-IDE note: Open in Claude Code if installed with `--ide claude`

### dev/backlog/features/self-guided-onboarding.md
- Task 12: IDE-aware doc requirements
- Related: Tools path depends on `ide_target`; ONBOARDING references `arete install --ide`
- Open Questions: New item 7 — Multi-IDE support

## Learnings

- Doc plans should explicitly include ONBOARDING, backlog items with doc tasks, and path audits across all user-facing docs (see `dev/entries/2026-02-10_planning-improvement-prompt.md`).
