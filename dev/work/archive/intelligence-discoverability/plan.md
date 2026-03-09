---
title: "Intelligence Discoverability for Skill Authors & Agents"
slug: intelligence-discoverability
status: complete
size: medium
tags: [documentation, intelligence, skills, discoverability]
created: 2026-03-03T02:46:00Z
updated: 2026-03-03T03:30:00Z
completed: 2026-03-03T03:30:00Z
execution: direct
has_review: true
has_pre_mortem: true
has_prd: true
steps: 5
---

# Intelligence Discoverability for Skill Authors & Agents

## Goal

Make Areté's intelligence layer discoverable for custom skill authors and proactively used by agents through documentation, guidance, and strengthened rules.

## Problem

1. Custom skill authors don't know intelligence services exist — "Creating Your Own Skills" was 4 lines with no mention of context, briefing, memory, or people services.
2. AGENTS.md lists intelligence services as a reference table but doesn't tell agents when to proactively reach for them.
3. `requires_briefing: true` exists as frontmatter but the pm-workspace rule's instruction wasn't strong enough.

## Steps

1. Create skill authoring guide with 6 copy-paste intelligence recipes
2. Update AGENTS.md intelligence section with high-value patterns and proactive guidance
3. Update CLI commands with Intelligence Quick Reference and scope descriptions
4. Strengthen `requires_briefing` to MUST in pm-workspace rule
5. Expand Skills README "Creating Your Own Skills" with guide links and frontmatter reference

## Outcome

All 5 tasks completed. Docs-only change, +514/-80 lines, 13 files. Key discovery: `compressIntelligence()` in build-agents.ts is hardcoded — documented in `scripts/LEARNINGS.md`.

## Note

Plan was created retroactively. The original execution skipped the formal plan step and went directly to PRD creation — see memory entry `2026-03-03_intelligence-discoverability.md` for the full learning.
