# Core Package Gap Analysis

> Audited: 2026-03-07  
> Scope: `packages/core/src/services/` vs `packages/apps/backend/src/`

---

## Services Used by Web Backend

The backend imports from `@arete/core` in only **3 files**:

### `backend/src/services/workspace.ts`
Uses: `FileStorageAdapter`, `parseStagedSections`, `parseStagedItemStatus`, `parseStagedItemEdits`, `writeItemStatusToFile`, `commitApprovedItems`, `loadConfig`, `refreshQmdIndex`  
→ Low-level file I/O and staged-item processing for meeting editing workflows.

### `backend/src/routes/intelligence.ts`
Uses: `FileStorageAdapter`, `detectCrossPersonPatterns`  
→ Only one intelligence function — cross-person pattern detection from meeting files.

### `backend/src/types.ts`
Uses: `StagedSections`, `StagedItemStatus`, `StagedItemEdits` (type imports only)

**Summary of core services with any web exposure:**
| Service | Usage |
|---|---|
| `FileStorageAdapter` | Used directly in 2 route/service files |
| `detectCrossPersonPatterns` | Exposed via `GET /api/intelligence/patterns` |
| `refreshQmdIndex` | Called internally after meeting saves (not a web endpoint) |
| `parseStagedItemEdits` / `writeItemStatusToFile` / `commitApprovedItems` | Used internally in meeting PATCH flow |
| `loadConfig` | Used to get workspace config for QMD index refresh |

---

## Services NOT Used by Web Backend

Every service class in `packages/core/src/services/` is absent from the backend, **except through the two narrow import files above**.

| Service | File | Status |
|---|---|---|
| `ContextService` | `context.ts` | ❌ Not used |
| `MemoryService` | `memory.ts` | ❌ Not used (backend has custom raw-fs parser) |
| `EntityService` | `entity.ts` | ❌ Not used |
| `IntelligenceService` | `intelligence.ts` | ❌ Not used |
| `WorkspaceService` | `workspace.ts` | ❌ Not used |
| `SkillService` | `skills.ts` | ❌ Not used |
| `IntegrationService` | `integrations.ts` | ❌ Not used |
| `ToolService` | `tools.ts` | ❌ Not used |
| `CommitmentsService` | `commitments.ts` | ❌ Not used (backend re-implements with raw JSON reads) |
| `computeRelationshipHealth` | `person-health.ts` | ❌ Not used |
| `extractStancesForPerson` / `extractActionItemsForPerson` | `person-signals.ts` | ❌ Not used |
| `computeCommitmentMomentum` / `computeRelationshipMomentum` | `momentum.ts` | ❌ Not used |
| `extractMeetingIntelligence` | `meeting-extraction.ts` | ❌ Not used (backend shells out to CLI instead) |
| `QMD search provider` (`getSearchProvider`) | `search/` | ❌ Not used (backend has a custom naïve text-scan search) |
| `createServices` factory | `factory.ts` | ❌ Not used |

---

## Key Capabilities Missing from Web UI

### 1. Intelligence Layer — Completely Absent
- **`IntelligenceService.assembleBriefing()`** — The core "prime the AI" capability: assembles a `PrimitiveBriefing` from context, memory, people, and meetings for a given query. No web endpoint exists.
- **`IntelligenceService.prepareForSkill()`** — Assembles context scoped to a specific skill. No web equivalent.
- **`IntelligenceService.routeToSkill()`** — Routes a user query to the best matching skill. Not exposed.

### 2. Context Service — No Web Surface
- **`ContextService.getRelevantContext()`** — Semantic context assembly (finds most relevant files for a query, scored by recency + relevance). No web endpoint.
- **`ContextService.getContextForSkill()`** — Skill-scoped context bundle. Not exposed.
- **`ContextService.getContextInventory()`** — Dashboard of context file coverage and freshness gaps. Not exposed.

### 3. Memory Service — Re-implemented Naïvely
The backend `memory.ts` route does a raw file read + custom markdown regex parser for `decisions.md` and `learnings.md`. It misses:
- **`MemoryService.search()`** — Tokenized relevance search across all memory types. Backend has no memory search.
- **`MemoryService.create()`** — Write a new memory entry from the web UI. Not exposed.
- **`MemoryService.getTimeline()`** — Temporal view of memory items matching a query. Not exposed.
- **`MemoryService.getIndex()`** — Structured index of all memory. Not exposed.
- **`observations.md`** — The memory route only reads `decisions.md` and `learnings.md`; `observations.md` is silently omitted.

