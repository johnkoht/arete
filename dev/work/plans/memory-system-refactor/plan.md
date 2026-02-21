---
title: Memory System Refactor
slug: memory-system-refactor
status: idea
size: large
created: 2026-02-21T03:30:00.000Z
updated: 2026-02-21T03:30:00.000Z
steps: 0
---

# Memory System Refactor

## Context

This is a future plan to be scoped AFTER `agent-learning-quick-wins` has been running and we have signal on what works.

The quick-wins plan adds LEARNINGS.md files (component-specific knowledge) and auto-injects collaboration.md. It deliberately does NOT touch the memory entry system. This plan addresses the entry system itself.

## Problem (to be validated after quick-wins)

The current memory entry system (`memory/entries/`, `memory/MEMORY.md` index, `synthesize-collaboration-profile` skill, `prd-post-mortem` writing entries) may be:
- Over-engineered for what agents actually use
- Write-only in practice (entries written but rarely read)
- Maintenance burden (skills, rules, index all need upkeep)

OR it may be fine now that collaboration.md is auto-injected and LEARNINGS.md captures component knowledge. We won't know until quick-wins has been running.

## Ideas to Evaluate

1. **Simplify entries** — Do we still need per-feature structured entries, or is the daily log pattern (append-only, date-based) sufficient?

2. **Auto-summarization on session exit** — Borrow from pi-memory's pattern: use the LLM to summarize the session and append to a daily log. Reduces manual entry writing.

3. **qmd integration for LEARNINGS.md** — Index all LEARNINGS.md files into a qmd collection so the auto-injection extension can semantically search them on `before_agent_start` and inject relevant component learnings based on the user's prompt. This is the key automation gap from quick-wins: LEARNINGS.md is rule-based (agents must choose to read it), while qmd injection would make it automatic.

4. **Richer pi extension** — Expand the auto-injection extension to also:
   - Auto-summarize sessions on exit
   - Search LEARNINGS.md via qmd and inject relevant ones per turn
   - Provide `memory_search` and `memory_write` tools (like pi-memory but project-local)

5. **Adopt pi-memory with configurable paths** — If pi-memory adds project-scoped storage (configurable base directory), it becomes viable. Worth monitoring or contributing the feature.

6. **Trim the entry system** — Keep entries but stop indexing in MEMORY.md. Let qmd handle discovery instead of a manual index.

7. **GUIDE mode memory** — Separately evaluate whether GUIDE mode users need better memory (MCP server, pi adoption, or improved agent-memory.mdc rules).

## Decision Criteria

Before planning this:
- [ ] Quick-wins plan has been running for 2+ weeks
- [ ] We have signal on whether LEARNINGS.md is actually being read/updated
- [ ] We have signal on whether auto-injected collaboration.md reduces regressions
- [ ] We know whether the entry system is still providing value or just accumulating

## References

- Quick-wins plan: `dev/work/plans/agent-learning-quick-wins/plan.md`
- Original exploration: `dev/work/plans/agent-learning-improvements/` (plan, pre-mortem, eng lead review, orchestrator review)
- pi-memory source analysis: reviewed 2026-02-20 (see conversation history)
- Other extensions evaluated: pi-extension-observational-memory, @momomemory/pi-momo, pi-memory-md
