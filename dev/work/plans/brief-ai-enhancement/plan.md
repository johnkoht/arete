---
title: "Enhance `brief` with AI Synthesis"
slug: brief-ai-enhancement
status: approved
size: small
tags: [cli, core, intelligence, ai, brief]
created: "2026-03-10"
updated: "2026-04-11"
notes: "Make brief actually brief by adding AI synthesis with graceful fallback"
---

# Enhance `brief` with AI Synthesis

## Goal

Make `brief` actually useful by adding AI synthesis while keeping graceful fallback. When AI is configured, `brief` should produce a concise, structured briefing — not a wall of markdown.

---

## Problem

Current `brief` command (`packages/cli/src/commands/intelligence.ts`, ~line 736):
- Calls `services.intelligence.assembleBriefing()` which orchestrates Context, Memory, Entity, and Email services
- Returns a `PrimitiveBriefing` with a `.markdown` property
- Outputs that markdown directly to console — structured dump of primitives, memory, entities, relationships, gaps
- **Does not synthesize or summarize anything**

The name "brief" implies synthesis ("brief me on X"), but it's aggregation.

## Decisions

1. **Stream output** — AI synthesis streams to console for immediate feedback. The structured output (headers + bullets) renders cleanly incrementally.
2. **Truncation on structured data** — Cap assembled context at ~10K tokens. Truncate per-category operating on the structured `PrimitiveBriefing` fields (`context.files`, `memory.results`, `entities`), not the pre-rendered markdown string. Within categories, prioritize by recency + relevance score with deterministic (stable) sorting.
3. **Content-hash cache** — Hash the assembled context input. Cache the synthesis keyed by that hash in `.arete/cache/briefs/`. If underlying context changes, hash changes → cache miss. Prune entries older than 24h. Auto-create cache directory on first use.
4. **`requires_briefing: true` stays raw** — Skills get raw `PrimitiveBriefing` context. AI synthesis is the human presentation layer only.
5. **Synthesis lives in core, not CLI** — All orchestration (truncation, hashing, cache, prompt building, AI call) lives in a `synthesizeBriefing()` function in core. The CLI command calls one function. This establishes the pattern for future AI-enhanced commands.
6. **Source citations in synthesis** — The synthesis prompt requires inline source references (e.g., "per `context/goals.md`", "from meeting on 2026-03-15") to mitigate hallucination risk and maintain verifiability.
7. **AI error fallback** — If the AI call throws, fall back to raw output with a `warn()` message. Same UX as "AI not configured" but with error detail.

## Semantic Difference from `search`

| Command | Intent | Output |
|---------|--------|--------|
| `search "question"` | Find answer to specific question | Direct answer + sources |
| `brief --for "topic"` | Brief me on this subject | Comprehensive overview organized by category |

---

## Implementation

### Task 1: Add `briefing` task type to AIService

**Files**:
- `packages/core/src/models/workspace.ts` — canonical location of `AITask` type union
- `packages/core/src/services/ai.ts` — `DEFAULT_TASK_TIERS` mapping

Changes:
- Add `'briefing'` to the `AITask` type union in `packages/core/src/models/workspace.ts`
- Add `briefing: 'standard'` to `DEFAULT_TASK_TIERS` in `packages/core/src/services/ai.ts`

**AC**:
- `AIService.getTierForTask('briefing')` returns `'standard'`
- `tsc` compiles with `'briefing'` as a valid `AITask` value
- All existing tests in `packages/core/test/` pass unchanged

**Tests**: No new test file needed — verify via existing `packages/core/test/services/ai.test.ts` (add one assertion for the new task type if extending, otherwise existing coverage suffices).

---

### Task 2: Create briefing synthesis prompt template

**File**: `packages/core/src/services/briefing-prompts.ts` (new)
**Test file**: `packages/core/test/services/briefing-prompts.test.ts` (new)

Create a module exporting:
- `buildBriefingSynthesisPrompt(context: string, topic: string): { system: string; user: string }` — takes truncated context markdown and user's query, returns system + user prompt pair
- System prompt establishes the briefer role, output structure, and source citation requirement
- User prompt passes the assembled context + topic

The system prompt must instruct:
- Concise bullet-point output under each section header
- Inline source citations for every factual claim (e.g., "per `meetings/2026-03-15-standup.md`")
- Omit sections with no supporting evidence rather than speculate

Output structure the prompt requests:
```
## Briefing: {topic}

### Current Status
[1-3 bullets on where things stand, with source citations]

### Key Decisions
[Bullets with attribution — who decided what, when, source]

### Key People
[Bullets — name, role, relevance to topic]

### Recent Activity
[Bullets — meetings, changes, developments with dates and sources]

### Open Questions & Risks
[Bullets — unresolved items, gaps, dependencies]
```

