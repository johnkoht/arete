---
name: arete-hygiene-pass-1
slug: arete-hygiene-pass-1
status: approved
has_pre_mortem: true
has_review: true
has_prd: true
created: 2026-04-29
---

# Areté Hygiene Pass 1

## Goal

Cut ~2.7K LOC of verified-dead and verifiably-redundant code from `packages/core/` and the repo root, plus extract one inline helper that the wiki-leaning team flagged as refactor backlog. Zero behavioral change for users; smaller surface area for the next round of structural work.

This is the first of three planned simplification passes (this pass = hygiene; next = CLI deprecation window; third = compat migration). It deliberately avoids any architecturally-loaded refactor.

## In scope / Out of scope

**In scope** (all verified safe by paranoid review on 2026-04-28):
- T1 — Delete pre-monorepo legacy `src/`, `test/`, `tsconfig.test.json`
- T2 — Delete four `@deprecated` named functions with **zero production callers**
- T3 — Delete the `person-signals.ts` action-item LLM cluster (3 functions + ~50 tests; whole cluster is unreachable from production)
- T4 — Delete `ContextService.getContextForSkill` (zero callers)
- T5 — Convert `ToolService` to free `listTools` / `getTool` functions (one-method-class smell; mirror-pattern with no payoff)
- T6 — Extract `buildTopicWikiContext` helper from `meeting-context.ts:978–1025` (refactor item flagged by wiki-leaning team)

**Out of scope** (deferred to future plans, not this one):
- `compat/` migration — separate plan; needs 5 CLI + 2 backend call-site migrations + 6 test rewrites
- CLI deprecation-window collapses (`context --for`, `memory search`, `memory timeline`) — separate plan; touches AGENTS.md:66 + skill prose
- `MemoryLogService` — provides POSIX `O_APPEND` atomicity; the pure-function "replacement" silently loses concurrent-append guarantees
- `loadMemorySummary` — 4 production callers post-0.9.0; inlining duplicates code with no benefit
- `model-router.ts` / `arete route` — held pending router decision per 2026-04-28
- `patterns.ts` rewrite — locked out by 0.9.0 architectural direction (L2-coexists-with-wiki)
- Any data-shape changes to `MemoryEntry`, `MemoryResult`, or `parseMemorySections` — invariant-protected per `services/LEARNINGS.md:116`

## Decisions log

1. **Bundle the action-item LLM cluster as one task.** `buildActionItemPrompt`, `parseActionItemResponse`, and `extractActionItemsForPerson` are mutually dependent — `extractActionItemsForPerson` is the only production-shaped consumer of the other two, and itself has zero production callers. Deleting them as a unit avoids leaving orphan exports.
2. **Keep `tsconfig.test.json` deletion bundled with `src/`+`test/` deletion (T1).** It exists only to typecheck the legacy directories; once those are gone it has no consumer (one doc reference in `.pi/standards/build-standards.md:44` updated as part of T1).
3. **`ToolService` → free functions over keep-and-document.** Four call sites, all using only `list()` / `get()`; the class header comment literally says "Mirrors SkillService pattern for consistency" — symmetry without payoff. Migration is mechanical.
4. **`buildTopicWikiContext` extraction is pure refactor, no behavior change.** All 5 `topicWikiContext` enrichment tests in `meeting-context.test.ts` must pass unmodified after the extraction.
5. **Single PR, 6 commits (one per task).** Each task self-contained and bisectable; if any fails review, revert that one commit.
6. **Task ordering is pinned: T1 → T2 → T3 → T4 → T5 → T6.** Per pre-mortem R4: T2's `PRODUCT_RULES_ALLOW_LIST` deletion has its only callers in legacy `test/` deleted by T1; running T2 first leaves a red-typecheck commit and breaks bisectability. T3, T4, T5, T6 are independent of each other but follow the order for predictable diff narration.
7. **T6 helper signature: return value, no shared-mutation.** Per pre-mortem R2: helper returns `{ context?: TopicWikiContext; warning?: string }`. Caller assigns conditionally (`if (result.context) bundle.topicWikiContext = result.context; if (result.warning) warnings.push(result.warning)`). The exact warning message string `Topic-wiki context failed: ${msg}` is preserved verbatim.
8. **T6 helper stays module-private.** Per pre-mortem R1: name `buildTopicWikiContext` already collides in spirit with the existing `buildTopicWikiContextSection` in `meeting-extraction.ts:532` (string-builder). Keeping the new helper file-private avoids barrel pollution and IDE auto-import confusion. No barrel export added to `services/index.ts`.
9. **`dist/` rebuild required.** Per pre-mortem R3 + memory note "Commit dist files": T5 changes the `services.tools` shape on the public `@arete/core` surface; `npm run build` must run before merge. Same applies for T4's `.pi/expertise/core/PROFILE.md` edit (rebuild via `npm run build:agents:dev` if dist mirror exists).

