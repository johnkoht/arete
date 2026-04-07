---
title: "Cross-Area Synthesis: LLM-Powered Area Memory Connections"
slug: cross-area-synthesis
status: draft
size: small
tags: [area-memory, synthesis, llm, memory]
created: "2026-04-06T00:00:00.000Z"
updated: "2026-04-06T00:00:00.000Z"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---

# Cross-Area Synthesis: LLM-Powered Area Memory Connections

## Context

Area memory currently computes each area in isolation — `refreshAreaMemory()` reads one area's commitments, meetings, and decisions, writes one summary file. There's no step where areas are compared, so cross-cutting insights are invisible:

- A decision in Engineering that impacts a Product commitment
- The same person bridging two areas with related open work
- Keyword/topic overlap suggesting areas are converging on the same problem
- Stalled work in one area blocking progress in another

These connections are exactly what a PM needs to see but can't easily spot when heads-down in one area. An LLM is the right tool here — pattern matching across areas requires reasoning about intent and impact, not just string matching.

**Inspiration:** Karpathy's "compiled wiki" pattern where the LLM maintains cross-references and discovers connections across the knowledge base.

### What exists today

- `AreaMemoryService.refreshAllAreaMemory()` iterates all areas and writes individual `.arete/memory/areas/{slug}.md` files
- Each area file contains: keywords, active people, open work, recently completed, recent decisions
- Area files are searchable via QMD (`arete context --for`)
- No cross-area comparison exists anywhere in the codebase

---

## Critical Files

| File | Role |
|------|------|
| `packages/core/src/services/area-memory.ts` | Add `synthesizeCrossArea()` method |
| `packages/core/test/services/area-memory.test.ts` | Tests for synthesis |
| `.arete/memory/areas/_synthesis.md` | **Output** — cross-area synthesis file |
| `packages/cli/src/commands/memory.ts` | Wire synthesis into `arete memory refresh` |

---

## Plan

### Step 1 — Collect cross-area data and build LLM prompt

**Before starting**: Read `packages/core/src/services/area-memory.ts` in full (especially `refreshAllAreaMemory()`, `computeAreaData()`, and `renderAreaMemory()`). Read 2-3 existing area memory output files in a real workspace if available, to understand the actual data shape.

Add a new method `synthesizeCrossArea(workspacePaths)` to `AreaMemoryService`:

1. After `refreshAllAreaMemory()` completes, read all generated area memory files from `.arete/memory/areas/`
2. Build a structured prompt that includes all area summaries and asks the LLM to identify:
   - **Cross-area connections** — decisions, commitments, or people that bridge areas. For each: what the connection is, why it matters, and which areas it touches.
   - **Dependencies & blockers** — open work in one area that depends on or is blocked by work in another area.
   - **Convergence signals** — areas trending toward the same topic/problem from different angles.
   - **Attention items** — things that look like they need coordination across areas but may not be getting it.
3. The prompt should instruct the LLM to be **specific and evidence-based** — cite the actual commitments, decisions, and people rather than generic observations. If there are no meaningful connections, say so (don't fabricate).

**LLM integration pattern**: Follow whatever pattern the codebase uses for other LLM calls in core services. If core services don't currently call LLMs directly, check how skills or other services handle it and discuss the integration approach before proceeding.

**AC**: Method exists, builds prompt from real area data, calls LLM. Unit test with mocked area files and mocked LLM response verifies prompt construction and response parsing.

---

### Step 2 — Write synthesis output and integrate into refresh flow

**Before starting**: Read how `renderAreaMemory()` formats output and how `refreshAllAreaMemory()` is called from the CLI.

1. Parse the LLM response into a structured synthesis document written to `.arete/memory/areas/_synthesis.md`:
   ```markdown
   ---
   type: cross-area-synthesis
   last_refreshed: "2026-04-06T..."
   areas_analyzed: [engineering, product, sales]
   ---

   # Cross-Area Synthesis

   > Auto-generated connections across area memories. Refreshed by `arete memory refresh`.

   ## Connections
   - **Engineering ↔ Product**: [specific connection with evidence]

   ## Dependencies
   - [specific dependency with commitment/decision references]

   ## Attention
   - [items needing cross-area coordination]
   ```
2. Call `synthesizeCrossArea()` at the end of `refreshAllAreaMemory()` (only when refreshing all areas, not single-area refresh)
3. The `_` prefix in the filename distinguishes it from individual area files
4. Synthesis file is already searchable via QMD (it's in the same directory)

**AC**: `arete memory refresh` produces individual area files AND a `_synthesis.md` file. The synthesis file contains specific, evidence-based connections referencing actual data from the area files.

---

### Step 3 — CLI output and staleness

**Before starting**: Read how `arete memory refresh` currently reports results and how `arete status` reports stale areas.

1. Update `arete memory refresh` output to show synthesis results:
   ```
   Area memory refreshed: 4 areas updated, 0 skipped
   Cross-area synthesis: 3 connections, 1 dependency, 1 attention item
   ```
2. Update `arete status` to show synthesis staleness alongside area staleness
3. If synthesis fails (LLM error, no areas, etc.), log a warning but don't fail the overall refresh — individual area files are still valuable on their own

**AC**: CLI output includes synthesis summary. `arete status` shows synthesis freshness. LLM failure degrades gracefully.

---

## Open Questions

1. **LLM integration in core**: Does `AreaMemoryService` currently have access to an LLM client? If not, what's the preferred pattern — inject it as a dependency, or have the CLI layer orchestrate (call refresh, then call a separate synthesis function that has LLM access)? This affects Step 1 architecture.
2. **Token budget**: With many areas, the combined area memory content could be large. Should we cap the prompt size or summarize areas before sending? At typical workspace scale (3-8 areas) this is probably fine.
3. **Incremental synthesis**: Should synthesis be incremental (only re-analyze areas that changed since last synthesis) or always full? Full is simpler and correct. Incremental is an optimization for later.
