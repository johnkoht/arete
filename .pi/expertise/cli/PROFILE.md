# CLI Package Expertise Profile

> Domain map for `packages/cli/`. Orients agents WHERE to look — not an encyclopedia.
> For codebase-wide architectural patterns, see `.pi/standards/patterns.md`.

---

## Purpose & Boundaries

**CLI is responsible for**: User-facing commands, interactive prompts, formatted console output, and option parsing. It is a thin shell over `@arete/core` services.

**CLI is NOT responsible for**:
- Business logic, domain types, service classes → `packages/core/` (see `.pi/expertise/core/PROFILE.md`)
- Runtime skills, rules, tools content → `packages/runtime/`
- Build-mode skills → `.pi/skills/`

**Key principle**: CLI commands never construct services directly — always `createServices(process.cwd())`. No business logic lives here; all domain work delegates to core services.

---

## Command Architecture

**Framework**: Commander.js (`commander` v12)
**Dependencies**: `@arete/core`, `@inquirer/prompts`, `chalk`, `yaml`
**Entry point**: `packages/cli/src/index.ts` — creates the `program`, registers all commands, calls `program.parse()`

**Registration pattern**: Each command file exports `registerXxxCommand(program: Command)`. The function attaches subcommands and options to the Commander program. All async work is inside `.action(async (...) => { ... })` — never top-level await.

**Command skeleton** (every command follows this):
```
createServices(process.cwd()) → services.workspace.findRoot() → guard if null → service calls → format output
```

**Common options**: `--json` (machine-readable output), `--skip-qmd` (skip search index refresh after writes)

---

## Command Map

### intelligence.ts — Context, Memory, Resolve, Brief
Four commands registered from one file. The intelligence hub.
- **`context --for <query>`** → `services.context.getRelevantContext({ query, paths, primitives })`
- **`context --inventory`** → `services.context.getContextInventory(paths, opts)`
- **`memory search <query>`** → `services.memory.search({ query, paths, types, limit })`
- **`memory timeline <query>`** → `services.memory.getTimeline(query, paths, range)`
- **`resolve <reference>`** → `services.entity.resolve()` / `services.entity.resolveAll()`
- **`brief --for <query>`** → `services.intelligence.assembleBriefing({ task, paths, skillName })`
- UX: chalk-colored type labels (cyan=decisions, green=learnings, yellow=observations)

### route.ts — Skill + Model Routing
- **`route <query>`** → `services.skills.list()` + `services.tools.list()` → `services.intelligence.routeToSkill()` + `classifyTask()`
- Uses `toolsToCandidates()` from `lib/tool-candidates.ts` to merge tools into candidate pool

### install.ts — Workspace Initialization
- **`install [directory]`** → `isAreteWorkspace()` guard → `services.workspace.create()` → `ensureQmdCollection()`
- Options: `--source npm|symlink|local`, `--ide cursor|claude`, `--skip-qmd`
- Uses `getPackageRoot()`, `getSourcePaths()`, `getAdapter()` from core

### update.ts — Workspace Update
- **`update`** → `services.workspace.update(root, { sourcePaths })` → `ensureQmdCollection()`
- Options: `--check` (dry run), `--skip-qmd`
- Loads config for `ide_target` to select correct rules subdirectory

### status.ts — Workspace Health
- **`status`** → `services.workspace.getStatus()` + `loadConfig()` + `getAdapterFromConfig()`
- Reads skills list from filesystem, integration configs from YAML files
- Reports: version, IDE target, skills count, integrations, directory existence

### onboard.ts — Identity Setup
- **`onboard`** → interactive prompts (readline) → writes `context/profile.md` + `context/domain-hints.md`
- Options: `--name`, `--email`, `--company`, `--website` (non-interactive flags)
- Calls `refreshQmdIndex()` after writes

### people.ts — People Management
- **`people list`** → `services.entity.listPeople(paths, { category })`
- **`people show <slug|email>`** → `services.entity.getPersonByEmail()` / `getPersonBySlug()` — `--memory` flag extracts and displays auto-generated memory highlights section
- **`people index`** → `services.entity.buildPeopleIndex(paths)` → `refreshQmdIndex()`
- **`people intelligence digest`** → `services.entity.suggestPeopleIntelligence(candidates, paths, opts)`
- **`people memory refresh`** → `services.entity.refreshPersonMemory(paths, opts)` → `refreshQmdIndex()` — `--dry-run` previews extraction without writing files; `--person <slug>` refreshes a single person

