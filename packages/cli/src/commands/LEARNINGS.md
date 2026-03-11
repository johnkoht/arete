## How This Works

CLI commands are registered via `registerXxxCommand(program: Command)` functions imported and called in `packages/cli/src/index.ts`. Commander.js is the CLI framework. Each command file exports a single `registerXxxCommand` function that attaches subcommands/options to the Commander `program`. The established pattern for every action: `createServices(process.cwd())` → `services.workspace.findRoot()` (exit if null) → execute service method → format output via `formatters.ts`. JSON output (`--json` flag) is supported across commands for programmatic use. Interactive prompts use `@inquirer/prompts` (added 2026-02-22; this is the real interactive prompt dependency, not the monolithic `inquirer` package) with checkbox, confirm, and list types — always match the `arete onboard` and `arete seed` UX patterns (checkbox for multi-select, `pageSize: 12`, clear copy). Tests for command behavior are in `packages/cli/test/commands/`.

## Key References

- `packages/cli/src/index.ts` — program setup, all `registerXxxCommand` calls
- `packages/cli/src/commands/install.ts` — workspace init, `--ide cursor|claude`, `isAreteWorkspace()` guard
- `packages/cli/src/commands/pull.ts` — `pullCalendar()`, `createServices()` → `workspace.findRoot()` → provider pattern
- `packages/cli/src/commands/intelligence.ts` — `registerContextCommand`, `registerMemoryCommand`, `registerResolveCommand`, `registerBriefCommand`
- `packages/cli/src/commands/integration.ts` — `configureCalendar()`, writes `arete.yaml` config (producer side)
- `packages/cli/src/formatters.ts` — `header()`, `listItem()`, `success()`, `error()`, `info()`, `warn()`, `formatPath()`
- Memory: `memory/collaboration.md` (Corrections section), `memory/entries/2026-02-11_calendar-integration-ux-and-learnings.md`

## Gotchas

- **Use established UX patterns (checkbox, `pageSize: 12`) — not bare minimum.** In 2026-02-11, the calendar integration configure command used number-based selection and displayed raw `icalBuddy` output instead of matching the `arete onboard` / `arete seed` UX (@inquirer/prompts checkbox with parsed calendar names). The builder corrected this explicitly: "When updating or adding CLI features, use established design patterns and experience rather than the bare minimum." Before writing interactive prompts, read `onboard.ts` and `seed.ts` to see what they use. Correction from `memory/collaboration.md`.

- **Always check `services.workspace.findRoot()` and exit if null before doing any workspace operation.** Every command that requires a workspace does: `const root = await services.workspace.findRoot(); if (!root) { error('Not in an Areté workspace'); process.exit(1); }`. Commands that skip this will produce confusing errors (file not found, undefined paths) when run outside a workspace. See `pull.ts` L22-29 for the canonical pattern.

- **`--json` output must be complete and parseable — including error cases.** When `opts.json` is true, ALL output (including errors) goes through `JSON.stringify()` to stdout. Commands that print `error()` (chalk-colored text to stderr) before checking `opts.json` produce mixed output that breaks callers. Always check `opts.json` first in every exit path. See `pull.ts` L24-28 for the correct pattern: JSON error block, then `process.exit(1)`.

- **`registerXxxCommand` must not do top-level `await`.** All async work is inside the `.action(async (...) => { ... })` callback. Commander.js does not support top-level async in register functions — side effects at module load time break the CLI startup for other commands.

- **`pageSize` for inquirer prompts: add `pageSize: 12` to any checkbox or list with potentially many items.** Without `pageSize`, inquirer defaults to ~5-6 visible items. Calendar list and people list both had this issue before being fixed. Established pattern from `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **After fixing a meaningful UX gap that the builder had to report: add a memory entry and learnings.** In 2026-02-11, the calendar integration was fixed (binary name, list parsing, checkbox UX) but no memory entry was added. "The same kind of miss could repeat." From `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **When retiring a CLI command, search for 4 things.** (1) The command string (`arete setup`), (2) the filename (`setup.ts`), (3) import references (`registerSetupCommand`), (4) the concept in prose ("setup" in help text). Use `rg` with both `--type md` and `--type ts` separately. In 2026-02-22, retiring `arete setup` initially missed a `setup.ts` filename reference in LEARNINGS.md line 51 because the search only looked for `"arete setup"`. Added 2026-02-22.

- **Commands that call `refreshQmdIndex()` need both `--skip-qmd` AND a `loadConfig` call — check for both.** Any command that triggers `refreshQmdIndex()` after a write requires: (1) `--skip-qmd` option added to the Commander.js command, (2) `loadConfig(services.storage, root)` called after `findRoot()` so `config.qmd_collection` is available to pass to `refreshQmdIndex()`. `meeting.ts` had NO `loadConfig` at all; `pull.ts` only called it in the `pullCalendar()` branch, not the fathom branch. Before wiring `refreshQmdIndex()` into a command, grep for `loadConfig` in that file to confirm it's present in the right action scope. See `update.ts` as the canonical complete pattern.

