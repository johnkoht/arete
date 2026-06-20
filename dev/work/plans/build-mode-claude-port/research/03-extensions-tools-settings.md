# BUILD-mode Port — Slice 03: Pi Extensions, Bundled Tools, Settings → Claude Code

Research date: 2026-06-19. Scope: porting the Pi-specific TypeScript surface of BUILD mode to Claude Code. This is the hardest slice because none of it has an automatic equivalent — `.pi/extensions/plan-mode/` (~73KB of command logic), `.pi/extensions/agent-memory/`, the two bundled npm packages (`pi-subagents`, `pi-web-access`), and `.pi/settings.json` are all Pi-runtime constructs (jiti-loaded extensions, `ExtensionAPI` hooks, the `subagent`/`web_search`/`fetch_content` tools).

## Executive Summary (15 lines)

1. The plan-mode extension is the crux: it is a stateful lifecycle engine (idea→draft→planned→building→complete) backed by `dev/work/plans/{slug}/plan.md` files with YAML frontmatter. Claude Code has NO native equivalent for disk-persisted, frontmatter-tracked plans.
2. Claude Code's native plan mode (EnterPlanMode/ExitPlanMode) is ephemeral and session-scoped — it is NOT a substitute for the persisted plan store. It maps only to the "explore and shape, don't implement" framing.
3. The persistence layer (`persistence.ts`, ~940 lines: savePlan/loadPlan/listPlans/archivePlan/promoteBacklogItem/migrateStatus) must be ported verbatim as a small Node CLI (`arete plan ...`) that slash commands shell out to. This is the single biggest must-do, and it is low-risk because the code is already Pi-free and unit-tested.
4. The `/plan [new|list|open|save|rename|status|delete|archive|promote]` subcommands become a slash command (`/plan`) that calls that CLI. `set_plan`/auto-save become "the agent writes plan.md via the CLI or Write tool."
5. `[DONE:n]` execution tracking has NO native equivalent. Recommendation: drop the regex-marker mechanism; use native TodoWrite for in-session progress and the plan frontmatter `status` field for durable state. The PRD path (`prd.json` userStories status) stays as the durable execution ledger.
6. `/review`, `/pre-mortem`, `/prd`, `/wrap`, `/ship` are already thin wrappers that just `sendUserMessage("...load .pi/skills/X/SKILL.md...")`. These become Claude Code skills/slash commands almost 1:1 — easiest items.
7. `/release` (release.ts: version bump + changelog + git tag) is pure Node with no Pi dependency. Port as a CLI subcommand or skill; low risk.
8. agent-memory (injects `memory/collaboration.md` into the system prompt) maps cleanly to a CLAUDE.md `@import` OR a SessionStart hook. Recommend CLAUDE.md import — simplest, zero code.
9. The plan-mode `before_agent_start` context injection (active plan body + PM agent prompt + size recommendations) has no static-import equivalent; needs a SessionStart/UserPromptSubmit hook OR the `/plan open` command printing the plan into context.
10. pi-subagents: parallel fan-out, chains, fresh/fork context, and run history are largely covered by the native Task/Agent tool (parallel) and the Workflow tool (deterministic chains). LOST: durable async background jobs with status files, the `/agents` TUI manager, reusable `.chain.md` files, and the Ctrl+Shift+A overlay.
11. pi-web-access: `web_search`→WebSearch, `fetch_content`(web/PDF)→WebFetch. LOST without MCP: YouTube/local-video understanding, GitHub-clone-instead-of-scrape, frame extraction, the curator UI, Gemini-via-browser-cookies zero-config.
12. settings.json: `tools` allowlist → `.claude/settings.json` permissions; per-agent model assignments → agent frontmatter `model:` per subagent definition; `packages` → not applicable (capabilities become native tools + MCP).
13. Highest-risk / genuinely-hard: (a) the stateful session-restore reconciliation in `index.ts session_start` (frontmatter-wins logic, building→resume-execution), (b) async background subagent jobs, (c) web video/GitHub-clone capabilities.
14. Cannot be replicated 1:1 without custom work: durable plan store, lifecycle frontmatter, the footer/todo widget (Ctrl+Alt+P), the `/agents` manager TUI, async job tracker, browser-cookie web access.
15. Net effort: ~1 large item (plan CLI + persistence port), ~6 trivial items (skill wrappers, memory import, settings), ~3 lossy items (async jobs, web video, agents TUI) that we deliberately drop or stub. Ordered task list at the end.

