---
title: "Consolidate Intelligence Commands into `search`"
status: complete
size: large
created: 2026-03-10
reviewed: 2026-03-10
completed: 2026-03-11
notes: "Global semantic search with QMD multi-collection support, --intent, and AI synthesis"
tags: []
has_prd: true
updated: 2026-03-11T22:30:00.000Z
---

# Consolidate Intelligence Commands into `search`

## Goal

Create a single `arete search` command that provides global semantic search across the workspace, replacing the fragmented `context --for`, `memory search`, and `memory timeline` commands.

---

## Problem

Currently there are multiple overlapping intelligence commands:
- `context --for "query"` — QMD/keyword search across workspace
- `memory search "query"` — keyword search on 3 files (decisions, learnings, observations)
- `memory timeline "query"` — temporal view of memory + meetings

These are confusing because:
1. They overlap in functionality
2. Users don't know which to use
3. None of them actually answer questions (retrieval only)

## Solution

Consolidate into a single `search` command with QMD multi-collection support:

```bash
# Primary usage - search everything
arete search "why did we decide X"

# Scoped search via QMD collections
arete search "query" --scope context     # context files only
arete search "query" --scope memory      # decisions/learnings only  
arete search "query" --scope meetings    # meetings only
arete search "query" --scope projects    # project docs only

# Temporal view
arete search "query" --timeline          # show results over time
arete search "query" --timeline --days 30

# Person/entity filtering
arete search "query" --person "jane"     # filter by person

# AI-powered answer (optional)
arete search "query" --answer            # synthesize answer from results
```

---

## Key Design Decisions

### QMD Multi-Collection Support
- **New architecture**: Create separate QMD collections per scope during `arete install`:
  - `arete-{id}-memory` → `.arete/memory/items/`
  - `arete-{id}-meetings` → `resources/meetings/`
  - `arete-{id}-context` → `context/` + `goals/`
  - `arete-{id}-projects` → `projects/`
  - `arete-{id}-people` → `people/`
  - `arete-{id}-all` → everything (default)
- **`--scope` flag** maps to QMD's native `-c collection` filtering
- **Migration**: New installs get multi-collection setup. Existing users (just John) run manual script.

### QMD `--intent` Integration
- When `--answer` is passed, derive intent from query patterns:
  - "what did we decide about X" → intent: "past decisions and rationale"
  - "who should I talk to about X" → intent: "finding people or contacts"
  - "why did we X" → intent: "historical context and reasoning"
- Pass `--intent` to QMD for better retrieval quality
- **Validated**: `--intent` is a valid QMD flag (tested with QMD 2.0.1)

### AI Synthesis (`--answer`)
- Optional flag, not default
- Requires `services.ai.isConfigured()`
- Returns results + synthesized answer
- Agent context + QMD retrieval = best of both worlds

### Output Format (3 Schemas)
- **Default search schema**: `{ success, query, results: [{path, title, snippet, score}], total }`
- **Timeline schema**: `{ success, query, items: [{date, title, source, type}], themes, dateRange }`
- **Answer schema**: `{ success, query, results: [...], answer: string }`
- Document which schema is returned for each mode in `--json` output

---

## Engineering Lead Review: APPROVED ✅

**Reviewer**: Senior Engineering Lead (2026-03-10)

### Validated ✅
- Multi-collection QMD architecture is feasible
- Empty directories handled gracefully
- `qmd embed` works across multiple collections
- Performance acceptable (~10-20s embed for 6 collections)
- `arete.yaml` change is backward compatible
- `--intent` flag is valid QMD feature
- AIService design supports synthesis

### 5 Critical Fixes Required

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | BLOCKER | QMD provider ignores `-c collection` flag | Add collection flag to `qmd query` call in Phase 2 |
| 2 | CONCERN | Output schemas undefined | Document 3 schemas in plan (done above) |
| 3 | BLOCKER | Skill updates must precede deprecation | Phase 5 (skills) runs BEFORE Phase 6 (deprecation) |
| 4 | CONCERN | Missing test coverage matrix | Add to Phase 0 |
| 5 | CONCERN | Config migration needed | Support both `qmd_collection` and `qmd_collections` in Phase 1 |

---

## Plan

### Phase 0: Setup & Planning
**Pre-implementation requirements**

1. **Define output schemas** (3 schemas documented above)
2. **Create test coverage matrix**:
   - `--scope memory|meetings|context|projects|people|all`
   - `--person <name>` (resolved, ambiguous, not found)
   - `--timeline` with and without `--days`
   - `--answer` (AI configured, not configured, error)
   - Flag combinations (`--scope memory --timeline`, etc.)
3. **Define scope-to-collection mapping**:
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

**Acceptance Criteria**:
- [ ] Output schemas documented
- [ ] Test matrix written
- [ ] Scope-collection mapping defined

---

### Phase 1: QMD Multi-Collection Setup
**Update `qmd-setup.ts` to create multiple collections during install**

