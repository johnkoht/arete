# PRD: Meeting Extraction Dedup & Context Enhancement

**Version**: 1.0  
**Status**: Planned  
**Date**: 2026-03-25  
**Branch**: `feature/meeting-extraction-improvements`  
**Size**: Large (13 tasks across 4 phases)

---

## 1. Problem & Goals

### Problem

When processing multiple meetings (e.g., 5 meetings/day), the same decisions, learnings, and action items get extracted repeatedly because each meeting is processed in isolation. Additionally:

- Area context and recent memory aren't being used to inform extraction
- `findRecentMeetings()` has O(A×N) performance issues (A = attendees, N = meetings)
- No deduplication across meetings in a batch

### Goals

1. **Eliminate duplicate extractions**: Same item mentioned across 3 meetings → extracted once
2. **Respect existing memory**: Items already approved → not re-extracted
3. **Context-aware extraction**: Area context (Current State, Key Decisions) available to LLM during extraction
4. **Performance improvement**: `findRecentMeetings()` performs in <500ms with 100+ meetings/month

### Success Criteria

- Batch processing 5 meetings with overlapping decisions → each decision extracted once
- Previously approved items not re-extracted
- Area context visible in `arete meeting context --json` output
- `findRecentMeetings()` reads files once per meeting (not once per attendee × meeting)

### Out of Scope

- Session-level meeting file cache (nice to have, not required)
- QMD-based attendee lookup (file scan with 60-day bound is sufficient)
- Combined `getAreaForMeetingWithContext()` (minor optimization)
- Word-boundary matching for area titles (rare false positives)

---

## 2. Pre-Mortem Risks (Reference)

The following risks were identified in `pre-mortem.md` and are referenced in task warnings:

| # | Risk | Severity | Tasks |
|---|------|----------|-------|
| R1 | Factory wiring breaks callers | Medium | 7a |
| R2 | CLI/Backend priorItems divergence | High | 4, 10, 11 |
| R3 | LLM ignores exclusion list | High | 6 |
| R4 | Over-suppression of updates | Medium | 6 |
| R5 | Double YAML parse regression | Low | 1 |
| R6 | Performance not measured | Medium | 2, 3 |
| R7 | priorItems bloat at scale | Medium | 5, 12 |
| R8 | Context fails silently | Low | 8 |
| R9 | Subagent context gaps | High | 7, 7a, 8, 9 |
| R10 | Skill docs skipped | Low | 12 |

---

## 3. Expertise Profiles

When reviewing or implementing tasks in this PRD, include:

- **Core**: `.pi/expertise/core/PROFILE.md` — DI patterns, StorageAdapter, factory wiring
- **CLI**: `.pi/expertise/cli/PROFILE.md` — Command patterns, --json flag, qmd refresh

Key invariants:
- Services never import `fs` directly — use `StorageAdapter`
- `createServices()` is the only wiring point
- CLI commands follow: `createServices() → findRoot() → guard → service → format`
- New services must be wired in `factory.ts`

---

## 4. Tasks

### Phase 1: Performance Fixes (Quick Wins)

#### Task 1: Fix double YAML parse in `findRecentMeetings()`

**Description**: Add `attendee_ids` to `ParsedMeetingFrontmatter` interface so it's parsed once with the rest of frontmatter, eliminating the second YAML parse.

**File**: `packages/core/src/services/meeting-context.ts`

**⚠️ Pre-Mortem Warning (R5)**: `parseMeetingFile()` is used in multiple places. Grep for ALL usages before modifying. Ensure `attendee_ids` is `string[] | undefined` (optional) to handle frontmatter without the field.

**Acceptance Criteria**:
- `ParsedMeetingFrontmatter` includes `attendee_ids?: string[]`
- `parseMeetingFile()` extracts `attendee_ids` from YAML
- Second YAML parse block removed from `findRecentMeetings()`
- Unit test: frontmatter with `attendee_ids` parsed correctly
- Unit test: frontmatter WITHOUT `attendee_ids` returns undefined (not error)
- `grep -r "parseMeetingFile" packages/core/src/` shows all call sites reviewed

---

#### Task 2: Add 60-day cutoff to `findRecentMeetings()`

