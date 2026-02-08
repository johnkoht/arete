# Product OS Architecture Direction

**Date**: 2026-02-07
**Branch**: `feature/product-os-architecture`

## What changed

Defined a new architectural direction for Areté: evolving from a skill-centric PM workspace to a **product intelligence operating system**.

## Key decisions

1. **Five product primitives**: Problem, User, Solution, Market, Risk. These are the irreducible building blocks of any product. Everything else (insights, decisions, outcomes, constraints, goals, stakeholders) is either a property of these, context around them, or a work artifact. Primitives are a knowledge model the intelligence layer reasons about — not folders or workflow stages.

2. **Intelligence layer over skill library**: The value shifts from "we have great skills" to "we make any skill dramatically more effective through context injection, memory retrieval, entity resolution, and synthesis." Skills are methods, not the product.

3. **Workspace restructure**:
   - New `now/` folder: weekly priorities, daily focus, scratchpad. "Where do I start my day?"
   - New `goals/` folder: strategy, quarterly goals, initiatives. Elevated from `context/goals-strategy.md` and `resources/plans/`.
   - `memory/` moves to `.arete/memory/`: system-managed, consumed via intelligence layer.
   - `people/` stays top-level.

4. **Adapter pattern for skills**: Areté prepares a primitive briefing before any skill (default or third-party) and captures output after. Third-party skills from skills.sh benefit from Areté's intelligence without knowing its internals.

5. **Project templates by work type**: Discovery, definition, delivery, analysis. Tailored structures with lightweight phase guides. Intelligence-powered kickoff in later phase.

6. **Initiatives as lightweight entries in goals/**: Strategic bets that projects reference. No separate management layer.

## Why

- Skills are being commoditized (skills.sh has 200+ skills). Competing on procedures is a losing game.
- Product work is messy and contextual — the intelligence layer is what threads it together.
- The current 18 skills are already more intelligence than procedure (meeting-prep, process-meetings, synthesize).
- The primitives model gives Areté a conceptual framework for understanding product knowledge across any workflow.

## Artifacts

- Vision document: `.cursor/build/prds/product-os/vision.md`
- Plan: `.cursor/plans/areté_intelligence_layer_cc853e91.plan.md`

## Execution

Phased: Document (Phase 0) → Workspace restructure (Phase 1) → Skill refactoring (Phase 2) → Intelligence services (Phase 3) → Ecosystem (Phase 4).
