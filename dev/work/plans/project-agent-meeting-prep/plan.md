---
slug: project-agent-meeting-prep
status: approved
has_pre_mortem: false
has_review: false
has_prd: false
created: 2026-06-22
approved: 2026-06-22
---

# Plan: Project-Agent Meeting-Agenda Prep — grounded fan-out

> Status: APPROVED (2026-06-22) — design converged with John; all four Open Decisions resolved (see § Resolved decisions). Cost/timeline not a constraint — build the full architecture.
> Related memory: [[project_plan_context_injection]], [[project_supersession_gap]], [[feedback_ai_fix_escalation]], [[feedback_cli_review_surface]].
> Backlog this extends: `dev/work/backlog/plan-context-injection-followups.md`.

## Problem

WS-1 of `plan-context-injection` shipped (v0.18.0; arete-reserv runs the `winddown-approval` worktree at v0.19.0) and is wired into the agenda path: `selectProjectDocs` traverse+select → the meeting brief's `Project document` section → the `agenda-scaffold.ts:226` project-doc candidate extractor. So project **documents** now reach agendas.

But the felt failure is not "the right doc didn't surface" — it's **the agenda confidently asserts a superseded decision and a wrong Jira fact.** Worked example (2026-06-22): the primary agent built `now/agendas/2026-06-18-glance-email-templates-weekly.md` with three errors in the Status Letter section — (1) the superseded "infer recipient from claim-party-table lookup" decision (reversed 6/8), (2) wrong PLAT-11323 description ("policy-state field" vs. actual "Recipients Table"), (3) a stale commitment hash. The `/project status-letter-automation` agent fixed all three because it had the README **Decisions** body + working docs AND called the Atlassian MCP to verify tickets live.

All three errors fall OUTSIDE WS-1's scope. WS-1 surfaces a single selected doc body excerpt as raw candidate bullets ("what am I wrestling with"). It does NOT (a) reconcile decisions across docs into a canonical current view, (b) detect supersession of a stale decision, or (c) ground-truth Jira titles/owners live.

## Insight

What made `/project` reliable decomposes into three separable things: (1) full-body context, (2) a **grounding disposition** — it verifies ticket claims live and notices superseded decisions, (3) single-project focus. The reliability John feels is mostly the *disposition* (2), which is behavioral — it will NOT emerge for free from loading context.

Reframe: not "projects ARE agents" but "there is a reusable **project-agent disposition** — load-full-body + ground-claims-live + flag-supersession — invoked two ways":

- **Adopt** (interactive): `/project <slug>` → the main agent takes on the disposition so John can converse with it. No subagent.
- **Spawn** (programmatic): meeting-agenda prep fans out one project-agent per project, throwaway, parallel.

Same disposition, one shareable source; fan-out reserved for the cases where context-isolation + parallelism actually pay (batch + multi-project).

## Scope

PRIMARY use is **meeting-agenda preparation**, NOT day planning. Trigger reality:

- Once/day batch: `/daily-plan` → finalize plan → agent offers "prepare agendas for X, Y, Z?" → yes → prepare via the skill.
- Occasional mid-day ad-hoc: John adds a calendar event and asks for one agenda.

So the hot path is a small batch (~3 meetings) once a day, plus occasional single ad-hoc. Cost overhead of fan-out is acceptable at this cadence.

## Verified findings (codebase reality, 2026-06-22)