### meeting.ts — Meeting Import & Processing
- **`meeting add`** → normalizes JSON input → `saveMeetingFile()` → `refreshQmdIndex()`
- **`meeting process`** → extracts attendees → `services.entity.suggestPeopleIntelligence()` → writes person files → `refreshQmdIndex()`
- **`meeting extract <file>`** (2026-03-08, enhanced 2026-03-15) → `services.ai.isConfigured()` guard → `extractMeetingIntelligence()` → `processMeetingExtraction()` → write file with full metadata. Flags: `--stage` writes staged sections + frontmatter metadata; `--clear-approved` clears prior approved sections before re-extraction (requires `--stage`)
- **`meeting approve <slug>`** (2026-03-15) → `parseStagedSections()` → `writeItemStatusToFile()` → `commitApprovedItems()` → `refreshQmdIndex()`. Commits staged items to memory files (`.arete/memory/items/decisions.md`, `learnings.md`). Flags: `--all` approves all pending, `--items <ids>` approves specific items, `--skip <ids>` marks items as skipped
- Template-based meeting file generation with frontmatter

### pull.ts — Integration Data Fetch
- **`pull calendar`** → `getCalendarProvider(config)` → `provider.getTodayEvents()` / `getUpcomingEvents()` → `resolveEntities()` for attendee enrichment
- **`pull fathom`** → `services.integrations.pull(root, 'fathom', opts)` → `refreshQmdIndex()`
- **`pull notion`** → `services.integrations.pull(root, 'notion', opts)` → `refreshQmdIndex()`
- **`pull krisp`** → `services.integrations.pull(root, 'krisp', opts)` → `refreshQmdIndex()`

### integration.ts — Integration Configuration
- **`integration list`** → `services.integrations.list(root)`
- **`integration configure calendar`** → `services.integrations.configure(root, 'calendar', config)`
- **`integration configure google-calendar`** → `authenticateGoogle()` → `listCalendars()` → interactive checkbox → `services.integrations.configure()`
- **`integration configure notion`** → `validateNotionToken()` → `saveNotionApiKey()` → `services.integrations.configure()`
- **`integration configure krisp`** → `KrispMcpClient.configure()` → `saveKrispCredentials()` → `services.integrations.configure()`

### skill.ts — Skill Management
- **`skill list`** → `services.skills.list(root)`
- **`skill install <source>`** / **`skill add`** → `services.skills.install(source, opts)` → overlap detection → optional default assignment
- **`skill route <query>`** → same routing as `route.ts` (skills + tools merged via `toolsToCandidates`)
- **`skill defaults`** / **`skill set-default`** / **`skill unset-default`** → reads/writes `arete.yaml` via `loadConfig()` + YAML

### tool.ts — Tool Discovery
- **`tool list`** → `services.tools.list(paths.tools)`
- **`tool show <name>`** → `services.tools.get(name, paths.tools)`

### template.ts — Template Resolution
- **`template resolve`** → `resolveTemplateContent(root, skillId, variant)` validates against `TEMPLATE_REGISTRY`
- **`template list`** → iterates `TEMPLATE_REGISTRY`, checks for workspace overrides
- **`template view`** → same as resolve but with header formatting

### availability.ts — Mutual Availability
- **`availability find --with <person>`** → `services.entity.resolve()` → `getCalendarProvider()` → `provider.getFreeBusy()` → `findAvailableSlots()`
- Dependency-injected (`AvailabilityDeps`) for testability

### calendar.ts — Event Creation
- **`calendar create`** → `parseNaturalDate()` → `services.entity.resolve()` (for `--with`) → `getCalendarProvider()` → `provider.createEvent()`
- Natural date parsing: ISO, today/tomorrow, day+time, next monday/week
- Dependency-injected (`CalendarDeps`) for testability

### seed.ts — Historical Data Import
- **`seed test-data`** → copies fixture files from `getPackageRoot()/test-data/` → `services.entity.buildPeopleIndex()`
- **`seed`** (no source) → `services.integrations.pull(root, 'fathom', { days })` — imports from Fathom

