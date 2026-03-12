# Search Command Consolidation - Multi-Agent Audit Results

Compiled: 2026-03-10

---

## Executive Summary

**45+ references** across **18+ files** need updating. The core service layer is well-designed and doesn't need changes — this is primarily a CLI + documentation refactor.

---

## Audit by Domain

### 1. CLI Domain (intelligence.ts)

**File**: `packages/cli/src/commands/intelligence.ts`

| Command | Lines | Service Method | Test Coverage |
|---------|-------|----------------|---------------|
| `context --for` | 27-229 | `services.context.getRelevantContext()` | `context.test.ts` (golden) |
| `memory search` | 240-330 | `services.memory.search()` | `memory-search.test.ts` (golden) |
| `memory timeline` | 333-445 | `services.memory.getTimeline()` | Integration tests |

**Existing Tests**:
- `packages/cli/test/golden/context.test.ts` — 4 tests
- `packages/cli/test/golden/memory-search.test.ts` — 3 tests
- `packages/cli/test/integration/intelligence-semantic.integration.test.ts`

**Key Insight**: The `context --inventory` mode (lines 46-125) is NOT being deprecated — it stays in place. Only `context --for` is deprecated.

---

### 2. Core Services Domain

**Result Type Differences** (critical for unified output):

| Command | Return Type | Key Fields |
|---------|-------------|------------|
| `context --for` | `ContextBundle` | `files[]`, `gaps[]`, `confidence`, `primitives`, `temporalSignals` |
| `memory search` | `MemorySearchResult` | `results[]` (MemoryResult), `total` |
| `memory timeline` | `MemoryTimeline` | `items[]` (TimelineItem), `themes[]`, `dateRange` |

**Shape Incompatibility**:
- Context returns **files** with `path`, `relativePath`, `category`, `summary`, `relevanceScore`
- Memory search returns **sections** with `content`, `source`, `type`, `date`, `relevance`
- Timeline returns **items** with `title`, `content`, `date`, `source`, `relevanceScore`, `themes`

**Options for unified JSON output**:
1. **Union type with `type` discriminator** — `{ type: 'file' | 'memory' | 'timeline', ... }`
2. **Mode-specific response** — Different `--scope` values return different shapes
3. **Normalized result** — Force everything into a common `{ title, content, date, source, score }` shape

**Recommendation**: Option 2 (mode-specific response) is cleanest. Document that `--timeline` returns timeline format, `--scope memory` returns memory format, etc.

---

### 3. Runtime Skills Domain

**45+ references across 9 files**:

| File | Refs | Priority |
|------|------|----------|
| `skills/PATTERNS.md` | 2 | 🔴 Critical — shared pattern `context_bundle_assembly` |
| `skills/_authoring-guide.md` | 7 | 🔴 Critical — skill author documentation |
| `GUIDE.md` | 8 | 🟡 High — user onboarding |
| `rules/claude-code/pm-workspace.mdc` | 9 | 🟡 High |
| `rules/cursor/pm-workspace.mdc` | 9 | 🟡 High (mirror of claude-code) |
| `skills/week-review/SKILL.md` | 2 | 🟢 Medium |
| `skills/process-meetings/SKILL.md` | 2 | 🟢 Medium |
| `skills/capture-conversation/SKILL.md` | 1 | 🟢 Medium |
| `UPDATES.md` | 2 | 🟢 Low (historical changelog) |

**Key Pattern Dependency**:
The `context_bundle_assembly` pattern in `PATTERNS.md` (lines 418, 420) is the foundation. Updating it once propagates to `process-meetings`, `week-review`, and any future skills using the pattern.

---

### 4. Documentation Domain

**18 documentation locations identified**:

**Source Files (update these first)**:
- `.agents/sources/shared/cli-commands.md` — shipped to users
- `.agents/sources/guide/intelligence.md` — user guide source
- `README.md` — public examples

