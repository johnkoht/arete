# PRD: Consolidate Intelligence Commands into `search`

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-10  
**Branch**: `feature/consolidate-search-command`  
**Depends on**: QMD multi-collection support, existing intelligence services

---

## 1. Problem & Goals

### Problem

Currently there are multiple overlapping intelligence commands:
- `context --for "query"` — QMD/keyword search across workspace
- `memory search "query"` — keyword search on 3 files (decisions, learnings, observations)
- `memory timeline "query"` — temporal view of memory + meetings

These are confusing because:
1. They overlap in functionality
2. Users don't know which to use
3. None of them actually answer questions (retrieval only)

### Goals

1. **Unified search command**: Create a single `arete search` command that provides global semantic search across the workspace, replacing the fragmented commands.
2. **QMD multi-collection support**: Create separate QMD collections per scope during install for efficient filtering.
3. **Scoped search**: Allow filtering by scope (memory, meetings, context, projects, people, all).
4. **Timeline mode**: Provide temporal view of search results with recurring theme extraction.
5. **AI synthesis**: Optional `--answer` flag that synthesizes results into a coherent answer.
6. **QMD intent integration**: Derive intent from query patterns and pass to QMD for better retrieval quality.
7. **Graceful deprecation**: Keep old commands working with deprecation warnings.

### Out of Scope

- **User workspace skill migration**: Custom skills in user `.agents/skills/` will see deprecation warnings but won't be auto-updated
- **`--scope` accepting multiple values**: Keep simple for v1
- **`--answer` as default**: Keep opt-in for predictability
- **Removing deprecated commands**: v1 keeps them with warnings

---

## 2. Architecture Decisions

### QMD Multi-Collection Support

Create separate QMD collections per scope during `arete install`:
- `arete-{id}-memory` → `.arete/memory/items/`
- `arete-{id}-meetings` → `resources/meetings/`
- `arete-{id}-context` → `context/` + `goals/`
- `arete-{id}-projects` → `projects/`
- `arete-{id}-people` → `people/`
- `arete-{id}-all` → everything (default)

The `--scope` flag maps to QMD's native `-c collection` filtering. New installs get multi-collection setup. Existing users run manual migration (John only).

### Config Migration

Support both formats in `loadConfig()`:
- Old: `qmd_collection: "arete-abc123"` (singular)
- New: `qmd_collections: { all: "...", memory: "...", ... }` (plural)
- If old format exists, treat as `all` collection only (backward compat)

### QMD `--intent` Integration

When `--answer` is passed, derive intent from query patterns:
- "what did we decide about X" → intent: "past decisions and rationale"
- "who should I talk to about X" → intent: "finding people or contacts"
- "why did we X" → intent: "historical context and reasoning"
- "when did we X" → intent: "timeline and dates of events"
- "what is|what are X" → intent: "definitions and explanations"

Pass `--intent` to QMD for better retrieval quality. Validated: `--intent` is a valid QMD flag (tested with QMD 2.0.1).

### AI Synthesis (`--answer`)

Optional flag, not default. Requires `services.ai.isConfigured()`. Returns results + synthesized answer. Agent context + QMD retrieval = best of both worlds.

### Output Format (3 Schemas)

```typescript
// Default search schema
{ 
  success: boolean; 
  query: string; 
  results: Array<{ path: string; title: string; snippet: string; score: number }>; 
  total: number 
}

// Timeline schema
{ 
  success: boolean; 
  query: string; 
  items: Array<{ date: string; title: string; source: string; type: string }>; 
  themes: string[]; 
  dateRange: { start: string; end: string } 
}

// Answer schema
{ 
  success: boolean; 
  query: string; 
  results: Array<{ path: string; title: string; snippet: string; score: number }>; 
  answer: string 
}
```

### Scope-to-Collection Mapping

```typescript
const SCOPE_COLLECTION_MAP = {
  all: 'all',
  memory: 'memory',
  meetings: 'meetings',
  context: 'context',
  projects: 'projects',
  people: 'people',
};
```

---

## 3. User Stories

### Search

1. As a PM, I can run `arete search "query"` to search across my entire workspace with semantic matching.
2. As a PM, I can run `arete search "query" --scope memory` to search only decisions/learnings/observations.
3. As a PM, I can run `arete search "query" --scope meetings` to search only meeting transcripts.
4. As a PM, I can run `arete search "query" --person "jane"` to filter results to those mentioning a specific person.

### Timeline