- **Any command that writes workspace files should call `refreshQmdIndex()` — index often.** As of 2026-02-23, the following commands trigger qmd indexing after writes: `meeting add`, `meeting process`, `pull fathom`, `pull notion`, `pull krisp`, `install`, `update`, `onboard`, `people index`, `people memory refresh`. The pattern: if itemsCreated > 0 or files were written, call `refreshQmdIndex(root, config.qmd_collection)` and include the result in JSON output (`qmd: qmdResult ?? { indexed: false, skipped: true }`). For non-JSON mode, use `displayQmdResult(qmdResult)`. Always add `--skip-qmd` option for testability.

- **JSON mode behavior for qmd-wiring must be explicitly designed — it's always ambiguous.** When adding `refreshQmdIndex()` to a command that has `--json` output, the call must happen BEFORE the `if (opts.json) { console.log(...); return; }` block, and the JSON output must include a `qmd: { indexed, skipped, warning? }` field. Follow `update.ts` — it runs qmd before the JSON return and includes the `qmd:` field in the JSON object. Without explicit spec, developers will place the qmd call after the JSON block (where it never runs in JSON mode) or omit the `qmd:` field from JSON output.

- **Use `displayQmdResult()` to display qmd results — don't inline the pattern.** Added 2026-02-21: A shared helper at `packages/cli/src/lib/qmd-output.ts` handles the three-state display (indexed → listItem, warning → warn, skipped/undefined → no output). Import as `import { displayQmdResult } from '../lib/qmd-output.js'` and call `displayQmdResult(qmdResult)`. The function accepts an optional `deps` argument for testability (mock.fn() in tests). Do NOT copy the `if (qmdResult && !qmdResult.skipped) { ... }` block into a new command — there were already 3 copies before extraction.

- **Test audit scope for qmd-wiring is wider than the unit test file — check integration tests too.** When adding `refreshQmdIndex()` to a command, audit BOTH `packages/cli/test/commands/<command>.test.ts` AND `packages/cli/test/integration/<command>.integration.test.ts` for invocations that write files. Add `--skip-qmd` to all of them. In 2026-02-21, `meeting-process.integration.test.ts` was initially missed — the PR would have been fine due to `ARETE_SEARCH_FALLBACK=1` in the test env, but belt-and-suspenders requires `--skip-qmd` too.

