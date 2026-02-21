## How This Works

The plan-mode extension is a Pi extension loaded at runtime via jiti (no compilation step). The entry point is `index.ts`, which registers commands (`/plan`, `/approve`, `/review`, `/pre-mortem`, `/prd`, `/build`, `/todos`), tools (`save_plan_artifact`), and Pi event hooks (`tool_call`, `context`, `before_agent_start`, `turn_end`, `agent_end`, `session_start`). Command logic lives in `commands.ts`; file I/O in `persistence.ts`; tool allowlist checks in `utils.ts`; the footer widget in `widget.ts`. State is a single `PlanModeState` object (defined in `commands.ts`) shared by all handlers. Session persistence uses `pi.appendEntry("plan-mode", {...})` — the last entry wins on restore. Plans are stored as `dev/work/plans/{slug}/plan.md` with YAML frontmatter. Tests live in `.pi/extensions/plan-mode/*.test.ts` and must be run separately from the npm test suite.

## Key References

- `index.ts` — extension entry, Pi event hooks, `PlanModeState`, `autoSavePlan()`
- `commands.ts` — `PlanModeState`, `createDefaultState()`, all command handlers, `CommandContext`/`CommandPi` interfaces
- `persistence.ts` — `savePlan()`, `loadPlan()`, `parseFrontmatter()`, `serializeFrontmatter()`, `slugify()`, `migrateStatus()`
- `utils.ts` — `isAllowedInPlanMode()`, `PLAN_MODE_TOOLS`, `getNormalModeTools()`, `setNormalModeTools()`, `extractTodoItems()`
- `widget.ts` — footer and todo widget rendering
- Tests: `.pi/extensions/plan-mode/*.test.ts` (run with `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`)

## Gotchas

- **Pi uses jiti — no compile step, no `npm run typecheck` coverage.** TypeScript errors in extension files will not surface from `npm run typecheck`. To type-check the extension, run `npx tsc --noEmit` in the extension directory with a local `tsconfig.json`, or catch errors at runtime. Discovered in `2026-02-16_plan-lifecycle-system-learnings.md`.

- **`tsc -b --noEmit` is incompatible with composite projects.** If you add a `tsconfig.json` for the extension, use `tsc -b` (without `--noEmit`) or plain `tsc --noEmit` (without `-b`). Mixing them causes a TypeScript CLI error. Documented in `2026-02-16_plan-lifecycle-system-learnings.md`.

- **Extension tests are NOT run by `npm test`.** The package test runner doesn't discover `.pi/extensions/plan-mode/*.test.ts`. Run them explicitly: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`. Skipping this means command handler regressions won't be caught by CI.

- **`setNormalModeTools()` must be called in `session_start` before any plan mode activation.** `index.ts` calls `pi.getAllTools()` at session start to capture all registered tools (including extensions like `subagent`). If plan mode is toggled before `session_start` fires, `getNormalModeTools()` returns an empty array and exiting plan mode removes all tools. See `index.ts` `session_start` handler.

- **State restoration fields must stay in sync.** `index.ts` persists `enabled`, `todos`, `executing`, `currentSlug`, `planSize`, `preMortemRun`, `reviewRun`, `prdConverted` together. On resume, the frontmatter from disk overwrites in-memory flags — if `persistence.ts` and the persisted entry disagree, the frontmatter wins (see `session_start` reconciliation block). Adding a new flag requires updating both `pi.appendEntry()` calls and the session restore block.

- **`inPrdConversion` temporarily lifts tool restrictions during `/prd`.** The `/prd` command handler sets `inPrdConversion = true` and switches to full tool access so the agent can write files. If this flag is not reset (e.g. command throws), plan mode stays in full-access. The flag is reset in a `finally`-style pattern in `index.ts` `/prd` handler — preserve that pattern on any refactor.

- **Bash command allowlist is in `utils.ts` `isAllowedInPlanMode()`.** Blocking is enforced via the `tool_call` hook in `index.ts`. When `inPrdConversion` is true, blocking is skipped. If you add a safe read-only command, add it to the allowlist in `utils.ts`, not inline in `index.ts`.

## Invariants

- `state.currentSlug` is always a slugified string (lowercase, kebab-case, no special chars) — never set it directly; use `slugify()` from `persistence.ts`.
- Plan files always live at `dev/work/plans/{slug}/plan.md` — no flat files in `dev/work/plans/`.
- Frontmatter is always written/read through `serializeFrontmatter()` / `parseFrontmatter()` — never raw YAML libraries (none imported). The custom parser handles migration via `migrateStatus()` for legacy status values.
- In plan mode, active tools are always exactly `PLAN_MODE_TOOLS` from `utils.ts`. Exiting plan mode restores exactly `getNormalModeTools()`. Never manually hardcode a tool list.

## Testing Gaps

- No integration test that loads the extension in a live Pi session and verifies command registration.
- `index.ts` `before_agent_start` prompt injection logic is only exercised via unit test stubs, not against a real agent turn.
- `autoSavePlan()` content-hash deduplication is not unit tested.

## Patterns That Work

- **Pure module architecture**: `persistence.ts`, `utils.ts`, `widget.ts`, and `commands.ts` are all Pi-free pure modules. Command handlers take `CommandContext`/`CommandPi` interfaces — mock those in tests rather than importing Pi runtime. This was the key pattern from `2026-02-16_plan-lifecycle-system-learnings.md` that enabled 137 tests with 0 Pi dependency.

## Pre-Edit Checklist

- [ ] Run `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'` before and after changes to catch regressions
- [ ] If adding a new state field: update `PlanModeState` (commands.ts), `createDefaultState()`, `persistState()` in index.ts, and the session restore block in `session_start`
- [ ] If changing plan frontmatter fields: update `PlanFrontmatter` (persistence.ts), `serializeFrontmatter()`, `parseFrontmatter()`, and any callers that destructure frontmatter
- [ ] If adding a bash command to the allowlist: edit `utils.ts` `isAllowedInPlanMode()`, not `index.ts`
- [ ] Verify `npm run typecheck` still passes (catches packages/ — extension errors need separate `tsc`)
