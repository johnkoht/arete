## How This Works

The services layer provides eight domain-specific classes: `ContextService`, `MemoryService`, `EntityService`, `IntelligenceService`, `WorkspaceService`, `SkillService`, `ToolService`, `IntegrationService`. They are not instantiated directly by callers — `createServices(workspaceRoot)` in `packages/core/src/factory.ts` wires all dependencies and returns an `AreteServices` object. The dependency graph flows from infrastructure (`FileStorageAdapter`, `SearchProvider`) → core services (context, memory, entity) → orchestration (`IntelligenceService`). Services do NOT use direct `fs` calls; all file I/O goes through `StorageAdapter`. The barrel export in `packages/core/src/services/index.ts` only exports the classes; `createServices` is exported from `packages/core/src/index.ts` via `factory.ts`. Tests mock `StorageAdapter` and `SearchProvider` to avoid touching the filesystem.

## Key References

- `packages/core/src/factory.ts` — `createServices()`, `AreteServices` type, dependency wiring
- `packages/core/src/services/context.ts` — `ContextService` (primitive → file mapping, gap detection)
- `packages/core/src/services/memory.ts` — `MemoryService` (token-based memory search)
- `packages/core/src/services/entity.ts` — `EntityService` (fuzzy person/meeting/project resolution)
- `packages/core/src/services/intelligence.ts` — `IntelligenceService` (briefing assembly, ties services together)
- `packages/core/src/services/tools.ts` — `ToolService` (tool discovery from workspace tools directory)
- `packages/core/src/services/integrations.ts` — `IntegrationService` (Fathom pull, calendar)
- `packages/core/src/storage/adapter.ts` — `StorageAdapter` interface (read/write/list/exists)
- `packages/core/test/` — service tests (mock StorageAdapter pattern)

## New Services (2026-03-05)

- **`patterns.ts`** — `detectCrossPersonPatterns(meetingsDirPath, storage, { days })`. Reads `.md` files in the meetings dir, extracts topics from `## Key Points` and `## Summary` sections, groups by normalized topic, returns `SignalPattern[]` for topics appearing in 2+ meetings across 2+ distinct attendees. Supports both `attendee_ids` (slug list) and `attendees: [{name, email}]` formats. Topic extraction caps at 20 per meeting and normalizes for comparison (lowercase + strip punctuation).

- **`momentum.ts`** — Two pure functions: `computeCommitmentMomentum(commitments, refDate?)` buckets open commitments into hot (<7d), stale (7–30d), critical (>30d) by `date` field age. `computeRelationshipMomentum(meetingsDir, peopleDir, storage, opts?)` scans meeting frontmatter for attendees, tracks last meeting date per person, and returns active/cooling/stale buckets. Resolves person names from `people/{internal,customers,users}/{slug}.md` profiles.

- **`ai.ts`** (2026-03-08) — `AIService` wraps pi-ai with task-based model routing, credential loading, and structured output support. Takes `AreteConfig` at construction to read `ai.tiers` (fast/standard/frontier → model ID) and `ai.tasks` (task → tier). Methods: `call(task, prompt)` for simple text, `callWithModel(spec, prompt)` for explicit model, `callStructured(task, prompt, schema)` for JSON with TypeBox validation. Uses `testDeps` injection for mocking pi-ai calls — same pattern as qmd.ts. **Credentials** handled by sibling module `credentials.ts` (global `~/.arete/credentials.yaml`, not workspace-level).

- **`meeting-processing.ts`** (2026-03-15) — Post-extraction processing for meeting intelligence. `processMeetingExtraction(result, userNotes, options?)` applies confidence filtering (<0.5 excluded), Jaccard dedup against user notes (>0.7 match = dedup source), and auto-approval logic (>0.8 confidence or dedup = approved). Returns `ProcessedMeetingResult` with filtered items and metadata maps (`stagedItemStatus`, `stagedItemConfidence`, `stagedItemSource`, `stagedItemOwner`). `extractUserNotes(body)` extracts user-written notes from meeting body, excluding Transcript and Staged sections. `clearApprovedSections(content)` removes `## Approved *` sections for reprocessing. `formatFilteredStagedSections(items, summary)` formats filtered items as markdown. Used by CLI `extract --stage`, CLI `approve`, and backend `runProcessingSession`. Reuses `normalizeForJaccard()` and `jaccardSimilarity()` from `meeting-extraction.ts`.