**Description**: Filter files by filename date (`YYYY-MM-DD-*.md`) before reading content, avoiding unnecessary file reads for old meetings.

**File**: `packages/core/src/services/meeting-context.ts`

**⚠️ Pre-Mortem Warning (R6)**: Performance improvements need measurement. Test must explicitly count file reads to verify improvement.

**Acceptance Criteria**:
- Files older than 60 days excluded before `storage.read()`
- Uses lexicographic date comparison (no Date parsing needed)
- Graceful handling of non-standard filenames (read anyway, don't error)
- Unit test: old meetings excluded
- Test counts file reads via mock to verify reduction

---

#### Task 3: Batch `findRecentMeetings()` across attendees

**Description**: New function that reads each meeting file once and checks all attendees, reducing file reads from O(A×N) to O(N).

**File**: `packages/core/src/services/meeting-context.ts`

**⚠️ Pre-Mortem Warning (R6)**: Test must assert `fileReadCount === N` (not `A × N`).

```typescript
async function findRecentMeetingsForAttendees(
  storage: StorageAdapter,
  paths: WorkspacePaths,
  attendees: Array<{ slug: string; email: string }>,
  limit?: number
): Promise<Map<string, string[]>>
```

**Acceptance Criteria**:
- Single pass through meeting files
- Returns `Map<slug, titles[]>` for all attendees
- `buildMeetingContext()` uses batched version
- 3× fewer file reads verified in test (mock tracks read calls)
- Follows core DI pattern (StorageAdapter, not fs)

---

### Phase 2: Dedup Infrastructure

#### Task 4: Add `priorItems` to extraction options

**Description**: Extend the extraction options interface to accept items already extracted from earlier meetings in a batch.

**File**: `packages/core/src/services/meeting-extraction.ts`

**⚠️ Pre-Mortem Warning (R2)**: Define `PriorItem` type here and export from `packages/core/src/services/index.ts`. CLI and backend MUST import this type, not recreate it.

```typescript
export interface PriorItem {
  type: 'action' | 'decision' | 'learning';
  text: string;
  source?: string;
}

options?: {
  attendees?: string[];
  ownerSlug?: string;
  context?: MeetingContextBundle;
  priorItems?: PriorItem[];
}
```

**Acceptance Criteria**:
- `extractMeetingIntelligence()` accepts `priorItems`
- Items passed to `buildMeetingExtractionPrompt()`
- `PriorItem` type exported from `packages/core/src/services/index.ts`
- Type includes `type`, `text`, `source?` fields

---

#### Task 5: Extend Jaccard dedup for prior items

**Description**: Extend existing `processMeetingExtraction()` to also compare against prior items (not just user notes), providing deterministic fallback when LLM fails to deduplicate.

**File**: `packages/core/src/services/meeting-processing.ts`

**⚠️ Pre-Mortem Warning (R7)**: Cap at 50 items (most recent by processing order). Document that catch-up scenarios (100+ meetings) may have diminished dedup efficacy.

**Acceptance Criteria**:
- `ProcessingOptions` includes `priorItems?: PriorItem[]` (imported from extraction.ts)
- Items matching prior items (Jaccard > 0.7) marked `source: 'dedup'`
- Unit test: duplicate from prior meeting filtered out
- Unit test: items with Jaccard < 0.7 pass through
- Cap at 50 items to prevent memory bloat (most recent)
- Contradictory statements (contains "not", "instead", "changed") get lower Jaccard scores

---

#### Task 6: Strengthen extraction prompt for dedup

**Description**: Consolidate dedup context into single Exclusion List with strong positive framing.

**File**: `packages/core/src/services/meeting-extraction.ts`

**⚠️ Pre-Mortem Warnings**: 
- (R3): Use positive "SKIP" framing, not negation. Cap at ~1000 tokens.
- (R4): Include explicit "UPDATE exception" language.

Prompt template:
```markdown
## Exclusion List (SKIP these — already captured)

The following items have ALREADY been extracted. Do NOT output these or any semantic equivalents:

**Staged Decisions:**
1. "Cover Whale is next priority" — source: CoverWhale Sync

**Staged Action Items:**
1. "[@john → @jamie] Send template list" — source: Lindsay 1:1

If the transcript mentions anything semantically equivalent, SKIP IT.
Exception: Extract if the transcript contains an UPDATE to an existing item (e.g., status change, deadline moved).
```

**Acceptance Criteria**:
- Single "Exclusion List" section (not 4 separate sections)
- Positive "SKIP" framing (not "do not")
- "semantic equivalent" language explicit
- "UPDATE exception" documented
- Renders recent decisions/learnings from `relatedContext` and `priorItems`
- Token budget ~1000 tokens max for exclusion list (truncate if needed)
- Test case: prior item "Use React" + transcript "Switched to Vue" → new item extracted

---

### Phase 3: Area Context Integration

#### Task 7: Add `areaParser` to `MeetingContextDeps`

**Description**: Per core DI pattern, add AreaParserService to deps for meeting context building.

**File**: `packages/core/src/services/meeting-context.ts`

**⚠️ Pre-Mortem Warning (R9)**: Before starting, read: `packages/core/src/factory.ts`, `packages/core/src/services/meeting-context.ts`, `packages/core/src/services/area-parser.ts`. Follow testDeps pattern: `deps.areaParser ?? new AreaParserService(storage, root)`.

```typescript
export interface MeetingContextDeps {
  storage: StorageAdapter;
  intelligence: IntelligenceService;
  entity: EntityService;
  paths: WorkspacePaths;
  areaParser?: AreaParserService;  // NEW
}
```

**Acceptance Criteria**:
- `MeetingContextDeps` includes optional `areaParser?: AreaParserService`
- `buildMeetingContext()` uses it when provided
- Falls back to constructing internally if not provided (backward compat)
- Follows testDeps pattern from core PROFILE.md
- Type imported from `area-parser.ts`, not redefined

---

#### Task 7a: Wire `AreaParserService` into `createServices()` factory

**Description**: Add AreaParserService to AreteServices so CLI doesn't construct it directly.

**File**: `packages/core/src/factory.ts`

**⚠️ Pre-Mortem Warning (R1, R9)**: 
- Adding to interface is additive and backward-compatible
- Verify `createServices()` has `workspaceRoot` (it does)
- Construct after storage adapter creation
- Run `npm run typecheck` across ALL packages after change

**Acceptance Criteria**:
- `AreteServices` interface includes `areaParser: AreaParserService`
- `createServices()` constructs `new AreaParserService(storage, root)`
- CLI commands can destructure `areaParser` from services
- Follows existing factory pattern (see `entity`, `context`, etc.)
- `npm run typecheck` passes with 0 errors
- `grep -r "createServices(" packages/` shows no callers break

---

#### Task 8: Add area context to `MeetingContextBundle`

**Description**: After attendee resolution, resolve area and fetch context.

**File**: `packages/core/src/services/meeting-context.ts`

**⚠️ Pre-Mortem Warning (R8, R9)**: 
- Don't fail silently — add warnings to bundle when area lookup fails
- `MeetingContextBundle` already has `warnings` field — use it

```typescript
const areaMatch = deps.areaParser 
  ? await deps.areaParser.getAreaForMeeting(frontmatter.title)
  : null;

let areaContext: AreaContext | null = null;
if (areaMatch) {
  areaContext = await deps.areaParser.getAreaContext(areaMatch.areaSlug);
}
```

**Acceptance Criteria**:
- `MeetingContextBundle` has `areaContext?: AreaContext | null`
- Type exported from `packages/core/src/services/index.ts`
- No error if no area match — push warning instead
- When area context fetch fails, push warning: "Failed to load area context: {slug}"
- Area context included in `arete meeting context --json` output
- Unit test: meeting with matching area → context populated
- Unit test: meeting with no area → warning added, no error

---

#### Task 9: Include area content in extraction prompt

**Description**: Add area context section to `buildContextSection()` so LLM has domain knowledge.

**File**: `packages/core/src/services/meeting-extraction.ts`

**⚠️ Pre-Mortem Warning (R9)**: Read `area-parser.ts` to understand AreaContext shape before implementing.

Prompt addition:
```markdown
### Area Context (Glance Communications)
**Current State**: Email migration in progress — 95% templates ready...

**Recent Area Decisions**:
- 2026-03-18: Account-cluster approach for migration
```

**Acceptance Criteria**:
- Renders area name, current state (truncated to 500 chars)
- Shows last 5 Key Decisions from area file
- Section omitted if no area context
- Test: area context present → section rendered in prompt
- Test: no area context → section omitted cleanly

---

### Phase 4: Batch Orchestration

#### Task 10: Add `--prior-items` option to CLI

**Description**: Add option to `arete meeting extract` command for passing prior items.

**File**: `packages/cli/src/commands/meeting.ts`

**⚠️ Pre-Mortem Warning (R2)**: Import `PriorItem` from `@arete/core`, not defining locally. Use same type as backend.

```bash
arete meeting extract <file> --context - --prior-items /tmp/prior.json
```

**Acceptance Criteria**:
- Accepts `--prior-items <file>` (JSON array path)
- Accepts `--prior-items -` for stdin
- Validates JSON schema on read (must be `PriorItem[]`)
- Passes to `extractMeetingIntelligence()` options
- Works with `--json` output per CLI pattern
- `PriorItem` type imported from `@arete/core`, not redefined

---

#### Task 11: Thread `priorItems` through backend

**Description**: Update `runProcessingSession()` to accumulate and pass prior items across meetings in a batch.

**File**: `packages/apps/backend/src/services/agent.ts`

**⚠️ Pre-Mortem Warning (R2)**: Include integration test comparing CLI and backend output for same meeting with same priorItems.

**Acceptance Criteria**:
- `runProcessingSession()` tracks extracted items across meetings
- Passes `priorItems` to `extractMeetingIntelligence()`
- Passes `priorItems` to `processMeetingExtraction()`
- Web app batch processing gets dedup behavior
- Integration test: CLI and backend produce identical dedup for same meeting and priorItems
- `PriorItem` type imported from `@arete/core`

---

#### Task 12: Update process-meetings skill for sequential batch

**Description**: Document sequential processing with item accumulation for skill users.

**File**: `runtime/skills/process-meetings/SKILL.md`

**⚠️ Pre-Mortem Warnings**:
- (R7): Document 50-item rolling window limitation
- (R10): This is documentation — don't skip it

**Acceptance Criteria**:
- Skill documents chronological ordering requirement
- Documents `priorItems` accumulation pattern
- Documents 50-item cap and limitation for catch-up scenarios
- Includes example CLI pipeline for batch processing
- `grep -i "chronological" runtime/skills/process-meetings/SKILL.md` returns matches
- `grep -i "priorItems" runtime/skills/process-meetings/SKILL.md` returns matches

---

## 5. Task Dependencies

```
Phase 1: 1 → 2 → 3 (sequential perf fixes)

Phase 2: 4 → 5 (priorItems → Jaccard)
         4 → 6 (priorItems → prompt)
         
Phase 3: 7 → 7a (deps → factory)
         7a → 8 (factory → bundle)
         8 → 9 (bundle → prompt)
         
Phase 4: 4 + 6 → 10 (dedup infra → CLI)
         4 + 6 → 11 (dedup infra → backend)
         11 → 12 (backend → skill docs)
```

**Execution Order**: 
- Phase 1 (1, 2, 3) can start immediately
- Phase 2 (4, 5, 6) can start after Phase 1 or in parallel
- Phase 3 (7, 7a, 8, 9) can start after Phase 1 or in parallel with Phase 2
- Phase 4 (10, 11, 12) depends on Phase 2 completion

---

## 6. Testing Strategy

- All tests use mocked StorageAdapter (no real file I/O)
- Performance tests count mock read calls explicitly
- Jaccard tests include edge cases (contradictory statements, similar but different)
- Integration test for CLI/backend parity on same input
- `npm run typecheck` and `npm test` after every task

---

## 7. Definition of Done

- [ ] All 13 tasks complete with passing tests
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Integration test: CLI and backend produce identical output
- [ ] Manual test: batch of 3 meetings with overlapping decisions → single extraction
- [ ] Skill documentation updated with patterns
- [ ] Expertise profiles still accurate (flag any inaccuracies in post-mortem)
