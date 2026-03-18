# Build Learning Improvements — Notes

## Problem Statement

During `/build` and `/ship`, agents are not effectively learning and documenting. While instructions exist across multiple files, the actual capture of learnings is:
- Reactive (reviewer blocks) rather than proactive
- Scattered across component-level LEARNINGS.md files
- Not domain-scoped (no "what has core learned recently?")
- Lost when sessions end

**Root causes identified:**
1. Instructions are aspirational, not procedural (no forcing function)
2. Developer reflection prompts are weak ("What helped?" → shallow answers)
3. Documentation happens at end, not during (context erodes)
4. No domain-level memory that persists across sessions

---

## Vision: Domain Agents That Learn

> "The idea is that each core agent that spawns is like a single agent, learning, anticipating, and growing."

Each specialized agent (core, cli, backend, web) should:
1. **Remember** — Load domain-specific learnings from past sessions
2. **Learn** — Capture discoveries during work
3. **Anticipate** — Use patterns to prevent repeated mistakes
4. **Grow** — Accumulate wisdom over time

---

## Key Decisions Made

### 1. Synthesis Timing: Hybrid Approach
- **During work**: Developers write directly (low friction, context fresh)
- **End of PRD**: Orchestrator light review pass (catches errors, consolidates)
- **Periodic**: Manual deep synthesis when memory gets cluttered

### 2. Memory Scope: Active + Synthesized
```markdown
## Active (Last 30 Days)
[Recent, specific learnings — added by developers]

## Synthesized
[Distilled wisdom from older learnings — condensed, durable patterns]
```
30-day window prevents staleness; synthesized section preserves durable wisdom.

### 3. Write Authority: Direct + Optional Review
Developers write directly (low friction). Orchestrator reviews during close-out. No blocking gate.

### 4. Relationship to Existing Memory
- `memory/entries/` = project history ("what we built")
- Domain `MEMORY.md` = domain wisdom ("what we learned about core")

---

## Proposed Structure

```
.pi/expertise/
  core/
    PROFILE.md           # Static architecture (exists)
    MEMORY.md            # Domain-level cumulative learnings (NEW)
  cli/
    PROFILE.md
    MEMORY.md
  backend/
    PROFILE.md
    MEMORY.md
  web/
    PROFILE.md
    MEMORY.md
```

**MEMORY.md Template:**
```markdown
# {Domain} Domain Memory

> Accumulated learnings from {domain}-touching work. Read before starting; update before completing.

## Active (Last 30 Days)

[Recent patterns, corrections, discoveries — added by developers]

## Synthesized

[Distilled wisdom from older learnings — condensed by orchestrator]

## Open Questions

[Unresolved questions that future work might answer]
```

---

## Plan (Medium — 4 Steps)

### Step 1: Create Domain Memory Structure
- Add `MEMORY.md` to each expertise domain (`core`, `cli`, `backend`, `web`)
- Template with: Active (30 Days), Synthesized, Open Questions sections
- Seed with a few entries from recent PRD learnings (so it's not empty)
- **AC**: All 4 domain MEMORY.md files exist with template + seed content

### Step 2: Update Developer Agent to Use Domain Memory
- Developer loads domain MEMORY.md during "Understand the Task" phase
- Developer writes to domain MEMORY.md before completing (new Step 5.5)
- Update completion report format to include "Domain Memory Updated" section
- **AC**: Developer.md updated with loading and writing instructions

### Step 3: Strengthen Reflection Prompts in Execute-PRD
- Replace weak "What helped?" prompt with structured questions:
  - What surprised you?
  - What would bite the next person?
  - What pattern should be reused?
  - What assumption was wrong?
- **AC**: Execute-PRD skill has updated reflection prompt template

### Step 4: Add Orchestrator Domain Memory Review to Close-Out
- During holistic review (Step 16), orchestrator scans domain memory entries from this PRD
- Checks for accuracy, consolidates duplicates, moves stale items to Synthesized
- Add to done-done checklist: "Domain memory entries reviewed"
- **AC**: Orchestrator.md and execute-prd skill updated with domain memory review step

---

## Out of Scope (Phase 2)

- Automated decay (manual for now)
- Deep synthesis command (`arete memory synthesize --domain core`)
- Cross-domain pattern detection
- Memory search within domain memory

---

## Identified Risks

1. **Friction risk**: Developers might not write to domain memory
2. **Clutter risk**: Memory could get cluttered without active maintenance
3. **Duplication risk**: Multiple developers writing could create duplicates

These feel manageable for MVP. We'll learn from real usage.

---

## Files That Will Change

1. `.pi/expertise/core/MEMORY.md` (create)
2. `.pi/expertise/cli/MEMORY.md` (create)
3. `.pi/expertise/backend/MEMORY.md` (create)
4. `.pi/expertise/web/MEMORY.md` (create)
5. `.pi/agents/developer.md` (update Steps 1 and 5)
6. `.pi/agents/orchestrator.md` (update Section 6 done-done)
7. `.pi/skills/execute-prd/SKILL.md` (update reflection prompt template, Phase 3 close-out)

---

## Next Steps (When Returning)

1. Run `/pre-mortem` to identify risks before building
2. Consider `/prd` for autonomous execution given 4 interconnected steps
3. Or `/approve` and `/build` directly if comfortable

---

## Current State Reference

**Existing LEARNINGS.md files** (16 total):
- `packages/core/src/services/LEARNINGS.md`
- `packages/core/src/search/LEARNINGS.md`
- `packages/core/src/integrations/LEARNINGS.md`
- `packages/core/src/adapters/LEARNINGS.md`
- `packages/cli/src/commands/LEARNINGS.md`
- `packages/apps/backend/LEARNINGS.md`
- `packages/apps/web/LEARNINGS.md`
- `.pi/skills/execute-prd/LEARNINGS.md`
- `.pi/extensions/plan-mode/LEARNINGS.md`
- And more...

**Existing expertise profiles**:
- `.pi/expertise/core/PROFILE.md` — Architecture, services, invariants
- `.pi/expertise/cli/PROFILE.md` — Commands, formatters
- `.pi/expertise/backend/PROFILE.md` — Backend patterns
- `.pi/expertise/web/PROFILE.md` — Web app patterns

**Key files for reference**:
- `.pi/standards/maintenance.md` — Current learning protocol
- `.pi/agents/developer.md` — Developer agent definition
- `.pi/agents/orchestrator.md` — Orchestrator agent definition
- `.pi/skills/execute-prd/SKILL.md` — PRD execution workflow
