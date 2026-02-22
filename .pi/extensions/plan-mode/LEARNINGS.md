## How This Works

The plan-mode extension is a Pi extension loaded at runtime via jiti (no compilation step). The entry point is `index.ts`, which registers commands (`/plan`, `/approve`, `/review`, `/pre-mortem`, `/prd`, `/build`, `/todos`), tools (`save_plan_artifact`), and Pi event hooks (`context`, `before_agent_start`, `turn_end`, `agent_end`, `session_start`). Command logic lives in `commands.ts`; file I/O in `persistence.ts`; utility functions (todo extraction, plan classification) in `utils.ts`; the footer widget in `widget.ts`. Plan mode relies on prompt guidance rather than tool restrictions — all tools remain available. State is a single `PlanModeState` object (defined in `commands.ts`) shared by all handlers. Session persistence uses `pi.appendEntry("plan-mode", {...})` — the last entry wins on restore. Plans are stored as `dev/work/plans/{slug}/plan.md` with YAML frontmatter. Tests live in `.pi/extensions/plan-mode/*.test.ts` and must be run separately from the npm test suite.

## Key References

- `index.ts` — extension entry, Pi event hooks, `PlanModeState`, `autoSavePlan()`, `handleExecutionComplete()` (shared completion handler for both todo and PRD paths)
- `commands.ts` — `PlanModeState`, `createDefaultState()`, all command handlers, `checkPrdExecutionComplete()`, `CommandContext`/`CommandPi` interfaces
- `persistence.ts` — `savePlan()`, `loadPlan()`, `parseFrontmatter()`, `serializeFrontmatter()`, `slugify()`, `migrateStatus()`
- `utils.ts` — `extractTodoItems()`, `classifyPlanSize()`, `suggestPlanName()`, `TodoItem` type
- `agents.ts` — `loadAgentConfig()`, `getAgentPrompt()`, `getAgentModel()`, `resolveModel()`; loads agent model settings from `.pi/settings.json` and prompt definitions from `.pi/agents/{role}.md`
- `execution-progress.ts` — `resolveExecutionProgress()`, `deriveActiveRole()`; reads PRD progress from prd.json during `/build` execution; used by `commands.ts`
- `widget.ts` — footer and todo widget rendering
- Tests: `.pi/extensions/plan-mode/*.test.ts` (run with `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`)

## Gotchas

- **PRD-based plans never auto-completed.** The `agent_end` completion handler only checked `todoItems.every(t => t.completed)` — but PRD plans don't use todoItems. They track progress in `prd.json` via the execute-prd skill. Result: plan status stayed at "building" forever after a PRD finished. Fixed by adding a parallel PRD progress check in `agent_end` using `resolveExecutionProgress()`.

- **`/build` had no guard for "building" status.** Only checked `"draft"` (promote?) and `"complete"` (block). A plan stuck at "building" (see above) would fall through and re-trigger `sendUserMessage("Execute the PRD...")`, causing the agent to re-execute an already-completed PRD. Fixed by checking execution progress when status is "building" — if complete, mark done; if in progress, confirm with user.

- **Two execution paths need parallel handling.** Todo-based (no PRD) and PRD-based plans have fundamentally different progress tracking. Any new feature touching execution completion, progress display, or status transitions must handle both paths. The `WidgetState.prdProgress` field was added to bridge this gap for the footer.

- **Pi uses jiti — no compile step, no `npm run typecheck` coverage.** TypeScript errors in extension files will not surface from `npm run typecheck`. To type-check the extension, run `npx tsc --noEmit` in the extension directory with a local `tsconfig.json`, or catch errors at runtime. Discovered in `2026-02-16_plan-lifecycle-system-learnings.md`.

- **`tsc -b --noEmit` is incompatible with composite projects.** If you add a `tsconfig.json` for the extension, use `tsc -b` (without `--noEmit`) or plain `tsc --noEmit` (without `-b`). Mixing them causes a TypeScript CLI error. Documented in `2026-02-16_plan-lifecycle-system-learnings.md`.

