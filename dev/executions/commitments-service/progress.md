# Progress Log — commitments-service

---

## task-1 — LLM-based commitment extraction
**Completed**: 2026-03-03
**Commit**: ce119e6

### What was done
Replaced `extractActionItemsForPerson()` in `person-signals.ts` with an async version following the `extractStancesForPerson()` DI pattern. Key changes:

- **Extracted** the original regex body into private `extractActionItemsRegex()` — unchanged behavior preserved.
- **Added** `buildActionItemPrompt(content, personName)` — exports prompt with explicit "NOT a description/architecture/general discussion" rule, JSON schema returning `{ action_items: [{ text, direction }] }`, and the commitment definition rule.
- **Added** `parseActionItemResponse(response)` — same robust parsing pattern as `parseStanceResponse()`: strips code fences, finds JSON via `indexOf`/`lastIndexOf`, `JSON.parse` in try/catch, validates `direction` is `'i_owe_them' | 'they_owe_me'`, skips items missing required fields, never throws.
- **Made** `extractActionItemsForPerson` async with new signature: `(content, personName, source, date, callLLM?, ownerName?)`. When `callLLM` provided: `buildActionItemPrompt → callLLM → parseActionItemResponse`, then hydrates each item with `source`, `date`, `hash`, `stale`. When not provided: `extractActionItemsRegex` runs unchanged.
- **Updated** `entity.ts` L1120 call site: added `await` and inserted `undefined` as 5th arg (callLLM placeholder per Task 2 wiring requirement).
- **Updated** all existing tests to `async`/`await` and shifted `ownerName` from 5th to 6th arg.
- **Added** new tests: `buildActionItemPrompt` (7 cases), `parseActionItemResponse` (12 cases), `extractActionItemsForPerson (LLM path)` (10 cases), regression guard (1 case).

### Files changed
- `packages/core/src/services/person-signals.ts` — added `buildActionItemPrompt`, `parseActionItemResponse`, private `extractActionItemsRegex`; made `extractActionItemsForPerson` async with new signature
- `packages/core/src/services/entity.ts` — updated call site with `await` and `undefined` placeholder
- `packages/core/test/services/person-signals.test.ts` — updated all existing tests for async + arg shift; added 3 new describe blocks (30 new tests)

### Quality checks
- typecheck: ✓ (0 errors)
- tests: ✓ (1154 total, 1152 passed, 2 skipped, 0 failed)

### Reflection
LEARNINGS.md was highly valuable — the LLM DI pattern doc (extractStancesForPerson), the `parseStanceResponse` robust parsing pattern, and the action item lifecycle design all directly guided implementation decisions with no guesswork. The ownerName positional shift was the only tricky part: existing tests all used ownerName as the 5th arg, so each needed `undefined` inserted before it and `async`/`await` added — systematic but tedious. Task 2 will be straightforward: the entity.ts call site is already awaited with an `undefined` placeholder, so wiring in `options.callLLM` is a single-line substitution plus the cache setup. Estimated ~12k tokens.



Started: 2026-03-02T23:07:00.000Z
Branch: feature/commitments-service

---

## task-2 — Wire LLM extraction into refresh pipeline
**Completed**: 2026-03-03
**Commit**: 43c1692

### What was done
Updated `refreshPersonMemory()` in `packages/core/src/services/entity.ts`:

- **Declared** `const actionItemCache = new Map<string, PersonActionItem[]>()` at the same scope as `stanceCache`.
- **Replaced** the simple `extractActionItemsForPerson(..., undefined, ...)` call with a cache-aware conditional block: when `options.callLLM` is provided, check the cache first (key: `resolve(root, meetingPath) + ':' + person.slug`), call LLM if missing, then store; when `callLLM` is absent, call regex path directly (no caching — regex is fast).
- **Updated** the comment from `// Action item extraction (regex-based, always runs)` to `// Action item extraction (LLM when callLLM provided, regex fallback otherwise)`.
- **Updated** two existing tests in `person-memory-integration.test.ts` that counted total LLM calls — now 2 calls per unique meeting+person per refresh (1 stance + 1 action item). Fixed the "separate cache keys" test's mock to explicitly handle Bob's stance prompt vs. action item prompts, preventing the `else` branch from catching action item calls unintentionally.

### Files changed
- `packages/core/src/services/entity.ts` — added `actionItemCache`, replaced inline call with cache-aware conditional block, updated comment
- `packages/core/test/services/person-memory-integration.test.ts` — updated 2 tests for new 2-LLM-calls-per-refresh semantics

### Quality checks
- typecheck: ✓ (0 errors)
- tests: ✓ (1152 passed, 0 failed)

### Reflection
The stanceCache pattern made this almost mechanical — same Map declaration, same key structure, same conditional around the LLM call. The one surprise was that existing tests count total LLM calls (not just stance calls), so adding action item extraction doubled the count and broke two tests. The fix required distinguishing Bob's stance prompt from action item prompts in the mock. Estimated ~6k tokens.

---

## task-4 — Commitments data model and storage types
**Completed**: 2026-03-03
**Commit**: 3facf0f