5. As a PM, I can run `arete search "query" --timeline` to see results chronologically with recurring themes.
6. As a PM, I can run `arete search "query" --timeline --days 30` to limit the timeline to the last 30 days.

### AI Synthesis

7. As a PM, I can run `arete search "why did we decide X" --answer` to get a synthesized answer with cited sources.
8. As a PM, when AI is not configured, `--answer` warns gracefully and shows results only.

### Migration

9. As a PM, when I run `context --for "query"`, I see a deprecation warning directing me to `arete search`.
10. As an agent, when I call deprecated commands, JSON output includes `deprecated: true`.

---

## 4. Requirements

### 4.1 QMD Multi-Collection Setup

**Changes to `qmd-setup.ts`:**
- Modify `ensureQmdCollection()` to create 6 scope-based collections
- Update `refreshQmdIndex()` to update all collections
- Store collection names in `arete.yaml` under `qmd_collections`

**Config migration in `loadConfig()`:**
- Support both `qmd_collection` (old) and `qmd_collections` (new)
- If old format exists, treat as `all` collection only

**arete.yaml structure:**
```yaml
qmd_collections:
  all: "arete-abc123-all"
  memory: "arete-abc123-memory"
  meetings: "arete-abc123-meetings"
  context: "arete-abc123-context"
  projects: "arete-abc123-projects"
  people: "arete-abc123-people"
```

### 4.2 Search Command (`packages/cli/src/commands/search.ts`)

**Flags:**
- `<query>` (positional, required): Search query
- `--scope <scope>` (default: all): Filter by collection (all|memory|meetings|context|projects|people)
- `--limit <n>` (default: 15): Maximum results
- `--person <name>`: Filter by person (uses EntityService.resolve())
- `--timeline`: Temporal view with dates and themes
- `--days <n>`: With `--timeline`, limit date range
- `--answer`: Synthesize AI-powered answer
- `--json`: Output in JSON format

**Behavior:**
- Pass `-c <collection>` flag to `qmd query` based on `--scope`
- Resolve `--person` via EntityService; handle ambiguous (show options) and not found (error)
- For `--answer`, derive intent from query patterns and pass to QMD

### 4.3 Timeline Mode

**Implementation:**
- Reuse `MemoryService.getTimeline()` logic for theme extraction
- Output chronological results with dates
- Extract recurring themes across results
- Apply `--days` filter for date range

### 4.4 AI Synthesis (`--answer`)

**Implementation:**
- Check `services.ai.isConfigured()`
- Derive intent from query patterns (see Architecture Decisions)
- Pass `--intent` to QMD CLI call when intent is derived
- Pass results + question to AIService for synthesis
- Return both results and synthesized answer
- Handle AI errors gracefully (show results, warn about synthesis failure)

### 4.5 Skill Migration

**Foundation files:**
- `PATTERNS.md` — update `context_bundle_assembly` pattern (11 skills inherit)
- `_authoring-guide.md` — update skill authoring documentation

**Individual skills:**
- `week-review/SKILL.md`
- `process-meetings/SKILL.md`
- `capture-conversation/SKILL.md`
- `_integration-guide.md`
- `README.md`

**Rules:**
- `pm-workspace.mdc` (both cursor and claude-code versions)

**Verification:**
- `grep -r "context --for\|memory search\|memory timeline" packages/runtime` returns 0 results

### 4.6 Deprecation Notices

**Implementation:**
- Add deprecation warnings to `context --for` (STDERR)
- Add deprecation warnings to `memory search` (STDERR)
- Add deprecation warnings to `memory timeline` (STDERR)
- Add `deprecated: true` field to JSON output
- Include migration guidance in warning message

**Warning format:**
```
DEPRECATED: `context --for` is deprecated. Use `arete search` instead.
Migration: arete search "your query"
```

### 4.7 Documentation Updates

**Files to update:**
- `.agents/sources/shared/cli-commands.md` — add `search` commands, mark deprecated commands
- `tool_selection` heuristics — update to point to `search`
- `GUIDE.md` — add `search` command documentation
- Run `npm run build:agents` to regenerate AGENTS.md

---

## 5. Task Breakdown

### Phase 0: Setup & Planning

**Task 0.1: Document output schemas and test matrix**
- Define 3 output schemas (default, timeline, answer) in code comments
- Create test coverage matrix covering all flag combinations
- Define scope-to-collection mapping constant

Acceptance Criteria:
- [ ] Output schemas documented in task or code
- [ ] Test matrix covers all scopes, person (resolved/ambiguous/not-found), timeline +/- days, answer (configured/not/error), flag combinations

### Phase 1: QMD Multi-Collection Setup

