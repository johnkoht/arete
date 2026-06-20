---
title: "BUILD-mode Claude Code port — Skills + System Prompts (research/migration plan)"
slug: build-mode-claude-port-01
status: research
owner_slice: skills + top-level system prompts
date: 2026-06-19
---

# BUILD-mode → Claude Code port: Skills + System Prompts

This is the migration plan for ONE slice of the BUILD-mode port: the 10 build skills under `.pi/skills/`, plus the two top-level system prompts (`.pi/APPEND_SYSTEM.md` and `AGENTS.md`) and `.pi/LEARNINGS-skills.md`. GUIDE mode (product side, `packages/runtime/`) is already ported to Claude Code — this plan mirrors that established pattern. Other slices (plan-mode extension, agent-memory extension, pi-subagents, expertise profiles, agent roles, standards) are owned elsewhere; this plan only flags dependencies on them.

## The established GUIDE→Claude Code pattern (source of truth)

Read directly from the runtime/install code, not inferred:

- **Canonical SKILL.md store is IDE-agnostic.** GUIDE skills live in `packages/runtime/skills/<id>/SKILL.md` and install into the workspace at `.agents/skills/<id>/SKILL.md` (confirmed: `packages/core/src/generators/skill-commands.ts:40` emits `Read and follow the complete workflow in \`.agents/skills/${skill.id}/SKILL.md\``; `packages/core/src/adapters/LEARNINGS.md:34` "preserves `.agents/skills/` (not `.claude/skills/`)"). Note: Claude Code's NATIVE skill dir is `.claude/skills/`, but Areté deliberately does NOT use it for GUIDE — it routes everything through generated slash commands in `.claude/commands/` that point back to `.agents/skills/`. This is the convention to follow for BUILD too.
- **Each skill becomes a thin slash command.** `generateSkillCommand()` (`packages/core/src/generators/skill-commands.ts:13-45`) emits `.claude/commands/<id>.md` whose body is: description line; optional briefing block (if `requiresBriefing`); optional profile line (if `profile`); then `Read and follow the complete workflow in .agents/skills/<id>/SKILL.md`; then `If the user provided context: $ARGUMENTS`. The command is the discovery surface; the SKILL.md is the contract.
- **CLAUDE.md is generated, with a slash-command index.** `generateClaudeMd()` (`packages/core/src/generators/claude-md.ts:29-46`) composes Identity + Workspace Structure + a `## Slash Commands` table (one row per skill, `claude-md.ts:97-116`) + Intelligence Services + Memory + Active Topics + Working Patterns + footer. The "what's available / how to work" system prompt for the product install lives HERE, not in an output-style.
- **Frontmatter fields actually consumed by Claude Code:** `id`/`name`, `description`, `requiresBriefing` (→ briefing bash block), `profile` (→ "adopt the voice in `.agents/profiles/<profile>.md`"). See `skill-commands.ts:16-42`. Everything else (`category`, `work_type`, `triggers`, `primitives`) is metadata that does NOT change generated output — `triggers` are NOT consumed by Claude Code (Claude Code matches on the Skill-tool `description`; `arete skill route` is the keyword router). `profile:` is NOT a Pi subagent-routing construct on the Claude side — it resolves to a profile markdown the agent reads (`claude-md.ts:171-174`). Keep these fields for `arete skill route`/registry parity but know they're inert at the Claude command layer.
- **Rules: `.cursor/*.mdc` → `.claude/rules/*.md`.** `ClaudeAdapter.transformRuleContent` (`packages/core/src/adapters/claude-adapter.ts:71-76`) rewrites `.cursor/skills/`→`.agents/skills/`, `.cursor/`→`.claude/`, `.mdc`→`.md`. `formatRule` (`claude-adapter.ts:47-69`) keeps `description` + `globs` frontmatter. Rules land in `.claude/rules/` (`getIDEDirs`, `claude-adapter.ts:20-29`).
- **The repo's OWN dev (.claude) is bare.** Today `/Users/john/code/arete/CLAUDE.md` is a 1-line stub pointing at `AGENTS.md`; there is no `.claude/skills`, no `.claude/commands`, no output-styles. `AGENTS.md` (11k) is the live BUILD system prompt. So the BUILD port writes NEW `.claude/commands/*.md` + `.claude/rules/*.md` and expands `CLAUDE.md`.

### Two viable target shapes for BUILD skills (pick one in the planning slice)