1. Modify `ensureQmdCollection()` to create scope-based collections:
   - `arete-{id}-memory` for `.arete/memory/items/`
   - `arete-{id}-meetings` for `resources/meetings/`
   - `arete-{id}-context` for `context/`, `goals/`
   - `arete-{id}-projects` for `projects/`
   - `arete-{id}-people` for `people/`
   - `arete-{id}-all` for entire workspace (default)
   
2. Update `refreshQmdIndex()` to update all collections

3. **Config migration**: Support both formats in `loadConfig()`:
   - Old: `qmd_collection: "arete-abc123"` (singular)
   - New: `qmd_collections: { all: "...", memory: "...", ... }` (plural)
   - If old format exists, treat as `all` collection only

4. Store collection names in `arete.yaml`:
   ```yaml
   qmd_collections:
     all: "arete-abc123-all"
     memory: "arete-abc123-memory"
     meetings: "arete-abc123-meetings"
     context: "arete-abc123-context"
     projects: "arete-abc123-projects"
     people: "arete-abc123-people"
   ```

**Acceptance Criteria**:
- [ ] `arete install` creates 6 QMD collections
- [ ] `arete update` maintains all collections
- [ ] `qmd status` shows all collections
- [ ] Collection names stored in `arete.yaml`
- [ ] Old `qmd_collection` config still works (backward compat)

---

### Phase 2: Create `search.ts` Command
**New CLI command with core search functionality**

1. Create `packages/cli/src/commands/search.ts`
2. **CRITICAL**: Pass `-c <collection>` flag to `qmd query` based on `--scope`:
   ```typescript
   const args = ['query', query, '--json', '-n', String(limit)];
   if (scope !== 'all') {
     const collectionName = config.qmd_collections[scope];
     args.push('-c', collectionName);
   }
   ```
3. Add `--limit N` (default 15)
4. Add `--json` output format with documented schema
5. Add `--person <name>` filter via EntityService.resolve()
   - Handle ambiguous matches (warn + show options)
   - Handle not found (error message)
6. Wire into CLI index

**Acceptance Criteria**:
- [ ] `search "query"` returns results from all collections
- [ ] `--scope memory` uses `-c` flag to search only memory collection
- [ ] `--scope meetings` uses `-c` flag to search only meetings collection
- [ ] `--person "jane"` resolves and filters by person
- [ ] `--person "ambiguous"` shows clear error with options
- [ ] `--limit 5` returns only 5 results
- [ ] `--json` outputs documented schema

---

### Phase 3: Add Timeline Mode
**Temporal view reusing MemoryService.getTimeline() logic**

1. Add `--timeline` flag
2. Add `--days N` filter for date range
3. Reuse `MemoryService.getTimeline()` for theme extraction
4. Output chronological results with dates and recurring themes
5. Use timeline output schema in JSON mode

**Acceptance Criteria**:
- [ ] `--timeline` shows results chronologically
- [ ] `--days 30` limits to last 30 days
- [ ] Recurring themes extracted and displayed
- [ ] Works with `--scope` and `--json`
- [ ] JSON output uses timeline schema

---

### Phase 4: Add `--answer` Flag with Intent
**AI synthesis with QMD intent support**

1. Check `services.ai.isConfigured()`
2. Derive intent from query patterns:
   ```typescript
   function deriveIntent(query: string): string | undefined {
     if (query.match(/what did we decide/i)) return "past decisions and rationale";
     if (query.match(/who should I talk to/i)) return "finding people or contacts";
     if (query.match(/why did we/i)) return "historical context and reasoning";
     if (query.match(/when did we/i)) return "timeline and dates of events";
     if (query.match(/what is|what are/i)) return "definitions and explanations";
     return undefined; // No intent derivation for generic queries
   }
   ```
3. Pass `--intent` to QMD CLI call when intent derived
4. Pass results + question to AIService for synthesis
5. Return both results and synthesized answer using answer schema

**Acceptance Criteria**:
- [ ] `--answer` synthesizes response when AI configured
- [ ] `--answer` warns gracefully when AI not configured
- [ ] Intent derived from query patterns
- [ ] Intent passed to QMD via `--intent` flag
- [ ] JSON output includes both `results` and `answer` fields
- [ ] AI errors handled gracefully (show results, warn about synthesis failure)

---

### Phase 5: Intelligent Skill Migration
**MUST complete before Phase 6 (deprecation warnings)**

Subagent-driven skill updates understanding intent, not find/replace.

**5a: Foundation Agent** — `PATTERNS.md` + `_authoring-guide.md`
- Review and understand pedagogical intent
- Update `context_bundle_assembly` pattern
- Update skill authoring documentation
- Ensure consistency between files

**5b: Week Review Agent** — `week-review/SKILL.md`
- Read full skill, understand purpose
- Identify why it calls deprecated commands
- Update to appropriate `search` command

**5c: Process Meetings Agent** — `process-meetings/SKILL.md`
- Read full skill, understand purpose
- Update to appropriate `search` command

