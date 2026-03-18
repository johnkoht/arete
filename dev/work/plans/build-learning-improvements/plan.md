---
title: Build Learning Improvements
slug: build-learning-improvements
status: idea
size: unknown
tags: []
created: 2026-03-16T15:02:17.946Z
updated: 2026-03-17T03:59:27.692Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

Let me give you my recommendations based on what I've seen work well in the codebase:

## My Recommendations

### 1. Synthesis Timing: Hybrid Approach

**During work**: Developers write directly (low friction, context is fresh)
**End of PRD**: Orchestrator does a light review pass during close-out (catches errors, consolidates)
**Periodic**: Manual deep synthesis command when memory gets cluttered (monthly or after major projects)

This mirrors how the current system works — developers update LEARNINGS.md during work, orchestrator verifies during close-out.

### 2. Memory Scope: Active + Synthesized

```markdown
## Active (Last 30 Days)
[Recent, specific learnings — added by developers]

## Synthesized
[Distilled wisdom from older learnings — condensed, durable patterns]
```

This gives you the best of both:
- **Active section** decays naturally (old entries get trimmed or moved)
- **Synthesized section** preserves durable wisdom in condensed form

The 30-day window prevents staleness while synthesis preserves important learnings.

### 3. Write Authority: Direct + Optional Review

Developers write directly (keeps friction low). Orchestrator reviews during close-out and can provide feedback or consolidate entries. No blocking gate — that would slow things down too much.

---

Now let me shape a concrete plan. I'm thinking **Phase 1 MVP** that we can ship and learn from:

## Plan:

**Size**: Medium (4 steps)

1. **Create Domain Memory Structure**
   - Add `MEMORY.md` to each expertise domain (`core`, `cli`, `backend`, `web`)
   - Template with: Active (30 Days), Synthesized, Open Questions sections
   - Seed with a few entries from recent PRD learnings (so it's not empty)
   - AC: All 4 domain MEMORY.md files exist with template + seed content

2. **Update Developer Agent to Use Domain Memory**
   - Developer loads domain MEMORY.md during "Understand the Task" phase
   - Developer writes to domain MEMORY.md before completing (new Step 5.5)
   - Update completion report format to include "Domain Memory Updated" section
   - AC: Developer.md updated with loading and writing instructions

3. **Strengthen Reflection Prompts in Execute-PRD**
   - Replace weak "What helped?" prompt with structured questions:
     - What surprised you?
     - What would bite the next person?
     - What pattern should be reused?
     - What assumption was wrong?
   - AC: Execute-PRD skill has updated reflection prompt template

4. **Add Orchestrator Domain Memory Review to Close-Out**
   - During holistic review (Step 16), orchestrator scans domain memory entries from this PRD
   - Checks for accuracy, consolidates duplicates, moves stale items to Synthesized
   - Add to done-done checklist: "Domain memory entries reviewed"
   - AC: Orchestrator.md and execute-prd skill updated with domain memory review step

---

**Out of Scope (Phase 2)**:
- Automated decay (manual for now)
- Deep synthesis command (`arete memory synthesize --domain core`)
- Cross-domain pattern detection
- Memory search within domain memory

---

**Risks I see**:
- Developers might not write to domain memory (friction, forgetting)
- Memory could get cluttered without active maintenance
- Multiple developers writing could create duplicates

These feel manageable for MVP. We'll learn from real usage.

Does this plan feel right? Given it's 4 steps with some interconnected changes, I'd recommend running `/pre-mortem` before we build.