## Tasks

### T1 — Remove pre-monorepo legacy `src/`, `test/`, `tsconfig.test.json`

**Files affected**:
- Delete: `/src/` (13 files) — `commands/{install,intelligence,people,pull-calendar,seed-test-data,update}.ts`, `core/{briefing,context-injection,entity-resolution,memory-retrieval,people,skill-router,workspace}.ts`
- Delete: `/test/` (4 files) — `commands/update.test.ts`, `core/{people,entity-resolution,rule-transpiler}.test.ts`
- Delete: `/tsconfig.test.json`
- Edit: `.pi/standards/build-standards.md:44` — remove the `tsconfig.test.json` reference

**Acceptance criteria**:
- [ ] `npm run typecheck` passes (none of these files are in the active build)
- [ ] `npm test` passes (none of these tests run today; verified — `package.json:42` test script globs `packages/*/test`)
- [ ] `git grep -E "from .*(src/commands|src/core)/" packages` returns zero results
- [ ] `.pi/standards/build-standards.md` no longer references `tsconfig.test.json`
- [ ] No CI workflow file references the deleted paths (verified: `.github/workflows/integration-tests.yml` watches `packages/cli/src/**` only)

**Verification**:
```bash
# Confirm legacy is unreferenced
git grep -E "(\.\./){1,3}(src|test)/(core|commands)" -- packages
# Should print nothing
```

### T2 — Delete four `@deprecated` named functions with zero production callers

**Files affected**:
- Edit: `packages/core/src/services/area-memory.ts` — delete file-private `extractKeywords` (line 254, ~30 LOC), delete the `// eslint-disable-next-line @typescript-eslint/no-unused-vars` comment that suppresses its dead-code warning
- Edit: `packages/core/src/services/meeting-processing.ts` — delete file-private `findMatchingCompletedItem` (line 305, ~10 LOC; 1-line wrapper around `findMatchingCandidate`)
- Edit: `packages/core/src/integrations/krisp/client.ts` — delete public method `getDocument` (line 523)
- Edit: `packages/core/test/integrations/krisp.test.ts` — delete the `'getDocument (deprecated) wraps getMultipleDocuments'` describe block (~10 LOC)
- Edit: `packages/core/src/workspace-structure.ts` — delete `PRODUCT_RULES_ALLOW_LIST` const (line 64; only test-callers were in legacy `test/` deleted in T1)
- Edit: `packages/core/src/integrations/krisp/LEARNINGS.md` — update the line referencing `getDocument` if it still implies the method exists

**Acceptance criteria**:
- [ ] `git grep -nE "extractKeywords|findMatchingCompletedItem|PRODUCT_RULES_ALLOW_LIST" -- packages src` returns zero matches
- [ ] `git grep -nE "\.getDocument\(" -- packages` returns zero matches
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (krisp test count drops by exactly 1 case)
- [ ] No `@deprecated` JSDoc remains attached to a function that does not exist