**5d: Documentation Agent** — `capture-conversation/SKILL.md`, `_integration-guide.md`, `README.md`
- Update informational references
- Low-risk documentation updates

**5e: Rules Agent** — `pm-workspace.mdc` files
- Update both claude-code and cursor versions
- Keep in sync

**5f: Verification**
- Run grep to verify no remaining references to deprecated commands
- If any remain, fix before proceeding to Phase 6

**Acceptance Criteria**:
- [ ] All agents understand intent before updating
- [ ] PATTERNS.md updated (11 skills inherit)
- [ ] _authoring-guide.md updated
- [ ] Individual skills updated appropriately
- [ ] Rules files updated and in sync
- [ ] `grep -r "context --for\|memory search\|memory timeline" packages/runtime` returns 0 results

---

### Phase 6: Add Deprecation Notices
**Graceful deprecation path for old commands — AFTER Phase 5**

1. Add deprecation warnings to `context --for` (STDERR)
2. Add deprecation warnings to `memory search` (STDERR)
3. Add deprecation warnings to `memory timeline` (STDERR)
4. Add `deprecated: true` field to JSON output
5. Include migration guidance in warning message:
   ```
   DEPRECATED: `context --for` is deprecated. Use `arete search` instead.
   Migration: arete search "your query"
   ```

**Acceptance Criteria**:
- [ ] `context --for` shows deprecation warning on STDERR
- [ ] `memory search` shows deprecation warning on STDERR
- [ ] `memory timeline` shows deprecation warning on STDERR
- [ ] JSON output includes `deprecated: true`
- [ ] Warnings include specific migration command

---

### Phase 7: Update Documentation
**AGENTS.md, GUIDE.md, and runtime docs**

1. Update `.agents/sources/shared/cli-commands.md`:
   ```
   |arete search "query":Global semantic search across workspace
   |arete search "query" --scope memory:Search decisions/learnings only
   |arete search "query" --scope meetings:Search meeting transcripts
   |arete search "query" --timeline:Temporal view of topic
   |arete search "query" --answer:Synthesize AI-powered answer
   |arete context --for "query":(DEPRECATED) Use `arete search`
   |arete memory search "query":(DEPRECATED) Use `arete search --scope memory`
   |arete memory timeline "query":(DEPRECATED) Use `arete search --timeline`
   ```

2. Update tool_selection heuristics:
   ```
   "What do you know about X?"→search; "What decisions about X?"→search --scope memory; 
   "History of X?"→search --timeline; "Prep for X"→brief --for
   ```

3. Update `GUIDE.md` with new `search` command
4. Run `npm run build:agents` to regenerate AGENTS.md

**Acceptance Criteria**:
- [ ] AGENTS.md reflects new commands
- [ ] tool_selection guides to `search`
- [ ] GUIDE.md updated
- [ ] Deprecated commands documented with migration path

---

## Testing Checklist

### Core Functionality
- [ ] `search "query"` returns results from all scopes
- [ ] `--scope memory` limits to decisions/learnings/observations
- [ ] `--scope meetings` limits to resources/meetings/
- [ ] `--scope context` limits to context/ + goals/
- [ ] `--scope projects` limits to projects/
- [ ] `--scope people` limits to people/

### Filters
- [ ] `--person "jane"` filters by resolved person
- [ ] `--person "ambiguous"` shows helpful error
- [ ] `--person "unknown"` shows not found error
- [ ] `--timeline` shows temporal view with dates
- [ ] `--timeline --days 30` limits date range

### AI Synthesis
- [ ] `--answer` synthesizes response when AI configured
- [ ] `--answer` warns gracefully when AI not configured
- [ ] `--answer` uses QMD `--intent` for better retrieval
- [ ] AI errors don't crash; show results + warning

### Output
- [ ] `--limit 5` returns only 5 results
- [ ] `--json` output uses correct schema per mode
- [ ] Default output is human-readable

### Deprecation
- [ ] Deprecated commands still work but show warning
- [ ] Warning goes to STDERR (not STDOUT)
- [ ] JSON includes `deprecated: true`

### Infrastructure
- [ ] Multi-collection QMD setup works on fresh install
- [ ] Old `qmd_collection` config still works
- [ ] Skills updated and working correctly

---

## Out of Scope

- **User workspace skill migration**: Custom skills in user `.agents/skills/` will see deprecation warnings but won't be auto-updated
- **`--scope` accepting multiple values**: Keep simple for v1
- **`--answer` as default**: Keep opt-in for predictability

---

## Success Criteria

- Single command for all search use cases
- Clear mental model: `search` finds things, `brief` gives overview
- QMD multi-collection support for efficient scope filtering
- QMD `--intent` integration for better retrieval quality
- AI synthesis available but optional
- Old commands still work (deprecation path)

---

## Related Artifacts

| Artifact | Purpose |
|----------|---------|
| `pre-mortem.md` | Original critical engineering review |
| `review.md` | Multi-agent audit (45+ references) |
| `notes.md` | Complete skills inventory |
| `eng-lead-review.md` | Final engineering sign-off |
