---
slug: project-agent-meeting-prep
status: approved
has_pre_mortem: true
has_review: true
has_prd: false
created: 2026-06-22
approved: 2026-06-22
reviewed: 2026-06-23
review_verdict: READY-WITH-CHANGES → descoped to inline (gate convergence); CR-1/2/3 incorporated
---

# Plan: Project-Agent Meeting-Agenda Prep — grounded disposition (inline)

> Status: APPROVED (2026-06-22), REVISED post-gate (2026-06-23). Both Phase-1 gates (pre-mortem PAUSE on 2 CRITICAL + review CR-6) converged: the spawn-fan-out is over-built and risky for the scale; the **inline grounding disposition** fixes all three original errors. John's decision: **descope to inline-first.** Fan-out deferred to a future, spike-proven optimization.
> Related memory: [[project_plan_context_injection]], [[project_supersession_gap]], [[feedback_ai_fix_escalation]], [[feedback_cli_review_surface]], [[feedback_poc_vs_fair_test]].
> Backlog this extends: `dev/work/backlog/plan-context-injection-followups.md`.
> Gate artifacts: `pre-mortem.md`, `review.md` (this dir).

## Problem

WS-1 of `plan-context-injection` shipped (v0.18.0; arete-reserv runs the `winddown-approval` worktree at v0.19.0) and is wired into the agenda path: `selectProjectDocs` traverse+select → the meeting brief's `Project document` section → the `agenda-scaffold.ts:226` project-doc candidate extractor. So project **documents** now reach agendas.

But the felt failure is not "the right doc didn't surface" — it's **the agenda confidently asserts a superseded decision and a wrong Jira fact.** Worked example (2026-06-22): the primary agent built `now/agendas/2026-06-18-glance-email-templates-weekly.md` with three errors in the Status Letter section — (1) the superseded "infer recipient from claim-party-table lookup" decision (reversed 6/8), (2) wrong PLAT-11323 description ("policy-state field" vs. actual "Recipients Table"), (3) a stale commitment hash. The `/project status-letter-automation` agent fixed all three because it had the README **Decisions** body + working docs AND called the Atlassian MCP to verify tickets live.

All three errors fall OUTSIDE WS-1's scope. WS-1 surfaces a single selected doc body excerpt as raw candidate bullets ("what am I wrestling with"). It does NOT (a) reconcile decisions across docs into a canonical current view, (b) detect supersession of a stale decision, or (c) ground-truth Jira titles/owners live.

## Insight

**CR-1 correction (verified against code, 2026-06-23):** `/project`'s reliability was NOT because `arete project open` handed it the canonical decisions. `assembleBriefForProject` (`brief-assemblers.ts:1423-1428, 1535`) emits a README **Background** + latest **Status Updates** excerpt, a capped doc excerpt, and *area-tagged memory* "Decisions & learnings" items — it does NOT parse the README's own `## Decisions` section, and it returns **zero Jira**. The `/project status-letter-automation` agent got the right decisions by **reading the README body directly** and got ticket truth by **calling the Atlassian MCP**. So the reliability was a *behavior*, not a richer payload — which is the whole point.

