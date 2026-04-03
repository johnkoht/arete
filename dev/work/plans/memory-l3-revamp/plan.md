---
title: "L3 Memory Revamp — Computed Area Memory & Decision Compaction"
slug: memory-l3-revamp
status: building
size: medium
tags: [memory, l3, area-memory, search, cli]
steps: 7
---

# L3 Memory Revamp

## Problem

After 6 weeks of daily use, the L3 (synthesized context) layer of Arete's three-layer memory architecture is effectively empty:
- `.arete/memory/summaries/` directory: EMPTY
- `agent-observations.md`: 1 entry (should have dozens)
- Area memory: manually curated where it exists, not computed

L3 is the primary context injection layer. Without it, every skill does ad-hoc context gathering from L1/L2, leading to inconsistency, redundancy, and missed connections. Person memory refresh (`EntityService.refreshPersonMemory()`) is the only working automated L3 — it's the model to follow.

Key principle: L3 artifacts should be COMPUTED VIEWS, not user-maintained files. Automated, hidden, constantly updated by the system, injected as context when needed.

## Steps

### Step 1: Auto-generated area memory

**Goal**: Compute `.arete/memory/areas/{slug}.md` from existing data.

**Implementation**:
- Create `AreaMemoryService` in `packages/core/src/services/area-memory.ts`
- Constructor: `(storage, areaParser, commitments, memory)` — follows DI pattern
- `refreshAreaMemory(areaSlug, workspacePaths)` — single area refresh
- `refreshAllAreaMemory(workspacePaths)` — all areas
- Computed fields: keywords, active people, open work, recently completed, recent decisions
- Output: `.arete/memory/areas/{slug}.md` with YAML frontmatter (`last_refreshed`, `area_slug`, `area_name`)
- Wire into `factory.ts` and export from `services/index.ts`

**Acceptance Criteria**:
- [ ] `refreshAreaMemory('glance-comms', paths)` reads area file, commitments, decisions, meetings and writes computed summary
- [ ] `refreshAllAreaMemory(paths)` iterates all areas from AreaParserService
- [ ] Output file has YAML frontmatter with `last_refreshed` ISO date
- [ ] Uses StorageAdapter for all I/O (no direct fs)
- [ ] Tests cover: happy path, empty data, missing area, dry-run mode

**Files**:
- NEW: `packages/core/src/services/area-memory.ts`
- NEW: `packages/core/test/services/area-memory.test.ts`
- MODIFY: `packages/core/src/services/index.ts` (export)
- MODIFY: `packages/core/src/factory.ts` (wire)

### Step 2: Decision compaction

**Goal**: Compact old L2 decisions into area L3 summaries after a configurable threshold.

**Implementation**:
- Add `compactDecisions(options)` to `AreaMemoryService`
- Groups decisions by area (using AreaParserService matching)
- Decisions older than `olderThan` days get summarized into area memory files
- Archived originals move to `.arete/memory/archive/decisions-{date}.md`

**Acceptance Criteria**:
- [ ] Decisions older than threshold are grouped by area
- [ ] Compact summaries written to area memory files
- [ ] Original entries archived (not deleted)
- [ ] Decisions without area match are preserved in-place
- [ ] Tests cover: grouping, archiving, threshold logic

**Files**:
- MODIFY: `packages/core/src/services/area-memory.ts`
- MODIFY: `packages/core/test/services/area-memory.test.ts`

### Step 3: `arete memory refresh` CLI command

**Goal**: Unified CLI command to regenerate all L3 memory.

**Implementation**:
- Add `memory refresh` subcommand to existing `intelligence.ts` CLI (where `memory search` and `memory timeline` live)
- Calls `AreaMemoryService.refreshAllAreaMemory()` + `EntityService.refreshPersonMemory()`
- Options: `--area <slug>`, `--dry-run`, `--json`
- Reports: "Updated N area memories, M person memories"

**Acceptance Criteria**:
- [ ] `arete memory refresh` refreshes all area memory + all person memory
- [ ] `--area <slug>` refreshes only that area
- [ ] `--dry-run` previews without writing
- [ ] `--json` outputs structured result
- [ ] Calls `refreshQmdIndex()` after writes

**Files**:
- MODIFY: `packages/cli/src/commands/intelligence.ts`
- NEW: `packages/cli/test/commands/memory-refresh.test.ts`

### Step 4: Make L3 searchable

**Goal**: Add area memory and summaries to QMD search indexing.

**Implementation**:
- Add `.arete/memory/areas/` to SCOPE_PATHS in `qmd-setup.ts` — either as part of the existing "memory" scope or as a new scope
- Ensure `arete search --scope memory` returns L3 content alongside L2

**Acceptance Criteria**:
- [ ] Area memory files in `.arete/memory/areas/` are indexed by QMD
- [ ] `arete search --scope memory` finds area memory content
- [ ] Existing memory scope still works for L2 items

**Files**:
- MODIFY: `packages/core/src/search/qmd-setup.ts`
- MODIFY: `packages/core/test/search/qmd-setup.test.ts`

### Step 5: L3 freshness signals

**Goal**: Track and surface L3 staleness.

**Implementation**:
- `last_refreshed` already in area memory frontmatter (from Step 1)
- Add `isAreaMemoryStale(lastRefreshed, staleDays)` utility
- Add stale area memory check to `WorkspaceService.getStatus()`
- Surface in `arete status` output

**Acceptance Criteria**:
- [ ] `arete status` shows stale area memory count
- [ ] `isAreaMemoryStale()` correctly identifies stale files
- [ ] Default staleness threshold: 7 days

**Files**:
- MODIFY: `packages/core/src/services/area-memory.ts` (add utility)
- MODIFY: `packages/core/src/services/workspace.ts` (status check)
- MODIFY: `packages/cli/src/commands/status.ts` (display)

### Step 6: Wire into weekly-winddown

**Goal**: Add memory refresh to weekly-winddown Phase 7.

**Implementation**:
- Add `arete memory refresh` call before the existing `arete index` in Phase 7
- Update Phase 7 documentation

**Acceptance Criteria**:
- [ ] Phase 7 includes `arete memory refresh` before re-index
- [ ] Final report mentions area memory refresh counts

**Files**:
- MODIFY: `packages/runtime/skills/weekly-winddown/SKILL.md`

### Step 7: Update agent-memory rule

**Goal**: Reflect new L3 architecture in the agent-memory rule.

**Implementation**:
- Add `.arete/memory/areas/` to the memory architecture diagram
- Note that area memory is computed (not manual)
- Add `arete memory refresh` as canonical command
- Remove references to manually maintaining area summaries

**Acceptance Criteria**:
- [ ] Memory architecture diagram includes areas/
- [ ] Rule mentions computed area memory
- [ ] `arete memory refresh` documented as canonical refresh command

**Files**:
- MODIFY: `packages/runtime/rules/cursor/agent-memory.mdc`

## Risks & Mitigations

1. **AreaParserService reads `areas/` at workspace root** — need to confirm path convention matches user's workspace. Mitigation: check user workspace structure.
2. **Decision compaction loses information** — Mitigation: archive originals, never delete.
3. **QMD scope change could break existing search** — Mitigation: extend existing memory scope path, don't replace.
4. **Large number of areas could make refresh slow** — Mitigation: each area is independent; add `--area` for targeted refresh.

## Out of Scope

- AI-powered summarization of area memory (pure data aggregation for now)
- Collaboration.md and sessions.md population (different problem, different scope)
- Real-time memory refresh triggers (manual/scheduled for now)