**Verification**:
```bash
# Sequence after T1 (PRODUCT_RULES_ALLOW_LIST has legacy test/ callers that T1 removes)
git grep -nE "extractKeywords|findMatchingCompletedItem|getDocument|PRODUCT_RULES_ALLOW_LIST" -- packages src
# Should print nothing for the four names (entity.ts uses different person-signals exports)
```

### T3 — Delete the `person-signals.ts` action-item LLM cluster

**Context**: Three functions form a self-contained LLM-prompt extraction path that has been superseded by `parseActionItemsFromMeeting` (in `meeting-parser.ts`) for meetings, and has zero production callers for non-meeting sources. Verified: `entity.ts` imports a *different* set (`extractStancesForPerson`, `isActionItemStale`, `deduplicateActionItems`, `capActionItems`) — those stay.

**Files affected**:
- Edit: `packages/core/src/services/person-signals.ts` — delete:
  - `buildActionItemPrompt` (line 361, ~30 LOC)
  - `RawActionItemResult` type alias (line 398, ~7 LOC)
  - `VALID_ACTION_ITEM_DIRECTIONS` set (line 405, ~1 LOC)
  - `parseActionItemResponse` (line 418, ~50 LOC)
  - `extractActionItemsForPerson` (line 634, ~50 LOC)
  - Any imports/types that become unused
- Edit: `packages/core/test/services/person-signals.test.ts` — delete:
  - `import` of `buildActionItemPrompt`, `parseActionItemResponse`, `extractActionItemsForPerson` (lines 7, 8, 13)
  - `describe('extractActionItemsForPerson', …)` block (line 528)
  - `describe('buildActionItemPrompt', …)` block (line 696)
  - `describe('parseActionItemResponse', …)` block (line 745)
  - `describe('extractActionItemsForPerson (LLM path)', …)` block (line 881)
  - **Keep**: `buildStancePrompt`, `parseStanceResponse`, `extractStancesForPerson`, `computeActionItemHash`, `isActionItemStale`, `capActionItems`, `deduplicateActionItems` describe blocks (these test live exports)

**Acceptance criteria**:
- [ ] `git grep -nE "buildActionItemPrompt|parseActionItemResponse|extractActionItemsForPerson" -- packages` returns zero matches
- [ ] `git grep -nE "RawActionItemResult|VALID_ACTION_ITEM_DIRECTIONS" -- packages` returns zero matches (per pre-mortem R6 — orphan type/const cleanup)
- [ ] `npm run typecheck` passes — no orphan type/import references
- [ ] `npm test -- --test-name-pattern person-signals` passes
- [ ] **Pre-task setup**: capture pre-deletion test count via `npx tsx --test packages/core/test/services/person-signals.test.ts 2>&1 | tail -3` and record N_before
- [ ] Test count for `person-signals.test.ts` drops by **exactly N** where N = sum of test cases in the four deleted describe blocks (`extractActionItemsForPerson`, `extractActionItemsForPerson (LLM path)`, `buildActionItemPrompt`, `parseActionItemResponse`); remaining tests cover only live exports (`buildStancePrompt`, `parseStanceResponse`, `extractStancesForPerson`, `computeActionItemHash`, `isActionItemStale`, `capActionItems`, `deduplicateActionItems`)
- [ ] `entity.ts` still typechecks against its `person-signals.js` imports

**Verification**:
```bash
# Before deletion, capture current entity.ts imports list
grep -A 10 "from './person-signals'" packages/core/src/services/entity.ts
# After deletion, the same import should still typecheck (only stance + capping helpers used)
```

### T4 — Delete `ContextService.getContextForSkill`

**Context**: Zero in-repo callers. Only reference: the method definition itself + one mention in `.pi/expertise/core/PROFILE.md:58` describing it as a "key export."

**Files affected**:
- Edit: `packages/core/src/services/context.ts` — delete `getContextForSkill` (line 516, ~25 LOC), delete any imports that become unused
- Edit: `.pi/expertise/core/PROFILE.md` — remove the `getContextForSkill` line from the key-exports list
- Edit: `dist/.pi/expertise/core/PROFILE.md` if it exists — same change (auto-rebuilt by `npm run build:agents:dev`)