What made `/project` reliable decomposes into: (1) reading the actual project body (incl. the README `## Decisions` block, not just the brief's excerpt), (2) a **grounding disposition** — verify ticket claims live via MCP and notice superseded decisions, (3) single-project focus. The load-bearing piece is the *disposition* (2) + reading the real decisions (1) — both behavioral, neither emerges from loading the brief.

Reframe: not "projects ARE agents" but "there is a reusable **project-agent disposition** — read-full-body (incl. Decisions) + ground-claims-live + flag-supersession — invoked two ways, BOTH inline (no subprocess)":

- **Adopt** (interactive): `/project <slug>` → the main agent takes on the disposition so John can converse with it.
- **Inline grounding** (programmatic): meeting-agenda prep, in the prime's own context, resolves the meeting's project(s), grounds each unique project once (loop, dedup), and feeds the grounded facts into synthesis.

Same disposition, one shareable source (`profiles/project-agent.md`). **No subprocess spawn** — see § Why inline, not fan-out.

## Scope

PRIMARY use is **meeting-agenda preparation**, NOT day planning. Trigger reality:

- Once/day batch: `/daily-plan` → finalize plan → agent offers "prepare agendas for X, Y, Z?" → yes → prepare via the skill.
- Occasional mid-day ad-hoc: John adds a calendar event and asks for one agenda.

So the hot path is a small batch (~3 meetings) once a day, plus occasional single ad-hoc.

## Why inline, not fan-out (gate outcome, 2026-06-23)

The original design fanned out one grounding *subagent* per project. Both Phase-1 gates rejected it for this scale:

- **Pre-mortem (2 CRITICAL → PAUSE):** prose can't *enforce* that the prime spawns subagents (inline is the natural LLM path), NOR that returned bundles reach the synthesized agenda (free-form chat, no schema validation). That replays WS-1's exact CR-3 "dark code" failure (extracted-but-never-routed) — on the very Jira/supersession facts this effort exists to fix, in a layer with zero test coverage. No product skill spawns LLM subagents today; `_authoring-guide.md:359` forbids it.
- **Review (CR-6):** for ~3 meetings/day, process isolation's only unique payoff is wall-clock parallelism — explicitly not valued here. The simplest thing that fixes all three errors is the disposition run inline with per-project dedup in a loop.

Both converge: the **disposition + the shared profile** are the sound, necessary core; the **spawn** is risky and unnecessary at this scale. Aligns with [[feedback_ai_fix_escalation]] (cheapest-first; don't jump to a pipeline). Decision: **inline.** Bonus: inline grounding is *already* a sanctioned authoring pattern (an inline expert pattern), so the authoring-guide conflict disappears, and the work becomes **prose-only** — no `agenda-scaffold.ts`/`brief-assemblers.ts` changes, so `brief-no-llm.test.ts` is untouched.

## Architecture (inline)

Runs entirely in the prime's context — no subprocess:

```
PRIME
  1. Resolve which projects each meeting touches            ← deterministic (area→project + --project pin), no LLM
  2. Dedup to the UNIQUE project set across the whole batch
  3. For EACH unique project, ground it ONCE (inline loop):
       read the project BODY directly — incl. the README `## Decisions` block + working/ docs
         (NOT just `arete project open`'s excerpt — see Insight CR-1)
       + `arete project open <slug>` for the deterministic brief signal
       + verify referenced Jira ticket/owner claims LIVE (Atlassian MCP)
       + flag superseded decisions
       → write a grounded bundle to a DISK ARTIFACT (see § anti-dark-code)
       (a project touching 2 meetings is grounded once; its bundle reused)
  4. For each meeting, SYNTHESIZE the agenda from:
       existing `arete agenda scaffold` signal (attendees, commitments, recent-meeting callbacks, 1:1 prompts)
       + the relevant grounded bundle(s)
       + the meeting-type template
```

Load-bearing design decisions:

- **Dedup by PROJECT (ground once, reuse across meetings).** Trivial inline since the prime holds the bundles. Grounding query for a shared project = the union of the meetings that touch it. (Resolves the old WS-B/WS-C contradiction, review CR-3.)
- **Read the real Decisions body** (CR-1). The disposition must open the README `## Decisions` section + working docs directly and verify Jira live — it must NOT assume `arete project open` provides canonical decisions or any Jira (it provides neither).
- **F3 anti-degradation stays IN FORCE** (review CR-2 / pre-mortem). Synthesis still runs in the shared prime context for the whole batch, so the "agenda #4 of 4 skeletons" failure condition is fully present. The AC1 self-check (`prepare-meeting-agenda/SKILL.md:120-132`) remains mandatory per agenda. **Do not relax it** — the earlier "isolation retires F3" reasoning was wrong (isolation would only apply to grounding, never to synthesis).
- **Synthesis augments the scaffold, never replaces it.** Grounded bundles are a NEW input to the existing scaffold/merge. The scaffold still owns the meeting-shaped work (template, owed-sweep, 1:1 prompts, the AC1 self-check).
- **Carve-outs:** single meeting, single project → ground that one project inline, synthesize. Single meeting, multi-project → ground each, synthesize the one agenda. Batch → loop grounding over the unique set, then synthesize each meeting. Same code path; no special-casing.

## Anti-dark-code (closes the CRITICAL)

The pre-mortem's core CRITICAL — "the grounded facts never reach the agenda" — is handled inline by making the bundle a **disk artifact + a synthesis gate**:

- Each project's grounded bundle is written to a transient file (e.g. `now/.cache/agenda-grounding/<slug>.md` or a run-scoped temp path) — a real artifact, not chat prose, so it is inspectable and survives within the run.
- The AC1 self-check gains one item (**CR / dark-code gate**): *every Jira key, owner, and decision asserted in a saved agenda MUST trace to a grounded-bundle entry (verified-live or read-from-Decisions), never to a doc excerpt or model memory.* An agenda asserting an unverified ticket/decision is a FAILURE — the exact regression this effort exists to prevent.

## Grounded-bundle contract (to pin in WS-A)

A compact, source-tagged descriptor the disposition produces (written to the disk artifact above). Fields:

- `slug`, `area`
- `decisions[]` — current/canonical decisions read from the README `## Decisions` block + working docs; each with a `superseded?` flag + a note when a conflicting earlier decision was detected (flag-not-resolve is acceptable v1).
- `tickets[]` — `{key, title, status, owner, verifiedAt}` for referenced Jira keys, **verified live** via Atlassian MCP (fixes errors 2/3). On MCP-unavailable/unauth: mark `verified:false` with reason — never silently assert unverified ticket facts.
- `openQuestions[]`, `whatsNew` — from the project body + `arete project open`.
- `commitments[]` — open commitments with verified IDs (fixes the stale-hash error).
- `provenance` per item (`decisions-block`/`working-doc`/`jira-live`/`jira-unverified`/`brief`).

## Workstreams (all prose; no code)

### WS-A — The reusable disposition (`profiles/project-agent.md`) + bundle contract

Author the project-agent disposition as a new **`profiles/project-agent.md`** — same shippable pattern as the existing `profiles/{pm-orchestrator,plan-reviewer,pm-advisor}.md` (frontmatter `name`/`description` + a "How You Think" body). Body = read the project body directly (incl. the README `## Decisions` block + working/ docs) + run `arete project open` for the brief signal + verify referenced Jira ticket/owner/decision claims against the Atlassian MCP before asserting + flag superseded decisions + emit the grounded bundle (schema above) to a disk artifact. Include a **live-grounding mode flag**: ON for agenda-prep; on-when-working for `/project` (NOT on a bare open — keep open fast/read-only). Single shared source for both invocation modes — chosen over a Claude Code `agentType` because Areté ships `profiles/`, not `.claude/agents/`, so it stays host-agnostic and inside the existing install surface.

### WS-B — Inline grounding loop in `prepare-meeting-agenda`

Wire the inline pipeline into the skill: deterministic scope resolution (reuse area→project + `--project`), unique-project dedup across the batch, then **a loop** that grounds each unique project once (apply the `profiles/project-agent.md` disposition inline; write its bundle to the disk artifact). No subprocess. **Effort:** when the prime is a model with selectable effort, grounding is the high-effort pass (supersession/decision reconciliation is the subtle reasoning the default path got wrong). The grounding query for a shared project = the union of meetings touching it.

### WS-C — Synthesis + the anti-dark-code gate

Per meeting, synthesize from existing `agenda scaffold` signal + the relevant grounded bundle(s) + template. Add the **CR/dark-code gate** to the AC1 self-check (§ Anti-dark-code): every Jira key/owner/decision in a saved agenda must trace to a grounded-bundle entry (verified-live or read-from-Decisions). **Keep the F3 batch anti-degradation rule fully in force** (CR-2) — synthesis shares the prime context; do not relax AC1.

### WS-D — Unify `/project` (adopt mode) + authoring-guide note

- **Unify adopt mode onto the same profile.** Refactor `/project`'s skill prose to reference `profiles/project-agent.md` so adopt + agenda-prep share ONE grounding disposition and cannot drift. Shared core = read-body + verify-live + flag-supersession; differing shell = `/project` presents to a human (read-only), agenda-prep emits the bundle. Live-grounding is on-when-working for `/project`, not on a bare open. (Note: this UPGRADES `/project` to ground live during work — it does not today.)
- **Authoring-guide note.** Document the project-agent grounding disposition as a blessed **inline expert pattern** (it fits the existing `_authoring-guide.md:320-360` "Expert Agent Patterns" norm — no subagent, runs inline). No override of the "no subagent" rule is needed now that we're inline.

### WS-E — Deferred (out of this build)

- **Spawn-fan-out as a future optimization.** Revisit ONLY if batch size grows enough that synthesis wall-clock or prime context-size actually hurts. If pursued: prove it with a throwaway spike first (spawn round-trips + bundle demonstrably reaches the agenda via the disk artifact), and prefer a real `.claude/agents/` agentType over prose-spawning. Captured in `dev/work/backlog/plan-context-injection-followups.md`.
- **Supersession resolution depth** — v1 only FLAGS conflicting decisions; deciding which won is the harder, separate problem ([[project_supersession_gap]]).
- **Cross-run disk cache** (old WS-5) — within-run dedup already grounds each project once; a persistent cross-run cache is a later latency optimization, not needed for correctness.

## Resolved decisions

1. **Inline, not fan-out (2026-06-23, post-gate).** Both Phase-1 gates converged that the spawn-fan-out is over-built and risky for ~3-meetings/day; the inline disposition fixes all three errors. Fan-out deferred to WS-E (spike-gated). Aligns with [[feedback_ai_fix_escalation]].
2. **Disposition shipped as `profiles/project-agent.md`** — NOT a Claude Code `agentType`. Areté ships `profiles/`; host-agnostic; single shared source for both modes.
3. **Grounding is the high-effort pass** (was: "Opus subagent") — supersession/decision-reconciliation is the subtle reasoning the default path failed.
4. **Unify `/project` onto the shared profile (yes)** — live-grounding gated on-when-working, not on bare open. → WS-D.
5. **Read the real `## Decisions` body + verify Jira live (CR-1).** Do not assume `arete project open` provides decisions or Jira — verified: it provides neither.
6. **F3 / AC1 self-check stays in force (CR-2).** Inline synthesis shares the prime context; the degradation risk is unchanged.

## Out of scope

- Day planning (`--week`/`--day` aggregator) — already shipped; unchanged here.
- Project weighting (driving-vs-reference) — separate backlog item (#3 in followups).
- A web/UI surface for agenda review ([[feedback_cli_review_surface]]) — later skin.

