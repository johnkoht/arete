# Workspace Hygiene PRD

## Goal

Add a workspace-hygiene feature to Arete that lets users scan for and clean up accumulated workspace entropy — stale meetings, uncompacted memory, resolved commitments, and activity log bloat. Ships as a core service with CLI commands (Phase 1 MVP).

## Memory Synthesis (from build context)

1. Factory wiring: audit ALL dependency injection sites when adding new services. HygieneService wires after AreaMemoryService in factory.ts.
2. Commitments auto-pruning: `save()` already prunes resolved items >30 days. `purgeResolved()` must work with this, not against it.
3. Jaccard extraction: do NOT unify normalization functions. Extract only the core set-intersection computation. Keep re-exports in `services/index.ts`.
4. Learnings use bullet-list format (`- YYYY-MM-DD: text`), NOT heading sections. `compactLearnings()` needs its own parser — cannot reuse `parseMemorySections()` from compactDecisions.
5. CLI: every exit path must check `opts.json` before printing chalk output. JSON mode callers must never block on stdin.

## Tasks

### Task 1: Extract Jaccard similarity utilities to shared module

**Description**: Move the core Jaccard set-intersection computation to `packages/core/src/utils/similarity.ts`. Leave each caller's normalization in place. Update imports. Preserve public API re-exports.

**Before starting**: Read these files:
- `packages/core/src/services/commitments.ts` — find private `normalize()` and `jaccard()` (~lines 222-236)
- `packages/core/src/services/meeting-extraction.ts` — find `normalizeForJaccard()` and `jaccardSimilarity()` (~lines 189-206)
- `packages/core/src/services/area-parser.ts` — find private `jaccardSimilarity()` (~lines 73-79)
- `packages/core/src/services/index.ts` — find the re-exports (~lines 40-41)
- `packages/core/src/utils/index.ts` — current barrel exports

**Critical files**:
- `packages/core/src/utils/similarity.ts` (create)
- `packages/core/src/utils/index.ts`
- `packages/core/src/services/commitments.ts`
- `packages/core/src/services/meeting-extraction.ts`
- `packages/core/src/services/index.ts`

**Acceptance Criteria**:
- `jaccardSimilarity(a: string[], b: string[]): number` exported from `packages/core/src/utils/similarity.ts` — takes pre-tokenized arrays, returns intersection/union ratio
- `normalizeForJaccard(text: string): string` exported from same file (the meeting-extraction version using `\s` whitespace class)
- `services/index.ts` re-exports both from `../utils/similarity.js` (preserving public API)
- `meeting-extraction.ts` imports from `../utils/similarity.js` instead of defining locally
- `commitments.ts` imports `jaccardSimilarity` from `../utils/similarity.js` but keeps its own `normalize()` private function (different normalization)
- `area-parser.ts` imports `jaccardSimilarity` from `../utils/similarity.js` but keeps its own `tokenizeWithStopWords()` (different tokenization)
- Unit tests in `packages/core/test/utils/similarity.test.ts`: empty arrays → 0, identical arrays → 1, disjoint arrays → 0, partial overlap → correct ratio
- All existing tests pass: `npm run typecheck && npm test`
- Grep confirms no remaining local Jaccard computation implementations (only normalization/tokenization wrappers)

---

### Task 2: Add `purgeResolved()` to CommitmentsService

**Description**: Add a public method that explicitly purges resolved commitments older than a configurable threshold. This wraps the existing `shouldPrune()` logic.

**Before starting**: Read these files:
- `packages/core/src/services/commitments.ts` — understand `shouldPrune()` (~line 206), `PRUNE_DAYS` (~line 29), private `load()` and `save()` methods, the auto-pruning in `save()` (~lines 326-329)
- `packages/core/test/services/commitments.test.ts` — understand test patterns

**Critical files**:
- `packages/core/src/services/commitments.ts`
- `packages/core/test/services/commitments.test.ts`

**Acceptance Criteria**:
- `purgeResolved(olderThanDays?: number): Promise<{ purged: number }>` public method added
- Default threshold is `PRUNE_DAYS` (30)
- Uses existing `shouldPrune()` logic (parameterized with custom threshold if provided)
- Loads commitments, filters out resolved items older than threshold, saves remainder
- Returns count of purged items
- Does not touch open/active commitments regardless of age
- Handles missing/empty commitments.json gracefully (returns `{ purged: 0 }`)
- Tests: purge with no resolved items → 0, purge with mix of resolved/open → only resolved removed, custom threshold (e.g., 7 days), empty file → 0
- `npm run typecheck && npm test` pass

---

### Task 3: Add `compactLearnings()` to AreaMemoryService