- **`tasks.ts`** (2026-03-27) — `TaskService` manages GTD tasks across `now/week.md` and `now/tasks.md`. Constructor takes `StorageAdapter` + `WorkspacePaths`. Methods: `listTasks(options?)` reads both files with filters (area/project/person/due/completed/destination), `addTask(text, destination, metadata?)` adds to specified section, `completeTask(taskId)` marks done and returns linked commitment ID if `@from(commitment:id)` present, `moveTask(taskId, destination)` handles cross-file moves, `findTask(taskId)`, `deleteTask(taskId)`. Metadata parsing extracts `@tag(value)` patterns (area, project, person, due, from); unknown tags ignored, malformed tags preserved as text. Task ID is 8-char sha256 hash of normalized text (like CommitmentsService). Bucket-to-file mapping: inbox/must/should/could → week.md, anytime/someday → tasks.md.

- **`task-scoring.ts`** (2026-03-27) — Pure scoring functions for intelligent task prioritization. No class (stateless). `scoreTask(task, context)` returns `{ score, breakdown }` across 5 dimensions: due date (0-40), commitment (0-25), meeting relevance (0-20), week priority (0-15), modifiers (+10/-10/+20). `scoreTasks(tasks, context)` sorts by score descending. `getTopTasks(tasks, context, limit)` returns top N. `formatScoredTask(scored, rank)` and `formatTaskRecommendations(tasks, limit)` produce human-readable output with breakdown. Types: `ScoringContext` (meeting attendees/areas, week priorities, focus hours, needs_attention people), `ScoreBreakdown` (per-dimension scores with reasons), `ScoredTask`. Date parsing uses local time (not UTC) for timezone-consistent comparisons.

## Gotchas

- **`createServices()` is async — it loads `arete.yaml` from disk.** Callers must `await createServices(process.cwd())`. Forgetting the `await` gives a Promise, not `AreteServices`. Every CLI command in `packages/cli/src/commands/` correctly awaits it — follow that pattern. Defined in `packages/core/src/factory.ts` L54.

