---
title: "Cross-Area Synthesis: LLM-Powered Area Memory Connections"
slug: cross-area-synthesis
status: completed
size: small
tags: [area-memory, synthesis, llm, memory]
created: "2026-04-06T00:00:00.000Z"
updated: "2026-04-06T00:00:00.000Z"
completed: "2026-04-06T12:00:00.000Z"
execution: null
has_review: true
has_pre_mortem: true
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

### Resolved decisions

1. **LLM integration pattern**: Use function injection via method options — add `callLLM?: LLMCallFn` to `RefreshAllAreaMemoryOptions`. The CLI creates the wrapper (`async (prompt) => (await services.ai.call('synthesis', prompt)).text`) and passes it in. This follows the established pattern from `EntityService.refreshPersonMemory()` documented in `packages/core/src/services/LEARNINGS.md`. No constructor changes to `AreaMemoryService`.

2. **Token budget**: No budget controls needed for v1. At typical workspace scale (3-8 areas), combined area content is ~5-20K tokens — well under model context limits. The codebase uses char-based budgets elsewhere (e.g., `MAX_EXCLUSION_CHARS` in meeting extraction) if needed later.

3. **Incremental vs full**: Full refresh every time. This matches the existing `refreshAllAreaMemory()` pattern (unconditional iteration, time-based staleness). Cross-area connections are inherently relational — can't incrementally detect connections without considering all areas. Incremental optimization (content hashing) deferred until >15 areas or >10s refresh times.

---

## Critical Files

| File | Role |
|------|------|
| `packages/core/src/services/area-memory.ts` | Add `synthesizeCrossArea()` method |
| `packages/core/test/services/area-memory.test.ts` | Tests for synthesis |
| `.arete/memory/areas/_synthesis.md` | **Output** — cross-area synthesis file |
| `packages/cli/src/commands/intelligence.ts` | Wire synthesis into `arete memory refresh` CLI command |

---

## Plan

### Step 1 — Collect cross-area data and build LLM prompt

**Before starting**: Read `packages/core/src/services/area-memory.ts` in full (especially `refreshAllAreaMemory()`, `computeAreaData()`, and `renderAreaMemory()`). Read 2-3 existing area memory output files in a real workspace if available, to understand the actual data shape.

Add a new method `synthesizeCrossArea(workspacePaths, options)` to `AreaMemoryService`:

1. After `refreshAllAreaMemory()` completes, read all generated area memory files from `.arete/memory/areas/` (excluding `_synthesis.md`)
2. Build a structured prompt that includes all area summaries and asks the LLM to identify:
   - **Cross-area connections** — decisions, commitments, or people that bridge areas. For each: what the connection is, why it matters, and which areas it touches.
   - **Dependencies & blockers** — open work in one area that depends on or is blocked by work in another area.
   - **Convergence signals** — areas trending toward the same topic/problem from different angles.
   - **Attention items** — things that look like they need coordination across areas but may not be getting it.
3. The prompt should instruct the LLM to be **specific and evidence-based** — cite the actual commitments, decisions, and people rather than generic observations. If there are no meaningful connections, say so (don't fabricate).

**LLM integration**: Accept `callLLM?: LLMCallFn` in options. Follow the function injection pattern from `EntityService.refreshPersonMemory()` — the CLI creates the wrapper via `services.ai.call('synthesis', prompt)` and passes it in. If `callLLM` is not provided, skip synthesis silently.

**AC**:
- `synthesizeCrossArea()` method exists and accepts `{ callLLM?: LLMCallFn }` in options
- Prompt passed to `callLLM` contains all area names and area file content
- LLM response is returned (not parsed structurally — treated as opaque markdown per pre-mortem Risk #1)
- When `callLLM` is not provided, method returns early with no side effects
- Unit test with mocked area files and mocked `callLLM` verifies: (1) prompt contains all area names and content, (2) response returned for caller to write, (3) `callLLM` not provided → no call made
- `npm run typecheck && npm test` pass

---

### Step 2 — Write synthesis output and integrate into refresh flow

**Before starting**: Read how `renderAreaMemory()` formats output and how `refreshAllAreaMemory()` is called from the CLI (`packages/cli/src/commands/intelligence.ts`). Check how `listAreaMemoryStatus()` (lines 434-448) discovers area files to ensure `_synthesis.md` won't pollute area listings.

1. Write the LLM response into `.arete/memory/areas/_synthesis.md` wrapped in standard frontmatter:
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
2. Call `synthesizeCrossArea()` at the end of `refreshAllAreaMemory()` — only when refreshing all areas (not single-area refresh) and only when `callLLM` is provided in options
3. The `_` prefix in the filename distinguishes it from individual area files
4. Ensure `listAreaMemoryStatus()` excludes files starting with `_` so `_synthesis.md` doesn't appear as an area in `arete status` counts
5. Synthesis file is already searchable via QMD (it's in the same directory)

**AC**:
- `refreshAllAreaMemory()` calls `synthesizeCrossArea()` when `callLLM` is provided and refreshing all areas; skips when `callLLM` absent or single-area refresh
- Synthesis file written to `.arete/memory/areas/_synthesis.md` with YAML frontmatter (`type`, `last_refreshed`, `areas_analyzed`) and LLM response body
- `listAreaMemoryStatus()` excludes `_synthesis.md` — `arete status` area count unchanged after synthesis
- If `callLLM` throws, error is logged as warning and `refreshAllAreaMemory` still returns success (no `_synthesis.md` written on failure)
- Test verifies `refreshAllAreaMemory` calls `synthesizeCrossArea` when `callLLM` provided and skips when not
- `npm run typecheck && npm test` pass

---

### Step 3 — CLI output and staleness

**Before starting**: Read how `arete memory refresh` currently reports results (`packages/cli/src/commands/intelligence.ts`) and how `arete status` reports stale areas (`packages/cli/src/commands/status.ts`).

1. In `intelligence.ts`, only create and pass `callLLM` when `services.ai.isConfigured()` returns true. When AI is not configured, skip synthesis silently.
2. Update `arete memory refresh` output to show synthesis results:
   ```
   Area memory refreshed: 4 areas updated, 0 skipped
   Cross-area synthesis: updated
   ```
   Or when skipped: `Cross-area synthesis: skipped (no AI configured)`
3. Update `--json` output to include `synthesis: { updated: boolean }` (or `synthesis: { skipped: true, reason: string }` when skipped)
4. Update `arete status` to show synthesis staleness alongside area staleness
5. If synthesis fails (LLM error, no areas, etc.), log a warning but don't fail the overall refresh — individual area files are still valuable on their own

**AC**:
- CLI checks `services.ai.isConfigured()` before creating `callLLM` wrapper
- CLI output includes synthesis line (`Cross-area synthesis: updated` or `Cross-area synthesis: skipped (no AI configured)`)
- `--json` output includes `synthesis: { updated: boolean }` field
- `arete status` shows synthesis freshness when `_synthesis.md` exists
- If `callLLM` throws, error logged as warning, refresh still succeeds, CLI shows `Cross-area synthesis: failed (see warning above)`
- CLI output changes verified manually (express track)
