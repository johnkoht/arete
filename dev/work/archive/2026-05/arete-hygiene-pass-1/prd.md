# PRD: Areté Hygiene Pass 1

**Branch**: `feature/arete-hygiene-pass-1`
**Generated**: 2026-04-29
**Plan**: `dev/work/plans/arete-hygiene-pass-1/plan.md`
**Pre-mortem**: `dev/work/plans/arete-hygiene-pass-1/pre-mortem.md`
**Review**: `dev/work/plans/arete-hygiene-pass-1/review.md`

## Goal

Cut ~2.7K LOC of verified-dead and verifiably-redundant code from `packages/core/` and the repo root, plus extract one inline helper that the wiki-leaning team flagged as refactor backlog. Zero behavioral change for users; smaller surface area for the next round of structural work.

## Executor briefing (MUST READ BEFORE EXECUTING ANY TASK)

This section captures memory-synthesis findings from the Phase 2.1 review. Each developer prompt must apply these:

1. **Mitigations from pre-mortem are embedded in each task below** under "Mitigations to apply." Do not skim them — they are load-bearing per Decisions #6–#9.
2. **Each task lists "Files to read first."** Read those files in full before any edit. This pattern was the single highest-impact practice across 51 prior PRDs.
3. **Tasks must execute sequentially T1 → T2 → T3 → T4 → T5 → T6.** Per pre-mortem R4, T1 must precede T2 (PRODUCT_RULES_ALLOW_LIST callers live in legacy `test/` deleted by T1). Other orderings are independent on disk but follow the order for clean diff narration.
4. **No parallel subagent dispatch on the same worktree.** Always sequential.
5. **Dark-code audit will run at Phase 4.3.** New exports introduced by this PRD: only `listTools` and `getTool` from T5. T6's helper is module-private by design.
6. **Reviewer prompts (Phase 4.2 + per-task review) include the phrase "candid engineering judgment, not diplomatic hedging."**

## Decisions log (from plan; copied here for executor reference)

1. Bundle the action-item LLM cluster as one task (T3).
2. Bundle `tsconfig.test.json` deletion with T1.
3. `ToolService` → free functions over keep-and-document.
4. T6 is pure refactor, no behavior change; existing 5 enrichment tests must pass unmodified.
5. Single PR, 6 commits, each bisectable.
6. **Pinned task order: T1 → T2 → T3 → T4 → T5 → T6.**
7. **T6 helper signature**: returns `{ context?: TopicWikiContext; warning?: string }`; caller assigns conditionally; warning string preserved verbatim.
8. **T6 helper stays module-private**; not exported, not added to `services/index.ts`.
9. **`npm run build` mandatory before merge** — T5 changes public `services.tools` shape.

---

## Tasks

### Task 1 (T1) — Remove pre-monorepo legacy `src/`, `test/`, `tsconfig.test.json`

**Files to read first**:
- `/Users/john/code/arete/tsconfig.test.json`
- `/Users/john/code/arete/.pi/standards/build-standards.md` (find the `tsconfig.test.json` reference at line 44)

**Description**:
The repo root contains `/src/` (13 files) and `/test/` (4 files) from the pre-monorepo era. They are not in any active build (`tsconfig.json` references only `packages/core` and `packages/cli`; `package.json:42` test script globs only `packages/*/test`). The legacy code does not even compile (broken imports). Delete the directories, the orphan `tsconfig.test.json`, and the documentation reference.

**Mitigations to apply**:
- Pre-mortem R8 (LOW): `tsconfig.test.json` may be referenced by an editor workflow. Mitigation is reversibility — if a builder workflow surfaces a need, restore from git history.
- Pre-mortem R4: this task MUST land before T2 because T2 deletes `PRODUCT_RULES_ALLOW_LIST` whose only callers are in `test/commands/update.test.ts` and `test/core/rule-transpiler.test.ts` (both deleted here).

**Files affected**:
- Delete: `/Users/john/code/arete/src/` (entire dir, 13 files)
- Delete: `/Users/john/code/arete/test/` (entire dir, 4 files)
- Delete: `/Users/john/code/arete/tsconfig.test.json`
- Edit: `/Users/john/code/arete/.pi/standards/build-standards.md` — remove the `tsconfig.test.json` reference

