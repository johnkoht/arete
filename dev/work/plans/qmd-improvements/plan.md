---
title: Qmd Improvements
slug: qmd-improvements
status: building
size: large
tags: [qmd, search, indexing, intelligence]
created: 2026-02-21T21:07:59.282Z
updated: 2026-02-22T00:24:38.784Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 6
---

# QMD Improvements

## Problem

QMD is Areté's semantic search engine — it's the intelligence layer that makes `arete brief`, `arete context`, and `arete memory search` work well. Most PM skills (goals-alignment, week-plan, daily-plan, meeting-prep, etc.) depend on it for relevant context. But the index only refreshes when users run `arete install` or `arete update` manually.

**Gap 1:** Every time content is added to the workspace — meetings pulled, conversations captured, people processed — the index goes stale. Skills silently search an incomplete picture of the workspace. Users don't know this is happening.

**Gap 2:** EntityService (people intelligence, person-to-meeting linking) does exhaustive file scanning instead of semantic search. Every person × every meeting = O(n×m) reads. qmd could pre-filter this and unlock semantic resolution ("who works on pricing?").

## Success Criteria

- Any CLI command that writes `.md` files automatically triggers a qmd re-index in the background
- Users never need to remember to run `arete update` to keep search current
- EntityService uses qmd to pre-filter meeting scans when qmd is available
- All changes tested; no regressions; test suites unaffected (`--skip-qmd` / `ARETE_SEARCH_FALLBACK` guards honored)

---

## QMD Usage Map

### Skills that USE qmd for search (reads)

| Skill | Intelligence type | What qmd surfaces |
|---|---|---|
| goals-alignment | context_injection | Past alignment docs, OKR discussions, strategy archives |
| week-plan | context_injection | Past priorities, project context, carry-overs |
| week-review | context_injection | Context around the week's work |
| daily-plan | context_injection + memory_retrieval | Context per meeting, memory about people/topics |
| meeting-prep | context_injection | Past interactions, related decisions, project context |
| discovery / create-prd / roadmap | context_injection | Past related work, decisions, relevant context |
| process-meetings | memory_retrieval | Memory about people being processed |
| arete brief | context + memory | Everything — the full briefing intelligence layer |
| arete context --for | context_injection | Relevant workspace files for a task query |
| arete memory search | memory_retrieval | Decisions, learnings, observations |

### Commands that WRITE content (re-index triggers, currently missing)

| Command / Action | Files written | Currently re-indexes? |
|---|---|---|
| arete pull fathom | N meeting files | ❌ No |
| arete meeting add | 1 meeting file | ❌ No |
| arete meeting process | Person files + meeting frontmatter | ❌ No |
| capture-conversation (Slack, etc.) | 1 conversation file | ❌ No |
| arete install | All initial files | ✅ Yes (one-time) |
| arete update | — | ✅ Yes (manual only) |

### Gaps

- **capture-conversation**: No qmd at all — write doesn't trigger re-index; read doesn't use qmd
- **EntityService**: File-scan only; no qmd pre-filtering for person ↔ meeting matching

---

## Plan

### Phase 1 — Index Freshness (Medium, 4 steps)

**Problem:** Content written by CLI commands goes unsearchable until the user manually runs `arete update`.

**Success:** Any CLI command that writes `.md` files automatically triggers qmd re-index. No user action required. Test suites unaffected.

#### 1. Extract `refreshQmdIndex()` helper in `qmd-setup.ts`

Create a lightweight function separate from `ensureQmdCollection()`:
- Signature: `refreshQmdIndex(workspaceRoot, existingCollectionName, deps?)`
- Checks if qmd binary is on `$PATH` AND a collection is configured AND `ARETE_SEARCH_FALLBACK` not set
- Runs `qmd update` in the workspace root if all checks pass
- Non-fatal: returns a warning on failure, never throws
- Skips silently if any check fails
- Uses `testDeps` injection pattern (same as `ensureQmdCollection`)
- AC: Function exported from `qmd-setup.ts` and `@arete/core`, unit tested for all skip/run/failure cases
- AC (catalog): Update `dev/catalog/capabilities.json` — correct `qmd-semantic-search` implementation paths (stale: `search-providers/qmd.ts` → `search/providers/qmd.ts`); remove non-existent `search.ts`; add `search/qmd-setup.ts`

