## How This Works

CLI commands are registered via `registerXxxCommand(program: Command)` functions imported and called in `packages/cli/src/index.ts`. Commander.js is the CLI framework. Each command file exports a single `registerXxxCommand` function that attaches subcommands/options to the Commander `program`. The established pattern for every action: `createServices(process.cwd())` → `services.workspace.findRoot()` (exit if null) → execute service method → format output via `formatters.ts`. JSON output (`--json` flag) is supported across commands for programmatic use. Interactive prompts use `inquirer` with checkbox, confirm, and list types — always match the `arete setup` and `arete seed` UX patterns (checkbox for multi-select, `pageSize: 12`, clear copy). Tests for command behavior are in `packages/cli/test/commands/`.

## Key References

- `packages/cli/src/index.ts` — program setup, all `registerXxxCommand` calls
- `packages/cli/src/commands/install.ts` — workspace init, `--ide cursor|claude`, `isAreteWorkspace()` guard
- `packages/cli/src/commands/pull.ts` — `pullCalendar()`, `createServices()` → `workspace.findRoot()` → provider pattern
- `packages/cli/src/commands/intelligence.ts` — `registerContextCommand`, `registerMemoryCommand`, `registerResolveCommand`, `registerBriefCommand`
- `packages/cli/src/commands/integration.ts` — `configureCalendar()`, writes `arete.yaml` config (producer side)
- `packages/cli/src/formatters.ts` — `header()`, `listItem()`, `success()`, `error()`, `info()`, `warn()`, `formatPath()`
- Memory: `memory/collaboration.md` (Corrections section), `memory/entries/2026-02-11_calendar-integration-ux-and-learnings.md`

## Gotchas

- **Use established UX patterns (checkbox, `pageSize: 12`) — not bare minimum.** In 2026-02-11, the calendar integration configure command used number-based selection and displayed raw `icalBuddy` output instead of matching the `arete setup` / `arete seed` UX (inquirer checkbox with parsed calendar names). The builder corrected this explicitly: "When updating or adding CLI features, use established design patterns and experience rather than the bare minimum." Before writing interactive prompts, read `setup.ts` and `seed.ts` to see what they use. Correction from `memory/collaboration.md`.

- **Always check `services.workspace.findRoot()` and exit if null before doing any workspace operation.** Every command that requires a workspace does: `const root = await services.workspace.findRoot(); if (!root) { error('Not in an Areté workspace'); process.exit(1); }`. Commands that skip this will produce confusing errors (file not found, undefined paths) when run outside a workspace. See `pull.ts` L22-29 for the canonical pattern.

- **`--json` output must be complete and parseable — including error cases.** When `opts.json` is true, ALL output (including errors) goes through `JSON.stringify()` to stdout. Commands that print `error()` (chalk-colored text to stderr) before checking `opts.json` produce mixed output that breaks callers. Always check `opts.json` first in every exit path. See `pull.ts` L24-28 for the correct pattern: JSON error block, then `process.exit(1)`.

- **`registerXxxCommand` must not do top-level `await`.** All async work is inside the `.action(async (...) => { ... })` callback. Commander.js does not support top-level async in register functions — side effects at module load time break the CLI startup for other commands.

- **`pageSize` for inquirer prompts: add `pageSize: 12` to any checkbox or list with potentially many items.** Without `pageSize`, inquirer defaults to ~5-6 visible items. Calendar list and people list both had this issue before being fixed. Established pattern from `2026-02-11_calendar-integration-ux-and-learnings.md`.

- **After fixing a meaningful UX gap that the builder had to report: add a memory entry and learnings.** In 2026-02-11, the calendar integration was fixed (binary name, list parsing, checkbox UX) but no memory entry was added. "The same kind of miss could repeat." From `2026-02-11_calendar-integration-ux-and-learnings.md`.

## Invariants

- Every command that reads/writes workspace data calls `createServices(process.cwd())` — not a custom service instantiation.
- Output formatting uses `formatters.ts` helpers, not raw `console.log(chalk.xxx(...))` inline.
- Commands do not import service classes directly — only `createServices` and type imports from `@arete/core`.

## Testing Gaps

- Golden file tests for command output formatting exist (from monorepo refactor `2026-02-15`) but coverage for calendar and people commands was noted as potentially thinner after legacy test cleanup.
- Interactive prompt paths (checkbox selections, confirm dialogs) are difficult to test and currently only manually verified.

## Patterns That Work

- **Command skeleton**: `registerXxxCommand(program)` → `.command('name').description('...').option(...).action(async (args, opts) => { const services = await createServices(process.cwd()); const root = await services.workspace.findRoot(); if (!root) { /* error + exit */ } /* ... */ })`
- **Before writing a new prompt**: open `setup.ts` or `seed.ts`, copy the inquirer checkbox pattern including `pageSize: 12`, then adapt the choices.

## Pre-Edit Checklist

- [ ] Check `arete setup` and `arete seed` for the prompt UX pattern before adding any interactive prompt to a new command
- [ ] Verify all exit paths check `opts.json` before printing formatted output
- [ ] Ensure `services.workspace.findRoot()` guard is present for any command that needs a workspace root
- [ ] Run `npm test` from repo root — includes CLI golden file tests
- [ ] Run `npm run typecheck` — CLI types are in scope
- [ ] After any meaningful UX fix: check whether a memory entry should be added