**Acceptance criteria**:
- [ ] `git grep -n "getContextForSkill" -- packages .pi` returns zero matches
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `ContextService` retains all other public methods (`getRelevantContext`, `getContextInventory`, `listProjectSubdirs`, `listProjectFiles`, `readFile`)
- [ ] After running `npm run build:agents:dev` (if `dist/.pi/expertise/core/PROFILE.md` exists), `git diff -- '.pi/expertise/core/PROFILE.md' 'dist/.pi/expertise/core/PROFILE.md'` shows symmetric edits (or both files staged); if no dist mirror exists, this is N/A

### T5 — Convert `ToolService` to free `listTools` / `getTool` functions

**Pre-task setup** (mandatory before any code edits):
1. From `main`, run `arete tool list > /tmp/tool-list-before.txt` to capture the byte-baseline output for the smoke test below.

**Files affected**:
- Edit: `packages/core/src/services/tools.ts` — replace class with two exported functions; preserve same behavior (frontmatter parsing, file scanning) and same input/output shapes
- Edit: `packages/core/src/factory.ts` — remove `import { ToolService }`, remove `tools: ToolService` from `AreteServices` interface (line 45), remove `const tools = new ToolService(storage)` (line 114), remove `tools` key from the returned object
- Edit: `packages/core/src/services/index.ts` — replace `export { ToolService } from './tools.js'` with `export { listTools, getTool } from './tools.js'`
- Edit: `packages/cli/src/commands/tool.ts` — replace `services.tools.list(paths.tools)` with `listTools(services.storage, paths.tools)`; same for `services.tools.get(name, paths.tools)` → `getTool(services.storage, name, paths.tools)`. Add `import { listTools, getTool } from '@arete/core'`.
- Edit: `packages/cli/src/commands/route.ts:41` — same migration
- Edit: `packages/cli/src/commands/skill.ts:289` — same migration
- Edit: `packages/core/test/factory.test.ts` — remove `tools is ToolService` assertion (line 76); update factory keys assertion if it enumerates `tools`
- Edit: `packages/core/test/services/tools.test.ts` — migrate from `new ToolService(storage)` + `service.list()` / `service.get()` to direct `listTools(storage, dir)` / `getTool(storage, name, dir)` calls; preserve every test case verbatim otherwise

**Acceptance criteria**:
- [ ] `git grep -n "ToolService\|services\.tools" -- packages` returns zero matches (in source AND tests)
- [ ] `git grep -nE "services\\.tools|new ToolService" -- packages` returns matches only in T5-modified files; **no hits** in `packages/apps/`, `packages/runtime/`, or `packages/cli/src/lib/` (per pre-mortem R5 — cross-package consumer audit)
- [ ] `git grep -n "listTools\|getTool" -- packages` returns the new exports + 4 call sites + tests
- [ ] `npm run typecheck` passes (cli + core both)
- [ ] `npm test -- --test-name-pattern "tools|factory"` passes with same number of tests as before
- [ ] `arete tool list` produces **byte-identical** output to `/tmp/tool-list-before.txt` captured in pre-task setup; `diff /tmp/tool-list-before.txt <(arete tool list)` is empty
- [ ] `arete tool show <name>` smoke test on a known tool produces output of equivalent shape (header + frontmatter fields)
- [ ] `arete skill route "test"` and `arete route "test"` still produce skill suggestions
- [ ] `services.tools` is no longer in the `createServices()` return type; consumers use `listTools` / `getTool` directly
- [ ] After `npm run build`, `git status -- 'packages/core/dist/factory.{js,d.ts}' 'packages/core/dist/services/tools.{js,d.ts}' 'packages/core/dist/services/index.{js,d.ts}' 'packages/cli/dist/commands/tool.js' 'packages/cli/dist/commands/route.js' 'packages/cli/dist/commands/skill.js'` shows the modified dist files staged (per pre-mortem R3 — dist parity)
- [ ] One-line comment in `services/index.ts` next to the new `listTools`/`getTool` exports clarifying namespace ("workspace tool discovery; see also `services/skills.ts`") to discourage future generic-named additions