**Acceptance criteria**:
1. `npm run typecheck` passes (none of these files are in the active build).
2. `npm test` passes.
3. `git grep -E "from .*(src/commands|src/core)/" -- packages` returns zero results.
4. `.pi/standards/build-standards.md` no longer references `tsconfig.test.json`.
5. No CI workflow file references the deleted paths.
6. Commit message: `chore: remove pre-monorepo legacy src/ test/ tsconfig.test.json`.

---

### Task 2 (T2) — Delete four `@deprecated` named functions with zero production callers

**Prerequisite**: T1 must have committed first (per pinned ordering — R4).

**Files to read first**:
- `/Users/john/code/arete/packages/core/src/services/area-memory.ts` (lines 250–290 around `extractKeywords`)
- `/Users/john/code/arete/packages/core/src/services/meeting-processing.ts` (lines 300–325 around `findMatchingCompletedItem`)
- `/Users/john/code/arete/packages/core/src/integrations/krisp/client.ts` (lines 515–540 around `getDocument`)
- `/Users/john/code/arete/packages/core/src/workspace-structure.ts` (lines 60–80 around `PRODUCT_RULES_ALLOW_LIST`)
- `/Users/john/code/arete/packages/core/src/integrations/krisp/LEARNINGS.md` (search for `getDocument` references)
- `/Users/john/code/arete/packages/core/test/integrations/krisp.test.ts` (lines 845–870 around the deprecated test)

**Description**:
Delete four `@deprecated` named functions with **zero** production callers (verified 2026-04-28 + re-spot-checked in pre-mortem). Names: `extractKeywords` (file-private), `findMatchingCompletedItem` (file-private), `getDocument` (exported method on `KrispMcpClient`), `PRODUCT_RULES_ALLOW_LIST` (exported const). Delete the one related krisp test case. Update the krisp LEARNINGS.md if it implies the method exists.

**Mitigations to apply**:
- Pre-mortem R4: T1 must have landed first (verified by checking git log on the previous commit).
- Pre-mortem R5/R10: these are all eslint-suppressed or marked `@deprecated`; re-grep to be safe.

**Files affected**:
- Edit: `packages/core/src/services/area-memory.ts` — delete `extractKeywords` + its eslint suppression comment
- Edit: `packages/core/src/services/meeting-processing.ts` — delete `findMatchingCompletedItem`
- Edit: `packages/core/src/integrations/krisp/client.ts` — delete `getDocument` method
- Edit: `packages/core/test/integrations/krisp.test.ts` — delete the `getDocument (deprecated) wraps getMultipleDocuments` describe block
- Edit: `packages/core/src/workspace-structure.ts` — delete `PRODUCT_RULES_ALLOW_LIST` const
- Edit: `packages/core/src/integrations/krisp/LEARNINGS.md` — update the line referencing `getDocument` if it still implies the method exists

**Acceptance criteria**:
1. `git grep -nE "extractKeywords|findMatchingCompletedItem|PRODUCT_RULES_ALLOW_LIST" -- packages src` returns zero matches (excluding any that may now be in deleted files).
2. `git grep -nE "\.getDocument\(" -- packages` returns zero matches.
3. `npm run typecheck` passes.
4. Krisp test count drops by exactly 1 (verify with `npx tsx --test packages/core/test/integrations/krisp.test.ts 2>&1 | tail -3`).
5. No `@deprecated` JSDoc remains attached to a function that does not exist.
6. Commit message: `chore(core): remove four zero-caller @deprecated symbols`.

---

### Task 3 (T3) — Delete the `person-signals.ts` action-item LLM cluster

**Files to read first**:
- `/Users/john/code/arete/packages/core/src/services/person-signals.ts` (full file — 700+ lines; understand which exports stay and which go)
- `/Users/john/code/arete/packages/core/src/services/entity.ts` (lines 480–510 to confirm imports stay narrow)
- `/Users/john/code/arete/packages/core/test/services/person-signals.test.ts` (full file — confirm describe-block boundaries)

**Description**:
Three functions form a self-contained LLM-prompt extraction path that has been superseded by `parseActionItemsFromMeeting` (in `meeting-parser.ts`) for meetings, and has zero production callers for non-meeting sources. Verified: `entity.ts` imports a *different* set (`extractStancesForPerson`, `isActionItemStale`, `deduplicateActionItems`, `capActionItems`) — those stay. Delete the trio + their type aliases + their tests.