- **Extension tests are NOT run by `npm test`.** The package test runner doesn't discover `.pi/extensions/plan-mode/*.test.ts`. Run them explicitly: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`. Skipping this means command handler regressions won't be caught by CI.

- **State restoration fields must stay in sync.** `index.ts` persists `enabled`, `todos`, `executing`, `currentSlug`, `planSize`, `preMortemRun`, `reviewRun`, `prdConverted` together. On resume, the frontmatter from disk overwrites in-memory flags — if `persistence.ts` and the persisted entry disagree, the frontmatter wins (see `session_start` reconciliation block). Adding a new flag requires updating both `pi.appendEntry()` calls and the session restore block.

- **`inPrdConversion` flag is NOT exception-safe — a throw from `/prd` leaves it stuck `true`.** The `/prd` handler sets `inPrdConversion = true`, grants full tool access, awaits `handlePrd()`, then resets it. There is no `try/finally`. If `handlePrd()` throws, the flag stays `true` for the rest of the session. Mitigation: if you add error handling to `/prd`, wrap the reset in `finally`.

- **Plan mode no longer restricts tools — it relies on prompt guidance.** The tool restriction system (`isAllowedInPlanMode`, `PLAN_MODE_TOOLS`, bash allowlist) was removed in `e9a5194`. All tools remain available in plan mode. The `before_agent_start` hook injects plan-mode context via a `message` that instructs the agent to explore rather than execute. If you see references to tool blocking or `PLAN_MODE_TOOLS` in old memory entries, they are outdated.

## Invariants

- `state.currentSlug` is always a slugified string (lowercase, kebab-case, no special chars) — never set it directly; use `slugify()` from `persistence.ts`.
- Plan files always live at `dev/work/plans/{slug}/plan.md` — no flat files in `dev/work/plans/`.
- Frontmatter is always written/read through `serializeFrontmatter()` / `parseFrontmatter()` — never raw YAML libraries (none imported). The custom parser handles migration via `migrateStatus()` for legacy status values.
- Plan mode does not restrict the tool set — all tools remain available. The mode is enforced via prompt guidance in `before_agent_start`, not tool filtering.

## Testing Gaps

- No integration test that loads the extension in a live Pi session and verifies command registration.
- `index.ts` `before_agent_start` prompt injection logic is only exercised via unit test stubs, not against a real agent turn.
- `autoSavePlan()` content-hash deduplication is not unit tested.

## Patterns That Work

- **Pure module architecture**: `persistence.ts`, `utils.ts`, `widget.ts`, and `commands.ts` are all Pi-free pure modules. Command handlers take `CommandContext`/`CommandPi` interfaces — mock those in tests rather than importing Pi runtime. This pattern from `2026-02-16_plan-lifecycle-system-learnings.md` enables extensive testing with 0 Pi dependency.

## Pre-Edit Checklist

- [ ] Run `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'` before and after changes to catch regressions
- [ ] If adding a new state field: update `PlanModeState` (commands.ts), `createDefaultState()`, `persistState()` in index.ts, and the session restore block in `session_start`
- [ ] If changing plan frontmatter fields: update `PlanFrontmatter` (persistence.ts), `serializeFrontmatter()`, `parseFrontmatter()`, and any callers that destructure frontmatter
- [ ] Plan mode no longer restricts tools — if you need to change plan-mode behavior, modify the prompt injection in `index.ts` `before_agent_start`, not tool filtering
- [ ] If editing agent prompt injection logic: read `agents.ts` — `/review` and `/pre-mortem` look up `.pi/agents/{role}.md` via `getAgentPrompt()`
- [ ] If editing execution progress tracking: read `execution-progress.ts` — it reads prd.json by slug path; path assumptions must stay in sync with `persistence.ts`
- [ ] If changing execution completion logic: both todo-based (`todoItems.every()`) and PRD-based (`resolveExecutionProgress()`) paths in `agent_end` must be updated together — they share `handleExecutionComplete()` but have different detection triggers
- [ ] Verify `npm run typecheck` still passes (catches packages/ — extension errors need separate `tsc`)
