# PRD: Temporal Memory System

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-14  
**Branch**: `feature/temporal-memory`  

---

## 1. Problem & Goals

### Problem

Product builders need to answer questions like **"What do we know about feature X?"** — and get a synthesized narrative tracing all discussions, decisions, and current status across weeks or months of work.

Today's memory system finds file matches with recency weighting. What's needed is **temporal intelligence** — understanding when things were discussed, what decisions were made, how they connect, and what the current state is.

**Current limitations**:
1. **No topic tracking** — Can't query "everything related to checkout redesign"
2. **No decision chains** — Can't trace "we decided X, which led to Y"
3. **No narrative synthesis** — Search returns ranked snippets, not coherent stories
4. **Recency bias** — Important historical context gets buried

### Goals

1. **Topic/Entity Tracking** — Extract and index topics, features, and concepts mentioned across meetings and projects
2. **Decision Chains** — Link decisions to their context, rationale, and downstream effects  
3. **Temporal Search** — Query across time with narrative synthesis, not just recency-weighted file matches
4. **Deep Archive Access** — Surface relevant historical content without overwhelming context

### Success Criteria

1. After `process-meetings`, topics mentioned appear in `topics.md` with first/last mention dates
2. `arete memory history "checkout"` returns chronological narrative of all checkout-related discussions
3. Decisions link to topics and to each other (supersedes, led to)
4. "What do we know about X?" produces synthesized narrative, not file list

### Out of Scope

- People Intelligence (enrich profiles, meeting prep) — see backlog
- Preference Model (learn user style, corrections) — see backlog
- Workflow Patterns (proactive suggestions) — see backlog
- Auto-archive based on age thresholds
- UI/dashboard for memory visualization

---

## 2. CRITICAL: Orchestrator Instructions

**This PRD extends the existing memory system with new capabilities. Risk of breaking existing search is low but integration quality is critical.**

### Before Each Task