- **Route commands now merge tools + skills into the candidate pool (2026-02-22)**: `route.ts` and `skill.ts` (route subcommand) previously only loaded skills via `services.skills.list(root)`. Now they also call `services.tools.list(paths.tools)` and merge tool candidates via a shared helper in `packages/cli/src/lib/tool-candidates.ts`. The `tool.ts` list/show subcommands were refactored from ad-hoc `getToolsList()`/`getToolInfo()` functions to use `services.tools.list()`/`services.tools.get()`. **Lesson**: When both `route.ts` and `skill.ts` need the same mapping logic, extract a shared helper in `packages/cli/src/lib/` to avoid duplication (pre-mortem Risk #8).

- **HTTP server tests cause test runner hangs — use dependency injection instead (2026-02-22)**: CLI-level tests that spawn real HTTP servers (e.g., to mock Notion API for `configure notion`) cause the Node.js test runner to hang indefinitely. The servers don't properly drain connections before `server.close()` completes. **Solution**: Use dependency injection at the function level — export helpers like `configureNotionIntegration({ fetchFn, ... })` that accept a mock `fetchFn`, then test the helper directly instead of spawning `runCli()` with a real HTTP server. The Notion integration tests demonstrate this pattern: CLI-level tests were replaced with unit tests for `configureNotionIntegration()` and `pullNotion()` using mocked fetch/services. Same coverage, no stability issues.

## Invariants

- Every command that reads/writes workspace data calls `createServices(process.cwd())` — not a custom service instantiation.
- Output formatting uses `formatters.ts` helpers, not raw `console.log(chalk.xxx(...))` inline.
- Commands do not import service classes directly — only `createServices` and type imports from `@arete/core`.

## Testing Gaps

- Golden file tests for command output formatting exist (from monorepo refactor `2026-02-15`) but coverage for calendar and people commands was noted as potentially thinner after legacy test cleanup.
- Interactive prompt paths (checkbox selections, confirm dialogs) are difficult to test and currently only manually verified.

## Patterns That Work

- **Command skeleton**: `registerXxxCommand(program)` → `.command('name').description('...').option(...).action(async (args, opts) => { const services = await createServices(process.cwd()); const root = await services.workspace.findRoot(); if (!root) { /* error + exit */ } /* ... */ })`
- **Before writing a new prompt**: open `onboard.ts` or `seed.ts`, copy the `@inquirer/prompts` checkbox pattern including `pageSize: 12`, then adapt the choices.
- **Rerun-safe commands**: Read existing config/files, parse values, pre-fill prompts with `input({ default: existingValue })`. Preserve immutable fields (e.g. `created` timestamp). See `onboard.ts` `parseProfileFrontmatter()` pattern. Added 2026-02-22.
- **Non-interactive flags for testability**: Every interactive prompt should have a CLI flag equivalent (`--name`, `--fathom-key`, `--calendar`, `--skip-integrations`). Tests use flags via `execSync`; interactive paths are manually verified. See `onboard.ts`. Added 2026-02-22.
- **Integration phase pattern**: Use `services.integrations.list(root)` to get current status, check `entry.active` (boolean) for display, use `confirm()` with `default: false` for optional integrations. See `onboard.ts` `runIntegrationPhase()`. Added 2026-02-22.

- **Process event listener bleed between tests — always `removeAllListeners` in afterEach** (2026-03-05): When a command registers `process.on('SIGINT', handler)` (or any process event), that listener persists across tests in the same Node.js process unless explicitly removed. If test suite A runs `runView(deps)` (which registers a SIGINT handler) and doesn't call `process.removeAllListeners('SIGINT')` in `afterEach`, test suite B's `process.emit('SIGINT')` will trigger both handlers. The first handler to throw (via a mocked `process.exit`) aborts execution before the second handler runs — making it appear the second handler was never registered. Fix: always add `process.removeAllListeners('SIGINT')` (or the relevant event) in `afterEach` for any test that invokes a function that registers process event listeners.

- **Test isolation with `--test-concurrency`: use unique temp directories per test run** (2026-03-11): When running tests with `--test-concurrency=4` (parallel execution), multiple test files may use the same temp directory path (e.g., `join(tmpdir(), 'arete-credentials-test')`). This causes race conditions where one test's `beforeEach` cleanup removes another test's setup, producing intermittent failures. **Fix**: Make temp directories unique per process: `join(tmpdir(), \`arete-test-${process.pid}-${Date.now()}\`)`. Also ensure all env vars that could leak between tests are cleared (e.g., `GROQ_API_KEY` was missed in the original credentials test isolation fix). This bug blocked PRD execution until diagnosed — flaky tests are a pre-mortem risk category for CLI work.

- **`confirm()` from `@inquirer/prompts` uses dynamic import** (2026-03-03): `confirm` was not previously used in the CLI codebase (only `checkbox` and `input`). First established in `commitments.ts` for the destructive `resolve` confirmation. Use a dynamic import: `const { confirm } = await import('@inquirer/prompts')`. This avoids top-level import issues and is consistent with how `checkbox` is used elsewhere. Pattern: always pair with a `--yes` flag to bypass for scripting/JSON mode. Check `opts.yes || opts.json` before calling — JSON mode callers must not block on stdin. See `packages/cli/src/commands/commitments.ts` `resolveCmd` action.

- **`arete people memory refresh` must pass `commitments: services.commitments` to `refreshPersonMemory()`** (2026-03-04): The `commitments` option in `RefreshPersonMemoryOptions` is the gate for the entire 7-step CommitmentsService sync inside `entity.ts`. Without it, action items are rendered as plain text in person files but `CommitmentsService.sync()` is never called — so `.arete/commitments.json` stays empty and `arete commitments list` returns nothing. The CLI command had this option missing on launch. Symptom: items visible in person memory (`### Open Items (I owe them)`), invisible to `arete commitments list`. Fix: add `commitments: services.commitments` to the `refreshPersonMemory()` call in `people.ts`.

- **~~CLI commands should NOT require direct LLM access~~ SUPERSEDED** (2026-03-04, superseded 2026-03-08): The original entry stated CLI commands shouldn't require LLM access. This is now superseded by the AIService architecture:
  - **AIService** (not raw API keys) manages credentials via `~/.arete/credentials.yaml`
  - **`services.ai.isConfigured()`** enables graceful detection — CLI can error cleanly with a helpful message if no AI is configured
  - **Unified extraction in core** (`extractMeetingIntelligence()`) enables DRY between CLI (`arete meeting extract`) and backend
  - The `arete meeting extract <file>` command now exists and uses AIService. It requires AI configuration (via `arete credentials configure` or `arete.yaml`), but the early `isConfigured()` check provides a clear error path rather than crashing on missing API keys.
  - Pattern: check `services.ai.isConfigured()` before any AI call; if false, emit `"No AI provider configured. Run \`arete credentials configure\` or set up via arete.yaml."` and exit with code 1.

## Pre-Edit Checklist

- [ ] Check `arete onboard` and `arete seed` for the prompt UX pattern before adding any interactive prompt to a new command
- [ ] Verify all exit paths check `opts.json` before printing formatted output
- [ ] Ensure `services.workspace.findRoot()` guard is present for any command that needs a workspace root
- [ ] Run `npm test` from repo root — includes CLI golden file tests
- [ ] Run `npm run typecheck` — CLI types are in scope
- [ ] After any meaningful UX fix: check whether a memory entry should be added
