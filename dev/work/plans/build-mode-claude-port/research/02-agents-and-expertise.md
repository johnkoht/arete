# 02 — Agents & Expertise: BUILD-mode subagent port (Pi → Claude Code)

> Research slice: role personas, domain expertise profiles, and the subagent-dispatch / 4-layer composition model.
> Sources analyzed: `.pi/agents/*.md` (5 roles), `.pi/expertise/{core,cli,backend,web}/PROFILE.md` (4 profiles), `.pi/standards/subagent-dispatch.md`, `.pi/APPEND_SYSTEM.md` § Composition, `AGENTS.md` [Roles]/[Expertise]/[Delegation], `.pi/settings.json`.
> Adjacent slices own: pi-subagents parallel/chained execution (separate package), skills (execute-prd/ship/audit/hotfix), standards files (build-standards, maintenance, patterns), plan-mode extension. This slice notes where roles depend on them but does not port them.

---

## Executive Summary (15 lines)

1. Five Pi roles (`orchestrator`, `reviewer`, `developer`, `product-manager`, `gitboss`) become five `.claude/agents/<role>.md` files; bodies carry over near-verbatim — they are already model-agnostic persona prose.
2. Pi model assignments map cleanly to Claude `model:` aliases: product-manager → `opus`, orchestrator → `opus`, reviewer → `sonnet`, developer → `sonnet`, gitboss → `sonnet` (Pi left it unset/default).
3. Pi tool names (`read,bash,edit,write,lsp,grep,find,ls`) must be rewritten to Claude tool names (`Read,Bash,Edit,Write,Grep,Glob,...`); there is no `lsp` tool in Claude Code — drop it or rely on Bash `tsc`.
4. The 4 expertise PROFILEs should NOT become subagents. They are reference/context documents, not personas. Keep them as files and inject by path into the Task prompt (the same "Read These Files First" pattern Pi uses).
5. Claude Code has no spawn-time 4-layer composition. Composition collapses to: Layer 3 (role) is BAKED into the agent file body; Layers 1/2/4 (AGENTS.md / build-standards / PROFILE) are PASSED as a file-list in the Task prompt by the caller.
6. The orchestrator stops being "the assembler of the context stack" via a tool and becomes "the author of a context-rich Task prompt" — the same job, manual instead of mechanical.
7. product-manager's cross-model secondary review (opus primary + gpt-5 secondary) has NO native Claude equivalent. Best port: a dedicated `pm-reviewer` agent pinned to a different model invoked as an explicit second pass; or accept single-model and note the gap.
8. The `subagent-dispatch.md` prompt template ports directly — it is plain markdown and already encodes the manual-composition pattern Claude needs.
9. Pre-flight `subagent({action:"list"})` check has no equivalent; the Task tool is always present in Claude Code, so the HALT-on-missing-tool protocol can be dropped.
10. Pi's `agentScope:"project"` maps to Claude's project-level `.claude/agents/` discovery automatically — no parameter needed.
11. Nesting IS supported (Claude Code v2.1.172+, depth limit 5), so the orchestrator-spawns-developer-spawns-reviewer chain CAN be preserved with orchestrator as a real subagent — provided its `tools` list includes `Agent` (the tool that spawns subagents). Earlier-feared flattening is unnecessary.
12. Gap: cross-model review (item 7) and the parallel/chained execution that `pi-subagents` provides (owned by another slice) both lose fidelity; flag for that slice.
13. AGENTS.md [Roles]/[Expertise]/[Delegation] content should be condensed into CLAUDE.md so the main session knows which agent/profile to route where.
14. Cleanest end state: 5 agent files + 4 profile files kept in place + a routing/composition section in CLAUDE.md + an updated dispatch standard rewritten for the Task-prompt composition model.
15. Ordered task list at the end (8 tasks); the first is the dispatch-standard rewrite because every other piece references it.

---

## 1. The 5 roles → `.claude/agents/<role>.md`

Claude Code subagents are markdown files with YAML frontmatter where the body is the system prompt. They are invoked via the Agent/Task tool with `subagent_type: "<name>"` (or `@agent-<name>`), and the `description` field drives optional automatic delegation. Project-level agents live in `.claude/agents/`. Official spec: https://code.claude.com/docs/en/sub-agents.md.