**Verification**:
```bash
# Smoke test: same output before and after
arete tool list > /tmp/tool-list-after.txt
diff /tmp/tool-list-before.txt /tmp/tool-list-after.txt
# Should be empty
```
(Capture `tool-list-before.txt` on `main` before starting T5.)

### T6 — Extract `buildTopicWikiContext` helper from `meeting-context.ts`

**Context**: The wiki-leaning team's final review (`dev/work/plans/wiki-leaning-meeting-extraction/final-review.md`) explicitly flagged this as refactor backlog: *"Extract `buildTopicWikiContext` helper from `meeting-context.ts` (~47 inline lines, 978–1025)"*. Pure refactor, no behavior change.

**Current shape** (`meeting-context.ts:978–1025`):
- Inline 47-line block inside `buildMeetingContext`
- Mutates `bundle.topicWikiContext` directly
- Mutates `warnings` on failure (push)

**Target shape** (per Decisions #7, #8):
- New module-private helper at the bottom of the file (above `// Exports for testing`):
  ```ts
  async function buildTopicWikiContext(
    deps: MeetingContextDeps,
    paths: WorkspacePaths,
    transcript: string,
  ): Promise<{ context?: TopicWikiContext; warning?: string }>
  ```
- Pure: returns a result object; **does not mutate any input**.
- The helper's try/catch produces `{ warning: \`Topic-wiki context failed: ${msg}\` }` on failure (preserves exact string).
- The helper's success path returns either `{ context: { detectedTopics } }` (when at least one detected topic resolves) or `{}` (when no topics detected — keeps `bundle.topicWikiContext` absent rather than `undefined`).
- **Caller pattern** (replaces lines 978–1025):
  ```ts
  const wiki = await buildTopicWikiContext(deps, paths, transcript);
  if (wiki.context) bundle.topicWikiContext = wiki.context;
  if (wiki.warning) warnings.push(wiki.warning);
  ```
- **Helper is NOT exported** — kept file-private. Not added to `services/index.ts`. Reuses the existing `TopicWikiContext` type from `meeting-extraction.ts` (or the equivalent inline shape) — do not introduce a new type alias.

**Files affected**:
- Edit: `packages/core/src/services/meeting-context.ts` — extract block 978–1025 into helper; update caller to the 3-line pattern above
- (No test file changes required; existing 5 `topicWikiContext` enrichment tests in `meeting-context.test.ts` must pass unmodified)

**Acceptance criteria**:
- [ ] Helper `buildTopicWikiContext` exists, is **not** exported, returns `{ context?; warning? }`
- [ ] `buildMeetingContext` reduced by ~47 lines at the topic-wiki step (replaced by 3-line caller)
- [ ] Caller assigns `bundle.topicWikiContext` only when `wiki.context` is defined (never `bundle.topicWikiContext = undefined`); preserves "absent key" semantics
- [ ] Caller pushes warning string verbatim: `Topic-wiki context failed: ${msg}`
- [ ] All 5 `topicWikiContext` enrichment tests in `meeting-context.test.ts` pass **without modification** (this is the contract)
- [ ] All 66 tests in `meeting-context.test.ts` pass
- [ ] `npm run typecheck` passes
- [ ] `git grep -nE "^export.*\bbuildTopicWikiContext\(" -- packages/core/src` returns at most ONE pre-existing line (`buildTopicWikiContextSection` in `meeting-extraction.ts`); the new helper is not in the grep
- [ ] `git grep -n "buildTopicWikiContext" -- packages/core/src/services/index.ts` returns nothing
- [ ] `grep -n "topicWikiContext" packages/core/test/services/meeting-context.test.ts` review: no test asserts `=== undefined` on the `bundle.topicWikiContext` key (per pre-mortem R7 — confirms "absent key" semantics rather than "key with undefined value"; if any such assertion exists, document the equivalence in commit message)

**Verification**:
```bash
npx tsx --test packages/core/test/services/meeting-context.test.ts 2>&1 | tail -5
# Expect: 66 pass / 0 fail
```

## Testing strategy

**Per-task verification** (each commit must independently pass):
- `npm run typecheck` — clean across `packages/core`, `packages/cli`, `packages/apps/backend`, `packages/apps/web`
- `npm test` — full suite passes
- Per-task targeted tests as listed in each task's verification block

**Global verification** (after all 6 tasks):
- Full test suite green: `npm test`
- Build green: `npm run build` — **mandatory before merge** (T5 changes the public `services.tools` shape; users install from GitHub commits per memory note "Commit dist files")
- Agents-doc rebuild: `npm run build:agents:dev` — runs after T4's `.pi/expertise/core/PROFILE.md` edit to refresh `dist/` mirror if present
- Smoke tests on the user-visible CLI surface that touched files transitively support:
  - `arete tool list` (touched by T5)
  - `arete tool show <name>` (touched by T5)
  - `arete route "test query"` (touches T5 via `services.tools` removal)
  - `arete skill route "test query"` (touches T5)
  - `arete meeting extract --dry-run-topics <recent-meeting>` (touches T6 via `buildMeetingContext`)
- Backend smoke: start `packages/apps/backend`, hit `GET /api/intelligence/patterns` (touches none of these directly but exercises `services.*` shape)

**Dark-code audit** (Phase 4.3 of /ship):
- Per Phase 4.3 protocol, run the dark-code grep on every new export. Expected: T5's `listTools`/`getTool` are wired at 4 production sites; T6's `buildTopicWikiContext` is wired at 1 production site (or stays module-private). No new dark exports.

**Regression sentinels**:
- T2 deletion of `getDocument` — Krisp test count drops by exactly 1
- T3 deletion of action-item cluster — `person-signals.test.ts` test count drops by ~50; remaining tests still pass
- T5 conversion — `factory.test.ts` services-shape assertion updated; `tools.test.ts` test count unchanged
- T6 extraction — `meeting-context.test.ts` 66/66 unchanged (proves no behavior drift)

## Risks and mitigations

1. **R1 — Hidden caller for one of the "dead" symbols (MEDIUM).** Probability is low (paranoid review on 2026-04-28 ran cross-tree greps + checked dynamic dispatch and barrel re-exports), but a string-keyed registry or runtime config could still reach one of these. **Mitigation**: typecheck + test runs catch most; manual smoke tests on CLI commands that transitively use the deleted code paths catch the rest. If T5's `services.tools` removal breaks any caller, revert that commit only — others are independent.

2. **R2 — `tsconfig.test.json` deletion breaks an unknown tool (LOW).** No script invokes it (verified — only doc reference). **Mitigation**: deletion is reversible; if a builder workflow surfaces a need, restore.

3. **R3 — `entity.ts` import list breaks because of T3 (LOW).** Verified `entity.ts` imports `extractStancesForPerson`, `isActionItemStale`, `deduplicateActionItems`, `capActionItems` — none in the deletion set. **Mitigation**: typecheck after T3 catches any leak.

4. **R4 — T6 extraction subtly changes timing/error-handling shape (LOW).** The 47-line inline block has a try/catch that pushes to `warnings` on failure. The helper must preserve this exactly: caller-observable behavior on `topicMemory.listAll` failure is "warning pushed, bundle.topicWikiContext undefined." **Mitigation**: existing 5 enrichment tests + the catch-path test must pass unmodified.

5. **R5 — Concurrent merge with another in-flight branch (LOW).** Wiki-leaning shipped 2026-04-29 (yesterday); no other in-flight work touches these files per `git log --since="2 days ago"`. **Mitigation**: rebase fresh from main before merge gate.

6. **R6 — Standards doc update missed (LOW).** `.pi/standards/build-standards.md:44` references `tsconfig.test.json`. **Mitigation**: included in T1 ACs.

7. **R7 — `dist/` build artifacts go stale (LOW).** Per memory, `dist/` is committed. **Mitigation**: rebuild dist as part of the wrap phase; run `npm run build:agents:dev` if `.pi/expertise/core/PROFILE.md` changed (T4).

## Out of scope (explicit deferrals)

- Anything described in the wiki-consolidation thinking from the 2026-04-27 review session (Proposals A/B/C/D) — locked out by 0.9.0 architectural direction
- Compat migration (`packages/core/src/compat/`) — load-bearing for 5 CLI commands and 2 backend services; needs its own plan
- CLI deprecation collapse (`context --for`, `memory search`, `memory timeline`) — touches AGENTS.md:66 and skill prose; needs deprecation window
- `MemoryLogService` refactor — POSIX atomicity load-bearing
- `loadMemorySummary` inlining — 4 callers; net negative
- `model-router.ts` and `arete route` — held pending router decision
- `patterns.ts` rewrite over wiki — locked out by 0.9.0 direction
- BUILD-mode → Claude Code skill migration — separate project entirely

## Critical files

- `/Users/john/code/arete/src/` (entire dir, deleted T1)
- `/Users/john/code/arete/test/` (entire dir, deleted T1)
- `/Users/john/code/arete/tsconfig.test.json` (deleted T1)
- `/Users/john/code/arete/.pi/standards/build-standards.md` (T1 doc edit)
- `/Users/john/code/arete/packages/core/src/services/area-memory.ts` (T2)
- `/Users/john/code/arete/packages/core/src/services/meeting-processing.ts` (T2)
- `/Users/john/code/arete/packages/core/src/integrations/krisp/client.ts` (T2)
- `/Users/john/code/arete/packages/core/src/integrations/krisp/LEARNINGS.md` (T2)
- `/Users/john/code/arete/packages/core/test/integrations/krisp.test.ts` (T2)
- `/Users/john/code/arete/packages/core/src/workspace-structure.ts` (T2)
- `/Users/john/code/arete/packages/core/src/services/person-signals.ts` (T3)
- `/Users/john/code/arete/packages/core/test/services/person-signals.test.ts` (T3)
- `/Users/john/code/arete/packages/core/src/services/context.ts` (T4)
- `/Users/john/code/arete/.pi/expertise/core/PROFILE.md` (T4 doc edit)
- `/Users/john/code/arete/packages/core/src/services/tools.ts` (T5)
- `/Users/john/code/arete/packages/core/src/factory.ts` (T5)
- `/Users/john/code/arete/packages/core/src/services/index.ts` (T5)
- `/Users/john/code/arete/packages/cli/src/commands/tool.ts` (T5)
- `/Users/john/code/arete/packages/cli/src/commands/route.ts` (T5)
- `/Users/john/code/arete/packages/cli/src/commands/skill.ts` (T5)
- `/Users/john/code/arete/packages/core/test/factory.test.ts` (T5)
- `/Users/john/code/arete/packages/core/test/services/tools.test.ts` (T5)
- `/Users/john/code/arete/packages/core/src/services/meeting-context.ts` (T6)

## Estimated impact

- **Net LOC removed**: ~2,700 (legacy `src/`+`test/` ≈ 2,000; T2–T4 deletions ≈ 200; T3 test suite ≈ 180; T5 net ≈ -30; T6 net ≈ 0)
- **Tests removed**: ~50 (all dead-code coverage; ~1 from krisp + ~50 from person-signals)
- **Net test count delta**: -50 (no new tests; all changes preserve existing behavior coverage)
- **Files deleted**: ~20 (13 from `src/`, 4 from `test/`, plus `tsconfig.test.json` and 2 from `compat`-adjacent helpers if relevant)
- **Files edited**: ~15