---

## Part A — plan-mode extension: command-by-command mapping

The extension entry is `.pi/extensions/plan-mode/index.ts`. It registers commands, two tools (`save_plan_artifact`, `set_plan`), one shortcut (Ctrl+Alt+P), and five Pi hooks (`context`, `before_agent_start`, `turn_end`, `agent_end`, `session_start`). Command bodies live in `commands.ts` (2328 lines); file I/O in `persistence.ts`; pure helpers in `utils.ts`; close-out checks in `wrap-checks.ts`; release logic in `release.ts`; execution progress in `execution-progress.ts`.

The critical architectural fact: most "smart" commands (`/review`, `/pre-mortem`, `/prd`, `/wrap`, `/ship`, `/build`-with-PRD) do NOT contain AI logic. They call `pi.sendUserMessage("...load .pi/skills/<skill>/SKILL.md and follow it...")` plus a state/frontmatter mutation. So porting them is: (1) port the frontmatter mutation to the plan CLI, (2) re-home the skill as a Claude Code skill, (3) make the slash command call the CLI then prompt for the skill. The hard part is exclusively the stateful store + lifecycle + session reconciliation.

### Command mapping table

| Pi command | What it does (file:fn) | Claude Code mechanism | Effort/Risk |
|---|---|---|---|
| `/plan` (toggle) | Toggles `planModeEnabled`, injects plan-mode framing via `before_agent_start` (`index.ts:togglePlanMode`, `index.ts` before_agent_start) | NATIVE plan mode (EnterPlanMode) for the "explore, don't implement" framing | Low / Low — framing only; no persistence |
| `/plan new [name]` | Creates `{slug}/plan.md` stub, status `idea`, prompts for name (`commands.ts:handlePlanNew` → `persistence.ts:savePlan`) | CUSTOM script: `arete plan new <name>` (slash command `/plan` dispatches) | Med / Low — straight port of savePlan |
| `/plan list [--work\|--backlog\|--complete\|--building\|--planned\|--archive\|--all]` | Filter+group+render plan picker (`commands.ts:handlePlanList`, `preparePlanListItems`, `groupPlansByStatus`) | CUSTOM script: `arete plan list [filter]` prints a table to stdout (drop the rich TUI SelectList; output markdown) | Med / Low — port pure functions, drop TUI |
| `/plan open <slug>` | Loads plan into state, prints diff since `updated` (`commands.ts:handlePlanOpen` + `getChangesSince`) | CUSTOM script `arete plan open <slug>` prints frontmatter + body + git-diff-since into context; slash command relays it | Med / Med — "loaded state" has no session memory; see Gap 2 |
| `/plan save [name] [--capture]` | Writes plan.md, frontmatter; `--capture` saves whole last assistant msg (`commands.ts:handlePlanSave`) | The agent writes plan.md via the plan CLI or the native Write tool. `--capture` concept is moot (agent controls its own output) | Low / Low — `set_plan`/auto-save/capture all collapse into "agent writes the file" |
| `/plan rename <name>` | Move folder, rewrite frontmatter (`commands.ts:handlePlanRename`) | CUSTOM `arete plan rename <new>` | Low / Low |
| `/plan status [idea\|draft\|planned]` | Show or set status, with gates (`commands.ts:handlePlanStatus`) | CUSTOM `arete plan status [value]` | Low / Low |
| `/plan delete [slug]` | rmSync the folder (`commands.ts:handlePlanDelete` → `deletePlan`) | CUSTOM `arete plan delete <slug>` | Low / Low |
| `/plan archive [slug\|list]` | Move to `archive/YYYY-MM/`, set complete/abandoned (`commands.ts:handleArchive` → `archivePlan`) | CUSTOM `arete plan archive <slug> <complete\|abandoned>` | Low / Low |
| `/plan promote [slug]` | Move backlog item → plans/ as draft (`commands.ts:handlePromote` → `promoteBacklogItem`) | CUSTOM `arete plan promote <slug>` | Low / Low |
| `/approve` | Set status `planned`, recommend pre-mortem/review for medium/large (`commands.ts:handleApprove`) | CUSTOM `arete plan approve` (or `/plan status planned`); recommendation text becomes skill/command output | Low / Low |
| `/review` | `sendUserMessage("load review-plan SKILL")` + set `has_review` (`commands.ts:handleReview`) | SKILL `review-plan` + slash command `/review` that sets `has_review` via CLI then invokes the skill | Low / Low — skill already exists at `.pi/skills/review-plan/` |
| `/pre-mortem` | `sendUserMessage("load run-pre-mortem SKILL")` + set `has_pre_mortem` (`commands.ts:handlePreMortem`) | SKILL `run-pre-mortem` + `/pre-mortem` slash command | Low / Low |
| `/prd` | `sendUserMessage("load plan-to-prd SKILL, feature slug = plan slug")` + set `has_prd` (`commands.ts:handlePrd`) | SKILL `plan-to-prd` (+ `prd-to-json`) + `/prd` slash command | Low / Low |
| `/build [slug]` | Gate on `planned`, set `building`, git-commit the plan dir, then EITHER invoke execute-prd skill (PRD path) OR send "execute the plan" (todo path) (`commands.ts:handleBuild` + `commitPlanToGit`) | SLASH command `/build`: CLI sets status `building` + commits plan dir; if `has_prd`, invoke `execute-prd` skill; else native plan-execution with TodoWrite | Med / Med — the two execution paths + completion detection are the stateful core |
| `/build status` | Render PRD/todo progress (`commands.ts:handleBuildStatus` + `resolveExecutionProgress`) | CUSTOM `arete plan build-status` reads prd.json; OR rely on native TodoWrite display | Low / Low |
| `/ship [slug]` | Set `building`, `sendUserMessage("load ship SKILL")` (`commands.ts:handleShip`) | SKILL `ship` + `/ship` slash command | Low / Low — skill exists |
| `/wrap` | Run close-out checks (memory entry, MEMORY.md index, status, LEARNINGS, UPDATES/CHANGELOG, capability catalog), print tiered checklist (`commands.ts:handleWrap` + `wrap-checks.ts`) | CUSTOM `arete plan wrap <slug>` prints the checklist (all pure Node, no Pi) OR a `wrap` skill that runs the checks via Bash | Med / Low — pure functions port directly |
| `/release [status\|patch\|minor] [--dry-run]` | Version bump, changelog gen, git tag (`commands.ts:handleRelease` + `release.ts`) | CUSTOM `arete release ...` CLI subcommand (release.ts is pure Node) OR `/release` skill | Med / Low |
| `/todos` | Print current todo list (`index.ts` registerCommand "todos") | NATIVE TodoWrite list / drop | Low / Low |
| Ctrl+Alt+P shortcut | Toggle plan mode (`index.ts:registerShortcut`) | DROPPED — Claude Code uses Shift+Tab for plan mode; no custom shortcut API for this | n/a / Low |
| `save_plan_artifact` tool | Write review.md/pre-mortem.md/prd.md/notes.md to plan dir, update frontmatter (`index.ts`) | The agent writes the artifact with the Write tool to `dev/work/plans/{slug}/<file>`, then `arete plan set-flag has_review` etc. | Low / Low |
| `set_plan` tool | Explicit plan.md write w/ frontmatter management (`index.ts`) | The agent uses Write/`arete plan save`; frontmatter managed by CLI | Low / Low |

