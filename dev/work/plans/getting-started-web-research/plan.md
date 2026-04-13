---
title: Getting Started Web Research Enhancement
slug: getting-started-web-research
status: approved
size: medium
has_pre_mortem: true
has_review: true
has_prd: true
created: 2026-04-11
---

# Getting Started Web Research Enhancement

Enhance the `getting-started` skill so the agent proactively researches the user's company via web search before asking onboarding questions. This replaces the old generic Q&A flow with a research-first approach that asks smarter, targeted questions.

## Changes

1. **Rewrite getting-started/SKILL.md** — New 8-phase flow: profile check, consent, web research, present findings, draft & review, integration scavenge, first win, graduation
2. **Update rapid-context-dump/SKILL.md** — Add pre-researched context as 5th input type
3. **Update GUIDE.md** — Replace "First 15 Minutes" with "First 30 Minutes"
4. **Update skills-index.md** — Update description for getting-started
5. **Regenerate dist/AGENTS.md** — Via build script
6. **Create LEARNINGS.md** — Document WebSearch/WebFetch patterns

## Risk Assessment

- **Low risk**: All changes are prompt/markdown only — no TypeScript, no tests, no compilation
- **No breaking changes**: Triggers and frontmatter metadata preserved
- **Graceful degradation**: Full fallback ladder for web search failures
