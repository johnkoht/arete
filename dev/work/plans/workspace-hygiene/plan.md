---
title: Workspace Hygiene
slug: workspace-hygiene
status: approved
created: 2026-04-09
has_pre_mortem: true
has_review: true
has_prd: true
---

# Workspace Hygiene — Implementation Plan

## Context

Arete workspaces accumulate entropy over time: old meetings pile up in `resources/meetings/`, decisions and learnings in `.arete/memory/items/` grow without consolidation, resolved commitments linger in `commitments.json`, and activity logs expand unbounded. The existing `periodic-review` skill diagnoses staleness but doesn't act on it. The daily/weekly winddown skills handle micro-cleanup but not systematic pruning. Users have no way to do "spring cleaning" across their workspace.

This plan introduces a **workspace-hygiene** feature spanning all layers: a core service for scan/apply logic, CLI commands, backend API routes, a web UI page, and a runtime skill for agent-driven cleanup.

---

## Phase 1 (MVP): Core + CLI

Ship scan + apply as CLI commands backed by a new `HygieneService` in core. No web UI yet.

### Task 1: Extract similarity utilities

**What:** Move `normalizeForJaccard()` and `jaccardSimilarity()` from `packages/core/src/services/commitments.ts` (module-private) into `packages/core/src/utils/similarity.ts`. Export from `utils/index.ts` barrel. Update imports in `commitments.ts` and `meeting-extraction.ts`.

**Files:**
- Create: `packages/core/src/utils/similarity.ts`
- Edit: `packages/core/src/utils/index.ts` (add export)
- Edit: `packages/core/src/services/commitments.ts` (import from utils)
- Edit: `packages/core/src/services/meeting-extraction.ts` (import from utils, if it has its own copy)

**ACs:**
- [ ] `normalize()` and `jaccard()` exported from `@arete/core` utils
- [ ] All existing tests pass unchanged
- [ ] No duplicate implementations of Jaccard in codebase

**Tests:** Existing commitments and meeting-extraction tests serve as regression. Add unit tests in `packages/core/test/utils/similarity.test.ts` for edge cases (empty strings, identical strings, no overlap).

---

### Task 2: Add `purgeResolved()` to CommitmentsService

**What:** Add a public `purgeResolved(olderThanDays?: number): Promise<{ purged: number }>` method to `CommitmentsService`. Uses the existing private `shouldPrune()` logic with a configurable threshold (default: `PRUNE_DAYS` = 30).

**Files:**
- Edit: `packages/core/src/services/commitments.ts`
- Edit: `packages/core/test/services/commitments.test.ts`

**ACs:**
- [ ] `purgeResolved()` removes all resolved commitments older than threshold
- [ ] Returns count of purged items
- [ ] Does not touch open/active commitments
- [ ] Handles empty commitments.json gracefully

**Tests:** Add tests: purge with no resolved items (0 purged), purge with mix of resolved/open (only resolved purged), custom threshold.

---

### Task 3: Add `compactLearnings()` to AreaMemoryService

**What:** Mirror the existing `compactDecisions()` method. Extract shared logic into a private `compactMemoryFile(filename, ...)` helper that both `compactDecisions()` and `compactLearnings()` call.

**Files:**
- Edit: `packages/core/src/services/area-memory.ts`
- Edit: `packages/core/test/services/area-memory.test.ts`

**ACs:**
- [ ] `compactLearnings()` partitions learnings by age, matches to areas, archives old ones
- [ ] `compactDecisions()` still works unchanged (refactored to use shared helper)
- [ ] Archived learnings go to `.arete/memory/archive/learnings-{date}.md`
- [ ] Unmatched old learnings preserved (not silently dropped)

**Tests:** Mirror existing `compactDecisions()` tests. Test: compaction with no areas, compaction with area matches, preservation of recent items.

---

### Task 4: Define hygiene types

**What:** Add hygiene type definitions to the core models.

**Files:**
- Create: `packages/core/src/models/hygiene.ts`
- Edit: `packages/core/src/models/index.ts` (add barrel export)

**Types:**
```ts
type HygieneTier = 1 | 2 | 3;
type HygieneCategory = 'meetings' | 'memory' | 'commitments' | 'activity';
type HygieneActionType = 'archive' | 'compact' | 'purge' | 'trim' | 'merge';

type HygieneItem = {
  id: string;
  tier: HygieneTier;
  category: HygieneCategory;
  actionType: HygieneActionType;
  description: string;
  affectedPath: string;
  suggestedAction: string;
  metadata: Record<string, unknown>;
};

type HygieneReport = {
  scannedAt: string;
  items: HygieneItem[];
  summary: {
    total: number;
    byTier: Record<HygieneTier, number>;
    byCategory: Record<HygieneCategory, number>;
  };
};

type ApprovedAction = { id: string };

type HygieneResult = {
  applied: string[];
  failed: Array<{ id: string; error: string }>;
};

type HygieneScanOptions = {
  tiers?: HygieneTier[];
  categories?: HygieneCategory[];
  areaSlug?: string;
  meetingOlderThanDays?: number;
  memoryOlderThanDays?: number;
  commitmentOlderThanDays?: number;
};
```