### The two real gaps (no native equivalent)

**Gap 1 — Durable plan store + lifecycle frontmatter.** This is the core. `persistence.ts` is ~940 lines of Pi-free `node:fs` code: `savePlan`/`loadPlan`/`listPlans`/`updatePlanFrontmatter`/`savePlanArtifact`/`deletePlan`/`archivePlan`/`promoteBacklogItem`/`listBacklogItems`/`migrateStatus`/`slugify`/`serializeFrontmatter`/`parseFrontmatter`. The frontmatter schema (PLAN-FORMAT.md) — `status: idea|draft|planned|building|complete|abandoned`, `size: tiny|small|medium|large`, `has_review`/`has_pre_mortem`/`has_prd`, `steps`, timestamps — is the durable state machine. Claude Code has nothing like this.

Recommendation: lift `persistence.ts`, `utils.ts` (extractTodoItems/classifyPlanSize/suggestPlanName), `wrap-checks.ts`, `execution-progress.ts`, and `release.ts` VERBATIM into a small Node CLI (e.g. `dev/tools/plan-cli/` or as `arete plan` subcommands). They have ZERO Pi imports today (LEARNINGS.md "Pure module architecture" confirms this), so this is mechanical, and the existing `.test.ts` files port with them. Then each slash command (`.claude/commands/plan.md`, `review.md`, etc.) is a thin file that runs `arete plan <subcmd>` via Bash and relays output. This is the single highest-value task and it is low risk.