Frontmatter fields (confirmed against live docs): required `name` (lowercase + hyphens) and `description`. Relevant optionals: `tools` (comma-separated allowlist; omit = inherit all), `disallowedTools` (denylist, applied before `tools`), `model` (`opus`/`sonnet`/`haiku`/`fable`, full id, or `inherit` — default `inherit`), `skills` (list of skill names preloaded full at startup), plus `effort`, `permissionMode`, `isolation: worktree`, `memory`, `maxTurns`, `color`, `background`. Subagent initial context auto-includes CLAUDE.md + memory hierarchy + a git-status snapshot (so Layer-1 system awareness is partly ambient already). NOTE: to let a subagent spawn its own subagents, its `tools` must include `Agent` (omitting `Agent` or listing it in `disallowedTools` disables nesting).

### Tool-name mapping (applies to all roles)

| Pi tool | Claude Code tool | Notes |
|---------|------------------|-------|
| `read` | `Read` | |
| `bash` | `Bash` | |
| `edit` | `Edit` | |
| `write` | `Write` | |
| `grep` | `Grep` | |
| `find` / `ls` | `Glob` (+ `Bash` for `ls`) | Claude has no `find`/`ls` tool; use `Glob` for patterns, `Bash` for listings |
| `lsp` | — (none) | No LSP tool in Claude Code. Drop it; type errors come from `Bash` running `npm run typecheck` |

Pi's global `tools: [read,bash,edit,write,lsp]` in `settings.json` is a default toolset; per-agent `tools:` in each `.pi/agents/*.md` frontmatter narrows it. Claude Code: omitting `tools:` inherits the full toolset; specifying it restricts. Read-only roles should specify an explicit narrow list.

### Model mapping (from `.pi/settings.json`)

| Role | Pi assignment | Claude `model:` |
|------|---------------|------------------|
| product-manager | `primary: anthropic/claude-opus-4-6`, `secondary: openai/gpt-5.3` | `opus` (+ separate reviewer for the secondary — see §4) |
| orchestrator | `anthropic/claude-opus-4-6` | `opus` |
| reviewer | `anthropic/claude-sonnet-4-6` | `sonnet` |
| developer | `anthropic/claude-sonnet-4-6` | `sonnet` |
| gitboss | (unset → falls to global default) | `sonnet` (mechanical git gating; cheap is fine) |

