# Cross-Area Synthesis PRD

## Goal

Add LLM-powered cross-area synthesis to area memory, enabling the system to identify connections, dependencies, and convergence signals across areas that are invisible when each area is computed in isolation.

## Tasks

### Task 1: Collect cross-area data and build LLM prompt

**Description**: Add a `synthesizeCrossArea(workspacePaths, options)` method to `AreaMemoryService` that reads all generated area memory files, builds a structured prompt, and calls an LLM to identify cross-area connections.

**Before starting**: Read `packages/core/src/services/area-memory.ts` in full. Read the `LLMCallFn` pattern from `packages/core/src/services/person-signals.ts`.

**Critical files**:
- `packages/core/src/services/area-memory.ts`
- `packages/core/test/services/area-memory.test.ts`

**Acceptance Criteria**:
- `synthesizeCrossArea()` method exists and accepts `{ callLLM?: LLMCallFn }` in options
- `LLMCallFn` type exported from `area-memory.ts`
- `buildSynthesisPrompt()` helper exported for testing
- Prompt passed to `callLLM` contains all area names and area file content
- LLM response is returned as opaque markdown (not parsed structurally)
- When `callLLM` is not provided, method returns null with no side effects
- When no area files exist, method returns null
- `_`-prefixed files excluded from synthesis input
- Unit tests: prompt contains all area names/content, response returned, callLLM absent = no call, _-prefixed files excluded
- `npm run typecheck && npm test` pass

---

### Task 2: Write synthesis output and integrate into refresh flow

**Description**: Wire `synthesizeCrossArea()` into `refreshAllAreaMemory()`, write output to `_synthesis.md`, and ensure `listAreaMemoryStatus()` excludes it.

**Before starting**: Read how `refreshAllAreaMemory()` is called from `packages/cli/src/commands/intelligence.ts`. Check `listAreaMemoryStatus()` to confirm it won't include `_synthesis.md`.

**Critical files**:
- `packages/core/src/services/area-memory.ts`
- `packages/core/test/services/area-memory.test.ts`

**Acceptance Criteria**:
- `refreshAllAreaMemory()` accepts `callLLM` via options and calls `synthesizeCrossArea()` when provided and refreshing all areas (not single-area)
- Synthesis file written to `.arete/memory/areas/_synthesis.md` with YAML frontmatter (`type`, `last_refreshed`, `areas_analyzed`) and LLM response body
- `RefreshAreaMemoryResult` extended with `synthesis?: { updated: boolean; areasAnalyzed: string[] }`
- `listAreaMemoryStatus()` excludes `_synthesis.md` (already based on `areaParser.listAreas()`, verify no change needed)
- If `callLLM` throws, error is logged as warning and `refreshAllAreaMemory` still returns success (no `_synthesis.md` written)
- Tests verify: synthesis called when callLLM provided, skipped when absent, skipped on single-area refresh, file written with frontmatter, error handling
- `npm run typecheck && npm test` pass

---

### Task 3: CLI output and staleness

**Description**: Update CLI commands to pass `callLLM` to the refresh flow and display synthesis status.

**Before starting**: Read `packages/cli/src/commands/intelligence.ts` (the `arete memory refresh` command) and `packages/cli/src/commands/status.ts`.

**Critical files**:
- `packages/cli/src/commands/intelligence.ts`
- `packages/cli/src/commands/status.ts`

**Acceptance Criteria**:
- CLI checks `services.ai.isConfigured()` before creating `callLLM` wrapper
- `callLLM` wrapper uses `services.ai.call('synthesis', prompt)` pattern
- CLI output includes synthesis line: `Cross-area synthesis: updated` or `Cross-area synthesis: skipped (no AI configured)`
- `--json` output includes `synthesis: { updated: boolean }` field
- `arete status` shows synthesis freshness when `_synthesis.md` exists
- If `callLLM` throws, CLI shows `Cross-area synthesis: failed (see warning above)`
- CLI output changes verified manually (express track)
- `npm run typecheck && npm test` pass