1. **Mirror GUIDE exactly (recommended):** keep SKILL.md bodies in `.pi/skills/<id>/SKILL.md` (or relocate the canonical store; see open question), and add hand-written `.claude/commands/<id>.md` wrappers that read them. Pro: matches the proven product pattern; SKILL.md stays the single contract (`LEARNINGS-skills.md:61` "SKILL.md is the contract"). Con: BUILD skills are not driven by `arete install` (they're repo-dev assets), so the wrappers are hand-authored, not generated — they won't auto-regenerate.
2. **Native Claude Code skills:** move each into `.claude/skills/<id>/SKILL.md` with Claude-Code-native frontmatter (just `name` + `description`) and let the Skill tool auto-discover. Pro: zero wrapper plumbing, `/name` works natively. Con: diverges from the GUIDE convention; loses the `.agents/profiles` + briefing wrapper behavior; mixes BUILD skills into the same `.claude/skills` namespace Claude scans.

This plan assumes **shape 1** for parity, and notes per-skill where shape 2 would be simpler. Decide globally before executing.

---

## Per-skill migration

For each: target form, frontmatter changes, Pi-specific constructs to rewrite, effort/risk. "Pi-specific" = constructs that do not exist or behave differently under Claude Code.

### 1. `audit` — effort: HIGH, risk: MED

- **Source:** `.pi/skills/audit/{SKILL.md, orchestrator.md, manifest.yaml, templates/audit-report.md}` + `audit/LEARNINGS.md`.
- **Target:** `.claude/commands/audit.md` wrapper → SKILL.md (keep orchestrator.md, manifest.yaml, templates/ alongside). Slash command takes `--scope`/`--dry-run` args via `$ARGUMENTS`.
- **Frontmatter:** has `name, description, category, work_type, primitives:[], requires_briefing:false`. For Claude: keep `name`+`description`; `requires_briefing:false` is correct (no briefing block emitted). Drop/ignore `primitives`, `category`, `work_type` at the command layer.
- **Pi-specific rewrites:**
  - `subagent` tool dispatch (SKILL.md:52-67, orchestrator.md:51-108) → Claude Code `Agent` tool / Task subagents. The "Pre-Flight Check: subagent tool available?" (SKILL.md:29-42) and single-agent fallback must be rephrased for Claude's Agent tool, which is always available — the fallback branch can be simplified/dropped. **DEPENDS ON pi-subagents slice** for the canonical replacement idiom.
  - `developer`/expertise-profile injection (`.pi/expertise/{domain}/PROFILE.md`) — **DEPENDS ON expertise-profiles + agent-roles slices.** Paths `.pi/expertise/...` need rewriting to wherever those land.
  - orchestrator.md contains TypeScript pseudo-code (`fs.readFileSync`, `yaml.parse`, Handlebars rendering at orchestrator.md:219-233) presented as if executable — under Claude Code these are instructions the agent performs with Read/Write/Bash, not a runtime. Reframe as agent steps.
  - Path refs: `.pi/skills/`, `.pi/expertise/`, `dev/catalog/capabilities.json` (last is fine), `packages/runtime/skills/` audit domain (still valid).
- **Notes:** Cross-cutting orchestrator (chains experts) — keep multi-file structure per `LEARNINGS-skills.md:9-24`.

### 2. `execute-prd` — effort: HIGH, risk: HIGH

- **Source:** `.pi/skills/execute-prd/{SKILL.md, LEARNINGS.md}` (large, 709 lines).
- **Target:** `.claude/commands/build.md` (the skill is invoked as `/build`, SKILL.md:13) → SKILL.md. Keep SKILL.md as contract.
- **Frontmatter:** keep `name`+`description`; `requires_briefing:false` correct (it self-gathers context, `LEARNINGS-skills.md:55`). Drop `primitives`.
- **Pi-specific rewrites (the heavy lift):**
  - **Heavy `subagent({agent, task, agentScope})` usage** throughout (SKILL.md:280-336, 300-308) for developer + reviewer roles → Claude `Agent`/Task tool. Roles `developer`/`reviewer` come from `.pi/agents/{role}.md`. **DEPENDS ON agent-roles + pi-subagents slices.**
  - Mandatory pre-flight "subagent tool unavailable → HALT" (SKILL.md:18-24) — under Claude the Agent tool is always present; rewrite to remove the HALT/fallback or repoint at Claude's Agent availability.
  - `.pi/standards/subagent-dispatch.md`, `.pi/standards/pre-mortem-categories.md`, `.pi/standards/maintenance.md`, `.pi/standards/learnings-protocol.md`, `.pi/agents/reviewer.md`, `.pi/agents/developer.md`, `.pi/expertise/{area}/PROFILE.md` — all `.pi/` refs need rewriting once the standards/roles/expertise slices land. **DEPENDS ON standards + agent-roles + expertise slices.**
  - `[DONE:N]` completion marker (SKILL.md:368, 539) "updates the plan-mode widget checklist" — **DEPENDS ON plan-mode extension slice.** Claude Code has no plan-mode widget; either drop the marker or repoint to a TodoWrite-style tracker.
  - Execution-state paths `dev/executions/{slug}/` are workspace-relative and fine.
- **Notes:** This is the largest, most subagent-dependent skill; cannot be fully ported until pi-subagents + agent-roles are resolved. Port the SKILL.md body verbatim first (path rewrites only), then swap dispatch idioms in a follow-up.

### 3. `hotfix` — effort: LOW, risk: LOW

- **Source:** `.pi/skills/hotfix/SKILL.md` (single file).
- **Target:** `.claude/commands/hotfix.md` → SKILL.md. Good candidate for native `.claude/skills/hotfix/` (shape 2) since single-file and trigger-driven.
- **Frontmatter:** uniquely has a `triggers:` list (SKILL.md:6-15) — inert at the Claude command layer but useful for `arete skill route`; keep. No `requires_briefing` (defaults false). Keep `name`+`description`.
- **Pi-specific rewrites:**
  - Optional `subagent({agent:"reviewer"})` for review (SKILL.md:109-126) with a self-review fallback already present (SKILL.md:131-141) — the fallback is the natural Claude path; the subagent branch can become "spawn a review Agent (optional)". **Soft dep on agent-roles/pi-subagents** but works standalone via self-review.
  - `.pi/expertise/{domain}/PROFILE.md`, `.pi/agents/reviewer.md`, `.pi/standards/{learnings-protocol,maintenance,build-standards}.md` refs → rewrite paths when those slices land.
- **Notes:** Routing note in APPEND_SYSTEM.md ("user reports a bug → load hotfix") must move to CLAUDE.md.

### 4. `plan-to-prd` — effort: LOW, risk: LOW

- **Source:** `.pi/skills/plan-to-prd/SKILL.md`.
- **Target:** `.claude/commands/plan-to-prd.md` → SKILL.md.
- **Frontmatter:** `name, description, category, work_type`. Keep `name`+`description`.
- **Pi-specific rewrites:**
  - EXECUTE.md handoff template embeds Pi plan-mode commands `/plan open {slug}` + `/build` (SKILL.md:97-104). **DEPENDS ON plan-mode extension slice** for the Claude equivalent; rewrite the "Pi (preferred)" block. The manual fallback referencing `.pi/skills/execute-prd/SKILL.md` → rewrite to ported path.
  - References `dev/work/archive/.../prd.md`, `dev/autonomous/schema.ts` — fine (workspace-relative).
  - "You are in BUILDER mode" (SKILL.md:23) — soften; under Claude the BUILD context is implied by repo + CLAUDE.md.
- **Notes:** Schema for prd.json is self-contained — no subagent dep.

### 5. `prd-to-json` — effort: LOW, risk: LOW

- **Source:** `.pi/skills/prd-to-json/SKILL.md`.
- **Target:** `.claude/commands/prd-to-json.md` → SKILL.md.
- **Frontmatter:** `name, description, category, work_type, primitives:[], requires_briefing:false`. Keep `name`+`description`; drop `primitives`.
- **Pi-specific rewrites:** none structural. Only path ref to `.pi/skills/plan-to-prd/SKILL.md` (SKILL.md:80) → rewrite. References `dev/autonomous/schema.ts` fine.
- **Notes:** Pure transform skill; cleanest port. Consider whether prd-to-json + plan-to-prd should both stay or whether prd-to-json folds into plan-to-prd (it's a recovery/standalone path per its own description) — keep separate for parity.

### 6. `prd-post-mortem` — effort: LOW-MED, risk: LOW

- **Source:** `.pi/skills/prd-post-mortem/SKILL.md`.
- **Target:** `.claude/commands/prd-post-mortem.md` → SKILL.md.
- **Frontmatter:** `name, description, category, work_type:analysis, primitives:[], requires_briefing:false`. Keep `name`+`description`; drop `primitives`.
- **Pi-specific rewrites:**
  - Step 9 auto-runs the `synthesize-collaboration-profile` skill (SKILL.md:140-142) via path `.pi/skills/synthesize-collaboration-profile/SKILL.md` → rewrite to ported path / `/synthesize-collaboration-profile` command invocation.
  - References execution-state paths (`dev/executions/{slug}/`) — fine.
- **Notes:** No subagent dependency; reads artifacts + writes memory. Cross-skill invocation (calls synthesize-collaboration-profile) means port that one in the same batch.

### 7. `review-plan` — effort: MED, risk: LOW

- **Source:** `.pi/skills/review-plan/{SKILL.md, LEARNINGS.md}` (440 lines). **Has a GUIDE twin** at `packages/runtime/skills/review-plan/SKILL.md` — use it as the format reference.
- **Target:** `.claude/commands/review-plan.md` → SKILL.md.
- **Frontmatter:** BUILD has `name, description, category, work_type`. GUIDE twin (the porting reference) uses `name, description, triggers:[], work_type:review, category:essential, profile:plan-reviewer, requires_briefing:true` (runtime review-plan SKILL.md:1-15). The BUILD version is the heavier internal-tooling variant (AC rubric, expertise profiles, recommended_track) and should stay BUILD-specific — do NOT collapse into the GUIDE twin. For Claude: keep `name`+`description`; optionally add `profile:` if a build plan-reviewer profile exists (**dep on expertise/profiles slice**).
- **Pi-specific rewrites:**
  - `save_plan_artifact(filename, content)` tool (SKILL.md:396-402) — Pi plan-mode tool. **DEPENDS ON plan-mode extension slice.** Replace with explicit `Write` to `dev/work/plans/{slug}/review.md`.
  - Path refs: `.pi/standards/ac-rubric.md`, `.pi/standards/pre-mortem-categories.md`, `.pi/standards/build-standards.md`, `.pi/expertise/{domain}/PROFILE.md`, `.pi/agents/reviewer.md`, `.pi/skills/LEARNINGS.md`, `.pi/skills/run-pre-mortem/SKILL.md`, `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md` → rewrite to ported paths.
  - "Before `/approve`" + `recommended_track` feed plan-mode lifecycle — note the coupling (**dep on plan-mode slice**), but the review logic itself is self-contained.
- **Notes:** The GUIDE twin proves the adaptation pattern (drop the build-only sections, add `profile`/`requires_briefing`). Keep BUILD version full-fat.

### 8. `run-pre-mortem` — effort: LOW, risk: LOW

- **Source:** `.pi/skills/run-pre-mortem/SKILL.md`. **Has a GUIDE twin** at `packages/runtime/skills/pre-mortem/SKILL.md` (note name differs: BUILD `run-pre-mortem` vs GUIDE `pre-mortem`).
- **Target:** `.claude/commands/run-pre-mortem.md` → SKILL.md. (Keep the `run-` prefix to avoid colliding with any product `pre-mortem` if both ever coexist in one namespace.)
- **Frontmatter:** BUILD `name, description, category, work_type`. GUIDE twin uses `name:pre-mortem, ..., profile:pm-advisor, requires_briefing:false` (runtime pre-mortem SKILL.md:1-13). Keep BUILD `name`+`description`; the BUILD version uses 11 ENGINEERING risk categories (`.pi/standards/pre-mortem-categories.md`) vs GUIDE's 8 PM categories — keep distinct.
- **Pi-specific rewrites:**
  - `save_plan_artifact` tool (SKILL.md:74-80) — **DEPENDS ON plan-mode slice.** Replace with `Write` to `dev/work/plans/{slug}/pre-mortem.md`.
  - Path refs: `.pi/standards/pre-mortem-categories.md`, `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`, `.pi/skills/execute-prd/SKILL.md` → rewrite.
- **Notes:** Logic self-contained; only the save mechanism and standards path are Pi-coupled.

### 9. `ship` — effort: HIGH, risk: HIGH

- **Source:** `.pi/skills/ship/{SKILL.md, orchestrator.md, multi-phase-protocol.md, build-log-protocol.md, LEARNINGS.md, templates/{build-log.md, ship-report.md}}`. Meta-orchestrator (406-line SKILL.md) chaining pre-mortem → review → plan-to-prd → execute-prd → wrap → gitboss.
- **Target:** `.claude/commands/ship.md` → SKILL.md; keep the supporting `.md` files alongside.
- **Frontmatter:** `name, description, category, work_type, primitives:[], requires_briefing:false`. Keep `name`+`description`; drop `primitives`.
- **Pi-specific rewrites (largest surface):**
  - Chains other skills via `/pre-mortem`, `/review-plan`, `/plan-to-prd`, `/build`, `/wrap` (SKILL.md:132-185) — these become the ported `.claude/commands/*` invocations; verify each chained command exists post-port. `/wrap` is a BUILD skill NOT in this slice's 10 — confirm it's covered by another slice (it appears as a Pi plan-lifecycle command in APPEND_SYSTEM.md:121; **flag: `/wrap` ownership**).
  - **Worktree extension `@zenobius/pi-worktrees`** (Prerequisites SKILL.md:31; `/worktree create|remove` SKILL.md:173, 340; Phase 3) — **DEPENDS ON worktree slice / Claude Code worktree support.** Claude Code has native `EnterWorktree`/`ExitWorktree` + `isolation:"worktree"` on Agent. Rewrite `/worktree` commands and the Worktree Guard bash (SKILL.md:36-45) to the Claude idiom.
  - `subagent({agent:"orchestrator"|"gitboss"|"reviewer"})` dispatch (SKILL.md:199-211, 307-321; multi-phase-protocol.md:56-97; orchestrator.md) → Claude Agent/Task. **DEPENDS ON agent-roles (orchestrator, gitboss, reviewer) + pi-subagents slices.** `gitboss` merge-gate is its own role.
  - Plan-mode coupling: pre-flight reads plan frontmatter `status: approved`, `has_pre_mortem`, etc. (SKILL.md:51-60); `/plan save` (SKILL.md:129); `/approve` (When to Use SKILL.md:19). **DEPENDS ON plan-mode extension slice.**
  - `.pi/standards/{subagent-dispatch,learnings-protocol}.md`, template path `.pi/skills/ship/templates/build-log.md` (build-log-protocol.md:40) → rewrite. The `sed -i ''` template-fill bash (build-log-protocol.md:42-46) is macOS-specific but fine.
  - orchestrator.md `ShipState` TypeScript interface (orchestrator.md:208-233) is illustrative, not runtime — keep as doc.
- **Notes:** Port last. It's the integration point for every other slice (worktree, subagents, roles, plan-mode). Until those land, ship is mostly a path-rewrite + documentation exercise that won't actually run.

### 10. `synthesize-collaboration-profile` — effort: LOW, risk: LOW

- **Source:** `.pi/skills/synthesize-collaboration-profile/SKILL.md`.
- **Target:** `.claude/commands/synthesize-collaboration-profile.md` → SKILL.md.
- **Frontmatter:** `name, description, category, work_type:synthesis, primitives:[], requires_briefing:false`. Keep `name`+`description`; drop `primitives`.
- **Pi-specific rewrites:**
  - "How This Is Triggered" table (SKILL.md:132-139) references `AGENTS.md [Memory] section` — repoint to CLAUDE.md once AGENTS content moves.
  - Reads/writes `memory/MEMORY.md`, `memory/collaboration.md`, `memory/entries/` — workspace-relative, fine. Note: BUILD memory is at `memory/` root (per AGENTS.md:22), distinct from GUIDE's `.arete/memory/` — keep BUILD paths.
- **Notes:** No subagent/plan-mode dep. Cleanest of the memory skills. Port alongside prd-post-mortem (which calls it).

### Per-skill summary table

| Skill | Target command | Effort | Risk | Hard deps on other slices |
|-------|---------------|--------|------|---------------------------|
| audit | `/audit` | HIGH | MED | pi-subagents, expertise, agent-roles |
| execute-prd | `/build` | HIGH | HIGH | pi-subagents, agent-roles, standards, plan-mode (`[DONE:N]`) |
| hotfix | `/hotfix` | LOW | LOW | (soft) agent-roles, standards, expertise |
| plan-to-prd | `/plan-to-prd` | LOW | LOW | plan-mode (EXECUTE.md handoff) |
| prd-to-json | `/prd-to-json` | LOW | LOW | none |
| prd-post-mortem | `/prd-post-mortem` | LOW-MED | LOW | (calls synthesize-collaboration-profile) |
| review-plan | `/review-plan` | MED | LOW | plan-mode (`save_plan_artifact`), expertise/profiles, standards |
| run-pre-mortem | `/run-pre-mortem` | LOW | LOW | plan-mode (`save_plan_artifact`), standards |
| ship | `/ship` | HIGH | HIGH | worktree, pi-subagents, agent-roles, plan-mode, standards, `/wrap` |
| synthesize-collaboration-profile | `/synthesize-collaboration-profile` | LOW | LOW | none |

---

## APPEND_SYSTEM.md + AGENTS.md → CLAUDE.md / rules

Both BUILD system prompts are currently loaded via Pi's `APPEND_SYSTEM.md` (how-to-work) + `AGENTS.md` (what's-available) mechanism. CLAUDE.md is the Claude Code analogue of both, with selected pieces split into `.claude/rules/*.md`.

### What becomes CLAUDE.md content

CLAUDE.md is the loaded-every-turn system prompt. It should absorb the durable "identity + what's available + how to work" content. Source mapping:

- **From AGENTS.md:** `[Identity]` (lines 8-13), `[Vision]` (15-17), `[Workspace]` (19-22 — BUILD vs USER, `memory/` at root), `[Skills]` index (38-48 — but now expressed as a slash-command table per the GUIDE generator, `claude-md.ts:97-116`), `[Memory]` (50-54), `[Build Principles]` (56-65 — the high-signal mindset: plan_first, verify_before_done, definition_of_done, isolation_gate, read_before_asserting), `[CLI]` (67-107 — the `arete` command reference; keep largely verbatim, it's the tool surface). The `[Expertise]`/`[Roles]` sections (24-37) reference `.pi/expertise` + `.pi/agents` — keep as pointers but note paths depend on those slices.
- **From APPEND_SYSTEM.md:** `## Routing` (8-22), `## Execution Path Decision Tree` (49-73), `## Branch & Isolation Protocol` (77-93 — the never-checkout-in-main rule is load-bearing per user memory), `## Direct Execution Protocol` (96-102), `## LEARNINGS.md Rules` (40-46), `## Skill and Rule Changes` checklist (139-145). These are "how to work" and belong in CLAUDE.md prose.

CLAUDE.md today is a 1-line stub (`CLAUDE.md:1`). The port REPLACES it with the composed content above. Keep it hand-authored for BUILD (unlike GUIDE's generated CLAUDE.md) since BUILD is not `arete install`-driven — OR optionally extend the generator to emit a build variant (larger effort; out of scope for this slice).

### What becomes a Claude Code rule (`.claude/rules/*.md`)

Glob-scoped, path-triggered guidance is a better fit for rules than the always-on CLAUDE.md. Candidates (mirror `packages/runtime/rules/claude-code/*.mdc` format: `description` + `globs` frontmatter, body markdown):

- **`.claude/rules/learnings.md`** (globs: `**/LEARNINGS.md` or broad) — the LEARNINGS.md protocol (APPEND_SYSTEM.md:40-46). Parallels GUIDE's `agent-memory.mdc`.
- **`.claude/rules/skill-and-rule-changes.md`** (globs: `.pi/**`, `.claude/**`, `dev/**`) — the audience/cross-ref/catalog checklist (APPEND_SYSTEM.md:139-145).
- **`.claude/rules/branch-isolation.md`** (broad glob) — could be a rule OR stay in CLAUDE.md; given its load-bearing status (user memory: "never switch branches in main repo"), keep it in CLAUDE.md AND optionally a rule for redundancy.

Note: `packages/runtime/rules/claude-code/` has 3 product rules (agent-memory, context-management, project-management) — none are BUILD rules, so BUILD rules are net-new. There are also Pi/cursor BUILD rules to check (`.pi/extensions/.../*.mdc`, `.pi/standards/`) — those belong to the standards/plan-mode slices, not here.

### What is Pi-mechanism-specific and gets dropped or reframed

- **`## Composition: 4-Layer Subagent Context Stack`** (APPEND_SYSTEM.md:25-37) — Pi's manual context-injection model (attach AGENTS.md + build-standards.md + role.md + PROFILE.md to each subagent). Claude Code subagents inherit context differently (Agent tool prompt + auto-loaded CLAUDE.md/rules). Reframe as "when spawning an Agent, include the relevant standards/profile in the prompt" — **coordinate with pi-subagents + agent-roles slices.**
- **`## Plan Lifecycle Commands` table** (APPEND_SYSTEM.md:106-124) — `/plan`, `/review`, `/pre-mortem`, `/prd`, `/approve`, `/build`, `/wrap` and the `idea→draft→planned→building→complete` lifecycle are the Pi plan-mode extension. **DEPENDS ON plan-mode extension slice** — drop from CLAUDE.md until that slice defines the Claude equivalent; the skill slash-commands that exist post-port (`/run-pre-mortem`, `/review-plan`, `/plan-to-prd`, `/build`, `/ship`) can be listed, but `/plan`, `/approve`, `/wrap` are owned elsewhere.
- **`## Personas Council`** block (APPEND_SYSTEM.md:128-136) using the `|key:value` Pi macro syntax + `dev/personas/` refs — reframe as plain markdown; verify `dev/personas/PERSONA_COUNCIL.md` still exists. Low priority.
- **The `|key:value` "magic" syntax** used throughout AGENTS.md (`[Identity]|...`, `|think_first:...`) is a Pi prompt-compression convention. Rewrite to normal markdown prose/bullets for Claude Code (Claude doesn't parse the macro form specially).
- **`.agents/sources/` + `npm run build:agents:dev`** (AGENTS.md is built from `.agents/sources/`, per execute-prd SKILL.md:395) — AGENTS.md is a GENERATED file. The Claude port should decide whether CLAUDE.md is hand-authored or also generated from `.agents/sources/`. **Flag for planning slice** — affects whether edits go to sources or to CLAUDE.md directly.

### Reference rewrites (`.pi/` → ported locations)

Every skill and system prompt references `.pi/` paths that must be rewritten. The destinations depend on where the other slices land their assets. Catalog of distinct `.pi/` reference targets found across the 10 skills + 2 prompts:

- `.pi/skills/<skill>/SKILL.md` → ported skill location (this slice). If canonical store stays `.pi/skills/`, these are stable; if it moves (e.g. to `.agents/skills/` for GUIDE parity), update all cross-refs.
- `.pi/expertise/{core,cli,backend,web}/PROFILE.md` → **expertise slice.**
- `.pi/agents/{orchestrator,reviewer,developer,product-manager,gitboss}.md` → **agent-roles slice.**
- `.pi/standards/{build-standards,maintenance,learnings-protocol,subagent-dispatch,pre-mortem-categories,ac-rubric}.md` → **standards slice.**
- `.pi/extensions/plan-mode/` → **plan-mode slice.**
- `.pi/LEARNINGS-skills.md` and per-skill `LEARNINGS.md` → keep colocated with the canonical skill store; rewrite the internal location refs (e.g. `LEARNINGS-skills.md:32-38` gitignore exceptions for `.pi/skills/*/templates/` must point at the new templates path).
- `memory/`, `dev/`, `dev/catalog/capabilities.json`, `dev/autonomous/`, `dev/work/`, `dev/executions/` → workspace-relative, NO rewrite needed (BUILD keeps `memory/` at root).

---

## Cross-slice dependency flags (owned elsewhere — do not build here)

- **plan-mode extension:** `save_plan_artifact` tool (review-plan, run-pre-mortem), `[DONE:N]` widget marker (execute-prd), plan frontmatter status gates + `/plan`/`/approve`/`/wrap` lifecycle (ship, APPEND_SYSTEM). This slice rewrites the *call sites* but the *replacement mechanism* is the plan-mode slice's deliverable.
- **agent-memory extension:** the LEARNINGS.md + memory-entry protocol is referenced everywhere; this slice surfaces it in CLAUDE.md/rules but the extension behavior is owned by the agent-memory slice.
- **pi-subagents:** the `subagent({agent, task, agentScope})` idiom (audit, execute-prd, hotfix, ship) → Claude `Agent`/Task. This slice marks every call site; the canonical replacement idiom is the pi-subagents slice's deliverable.
- **agent-roles:** `.pi/agents/{role}.md` (developer, reviewer, orchestrator, gitboss, product-manager).
- **expertise profiles:** `.pi/expertise/{domain}/PROFILE.md`.
- **standards:** `.pi/standards/*.md`.
- **worktree:** `@zenobius/pi-worktrees` + `/worktree` commands (ship) → Claude native worktree (`EnterWorktree`/`isolation:"worktree"`).
- **`/wrap` skill:** referenced by ship + APPEND_SYSTEM lifecycle but NOT among this slice's 10 skills — confirm ownership.
- **`.pi/settings.json` model routing** (`agents.{role}.model` mapping to anthropic/openai models) → Claude Code agent-definition `model` frontmatter; owned by agent-roles/config slice. This slice does not port model routing.

---

## Ordered task list (this slice)

1. **Decide global skill target shape** (mirror-GUIDE wrappers in `.claude/commands/` + `.pi/skills/` canonical store, vs native `.claude/skills/`). Default: mirror-GUIDE. Also decide: is the canonical SKILL.md store staying at `.pi/skills/` or relocating to `.agents/skills/` for full GUIDE parity? (Blocks every command-wrapper path.)
2. **Decide CLAUDE.md authoring model** (hand-authored vs generated from `.agents/sources/`). (Blocks the system-prompt port.)
3. **Port the 4 zero/low-dep skills first** (no subagent/plan-mode coupling): `prd-to-json`, `synthesize-collaboration-profile`, `prd-post-mortem`, `plan-to-prd`. For each: copy SKILL.md into the chosen store with path rewrites, write `.claude/commands/<id>.md` wrapper, fix internal `.pi/` cross-refs that point within this slice. (plan-to-prd's EXECUTE.md block is the only plan-mode touch — stub it pending plan-mode slice.)
4. **Port `hotfix`** — single-file, self-review fallback path works standalone; mark the optional reviewer-Agent dispatch as a pi-subagents TODO.
5. **Port `run-pre-mortem` + `review-plan`** — replace `save_plan_artifact` with explicit `Write` to `dev/work/plans/{slug}/{pre-mortem,review}.md`; fix standards/expertise path refs as TODOs against those slices. Use the GUIDE twins as format references but keep the BUILD-full variants.
6. **Port `audit`** — port SKILL.md + orchestrator.md + manifest.yaml + template with path rewrites; reframe the `subagent`/TypeScript-pseudocode dispatch as Claude Agent steps (mark pi-subagents + expertise deps). Simplify the "subagent unavailable" fallback (Claude Agent is always available).
7. **Port `execute-prd` (`/build`)** — port the SKILL.md body verbatim with `.pi/` path rewrites; leave dispatch idioms as clearly-marked TODOs blocked on pi-subagents + agent-roles; drop or restub `[DONE:N]` pending plan-mode.
8. **Port `ship`** LAST — port SKILL.md + the 4 supporting `.md` + 2 templates with path rewrites; mark worktree, subagent, gitboss, plan-mode couplings as blocked TODOs. Ship won't run end-to-end until those slices land; deliver it as documented-but-gated.
9. **Author CLAUDE.md** — compose from AGENTS.md (Identity/Vision/Workspace/Build Principles/CLI) + APPEND_SYSTEM.md (Routing/Execution Tree/Branch Isolation/Direct Execution/LEARNINGS rules/Skill-Rule-Changes), rewriting `|key:value` macro syntax to plain markdown and `.pi/` paths to ported locations. Replace the 1-line stub. Emit a `## Slash Commands` table for the ported skills. Drop plan-mode lifecycle commands (owned by plan-mode slice) and the 4-Layer Composition stack (owned by pi-subagents).
10. **Author BUILD rules** in `.claude/rules/` — `learnings.md` and `skill-and-rule-changes.md` (mirror `packages/runtime/rules/claude-code/*.mdc` frontmatter format: `description` + `globs`). Keep branch-isolation in CLAUDE.md (load-bearing).
11. **Port `.pi/LEARNINGS-skills.md`** — relocate alongside the chosen skill store; update the gitignore-exception guidance and the AGENTS.md→CLAUDE.md cross-ref.
12. **Cross-reference sweep** — after all ports, grep the ported `.claude/` + `CLAUDE.md` for residual `.pi/`, `subagent(`, `save_plan_artifact`, `/plan `, `/approve`, `/worktree`, `[DONE:`, `@zenobius` and confirm each is either rewritten or an explicitly-flagged cross-slice TODO. Verify every `/command` referenced in `ship` resolves to a ported command or a flagged dep.

---

## Executive summary (15 lines)

1. The established GUIDE→Claude pattern is: keep SKILL.md as the contract in an IDE-agnostic store (`.agents/skills/` for product), and generate a thin `.claude/commands/<id>.md` wrapper that says "read and follow SKILL.md" — confirmed in `packages/core/src/generators/skill-commands.ts` and `claude-md.ts`.
2. Claude Code consumes only `description`, `requiresBriefing`, and `profile` from skill frontmatter; `triggers`, `category`, `work_type`, `primitives` are inert at the command layer (kept only for `arete skill route`).
3. The BUILD side's `.claude/` is currently bare (CLAUDE.md is a 1-line stub; no commands/skills/output-styles) — the port writes net-new files.
4. Recommended target: mirror GUIDE — hand-authored `.claude/commands/*.md` wrappers (BUILD isn't `arete install`-driven, so no generator) over the existing `.pi/skills/` SKILL.md bodies.
5. Four skills are clean low-risk ports with zero cross-slice deps: `prd-to-json`, `synthesize-collaboration-profile`, `prd-post-mortem`, `plan-to-prd` (one plan-mode touch).
6. `hotfix`, `run-pre-mortem`, `review-plan` are LOW-MED: their only Pi couplings are `save_plan_artifact` (→ plain `Write`) and `.pi/standards`/`.pi/expertise` path refs.
7. `review-plan` and `run-pre-mortem` have GUIDE twins (`packages/runtime/skills/review-plan`, `.../pre-mortem`) that prove the adaptation; keep the heavier BUILD variants distinct (engineering risk categories, AC rubric, recommended_track).
8. `audit`, `execute-prd`, `ship` are HIGH effort/risk because they lean on the `subagent({agent,task,agentScope})` idiom and Pi-specific roles/standards.
9. `ship` is the riskiest: it depends on the worktree extension (`@zenobius/pi-worktrees`, `/worktree`), gitboss/orchestrator/reviewer subagents, AND the plan-mode lifecycle — port it last as documented-but-gated.
10. Cross-slice dependencies to flag (owned elsewhere): plan-mode extension (`save_plan_artifact`, `[DONE:N]`, `/plan`/`/approve`/`/wrap`, plan frontmatter gates), pi-subagents, agent-roles, expertise profiles, standards, worktree, `.pi/settings.json` model routing.
11. The `/wrap` skill (chained by ship, listed in the lifecycle) is NOT among this slice's 10 — confirm its ownership.
12. System prompts: AGENTS.md (what's-available) + APPEND_SYSTEM.md (how-to-work) both collapse into a hand-authored CLAUDE.md, with the `|key:value` Pi macro syntax rewritten to plain markdown.
13. Split into rules (`.claude/rules/*.md`, `description`+`globs` frontmatter like the product `.mdc`s): the LEARNINGS.md protocol and the skill/rule-change checklist; keep branch-isolation in CLAUDE.md (load-bearing per user memory).
14. Drop from CLAUDE.md (owned by other slices): the 4-Layer Composition stack (pi-subagents) and the Plan Lifecycle Commands table (plan-mode); AGENTS.md being generated from `.agents/sources/` raises an open question — hand-author CLAUDE.md vs extend the generator.
15. Two blocking decisions gate the whole slice: (a) skill target shape + canonical store location, (b) CLAUDE.md hand-authored vs generated — resolve both before porting; then proceed low-dep → high-dep, ship last, ending with a `.pi/`/`subagent(`/`save_plan_artifact` residual-reference sweep.