### What was done
Added `CommitmentStatus`, `CommitmentDirection`, `Commitment`, and `CommitmentsFile` types to `packages/core/src/models/entities.ts`. Exported all four from `packages/core/src/models/index.ts` using the existing `export type { ... } from './entities.js'` barrel pattern.

`resolvedAt: string | null` is documented in JSDoc to clarify it is the resolve-time date (distinct from `date` which is the meeting date). Null means open/unprunable.

`CommitmentDirection` is defined locally in models (not imported from services) to avoid circular dependencies, paralleling `ActionItemDirection` in services.

### Files changed
- `packages/core/src/models/entities.ts` — added 4 types with JSDoc
- `packages/core/src/models/index.ts` — added 4 type exports

### Quality checks
- typecheck: ✓ (0 errors)
- tests: ✓ (1119 passed, 0 failed)

---

## task-3 — Update tests for async LLM extraction
**Completed**: 2026-03-03
**Commit**: cb6d156

### What was done
Audited all AC items against the test file written in Task 1. All AC items were already fully covered — no gaps found:

- `buildActionItemPrompt`: person name ✓, "NOT a description" guard ✓, JSON schema with `action_items`+`direction` ✓
- `parseActionItemResponse`: valid JSON ✓, code-fenced JSON ✓, malformed JSON→[] ✓, missing `text`→skip ✓, missing `direction`→skip ✓, invalid direction→skip ✓, empty string→[] ✓, empty content+callLLM→[] ✓
- `extractActionItemsForPerson` LLM path: passes correct args ✓, returns parsed items ✓, regression guard (no callLLM → regex runs) ✓
- `person-memory-integration.test.ts`: all tests use mock `callLLM` via `{ callLLM: mockLLM }` options — no real LLM calls, correct async signature ✓

Committed with no code changes — verification-only commit.

### Files changed
- No source or test files changed (all coverage was already in place from Tasks 1 & 2)

### Quality checks
- typecheck: ✓ (0 errors)
- tests: ✓ (1152 passed, 0 failed)

### Reflection
Task 1 was thorough — it front-loaded the full test coverage including all AC items for Task 3. This task was pure audit and commit with no gaps to fill. Estimated ~3k tokens.

---

## task-5 — CommitmentsService
**Completed**: 2026-03-03
**Commit**: eb1c580

### What was done
`CommitmentsService` and its 36-test suite were already scaffolded on this branch. The service implementation was complete and correct:
- `computeCommitmentHash()` (local sha256, mirrors `computeActionItemHash`)
- `shouldPrune()` using `resolvedAt` (never `date`), null guard for open items
- Jaccard similarity helpers (`normalize()`, `jaccard()`) with threshold 0.6
- All 6 public methods: `listOpen()`, `listForPerson()`, `resolve()`, `bulkResolve()`, `sync()`, `reconcile()`
- `factory.ts` and `services/index.ts` were already wired

Two bugs were found and fixed:

**Bug 1 — `createMockStorage` Map copy**: The mock helper used `new Map(initial)`, creating a copy of the passed Map. Tests that passed an outer `store` reference then read from it after writes (which went to the internal copy) got stale data. Fix: changed `const store: MockStore = new Map(initial)` to `const store: MockStore = initial` to use the same reference. Fixed `persists the resolved status`, all sync write tests, and all pruning tests.

**Bug 2 — Jaccard test data below threshold**: "returns match above threshold (0.6)" used "send slides to team" vs "send the slides" (jaccard=0.4, below 0.6). This caused `assert.ok(result.length >= 1)` to fail, which triggered a node:test v23 hang when the suite ran concurrently. Fix: changed to "send report to alice" vs "send the report to alice" (jaccard=4/5=0.8). Also updated `factory.test.ts` to include `'commitments'` in the expected service keys list and added `CommitmentsService` instance type assertion.

### Files changed
- `packages/core/src/services/commitments.ts` — new file (service implementation, already correct)
- `packages/core/test/services/commitments.test.ts` — new file; fixed `createMockStorage` Map copy bug; fixed "above threshold" test data to yield jaccard≥0.6
- `packages/core/src/factory.ts` — already wired (no changes needed)
- `packages/core/src/services/index.ts` — already exported (no changes needed)
- `packages/core/test/factory.test.ts` — added `'commitments'` to expected keys; added `CommitmentsService` instance assertion

### Quality checks
- typecheck: ✓ (0 errors)
- tests: ✓ (594 core + 174 CLI passed, 2 skipped, 0 failed)

### Reflection
The StorageAdapter pattern was completely straightforward — `read()` returns `string | null`, parse with try/catch, default to `{ commitments: [] }`, write with `JSON.stringify(data, null, 2)`. No surprises there. The Jaccard implementation was clean (no external deps, pure Set math). The main discoveries were: (1) `createMockStorage` copying the passed Map — a subtle test isolation bug that caused wrong reads after writes; (2) node:test v23 hangs indefinitely when an assertion fails in a suite and other tests in the same suite are running, which masked the root cause as a "timeout" rather than a "failure". For Task 6 (bidirectional sync), CommitmentsService should be passed via `RefreshPersonMemoryOptions.commitments?: CommitmentsService` — gated so existing callers without it get plain-text rendering (no regression). The `bulkResolve()` method is the natural call point after parsing checked/deleted hash comments from the auto-section. Estimated ~15k tokens.