**ACs:**
- [ ] All types exported from `@arete/core`
- [ ] Types compile cleanly, no `any`

---

### Task 5: Implement HygieneService

**What:** New service with `scan()` and `apply()` methods.

**Files:**
- Create: `packages/core/src/services/hygiene.ts`
- Edit: `packages/core/src/factory.ts` (wire into `createServices()`, add to `AreteServices`)
- Edit: `packages/core/src/index.ts` (export)
- Create: `packages/core/test/services/hygiene.test.ts`

**Constructor deps:**
- `StorageAdapter`
- `workspaceRoot: string`
- `CommitmentsService`
- `AreaMemoryService`
- `AreaParserService`
- `MemoryService`

**scan() implementation:**
1. **Meetings scan (tier 1):** List `resources/meetings/*.md`, parse frontmatter dates, flag meetings >90 days old with status `approved` or `skipped`.
2. **Commitments scan (tier 1):** Identify resolved commitments >30 days.
3. **Memory compaction scan (tier 2):** Read decisions.md and learnings.md, identify entries >90 days old compactable into area summaries.
4. **Activity log scan (tier 2):** Flag if >5000 lines.
5. **Memory dedup scan (tier 3):** Pairwise Jaccard, flag pairs >0.6 similarity.

**apply() implementation:**
1. Validate `scannedAt` <1hr old.
2. Delegate to owning services per action type.
3. Track per-action success/failure.

**ACs:**
- [ ] `scan()` returns correct items categorized by tier
- [ ] `scan()` is pure read
- [ ] `apply()` validates scannedAt freshness
- [ ] `apply()` delegates to owning services
- [ ] `apply()` reports per-action success/failure
- [ ] Meeting archival preserves frontmatter, adds `archived_at`
- [ ] Activity trim archives old entries before removing
- [ ] Wired into `createServices()` factory

**Tests:** Mock StorageAdapter. Stub service deps. Test scan categories, apply delegation, stale rejection, partial failure.

---

### Task 6: CLI `arete hygiene` commands

**What:** New command file with `scan` and `apply` subcommands.

**Files:**
- Create: `packages/cli/src/commands/hygiene.ts`
- Edit: `packages/cli/src/index.ts` (register)
- Create: `packages/cli/test/commands/hygiene.test.ts`

**Commands:**

`arete hygiene scan [--tier <tiers...>] [--category <categories...>] [--area <slug>] [--json]`

`arete hygiene apply [--tier <tiers...>] [--yes] [--dry-run] [--skip-qmd] [--json]`

**ACs:**
- [ ] `scan` displays tier-grouped output
- [ ] `scan --json` returns valid HygieneReport
- [ ] `apply` interactive checkbox with pre-checked tier 1
- [ ] `apply --yes` auto-approves
- [ ] `apply --dry-run` shows actions without executing
- [ ] `apply --json` never blocks on stdin
- [ ] `--skip-qmd` suppresses QMD refresh

**Tests:** `createTmpDir` + `runCli` pattern with `--yes --skip-qmd --json`.

---

## Phase 2: Backend + Web UI

### Task 7: Backend hygiene routes

- `GET /api/hygiene/scan` → HygieneReport
- `GET /api/hygiene/stats` → lightweight counts for nav badge
- `POST /api/hygiene/apply` → 202 + jobId
- Global hygiene lock (409 if busy)

### Task 8: Web hygiene page

- Sidebar nav with Sparkles icon + badge
- HygienePage with tier-grouped sections
- Bulk "Apply All Safe" for tier 1
- SSE progress via useProcessingEvents extension

---

## Phase 3: Runtime Skill + Enhancements

### Task 9: Runtime skill (`workspace-hygiene/SKILL.md`)

- 4-phase: Scan → Tier Review → Execute → Report
- Integration points in periodic-review and weekly-winddown

### Task 10 (Future): Semantic dedup + LLM relevance

---

## Critical Files

| File | Role |
|------|------|
| `packages/core/src/factory.ts` | Wire HygieneService |
| `packages/core/src/services/commitments.ts` | Add purgeResolved(), extract Jaccard |
| `packages/core/src/services/area-memory.ts` | Add compactLearnings() |
| `packages/core/src/utils/index.ts` | Export similarity utils |
| `packages/core/src/models/index.ts` | Export hygiene types |
| `packages/cli/src/index.ts` | Register hygiene command |
| `packages/apps/backend/src/server.ts` | Register hygiene route |
| `packages/apps/web/src/App.tsx` | Add /hygiene route |
| `packages/apps/web/src/components/AppSidebar.tsx` | Add nav item + badge |