**Task 1.1: Update qmd-setup.ts for multi-collection**
- Modify `ensureQmdCollection()` to create 6 scope-based collections
- Update `refreshQmdIndex()` to update all collections
- Store collection names in `arete.yaml` under `qmd_collections`

Acceptance Criteria:
- [ ] `arete install` creates 6 QMD collections
- [ ] `arete update` maintains all collections
- [ ] Collection names stored in `arete.yaml`

**Task 1.2: Config migration for backward compatibility**
- Support both `qmd_collection` and `qmd_collections` in `loadConfig()`
- If old format exists, treat as `all` collection only

Acceptance Criteria:
- [ ] Old `qmd_collection` config still works
- [ ] New `qmd_collections` config works
- [ ] Migration path is seamless

### Phase 2: Create Search Command

**Task 2.1: Create search.ts with core functionality**
- Create `packages/cli/src/commands/search.ts`
- Implement `--scope` flag with `-c collection` pass-through to QMD
- Implement `--limit` flag
- Implement `--json` output with documented schema
- Wire into CLI index

Acceptance Criteria:
- [ ] `search "query"` returns results from all collections
- [ ] `--scope memory` uses `-c` flag to search memory collection
- [ ] `--scope meetings` uses `-c` flag to search meetings collection
- [ ] `--limit 5` returns only 5 results
- [ ] `--json` outputs documented schema

**Task 2.2: Add person filtering**
- Implement `--person <name>` filter via EntityService.resolve()
- Handle ambiguous matches (warn + show options)
- Handle not found (error message)

Acceptance Criteria:
- [ ] `--person "jane"` resolves and filters by person
- [ ] `--person "ambiguous"` shows clear error with options
- [ ] `--person "unknown"` shows not found error

### Phase 3: Add Timeline Mode

**Task 3.1: Implement timeline mode**
- Add `--timeline` flag
- Add `--days N` filter for date range
- Reuse `MemoryService.getTimeline()` for theme extraction
- Output chronological results with dates and recurring themes
- Use timeline output schema in JSON mode

Acceptance Criteria:
- [ ] `--timeline` shows results chronologically
- [ ] `--days 30` limits to last 30 days
- [ ] Recurring themes extracted and displayed
- [ ] Works with `--scope` and `--json`
- [ ] JSON output uses timeline schema

### Phase 4: Add AI Synthesis

**Task 4.1: Implement --answer flag with intent derivation**
- Check `services.ai.isConfigured()`
- Implement `deriveIntent()` function from query patterns
- Pass `--intent` to QMD CLI call when intent derived
- Pass results + question to AIService for synthesis
- Return both results and synthesized answer using answer schema

Acceptance Criteria:
- [ ] `--answer` synthesizes response when AI configured
- [ ] `--answer` warns gracefully when AI not configured
- [ ] Intent derived from query patterns
- [ ] Intent passed to QMD via `--intent` flag
- [ ] JSON output includes both `results` and `answer` fields
- [ ] AI errors handled gracefully (show results, warn about synthesis failure)

### Phase 5: Skill Migration

**Task 5.1: Update foundation files**
- Update `PATTERNS.md` — `context_bundle_assembly` pattern
- Update `_authoring-guide.md`
- Ensure consistency between files

Acceptance Criteria:
- [ ] PATTERNS.md updated (11 skills inherit this)
- [ ] _authoring-guide.md updated
- [ ] Pattern and guide are consistent

**Task 5.2: Update week-review skill**
- Read full skill, understand purpose
- Update to appropriate `search` command

Acceptance Criteria:
- [ ] week-review/SKILL.md uses new search command
- [ ] Functionality preserved

**Task 5.3: Update process-meetings skill**
- Read full skill, understand purpose
- Update to appropriate `search` command

Acceptance Criteria:
- [ ] process-meetings/SKILL.md uses new search command
- [ ] Functionality preserved

**Task 5.4: Update documentation files**
- Update `capture-conversation/SKILL.md`
- Update `_integration-guide.md`
- Update `README.md`

Acceptance Criteria:
- [ ] Documentation references updated to new search command
- [ ] No stale command references

**Task 5.5: Update rules files**
- Update `pm-workspace.mdc` (cursor version)
- Update `pm-workspace.mdc` (claude-code version)
- Keep in sync

Acceptance Criteria:
- [ ] Both rule files updated
- [ ] Rule files are in sync
- [ ] No deprecated command references

**Task 5.6: Verify skill migration complete**
- Run grep to verify no remaining references
- Fix any stragglers