- **Services must NOT call `fs` directly.** The `2026-02-15_monorepo-intelligence-refactor-learnings.md` entry explicitly lists "No direct fs in services" (Risk 9) as a key invariant. All file reads go through the `StorageAdapter` injected at construction. Violating this makes services untestable (can't mock fs) and breaks the StorageAdapter abstraction.

- **`IntegrationService` is the only service that receives `AreteConfig` directly.** All other services take `StorageAdapter` and/or `SearchProvider`. `IntegrationService` needs the config to know which integrations are configured (e.g. Fathom API key, calendar provider). If you add a new service that needs config, check whether `WorkspaceService.findRoot()` + `loadConfig()` is the right pattern instead of passing config at construction time.

- **Calendar integration list uses registry names (`apple-calendar`, `google-calendar`) but configure writes manifest under `integrations.calendar`.** `IntegrationService.list()` cannot rely on direct key matching for calendar entries. It must map `integrations.calendar.provider` (`macos`/`ical-buddy`/`google`) to the registry names so `arete integration list` shows the correct configured/active calendar provider. Add regression tests in both core service tests and CLI command tests when touching this path.

- **`IntelligenceService` depends on `ContextService`, `MemoryService`, and `EntityService` — not on `StorageAdapter` or `SearchProvider` directly.** Do not try to construct it with infrastructure — it composes the core services. Wiring order in `factory.ts` matters: core services must be constructed before `IntelligenceService`. See `packages/core/src/factory.ts` L59-68.

- **`options?.config` override in `createServices()` bypasses `arete.yaml` loading.** Pass a pre-loaded `AreteConfig` to avoid disk reads in tests: `createServices('/workspace', { config: mockConfig })`. Without this, tests that call `createServices()` will try to read `arete.yaml` from the test temp dir and may fail silently with default config. From `2026-02-15` entry: DI pattern made testing straightforward.

- **`WorkspaceService.findRoot()` traverses upward to find the workspace root.** CLI commands call `createServices(process.cwd())` then `services.workspace.findRoot()`. If `findRoot()` returns `null`, the workspace root couldn't be found (not inside an Areté workspace). This is the canonical "not in a workspace" check — do not replicate it with ad-hoc `arete.yaml` file searches.

- **`AIService` receives `AreteConfig` directly — second service to do so after `IntegrationService`** (2026-03-08). AIService needs config at construction to read tier-to-model mappings. It doesn't use StorageAdapter because credentials are global (~/.arete/credentials.yaml) not workspace-level.

- **Ajv import: use named export `{ Ajv }` not default import** (2026-03-08). With NodeNext module resolution, `import Ajv from 'ajv'` gives TypeScript error "cannot use namespace as type". The named export `import { Ajv } from 'ajv'` works. This is an ESM/CJS interop edge case.

- **Jaccard similarity test strings must be verified mathematically** (2026-03-09). When writing tests for Jaccard-based deduplication (used in `meeting-extraction.ts` and `commitments.ts`), you cannot rely on intuition for what "looks similar". Test strings that appear nearly identical often produce Jaccard scores below threshold because: (1) one different word reduces overlap significantly (e.g., 4/6 = 0.67 for strings differing by 2 words), (2) the normalize function strips punctuation and lowercases, changing token counts. For Jaccard > 0.8 threshold, use test pairs where first string has N words and second has N+1 (adding only one word), giving N/(N+1) similarity. Example: "Send API docs to Sarah" (5 words) vs "Send API docs to Sarah now" (6 words) = 5/6 = 0.833. Debug with: `const w1 = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean)` then `intersection.length / union.size`.

- **Decisions/learnings now have real confidence values, with 0.9 fallback** (2026-04-09). The extraction prompt requests `{ text, confidence }` objects for decisions and learnings. `parseMeetingExtractionResponse()` handles both string and object formats, populating `MeetingIntelligence.decisionConfidences` and `learningConfidences` as `(number | undefined)[]`. `processMeetingExtraction()` uses `intelligence.decisionConfidences?.[i] ?? 0.9` — real confidence when available, 0.9 fallback for backward compatibility. This means decisions/learnings with low confidence (e.g., 0.4) are now filtered out by the existing threshold logic.

- **`isGarbageDecisionOrLearning()` is separate from `isGarbageItem()`** (2026-04-09). The shared `isGarbageItem()` filter has action-item-specific constraints: 150-char max length and multi-sentence rejection. These silently dropped valid long decisions. `isGarbageDecisionOrLearning()` in `meeting-extraction.ts` applies only the checks appropriate for decisions/learnings (empty text, repeated characters, all-caps, etc.) without the length/sentence limits. Always use `isGarbageDecisionOrLearning` for decisions and learnings, `isGarbageItem` for action items only.

- **Negation marker detection requires word-boundary regex** (2026-04-09). `hasNegationMarkers()` in `meeting-processing.ts` uses `NEGATION_PATTERNS` (regex array with `\b` word boundaries) instead of `NEGATION_MARKERS` (string array with `.includes()`). The substring approach falsely matched "notification" (contains "not"), "another" (contains "not"), "note", "annotate". Word-boundary regex `\bnot\b` fixes this. If adding new marker patterns, always use `\b` anchors.

- **`batchLLMReview()` sanitizes inputs and degrades gracefully** (2026-04-09). The function truncates item text to 200 chars and strips `{}[]` before interpolating into the LLM prompt (mitigates prompt injection from user-editable memory files). JSON parsing uses 3 layers: direct parse → strip markdown fences → greedy regex for `{...}`. Any failure (LLM error, parse error, invalid IDs) returns empty drops array — never throws. Callers don't need try/catch but the batch review call site in `agent.ts` wraps it anyway for defense in depth.

- **YYYY-MM-DD string comparison for timezone-safe date filtering** (2026-04-09). `parseMemoryItems()` in `meeting-reconciliation.ts` computes a cutoff date string and compares with `>=` against item date strings. `new Date("2026-04-01")` parses as UTC midnight while `new Date()` gives local time — comparing Date objects crosses timezone boundaries. ISO date string comparison (`"2026-04-01" >= "2026-03-08"`) avoids this entirely and is correct for YYYY-MM-DD format since lexicographic order matches chronological order.

- **TaskService section parsing: ALL headers end sections** (2026-03-27). GTD buckets (Inbox, Must, Should, Could, Anytime, Someday) are independent sections — NOT a nested hierarchy. The `findSection()` function ends a section at ANY markdown header (# ## or ###), not just same-or-higher-level headers. This is intentional: `## Inbox` and `### Must complete` are siblings in the GTD model, not parent-child. If you use hierarchical parsing (## ends at next ##, ### ends at next ### or ##), tasks from `### Must` would incorrectly be included in `## Inbox` when reading week.md.

- **Date parsing must use local time, not UTC** (2026-03-27). When comparing dates for task scoring (due date vs reference date), parsing `new Date('2026-03-25')` creates a UTC midnight date which may be the previous day in local time. For YYYY-MM-DD strings without time component, use `new Date(year, month - 1, day)` to create a local time date. In tests, create reference dates with explicit local time: `new Date(2026, 2, 25, 12, 0, 0)` (noon) rather than `new Date('2026-03-25')`. The task-scoring.ts `parseDate()` function handles this by parsing YYYY-MM-DD as local date components.

## Invariants

- `AreteServices` returned by `createServices()` is a flat object — no lazy loading, no proxies. All services are fully constructed at call time.
- The single `FileStorageAdapter` instance is shared across all services that need storage. Sharing is intentional (no state in adapter; it's stateless read/write).
- `SearchProvider` returned by `getSearchProvider(workspaceRoot)` in `factory.ts` is determined once at service creation — it will be QMD or fallback based on what's installed at that moment.
- **EntityService SearchProvider empty-results → full scan invariant**: When `EntityService` uses its optional `searchProvider` to pre-filter meetings for a person, zero results MUST fall back to a full scan — never skip. Empty results mean the person may not yet be indexed, not that they have no meetings. Tested explicitly in `packages/core/test/services/person-memory.test.ts`. Violating this silently produces empty memory highlights with no error.

- **EntityService SearchProvider limit-overflow → full scan invariant** (2026-02-21): When `semanticSearch()` returns exactly `SEARCH_PROVIDER_CANDIDATE_LIMIT` (100) results, the index may be truncated — treat it the same as empty results and fall back to a full scan. Otherwise, meetings beyond position 100 are silently dropped for active workspaces (a PM with 6+ months of weekly meetings easily exceeds 20, let alone a badly-chosen limit). `SEARCH_PROVIDER_CANDIDATE_LIMIT` is a module-level constant in `entity.ts`; the fallback condition is `results.length >= SEARCH_PROVIDER_CANDIDATE_LIMIT`. Tested explicitly in `person-memory.test.ts`.

- **SearchProvider path normalization before storage use** (2026-02-21): The qmd CLI runs with `cwd: workspaceRoot` and may return relative paths in its JSON output; `StorageAdapter.list()` always returns absolute paths. Always call `resolve(workspacePaths.root, r.path)` on each SearchProvider result before using it as a cache key or passing it to `storage.read()`. `resolve()` is a no-op for absolute paths, so this is safe regardless of what qmd returns. Omitting this causes `storage.read()` to silently return `null` for every candidate, and signals are missed with no error.

- **Function-scoped Map cache for N×M I/O** (2026-02-21): When a service method has a person-outer / file-inner loop and the inner resource (meeting content) is expensive to read, declare `const cache = new Map<string, string | null>()` inside the method. Key by **normalized absolute path** (apply `resolve()` before cache lookup). This reduces O(people × meetings) reads to O(meetings) regardless of people count. The cache is function-scoped so no lifecycle management is needed. See `refreshPersonMemory()` in `entity.ts`.

## Testing Gaps

- ~~No integration test exercises the full `createServices()` → `services.X.method()` path~~ — Added 2026-02-21: `packages/core/test/integration/intelligence.test.ts` now contains a `createServices factory wires SearchProvider to EntityService` test that calls the real factory and exercises `entity.refreshPersonMemory(null)`.
- `IntelligenceService` briefing assembly (`assembleBriefing()`) is tested in `packages/core/test/` but the entity extraction heuristic (capitalized proper nouns, skip-words list) has thin edge case coverage.

## Patterns That Work

- **DI via constructor**: Each service takes only what it needs at the constructor level. `ContextService(storage, search)`, `EntityService(storage, searchProvider?)`, `IntelligenceService(context, memory, entity)`. Test by passing mocks. Note: `EntityService` now accepts an optional second `SearchProvider` param (added 2026-02-21).
- **`createServices()` as the only wiring point**: CLI commands never import service classes directly. They import `createServices` from `@arete/core` and destructure what they need. Each command becomes 10-30 lines: parse args → create services → call method → format output (from `2026-02-15` entry).

- **`EntityService` accepts an optional `SearchProvider` as its second constructor parameter — all existing `new EntityService(storage)` calls remain valid.** Added 2026-02-21: `constructor(storage: StorageAdapter, searchProvider?: SearchProvider)`. The factory (`createServices()`) now passes `search` to EntityService. In `refreshPersonMemory()`, a provided SearchProvider is used to pre-filter which meeting files to scan per person (reducing O(n×m) full scans). Critical invariant: empty `semanticSearch()` results → always fall back to full scan. There are 14+ construction sites across tests and compat/ — all use `new EntityService(storage)` and compile without changes.

- **`WorkspaceService.create()` must copy tools — check all three asset types (skills, tools, rules) when porting install logic.** During the CLI refactor (commit `e3bc217`, 2026-02-15), `WorkspaceService.create()` ported skills and rules from the old `install.ts` but silently dropped tools. The old command had an explicit `copyDirectoryContents(sourcePaths.tools, workspacePaths.tools)` block; the new service never got it. Result: `install` and `update` left `.cursor/tools/` empty, so the onboarding tool's `TOOL.md` was never present in user workspaces — agents looking for `.cursor/tools/onboarding/TOOL.md` couldn't find it. Fixed 2026-02-21: added tools copy in `create()` and tools backfill in `update()`, with regression tests keyed to the commit hash. **Lesson**: when refactoring "copy assets" logic into a service, explicitly enumerate all asset types (skills, **tools**, rules, templates, guide) and confirm each has a corresponding copy block before closing the PR.

- **`KrispMcpClient.configure()` requires `(storage, workspaceRoot)` — not zero args** (2026-02-21): The task description described calling `client.configure()` with no arguments, but the actual method signature is `configure(storage: StorageAdapter, workspaceRoot: string): Promise<KrispCredentials>`. Always read the actual TypeScript signature before wiring in a CLI command.

- **LLM extraction via `RefreshPersonMemoryOptions.callLLM` pattern** (2026-03-01): `refreshPersonMemory()` accepts an optional `callLLM: LLMCallFn` in its options. When provided, stance extraction runs via `extractStancesForPerson()` from `person-signals.ts`. Without it, only regex-based signals run. This keeps EntityService LLM-free at construction time — the caller decides whether to provide LLM capability. Follow this pattern for any future LLM-dependent features in services: accept the LLM function in the method options, never in the constructor.

- **In-memory caching strategy for LLM calls within refresh** (2026-03-01): Function-scoped `Map<string, PersonStance[]>` keyed by `resolve(root, meetingPath) + ':' + person.slug` prevents duplicate LLM calls when multiple people appear in the same meeting. Same pattern as the existing `meetingContentCache` but for LLM results. When adding new expensive per-meeting operations, follow this cache pattern.

- **Action item lifecycle design** (2026-03-01): 30-day auto-stale via `isActionItemStale()`, 10-item cap per direction via `capActionItems()`, content-hash dedup via `computeActionItemHash()` (sha256 of normalized text + slug + direction). Applied in order: stale filter → dedup → cap. Functions in `person-signals.ts`. When adding new signal types with lifecycle, follow this three-phase pattern.

- **`extractActionItemsForPerson` is now async with shifted ownerName arg** (2026-03-03): Signature changed from `(content, personName, source, date, ownerName?)` to `(content, personName, source, date, callLLM?, ownerName?)`. The `ownerName` moved from 5th to 6th positional. Any call site passing `ownerName` must insert `undefined` as the 5th arg. **Note**: as of 2026-03-04, `refreshPersonMemory()` uses `parseActionItemsFromMeeting()` instead — see next entry.

- **Action item extraction is now parsing-based, not LLM-based** (2026-03-04): `refreshPersonMemory()` uses `parseActionItemsFromMeeting()` from `meeting-parser.ts` instead of `extractActionItemsForPerson()`. This means: (1) meetings MUST have a `## Action Items` section for action items to be extracted — no section = empty array, (2) no LLM calls for action item extraction (LLM only used for stance extraction now), (3) `ownerSlug` is computed from profile.md `name` via `slugifyPersonName()`. The parser handles arrow notation (`@owner → @counterparty`) and falls back to owner-name heuristics when notation is missing. If `ownerSlug` is undefined (no profile.md), no action items are extracted.

- **Parser regex must match both `## Action Items` AND `## Approved Action Items`** (2026-03-11): The meeting approval flow in `commitApprovedItems()` renames the staged section to `## Approved Action Items`. The `ACTION_ITEMS_HEADER` regex in `meeting-parser.ts` uses `(?:Approved\s+)?` to match both variants. If you add new section header patterns, ensure they handle the approval flow's naming convention. Test: `parseActionItemsFromMeeting` suite includes explicit test for `## Approved Action Items`.

- **`meeting-parser.ts` must handle BOTH arrow notation AND owner-only notation** (2026-03-18): The approval workflow creates action items with two notation styles: (1) `(@owner → @counterparty)` when there's a clear counterparty, (2) `(@owner)` alone when the action item has an owner but no explicit counterparty. `parseActionItemLine()` tries `ARROW_PATTERN` first, then falls back to `OWNER_ONLY_PATTERN` (`/\(\s*@?([a-z0-9-]+)\s*\)$/i`). Direction for owner-only items: person matches owner = `i_owe_them`, otherwise item is not relevant to that person. If you add new notation patterns, ensure the fallback order is preserved: most-specific (arrow) first, then less-specific (owner-only).

- **`meeting-parser.ts` must prioritize `## Approved Action Items` over `## Action Items`** (2026-03-18): Krisp-imported meetings may have BOTH an empty `## Action Items` section (placeholder) AND a populated `## Approved Action Items` section (from the approval flow). `extractActionItemsSection()` tries `APPROVED_ACTION_ITEMS_HEADER` first, then falls back to plain `ACTION_ITEMS_HEADER`. Without this priority, the parser finds the empty section first and returns zero items.

- **`meeting-parser.ts` date extraction must handle ISO 8601 with time** (2026-03-18): Krisp meetings use `date: 2026-03-18T19:30:00.000Z` (ISO 8601 with time). The `extractDateFromFrontmatter()` regex captures only the `YYYY-MM-DD` portion: `/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m`. Do not require `$` end-of-line anchor after the date pattern.

- **`meeting-parser.ts` ARROW_VARIANTS must include `←` for they_owe_me direction** (2026-04-09): The `ARROW_VARIANTS` constant and `OWNER_ONLY_PATTERN` in `meeting-parser.ts` must handle both `→` and `←` arrows. The `formatActionItemWithOwner()` in `staged-items.ts` writes `←` for `they_owe_me` items. If `ARROW_VARIANTS` only contains right-pointing arrows, `←` items silently fall through to heuristic inference and may get wrong direction. `OWNER_ONLY_PATTERN` must also handle trailing arrows: `(@slug ←)` and `(@slug →)`. Position-based direction logic is correct for both arrows: left slug = debtor, right slug = creditor.

- **Commitment deletion detection requires prior hash comments — skip when `fileHashes.size === 0`** (2026-03-04): The deletion detection logic (`hash in CommitmentsService but NOT in file`) must be guarded by `fileHashes.size > 0`. If the file has never been rendered with commitments (no `<!-- h:XXXXXXXX -->` comments anywhere), then ALL open commitments in the service appear "absent" and would be falsely resolved on the very first refresh. The guard in `entity.ts` `refreshPersonMemory()` write loop is: `if (fileHashes.size > 0) { detect deleted hashes }`. Without this guard, every first-render silently wipes open commitments. Tests: `person-memory.test.ts` "skips bulkResolve when no checked or deleted hashes detected" and "renders open commitments as unchecked checkboxes with hash comment".

- **`buildActionItemPrompt` / `parseActionItemResponse` follow stance pattern exactly** (2026-03-03): Same robust parsing: strip code fences → `indexOf('{')`/`lastIndexOf('}')` → `JSON.parse` in try/catch → validate fields → return typed array. The JSON schema uses `action_items` (snake_case array) with `text` and `direction` fields. Direction enum is `'i_owe_them' | 'they_owe_me'`. Both functions are exported for testing.

- **Person-memory module extraction as a clean refactor seam** (2026-03-01): Signal collection, aggregation, rendering, and upsert extracted to `person-memory.ts` from entity.ts. Clean module boundary — entity.ts imports what it needs. This pattern should be followed when entity.ts grows again: extract domain-specific logic to a sibling module (e.g., `person-*.ts`) rather than letting entity.ts become a monolith.

- **`KrispCredentials.expires_at` is a Unix timestamp `number`, not an ISO string** (2026-02-21): The task description mentioned computing `new Date(...).toISOString()` for `expires_at`, but the type definition is `number` (seconds since epoch) and `loadKrispCredentials` validates `typeof expires_at !== 'number'`. The client's `configure()` already computes it correctly as `Math.floor(Date.now() / 1000) + tokens.expires_in`. Pass the returned credentials directly to `saveKrispCredentials`.

- **`createMockStorage` must use the same Map reference — never copy it** (2026-03-03): Mock storage helpers that create `new Map(initial)` from a passed Map lose the reference link — writes go to the internal copy while tests read from the outer reference and get stale data. Fix: `const store: MockStore = initial` (no copy). This affected CommitmentsService tests: `persists the resolved status`, all sync write-then-read tests, and all pruning tests showed wrong data. Always pass a Map reference and use it directly in the mock closure.

- **node:test v23 hangs indefinitely when a failing async test runs concurrently in a suite matched by suite name** (2026-03-03): When `--test-name-pattern` matches a suite NAME (e.g. `CommitmentsService.reconcile`), it runs ALL tests in that suite. If any test in the suite fails (throws AssertionError), the node:test runner hangs and never exits — it shows no failure output, just a timeout from the calling `timeout` command. Diagnosis: run tests with a pattern that matches individual test NAMES within the suite to isolate which test fails. Root cause here: a Jaccard test used texts that produce 0.4 similarity (below 0.6 threshold) while expecting ≥1 result. Fix: use text pairs that actually yield the expected similarity. Lesson: always verify Jaccard math before writing test expectations (tokenize both sides, compute intersection/union manually).

- **Area sections changed from old to new structure** (2026-04-04): `AreaSections` type no longer has `currentState`, `keyDecisions`, `activeGoals`, `activeWork`, `openCommitments`. New fields: `goal`, `focus`, `horizon`, `projects`, `stakeholders` (plus `backlog` and `notes` unchanged). The `suggestAreaForMeeting()` keyword matching uses `focus` (was `currentState`). Meeting extraction prompt uses `focus` and `goal` (was `currentState` and `keyDecisions`). The workspace template in `workspace-structure.ts` reflects this. If adding new section extraction, follow the `extractSection()` pattern in `area-parser.ts`.

- **ContextService nested directory scanning and exclusion patterns** (2026-03-25): `getRelevantContext()` scans nested context directories (`context/{slug}/**/*.md`) and area files (`areas/*.md`). Both use category `'context'` — do NOT create separate categories. Exclusion rules: (1) paths containing `_history` are excluded (archived context), (2) files starting with `_` are excluded (templates like `_template.md`). The SearchProvider discovery path (step 7) must also apply these exclusion rules, not just the static scan (steps 6b/6c). If you add new context-like paths, follow this pattern: use `'context'` category and apply both exclusion filters.

---

## Extraction Modes (2026-03-27)

`ExtractionMode` in `meeting-extraction.ts` controls prompt complexity and output limits based on meeting importance.

```typescript
export type ExtractionMode = 'light' | 'normal' | 'thorough';
```

### Mode Behavior

| Mode | Purpose | Action Items | Decisions | Learnings | Notes |
|------|---------|--------------|-----------|-----------|-------|
| **light** | Large meetings, low engagement | 0 | 0 | 2 max | ~50% shorter prompt; summary + domain learnings only |
| **normal** | Standard extraction | 7 max | 5 max | 5 max | Full extraction with confidence threshold |
| **thorough** | Reprocessing, high importance | 10 max | 7 max | 7 max | Higher limits for comprehensive extraction |

### Mode Selection

- **light**: Used when meeting importance is `'light'` (large audience, observer role). Skips action items entirely since observer rarely has commitments.
- **normal**: Default mode. Applied to `'normal'` importance meetings. Standard confidence filtering (0.5 include, 0.8 auto-approve).
- **thorough**: Used for `'important'` meetings or when reprocessing with `--clear-approved`. Higher limits catch more items for manual review.

### Design Rationale

- **Token efficiency**: Light mode reduces prompt size by ~50%, saving tokens on meetings where extraction value is low.
- **Confidence scaling**: All modes use the same confidence thresholds; limits differ to match expected signal density.
- **Graceful override**: CLI `--importance` flag allows user to override inferred importance, selecting a different extraction mode.

### Key References

- `packages/core/src/services/meeting-extraction.ts` L35 — `ExtractionMode` type
- `packages/cli/src/commands/meeting.ts` — `--importance` flag handling

## Task-Commitment Linkage (2026-03-27)

The commitment-task linking system has bidirectional dependencies handled via function injection:

1. **CommitmentsService.create()** can create a linked task in inbox via `createTaskFn`
2. **TaskService.completeTask()** auto-resolves linked commitments via optional `CommitmentsService` constructor param
3. **Factory wiring** creates both services, then injects `createTaskFn` after construction to break the cycle

### Key Patterns

- **Function injection for cross-dependencies**: `CommitmentsService.setCreateTaskFn(fn)` accepts a callback rather than taking TaskService in constructor. This avoids circular imports while still enabling the behavior.

- **Optional service injection for auto-resolution**: TaskService constructor accepts optional `CommitmentsService`. When provided, `completeTask()` auto-resolves linked commitments. When absent, behavior is unchanged (backward compatible).

- **Silent failure for auto-resolution** (Harvester requirement): If commitment resolution fails (commitment already resolved, doesn't exist, etc.), the error is caught silently — task completion still succeeds. This prevents blocking user workflows due to orphaned references.

- **Transactional rollback in create()**: If task creation fails after commitment is created, the commitment is removed. Implemented as: save commitment → try create task → on failure, remove commitment from storage.

- **Idempotent create()**: If commitment hash already exists, returns existing commitment without creating duplicate or task. This handles duplicate sync scenarios gracefully.

### Default Behavior

- `i_owe_them` commitments: default `createTask: true` (creates task in inbox)
- `they_owe_me` commitments: default `createTask: false` (goes to Waiting On via separate flow)

### @from Metadata

Tasks reference their source commitment via `@from(commitment:hashPrefix)` where hashPrefix is 8 chars.
Only `commitment` type triggers auto-resolution; `meeting` type references are ignored.

---

- **New AI tasks need both type union AND default tier mapping** (2026-04-06): Adding a new `AITask` (e.g., `'synthesis'`) requires updating two locations: (1) the `AITask` type union in `models/workspace.ts` and (2) the `DEFAULT_TASK_TIERS` record in `services/ai.ts`. Missing either causes a type error. The type union controls what callers can pass to `services.ai.call()`; the default tiers record provides the fallback model mapping when `arete.yaml` doesn't specify a custom tier.

- **`listAreaMemoryStatus()` is filesystem-safe from `_synthesis.md`** (2026-04-06): The method iterates `areaParser.listAreas()` (which reads area definition files), NOT the `.arete/memory/areas/` directory. So `_synthesis.md` in that directory won't pollute area listings. However, `synthesizeCrossArea()` reads the areas directory directly via `storage.list()` — it must exclude `_`-prefixed files to avoid feeding old synthesis output back into the prompt.

- **`extractIntelligenceFromFrontmatter` must parse real file formats, not phantom schemas** (2026-04-09). The original implementation read `frontmatter.staged_items` — a format that was never written by any code path. Real meeting intelligence lives in two formats: **Format A** (body sections parsed by `parseStagedSections()` + `staged_item_owner` frontmatter map) and **Format B** (`approved_items` in frontmatter with `"text (@owner → @counterparty)"` notation). The function signature is `(frontmatter, body)` — both are needed because Format A data spans frontmatter and body. Format A takes priority when both are present. When adding new extraction formats, ensure the parser actually reads what the writer writes — grep for the field name across all write paths before assuming it exists.

- **`loadRecentMeetingBatch` must destructure `body` from `parseFrontmatter`** (2026-04-09). The function reads meeting files via `parseFrontmatter(content)` which returns `{ frontmatter, body }`. Previously only `frontmatter` was destructured, so `body` was discarded. Since `extractIntelligenceFromFrontmatter` now needs `body` for Format A parsing, always destructure both fields. Pattern: `const { frontmatter, body } = parseFrontmatter(content);`.

## Pre-Edit Checklist

- **`ToolService` mirrors `SkillService` but takes `toolsDir: string` (not `workspaceRoot`)** (2026-02-22): `SkillService.list(workspaceRoot)` hardcodes the skills path as `join(workspaceRoot, '.agents', 'skills')`. `ToolService.list(toolsDir)` accepts the resolved tools directory directly because tools paths are IDE-specific (`.cursor/tools/` vs `.claude/tools/`). The caller (CLI) resolves the path via `services.workspace.getPaths(root).tools`. This was an intentional design decision to keep ToolService IDE-agnostic.

- **New capabilities must be routable** (2026-02-25): When a PRD adds new user-facing capabilities (CLI commands, skills, tools), verify they can be discovered via `arete route "natural query"`. Missed for calendar FreeBusy integration — the `arete availability find` command was documented in AGENTS.md, but queries like "find availability with John" don't route because "availability" isn't in `WORK_TYPE_KEYWORDS`. See `IntelligenceService.routeToSkill()` for the scoring algorithm. For skills/tools, ensure `triggers` array in frontmatter includes natural language phrases users might say. For CLI commands that aren't skill-backed, document them clearly in AGENTS.md § CLI.

- [ ] If adding a new service: add it to `factory.ts` (wire dependencies), `services/index.ts` (barrel export), and `AreteServices` type; run `npm run typecheck`
- [ ] If a service needs `AreteConfig`: prefer passing it at `createServices()` call time via `options.config`, not by reading `arete.yaml` inside a service method
- [ ] Verify new service methods do NOT import `fs`/`path` directly — use `StorageAdapter`
- [ ] Run `npm test` to verify all service tests pass after changes
- [ ] If changing `AreteServices` type: search for all `createServices()` call sites in `packages/cli/src/commands/` and update destructuring
- [ ] If adding new user-facing capabilities (CLI, skill, tool): verify `arete route` finds them with natural queries; update triggers/keywords if not
- [ ] When integration pull functions return new fields, verify `IntegrationService.pull()` maps them into `PullResult` — otherwise they're silently dropped (e.g. `reconciliation` field was lost in the `pullFathom → PullResult` mapping)
- [ ] `parseFrontmatter` is duplicated 9 times across packages/core/src/ — consider extracting to `utils/frontmatter.ts` if adding another use. Current locations: staged-items.ts, momentum.ts, meeting-reconciliation.ts, and others.
