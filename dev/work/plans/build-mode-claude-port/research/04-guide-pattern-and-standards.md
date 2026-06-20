# 04 — GUIDE→Claude-Code Porting Pattern + BUILD Standards Port

> Slice owner: GUIDE port reference + BUILD `.pi/standards/` port plan.
> Sibling slice note: `subagent-dispatch.md` is primarily owned by the agents/expertise slice — only the overlap is flagged here.

---

## Executive Summary (15 lines)

1. GUIDE mode was ported to Claude Code through the `arete install --ide claude` command path, NOT by committing `.claude/` files into the source repo. The mechanism is the thing a BUILD port could mirror — but BUILD mode is the source repo itself, so the answer differs (see #14).
2. The runtime ships ONE canonical content tree (`packages/runtime/`) and an IDE adapter layer transforms it per target. `getAdapter('claude')` → `ClaudeAdapter`; `getAdapter('cursor')` → `CursorAdapter` (`packages/core/src/adapters/`).
3. Product rules live in `packages/runtime/rules/` split into `cursor/` (7 rules, canonical content) and `claude-code/` (3 rules, a deliberate SUBSET). Both use `.mdc` at commit time.
4. Claude gets only `agent-memory.mdc`, `context-management.mdc`, `project-management.mdc`; the other 4 (vision, routing-mandatory, qmd-search, pm-workspace) are folded into a generated `CLAUDE.md` (`packages/core/src/workspace-structure.ts:54-60`, `getProductRulesAllowList`).
5. At install, `workspace.ts:671-691` copies allow-listed rules, renames `.mdc`→`.md` (`adapter.ruleExtension`), and runs `adapter.transformRuleContent()` (`.cursor/skills/`→`.agents/skills/`, `.cursor/`→`.claude/`, `.mdc`→`.md`; `claude-adapter.ts:71-75`).
6. CLAUDE.md is GENERATED, not copied: `generateClaudeMd(config, skills, memory)` (`packages/core/src/generators/claude-md.ts`) is invoked via `adapter.generateRootFiles()` during install (`workspace.ts:513-525`). It is a pure, byte-deterministic function and is also regenerated on `arete update` and after memory ingest (Active Topics boot context).
7. Skills are IDE-AGNOSTIC: one source tree `packages/runtime/skills/*/SKILL.md` installs to `.arete/skills/` (managed, refreshed on update) for both IDEs; user forks live in `.agents/skills/` (`workspace.ts:194-195, 268-302`).
8. Claude Code also gets slash commands: `adapter.generateCommands(skills)` writes `.claude/commands/*.md` (`workspace.ts:527-535`, `claude-adapter.ts:112`). Cursor has no `generateCommands`.
9. SKILL.md frontmatter fields in production: `name`, `description`, `triggers[]`, `work_type`, `category`, `intelligence[]`, plus optional `profile`, `requires_briefing` (see `daily-winddown` and `pre-mortem`).
10. The full porting rationale is already documented in `packages/runtime/rules/LEARNINGS.md` — it is the single best reference for this slice and the consolidating planner should treat it as authoritative.
11. PRODUCT rules (`packages/runtime/rules/`, end-user PM agents) and BUILD rules (`.cursor/rules/*.mdc`, Areté contributors) are different audiences and must never be conflated (`rules/LEARNINGS.md` L24).
12. The current BUILD-mode Claude entry point is a 57-byte `CLAUDE.md` pointer: "IMPORTANT: Refer to AGENTS.md as your core instructions!" — AGENTS.md is the real BUILD system doc, and it already references `.pi/standards/build-standards.md` and `.pi/APPEND_SYSTEM.md`.
13. The 7 BUILD standards docs are reference material consumed by BUILD skills/agents/AGENTS.md — they are NOT install artifacts and should stay at `.pi/standards/` as the single source of truth, pointed to (not duplicated) from CLAUDE.md/AGENTS.md and skills.
14. ANSWER to the load-bearing question: BUILD mode is NOT installed via `arete install`. `arete install` provisions END-USER (GUIDE) workspaces. The source repo IS the BUILD workspace, so BUILD `.claude/` config (CLAUDE.md, any `.claude/commands/`, `.claude/agents/`) is committed directly to the repo. The GUIDE *content conventions* (frontmatter, single-source + pointer, audience separation) port; the GUIDE *install/transform machinery* does not apply to BUILD.
15. Net for BUILD port: keep `.pi/standards/` as canonical refs; thicken `CLAUDE.md` (or keep the AGENTS.md pointer and port AGENTS.md's structure into a Claude-native `.claude/` layout); port BUILD skills (`.pi/skills/`) and agents (`.pi/agents/`) to Claude-native skills/subagents — mirroring how GUIDE skills got Claude slash commands.

---

# PART A — Porting Playbook (the conventions to follow)

## A1. The two audiences (never conflate)

| Layer | Path | Audience | Ported how |
|-------|------|----------|------------|
| PRODUCT rules | `packages/runtime/rules/{cursor,claude-code}/*.mdc` | End-user PM agents in installed workspaces | Copied + transformed at `arete install` |
| PRODUCT skills | `packages/runtime/skills/*/SKILL.md` | End-user PM agents | Copied at install to `.arete/skills/`; Claude also gets `.claude/commands/` |
| BUILD rules | `.cursor/rules/*.mdc` | Areté contributors (dev) | Committed to repo; govern development |
| BUILD standards | `.pi/standards/*.md` | BUILD-mode agents (this repo) | Committed; referenced by AGENTS.md + BUILD skills |
| BUILD skills/agents | `.pi/skills/`, `.pi/agents/`, `.pi/expertise/` | BUILD-mode agents | Committed |

Source: `packages/runtime/rules/LEARNINGS.md` L1-3, L24, L26; AGENTS.md L20-22.

## A2. Rules: cursor canonical, claude subset

- `packages/runtime/rules/cursor/` holds the 7 canonical rule sources with full Cursor frontmatter (`description`, `globs`, sometimes `alwaysApply: true`). Confirmed heads: `arete-vision.mdc` / `pm-workspace.mdc` / `routing-mandatory.mdc` carry `alwaysApply: true` + broad `globs: ["**/*"]`; `qmd-search.mdc` carries only `description`+`globs`.
- `packages/runtime/rules/claude-code/` holds the 3-rule subset (`agent-memory.mdc`, `context-management.mdc`, `project-management.mdc`). Their frontmatter is SLIMMED for Claude: just `description` + `globs` scoped to a workspace subtree (e.g. `agent-memory.mdc` globs `.arete/memory/**`, `resources/**`; `context-management.mdc` globs `context/**/*`; `project-management.mdc` globs `projects/**/*`). No `alwaysApply` in the Claude twins.
- The claude-code `agent-memory.mdc` is also CONTENT-SHRUNK: 2.8k vs the cursor 14k version. The cursor version carries the full BUILDER-vs-GUIDE mode-aware memory routing table; the claude-code version is the GUIDE-only end-user view. So the port did real content reduction, not just frontmatter changes.
- Why a subset: vision/routing/qmd-search/pm-workspace guidance is consolidated into the generated `CLAUDE.md` instead of separate rule files (`rules/LEARNINGS.md` L22; `getProductRulesAllowList`).
- Editing discipline: edit `cursor/` first (single source of truth), then mirror the 3 shared rules to `claude-code/` (no auto-generation build step exists — `rules/LEARNINGS.md` L28, L46). Adding a Claude rule requires BOTH the file in `claude-code/` AND a `getProductRulesAllowList('claude')` entry (`rules/LEARNINGS.md` L36).
- Path hazard: rule content must use `.cursor/` paths only; `transformRuleContent()` rewrites them. Never write `or .claude/` alternatives (produces double-`.claude/`; caused the 2026-02-13 incident — `rules/LEARNINGS.md` L16, L20, L34).

## A3. Install mechanism (the GUIDE port machinery)

Command: `arete install [directory] --ide cursor|claude` (default `cursor`). Defined `packages/cli/src/commands/install.ts:30-54`; validates IDE; `getAdapter(ide)` at L94.

Per-IDE source selection (`install.ts:105-116`):
```
const rulesSubdir = ide === 'cursor' ? 'cursor' : 'claude-code';
sourcePaths.rules = join(basePaths.rules, rulesSubdir);
// skills, tools, integrations, templates, profiles, guide, updates = shared base paths (IDE-agnostic)
```

What gets laid down (driven by `services.workspace.create(targetDir, {ideTarget, source, sourcePaths})`, `install.ts:127-131`):

| Artifact | Source | Destination | Transform | Code |
|----------|--------|-------------|-----------|------|
| Rules (allow-listed) | `runtime/rules/{cursor\|claude-code}/*.mdc` | `adapter.rulesDir()` = `.claude/rules/` (claude) or `.cursor/rules/` | `.mdc`→`adapter.ruleExtension`; `transformRuleContent()` | `workspace.ts:671-691` |
| Skills (managed) | `runtime/skills/*/` | `.arete/skills/<name>/` | none (copied as-is) | `workspace.ts:268-302` |
| CLAUDE.md / AGENTS.md (root) | GENERATED | repo/workspace root | `adapter.generateRootFiles()` | `workspace.ts:513-525` |
| Slash commands (claude only) | derived from skills | `.claude/commands/*.md` | `adapter.generateCommands(skills)` | `workspace.ts:527-535` |
| GUIDE.md / UPDATES.md | `runtime/GUIDE.md`, `runtime/UPDATES.md` | workspace root (skip if exists) | copied | `workspace.ts:431-455` |
| Base dirs + default context files | `BASE_WORKSPACE_DIRS` + `DEFAULT_FILES` | workspace | created if missing | `workspace-structure.ts:11-49,65+` |
| skills-local APPEND templates | seeded | `.arete/skills-local/<slug>.md` | seeded | `workspace.ts:475` |

Adapter contract (`packages/core/src/adapters/ide-adapter.ts:13-60`): `target: 'cursor'|'claude'`, `configDirName`, `ruleExtension`, `rulesDir()`, `toolsDir()`, `commandsDir()`, `integrationsDir()`, `transformRuleContent()`, optional `generateCommands()`, `generateRootFiles()`. ClaudeAdapter: `configDirName='.claude'`, `ruleExtension='.md'`, dirs under `.claude/` (`claude-adapter.ts:16-44`).

`arete update` re-provisions: regenerates `.claude/commands/` (wipe+regen, `workspace.ts:653-668`), backfills allow-listed rules, REMOVES Claude rules not in the reduced allow list (`workspace.ts:693-707`), refreshes `agent-memory.md` from source (L708-719), regenerates CLAUDE.md/AGENTS.md (L894).

No `settings.json` templating in the install/update path — workspace config is `arete.yaml` (`workspace.ts:490-507`; `ide_target`, `agent_mode: guide`, skills, integrations). The repo's `.claude/` currently holds only `worktrees/` and a `scheduled_tasks.lock` — no committed `settings.json` for BUILD. There is `.pi/settings.json` (493 bytes, pi-harness config), separate concern.

Two install-flow details confirmed by deep trace of the install path:
- Generated slash commands are thin pointers, not copies: `.claude/commands/{skill-id}.md` says "Read and follow the complete workflow in `.agents/skills/{skill-id}/SKILL.md`" and, when the skill declares `profile:`, "Adopt the voice and approach described in `.agents/profiles/{profile}.md`" (`packages/core/src/generators/skill-commands.ts:33-59`). Profiles install to `.agents/profiles/` from `runtime/profiles/` for both IDEs (`workspace.ts:319-341`).
- Root file asymmetry: Cursor's `AGENTS.md` is STATIC (prebuilt from `dist/`, fallback stub) and does NOT support memory injection (`CursorAdapter.supportsMemoryInjection()` → false). Claude's `CLAUDE.md` is DYNAMIC and supports memory injection (`ClaudeAdapter.supportsMemoryInjection()` → true) — this is why Active Topics boot context exists for Claude only.

## A4. CLAUDE.md generation (the consolidation target)

`generateClaudeMd(config, skills, memory?)` — pure, no I/O, byte-deterministic (`packages/core/src/generators/claude-md.ts:1-45`). Sections: Identity, WorkspaceStructure, SlashCommands(skills), IntelligenceServices, Memory, ActiveTopics(memory), WorkingPatterns, Footer. Empty sections filtered out (fresh workspace → no Active Topics). This is where the 4 non-ported cursor rules' guidance lives for Claude.

Regenerated post-ingest for boot context (`packages/cli/src/commands/intelligence.ts:509-660`) and on update (`commands/update.ts:63`).

## A5. SKILL.md format (production frontmatter)

Observed in `packages/runtime/skills/*/SKILL.md`:
```yaml
---
name: daily-winddown                 # slug, = directory name
description: <one-line, used for routing/slash-command help>
triggers:                            # phrases for arete route
  - daily winddown
work_type: operations                # operations | planning | ... (taxonomy)
category: essential                  # essential | ...
intelligence:                        # which intelligence services it uses
  - context_injection
  - entity_resolution
  - memory_retrieval
  - synthesis
profile: pm-advisor                  # optional — runtime/profiles/<name>.md persona
requires_briefing: false             # optional
---
```
Body convention: "# <Skill> — pattern name", "## When to Use", "## Workflow" with numbered phases; references `PATTERNS.md` patterns and per-skill APPEND files (`.arete/skills-local/<slug>.md`). Authoring conventions: `packages/runtime/skills/_authoring-guide.md`; output/indexing: `_integration-guide.md`.

## A6. Where each concern lives (the convention)

| Concern | Lives in | Why |
|---------|----------|-----|
| Always-on agent identity/behavior (GUIDE) | generated `CLAUDE.md` | consolidates the would-be-rules guidance; deterministic |
| Scoped, glob-triggered guidance (GUIDE) | `.claude/rules/*.md` (3 only) | fires on path context, not always |
| Invocable workflows | skills → `.arete/skills/` + `.claude/commands/*.md` | discoverable as slash commands |
| Reference docs (deep, infrequently loaded) | files pointed-to, not inlined | keep CLAUDE.md lean |
| Settings/permissions/hooks | `.claude/settings.json` (NOT generated today) | would be committed for BUILD |

## A7. ANSWER — install vs committed for BUILD mode

`arete install` exclusively provisions END-USER (GUIDE) workspaces (`install.ts` next-steps even print `/getting-started` for claude, `arete onboard` for cursor — L220-225). The Areté SOURCE REPO is itself the BUILD workspace; there is no "install BUILD into a workspace" flow. Therefore:

- BUILD `.claude/` configuration (a thicker `CLAUDE.md` or a Claude-native `.claude/` doc layout, any `.claude/commands/`, `.claude/agents/`, `.claude/settings.json`) is COMMITTED DIRECTLY to the repo. It is not generated by `arete install`.
- What ports from GUIDE is the CONVENTION set (A2/A5/A6) and the audience-separation discipline (A1) — not the transform/copy machinery.
- Caveat for the planner: the GUIDE CLAUDE.md is machine-generated by `claude-md.ts`. The BUILD CLAUDE.md is hand-authored (or could get its own generator). Don't accidentally wire BUILD's CLAUDE.md through `generateClaudeMd` — that function emits the END-USER PM agent identity, not the builder/planner identity in AGENTS.md.

---

# PART B — The 7 `.pi/standards/` docs → Claude Code home

Guiding principle (from A1/A6 + how GUIDE kept rules vs CLAUDE.md): these are BUILD reference material consumed by AGENTS.md and BUILD skills/agents. Keep them as the single source of truth at `.pi/standards/` and POINT to them; only the small set of "always-true" gates belongs inlined in CLAUDE.md/AGENTS.md.

| # | Doc | Size | Consumers today | Claude Code home | Rewrite needed |
|---|-----|------|-----------------|------------------|----------------|
| 1 | `build-standards.md` | 8.6k | AGENTS.md L4 ("coding standards"); BUILD skills | KEEP at `.pi/standards/`. Inline ONLY the mandatory quality-gate triplet (`npm run build`/`typecheck`/`test` + commit-dist rule) into CLAUDE.md/AGENTS.md as an always-on gate; CLAUDE.md links to the full doc. | Light: extract a ~10-line "Quality Gates" block for CLAUDE.md; rest unchanged. |
| 2 | `pre-mortem-categories.md` | 2.5k | run-pre-mortem, execute-prd, ship skills | KEEP at `.pi/standards/`; referenced by skills only. | None. If `pre-mortem`/`run-pre-mortem` becomes a Claude slash command, point its SKILL/command body here. |
| 3 | `learnings-protocol.md` | 3.1k | developer/reviewer/orchestrator agents, execute-prd, maintenance.md, AGENTS.md definition_of_done | KEEP at `.pi/standards/`; referenced by agents + the `definition_of_done` line already in AGENTS.md L59. | None. Verify the "Known Locations" list stays accurate (it lists `.pi/skills/...` paths). |
| 4 | `ac-rubric.md` | 2.3k | review-plan, plan-to-prd, execute-prd reviewer, hotfix | KEEP at `.pi/standards/`; referenced by skills/reviewer agent only. | None. |
| 5 | `subagent-dispatch.md` | 4.1k | execute-prd, ship, audit | KEEP at `.pi/standards/`. OVERLAP: owned by the agents/expertise slice — that slice must reconcile `subagent({agent, agentScope:"project"})` (pi-harness tool, loads `.pi/agents/<name>.md`) against Claude Code's native Task/subagent model (`.claude/agents/`). Flag only; do not rewrite here. | DEFERRED to sibling slice. Likely needs a Claude-native dispatch section (Task tool + `.claude/agents/`), but DECIDE THERE. |
| 6 | `patterns.md` | 10k | build-standards.md cross-ref, developer/reviewer, maintenance.md detailed mode | KEEP at `.pi/standards/`; referenced by build-standards.md + agents. | None. Architectural patterns are IDE-agnostic. |
| 7 | `maintenance.md` | 3.5k | references build-standards.md + patterns.md; role files; AGENTS.md learnings flow | KEEP at `.pi/standards/`; referenced by agents. | None. |

### Why not move any into `.claude/rules/`?
The GUIDE precedent put only 3 always-on, glob-scoped rules into `.claude/rules/` and consolidated the rest into generated CLAUDE.md. The BUILD standards are large, infrequently-loaded reference docs consumed by SPECIFIC skills/agents — the GUIDE equivalent of "point to it, don't always-load it." Inlining 30k+ of standards into CLAUDE.md would bloat the always-on context (the exact bloat MEMORY.md flags as the v2 antagonist). So: pointer model, not inline, not rules.

### What DOES belong inlined in CLAUDE.md / AGENTS.md
- The mandatory quality-gate triplet + commit-dist rule (from build-standards.md §Quality Gates) — these are non-negotiable and must fire on every commit regardless of which doc the agent loaded.
- The `definition_of_done` learnings pointer (already present in AGENTS.md L59 → `learnings-protocol.md`).
- The isolation gate ("never switch branches in main repo") — already in AGENTS.md L66 and MEMORY.md.

---

## Ordered task list (this slice)

1. Treat `packages/runtime/rules/LEARNINGS.md` as the authoritative GUIDE-port reference; cite it in the consolidated plan rather than re-deriving.
2. Decide the BUILD CLAUDE.md strategy: (a) keep the 57-byte pointer to AGENTS.md, or (b) author a Claude-native BUILD CLAUDE.md that inlines the always-on gates (A7) and points to `.pi/standards/`. Recommend (b)-lite: keep AGENTS.md as the system doc, but ensure CLAUDE.md carries the quality-gate triplet + isolation gate so they fire even if AGENTS.md isn't loaded.
3. Inline the quality-gate triplet + commit-dist + isolation gate into CLAUDE.md (extract from `build-standards.md` §Quality Gates); link to the full `.pi/standards/` docs.
4. Leave all 7 `.pi/standards/` docs in place as single-source references (per Part B table). No content rewrites except the extraction in #3.
5. Coordinate with the agents/expertise slice on `subagent-dispatch.md` (#5) — that slice decides the Claude-native dispatch (`.claude/agents/` + Task tool) story; this slice only flags the dependency.
6. Verify each standards doc's "Referenced by" / "Known Locations" headers still resolve after any skill/agent port (esp. `learnings-protocol.md` location list and `subagent-dispatch.md` expertise-profile table).
7. Hand the consolidating planner the conventions list below.

## Conventions the consolidating planner must enforce across ALL slices

1. AUDIENCE SEPARATION: PRODUCT (`packages/runtime/`, end-user) vs BUILD (`.pi/`, `.cursor/rules/`, repo `.claude/`, contributor). Never port BUILD content into runtime or vice versa (`rules/LEARNINGS.md` L24).
2. SINGLE SOURCE + POINTER: keep large reference docs canonical in one place; inline only always-on gates. Don't duplicate `.pi/standards/` content into CLAUDE.md.
3. CLAUDE.md = GENERATED for GUIDE (`claude-md.ts`), HAND-AUTHORED for BUILD. Don't route BUILD's CLAUDE.md through `generateClaudeMd` (it emits the PM-agent identity, not the builder identity).
4. RULES SUBSET DISCIPLINE (if any BUILD rules go to `.claude/rules/`): edit canonical source first, mirror manually, keep an allow list; use only `.cursor/`-style paths in any content that flows through `transformRuleContent()`, never `or .claude/` alternatives.
5. SKILL.md FRONTMATTER SCHEMA: `name`, `description`, `triggers[]`, `work_type`, `category`, `intelligence[]` (+ optional `profile`, `requires_briefing`). Keep it consistent so routing + slash-command generation work.
6. BUILD IS NOT INSTALLED: BUILD `.claude/` config is committed to the repo; no `arete install` step provisions it. Don't write a BUILD install flow expecting `arete install` parity.
7. CONTEXT-BUDGET: the v2 direction treats always-on bloat as the antagonist (MEMORY.md). Default to pointers/slash-commands over inlining; only true always-on gates earn a place in CLAUDE.md.
8. PRESERVE CROSS-REFS: when porting skills/agents, keep the "Referenced by" / "Known Locations" headers in `.pi/standards/` docs accurate.
