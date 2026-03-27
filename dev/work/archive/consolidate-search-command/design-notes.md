# Design Notes: Consolidate Search Command

> Task 0.1 deliverable — output schemas, scope mapping, and test coverage matrix for implementation.

---

## 1. Output Schemas

Three distinct output schemas based on mode. All share `success` and `query` fields.

### 1.1 Default Search Schema

Used when neither `--timeline` nor `--answer` flags are present.

```typescript
interface SearchResultItem {
  path: string;      // Relative path to matching file
  title: string;     // Extracted title or filename
  snippet: string;   // Context snippet around match
  score: number;     // Relevance score (0-1)
}

interface SearchOutput {
  success: boolean;
  query: string;
  scope: 'all' | 'memory' | 'meetings' | 'context' | 'projects' | 'people';
  results: SearchResultItem[];
  total: number;     // Total matches (may exceed results.length due to --limit)
}
```

**Notes**:
- `title` derived from frontmatter, first heading, or filename
- `snippet` is ~150 chars of context around first match
- `score` normalized to 0-1 range (QMD scores may need normalization)

### 1.2 Timeline Schema

Used when `--timeline` flag is present.

```typescript
interface TimelineItem {
  date: string;      // ISO 8601 date (YYYY-MM-DD)
  title: string;     // Document title
  source: string;    // Relative path to file
  type: 'meeting' | 'decision' | 'learning' | 'observation' | 'context';
}

interface TimelineOutput {
  success: boolean;
  query: string;
  scope: 'all' | 'memory' | 'meetings' | 'context' | 'projects' | 'people';
  items: TimelineItem[];          // Sorted chronologically (newest first)
  themes: string[];               // Recurring themes extracted from results
  dateRange: {
    start: string;   // ISO 8601 date
    end: string;     // ISO 8601 date
  };
}
```

**Notes**:
- `type` derived from file location (meetings/ → meeting, memory/items/ → decision/learning/observation)
- `themes` uses existing `MemoryService.getTimeline()` theme extraction logic
- `dateRange` reflects actual date bounds of returned items (respects `--days` filter)

### 1.3 Answer Schema

Used when `--answer` flag is present.

```typescript
interface AnswerOutput {
  success: boolean;
  query: string;
  scope: 'all' | 'memory' | 'meetings' | 'context' | 'projects' | 'people';
  results: SearchResultItem[];    // Same as default schema
  answer: string;                 // AI-synthesized answer with citations
  intent?: string;                // Derived intent passed to QMD (if any)
}
```

**Notes**:
- `answer` is markdown-formatted synthesis from AIService
- `intent` included when derived from query patterns (for debugging/transparency)
- On AI error: `success: true`, `answer: null`, plus `error: string` field

### 1.4 Error Schema

Used when search fails (QMD not available, workspace not found, etc.).

```typescript
interface ErrorOutput {
  success: false;
  error: string;
  code?: 'QMD_NOT_AVAILABLE' | 'WORKSPACE_NOT_FOUND' | 'PERSON_NOT_FOUND' | 
         'PERSON_AMBIGUOUS' | 'AI_NOT_CONFIGURED' | 'AI_ERROR';
}
```

### 1.5 Deprecation Schema Extension

Added to deprecated command outputs (context --for, memory search, memory timeline).

```typescript
interface DeprecatedOutput {
  deprecated: true;
  migrationCommand: string;  // e.g., "arete search 'your query'"
  // ... plus original command output fields
}
```

---

## 2. Scope-to-Collection Mapping

Defines how `--scope` flag maps to QMD collection names for Task 2.1 implementation.

```typescript
/**
 * Maps search scopes to QMD collection suffixes.
 * Full collection name: `arete-{workspace-id}-{suffix}`
 * 
 * Example: workspace ID "abc123"
 *   --scope memory → collection "arete-abc123-memory"
 *   --scope all → collection "arete-abc123-all"
 */
const SCOPE_COLLECTION_MAP: Record<SearchScope, string> = {
  all: 'all',
  memory: 'memory',
  meetings: 'meetings',
  context: 'context',
  projects: 'projects',
  people: 'people',
};

type SearchScope = keyof typeof SCOPE_COLLECTION_MAP;
```