**Pre-task setup**:
1. Capture pre-deletion test count via `npx tsx --test packages/core/test/services/person-signals.test.ts 2>&1 | tail -3` and record N_before.
2. Count tests in the four deleted describe blocks (`extractActionItemsForPerson`, `extractActionItemsForPerson (LLM path)`, `buildActionItemPrompt`, `parseActionItemResponse`) to compute expected N_drop.

**Mitigations to apply**:
- Pre-mortem R6: orphan type/const cleanup must be explicit (`RawActionItemResult`, `VALID_ACTION_ITEM_DIRECTIONS`).
- Pre-mortem R5: re-verify `entity.ts` imports survive untouched.

**Files affected**:
- Edit: `packages/core/src/services/person-signals.ts` — delete `buildActionItemPrompt`, `parseActionItemResponse`, `extractActionItemsForPerson`, `RawActionItemResult` type, `VALID_ACTION_ITEM_DIRECTIONS` const, any unused imports/types
- Edit: `packages/core/test/services/person-signals.test.ts` — delete:
  - Imports of `buildActionItemPrompt`, `parseActionItemResponse`, `extractActionItemsForPerson` (lines 7, 8, 13)
  - `describe('extractActionItemsForPerson', …)` block (line 528)
  - `describe('buildActionItemPrompt', …)` block (line 696)
  - `describe('parseActionItemResponse', …)` block (line 745)
  - `describe('extractActionItemsForPerson (LLM path)', …)` block (line 881)
- **Keep**: `buildStancePrompt`, `parseStanceResponse`, `extractStancesForPerson`, `computeActionItemHash`, `isActionItemStale`, `capActionItems`, `deduplicateActionItems` — these test live exports

**Acceptance criteria**:
1. `git grep -nE "buildActionItemPrompt|parseActionItemResponse|extractActionItemsForPerson" -- packages` returns zero matches.
2. `git grep -nE "RawActionItemResult|VALID_ACTION_ITEM_DIRECTIONS" -- packages` returns zero matches (per R6).
3. `npm run typecheck` passes — no orphan type/import references.
4. `npm test -- --test-name-pattern person-signals` passes.
5. Test count for `person-signals.test.ts` drops by **exactly N** (computed in pre-task setup); remaining tests cover only live exports.
6. `entity.ts` still typechecks against its `person-signals.js` imports.
7. Commit message: `chore(core): delete person-signals action-item LLM cluster`.

---

### Task 4 (T4) — Delete `ContextService.getContextForSkill`

**Files to read first**:
- `/Users/john/code/arete/packages/core/src/services/context.ts` (lines 510–540 around `getContextForSkill`)
- `/Users/john/code/arete/.pi/expertise/core/PROFILE.md` (find the `getContextForSkill` reference around line 58)

**Description**:
Zero in-repo callers. Delete the method and the documentation reference. Update the dist mirror of the expertise profile if one exists.

**Mitigations to apply**:
- Pre-mortem R9: dist mirror of `.pi/expertise/core/PROFILE.md` must be updated; run `npm run build:agents:dev` after the doc edit.

**Files affected**:
- Edit: `packages/core/src/services/context.ts` — delete `getContextForSkill` (line 516) + any imports that become unused
- Edit: `.pi/expertise/core/PROFILE.md` — remove the `getContextForSkill` line from the key-exports list
- Run: `npm run build:agents:dev` to refresh `dist/` mirror if present

**Acceptance criteria**:
1. `git grep -n "getContextForSkill" -- packages .pi` returns zero matches.
2. `npm run typecheck` passes.
3. `npm test` passes.
4. `ContextService` retains all other public methods (`getRelevantContext`, `getContextInventory`, `listProjectSubdirs`, `listProjectFiles`, `readFile`).
5. After running `npm run build:agents:dev` (if `dist/.pi/expertise/core/PROFILE.md` exists), `git diff -- '.pi/expertise/core/PROFILE.md' 'dist/.pi/expertise/core/PROFILE.md'` shows symmetric edits (or both files staged); if no dist mirror exists, this is N/A.
6. Commit message: `chore(core): remove unused ContextService.getContextForSkill`.

---

### Task 5 (T5) — Convert `ToolService` to free `listTools` / `getTool` functions

**Pre-task setup** (mandatory before any code edits):
1. From `main` (or current branch), run `arete tool list > /tmp/tool-list-before.txt` to capture byte-baseline output for the smoke test.