`model:` accepts the aliases `opus`/`sonnet`/`haiku` and `inherit` (use parent session's model), as well as full model ids. Aliases are preferred for portability across model refreshes. (Confirm exact accepted values against the live Claude Code docs — see open item.)

### Per-role port spec

#### orchestrator → `.claude/agents/orchestrator.md`
Proposed frontmatter:
```yaml
---
name: orchestrator
description: Senior engineering manager owning PRD execution end-to-end and plan-mode lifecycle gates. Use for multi-task PRD execution, context assembly, and holistic done-done review.
tools: Read, Bash, Grep, Glob, Agent
model: opus
---
```
Body carries over almost entirely (`.pi/agents/orchestrator.md`, ~17k). REWRITE the "## Composition" section: it currently says "You compose these layers when spawning subagents" with a 4-row table — in Claude this becomes "When you spawn a developer/reviewer via the Agent tool, the role behavior is BAKED (their agent file is their system prompt) and you PASS the file list — AGENTS.md / `.pi/standards/build-standards.md` / `.pi/expertise/{domain}/PROFILE.md` — in the Task prompt's 'Context — Read These Files First' section." The Expertise-Profiles-selection table (which domain to attach) carries over verbatim — it is the routing heuristic.
KEY: the orchestrator MUST keep `Agent` in its `tools` so it can spawn developer + reviewer (nesting is supported to depth 5). Without `Agent` it loses its entire dispatch function. It can run either as a subagent (with `Agent` enabled) OR as the main session — both work; recommend whichever the skills slice (execute-prd/ship) wires up. (See §3.)

#### reviewer → `.claude/agents/reviewer.md`
```yaml
---
name: reviewer
description: Senior engineer reviewer for pre-work sanity checks, post-work code review, and plan-mode lifecycle gates. Grumpy-by-default; blocks approval when tests fail or docs are missing after regressions.
tools: Read, Bash, Grep, Glob
model: sonnet
---
```
Body (`.pi/agents/reviewer.md`, ~12k) carries over verbatim — the grumpy-reviewer mindset, 6-step review procedure, output formats, all evidence citations. REWRITE the "## Composition" 4-row table to a one-liner: "Your role behavior is this file; the caller passes AGENTS.md, build-standards, and the relevant PROFILE.md in your Task prompt — read them first." Pi's `lsp` tool drops; the Step-5 quality gate already shells `npm run typecheck`/`npm test` via Bash, so no capability loss.

#### developer → `.claude/agents/developer.md`
```yaml
---
name: developer
description: Implements a single task from a PRD with full tool access — writes code + tests, runs typecheck/test, commits, updates progress. One task only.
tools: Read, Bash, Edit, Write, Grep, Glob
model: sonnet
---
```
Body (`.pi/agents/developer.md`, ~9.8k) carries over verbatim — the 8-step responsibilities, completion-report format, Signals block, red flags. Same Composition-table rewrite. Drop `lsp`.

#### product-manager → `.claude/agents/product-manager.md`
```yaml
---
name: product-manager
description: Product leader for planning, problem-shaping, and PRD creation. Read-only during planning; never writes plan files directly.
tools: Read, Bash, Grep, Glob
model: opus
---
```
Body (`.pi/agents/product-manager.md`, ~8.4k) carries over. TWO rewrites needed:
- The "⛔ NEVER manually write plan.md / use `/plan` `/review` `/pre-mortem` `/approve` `/build` `/wrap` extension commands" block depends on the Pi plan-mode extension. Those slash commands are NOT this slice — they belong to the skills/plan-mode slice. Keep the constraint ("don't hand-write plan.md") but flag the command surface as cross-slice (it must be re-pointed at whatever the Claude port uses for plan lifecycle).
- The `secondary: openai/gpt-5.3` cross-model review (the headline reason this role was opus+gpt5) has no inline equivalent — see §4.
Note: Pi gave product-manager no `tools:` frontmatter (planning is read-only by convention); Claude needs an explicit read-only-ish list to enforce that.

#### gitboss → `.claude/agents/gitboss.md`
```yaml
---
name: gitboss
description: Git gatekeeper for post-build review, merge, and versioning decisions. Verifies clean tree, branch, conflicts; merges to main; prompts for release. Does NOT review code or run tests.
tools: Read, Bash
model: sonnet
---
```
Body (`.pi/agents/gitboss.md`, ~7.4k) carries over verbatim — 4 responsibilities, the bash check snippets, the explicit Out-of-Scope table, output formats. No Composition section to rewrite (gitboss never had one). Its `/release` invocation is a cross-slice dependency (release skill), flag it.

---

## 2. The 4 expertise PROFILEs

The profiles are `core` (318 ln), `cli` (247 ln), `backend` (288 ln), `web` (390 ln). Each is a domain MAP: Purpose & Boundaries, Architecture/Component Map, Key Patterns, Invariants, Anti-Patterns, Required Reading, LEARNINGS.md locations. They are reference documents read by whichever persona is working in that domain — they are NOT personas themselves.

**Recommendation: keep them as files; do NOT turn them into subagents.** Reasons:
- A subagent is a persona + toolset + model. A PROFILE is none of those — it is knowledge. Wrapping each in an agent shell would force an extra Task round-trip and a fresh context window just to surface static reference text.
- Pi already treats them as context-injection (Layer 4), attached by path into the developer/reviewer prompt. That model ports directly to Claude: the caller lists the PROFILE path in the Task prompt's "Context — Read These Files First" section.
- The role agents already instruct "read the PROFILE the caller attached" — that wiring survives unchanged.

**Where they live:** leave them at `.pi/expertise/{domain}/PROFILE.md` (no move needed; the path is just a string in prompts). Optionally mirror/relocate to a neutral path (e.g. `dev/expertise/` or `.claude/expertise/`) if the `.pi/` tree is being retired by the overall port — that is a cross-slice decision; this slice only requires the paths be stable and referenced consistently.

**Optional native lever — the `skills` frontmatter field.** Claude Code agents support a `skills:` list that preloads full content at startup. PROFILEs are not skills, so this does not apply to them directly. But if a domain's reference text is wanted ALWAYS-on for a role (vs. attached per-task), the cleaner native option than a profile-subagent is to keep the PROFILE as a file and reference its path in the agent body's required-reading. Recommendation stands: pass-by-path per task; do not preload, because a developer usually touches only one domain per task and preloading all four would bloat every dispatch.

**Routing heuristic** (carries over verbatim from `subagent-dispatch.md` § Expertise Profile Selection and APPEND_SYSTEM Composition): task touches `packages/core/` → core; `packages/cli/` → cli; `packages/apps/backend/` → backend; `packages/apps/web/` → web; multiple → multiple; docs/config/`.pi/` only → none. This heuristic belongs in CLAUDE.md (so the main session applies it) and in the rewritten dispatch standard.

**Rejected alternative — profile-as-subagent:** only worth it if you wanted a domain expert to autonomously answer "how does X work in core?" in its own context window. Today no skill needs that; `subagent-dispatch.md` and AGENTS.md treat profiles purely as attached context. If a future need appears, a single generic "domain-expert" agent that takes `{domain}` + question in its prompt beats four near-identical agent files.

---

## 3. The 4-layer composition model with no spawn-time composition

Pi's model (APPEND_SYSTEM § Composition + orchestrator.md § Composition): when spawning a subagent, the orchestrator stacks Layer 1 `AGENTS.md` + Layer 2 `build-standards.md` + Layer 3 `{role}.md` + Layer 4 `{domain}/PROFILE.md`. The Pi `subagent()` tool composed these at spawn time.

Claude Code has no spawn-time layered system prompt. The composition splits into BAKED vs PASSED:

| Layer | Pi source | Claude port | Mechanism |
|-------|-----------|-------------|-----------|
| 1 — System awareness | `AGENTS.md` | PASSED | Listed by path in the Task prompt's "Read These Files First". Also condensed into CLAUDE.md so it is ambient for the main session. |
| 2 — Coding standards | `.pi/standards/build-standards.md` | PASSED | Listed by path in the Task prompt for every code-touching dispatch. |
| 3 — Role behavior | `.pi/agents/{role}.md` | BAKED | Becomes the agent file body — this is the subagent's system prompt. Selected via `subagent_type`. |
| 4 — Domain expertise | `.pi/expertise/{domain}/PROFILE.md` | PASSED | Listed by path (first) in the Task prompt, per the routing heuristic. |

So: **Layer 3 is the only one that is structurally native (it IS the agent file). Layers 1, 2, 4 collapse into "a curated file list the caller writes into the Task prompt."** This is exactly the pattern `subagent-dispatch.md` already documents (the "Context — Read These Files First" template). The dispatch standard therefore needs only light edits: replace the `subagent({agent, task, agentScope})` tool-call snippets with Task-tool / `subagent_type` invocation, drop the pre-flight `action:"list"` check, and state explicitly that Layers 1/2/4 are passed in the prompt because there is no spawn-time stack.

Subtlety — the orchestrator's self-description ("You are the assembler of the 4-layer context stack") must be reframed: it no longer assembles a stack for a tool; it AUTHORS a context-rich Task prompt. Same judgment work (which role, which profiles, which files), different output (prose prompt, not tool args).

Nesting (resolved — not a constraint): Claude Code (v2.1.172+) supports nested subagents to depth 5. Pi's flow — orchestrator dispatches developer + reviewer — ports directly: keep `orchestrator.md` as a real subagent and include `Agent` in its `tools` so it can spawn the others. The only requirement is that every layer that needs to dispatch keeps `Agent` in its toolset (orchestrator yes; developer/reviewer/pm/gitboss no — they are leaves). Both shapes work:
- **(A) Orchestrator-as-subagent (recommended for fidelity):** main session dispatches `orchestrator`; orchestrator dispatches `developer`/`reviewer`. Preserves Pi's exact chain. Requires `tools: ..., Agent` on orchestrator.
- **(B) Orchestrator-as-main-session:** the main loop adopts the orchestrator persona (via CLAUDE.md or `claude --agent orchestrator`) and dispatches developer/reviewer directly. Simpler, one fewer hop.
Pick per how the skills slice (execute-prd/ship) invokes the flow; document the choice in CLAUDE.md. Either way, the nested subagents' intermediate output stays out of the main conversation — only the orchestrator's final report surfaces, which matches Pi's "returns the subagent's final assistant message" contract.

---

## 4. product-manager cross-model secondary review

Pi config: `product-manager: { primary: anthropic/claude-opus-4-6, secondary: openai/gpt-5.3 }`. Pi runs the PM's work and gets a second-model critique (the `/review` "cross-model review" referenced throughout the role + APPEND_SYSTEM Plan Lifecycle). Claude Code agents take a SINGLE `model:` — there is no native "primary + secondary" field, and Claude Code cannot call an OpenAI model.

Port options, best first:
1. **Dedicated cross-model reviewer agent.** Add `.claude/agents/pm-reviewer.md` (or reuse `reviewer.md` Role 3 "cross-model review") pinned to a DIFFERENT Claude model than product-manager (e.g. PM on `opus`, pm-reviewer on `sonnet`, or vice-versa). The plan-lifecycle `/review` step dispatches it as an explicit second pass over the PM's plan/PRD. This preserves the "two independent model opinions" intent within the Claude family. Cross-FAMILY (OpenAI) review is lost.
2. **External model via MCP/CLI.** If a true second vendor is required, wire an OpenAI call as an MCP tool or a `Bash` script the reviewer invokes. Heavier; introduces an external dependency and credentials; only if the cross-vendor diversity is judged essential. Likely out of scope for an initial port — flag as future.
3. **Accept single-model, document the gap.** Drop the secondary; rely on the grumpy-reviewer pass. Lowest fidelity; note explicitly that cross-model diversity was a deliberate Pi choice now lost.

Recommendation: option 1 for the port (different-model second pass within Claude), with option 2 noted as the path if cross-vendor diversity proves to matter. The `/review` command surface itself is owned by the plan-mode/skills slice — coordinate so its implementation dispatches the pm-reviewer agent.

---

## 5. Gaps with no clean equivalent

- **Cross-vendor model review.** OpenAI secondary (gpt-5.3) cannot run inside Claude Code natively. Mitigated partially by a different-Claude-model reviewer (§4 opt 1); full parity needs MCP/CLI bridge (§4 opt 2).
- **Nested subagent spawning.** NOT a gap — supported to depth 5 (v2.1.172+). Orchestrator keeps its dispatch chain; just include `Agent` in its `tools` (§3). Listed here only to retract the earlier concern.
- **Spawn-time tool pre-flight (`subagent({action:"list"})` HALT protocol).** No equivalent and not needed — the Task tool is always available. Drop the pre-flight + no-silent-fallback HALT from the dispatch standard.
- **`pi-subagents` parallel/chained execution.** Pi lists `npm:pi-subagents` in `settings.json` packages; skills (execute-prd/ship) rely on it for parallel/sequential subagent runs. Claude's Task tool can run multiple subagents concurrently in one turn but has no built-in chaining/dependency engine. OWNED BY ANOTHER SLICE — flag that the parallel-dispatch semantics in `subagent-dispatch.md` § Key Principle 4 ("never run parallel subagents that edit the same codebase") still apply and must be re-expressed for Task-tool concurrency.
- **`agentScope: "project"` parameter.** No equivalent needed — Claude discovers `.claude/agents/` automatically. Pure deletion.
- **`lsp` tool.** No Claude equivalent; type info comes from Bash `npm run typecheck`. Minor.
- **Plan-mode slash-command coupling.** product-manager + orchestrator reference `/plan`, `/review`, `/pre-mortem`, `/approve`, `/build`, `/ship`, `/wrap`. These are the plan-mode extension (cross-slice). Agent bodies must be re-pointed at whatever those become in the Claude port; do not silently leave dead `/`-command references.
- **`@agent` mention invocation.** gitboss docs use `@gitboss merge` / `@reviewer` mention syntax. Claude Code invokes subagents via Task `subagent_type` (and optional auto-delegation by `description`), not `@`-mentions in the same way. Update the "How To Invoke" sections to Task-tool phrasing.

---

## Ordered task list (this slice)

1. **Rewrite the dispatch standard** → port `.pi/standards/subagent-dispatch.md` to the Claude model: replace `subagent({agent,task,agentScope})` snippets with Task-tool/`subagent_type` invocation; delete the pre-flight `action:"list"` HALT; state that Layers 1/2/4 are passed in the prompt (no spawn-time stack); keep the prompt template, file-list-first principle, expertise-selection table, and the "no parallel edits to same code" rule (re-expressed for Task concurrency). Everything below references this. (Coordinate the parallel-execution wording with the pi-subagents slice.)
2. **Create `.claude/agents/developer.md`** — port body verbatim; rewrite Composition section to BAKED/PASSED; frontmatter `tools: Read, Bash, Edit, Write, Grep, Glob`, `model: sonnet`; drop `lsp`.
3. **Create `.claude/agents/reviewer.md`** — port verbatim; rewrite Composition; `tools: Read, Bash, Grep, Glob`, `model: sonnet`; drop `lsp`.
4. **Create `.claude/agents/orchestrator.md`** — port verbatim; rewrite Composition to "author context-rich Task prompts"; KEEP `Agent` in tools so it can dispatch developer/reviewer (nesting works to depth 5); document chosen shape (subagent vs main-session); `tools: Read, Bash, Grep, Glob, Agent`, `model: opus`.
5. **Create `.claude/agents/product-manager.md`** — port body; keep "don't hand-write plan.md"; re-point or flag plan-mode `/`-commands as cross-slice; `tools: Read, Bash, Grep, Glob`, `model: opus`. Then **create `.claude/agents/pm-reviewer.md`** (different Claude model) for the cross-model second pass (§4 opt 1).
6. **Create `.claude/agents/gitboss.md`** — port verbatim; rewrite "How To Invoke" from `@gitboss` to Task-tool phrasing; flag `/release` as cross-slice; `tools: Read, Bash`, `model: sonnet`.
7. **Keep the 4 PROFILEs in place** (no agent wrappers); verify every path reference (in the new agent bodies + dispatch standard) points at the stable PROFILE location; decide with the overall port whether `.pi/expertise/` stays or relocates.
8. **Add a routing/composition section to CLAUDE.md** — condense AGENTS.md [Roles]/[Expertise]/[Delegation]: which `subagent_type` to use when, the domain→profile attach heuristic, the BAKED-vs-PASSED composition rule, and the orchestrator-as-main-session note. This is what makes the main session route correctly.

### Cross-slice flags
- Plan-mode `/`-commands (`/plan` `/review` `/pre-mortem` `/approve` `/build` `/ship` `/wrap`) — skills/plan-mode slice. The `/review` port must dispatch the new `pm-reviewer` agent.
- `pi-subagents` parallel/chained execution — its own slice. Concurrency rules in the dispatch standard depend on its resolution.
- `/release` command (gitboss) — release skill slice.
- Whether `.pi/` is retired (affects whether agents/profiles relocate) — overall port owner.

### Spec verification (resolved 2026-06-19, against https://code.claude.com/docs/en/sub-agents.md)
- `model:` accepts `opus`/`sonnet`/`haiku`/`fable`, full ids, or `inherit` (default `inherit`). Alias values used above are valid.
- `tools:` is a comma-separated allowlist string; omitting it inherits all tools. `disallowedTools:` is a denylist applied before `tools`. The frontmatter blocks above are correct as written.
- Nesting is supported to depth 5; spawning requires `Agent` in the subagent's `tools` (reflected in orchestrator's frontmatter).
- Bonus fields available if useful later: `skills` (preload skill content), `effort` (per-agent reasoning effort — could pin reviewer higher), `isolation: worktree` (ties into the branch/worktree protocol in APPEND_SYSTEM), `memory` (persistent per-agent memory — candidate for orchestrator's between-task intelligence). None required for a faithful port; noted as upside.