1. Provide subagent with **current state** (what files exist, what's been created)
2. Include explicit file paths to create/update
3. Reference the pre-mortem mitigations relevant to that task
4. For new files: specify exact location and format

### After Each Task

1. **Verify files created** at correct locations
2. **Run quality gates**: `npm run typecheck && npm test`
3. **Check existing memory search still works** (don't break `arete memory search`)
4. Only proceed after verification passes

### Between Tasks

1. Commit completed work with descriptive message
2. Update progress.txt with task status

### Test Strategy

- New tests for topic extraction, temporal search, decision chains
- Verify existing memory-retrieval tests still pass
- Integration tests for CLI commands

---

## 3. Pre-Mortem: Risk Analysis

### Risk 1: Topic Extraction Is Noisy

**Problem**: LLM extracts too many topics, or inconsistent topic names ("checkout", "checkout flow", "checkout redesign" as separate topics).

**Mitigation**:
- Define explicit topic extraction prompt with examples
- Normalize topics to canonical form (lowercase, hyphenated)
- Merge similar topics during indexing (fuzzy match)
- Add confidence threshold; only index high-confidence topics

**Verification**: After processing 10 meetings, topics.md has reasonable count (not hundreds) with consistent naming.

---

### Risk 2: Topics.md Grows Unbounded

**Problem**: Over time, topics.md becomes huge, slowing search and cluttering results.

**Mitigation**:
- Track last_mentioned date; stale topics (no mention in 90 days) marked as `status: stale`
- Search excludes stale topics by default (unless `--include-stale`)
- Periodic consolidation: merge rarely-mentioned topics into parent topics

**Verification**: `wc -l .arete/memory/items/topics.md` stays reasonable after months of use.

---

### Risk 3: Narrative Synthesis Is Slow

**Problem**: Generating narrative from historical data requires LLM call, adding latency.

**Mitigation**:
- Cache common queries (LRU cache with 1-hour TTL)
- Use fast model for synthesis (not full reasoning model)
- Stream response so user sees progress
- Provide "quick mode" that returns structured data without narrative

**Verification**: `arete memory history` completes in <5s for typical queries.

---

### Risk 4: Breaks Existing Memory Search

**Problem**: Changes to memory-retrieval.ts break `arete memory search`.

**Mitigation**:
- Topic search is **additive**, not replacement
- Existing token-based search path unchanged
- All existing tests must pass before proceeding
- New functions in separate file initially, then integrate

**Verification**: `npm test` passes with all existing memory tests; manual test of `arete memory search "pricing"`.

---

### Risk 5: Context Window Limits

**Problem**: Synthesizing narrative from year-old transcripts exceeds context limits.

**Mitigation**:
- Don't load full transcripts; load summaries and key excerpts
- Use search to find relevant sections, not full file reads
- Cap context at ~8K tokens for synthesis prompt
- Return "truncated: true" if more context available

**Verification**: Narrative synthesis works even with 20+ mentions across months.

---

### Risk 6: Decision Chains Are Sparse

**Problem**: Most decisions won't have "supersedes" or "led_to" populated; chains are incomplete.

**Mitigation**:
- Make chain fields optional (not required)
- Infer chains from temporal proximity and topic overlap
- Extract explicit chains when language indicates ("based on our earlier decision", "this replaces")
- Chains are enhancement, not requirement for basic functionality

**Verification**: System works without chains; chains improve results when present.

---

### Risk 7: GUIDE vs BUILD Confusion

**Problem**: Topic system affects both BUILD (this repo) and GUIDE (user workspaces). Implementation might target wrong location.

**Mitigation**:
- All new files go in `runtime/` (shipped to users) or `src/` (CLI)
- Test in user workspace context, not just this repo
- Memory paths use `paths.memory` (`.arete/memory/` for users)

**Verification**: After implementation, `arete memory history` works in fresh user workspace.

---

### Risk 8: Documentation Not Updated

**Problem**: New CLI commands and patterns not documented; users can't discover features.

**Mitigation**:
- Explicit documentation task in Phase D
- Checklist: GUIDE.md, PATTERNS.md, sources/guide/intelligence.md
- Rebuild AGENTS.md after updating sources

**Verification**: All files in checklist verified updated; `npm run build:agents:dev` succeeds.

---

## 4. Architecture

### Data Flow

```
User: "What do we know about checkout?"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                 TEMPORAL MEMORY SERVICE                      │
├─────────────────────────────────────────────────────────────┤
│  1. Topic Resolution                                         │
│     - "checkout" → topic:checkout-redesign (fuzzy match)     │
│                                                              │
│  2. Temporal Search                                          │
│     - Search topics.md for topic entry                       │
│     - Find all mentions (meetings, decisions, projects)      │
│     - Order chronologically                                  │
│                                                              │
│  3. Narrative Synthesis                                      │
│     - Load relevant excerpts (not full files)                │
│     - Generate chronological narrative via LLM               │
│     - Include current status                                 │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
"Checkout redesign was first discussed in Nov 2025 discovery.
 Key decision (Dec 15): single-page checkout, not multi-step.
 Guest checkout added (Jan 8) after customer feedback.
 Currently: in development, target Feb 28 launch."
```

### Storage Model

#### Topics Index (`.arete/memory/items/topics.md`)

```markdown
# Topics Index

> Auto-generated index of topics discussed across meetings, decisions, and projects.
> Do not edit manually — updated by process-meetings and related skills.

---

### checkout-redesign
**First mentioned**: 2025-11-15
**Last mentioned**: 2026-02-10
**Status**: active
**Aliases**: checkout, checkout flow, checkout ux
**Related decisions**: 
  - checkout-single-page (2025-12-15)
  - checkout-guest-flow (2026-01-08)
**Mentions**: 12
**Sources**:
  - meetings: 8 (resources/meetings/2025-11-15-*.md, ...)
  - decisions: 2 (.arete/memory/items/decisions.md)
  - projects: 1 (projects/active/checkout-redesign-prd/)

---

### ai-recommendations
**First mentioned**: 2026-01-08
**Last mentioned**: 2026-01-20
**Status**: stale
**Aliases**: ai recs, recommendation engine
**Related decisions**:
  - defer-ai-q2 (2026-01-20)
**Mentions**: 4
**Sources**:
  - meetings: 3
  - decisions: 1
```

#### Enhanced Decisions Format

Add to existing format in `.arete/memory/items/decisions.md`:

```markdown
### 2025-12-15: Single-Page Checkout
**Project**: checkout-redesign
**Context**: Discovery showed users abandon multi-step checkout
**Decision**: Consolidate to single-page checkout with progressive disclosure
**Rationale**: 15% cart abandonment at step 2; users want to see total before committing
**Alternatives Considered**: Multi-step with progress bar; slide-out cart
**Topics**: checkout-redesign, ux
**Supersedes**: None
**Led to**: checkout-guest-flow (guest checkout decision built on this)
**Status**: Active
```

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/topic-index.ts` | Create | Topic extraction, indexing, search |
| `src/core/temporal-search.ts` | Create | Temporal queries, narrative synthesis |
| `src/core/memory-retrieval.ts` | Extend | Add topic-aware search mode |
| `src/commands/intelligence.ts` | Extend | Add `memory history` subcommand |
| `src/types.ts` | Extend | Add Topic, TemporalSearchResult types |
| `runtime/skills/PATTERNS.md` | Extend | Add extract_topics pattern |
| `runtime/skills/process-meetings/SKILL.md` | Extend | Call topic extraction |
| `.agents/sources/guide/intelligence.md` | Extend | Document temporal memory |
| `runtime/GUIDE.md` | Extend | Document new CLI and features |

---

## 5. Implementation Tasks

### Phase A: Topic Infrastructure (Tasks 1-4)

#### Task 1: Define Topic Types

**Description**: Add TypeScript types for topics and temporal search.

**Files to modify**:
- `src/types.ts`

**Types to add**:

```typescript
/** Topic status */
export type TopicStatus = 'active' | 'stale' | 'archived';

/** A topic tracked in the temporal memory system */
export interface Topic {
  id: string;                    // Canonical slug (lowercase, hyphenated)
  aliases: string[];             // Alternative names that map to this topic
  firstMentioned: string;        // ISO date
  lastMentioned: string;         // ISO date
  status: TopicStatus;
  relatedDecisions: string[];    // Decision titles
  mentionCount: number;
  sources: {
    meetings: string[];          // File paths
    decisions: string[];         // Decision titles
    projects: string[];          // Project paths
  };
}

/** Temporal search result */
export interface TemporalSearchResult {
  topic: Topic;
  mentions: TemporalMention[];
  narrative?: string;
  synthesizedAt?: string;
}

/** A single mention of a topic in time */
export interface TemporalMention {
  date: string;
  source: string;                // File path or "decisions.md"
  type: 'meeting' | 'decision' | 'project' | 'learning';
  excerpt: string;               // Relevant snippet
  context?: string;              // Surrounding context
}

/** Options for temporal search */
export interface TemporalSearchOptions {
  includeStale?: boolean;        // Include stale topics (default: false)
  synthesize?: boolean;          // Generate narrative (default: true)
  limit?: number;                // Max mentions to include
}
```

**Acceptance Criteria**:
- Types compile without errors
- Types exported from types.ts
- `npm run typecheck` passes

**Commit**: "feat(types): add Topic and TemporalSearch types"

---

#### Task 2: Create Topic Index Service

**Description**: Create the core topic extraction and indexing service.

**Files to create**:
- `src/core/topic-index.ts`

**Functions to implement**:

```typescript
/**
 * Extract topics from text content using token matching and patterns.
 * Returns array of candidate topics with confidence scores.
 */
export function extractTopics(content: string): TopicCandidate[];

/**
 * Normalize topic name to canonical form.
 * "Checkout Flow" → "checkout-flow"
 * "the checkout redesign project" → "checkout-redesign"
 */
export function normalizeTopicName(name: string): string;

/**
 * Load topics index from workspace.
 * Returns Map<topicId, Topic>.
 */
export function loadTopicsIndex(paths: WorkspacePaths): Map<string, Topic>;

/**
 * Save topics index to workspace.
 */
export function saveTopicsIndex(topics: Map<string, Topic>, paths: WorkspacePaths): void;

/**
 * Add or update a topic mention.
 * Creates topic if new; updates dates and sources if existing.
 */
export function addTopicMention(
  topics: Map<string, Topic>,
  topicName: string,
  mention: { date: string; source: string; type: TemporalMention['type'] }
): void;

/**
 * Find topic by name or alias (fuzzy match).
 */
export function findTopic(topics: Map<string, Topic>, query: string): Topic | null;

/**
 * Parse topics.md file into Topic objects.
 */
export function parseTopicsFile(content: string): Map<string, Topic>;

/**
 * Serialize topics to markdown format.
 */
export function serializeTopics(topics: Map<string, Topic>): string;
```

**Topic extraction approach** (no LLM required for v1):
1. Extract capitalized multi-word phrases ("Checkout Redesign", "AI Recommendations")
2. Extract phrases after "about", "regarding", "for" ("meeting about checkout")
3. Extract project names from file paths
4. Filter common words and known non-topics

**Acceptance Criteria**:
- All functions implemented
- `npm run typecheck` passes
- Unit tests for normalizeTopicName, parseTopicsFile, serializeTopics

**Commit**: "feat(core): add topic-index service"

---

#### Task 3: Create Topics.md Template

**Description**: Add topics.md to workspace structure for new and existing workspaces.

**Files to modify**:
- `src/core/workspace-structure.ts` — Add topics.md to DEFAULT_FILES

**Template content**:

```markdown
# Topics Index

> Auto-generated index of topics discussed across meetings, decisions, and projects.
> Updated by process-meetings and related skills. Do not edit manually.

---

<!-- Topics will be added here as they're extracted from your meetings and work -->
```

**Acceptance Criteria**:
- `arete install` creates `.arete/memory/items/topics.md`
- `arete update` adds topics.md to existing workspaces
- Template content matches spec

**Commit**: "feat(workspace): add topics.md template to memory structure"

---

#### Task 4: Write Topic Index Tests

**Description**: Create comprehensive tests for topic-index service.

**Files to create**:
- `test/core/topic-index.test.ts`

**Test cases**:
1. `normalizeTopicName` — Various inputs (caps, spaces, articles, prefixes)
2. `extractTopics` — From meeting content, decision content, project README
3. `parseTopicsFile` — Parse sample topics.md
4. `serializeTopics` — Round-trip (parse → serialize → parse)
5. `addTopicMention` — New topic, existing topic, alias resolution
6. `findTopic` — Exact match, alias match, fuzzy match, no match

**Acceptance Criteria**:
- All tests pass
- Coverage for core functions
- `npm test` passes

**Commit**: "test(core): add topic-index tests"

---

### Phase B: Temporal Search (Tasks 5-8)

#### Task 5: Create Temporal Search Service

**Description**: Implement temporal search that finds topic mentions across time.

**Files to create**:
- `src/core/temporal-search.ts`

**Functions to implement**:

```typescript
/**
 * Search for all mentions of a topic across time.
 * Returns chronologically ordered mentions from meetings, decisions, projects.
 */
export async function searchTopicHistory(
  query: string,
  paths: WorkspacePaths,
  options?: TemporalSearchOptions
): Promise<TemporalSearchResult>;

/**
 * Load mentions from meetings for a topic.
 */
async function searchMeetings(
  topic: Topic,
  paths: WorkspacePaths
): Promise<TemporalMention[]>;

/**
 * Load mentions from decisions for a topic.
 */
async function searchDecisions(
  topic: Topic,
  paths: WorkspacePaths
): Promise<TemporalMention[]>;

/**
 * Load mentions from projects for a topic.
 */
async function searchProjects(
  topic: Topic,
  paths: WorkspacePaths
): Promise<TemporalMention[]>;

/**
 * Generate narrative synthesis from mentions.
 * Uses simple template-based approach (no LLM for v1).
 */
export function synthesizeNarrative(
  topic: Topic,
  mentions: TemporalMention[]
): string;
```

**Narrative synthesis approach (v1 — no LLM)**:
```
"[Topic] was first discussed on [date] in [source].
Key events:
- [date]: [excerpt] ([source])
- [date]: [excerpt] ([source])
...
Current status: [active/stale]. Last mentioned [date]."
```

**Acceptance Criteria**:
- Functions implemented
- `npm run typecheck` passes
- Handles missing topics gracefully

**Commit**: "feat(core): add temporal-search service"

---

#### Task 6: Extend Memory Retrieval with Topic Mode

**Description**: Add topic-aware search mode to existing memory-retrieval.

**Files to modify**:
- `src/core/memory-retrieval.ts`

**Changes**:
1. Add `mode` option to `MemorySearchOptions`: `'standard' | 'topic' | 'history'`
2. When `mode: 'topic'`, delegate to topic-index `findTopic`
3. When `mode: 'history'`, delegate to temporal-search `searchTopicHistory`
4. Default mode remains `'standard'` (existing behavior unchanged)

**New function**:

```typescript
/**
 * Extended search that supports topic and history modes.
 */
export async function searchMemoryExtended(
  query: string,
  paths: WorkspacePaths,
  options: MemorySearchOptions & { mode?: 'standard' | 'topic' | 'history' }
): Promise<MemorySearchResult | TemporalSearchResult>;
```

**Acceptance Criteria**:
- Existing `searchMemory` behavior unchanged
- New `searchMemoryExtended` supports all modes
- All existing tests pass
- `npm run typecheck` passes

**Commit**: "feat(core): extend memory-retrieval with topic and history modes"

---

#### Task 7: Add CLI Command for Temporal Search

**Description**: Add `arete memory history "topic"` CLI command.

**Files to modify**:
- `src/commands/intelligence.ts`

**Command spec**:

```
arete memory history "query" [options]

Options:
  --include-stale    Include stale topics (not mentioned in 90+ days)
  --no-narrative     Return structured data without narrative synthesis
  --limit N          Max mentions to include (default: 20)
  --json             Output as JSON
```

**Example output (human)**:

```
Topic: checkout-redesign

First mentioned: 2025-11-15
Last mentioned: 2026-02-10
Status: active
Mentions: 12

Timeline:
  2025-11-15  [meeting] Discovery kickoff — "discussed checkout pain points"
  2025-12-01  [meeting] User research review — "users abandon at step 2"
  2025-12-15  [decision] Single-page checkout — "consolidate to single page"
  2026-01-08  [decision] Guest checkout — "allow checkout without account"
  2026-02-10  [meeting] Sprint planning — "checkout redesign in sprint 4"

Summary:
Checkout redesign was first discussed in November 2025 discovery. Key decision
on Dec 15: single-page checkout instead of multi-step. Guest checkout added
Jan 8 based on customer feedback. Currently active, last discussed Feb 10.
```

**Acceptance Criteria**:
- Command registered and callable
- Human-readable and JSON output modes
- Help text accurate
- `npm run typecheck` passes

**Commit**: "feat(cli): add memory history command for temporal search"

---

#### Task 8: Write Temporal Search Tests

**Description**: Create tests for temporal-search service and CLI.

**Files to create**:
- `test/core/temporal-search.test.ts`
- `test/commands/intelligence.test.ts` (extend if exists)

**Test cases**:
1. `searchTopicHistory` — Found topic, not found, stale topic
2. `searchMeetings` — Meetings with topic, no matches
3. `synthesizeNarrative` — With mentions, empty mentions, single mention
4. CLI integration — `memory history` with various options

**Acceptance Criteria**:
- All tests pass
- `npm test` passes

**Commit**: "test(core): add temporal-search tests"

---

### Phase C: Process-Meetings Integration (Tasks 9-11)

#### Task 9: Add extract_topics Pattern

**Description**: Add topic extraction pattern to PATTERNS.md.

**Files to modify**:
- `runtime/skills/PATTERNS.md`

**Pattern to add**:

```markdown
## extract_topics

**Purpose**: Extract topics/features/concepts discussed in content for temporal indexing.

**Used by**: process-meetings, sync, finalize-project

**Steps**:

1. **Scan for topic indicators**:
   - Capitalized multi-word phrases ("Checkout Redesign", "User Onboarding")
   - Phrases after "about", "regarding", "for", "on" ("meeting about pricing")
   - Project/feature names mentioned explicitly
   - Repeated terms (3+ mentions = likely topic)

2. **Normalize topics**:
   - Lowercase with hyphens: "Checkout Redesign" → "checkout-redesign"
   - Remove articles: "the checkout flow" → "checkout-flow"
   - Merge obvious duplicates: "checkout", "checkout flow" → use existing topic

3. **Check existing topics**:
   - Load `.arete/memory/items/topics.md`
   - Match extracted topics to existing (exact or alias)
   - New topics get created; existing topics get updated

4. **Update topics index**:
   - Add/update topic entry with: firstMentioned, lastMentioned, source
   - Add to aliases if new variation discovered
   - Increment mention count

**Outputs**: Topics extracted and indexed; topics.md updated.

**Note**: This pattern uses rules-based extraction (no LLM required). For higher quality extraction, skills may optionally use LLM to identify topics.
```

**Acceptance Criteria**:
- Pattern added to PATTERNS.md
- Format consistent with existing patterns
- Steps are clear and actionable

**Commit**: "docs(patterns): add extract_topics pattern"

---

#### Task 10: Extend process-meetings with Topic Extraction

**Description**: Update process-meetings skill to extract topics.

**Files to modify**:
- `runtime/skills/process-meetings/SKILL.md`

**Changes**:
1. Add step after "Extract Decisions and Learnings":
   ```
   ### 5. Extract Topics
   
   Use the **extract_topics** pattern — see [PATTERNS.md](../PATTERNS.md). 
   Scan meeting content for topics discussed; update `.arete/memory/items/topics.md`.
   ```

2. Update Summary section to include topics:
   ```
   Report: meetings processed, people created/updated, decisions and learnings 
   added, topics extracted.
   ```

3. Add to Arguments:
   ```
   - `--no-topics` — skip topic extraction
   ```

**Acceptance Criteria**:
- Skill updated with topic extraction step
- Pattern reference correct
- Arguments documented

**Commit**: "feat(skills): add topic extraction to process-meetings"

---

#### Task 11: Add Enhanced Decision Format to PATTERNS.md

**Description**: Update decision format to support chains and topics.

**Files to modify**:
- `runtime/skills/PATTERNS.md`

**Changes to Decision format**:

```markdown
**Decision format** (append to decisions.md):

```markdown
### YYYY-MM-DD: [Decision Title]
**Project**: [If applicable]
**Context**: [What led to this decision]
**Decision**: [What was decided]
**Rationale**: [Why this choice]
**Alternatives Considered**: [If known]
**Topics**: [topic-1, topic-2] (optional — for temporal indexing)
**Supersedes**: [Previous decision title] (optional — if this replaces an earlier decision)
**Led to**: [Later decision title] (optional — added when downstream decisions reference this)
**Status**: Active | Superseded | Reconsidering
```

**Note**: Topics, Supersedes, and Led to are optional fields that enhance temporal search. Skills should populate Topics when clear; Supersedes when explicitly replacing a decision; Led to is typically backfilled when a later decision references this one.
```

**Acceptance Criteria**:
- Format updated with new fields
- Fields marked as optional
- Usage guidance clear

**Commit**: "docs(patterns): add Topics, Supersedes, Led to fields to decision format"

---

### Phase D: Documentation and Integration (Tasks 12-15)

#### Task 12: Update GUIDE.md

**Description**: Document temporal memory in user-facing guide.

**Files to modify**:
- `runtime/GUIDE.md`

**Sections to update/add**:

1. **CLI Reference** — Add `memory history` command:
   ```markdown
   arete memory history "topic"     Search topic history across time
   ```

2. **Intelligence Services** — Add Temporal Memory section:
   ```markdown
   ### Temporal Memory
   
   **Command**: `arete memory history "topic"`
   
   **Purpose**: Trace the history of a topic across meetings, decisions, and 
   projects. Returns chronological narrative of all discussions.
   
   **Example**:
   ```bash
   arete memory history "checkout"
   ```
   
   Returns timeline of all checkout-related discussions, key decisions, and 
   current status.
   ```

3. **Memory System** — Add topics layer:
   ```markdown
   **Four layers**:
   
   1. **L1: Resources** (`resources/`) - Raw immutable inputs
   2. **L2: Items** (`.arete/memory/items/`) - Decisions, learnings, topics
   3. **L3: Summaries** (`.arete/memory/summaries/`) - Collaboration profile
   4. **L4: Temporal** - Cross-references and chains (embedded in items)
   ```

**Acceptance Criteria**:
- All sections updated
- Examples accurate
- Consistent with existing style

**Commit**: "docs(guide): add temporal memory documentation"

---

#### Task 13: Update AGENTS.md Sources

**Description**: Update intelligence source file for AGENTS.md compilation.

**Files to modify**:
- `.agents/sources/guide/intelligence.md`

**Changes**:
1. Add `memory history` to CLI commands section
2. Add temporal memory description to Memory section
3. Mention topics.md in memory locations

**Acceptance Criteria**:
- Source file updated
- Follows pipe-delimited format where applicable
- Ready for AGENTS.md rebuild

**Commit**: "docs(sources): add temporal memory to intelligence.md"

---

#### Task 14: Rebuild AGENTS.md

**Description**: Regenerate AGENTS.md from updated sources.

**Commands**:
```bash
npm run build:agents:dev
npm run build
```

**Verification**:
- `wc -c AGENTS.md` — Still under 10KB
- `head -n 5 AGENTS.md` — Shows updated timestamp
- Grep for "memory history" — Should appear

**Acceptance Criteria**:
- Both AGENTS.md files regenerated
- Size under 10KB
- New content appears in compressed format

**Commit**: "chore: rebuild AGENTS.md with temporal memory"

---

#### Task 15: Create Backlog Items for Deferred Pillars

**Description**: Add backlog items for the other three memory pillars.

**Files to create**:
- `dev/backlog/features/people-intelligence.md`
- `dev/backlog/features/preference-model.md`
- `dev/backlog/features/workflow-patterns.md`

**Content for each** (brief, links to plan):

```markdown
# [Pillar Name]

**Status**: Backlog  
**Priority**: Medium  
**Related**: Temporal Memory PRD (completed), Agent Memory Research plan

## Summary

[1-2 sentence description]

## Goals

[3-4 bullet points from original plan]

## Key Deliverables

[Bulleted list of main outcomes]

## Dependencies

- Temporal Memory System (this unlocks topic linking for people/projects)

## References

- Original plan: [link to plan file]
- Memory entry: [link after temporal memory complete]
```

**Acceptance Criteria**:
- Three backlog files created
- Content derived from plan discussion
- Properly categorized in features/

**Commit**: "chore(backlog): add deferred memory pillars to backlog"

---

#### Task 16: Final Verification and Memory Entry

**Description**: Verify all tasks complete, create memory entry.

**Verification checklist**:
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all tests, including new ones)
- [ ] `arete memory search "test"` still works (existing functionality)
- [ ] `arete memory history "test"` works (new functionality)
- [ ] GUIDE.md updated
- [ ] AGENTS.md regenerated
- [ ] Backlog items created

**Memory entry**: Create `memory/entries/2026-02-XX_temporal-memory-system.md` with:
- What changed
- Metrics (tasks completed, tests added)
- Pre-mortem effectiveness
- What worked / what didn't
- Learnings

**Acceptance Criteria**:
- All verification items pass
- Memory entry created
- Ready for merge

**Commit**: "docs(memory): add temporal memory system entry"

---

## 6. Documentation Checklist

### MUST Update

| File | Section | Change |
|------|---------|--------|
| `runtime/GUIDE.md` | CLI Reference | Add `memory history` |
| `runtime/GUIDE.md` | Intelligence Services | Add Temporal Memory |
| `runtime/GUIDE.md` | Memory System | Add topics layer |
| `runtime/skills/PATTERNS.md` | Patterns | Add extract_topics |
| `runtime/skills/PATTERNS.md` | Decision format | Add Topics, Supersedes, Led to |
| `runtime/skills/process-meetings/SKILL.md` | Workflow | Add topic extraction step |
| `.agents/sources/guide/intelligence.md` | Memory | Add temporal memory |

### MUST Check (may not need changes)

| File | Check |
|------|-------|
| `src/cli.ts` | Help text includes memory history |
| `DEVELOPER.md` | No stale references |
| `README.md` | No stale references |

### MUST Rebuild

| File | Command |
|------|---------|
| `AGENTS.md` | `npm run build:agents:dev` |
| `dist/AGENTS.md` | `npm run build` |

---

## 7. Test Strategy

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `test/core/topic-index.test.ts` | normalize, extract, parse, serialize, find |
| `test/core/temporal-search.test.ts` | searchTopicHistory, synthesize |

### Integration Tests

| Test | Description |
|------|-------------|
| Memory history CLI | `arete memory history` with various inputs |
| Process-meetings topics | Topics extracted after processing |
| Existing memory search | Regression — existing behavior unchanged |

### Manual Verification

1. Install fresh workspace
2. Add sample meetings with topics
3. Run `arete memory history "topic"` — verify output
4. Run `arete memory search "query"` — verify still works

---

## 8. Rollback Plan

If issues arise post-merge:

1. **Topic extraction causing errors**: 
   - Disable in process-meetings with `--no-topics` flag
   - Remove extract_topics call from skill

2. **Memory history CLI broken**:
   - Command fails gracefully with helpful error
   - Existing `memory search` unaffected

3. **Topics.md corrupted**:
   - Delete file; will be recreated on next process-meetings
   - No data loss (source data in meetings/decisions unchanged)

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Tasks completed | 16/16 |
| Tests passing | All (existing + new) |
| Regressions | 0 |
| Pre-mortem risks materialized | 0 |
| Documentation complete | All checklist items |

---

## 10. Future Enhancements (Post-MVP)

1. **LLM-based topic extraction** — Higher quality than rules-based
2. **Topic merging UI** — User can merge/rename topics
3. **Decision chain visualization** — See how decisions connect
4. **Auto-archive stale topics** — Clean up old topics automatically
5. **Integration with briefing** — Temporal context in skill briefings

---

## Appendix: Example Topics.md After Processing

```markdown
# Topics Index

> Auto-generated index of topics discussed across meetings, decisions, and projects.
> Updated by process-meetings and related skills. Do not edit manually.

---

### checkout-redesign
**First mentioned**: 2025-11-15
**Last mentioned**: 2026-02-10
**Status**: active
**Aliases**: checkout, checkout flow, checkout ux, single page checkout
**Related decisions**: 
  - Single-Page Checkout (2025-12-15)
  - Guest Checkout (2026-01-08)
**Mentions**: 12
**Sources**:
  - meetings: resources/meetings/2025-11-15-discovery-kickoff.md, resources/meetings/2025-12-01-user-research.md, resources/meetings/2025-12-15-architecture-review.md, resources/meetings/2026-01-08-customer-feedback.md, resources/meetings/2026-02-10-sprint-planning.md
  - decisions: Single-Page Checkout, Guest Checkout
  - projects: projects/active/checkout-redesign-prd/

---

### pricing-model
**First mentioned**: 2025-10-01
**Last mentioned**: 2025-11-20
**Status**: stale
**Aliases**: pricing, subscription pricing
**Related decisions**:
  - Annual Pricing Discount (2025-10-15)
**Mentions**: 6
**Sources**:
  - meetings: resources/meetings/2025-10-01-strategy-review.md, resources/meetings/2025-10-15-pricing-deep-dive.md
  - decisions: Annual Pricing Discount

---
```
