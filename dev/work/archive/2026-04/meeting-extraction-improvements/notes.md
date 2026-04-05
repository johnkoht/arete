# Plan Updates from Review

## Fixes Applied

### 1. Backend path corrected
- **Before**: `apps/backend/src/services/agent.ts`
- **After**: `packages/apps/backend/src/services/agent.ts`

### 2. Step 7a added: Wire AreaParserService into factory
New step between 7 and 8.

### 3. Naming unified to `priorItems`
- Changed `priorStagedItems` → `priorItems` throughout
- Consistent with `ProcessingOptions` naming

---

# Updated Plan: Meeting Extraction Dedup & Context Enhancement

**Problem**: When processing multiple meetings (e.g., 5 meetings/day), the same decisions, learnings, and action items get extracted repeatedly because each meeting is processed in isolation. Additionally, area context and recent memory aren't being used to inform extraction, and `findRecentMeetings()` has O(A×N) performance issues.

**Success Criteria**:
- Same item mentioned across 3 meetings → extracted once
- Items already in memory (approved yesterday) → not re-extracted  
- Area context (Current State, Key Decisions) → available to LLM during extraction
- `findRecentMeetings()` performs in <500ms with 100+ meetings/month

---

## Plan (13 Steps)

### Phase 1: Performance Fixes (Quick Wins)

#### 1. Fix double YAML parse in `findRecentMeetings()`
**File**: `packages/core/src/services/meeting-context.ts`

Add `attendee_ids` to `ParsedMeetingFrontmatter` interface so it's parsed once with the rest of frontmatter.

**AC**:
- [ ] `ParsedMeetingFrontmatter` includes `attendee_ids?: string[]`
- [ ] `parseMeetingFile()` extracts `attendee_ids` from YAML
- [ ] Second YAML parse block removed from `findRecentMeetings()`
- [ ] Unit test: frontmatter with `attendee_ids` parsed correctly

---

#### 2. Add 60-day cutoff to `findRecentMeetings()`
**File**: `packages/core/src/services/meeting-context.ts`

Filter files by filename date (`YYYY-MM-DD-*.md`) before reading content.

**AC**:
- [ ] Files older than 60 days excluded before `storage.read()`
- [ ] Uses lexicographic date comparison (no Date parsing needed)
- [ ] Graceful handling of non-standard filenames (read anyway)
- [ ] Unit test: old meetings excluded

---

#### 3. Batch `findRecentMeetings()` across attendees
**File**: `packages/core/src/services/meeting-context.ts`

New function that reads each file once and checks all attendees:

```typescript
async function findRecentMeetingsForAttendees(
  storage: StorageAdapter,
  paths: WorkspacePaths,
  attendees: Array<{ slug: string; email: string }>,
  limit?: number
): Promise<Map<string, string[]>>
```

**AC**:
- [ ] Single pass through meeting files
- [ ] Returns `Map<slug, titles[]>` for all attendees
- [ ] `buildMeetingContext()` uses batched version
- [ ] 3× fewer file reads verified in test
- [ ] Follows core DI pattern (StorageAdapter, not fs)

---

### Phase 2: Dedup Infrastructure

#### 4. Add `priorItems` to extraction options
**File**: `packages/core/src/services/meeting-extraction.ts`

Extend the options interface:

```typescript
options?: {
  attendees?: string[];
  ownerSlug?: string;
  context?: MeetingContextBundle;
  priorItems?: Array<{ type: 'action' | 'decision' | 'learning'; text: string; source?: string }>;
}
```

**AC**:
- [ ] `extractMeetingIntelligence()` accepts `priorItems`
- [ ] Items passed to `buildMeetingExtractionPrompt()`
- [ ] `PriorItem` type exported from `packages/core/src/services/index.ts`

---

#### 5. Extend Jaccard dedup for prior items
**File**: `packages/core/src/services/meeting-processing.ts`

Extend existing `processMeetingExtraction()` to also compare against prior items (not just user notes).

**AC**:
- [ ] `ProcessingOptions` includes `priorItems?: Array<{ type, text }>`
- [ ] Items matching prior items (Jaccard > 0.7) marked `source: 'dedup'`
- [ ] Unit test: duplicate from prior meeting filtered out
- [ ] Deterministic fallback for prompt-based dedup
- [ ] Cap at 50 items to prevent memory bloat

---

#### 6. Strengthen extraction prompt for dedup
**File**: `packages/core/src/services/meeting-extraction.ts`

Consolidate dedup context into single Exclusion List with strong language:

```markdown
## Exclusion List (SKIP these — already captured)

The following items have ALREADY been extracted. Do NOT output these or any semantic equivalents:

**Staged Decisions:**
1. "Cover Whale is next priority" — source: CoverWhale Sync

**Staged Action Items:**
1. "[@john → @jamie] Send template list" — source: Lindsay 1:1

If the transcript mentions anything semantically equivalent, SKIP IT.
Exception: Extract if the transcript contains an UPDATE to an existing item.
```

**AC**:
- [ ] Single "Exclusion List" section (not 4 separate sections)
- [ ] Positive "SKIP" framing (not "do not")
- [ ] "semantic equivalent" language explicit
- [ ] "UPDATE" exception documented
- [ ] Renders recent decisions/learnings from `relatedContext`
- [ ] Token budget ~1000 tokens max for exclusion list