- **WS-1 is live and wired.** `selectProjectDocs` ×7 in `brief-assemblers.ts`; the WS-1 project-doc extractor at `agenda-scaffold.ts:226` (`source:'project-doc'`). Docs reach agendas; decisions/supersession/Jira do not.
- **No new code primitive required.** The harness `Agent`/`Task` tool + `arete` CLI + Atlassian MCP all exist at the host level. A spawned general-purpose subagent inherits cwd, can run `arete project open <slug>`, and can call the Atlassian MCP — so it can load AND ground a project itself.
- **This is a net-new skill-authoring pattern.** No product skill spawns Claude subagents today. `process-meetings` parallelizes via parallel CLI calls (`arete meeting extract … &`), not LLM subagents. The authoring guide (`_authoring-guide.md:359`) explicitly states expert patterns run inline, no subagent. So the authoring guide must bless subagent-fan-out as a distinct, sanctioned pattern.
- **Subagent isolation retires the F3 batch anti-degradation rule.** `prepare-meeting-agenda/SKILL.md:98-106` exists because, in one context, batching N agendas degrades the expensive qualitative synthesis to skeletons. Per-meeting / per-project isolated contexts make that degradation structurally impossible — the rule's reason to exist goes away (relax to a self-check, don't delete blindly).
- **WS-5 cache becomes worth building.** The deferred WS-5 disk cache note (`plan-context-injection-followups.md` #5) says it only pays "once a future workstream adds LLM distillation of project bodies." The grounding subagent IS that distillation — its compact bundle is exactly the cacheable, reusable per-project unit.

## Architecture (locked with John)

Pipeline — **prime resolves scope, subagents load + ground, prime synthesizes**:

```
PRIME (lean context throughout)
  1. Resolve which projects each meeting touches            ← deterministic (area→project + --project pin), no LLM
  2. Dedup to the UNIQUE project set across the whole batch
  3. Fan out ONE grounding subagent per unique project:
       subagent: arete project open <slug> (deterministic facts)
                 + verify ticket/owner/decision claims live (Atlassian MCP)
                 + flag superseded decisions
                 → returns a COMPACT grounded bundle (not the raw body)
       (a project touching 2 meetings is grounded ONCE)
  4. For each meeting, SYNTHESIZE the agenda from:
       existing `arete agenda scaffold` signal (attendees, commitments, recent-meeting callbacks, 1:1 prompts)
       + the relevant grounded bundle(s)
       + the meeting-type template
```

Load-bearing design decisions:

- **Dedup at the GROUNDING boundary, not the LOAD boundary.** Loading is a cheap deterministic CLI call; grounding (live Jira + supersession reasoning) is the expensive, valuable work. Keying the fan-out by *project* (not by *meeting*) grounds each shared project exactly once. Passing raw project bodies through the prime to per-meeting subagents would re-ground shared projects N times AND bloat prompts.
- **Prime context stays lean.** The full project body lives only inside its grounding subagent; only the compact bundle (~1-2k) returns. The prime never holds N full project bodies. This is the real reason to spawn rather than have the prime load-and-pass.
- **Keep retrieval deterministic; the agent reasons on top.** The grounding subagent USES `arete project open` for its facts and adds the live-grounding reasoning layer — it does NOT replace the deterministic CLI data path. Preserves reproducibility of the underlying facts (two runs → same facts; grounding reasoning is the only LLM-variable layer).
- **Synthesis augments the scaffold, never replaces it.** Grounded bundles are a NEW input to the existing scaffold/merge. The scaffold still owns the meeting-shaped work (template, owed-sweep, 1:1 prompts, anti-degradation self-check).
- **Carve-outs (don't over-spawn):**
  - Single meeting, single project (common ad-hoc) → adopt the disposition INLINE, no spawn.
  - Single meeting, multi-project → fan out grounding per project (parallel + isolation), prime synthesizes the one agenda.
  - Batch → full pipeline.
  - Prime synthesizes all agendas for small batches (~3); fan out per-meeting synthesis subagents ONLY if a batch ever gets large. Do not build the parallel-synthesis path until needed.

## Grounded-bundle contract (to pin in WS-A)

A compact, source-tagged descriptor the subagent returns to the prime. Draft fields:

- `slug`, `area`
- `decisions[]` — current/canonical decisions, each with a `superseded?` flag + a note when the bundle detected a conflicting earlier decision (resolution is best-effort; flag-not-resolve is acceptable v1).
- `tickets[]` — `{key, title, status, owner, verifiedAt}` for Jira keys referenced by the project, **verified live** against the Atlassian MCP (the part that fixes errors 2/3).
- `openQuestions[]`, `whatsNew` — carried from the existing project-read.
- `commitments[]` — open commitments with verified IDs (fixes the stale-hash error).
- `provenance` per item (`published`/`reference`/`draft`/`jira-live`).

## Workstreams

### WS-A — The reusable disposition (`profiles/project-agent.md`) + bundle contract

Author the project-agent disposition as a new **`profiles/project-agent.md`** — same shippable pattern as the existing `profiles/{pm-orchestrator,plan-reviewer,pm-advisor}.md` (frontmatter `name`/`description` + a "How You Think" body). Body = load full body via `arete project open`, verify ticket/owner/decision claims against the Atlassian MCP before asserting, flag superseded decisions, return the bundle. Include a **live-grounding mode flag**: always-on for agenda-prep spawns; on-when-working for `/project` (NOT on a bare open — keep open fast/read-only). Also define the grounded-bundle schema (above). This profile is the SINGLE shared source both invocation modes consume — chosen over a Claude Code `agentType` because Areté ships `profiles/`, not `.claude/agents/`, so a profile stays host-agnostic and inside the existing install surface.

### WS-B — Grounding subagent (spawn mode)

The spawn pattern: prime spawns N grounding subagents (one per unique project) — general-purpose `Agent` with the `profiles/project-agent.md` body passed as the prompt + the meeting context (title/attendees as the relevance query, so the bundle is meeting-relevant, not a full dump) + the project slug + live-grounding ON. Each returns its bundle. **Model: Opus** — the hard task is supersession detection / cross-doc decision reconciliation, which is exactly what the cheap/default path got wrong; cost is not a constraint, so don't risk the one thing this effort exists to fix.

### WS-C — Prime orchestration in `prepare-meeting-agenda`

Wire the pipeline into the skill: deterministic scope resolution (reuse area→project + `--project`), unique-project dedup across the batch, fan-out, then synthesis from scaffold + bundles per meeting. Relax the F3 batch anti-degradation rule to a per-agenda self-check now that isolation prevents the degradation structurally (do not delete the self-check — keep AC1 gate).

### WS-D — Unify `/project` (adopt mode) + authoring-guide blessing

- **Unify adopt mode onto the same profile.** Refactor `/project`'s skill prose to reference `profiles/project-agent.md` so adopt + spawn share ONE grounding disposition and cannot drift. Shared core = load + verify-live + flag-supersession; differing shell = `/project` presents to a human (read-only), spawn returns the structured bundle. Live-grounding is on-when-working for `/project`, not on a bare open. (Note: this UPGRADES `/project` to ground live during work — it does not today.)
- **Authoring-guide blessing.** Sanction subagent-fan-out as a pattern distinct from inline expert patterns (update `_authoring-guide.md:359` context). Document: the bundle contract, when-to-spawn vs. when-to-adopt-inline, the dedup-by-project rule, and the lean-prime principle. Without this the pattern contradicts the documented norm.

### WS-E — Supersession depth + cache

- Supersession: v1 bundle FLAGS conflicting decisions; resolving which won is the harder, separate problem ([[project_supersession_gap]]). Scope the resolution layer here once the flag proves useful.
- WS-5 cache (now justified): cache the per-project grounded bundle at `.arete/cache/plan-context/<slug>.json`, slug-keyed, max-mtime invalidated — so the once-a-day batch and any mid-day re-ask reuse a fresh bundle. Build per the design preserved in `plan-context-injection/plan.md` § WS-5.

## Resolved decisions (2026-06-22)

1. **No phasing constraint.** Cost/timeline are not a concern — build the full grounded-fan-out architecture properly rather than a cheapest-first staged rollout. (The inline live-Jira-verify remains available as an early correctness check during build, but it is not the shipping target.)
2. **Spawn mechanism: general-purpose `Agent` + `profiles/project-agent.md` as the prompt** — NOT a Claude Code `agentType`. Rationale: Areté ships `profiles/`, not `.claude/agents/`; a profile is host-agnostic and is the single shared source for both modes.
3. **Model tier: Opus** for grounding subagents — supersession/decision-reconciliation is the subtle reasoning the cheap path failed; cost is not a constraint.
4. **Unify `/project` onto the shared profile (yes)** — with live-grounding gated as a mode (on-when-working, not on bare open). Prevents adopt/spawn drift. → folded into WS-D.

## Out of scope

- Day planning (`--week`/`--day` aggregator) — already shipped; unchanged here.
- Project weighting (driving-vs-reference) — separate backlog item (#3 in followups).
- A web/UI surface for agenda review ([[feedback_cli_review_surface]]) — later skin.