**Files to read first**:
- `/Users/john/code/arete/packages/core/src/services/tools.ts` (full file — class + private helpers)
- `/Users/john/code/arete/packages/core/src/factory.ts` (lines 20–25 + 40–60 + 110–150 — service registration + return shape)
- `/Users/john/code/arete/packages/core/src/services/index.ts` (find the `ToolService` export)
- `/Users/john/code/arete/packages/cli/src/commands/tool.ts` (lines 25–95 — `services.tools.list/get` consumer)
- `/Users/john/code/arete/packages/cli/src/commands/route.ts` (line ~41 — `services.tools.list` consumer)
- `/Users/john/code/arete/packages/cli/src/commands/skill.ts` (line ~289 — `services.tools.list` consumer)
- `/Users/john/code/arete/packages/core/test/factory.test.ts` (line 76 — `services.tools instanceof ToolService` assertion)
- `/Users/john/code/arete/packages/core/test/services/tools.test.ts` (full file — test migration target)

**Description**:
`ToolService` has only `list()` and `get()` methods with no instance state beyond a `StorageAdapter`. The class header says "Mirrors SkillService pattern for consistency" — symmetry without payoff. Convert to two free functions `listTools(storage, toolsDir)` and `getTool(storage, id, toolsDir)`. Update factory, barrel export, 4 call sites, factory test, tools test.

**Mitigations to apply**:
- Pre-mortem R3: `npm run build` mandatory before merge — verify dist files staged.
- Pre-mortem R5: cross-package consumer audit — re-grep `services\.tools|new ToolService` across `packages/apps/`, `packages/runtime/`, `packages/cli/src/lib/` to confirm zero hits before deletion.
- Pre-mortem R10: namespace concern — add a one-line comment in `services/index.ts` next to new exports.

**Files affected**:
- Edit: `packages/core/src/services/tools.ts` — replace class with two exported functions; preserve same behavior (frontmatter parsing, file scanning) and same input/output shapes
- Edit: `packages/core/src/factory.ts` — remove `import { ToolService }`, remove `tools: ToolService` from `AreteServices`, remove `const tools = new ToolService(storage)`, remove `tools` key from returned object
- Edit: `packages/core/src/services/index.ts` — replace `export { ToolService } from './tools.js'` with `export { listTools, getTool } from './tools.js'`; add one-line comment
- Edit: `packages/cli/src/commands/tool.ts` — replace `services.tools.list(paths.tools)` → `listTools(services.storage, paths.tools)`; same for `get`
- Edit: `packages/cli/src/commands/route.ts:41` — same migration
- Edit: `packages/cli/src/commands/skill.ts:289` — same migration
- Edit: `packages/core/test/factory.test.ts` — remove `tools is ToolService` assertion
- Edit: `packages/core/test/services/tools.test.ts` — migrate from `new ToolService(storage)` + `service.list()` to direct `listTools(storage, dir)` calls

**Acceptance criteria**:
1. `git grep -n "ToolService\|services\.tools" -- packages` returns zero matches (in source AND tests).
2. `git grep -nE "services\\.tools|new ToolService" -- packages` returns matches only in T5-modified files; **no hits** in `packages/apps/`, `packages/runtime/`, or `packages/cli/src/lib/` (per R5).
3. `git grep -n "listTools\|getTool" -- packages` returns the new exports + 4 call sites + tests.
4. `npm run typecheck` passes (cli + core both).
5. `npm test -- --test-name-pattern "tools|factory"` passes with the same number of test cases as before.
6. `arete tool list` produces **byte-identical** output to `/tmp/tool-list-before.txt`; `diff /tmp/tool-list-before.txt <(arete tool list)` is empty.
7. `arete tool show <name>` smoke test on a known tool produces output of equivalent shape.
8. `arete skill route "test"` and `arete route "test"` still produce skill suggestions.
9. `services.tools` is no longer in the `createServices()` return type.
10. After `npm run build`, `git status -- 'packages/core/dist/factory.{js,d.ts}' 'packages/core/dist/services/tools.{js,d.ts}' 'packages/core/dist/services/index.{js,d.ts}' 'packages/cli/dist/commands/tool.js' 'packages/cli/dist/commands/route.js' 'packages/cli/dist/commands/skill.js'` shows the modified dist files staged (per R3).
11. One-line comment in `services/index.ts` next to `listTools`/`getTool` exports clarifying namespace (per R10).
12. Commit message: `refactor(core): ToolService → free listTools/getTool functions`.

