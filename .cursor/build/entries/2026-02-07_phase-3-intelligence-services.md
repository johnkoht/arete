# Phase 3: Intelligence Services

**Date**: 2026-02-07
**Branch**: `feature/product-os-architecture`
**Commits**: 36383ff (services 1-3), 4f6078f (services 4-5)

## What Changed

Implemented the five intelligence services described in the skill interface contract (`.cursor/build/prds/product-os/skill-interface.md`). These are the programmatic backbone of the Areté intelligence layer.

### Service 1: Context Injection (`src/core/context-injection.ts`)
- `getRelevantContext(query, paths, options?)` → `ContextBundle`
- Maps product primitives to workspace files: Problem → business-overview.md, User → users-personas.md + people/, Solution → products-services.md, Market → competitive-landscape.md, Risk → memory
- Always includes goals/strategy.md and goals/quarter.md
- Scans active projects and people for query-relevant content
- Identifies gaps (missing or placeholder context) per primitive
- Rates confidence: High / Medium / Low based on coverage

### Service 2: Memory Retrieval (`src/core/memory-retrieval.ts`)
- `searchMemory(query, paths, options?)` → `MemorySearchResult`
- Token-based search across .arete/memory/items/{decisions,learnings,agent-observations}.md
- Parses ### sections with dates, scores by keyword overlap (title > body)
- Returns MemoryResult[] with content, source, type, date, relevance explanation

### Service 3: Entity Resolution (`src/core/entity-resolution.ts`)
- `resolveEntity(reference, entityType, paths)` → `ResolvedEntity | null`
- `resolveEntities(reference, entityType, paths, limit?)` → `ResolvedEntity[]`
- Person: fuzzy match by name, slug, email (case-insensitive, partial match)
- Meeting: match by title, date, attendees, attendee_ids
- Project: match by directory name, README title, README body
- Scoring: exact=100, slug=90, email=95, startsWith=70, allWordsFound=50

### Service 4: Primitive Briefing Assembly (`src/core/briefing.ts`)
- `assembleBriefing(task, paths, options?)` → `PrimitiveBriefing`
- Ties together context injection + memory retrieval + entity resolution
- Extracts entity references from task (capitalized proper nouns, quoted phrases)
- Produces structured markdown briefing organized by primitive, with gaps, memory, and entities
- The adapter pattern: prepare context before any skill, capture output after

### Service 5: Enhanced Skill Router (`src/core/skill-router.ts`)
- Extended `SkillCandidate` to include primitives, work_type, category, intelligence, requires_briefing
- Added work_type keyword boosting (e.g. "analyze" → analysis skills)
- Added category tiebreaker: essential (+2) > default (+1) > community (+0)
- Routing response now includes primitives, work_type, category, requires_briefing

### CLI Commands (`src/commands/intelligence.ts`)
- `arete context --for "query"` — run context injection
- `arete memory search "query"` — search workspace memory
- `arete resolve "reference"` — resolve entity
- `arete brief --for "query" --skill name` — full briefing assembly

### Rule Update (`.cursor/rules/pm-workspace.mdc`)
- Added "Intelligence Services" section before "Before Starting Any Work"
- Documents arete context, arete memory search, arete resolve, arete brief
- Guidance table for when to use each service
- Updated "Before Starting Any Work" to reference intelligence services

### Types (`src/types.ts`)
- ProductPrimitive, PRODUCT_PRIMITIVES, WorkType, SkillCategory
- ContextFile, ContextGap, ContextBundle, ContextInjectionOptions
- MemoryItemType, MemoryResult, MemorySearchResult, MemorySearchOptions
- EntityType, ResolvedEntity
- ExtendedSkillCandidate, ExtendedRoutedSkill

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Token-based search (v1) for memory retrieval | Simple, no external deps. QMD/semantic search can be added later. |
| Fuzzy scoring with weighted tiers (100/90/70/50/10) for entity resolution | Balances precision (exact match high) with recall (partial match works). |
| isPlaceholder uses 20-char body threshold (excluding headings) | Lower than initial 50 — short but real content shouldn't be flagged. |
| Entity extraction from task via capitalized proper nouns | Simple heuristic; avoids false positives with skip-words list. |
| Work-type keywords in router are additive (+6), not dominant | Preserve existing routing behavior; work_type is a boost, not a replacement. |
| Category tiebreaker is small (+2/+1) | Only matters in ties; doesn't override relevance-based scoring. |

## Test Coverage

- 67 new tests across 4 test files
- test/core/context-injection.test.ts (17 tests)
- test/core/memory-retrieval.test.ts (13 tests)
- test/core/entity-resolution.test.ts (23 tests)
- test/core/briefing.test.ts (11 tests)
- test/core/skill-router.test.ts (6 new tests for extended behavior)
- All 209 tests pass; typecheck clean