---

### Phase 3: Area Context Integration

#### 7. Add `areaParser` to `MeetingContextDeps`
**File**: `packages/core/src/services/meeting-context.ts`

Per core DI pattern, add AreaParserService to deps:

```typescript
export interface MeetingContextDeps {
  storage: StorageAdapter;
  intelligence: IntelligenceService;
  entity: EntityService;
  paths: WorkspacePaths;
  areaParser?: AreaParserService;  // NEW
}
```

**AC**:
- [ ] `MeetingContextDeps` includes optional `areaParser`
- [ ] `buildMeetingContext()` uses it when provided
- [ ] Falls back to constructing internally if not provided (backward compat)
- [ ] Follows testDeps pattern from core PROFILE.md

---

#### 7a. Wire `AreaParserService` into `createServices()` factory
**File**: `packages/core/src/factory.ts`

Add AreaParserService to AreteServices so CLI doesn't construct it directly.

**AC**:
- [ ] `AreteServices` interface includes `areaParser: AreaParserService`
- [ ] `createServices()` constructs `new AreaParserService(storage, root)`
- [ ] CLI commands can destructure `areaParser` from services
- [ ] Follows existing factory pattern (see `entity`, `context`, etc.)

---

#### 8. Add area context to `MeetingContextBundle`
**File**: `packages/core/src/services/meeting-context.ts`

After attendee resolution, resolve area and fetch context:

```typescript
const areaMatch = deps.areaParser 
  ? await deps.areaParser.getAreaForMeeting(frontmatter.title)
  : null;

let areaContext: AreaContext | null = null;
if (areaMatch) {
  areaContext = await deps.areaParser.getAreaContext(areaMatch.areaSlug);
}
```

**AC**:
- [ ] `MeetingContextBundle` has `areaContext?: AreaContext | null`
- [ ] Type exported from index.ts
- [ ] No error if no area match
- [ ] Area context included in `arete meeting context --json` output

---

#### 9. Include area content in extraction prompt
**File**: `packages/core/src/services/meeting-extraction.ts`

Add to `buildContextSection()`:

```markdown
### Area Context (Glance Communications)
**Current State**: Email migration in progress — 95% templates ready...

**Recent Area Decisions**:
- 2026-03-18: Account-cluster approach for migration
```

**AC**:
- [ ] Renders area name, current state (truncated to 500 chars)
- [ ] Shows last 5 Key Decisions from area file
- [ ] Section omitted if no area context

---

### Phase 4: Batch Orchestration

#### 10. Add `--prior-items` option to CLI
**File**: `packages/cli/src/commands/meeting.ts`

Add option to `arete meeting extract`:

```bash
arete meeting extract <file> --context - --prior-items /tmp/prior.json
```

**AC**:
- [ ] Accepts `--prior-items <file>` (JSON array)
- [ ] Accepts `--prior-items -` for stdin
- [ ] Validates JSON schema on read
- [ ] Passes to `extractMeetingIntelligence()` options
- [ ] Works with `--json` output per CLI pattern

---

#### 11. Thread `priorItems` through backend
**File**: `packages/apps/backend/src/services/agent.ts`

Update `runProcessingSession()` to accumulate and pass prior items:

**AC**:
- [ ] `runProcessingSession()` tracks extracted items across meetings
- [ ] Passes `priorItems` to `extractMeetingIntelligence()`
- [ ] Passes `priorItems` to `processMeetingExtraction()`
- [ ] Web app batch processing gets dedup behavior
- [ ] Integration test: CLI and backend produce identical dedup for same meeting

---

#### 12. Update process-meetings skill for sequential batch
**File**: `packages/runtime/skills/process-meetings/SKILL.md`

Document sequential processing with item accumulation:

**AC**:
- [ ] Skill documents chronological ordering requirement
- [ ] Documents `priorItems` accumulation pattern
- [ ] Includes example CLI pipeline for batch

---

## Size Estimate: **Large** (13 steps)

## Phased Execution

| Phase | Steps | Value | Risk |
|-------|-------|-------|------|
| **Phase 1: Perf** | 1-3 | Unblocks scale | Low |
| **Phase 2: Dedup** | 4-6 | Core feature | Medium (LLM behavior) |
| **Phase 3: Area** | 7-7a-8-9 | Context richness | Low |
| **Phase 4: Batch** | 10-12 | E2E integration | Medium (backend) |

**Recommendation**: Ship Phase 1 immediately (independent perf wins). Phases 2-3 can be parallel. Phase 4 depends on 2.

---

## Out of Scope

- Session-level meeting file cache (nice to have, not required)
- QMD-based attendee lookup (file scan with 60-day bound is sufficient)
- Combined `getAreaForMeetingWithContext()` (minor optimization)
- Word-boundary matching for area titles (rare false positives)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM ignores dedup | Jaccard post-processing as safety net (Step 5) |
| Over-suppresses updates | Explicit "UPDATE exception" in prompt (Step 6) |
| Backend diverges from CLI | Integration test AC in Step 11 |
| `priorItems` memory bloat | Cap at 50 items (Step 5) |
| Token budget exceeded | Cap exclusion list at ~1000 tokens (Step 6) |