---

### Task 6 (T6) — Extract `buildTopicWikiContext` helper from `meeting-context.ts`

**Files to read first**:
- `/Users/john/code/arete/packages/core/src/services/meeting-context.ts` (lines 950–1030 — the inline block to extract)
- `/Users/john/code/arete/packages/core/src/services/meeting-extraction.ts` (lines 500–540 — the existing `buildTopicWikiContextSection` for type/name awareness)
- `/Users/john/code/arete/packages/core/test/services/meeting-context.test.ts` (search for `topicWikiContext` to find the 5 enrichment tests)
- `/Users/john/code/arete/dev/work/plans/wiki-leaning-meeting-extraction/final-review.md` (Section 7 — the refactor backlog item this task addresses)

**Description**:
The wiki-leaning team's final review explicitly flagged this as refactor backlog. Extract the 47-line inline block at `meeting-context.ts:978–1025` into a module-private helper `buildTopicWikiContext(deps, paths, transcript): Promise<{ context?: TopicWikiContext; warning?: string }>`. The caller becomes a 3-line conditional assignment + warning push.

**Mitigations to apply**:
- Pre-mortem R1: keep helper module-private to avoid name collision with existing `buildTopicWikiContextSection`. Do NOT add to barrel.
- Pre-mortem R2: helper returns value, never mutates inputs. Caller pattern is exact 3-line shape spec'd in plan.
- Pre-mortem R7: caller MUST never assign `bundle.topicWikiContext = undefined` — only assign when `wiki.context` is defined. Preserves "absent key" semantics.

**Target shape** (per Decisions #7, #8):
```ts
async function buildTopicWikiContext(
  deps: MeetingContextDeps,
  paths: WorkspacePaths,
  transcript: string,
): Promise<{ context?: TopicWikiContext; warning?: string }>
```

**Caller pattern** (replaces lines 978–1025):
```ts
const wiki = await buildTopicWikiContext(deps, paths, transcript);
if (wiki.context) bundle.topicWikiContext = wiki.context;
if (wiki.warning) warnings.push(wiki.warning);
```

**Files affected**:
- Edit: `packages/core/src/services/meeting-context.ts` — extract block; update caller to 3-line pattern

**Acceptance criteria**:
1. Helper `buildTopicWikiContext` exists, is **not** exported (no `export` keyword), returns `{ context?; warning? }`.
2. `buildMeetingContext` reduced by ~47 lines at the topic-wiki step (replaced by 3-line caller pattern).
3. Caller assigns `bundle.topicWikiContext` only when `wiki.context` is defined; never `bundle.topicWikiContext = undefined`.
4. Caller pushes warning string verbatim: `Topic-wiki context failed: ${msg}`.
5. All 5 `topicWikiContext` enrichment tests in `meeting-context.test.ts` pass **without modification**.
6. All 66 tests in `meeting-context.test.ts` pass.
7. `npm run typecheck` passes.
8. `git grep -nE "^export.*\bbuildTopicWikiContext\(" -- packages/core/src` returns at most ONE pre-existing line (`buildTopicWikiContextSection` in `meeting-extraction.ts`); the new helper is NOT in the grep.
9. `git grep -n "buildTopicWikiContext" -- packages/core/src/services/index.ts` returns nothing.
10. `grep -n "topicWikiContext" packages/core/test/services/meeting-context.test.ts` review: no test asserts `=== undefined` on the `bundle.topicWikiContext` key (per R7); if any such assertion exists, document the equivalence in commit message.
11. Commit message: `refactor(core): extract buildTopicWikiContext helper from meeting-context`.

---

## Global verification (after all 6 tasks)

- Full test suite green: `npm test`
- Build green: `npm run build` (mandatory before merge)
- Agents-doc rebuild: `npm run build:agents:dev`
- Smoke tests:
  - `arete tool list` (T5)
  - `arete tool show <name>` (T5)
  - `arete route "test query"` (T5)
  - `arete skill route "test query"` (T5)
  - `arete meeting extract --dry-run-topics <recent-meeting>` (T6)
- Backend smoke: start `packages/apps/backend`, hit `GET /api/intelligence/patterns`.

## Risk summary (from pre-mortem)

10 risks (0 CRITICAL, 4 HIGH, 3 MEDIUM, 3 LOW). All HIGH risks have inline mitigations folded into Decisions #6–#9 and the per-task "Mitigations to apply" sections.