**Generated/Derived Files**:
- `AGENTS.md` (root) — auto-generated from `.agents/sources/`
- `dist/AGENTS.md` — shipped version

**Developer Docs**:
- `DEVELOPER.md` — developer reference
- `.pi/expertise/cli/PROFILE.md` — expertise profile

**Test Data**:
- `test-data/TEST-SCENARIOS.md`
- `test-data/MANUAL-SMOKE.md`

---

## Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Breaking user scripts** | High | Graceful deprecation with warnings |
| **Output format confusion** | Medium | Document mode-specific shapes |
| **Missing file updates** | Medium | This audit as checklist |
| **Skills using deprecated commands** | Medium | Update PATTERNS.md first |
| **AI synthesis quality** | Low | Prompt template testing |
| **Test coverage gaps** | Low | Existing golden tests adapt |

---

## Migration Mappings

```bash
# Before → After
arete context --for "query"        → arete search "query"
arete memory search "query"        → arete search "query" --scope memory
arete memory timeline "query"      → arete search "query" --timeline
```

**Flags that carry through**:
- `--json` → `--json`
- `--limit N` → `--limit N`
- `--days N` → `--days N`
- `--types <list>` → (not needed, covered by `--scope memory`)

---

## Proposed AGENTS.md Changes

**Current tool_selection**:
```
"What do you know about X?"→context --for; "What decisions about X?"→memory search; 
"History of X?"→memory timeline; "Prep for X"→brief --for
```

**Proposed**:
```
"What do you know about X?"→search; "What decisions about X?"→search --scope memory; 
"History of X?"→search --timeline; "Prep for X"→brief --for
```

**New commands section**:
```
|arete search "query":Global semantic search across workspace
|arete search "query" --scope memory:Search decisions/learnings only
|arete search "query" --scope meetings:Search meeting transcripts only
|arete search "query" --timeline [--days N]:Temporal view of topic
|arete search "query" --person "name":Filter by person (uses EntityService resolution)
|arete search "query" --answer:Synthesize AI-powered answer from results
|arete context --for "query":(DEPRECATED) Use `arete search` instead
|arete memory search "query":(DEPRECATED) Use `arete search --scope memory`
|arete memory timeline "query":(DEPRECATED) Use `arete search --timeline`
```

---

## Deprecation Strategy

**Recommended: 3-phase graceful deprecation**

1. **Phase 1 (this release)**: Keep old commands working, add deprecation warnings, update all docs to prefer `search`
2. **Phase 2 (next release)**: Hide deprecated commands from help output but keep functional
3. **Phase 3 (release+2)**: Remove deprecated commands entirely

---

## Files to Update (Checklist)

### Phase 1: Before CLI Implementation
- [ ] `.agents/sources/shared/cli-commands.md`
- [ ] `.agents/sources/guide/intelligence.md`
- [ ] `README.md`

### Phase 2: With CLI Code
- [ ] `packages/cli/src/commands/search.ts` (new file)
- [ ] `packages/cli/src/commands/intelligence.ts` (deprecation notices)
- [ ] `packages/cli/src/index.ts` (register new command)
- [ ] Existing golden tests (update expected output)

### Phase 3: After CLI Merge
- [ ] Run `npm run build:agents` to regenerate AGENTS.md
- [ ] `packages/runtime/GUIDE.md`
- [ ] `packages/runtime/skills/PATTERNS.md`
- [ ] `packages/runtime/skills/_authoring-guide.md`
- [ ] `packages/runtime/rules/claude-code/pm-workspace.mdc`
- [ ] `packages/runtime/rules/cursor/pm-workspace.mdc`
- [ ] Individual skill files (week-review, process-meetings, capture-conversation)

### Phase 4: Cleanup
- [ ] `DEVELOPER.md`
- [ ] `.pi/expertise/cli/PROFILE.md`
- [ ] `test-data/*.md` files
- [ ] Historical memory entries (low priority — historical accuracy)
