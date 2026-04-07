# Cross-Area Synthesis: LLM-Powered Area Memory Connections

**Date**: 2026-04-06
**Type**: New feature (area memory enhancement)
**Impact**: Area memory now identifies cross-area connections, dependencies, and convergence signals

## Summary

Added LLM-powered cross-area synthesis to `AreaMemoryService`. After refreshing individual area memory files, the system sends all area summaries to an LLM to identify cross-cutting connections that are invisible when computing each area in isolation. Output written to `_synthesis.md`.

## What Was Built

1. **`synthesizeCrossArea()` method** — Reads all area memory files (excluding `_`-prefixed), builds a structured prompt, calls LLM, returns opaque markdown response
2. **`buildSynthesisPrompt()`** — Pure function constructing the LLM prompt with area content delimiters
3. **Integration into `refreshAllAreaMemory()`** — Synthesis runs after individual area refresh when `callLLM` provided and refreshing all areas (not single-area)
4. **`_synthesis.md` output** — Written with YAML frontmatter (`type`, `last_refreshed`, `areas_analyzed`); already searchable via QMD
5. **CLI updates** — `arete memory refresh` shows synthesis status, `arete status` shows synthesis freshness
6. **`'synthesis'` AI task** — Added to `AITask` type union with `standard` default tier

## Metrics

- Tasks: 3/3 (100% first-attempt)
- Tests: 10 new tests (29 total in area-memory suite)
- Files changed: 8 source + 1 test
- Pre-mortem risks materialized: 0

## Learnings

- **New AI tasks need two locations**: `AITask` type union in `models/workspace.ts` AND `DEFAULT_TASK_TIERS` in `services/ai.ts`. Missing either causes type error.
- **`listAreaMemoryStatus()` is safe from `_synthesis.md`**: Iterates `areaParser.listAreas()` (area definition files), not the filesystem. But `synthesizeCrossArea()` reads the directory directly, so must exclude `_`-prefixed files.
- **Mock storage Map reference pattern**: `createMockStorage` should use the passed Map directly (`const store = initial ?? new Map()`), never copy with `new Map(initial)`. Copying breaks write-then-read in tests that pass an external Map reference.

## Follow-ups

- No CLI test file exists for `status.ts` — synthesis JSON field untested at CLI layer (core logic well-tested)
- Consider incremental synthesis (content hashing) if >15 areas or >10s refresh times