### Collection-to-Path Mapping (for QMD indexing)

Used in Task 1.1 for multi-collection setup:

```typescript
/**
 * Maps collection types to workspace paths for QMD indexing.
 * Paths are relative to workspace root.
 */
const COLLECTION_PATHS: Record<SearchScope, string[]> = {
  all: ['.'],  // Everything (default behavior)
  memory: ['.arete/memory/items/'],
  meetings: ['resources/meetings/'],
  context: ['context/', 'goals/'],
  projects: ['projects/'],
  people: ['people/'],
};
```

---

## 3. Test Coverage Matrix

### 3.1 Scope Tests

| Test Case | Command | Expected Behavior |
|-----------|---------|-------------------|
| Search all (default) | `search "query"` | Returns results from all collections |
| Search all (explicit) | `search "query" --scope all` | Same as default |
| Search memory | `search "query" --scope memory` | Returns only from .arete/memory/items/ |
| Search meetings | `search "query" --scope meetings` | Returns only from resources/meetings/ |
| Search context | `search "query" --scope context` | Returns from context/ and goals/ |
| Search projects | `search "query" --scope projects` | Returns only from projects/ |
| Search people | `search "query" --scope people` | Returns only from people/ |
| Invalid scope | `search "query" --scope invalid` | Error: invalid scope value |

### 3.2 Person Filtering Tests

| Test Case | Scenario | Expected Behavior |
|-----------|----------|-------------------|
| Person resolved | `--person "jane"` resolves to one person | Results filtered to mention that person |
| Person ambiguous | `--person "john"` matches multiple | Error with list of matching people + slugs |
| Person not found | `--person "unknown"` | Error: "Person not found: unknown" |
| Person + scope | `--person "jane" --scope meetings` | Scope filter applied, then person filter |
| Person case-insensitive | `--person "JANE"` | Same as lowercase resolution |

### 3.3 Timeline Tests

| Test Case | Command | Expected Behavior |
|-----------|---------|-------------------|
| Timeline mode | `search "query" --timeline` | Results sorted chronologically with dates |
| Timeline with days | `search "query" --timeline --days 30` | Only results from last 30 days |
| Timeline days=0 | `search "query" --timeline --days 0` | Today only |
| Timeline themes | `search "query" --timeline` | `themes` array populated |
| Timeline + scope | `search "query" --timeline --scope memory` | Chronological memory items |
| Timeline + JSON | `search "query" --timeline --json` | Uses TimelineOutput schema |
| Days without timeline | `search "query" --days 30` | Error or ignored (TBD: warn and ignore) |

### 3.4 Answer Tests

| Test Case | Scenario | Expected Behavior |
|-----------|----------|-------------------|
| Answer with AI configured | `--answer` with valid AI config | Returns results + synthesized answer |
| Answer without AI | `--answer` with no AI configured | Warning on STDERR, results only (no answer field) |
| Answer with AI error | AI call fails | Warning on STDERR, results returned, `error` field in JSON |
| Answer + scope | `search "query" --answer --scope memory` | Synthesis from memory scope only |
| Answer + person | `search "query" --answer --person "jane"` | Synthesis with person filter applied first |
| Answer + JSON | `search "query" --answer --json` | Uses AnswerOutput schema |

### 3.5 Intent Derivation Tests

| Query Pattern | Expected Intent |
|---------------|-----------------|
| "what did we decide about X" | "past decisions and rationale" |
| "who should I talk to about X" | "finding people or contacts" |
| "why did we X" | "historical context and reasoning" |
| "when did we X" | "timeline and dates of events" |
| "what is X" / "what are X" | "definitions and explanations" |
| "how do we X" | "processes and procedures" |
| No pattern match | No intent derived (omit --intent flag) |

### 3.6 Flag Combination Tests