**Gap 2 — `[DONE:n]` execution tracking + "loaded plan in session memory".** Two sub-gaps:
- The `[DONE:n]` regex markers (`utils.ts:extractDoneSteps/markCompletedSteps`, fired in `turn_end`) drive the live todo widget. Claude Code has no per-turn message-scanning hook that mutates a widget. Recommendation: DROP `[DONE:n]`. Use native TodoWrite for in-session progress (the agent maintains it directly) and the durable `status` frontmatter for cross-session state. For PRD-based builds, keep `prd.json` userStories `status` as the source of truth (execute-prd skill already writes it) — `execution-progress.ts:resolveExecutionProgress` ports as-is for `/build status`.
- "Loaded from disk" state (`state.currentSlug`, `loadedFromDisk`) lives in Pi session entries. Claude Code has no equivalent mutable session store the slash command can read back. Recommendation: make plan identity stateless — every command takes an explicit `<slug>` argument (or infers "the most recently updated building/planned plan"). `/plan open <slug>` simply dumps the plan body into context. This eliminates the entire `session_start` reconciliation block (`index.ts` lines ~729-823), the `loadedFromDisk` guard system, and the whole class of plan-overwrite bugs documented in LEARNINGS.md — a real simplification win.

**Gap 3 — context injection of the active plan + PM persona.** `before_agent_start` injects the active plan body, the product-manager agent prompt (`.pi/agents/product-manager.md` via `agents.ts:getAgentPrompt`), and size-based recommendations. In Claude Code there is no "active plan" to inject because we made identity stateless. Two options: (a) `/plan open <slug>` prints the body into context on demand (preferred, explicit); (b) a SessionStart/UserPromptSubmit hook that detects a building plan and injects it. Recommend (a). The PM persona becomes either a Claude Code subagent definition (`.claude/agents/product-manager.md`) invoked by `/plan`, or text the `/plan` command emits.

---

## Part B — agent-memory extension

`.pi/extensions/agent-memory/index.ts` is 47 lines: on `session_start` it reads `memory/collaboration.md`; on `before_agent_start` it appends `\n\n## Builder Collaboration Profile\n\n<content>` to the system prompt (uses `systemPrompt` return, not a message, to avoid token accumulation).