### 4. Entity Service — Partially Re-implemented
The backend `people.ts` route does manual file scanning with gray-matter. Missing:
- **`EntityService.resolve()`** — Ambiguous name/email resolution (fuzzy match). Not exposed.
- **`EntityService.findMentions()`** — Find all workspace references to a person. Not exposed.
- **`EntityService.getRelationships()`** — Extract relationship graph between entities. Not exposed.
- **`EntityService.refreshPersonMemory()`** — LLM-powered refresh of the `AUTO_PERSON_MEMORY` block (stances, action items, health). Not triggerable from web UI.
- **`EntityService.suggestPeopleIntelligence()`** — AI-generated people intelligence digest. Not exposed.
- **`EntityService.buildPeopleIndex()`** — Rebuild the people index file. Not exposed.
- **`EntityService.getRecentPeopleIntelligenceSnapshots()`** — Historical intelligence snapshots. Not exposed.

### 5. CommitmentsService — Re-implemented with Raw JSON
The backend `intelligence.ts` and the PATCH `/api/commitments/:id` route read/write `commitments.json` directly with raw `fs` and manual JSON manipulation. Missing vs `CommitmentsService`:
- **`CommitmentsService.sync()`** — Sync commitments from fresh LLM extraction results (deduplication, aging). Not exposed.
- **`CommitmentsService.reconcile()`** — Match completed CLI tasks back to open commitments. Not exposed.
- **`CommitmentsService.bulkResolve()`** — Batch-resolve multiple commitments. Not exposed.
- **Direction filtering** — `listOpen({ direction })` allows filtering i_owe_them vs they_owe_me. Backend has no direction filter.

### 6. Momentum Analysis — Completely Absent
- **`computeCommitmentMomentum()`** — Buckets commitments as `hot`, `stale`, `critical` with trend data. No web endpoint.
- **`computeRelationshipMomentum()`** — Buckets relationships as `active`, `cooling`, `stale`. No web endpoint. The backend people list has a `trend` field that is always `null`.

### 7. Person Health Scoring — Not Wired Up
- **`computeRelationshipHealth()`** — Computes `RelationshipHealth` (score 0–100, status, indicator) from meeting frequency. The backend people route reads health from the auto-memory block if pre-written, but never computes it live. If the block is stale or absent, `healthScore` returns `null`.

### 8. Person Signals — LLM Extraction Not Exposed
- **`extractStancesForPerson()`** — LLM extraction of person stances from meeting content. No web endpoint to trigger.
- **`extractActionItemsForPerson()`** — LLM extraction of action items. No web endpoint to trigger.

### 9. Semantic Search — Not Used
The backend `/api/search` route is a naïve keyword scanner (reads every file with `fs`, counts token occurrences). Core has:
- **`getSearchProvider()`** — Returns the QMD vector search provider or fallback. Not used by the backend search route at all.
- **Semantic/embedding search** — No vector similarity search in any web endpoint.

### 10. Integration Management — Completely Absent
- **`IntegrationService.pull()`** — Trigger a data pull from any integration (calendar, Fathom, Krisp, Notion). No web endpoint.
- **`IntegrationService.list()`** — List configured integrations and their status. Not exposed.
- **`IntegrationService.configure()`** — Configure an integration via OAuth or token. Not exposed.
- **Krisp**, **Notion**, **Fathom** integrations — All core integration modules have zero web surface area.

### 11. Skill & Tool Discovery — Completely Absent
- **`SkillService.list()`** — List installed skills. Not exposed.
- **`SkillService.get()`** — Fetch a skill definition. Not exposed.
- **`ToolService.list()`** — List available tools. Not exposed.
- The web UI has no skill or tool browser.

### 12. Factory / Service Wiring
- **`createServices()`** — The canonical service graph factory is never called by the backend. Each route does its own ad-hoc file I/O. This means the backend bypasses all the intelligence wiring and dependency injection that the CLI benefits from.

---

## Summary

The web backend uses `@arete/core` for **only 8 low-level utility functions** (storage, staged items, config, QMD index refresh) and **1 intelligence function** (`detectCrossPersonPatterns`). All 9 service classes — including `ContextService`, `MemoryService`, `EntityService`, `IntelligenceService`, `CommitmentsService`, and more — are entirely unused. The backend independently re-implements simpler versions of people loading, memory parsing, commitments CRUD, and text search using raw `fs` calls, systematically bypassing the intelligence layer that makes Areté valuable.