### index-search.ts — Search Index Management
- **`index`** → `refreshQmdIndex(root, config.qmd_collection)` — re-indexes qmd search
- **`index --status`** → shows collection name, attempts `qmd status` for vector count

### credentials.ts — AI Credential Management (2026-03-08)
- **`credentials login [provider]`** → OAuth flow (browser → paste code) → `saveOAuthCredentials()` — supports anthropic, github-copilot, google-gemini-cli
- **`credentials set <provider>`** → API key prompt → `saveCredentials()` → validation test call
- **`credentials show`** → `getConfiguredProviders()` — shows both OAuth and API key sources with masked values
- **`credentials test`** → tests configured provider connections, auto-refreshes OAuth tokens
- Uses `@arete/core` credentials module for storage (`~/.arete/credentials.yaml`, `~/.arete/auth.json`)

### config.ts — AI Configuration (2026-03-08)
- **`config show ai`** → displays AI config (tiers, task mappings, providers)
- **`config set <path> <value>`** → sets AI config values (e.g., `ai.tiers.fast`, `ai.tasks.extraction`)
- Reads/writes `arete.yaml` via `loadConfig()` + YAML

---

## UX Patterns

### Formatting (`formatters.ts`)
All output uses shared helpers — never raw `console.log(chalk.xxx(...))`:
- `success(msg)` — green ✓
- `error(msg)` — red ✗ (to stderr)
- `warn(msg)` — yellow ⚠
- `info(msg)` — blue ℹ
- `header(title)` — bold + separator line
- `section(title)` — indented bold + separator
- `listItem(label, value)` — dim label + value
- `formatPath(p)` — replaces home dir with ~
- `formatSlotTime(date)` — "Mon, Feb 25, 2:30 PM CT"

### Interactive Prompts
- Uses `@inquirer/prompts` (not monolithic `inquirer`)
- Checkbox for multi-select with `pageSize: 12`
- Reference patterns: `onboard.ts`, `seed.ts`, `integration.ts` (google-calendar)
- Non-interactive flags for testability (`--name`, `--calendars`, `--token`)

### JSON Mode
- `--json` flag on every command
- All output (including errors) through `JSON.stringify()` when active
- Check `opts.json` before every exit path

### QMD Index Refresh
- Commands that write workspace files call `refreshQmdIndex()` after writes
- Shared display via `displayQmdResult()` from `lib/qmd-output.ts`
- `--skip-qmd` option for testability
- JSON output includes `qmd: { indexed, skipped, warning? }` field

### Dependency Injection
- `availability.ts` and `calendar.ts` export deps interfaces for testability
- `pull.ts` uses `PullNotionDeps` for Notion-specific mocking
- `integration.ts` exports `configureNotionIntegration()` with injectable `fetchFn`

---

## Shared Utilities (`src/lib/`)

- **`qmd-output.ts`** — `displayQmdResult()`: three-state display for search index refresh results
- **`tool-candidates.ts`** — `toolsToCandidates()`: maps `ToolDefinition[]` → `SkillCandidate[]` for routing. Used by both `route.ts` and `skill.ts`

---

## Entry Points

- **Binary**: `bin/arete.js` → `src/index.ts`
- **Registration**: `index.ts` imports all `registerXxxCommand` functions, calls each with `program`
- **Tests**: `packages/cli/test/commands/` (unit), `packages/cli/test/integration/` (integration)

---

## Required Reading

Before working on CLI commands, always read:
1. `packages/cli/src/commands/LEARNINGS.md` — gotchas, invariants, pre-edit checklist
2. `packages/cli/src/formatters.ts` — output helpers
3. The specific command file you're modifying
4. `onboard.ts` or `seed.ts` for prompt UX patterns (if adding interactive features)

---

## Related Expertise

- **Core services consumed by CLI**: See `.pi/expertise/core/PROFILE.md` for service internals
- Core's `createServices()` factory wires all services; CLI destructures what it needs
- Core's `loadConfig()` reads `arete.yaml`; several CLI commands need it for `qmd_collection` and `ide_target`

---

## LEARNINGS.md Locations

- `packages/cli/src/commands/LEARNINGS.md` — comprehensive CLI gotchas, invariants, testing gaps, patterns