Two clean replacements:
- PREFERRED — CLAUDE.md import: add a line `@memory/collaboration.md` to `CLAUDE.md` (or AGENTS.md, which CLAUDE.md already redirects to). Zero code; Claude Code resolves `@`-imports into the system context. Caveat: import is always-on (not session-cached-once like the Pi version) but that is fine and arguably better.
- ALTERNATIVE — SessionStart hook in `.claude/settings.json` that `cat`s `memory/collaboration.md` into additionalContext. Use this only if you need conditional logic (e.g. skip when file missing — though `@import` of a missing file is harmless).

Effort: trivial. Risk: none. Recommend the CLAUDE.md `@import`.

---

## Part C — pi-subagents package

`pi-subagents` (`index.ts` registers `subagent` + `subagent_status` tools; ~830 lines of supporting files) provides: single/parallel/chain delegation, fresh vs fork context, async/background jobs with durable status files, per-agent markdown definitions with frontmatter (model/thinking/tools/skills/output/reads), reusable `.chain.md` pipelines, the `/run` `/chain` `/parallel` slash commands, the Ctrl+Shift+A Agents Manager TUI, run history (JSONL), artifacts, parallel-in-chain fan-out/fan-in, and a nesting depth guard.

Mapping to native Claude Code:

| pi-subagents capability | Native Claude Code | Coverage |
|---|---|---|
| Single delegation `{agent, task}` | Agent/Task tool with `subagent_type` | COVERED |
| Parallel `{tasks:[...]}` | Multiple Agent calls in one message (run concurrently) | COVERED |
| Sequential chain `{chain:[...]}` with `{previous}` | Workflow tool (deterministic multi-agent orchestration) OR sequential Agent calls relaying output | COVERED (Workflow) |
| `context: "fork"` (branch parent session) | Agent `subagent_type: "fork"` inherits parent context | COVERED |
| `context: "fresh"` | Default Agent (general-purpose, fresh) | COVERED |
| Per-agent model/tools/skills frontmatter | `.claude/agents/<name>.md` frontmatter (model, tools, description) | COVERED (mostly) |
| Builtin agents (scout/planner/worker/reviewer) | Native agent types (Explore, Plan, general-purpose) + custom `.claude/agents/` | COVERED via custom defs |
| Run history (JSONL per agent) | NONE | LOST |
| Async/background jobs + `subagent_status` + status.json | `run_in_background` exists for Bash, and Agent isolation:"remote" runs in background, but no general durable async-subagent ledger with status files | PARTIAL / mostly LOST |
| `.chain.md` reusable pipeline files | NONE (Workflow is invoked, not a saved reusable file artifact in the same way) | LOST (re-express as a skill/command) |
| `/run` `/chain` `/parallel` slash UX | NONE built-in (could author slash commands that wrap Agent/Workflow) | LOST (re-author if wanted) |
| Agents Manager TUI (Ctrl+Shift+A) | NONE | LOST |
| Chain artifacts dir, `{chain_dir}` variable | Pass file paths between agents manually | PARTIAL |
| Nesting depth guard | Built into harness (forks don't re-delegate per guidance) | COVERED |
| Skill injection into subagent prompts | Skills available to agents natively | COVERED |

Net: the actual delegation primitives (parallel, chains, fork) are well covered by Task/Agent + Workflow. What is LOST is the management/observability scaffolding: durable async background subagent jobs with status files, run history, the `.chain.md` reusable-pipeline files, and the TUI manager. For BUILD mode specifically, the load-bearing uses are `/build`'s execute-prd delegation and `/review`'s cross-model second opinion — both expressible as a Workflow or a subagent invocation with an explicit model override. Recommend: do not rebuild async jobs or the TUI; re-express any needed pipeline (e.g. scout→plan→build→review) as a Workflow or a skill.

---

## Part D — pi-web-access package

`pi-web-access` (`index.ts` registers `web_search`, `fetch_content`, `get_search_content`; commands `/websearch`, `/search`, `/google-account`) provides: web search (Perplexity → Gemini API → Gemini Web fallback), content extraction to markdown, GitHub-clone-instead-of-scrape, YouTube + local-video understanding via Gemini, video frame extraction (ffmpeg/yt-dlp), PDF text extraction, Jina/Gemini fallbacks for blocked pages, the browser-curator UI, and zero-config auth via Chromium browser cookies.

Mapping:

| pi-web-access capability | Native / MCP | Coverage |
|---|---|---|
| `web_search` (synthesized answer + citations) | WebSearch tool | COVERED (no Perplexity/Gemini synthesis, but search works) |
| `fetch_content` web page → markdown | WebFetch tool | COVERED |
| `fetch_content` PDF → text | WebFetch handles many; PDF-specific extraction may be weaker | PARTIAL |
| Multi-query batch + curate UI | NONE | LOST (loop WebSearch) |
| GitHub repo clone-instead-of-scrape | Bash `git clone` + Read (manual) | PARTIAL (no auto-routing) |
| YouTube video understanding (transcript/visual) | NONE native; would need an MCP server | LOST |
| Local video analysis + frame extraction | NONE native | LOST |
| Zero-config browser-cookie Gemini auth | NONE | LOST |
| `get_search_content` (stored result retrieval) | NONE | LOST (re-fetch) |
| Microsoft Learn / other doc search | `mcp__claude_ai_Microsoft_Learn__*` MCP available | COVERED for MS docs |
| Deep multi-source research | `deep-research` SKILL (fan-out + verify + cite) | COVERED (better, for research) |

Net: for BUILD mode, the only web needs are occasional doc lookups — WebSearch + WebFetch + the `deep-research` skill cover that well. The genuinely-lost capabilities (YouTube/video understanding, GitHub clone routing, browser-cookie zero-config) are not BUILD-mode-critical; drop them unless a specific workflow needs them, in which case an MCP server is the path. Effort to replace BUILD-relevant subset: trivial (use existing tools). Risk: low.

---

## Part E — settings.json

`.pi/settings.json`:
```json
{ "tools": ["read","bash","edit","write","lsp"],
  "agents": {
    "product-manager": { "primary": "anthropic/claude-opus-4-6", "secondary": "openai/gpt-5.3" },
    "orchestrator": { "model": "anthropic/claude-opus-4-6" },
    "reviewer": { "model": "anthropic/claude-sonnet-4-6" },
    "developer": { "model": "anthropic/claude-sonnet-4-6" } },
  "packages": ["npm:pi-subagents","npm:pi-web-access"] }
```

Mapping to `.claude/settings.json`:
- `tools` allowlist → Claude Code tools are on by default; gate dangerous ones via `permissions` (allow/ask/deny) in `.claude/settings.json`. `read/edit/write/bash` are native; `lsp` has no direct equivalent (Claude reads/greps instead). Effort low.
- Per-agent model assignments → set `model:` in each subagent definition frontmatter under `.claude/agents/<role>.md` (one file per role, bodies port from `.pi/agents/*.md`). The dual-model product-manager (primary Opus / secondary GPT for cross-model review) maps to: PM subagent uses the primary; the cross-model "second opinion" in `/review` invokes a subagent or Workflow step with an explicit non-Anthropic model override — note this requires that model to be configured/available in the harness, which may be a gap.
- `packages` → not applicable. Capabilities become native tools (Agent/Workflow/WebSearch/WebFetch) plus MCP servers; there is no package-install layer to port.
- The top-level default model → `.claude/settings.json` `model` field or `/config`.

Effort: low. Risk: medium ONLY for the cross-model secondary (GPT-5.3) — confirm whether a non-Anthropic model can be targeted by a subagent in this harness; if not, `/review`'s cross-model angle degrades to same-family second opinion.

---

## Ranked summary of effort / risk

| Item | Effort | Risk | Note |
|---|---|---|---|
| Port persistence.ts/utils.ts/wrap-checks.ts/execution-progress.ts/release.ts → plan CLI | LARGE | LOW | Pi-free already; tests come along |
| `/plan` + subcommand slash commands wrapping the CLI | MED | LOW | Thin Bash wrappers |
| `/review` `/pre-mortem` `/prd` `/wrap` `/ship` `/release` as skills/commands | MED | LOW | Already skill-delegating; skills exist in `.pi/skills/` |
| `/build` two-path execution + completion detection | MED | MED | Keep PRD ledger; use TodoWrite for todo path |
| agent-memory → CLAUDE.md `@import` | TRIVIAL | NONE | One line |
| settings.json → `.claude/settings.json` + agent frontmatter | LOW | MED | Cross-model secondary is the only real question |
| pi-subagents → Task/Agent + Workflow | LOW | LOW | Delegation covered; mgmt scaffolding dropped |
| pi-web-access → WebSearch/WebFetch/deep-research | TRIVIAL | LOW | Video/GitHub-clone dropped |

### Genuinely cannot be replicated (drop or stub, do not attempt 1:1)
- The footer + todo widget and Ctrl+Alt+P toggle (`widget.ts`, registerShortcut) — no custom-widget/shortcut API. Drop.
- Pi session-entry state restore (`session_start` reconciliation, `loadedFromDisk`) — replaced by stateless explicit-slug design (a simplification, not a loss).
- `[DONE:n]` per-turn marker tracking driving a live widget — replaced by TodoWrite + frontmatter status.
- pi-subagents async background jobs + status.json + run history + Agents Manager TUI + `.chain.md` files. Drop; re-express needed pipelines as Workflows/skills.
- pi-web-access YouTube/local-video understanding, frame extraction, GitHub-clone routing, browser-cookie zero-config, curator UI. Drop; MCP if ever needed.

---

## Ordered task list (this slice)

1. Create the plan CLI: lift `persistence.ts`, `utils.ts`, `wrap-checks.ts`, `execution-progress.ts`, `release.ts` (and their `.test.ts`) into a standalone Node entry (e.g. `arete plan` / `arete release` subcommands). Strip the lone Pi-typed touchpoints; keep frontmatter schema and `migrateStatus` identical for backward compatibility with existing `dev/work/plans/`.
2. Verify the ported tests pass (`npx tsx --test`), confirming byte-identical plan I/O against the current `dev/work/plans/` corpus.
3. Decide and document the stateless-identity model: every command takes an explicit `<slug>` (or "latest building/planned"); delete the `loadedFromDisk`/session-restore concept.
4. Author `.claude/commands/plan.md` dispatching to `arete plan {new|list|open|save|rename|status|delete|archive|promote}`; `open` prints frontmatter+body+git-diff-since into context.
5. Author `.claude/commands/{approve,build,build-status,wrap,release}.md` wrapping the CLI; `build` sets `building` + commits plan dir, then branches PRD vs todo execution (TodoWrite for todo path).
6. Re-home `.pi/skills/{review-plan,run-pre-mortem,plan-to-prd,prd-to-json,execute-prd,ship}` as Claude Code skills; author `.claude/commands/{review,pre-mortem,prd,ship}.md` that set the `has_*` frontmatter flag via CLI then invoke the skill.
7. Port `.pi/agents/{product-manager,reviewer,developer,orchestrator}.md` to `.claude/agents/*.md` with `model:` frontmatter from settings.json; resolve the cross-model-secondary question for `/review`.
8. Add `@memory/collaboration.md` to CLAUDE.md/AGENTS.md (replaces agent-memory extension).
9. Write `.claude/settings.json`: permissions for bash/write/edit, default model; confirm WebSearch/WebFetch availability for the BUILD web subset.
10. Map `/build`'s execute-prd delegation and `/review`'s cross-model step onto the Task/Agent (or Workflow) tool; drop async jobs, the agents TUI, `.chain.md`, and pi-web video/GitHub-clone capabilities (record as explicit non-goals).