**Description**: Add a method that compacts old learnings entries into area-specific summaries. IMPORTANT: learnings.md uses bullet-list format (`- YYYY-MM-DD: text (from: source)`), NOT heading-based sections like decisions.md. This requires a dedicated parser.

**Before starting**: Read these files:
- `packages/core/src/services/area-memory.ts` — understand `compactDecisions()` (~line 457), `parseMemorySections()`, `matchDecisionToArea()`
- `packages/core/test/services/area-memory.test.ts` — understand test patterns for compactDecisions
- Read a real `learnings.md` file if available, or check the format in `packages/runtime/skills/weekly-winddown/SKILL.md` (memory format section)

**Critical files**:
- `packages/core/src/services/area-memory.ts`
- `packages/core/test/services/area-memory.test.ts`

**Acceptance Criteria**:
- `compactLearnings(workspacePaths: WorkspacePaths, options?: { olderThanDays?: number }): Promise<CompactResult>` method added
- Default threshold: 90 days
- Parses bullet-list format: `- YYYY-MM-DD: text (from: source)` — extracts date, text, and source
- Partitions entries into recent (keep) and old (compact)
- Old entries archived to `.arete/memory/archive/learnings-YYYY-MM-DD.md` with ISO timestamp header
- Recent entries remain in `learnings.md`
- `CompactResult` type: `{ archived: number; kept: number; archivePath: string | null }`
- Does NOT use `parseMemorySections()` (that's for heading-based decisions.md)
- Handles empty learnings.md → returns `{ archived: 0, kept: 0, archivePath: null }`
- Handles learnings.md with no dates → preserves all entries (conservative)
- `compactDecisions()` still works unchanged (no regression)
- Tests: compact with all recent → 0 archived, compact with mix → correct split, empty file, no-date entries preserved
- `npm run typecheck && npm test` pass

---

### Task 4: Define hygiene types in core models

**Description**: Add TypeScript type definitions for the hygiene feature to the core models barrel.

**Before starting**: Read these files:
- `packages/core/src/models/index.ts` — current barrel exports
- `packages/core/src/models/common.ts` — type patterns used in this project
- `packages/core/src/models/memory.ts` — similar domain types

**Critical files**:
- `packages/core/src/models/hygiene.ts` (create)
- `packages/core/src/models/index.ts`

**Acceptance Criteria**:
- All types exported from `packages/core/src/models/hygiene.ts`:
  - `HygieneTier` = `1 | 2 | 3`
  - `HygieneCategory` = `'meetings' | 'memory' | 'commitments' | 'activity'`
  - `HygieneActionType` = `'archive' | 'compact' | 'purge' | 'trim' | 'merge'`
  - `HygieneItem` = `{ id, tier, category, actionType, description, affectedPath, suggestedAction, metadata }`
  - `HygieneReport` = `{ scannedAt, items, summary: { total, byTier, byCategory } }`
  - `ApprovedAction` = `{ id: string }`
  - `HygieneResult` = `{ applied: string[], failed: Array<{ id, error }> }`
  - `HygieneScanOptions` = `{ tiers?, categories?, areaSlug?, meetingOlderThanDays?, memoryOlderThanDays?, commitmentOlderThanDays? }`
- Re-exported from `packages/core/src/models/index.ts`
- Re-exported from `packages/core/src/index.ts` (via models barrel)
- No `any` types
- `npm run typecheck` passes

---

### Task 5: Implement HygieneService with scan and apply

**Description**: Create the core HygieneService that scans for workspace entropy and applies approved cleanup actions by delegating to owning services.

**Before starting**: Read these files:
- `packages/core/src/factory.ts` — understand service wiring, AreteServices type
- `packages/core/src/services/area-memory.ts` — `compactDecisions()`, `compactLearnings()` (from Task 3), `listAreaMemoryStatus()`
- `packages/core/src/services/commitments.ts` — `purgeResolved()` (from Task 2), `listOpen()`
- `packages/core/src/services/memory.ts` — understand MemoryService API
- `packages/core/src/storage/adapter.ts` — StorageAdapter interface
- `packages/core/test/services/area-memory.test.ts` — mock patterns (Map<string,string> for storage)
- `packages/core/test/factory.test.ts` — expected service keys assertion

**Critical files**:
- `packages/core/src/services/hygiene.ts` (create)
- `packages/core/src/factory.ts`
- `packages/core/src/index.ts`
- `packages/core/test/services/hygiene.test.ts` (create)
- `packages/core/test/factory.test.ts` (update expected keys)

**Acceptance Criteria**:
- `HygieneService` class with constructor: `(storage: StorageAdapter, workspaceRoot: string, commitments: CommitmentsService, areaMemory: AreaMemoryService, areaParser: AreaParserService, memory: MemoryService)`
- `scan(options?: HygieneScanOptions): Promise<HygieneReport>` — pure read, no mutations:
  - Tier 1: meetings in `resources/meetings/` older than threshold with status approved/skipped
  - Tier 1: resolved commitments older than threshold (via CommitmentsService)
  - Tier 2: memory entries in `decisions.md`/`learnings.md` older than threshold
  - Tier 2: activity log `.arete/activity/activity-log.md` exceeding 5000 lines
  - Tier 3: duplicate memory entries (Jaccard similarity >0.6)
- `apply(report: HygieneReport, actions: ApprovedAction[]): Promise<HygieneResult>` — delegates to owning services:
  - Validates `scannedAt` is <1hr old, rejects stale reports
  - `archive` meetings → moves to `resources/meetings/archive/YYYY-MM/`, adds `archived_at` frontmatter
  - `purge` commitments → calls `CommitmentsService.purgeResolved()`
  - `compact` memory → calls `AreaMemoryService.compactDecisions()` / `compactLearnings()`
  - `trim` activity → keeps recent 2500 lines, archives rest to `.arete/memory/archive/activity-YYYY-MM-DD.md`
  - Tracks per-action success/failure, does not stop on individual failure
- Wired into `createServices()` in factory.ts as `hygiene: HygieneService`
- `AreteServices` type updated in factory.ts
- `HygieneService` exported from `packages/core/src/index.ts`
- Factory test updated with `'hygiene'` in expected keys
- Unit tests with mocked StorageAdapter:
  - scan empty workspace → 0 items
  - scan with old meeting files → tier 1 items with correct metadata
  - scan with old memory entries → tier 2 items
  - scan with duplicate entries → tier 3 items with similarity score in metadata
  - apply with valid report → delegates correctly (verify service method calls)
  - apply with stale scannedAt → rejects with error
  - apply with partial failure → returns both applied and failed
  - scan respects tier/category filters
- `npm run typecheck && npm test` pass

---

### Task 6: CLI `arete hygiene` commands

**Description**: Add `arete hygiene scan` and `arete hygiene apply` CLI commands as a thin shell over HygieneService.

**Before starting**: Read these files:
- `packages/cli/src/commands/commitments.ts` — template for command structure, --json, --yes patterns
- `packages/cli/src/commands/LEARNINGS.md` — CLI gotchas and invariants
- `packages/cli/src/index.ts` — command registration pattern
- `packages/cli/src/formatters.ts` — output helpers (header, section, listItem, info, success, warn)
- `packages/cli/test/commands/commitments.test.ts` — test patterns (createTmpDir, runCli)

**Critical files**:
- `packages/cli/src/commands/hygiene.ts` (create)
- `packages/cli/src/index.ts`
- `packages/cli/test/commands/hygiene.test.ts` (create)

**Acceptance Criteria**:
- `registerHygieneCommand(program: Command)` exported
- Registered in `packages/cli/src/index.ts`
- `arete hygiene scan`:
  - Options: `--tier <tiers...>`, `--category <categories...>`, `--area <slug>`, `--json`
  - Calls `services.hygiene.scan(options)` with mapped options
  - Human output: `header("Workspace Hygiene Scan")`, `section()` per tier with item count, `listItem()` per item, `info()` summary line
  - `--json` outputs `HygieneReport` as JSON, never blocks on stdin
  - Workspace detection with error handling (both JSON and human-readable paths)
- `arete hygiene apply`:
  - Options: `--tier <tiers...>`, `--yes`, `--dry-run`, `--skip-qmd`, `--json`
  - Runs scan internally first
  - Without `--yes`: interactive `@inquirer/prompts` checkbox grouped by tier, tier 1 items pre-checked
  - With `--yes`: auto-approves all items
  - With `--json`: auto-approves all (never blocks on stdin)
  - `--dry-run`: shows what would be applied without executing
  - Calls `services.hygiene.apply()` with approved actions
  - Calls `refreshQmdIndex()` after successful apply (unless `--skip-qmd`)
  - Displays per-item results using `success()` / `warn()` formatters
- Tests using `createTmpDir` + `runCli` pattern:
  - scan on clean workspace → empty report (JSON mode)
  - scan with old meeting fixtures → correct tier counts
  - apply --yes --skip-qmd --json → verifies files moved
  - apply --dry-run --skip-qmd --json → no filesystem changes
  - scan outside workspace → graceful error
- `npm run typecheck && npm test` pass