**AC**:
- Returns an object with `system` and `user` string properties, both non-empty
- System prompt contains all five output section headers (Current Status, Key Decisions, Key People, Recent Activity, Open Questions & Risks)
- System prompt contains explicit source citation instructions (e.g., "cite the source file")
- System prompt contains instruction to omit sections with no supporting evidence
- `user` prompt string contains both the `context` and `topic` arguments verbatim
- Empty context string still returns valid prompt (no crash)

**Test pattern**: Use `node:test` (`describe`, `it`) and `node:assert/strict`. Import with `.js` extensions. Tests verify string containment for section headers and citation instructions, and verify both properties are non-empty strings.

---

### Task 3: Add context truncation utility

**File**: `packages/core/src/services/briefing-prompts.ts` (same file as Task 2)
**Test file**: `packages/core/test/services/briefing-prompts.test.ts` (same file as Task 2 tests)

Add:
- `truncateBriefingContext(briefing: PrimitiveBriefing, maxTokens?: number): string` — takes the full `PrimitiveBriefing`, operates on its structured fields (`context.files`, `memory.results`, `entities`), and produces condensed markdown within token budget (default 10K tokens, estimated at ~4 chars/token)

Truncation strategy:
1. Allocate budget proportionally: 40% context files, 25% memory, 20% meetings/timeline, 15% entities
2. Within each category, stable-sort by relevance score descending (deterministic ordering for cache consistency)
3. Take items until category budget exhausted
4. Truncate individual items at natural boundaries (paragraph/section breaks) if needed
5. Assemble and return the truncated markdown string from the selected items — render each item with its path, category, and content (do NOT reuse `formatBriefingMarkdown()` — build a simpler, AI-optimized format focused on content density rather than human display)

**AC**:
- Context under 10K estimated tokens (total chars / 4 < 10000) passes through with all items included
- Context over 10K tokens is truncated with representation from all categories that have data
- Higher-relevance items are preserved over lower-relevance ones (verifiable: pass items with known scores, assert high-score items present and low-score items absent)
- Identical input produces identical output (deterministic — stable sort, no randomness)
- Empty `PrimitiveBriefing` (no files, no memory, no entities) returns empty string without crashing
- Token estimation uses `Math.ceil(str.length / 4)` consistently

**Test pattern**: Build mock `PrimitiveBriefing` objects with controlled `context.files`, `memory.results`, and `entities` arrays. Use known relevance scores. For over-budget tests, generate large `.content` strings to force truncation. Assert category diversity by checking output contains items from each category.

---

### Task 4: Add content-hash caching for AI briefs

**File**: `packages/core/src/services/briefing-cache.ts` (new)
**Test file**: `packages/core/test/services/briefing-cache.test.ts` (new)

Create a module exporting:
- `getCachedBrief(storage: StorageAdapter, cacheDir: string, contextHash: string): Promise<string | null>` — reads cached synthesis if exists and fresh (<24h)
- `cacheBrief(storage: StorageAdapter, cacheDir: string, contextHash: string, synthesis: string): Promise<void>` — writes synthesis to cache, auto-creates directory via `storage.mkdir()` if needed
- `hashBriefingContext(markdown: string): string` — SHA-256 hash of assembled context markdown
- `pruneBriefCache(storage: StorageAdapter, cacheDir: string): Promise<void>` — removes entries older than 24h

Cache location: `.arete/cache/briefs/{hash}.json` with structure `{ synthesis: string, createdAt: string }`

Uses `StorageAdapter` for all I/O (not raw `fs`).

**AC**:
- Cache hit returns previous synthesis string for identical context hash
- Cache miss (no file) returns null
- Changed context (different hash) produces cache miss (different filename)
- Entries older than 24h are pruned and return null on read
- Cache directory is created automatically if it doesn't exist (via `storage.mkdir()`)
- `hashBriefingContext` is deterministic: same input string always produces the same hash
- `hashBriefingContext` uses Node.js `crypto.createHash('sha256')`

**Test pattern**: Use `createMockStorage()` with shared `Map<string, string>` reference (see `packages/core/test/services/commitments.test.ts` for pattern). Pre-seed the Map for hit tests. Use `node:test` mock for `Date.now()` to test expiry without real time delays. Verify mkdir is called by checking the mock storage state.

---

### Task 5: Create `synthesizeBriefing()` orchestration in core

**File**: `packages/core/src/services/briefing-synthesis.ts` (new)
**Test file**: `packages/core/test/services/briefing-synthesis.test.ts` (new)

This is the main orchestration function — all synthesis logic lives here, not in the CLI. Create:

```typescript
export interface SynthesizeBriefingDeps {
  ai: AIService;
  storage: StorageAdapter;
  cacheDir: string;
}

export interface SynthesisResult {
  text: string;
  synthesized: boolean;
  cached: boolean;
}

export async function synthesizeBriefing(
  briefing: PrimitiveBriefing,
  topic: string,
  deps: SynthesizeBriefingDeps
): Promise<SynthesisResult>
```

Flow:
1. Call `truncateBriefingContext(briefing)` to produce condensed markdown
2. Call `hashBriefingContext(truncatedMarkdown)` to get cache key
3. Call `getCachedBrief(deps.storage, deps.cacheDir, hash)` — if hit, return `{ text, synthesized: true, cached: true }`
4. Build prompt via `buildBriefingSynthesisPrompt(truncatedMarkdown, topic)`
5. Call `deps.ai.call('briefing', prompt.user, { systemPrompt: prompt.system })`
6. Cache result via `cacheBrief(deps.storage, deps.cacheDir, hash, result.text)`
7. Return `{ text: result.text, synthesized: true, cached: false }`

Error handling: If `deps.ai.call()` throws, return `{ text: briefing.markdown, synthesized: false, cached: false }` (caller handles the warning UX).

Export `synthesizeBriefing`, `SynthesizeBriefingDeps`, and `SynthesisResult` from `packages/core/src/services/index.ts` barrel.

**AC**:
- With AI configured and cache miss: calls `ai.call()`, writes to cache via `cacheBrief()`, returns `{ synthesized: true, cached: false }`
- With AI configured and cache hit: does NOT call `ai.call()`, returns `{ synthesized: true, cached: true }` with cached text
- When `ai.call()` throws: returns `{ text: briefing.markdown, synthesized: false, cached: false }`, does not throw
- When briefing has empty markdown (edge case): still returns a result without crashing
- Function is importable from `@arete/core` barrel (`packages/core/src/services/index.ts`)
- All existing tests pass unchanged

**Test pattern**: Mock `AIService` using `testDeps` injection pattern from `packages/core/test/services/ai.test.ts` — create a real `AIService` with mock `completeSimple`. Mock `StorageAdapter` with `createMockStorage()` pattern. Test three paths: cache miss (verify AI called + cache written), cache hit (pre-seed storage Map, verify AI NOT called), error (mock `completeSimple` to throw, verify fallback returned).

---

### Task 6: Wire synthesis into brief CLI command

**File**: `packages/cli/src/commands/intelligence.ts` — `registerBriefCommand()` (~line 736)
**Test file**: Extend `packages/cli/test/golden/brief.test.ts`

The CLI command becomes thin — it delegates to `synthesizeBriefing()` and handles output formatting.

Changes:
1. Add `--raw` option: `program.option('--raw', 'Skip AI synthesis, show raw aggregation')`
2. After `assembleBriefing()`:
   - If `--raw` or `!services.ai.isConfigured()`: show fallback UX (see Task 7)
   - Otherwise: call `synthesizeBriefing(briefing, task, { ai: services.ai, storage: services.storage, cacheDir })` where `cacheDir = path.join(root, '.arete', 'cache', 'briefs')`
   - If result `synthesized === false`: show `warn()` message ("AI synthesis failed, showing raw context") + raw output
   - If result `synthesized === true`: print `result.text`
3. `--json` output shape:

```json
{
  "success": true,
  "task": "...",
  "skill": "...",
  "confidence": "...",
  "assembledAt": "...",
  "contextFiles": 12,
  "memoryResults": 5,
  "entities": 3,
  "gaps": 2,
  "markdown": "<raw PrimitiveBriefing markdown — always present>",
  "synthesis": "<AI-generated text or null if raw/error>",
  "synthesized": true,
  "cached": false
}
```

**AC**:
- `arete brief --for "topic"` with AI configured outputs AI-generated briefing with section headers (Current Status, Key Decisions, etc.)
- `arete brief --for "topic" --raw` outputs current aggregation markdown, does NOT call `synthesizeBriefing()`
- `arete brief --for "topic"` when AI call fails outputs `warn()` message followed by raw markdown
- `--json` output includes `markdown` (string, always present), `synthesis` (string or null), `synthesized` (boolean), `cached` (boolean)
- `--json --raw` output has `synthesis: null`, `synthesized: false`, `cached: false`
- `--json` when AI fails has `synthesis: null`, `synthesized: false`, `cached: false` (error detail in stderr via `warn()`, not in JSON)
- `cacheDir` is constructed as `path.join(root, '.arete', 'cache', 'briefs')`
- Cache hit does not invoke `services.ai.call()` and outputs cached synthesis
- `tsc` compiles, all existing tests pass

**Test pattern**: Golden tests (error cases, flag combinations). Test `--raw` flag produces output without `synthesis` key in JSON. Test `--json` shape with expected fields. CLI tests use `runCli()` helper from `packages/cli/test/helpers.ts`.

