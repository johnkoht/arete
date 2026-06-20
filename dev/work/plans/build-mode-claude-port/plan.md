---
title: "BUILD mode → Claude Code port"
slug: build-mode-claude-port
status: planned
size: large
date: 2026-06-19
owner: John
---

# BUILD mode → Claude Code port

Port Areté's BUILD-mode operating layer off the Pi agent platform (`.pi/`) onto native Claude Code. GUIDE mode (the product, `packages/runtime/`) is already ported and is the reference for conventions. This plan consolidates four research slices (see `research/01..04`); read those for per-item detail and line citations. This file is the actionable plan of record.

## Goal & end state

Areté development runs entirely in Claude Code with no Pi runtime dependency. Skills, agent roles, the plan/PRD lifecycle, memory injection, and web/subagent capabilities all use native Claude Code mechanisms. `.pi/` is deleted.

## Decisions locked (2026-06-19)

1. **Skill shape: native Claude skills.** Each BUILD skill becomes `.claude/skills/<id>/SKILL.md` (frontmatter `name` + `description`), invoked via the Skill tool / `/<name>`. No thin-command-wrapper layer. (Diverges from GUIDE's generated-command pattern — acceptable because BUILD is committed, not `arete install`-driven.)
2. **Plan lifecycle: full CLI port.** Lift the already-Pi-free, unit-tested modules (`persistence.ts`, `utils.ts`, `wrap-checks.ts`, `execution-progress.ts`, `release.ts`) into `arete plan …` / `arete release …` subcommands. Slash commands shell out to the CLI. The plan frontmatter state machine and the existing `dev/work/plans/` corpus are preserved.
3. **`.pi/` is retired.** Everything migrates into native homes and `.pi/` (including `npm/`, `extensions/`) is deleted. Many cross-reference rewrites; the residual-reference sweep is a gating task.
4. **Cross-model PM review: different Claude model pass.** `product-manager` on `opus`; a new `pm-reviewer` on `sonnet` is the explicit second pass dispatched by `/review`. Cross-vendor (GPT-5.x) review is dropped; an MCP/Bash bridge is a documented future option, not in scope.

## Target layout (path map)

| Concern | From (Pi) | To (Claude Code) |
|---|---|---|
| Skills | `.pi/skills/<id>/SKILL.md` | `.claude/skills/<id>/SKILL.md` |
| Agent roles | `.pi/agents/<role>.md` | `.claude/agents/<role>.md` (+ new `pm-reviewer.md`) |
| Expertise profiles | `.pi/expertise/<domain>/PROFILE.md` | `dev/expertise/<domain>/PROFILE.md` |
| Standards | `.pi/standards/*.md` | `dev/standards/*.md` |
| Plan-mode engine (TS) | `.pi/extensions/plan-mode/*.ts` | `packages/cli/src/commands/plan.ts` + `release.ts` (+ ported `*.test.ts`) |
| Plan lifecycle commands | plan-mode slash commands | `.claude/commands/{plan,approve,build,wrap,review,pre-mortem,prd,ship,release}.md` (thin Bash wrappers → CLI / Skill) |
| Agent-memory injection | `.pi/extensions/agent-memory/` | `@memory/collaboration.md` import in CLAUDE.md |
| System prompt (how-to + what's-available) | `.pi/APPEND_SYSTEM.md` + `AGENTS.md` | hand-authored `CLAUDE.md` + `.claude/rules/*.md` |
| Settings / model routing | `.pi/settings.json` | `.claude/settings.json` + per-agent `model:` frontmatter |
| Subagent orchestration | `npm:pi-subagents` | native Task/Agent + Workflow tools |
| Web access | `npm:pi-web-access` | WebSearch / WebFetch / `deep-research` skill / MCP |

## Explicit non-goals (deliberately dropped)

These have no native equivalent and are not worth rebuilding (see research/03 §"Genuinely cannot be replicated"):
- `[DONE:n]` per-turn marker tracking and the footer/todo widget (use TodoWrite + `prd.json` userStories status + plan frontmatter `status`).
- Pi session-restore reconciliation / `loadedFromDisk` (replaced by **stateless explicit-slug** identity — a simplification that kills the plan-overwrite bug class).
- Ctrl+Alt+P / Ctrl+Shift+A shortcuts and the Agents-Manager TUI.
- pi-subagents async background jobs, run-history JSONL, reusable `.chain.md` files.
- pi-web-access YouTube/video understanding, frame extraction, GitHub-clone-instead-of-scrape, browser-cookie zero-config.
- `lsp` tool (type info comes from Bash `npm run typecheck`).

---

## Phased plan

Sequencing is dependency-driven: CLI (long pole) and standards/agents relocation are foundational; skills depend on the relocated reference paths; lifecycle commands depend on both CLI and skills; `.pi/` deletion is last.

### Phase 0 — Foundations & verification (blocks nothing; do first)

- [x] **0.1 AGENTS.md authoring path — RESOLVED 2026-06-19.** The root (BUILD) `AGENTS.md` is **hand-written**, not generated — `scripts/build-agents.ts`: *"The dev target was removed. AGENTS.md is now hand-written."* `build:agents:prod` only emits `dist/AGENTS.md` for GUIDE (from `.agents/sources/{shared,guide}/`). ⇒ Phase 3.1 can fold AGENTS.md content into CLAUDE.md freely; no generator entanglement.
- [ ] **0.2 Inventory cross-refs.** `grep -rn` the repo for `.pi/`, `subagent(`, `save_plan_artifact`, `set_plan`, `[DONE:`, `/worktree`, `@zenobius`, `agentScope`, `pi-subagents`, `pi-web-access` to scope the rewrite surface. Save the list as `research/xref-inventory.md`.
- [x] **0.3 `model:` alias support — RESOLVED.** Aliases (`opus`/`sonnet`/`haiku`/`inherit`) accepted in `.claude/agents/*.md` frontmatter (research/02 verified vs docs). Trivial local re-confirm only.
- [x] **0.4 BUILD `.cursor/` rules — RESOLVED 2026-06-19.** No `.cursor/` directory exists in the repo. The cursor rules under `packages/runtime/rules/cursor/` are GUIDE **product** artifacts (shipped to Cursor end-users) and stay untouched. No BUILD `.cursor/` surface to port or retire.
- [ ] **0.5 Read `packages/runtime/rules/LEARNINGS.md`** — the authoritative GUIDE-port reference; enforce its audience-separation discipline throughout.

### Phase 1 — Plan/release CLI (the long pole; independent — start in parallel with Phase 2)

Source: `.pi/extensions/plan-mode/`. These modules already have **zero Pi imports** and shipped `.test.ts` (research/03 Gap 1).

- [ ] **1.1** Lift `persistence.ts`, `utils.ts`, `wrap-checks.ts`, `execution-progress.ts`, `release.ts` + their `*.test.ts` into the `arete` CLI (`packages/cli/src/commands/plan.ts`, `release.ts`, shared lib under `packages/core` or `packages/cli/src/lib/plan/`). Keep the frontmatter schema and `migrateStatus` **byte-identical** for backward compat with the existing `dev/work/plans/` corpus.
- [ ] **1.2** Implement subcommands: `arete plan new|list|open|save|rename|status|delete|archive|promote|wrap|build-status|approve|set-flag`; `arete release [status|patch|minor] [--dry-run]`. `open` prints frontmatter + body + git-diff-since to stdout. Drop the TUI SelectList → emit markdown tables.
- [ ] **1.3** Adopt **stateless explicit-slug** identity: every command takes `<slug>` (or infers "latest building/planned"). Delete the `loadedFromDisk`/`session_start` reconciliation concept entirely.
- [ ] **1.4** Port the tests; run `npm run typecheck && npm test`; verify byte-identical I/O against the current `dev/work/plans/` corpus. **Acceptance:** all ported tests green; `arete plan list` reproduces the existing plan set; `arete release --dry-run` matches prior output.

### Phase 2 — Agents, expertise, standards, dispatch (foundational refs for skills)

- [ ] **2.1 Relocate standards** `.pi/standards/*.md` → `dev/standards/*.md` (all 7; no content rewrite except 2.6). Keep "Referenced by"/"Known Locations" headers accurate (research/04 Part B).
- [ ] **2.2 Relocate expertise** `.pi/expertise/<domain>/PROFILE.md` → `dev/expertise/<domain>/PROFILE.md`. Keep as files (NOT subagents) — they're context injected by path (research/02 §2).
- [ ] **2.3 Rewrite the dispatch standard** (`dev/standards/subagent-dispatch.md`): replace `subagent({agent,task,agentScope})` with Task-tool / `subagent_type`; delete the pre-flight `action:"list"` HALT; state Layers 1/2/4 are PASSED in the Task prompt (no spawn-time stack), Layer 3 is BAKED (the agent file); keep the file-list-first template, expertise-selection heuristic, and the "no parallel edits to the same code" rule re-expressed for Task concurrency. (research/02 §3.)
- [ ] **2.4 Create the 5 agent files** `.claude/agents/{developer,reviewer,orchestrator,product-manager,gitboss}.md`. Bodies port near-verbatim; rewrite each "## Composition" section to BAKED/PASSED; rewrite gitboss "How To Invoke" from `@gitboss` to Task-tool phrasing. Frontmatter + models per research/02 §1: developer/reviewer/gitboss `sonnet`, orchestrator/product-manager `opus`; tool allowlists per the table; **drop `lsp`**; **orchestrator keeps `Agent` in tools** (nesting to depth 5 is supported).
- [ ] **2.5 Create `pm-reviewer`** `.claude/agents/pm-reviewer.md` on `sonnet` — the cross-model second pass dispatched by `/review` (Decision 4).
- [ ] **2.6 Extract always-on gates** from `build-standards.md` (quality-gate triplet `build`/`typecheck`/`test` + commit-dist rule) — staged for inlining into CLAUDE.md in Phase 3. Full doc stays canonical at `dev/standards/build-standards.md`.

### Phase 3 — System prompt, rules, settings, memory

- [ ] **3.1 Author `CLAUDE.md`** (BUILD, hand-authored — do NOT route through `generateClaudeMd`, which emits the PM-agent identity). Fold in from AGENTS.md: Identity/Vision/Workspace/Build-Principles/CLI; from APPEND_SYSTEM.md: Routing/Execution-Tree/Branch-Isolation/Direct-Execution/LEARNINGS-rules/Skill-Rule-Changes. Rewrite `|key:value` Pi macro syntax → plain markdown. Inline the Phase-2.6 quality gates + the isolation gate. Add a routing/composition section (which `subagent_type` when, domain→profile heuristic, BAKED-vs-PASSED rule). Drop the 4-Layer-Composition stack and the Pi Plan-Lifecycle table (superseded by Phase 5 commands). Emit a Skills/Commands index.
- [ ] **3.2 Add memory import** — `@memory/collaboration.md` in CLAUDE.md (replaces the agent-memory extension; research/03 Part B).
- [ ] **3.3 Author BUILD rules** `.claude/rules/{learnings.md,skill-and-rule-changes.md}` (frontmatter `description` + `globs`, mirroring `packages/runtime/rules/claude-code/*.mdc`). Keep branch-isolation in CLAUDE.md (load-bearing).
- [ ] **3.4 Author `.claude/settings.json`** — permissions for bash/edit/write, default model; confirm WebSearch/WebFetch available for the BUILD web subset. `packages` has no equivalent (drop).
- [ ] **3.5 Resolve AGENTS.md fate** per 0.1: either keep as a generated artifact pointing at CLAUDE.md, or retire it. Don't leave it referencing deleted `.pi/` paths.

### Phase 4 — Skills (low-dep → high-dep; ship last)

Each: copy SKILL.md → `.claude/skills/<id>/SKILL.md`, trim frontmatter to `name`+`description`, rewrite `.pi/` paths to new homes, replace `save_plan_artifact`/`set_plan` with `Write` + `arete plan set-flag`, reframe `subagent(...)`/TS-pseudocode as Task-tool/Agent steps, simplify "subagent unavailable → HALT" (Agent is always present). Carry supporting files (orchestrator.md, templates/, manifest.yaml, LEARNINGS.md) alongside. (research/01 per-skill detail.)

- [ ] **4.1 Clean ports (no cross-deps):** `prd-to-json`, `synthesize-collaboration-profile`, `prd-post-mortem`, `plan-to-prd`. (plan-to-prd's EXECUTE.md handoff repoints to Phase-5 lifecycle.)
- [ ] **4.2** `hotfix` — single-file; self-review path works standalone, optional reviewer-Agent dispatch.
- [ ] **4.3** `run-pre-mortem`, `review-plan` — replace `save_plan_artifact` with `Write` to `dev/work/plans/{slug}/{pre-mortem,review}.md`; repoint standards/expertise paths. Keep the full BUILD variants (engineering risk categories, AC rubric, recommended_track) distinct from their GUIDE twins.
- [ ] **4.4** `audit` — reframe orchestrator dispatch + TS pseudocode as Agent steps; repoint expertise/catalog paths.
- [ ] **4.5** `execute-prd` (`/build` execution path) — port body verbatim with path rewrites; swap `subagent({agent,task,agentScope})` for Task/Agent dispatch of developer+reviewer; drop `[DONE:n]` (TodoWrite + `prd.json` status).
- [ ] **4.6** `ship` (LAST) — the integration point. Rewrite worktree (`@zenobius/pi-worktrees` `/worktree`) → native `EnterWorktree`/`isolation:"worktree"`; gitboss/orchestrator/reviewer dispatch → Task/Agent; plan-frontmatter gates → `arete plan` flags; chained `/pre-mortem`/`/review`/`/plan-to-prd`/`/build`/`/wrap` → Phase-5 commands. Acceptance: ship runs end-to-end on a trivial change.

### Phase 5 — Plan lifecycle slash commands (depends on Phase 1 CLI + Phase 4 skills)

- [ ] **5.1** `.claude/commands/plan.md` → dispatches `arete plan {new|list|open|save|rename|status|delete|archive|promote}`; `open` relays CLI output into context.
- [ ] **5.2** `.claude/commands/{approve,build,wrap,release}.md` → wrap the CLI; `build` sets `building` + commits the plan dir, then branches PRD (invoke `execute-prd` skill) vs todo (native + TodoWrite).
- [ ] **5.3** `.claude/commands/{review,pre-mortem,prd,ship}.md` → set the `has_*` frontmatter flag via `arete plan set-flag`, then invoke the corresponding skill. `/review` additionally dispatches `pm-reviewer` (Decision 4).
- [ ] **5.4** Native plan mode (Shift+Tab) covers the "explore, don't implement" framing; document this in CLAUDE.md as the replacement for `/plan` toggle.

### Phase 6 — Retire `.pi/` (gating sweep)

- [ ] **6.1 Residual-reference sweep** — re-run the 0.2 greps; every hit must be rewritten or an explicit, justified non-goal. Verify every `/command` referenced by `ship` resolves.
- [ ] **6.2** Remove `pi-subagents` / `pi-web-access` usages; confirm Task/Agent/Workflow + WebSearch/WebFetch cover the live needs (`/build` delegation, `/review` second opinion, doc lookups).
- [ ] **6.3** Delete `.pi/` (skills, agents, expertise, standards, extensions, npm, APPEND_SYSTEM.md, settings.json, LEARNINGS-skills.md). Move any per-skill `LEARNINGS.md` content to its new skill home first.
- [ ] **6.4** Update `dev/catalog/capabilities.json` and any `.cursor/` BUILD rules that referenced `.pi/`.

### Phase 7 — Verification & cutover

- [ ] **7.1** Smoke: `/hotfix` on a trivial bug; a small `/ship` end-to-end (worktree → build → review → gitboss merge gate, on a throwaway branch); `arete plan` lifecycle round-trip.
- [ ] **7.2** Confirm `@memory/collaboration.md` loads; agents dispatch with correct models; orchestrator nests developer/reviewer.
- [ ] **7.3** Update `dev/catalog/capabilities.json`, CHANGELOG, and any onboarding docs. Wrap (memory entry + LEARNINGS).

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Plan CLI I/O diverges from existing corpus | High | Byte-identical `persistence.ts`/`migrateStatus` port; test against live `dev/work/plans/` (1.4) |
| `ship` integration breaks across many slices | High | Port last (4.6); it's documented-but-gated until worktree/subagents/lifecycle land; smoke on throwaway branch |
| Stranded `.pi/` references after deletion | Med | 0.2 inventory + 6.1 sweep as a hard gate before 6.3 |
| Cross-vendor review fidelity lost | Med (accepted) | pm-reviewer different-Claude-model pass; MCP bridge documented as future |
| AGENTS.md generation collision | Med | Resolve 0.1 before authoring CLAUDE.md (3.1/3.5) |
| Native worktree semantics differ from `@zenobius/pi-worktrees` | Med | Validate `EnterWorktree`/`isolation:"worktree"` in 4.6 smoke before relying on it in ship |

## Open verification items

All Phase-0 unknowns resolved (0.1 AGENTS.md hand-written; 0.3 model aliases OK; 0.4 no BUILD `.cursor/`). Remaining standing task: 0.2 cross-ref inventory (run at execution start; it scopes the Phase-6 deletion sweep).

## References

- `research/01-skills-and-system.md` — per-skill port detail, system-prompt mapping.
- `research/02-agents-and-expertise.md` — agent frontmatter, composition model, cross-model review.
- `research/03-extensions-tools-settings.md` — plan-mode command table, CLI port, pi-subagents/web-access coverage, settings.
- `research/04-guide-pattern-and-standards.md` — GUIDE port playbook, standards homes, conventions to enforce.
- `packages/runtime/rules/LEARNINGS.md` — authoritative GUIDE-port reference.
</content>
</invoke>