| Test Case | Flags | Expected Behavior |
|-----------|-------|-------------------|
| Scope + timeline | `--scope memory --timeline` | Timeline view of memory items |
| Scope + answer | `--scope meetings --answer` | Synthesis from meetings only |
| Timeline + answer | `--timeline --answer` | Error: mutually exclusive |
| Scope + person + timeline | `--scope meetings --person "jane" --timeline` | Timeline of meetings mentioning jane |
| All flags (invalid) | `--timeline --answer --person "x"` | Error: timeline and answer are mutually exclusive |
| Limit + any mode | `--limit 5 --timeline` | Max 5 timeline items |

### 3.7 Output Format Tests

| Test Case | Command | Expected |
|-----------|---------|----------|
| Human-readable (default) | `search "query"` | Formatted console output |
| JSON default search | `search "query" --json` | SearchOutput schema |
| JSON timeline | `search "query" --timeline --json` | TimelineOutput schema |
| JSON answer | `search "query" --answer --json` | AnswerOutput schema |
| JSON error | `search "query" --scope invalid --json` | ErrorOutput schema |

### 3.8 Deprecation Tests

| Test Case | Command | Expected |
|-----------|---------|----------|
| context --for warning | `context --for "query"` | STDERR: deprecation warning |
| context --for JSON | `context --for "query" --json` | `deprecated: true` in output |
| memory search warning | `memory search "query"` | STDERR: deprecation warning |
| memory search JSON | `memory search "query" --json` | `deprecated: true` in output |
| memory timeline warning | `memory timeline "query"` | STDERR: deprecation warning |
| memory timeline JSON | `memory timeline "query" --json` | `deprecated: true` in output |
| Warning includes migration | any deprecated command | Warning includes specific `arete search` equivalent |

### 3.9 Infrastructure Tests

| Test Case | Scenario | Expected |
|-----------|----------|----------|
| Fresh install | New workspace | 6 QMD collections created |
| Old config format | `qmd_collection: "..."` | Treated as `all` collection, search works |
| New config format | `qmd_collections: {...}` | All scopes available |
| arete update | Existing workspace | Collections maintained/updated |
| QMD not available | QMD not installed | Graceful error with install instructions |
| Workspace not found | Outside workspace | Error: "Not in an Areté workspace" |

### 3.10 Edge Cases

| Test Case | Scenario | Expected |
|-----------|----------|----------|
| Empty query | `search ""` | Error: query required |
| Very long query | 1000+ char query | Truncated or error (TBD) |
| No results | Valid query, no matches | Empty results array, success: true |
| Special characters | `search "foo & bar"` | Properly escaped for QMD |
| Unicode query | `search "日本語"` | Works correctly |
| Limit 0 | `search "query" --limit 0` | Error: limit must be positive |
| Limit negative | `search "query" --limit -1` | Error: limit must be positive |

---

## 4. Implementation Notes

### QMD CLI Integration

```bash
# Basic search (passes -c for collection)
qmd query -c arete-{id}-{scope} "query" --limit N

# With intent (when --answer and pattern matched)
qmd query -c arete-{id}-{scope} "query" --intent "past decisions and rationale"
```

### Person Filter Implementation

1. Call `EntityService.resolve(name)` 
2. Handle three cases:
   - Single match → extract person slug, add to search filter
   - Multiple matches → throw with list of options
   - No match → throw "Person not found"
3. Filter logic: check if result content mentions person name/slug

### Timeline + Themes

Reuse `MemoryService.getTimeline()` theme extraction:
- Extract dates from file paths or frontmatter
- Sort by date descending
- Apply Jaccard similarity for theme clustering

---

## 5. Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| `--days` without `--timeline`? | Warn and ignore (not an error) |
| `--timeline` + `--answer`? | Mutually exclusive (error) |
| Empty results JSON? | `success: true`, empty `results` array |
| Intent in JSON output? | Include when derived (transparency) |

---

*Generated for Task 0.1 — reviewed and approved for implementation.*