Acceptance Criteria:
- [ ] `grep -r "context --for\|memory search\|memory timeline" packages/runtime` returns 0 results

### Phase 6: Add Deprecation Notices

**Task 6.1: Add deprecation warnings to deprecated commands**
- Add deprecation warning to `context --for` (STDERR)
- Add deprecation warning to `memory search` (STDERR)
- Add deprecation warning to `memory timeline` (STDERR)
- Add `deprecated: true` field to JSON output
- Include migration guidance in warning message

Acceptance Criteria:
- [ ] `context --for` shows deprecation warning on STDERR
- [ ] `memory search` shows deprecation warning on STDERR
- [ ] `memory timeline` shows deprecation warning on STDERR
- [ ] JSON output includes `deprecated: true`
- [ ] Warnings include specific migration command

### Phase 7: Update Documentation

**Task 7.1: Update AGENTS.md sources and regenerate**
- Update `.agents/sources/shared/cli-commands.md` with new search commands
- Mark deprecated commands in documentation
- Update tool_selection heuristics
- Run `npm run build:agents` to regenerate AGENTS.md

Acceptance Criteria:
- [ ] AGENTS.md reflects new commands
- [ ] tool_selection guides to `search`
- [ ] Deprecated commands documented with migration path

**Task 7.2: Update GUIDE.md**
- Add `search` command documentation
- Document all flags and use cases

Acceptance Criteria:
- [ ] GUIDE.md updated with search command
- [ ] All flags documented

---

## 6. Dependencies Between Tasks

```
0.1 (schemas/test matrix)
  ↓
1.1 (multi-collection) → 1.2 (config migration)
  ↓
2.1 (search core) → 2.2 (person filter)
  ↓
3.1 (timeline mode)
  ↓
4.1 (answer flag)
  ↓
5.1 (foundation) → 5.2 (week-review) → 5.3 (process-meetings) → 5.4 (docs) → 5.5 (rules) → 5.6 (verify)
  ↓
6.1 (deprecation notices)  ← MUST run after 5.x completes
  ↓
7.1 (AGENTS.md) → 7.2 (GUIDE.md)
```

**Critical dependency**: Phase 5 (skill migration) MUST complete before Phase 6 (deprecation notices). This prevents skills from emitting deprecation warnings.

Execution order: 0.1 → 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 4.1 → 5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 6.1 → 7.1 → 7.2

---

## 7. Testing Strategy

### Test Coverage Matrix

| Category | Test Cases |
|----------|------------|
| **Scope** | `--scope memory\|meetings\|context\|projects\|people\|all` |
| **Person** | resolved, ambiguous, not found |
| **Timeline** | with/without `--days`, combined with `--scope` |
| **Answer** | AI configured, not configured, AI error |
| **Combinations** | `--scope memory --timeline`, `--scope meetings --answer` |
| **Output** | Human-readable default, `--json` for each schema |
| **Deprecation** | Warning on STDERR, `deprecated: true` in JSON |
| **Infrastructure** | Fresh install, old config migration, `arete update` |

### Quality Gates

- `npm run typecheck` after every task
- `npm test` after every task
- All existing tests must continue to pass
- New tests for each acceptance criterion

### Mocking Strategy

- Mock QMD CLI calls for unit tests
- Mock AIService for synthesis tests
- Mock EntityService for person filter tests

---

## 8. Success Criteria

- Single command for all search use cases
- Clear mental model: `search` finds things, `brief` gives overview
- QMD multi-collection support for efficient scope filtering
- QMD `--intent` integration for better retrieval quality
- AI synthesis available but optional
- Old commands still work (deprecation path)
- All skills migrated before deprecation warnings added
- All tests pass, typecheck passes

---

## 9. Execution Strategy (MANDATORY READ)

**Before starting execution, the orchestrator MUST read**:
- `dev/work/plans/consolidate-search-command/execution-strategy.md`

This document contains:
- Learnings from previous large autonomous builds (intelligence-tuning, ai-config, reimagine-v2)
- Expertise profiles to load for each phase
- Pre-execution checks (phantom task detection)
- File reading lists for each task
- Critical mitigations to embed in prompts
- Task-specific guidance

Key patterns to apply:
- **Reviewer pre-work sanity checks** for every task
- **testDeps injection** for QMD mocking
- **Grumpy reviewer** asking "What about legacy data?"
- **Backwards compat check** for config migration
- **Documentation synthesis** after each task

Critical sequence: **Phase 5 (skill migration) MUST complete before Phase 6 (deprecation warnings)**