---

### Task 7: Fallback UX

**File**: `packages/cli/src/commands/intelligence.ts` (same as Task 6)
**Tests**: Covered by Task 6 golden tests

When AI is not configured:
```
ℹ️  AI synthesis not available. Showing raw context.
   Configure AI with `arete credentials login` for enhanced briefings.

[current structured output]
```

When AI call fails (synthesized === false after calling synthesizeBriefing):
```
⚠  AI synthesis failed. Showing raw context.

[current structured output]
```

Use existing `formatters.ts` helpers (`info()` and `warn()` respectively).

**AC**:
- "Not configured" path (detected via `!services.ai.isConfigured()`) uses `info()` formatter with credentials setup suggestion text
- "AI error" path (detected via `result.synthesized === false`) uses `warn()` formatter
- Both paths output the full raw `briefing.markdown` after the message
- The two messages are distinct — user can tell whether AI is unconfigured vs. configured but erroring
- No unhandled exception reaches the user in either path

---

## Testing Strategy

### Test file locations

| Task | Test File |
|------|-----------|
| 1 | Extend `packages/core/test/services/ai.test.ts` (1 assertion) |
| 2, 3 | `packages/core/test/services/briefing-prompts.test.ts` (new) |
| 4 | `packages/core/test/services/briefing-cache.test.ts` (new) |
| 5 | `packages/core/test/services/briefing-synthesis.test.ts` (new) |
| 6, 7 | Extend `packages/cli/test/golden/brief.test.ts` |

### Test infrastructure

- **Runner**: Node.js built-in test runner via `tsx` (`node:test` module)
- **Assertions**: `node:assert/strict`
- **Imports**: Use `.js` extensions (NodeNext module resolution)
- **Mock storage**: `createMockStorage(store: Map<string, string>)` pattern — shared Map reference, no copy (see `packages/core/test/services/commitments.test.ts`)
- **Mock AI**: `AIServiceTestDeps` with mock `completeSimple` function (see `packages/core/test/services/ai.test.ts`)
- **Time mocking**: Use `node:test` `mock.timers` or mock `Date.now()` for cache expiry tests
- **CLI tests**: `runCli()` helper from `packages/cli/test/helpers.ts`, test with `--json` flag for parseable output

### Coverage matrix

| Scenario | Test Type | Location |
|----------|-----------|----------|
| Prompt contains section headers + citations | Unit | briefing-prompts.test.ts |
| Prompt handles empty context | Unit | briefing-prompts.test.ts |
| Truncation under budget (passthrough) | Unit | briefing-prompts.test.ts |
| Truncation over budget (category diversity) | Unit | briefing-prompts.test.ts |
| Truncation empty briefing | Unit | briefing-prompts.test.ts |
| Truncation determinism (identical input → identical output) | Unit | briefing-prompts.test.ts |
| Cache hit | Unit | briefing-cache.test.ts |
| Cache miss | Unit | briefing-cache.test.ts |
| Cache expiry (>24h) | Unit | briefing-cache.test.ts |
| Cache prune | Unit | briefing-cache.test.ts |
| Cache auto-mkdir | Unit | briefing-cache.test.ts |
| Hash determinism | Unit | briefing-cache.test.ts |
| Synthesis: AI call + cache write | Unit | briefing-synthesis.test.ts |
| Synthesis: cache hit, no AI call | Unit | briefing-synthesis.test.ts |
| Synthesis: AI error → fallback | Unit | briefing-synthesis.test.ts |
| Synthesis: empty briefing edge case | Unit | briefing-synthesis.test.ts |
| CLI: `--raw` flag skips synthesis | Golden | brief.test.ts |
| CLI: `--json` output shape (all fields) | Golden | brief.test.ts |
| CLI: `--json --raw` has synthesis=null | Golden | brief.test.ts |
| CLI: fallback message (not configured) | Golden | brief.test.ts |

## Quality Gates

- `npm run typecheck` passes
- `npm test` passes
- Manual test of all four paths (AI synthesis, cache hit, raw/`--raw`, fallback/error)

## Out of Scope

- Streaming support in AIService (use existing `call()`, optimize later)
- Changes to `requires_briefing: true` skill mechanism (stays raw)
- Changes to `IntelligenceService.assembleBriefing()` itself
- Caching beyond 24h or LRU eviction

## Dependencies

- AIService (exists, `packages/core/src/services/ai.ts`)
- `PrimitiveBriefing` type (exists, `packages/core/src/models/intelligence.ts`)
- `StorageAdapter` (exists, `packages/core/src/storage/adapter.ts`, exposed as `services.storage` on `AreteServices`)