#### 2. Wire `refreshQmdIndex()` into all write-path CLI commands

Add post-write refresh to:
- `arete pull fathom` — after all meeting files are saved, only if count > 0
- `arete meeting add` — after the meeting file is written, only if `saveMeetingFile` returned non-null
- `arete meeting process` — after person files written, only if `applied.length > 0`
- Add `--skip-qmd` flag to all three commands

Output behavior:
- If indexed: `listItem('Search index', 'qmd index updated')`
- If skipped (qmd not installed or no collection): silent
- If warning: `warn(result.warning)`

- AC: After each command, qmd index reflects newly written files. `--skip-qmd` suppresses re-indexing.
- AC (config): `meeting.ts` must add `loadConfig(services.storage, root)` after `findRoot()` succeeds, following `pull.ts` pattern (L98). Pass `config.qmd_collection` to `refreshQmdIndex()`.
- AC (test audit): Audit existing `meeting-process.test.ts` and any test that invokes `meeting process` without `--skip-qmd`; add the flag to all such calls.

#### 3. Add `arete index` standalone command

For users who add/edit files outside the CLI (manual context docs, notes, etc.):
- Runs `qmd update` if collection exists
- Reports: collection name, indexed/skipped, any warnings
- `--status` flag: show collection name from `arete.yaml` (does NOT report index freshness — qmd doesn't expose a last-indexed timestamp)
- Works idempotently (safe to run multiple times)
- Help text: "Re-index the search collection. For full workspace update (rules, skills, assets), use `arete update`."

AC: `arete index` command registered, runs qmd update, shows result. `arete index --status` shows collection name from config (or "no collection configured"). Works gracefully when qmd not installed. Tested.

#### 4. Update `qmd-search.mdc` rule for write-path awareness

Update the agent-facing rule to instruct agents to run `arete index` after writing files:
- After `capture-conversation` saves a conversation file (explicitly named)
- After any agent-driven write that adds new `.md` content

AC: Rule updated in both `packages/runtime/rules/cursor/qmd-search.mdc` and `packages/runtime/rules/claude-code/qmd-search.mdc`. `diff` between the two files produces zero output after the edit.

---

### Phase 2 — Expand Search Coverage into EntityService (Small, 2 steps)

**Problem:** EntityService does exhaustive file scanning (every meeting file for every person). Doesn't scale. Misses semantic connections.

**Success:** When qmd is available, EntityService pre-filters meeting files semantically before line-level extraction.

#### 5. Inject `SearchProvider` into EntityService

- Add optional `searchProvider?: SearchProvider` parameter to `EntityService` constructor
- In `refreshPersonMemory`: if search provider is available, run semantic search for the person's name first
  - Results > 0: use matched file paths as scan set
  - Results = 0: **always fall back to full scan** — never skip
- Backward compatible: all 5 existing `new EntityService(storage)` construction sites unchanged

AC: EntityService accepts optional SearchProvider. Tests pass with both qmd provider and fallback provider.
AC: Explicit test: mock SearchProvider returning `[]` → full scan executes.

#### 6. Wire SearchProvider into EntityService via factory

- In `factory.ts`, pass the search provider to EntityService when creating services
- No user-visible behavior change — same outputs, faster execution on large workspaces

AC: `createServices()` passes search provider to EntityService. Existing entity tests pass.
AC (integration): New test verifies that `createServices()` passes a SearchProvider to EntityService (non-undefined).

---

## Out of Scope

- Live/filesystem-watcher indexing (overkill for workspace sizes)
- Changing qmd chunk size or indexing granularity (qmd's concern)
- Semantic skill routing (pattern matching is sufficient)
- Non-markdown file indexing
- Real-time progress during qmd update

## Size Estimate

- Phase 1: Medium (4 steps)
- Phase 2: Small (2 steps)
- Total: Large (6 steps)

## Riskiest Parts

1. **Step 2** — Test suite hangs if `--skip-qmd` is missing from any test that invokes `meeting process`. Already bit us (`fbb5ad2`). Must audit existing tests.
2. **Step 2** — `meeting.ts` has no `loadConfig` — must be added after `findRoot()`, following `pull.ts` L98 pattern exactly.
3. **Step 5** — EntityService pre-filter returning 0 results must always fall back to full scan. Silent correctness bug if not.
