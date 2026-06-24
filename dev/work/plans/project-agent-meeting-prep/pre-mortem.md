# Pre-Mortem: Project-Agent Meeting-Agenda Prep — grounded fan-out

> Run 2026-06-23 as part of /ship Phase 1.2. Plan: `dev/work/plans/project-agent-meeting-prep/plan.md`.
> Grounded against codebase reality verified the same day (Explore sweep — all of the plan's "Verified findings" confirmed current). Paths/lines below are real.

## Context that reframes the risk picture

This ships **product** artifacts (`packages/runtime/profiles/`, `packages/runtime/skills/`) that run in the **end user's** harness — not BUILD-mode `.pi/` tooling. Two consequences drive the top risks: (1) the plan's WS-B "general-purpose `Agent`" wording is builder/Pi terminology and must NOT leak into a shipped skill; (2) profiles are reference prose the harness loads via a skill's `profile:` frontmatter (`generators/skill-commands.ts:35`) and ship via `package.json` `files` → `.agents/profiles/` (`workspace.ts:320-333`).

---

### Risk 1: Harness-coupled spawn mechanism (HIGH)

**Problem**: WS-B says "prime spawns N grounding subagents (general-purpose `Agent`)". That is Pi/Claude-Code builder vocabulary. The shipped `prepare-meeting-agenda` skill runs in whatever harness the PM uses. If the profile or skill hardcodes a tool name (`subagent(...)`, `agentScope`, `Task`) or assumes a subagent tool always exists, the feature breaks in a harness without that tool — and there is no product skill that spawns subagents today (`_authoring-guide.md:359` explicitly forbids it), so there is no existing pattern to copy that is known-portable.

**Mitigation**: Author the spawn instruction harness-agnostically: "use your subagent/Task capability to spawn one grounding agent per unique project; **if no subagent tool is available, adopt the project-agent disposition inline and ground each project sequentially.**" The `project-agent.md` profile is PURE disposition prose (no tool calls). The skill owns the orchestration verbs; the profile owns the thinking.

**Verification**: `grep -nE 'subagent\(|agentScope|\.pi/' packages/runtime/profiles/project-agent.md packages/runtime/skills/prepare-meeting-agenda/SKILL.md` returns nothing; the skill contains an explicit inline-degradation clause.

---

### Risk 2: Cache serves stale live-Jira / supersession facts — reintroduces THE bug (HIGH)

**Problem**: WS-5's cache (`.arete/cache/plan-context/<slug>.json`) is keyed by **max-mtime across the project dir**. But the grounded bundle now carries (a) live-verified Jira `{status, owner, title}` and (b) LLM supersession reasoning. A Jira ticket's status changes **server-side with no file mtime change**, so an mtime-keyed cache will serve a stale ticket fact — which is *exactly* the failure this whole effort exists to fix (the wrong PLAT-11323 description). Caching the grounded bundle naively re-creates the bug under a green checkmark.

**Mitigation**: Do NOT cache live-Jira/supersession fields under mtime keying. Options, cheapest-first: (a) **defer the cache** (selection is already deterministic+fast — backlog item #5 says the cache only pays once latency hurts); (b) cache only the file-derived/deterministic portion and **always re-verify Jira live** each run; (c) add a short TTL ceiling (~minutes) to the live-verified fields. Recommend (a)/(b) over (c). Carry this to the review as the headline scope decision.

**Verification**: If the cache is built, a test proves a changed-ticket scenario is NOT served from cache; live-Jira fields are excluded from the mtime-keyed payload or re-fetched.

---

### Risk 3: F3 anti-degradation relaxation removes the only guard when spawn degrades (MEDIUM)

**Problem**: WS-C relaxes the LOAD-BEARING F3 batch rule (`prepare-meeting-agenda/SKILL.md:98-106`) to a self-check, justified by "subagent isolation makes per-agenda degradation structurally impossible." But if spawn degrades to inline (Risk 1's fallback, or a harness with no subagent tool), the isolation guarantee evaporates and F3 degradation returns — with its guard now removed.

**Mitigation**: Do NOT delete F3 or the AC1 self-check gate (`SKILL.md:120-132`). Make the relaxation **conditional**: "when each agenda was grounded+synthesized in an isolated subagent, per-agenda degradation is structurally prevented; when running inline/degraded, the F3 rule and AC1 gate still fully apply."

**Verification**: SKILL.md retains the AC1 gate verbatim-equivalent and adds an explicit inline-fallback clause that re-arms F3.

---

### Risk 4: Bundle contract drifts between adopt (`/project`) and spawn modes (MEDIUM)

**Problem**: WS-D unifies `/project` and agenda-prep onto one profile, but adopt presents to a human (prose) while spawn returns a structured bundle. If the grounded-bundle schema is described twice (once per mode), the two silently diverge.

**Mitigation**: Define the grounded-bundle schema EXACTLY ONCE inside `project-agent.md` (single source). Both the `/project` skill and the `prepare-meeting-agenda` skill reference it by pointer ("return the grounded-bundle defined in `project-agent.md`"), never re-describe it.

**Verification**: One schema block; both skills reference it by name; no second copy of the field list.

---

### Risk 5: Fan-out keyed by meeting instead of unique project (MEDIUM)

**Problem**: The load-bearing efficiency decision is **dedup at the grounding boundary, keyed by unique project** — a project touching 2 meetings is grounded once. Skill prose authored carelessly could key fan-out by meeting, re-grounding shared projects N times and bloating cost.

**Mitigation**: PRD task pins the sequence explicitly: resolve projects per meeting → **dedup to the unique project set across the whole batch** → fan out one grounding agent per unique project → synthesize per meeting from the relevant bundle(s). Include the "grounded once" assertion in skill prose.

**Verification**: skill prose contains the unique-project-set dedup step and the "grounded exactly once" wording.

---

### Risk 6: Wrong install location for the new profile (MEDIUM)

**Problem**: A developer could create `profiles/project-agent.md` at repo root or under `.pi/` (where BUILD profiles live conceptually), so it never ships to user installs. Profiles must live at `packages/runtime/profiles/` to be copied by `workspace.ts:320-333` and included by `package.json` `files`.

**Mitigation**: PRD pins the exact path `packages/runtime/profiles/project-agent.md`. Confirm it sits beside `pm-orchestrator.md`/`pm-advisor.md`/`plan-reviewer.md` and is picked up by the existing install copy (no install-code change needed).

**Verification**: file at `packages/runtime/profiles/project-agent.md`; a fresh `arete install` (or dry inspection of the copy list) includes it.

---

### Risk 7: Authoring-guide norm contradiction (MEDIUM)

**Problem**: `_authoring-guide.md:359` states expert patterns run inline, never spawning subagents. Shipping a skill that DOES spawn leaves the canonical norm self-contradictory, confusing future skill authors.

**Mitigation**: WS-D updates `_authoring-guide.md` to bless subagent-fan-out as a distinct, sanctioned pattern (when-to-spawn vs. when-to-adopt-inline, the dedup-by-project rule, the lean-prime principle, graceful degradation).

**Verification**: guide contains the new section and reconciles it with the inline-expert-pattern note at :359.

---

### Risk 8: Supersession scope creep into a resolution engine (MEDIUM)

**Problem**: WS-E could balloon into building a "which decision won" state machine ([[project_supersession_gap]]). The plan scopes v1 to FLAG-not-resolve.

**Mitigation**: Bundle contract: `decisions[]` items carry a `superseded?` flag + a note when a conflicting earlier decision is detected. Resolution is explicitly out of scope for v1.

**Verification**: profile/bundle says flag-only; no resolution/ranking logic anywhere.

---

### Risk 9: Test gate awkward for markdown-dominant work (MEDIUM)

**Problem**: Most deliverables are markdown (profile, skill prose, authoring guide) with no unit-test surface. The build-standards "tests required" gate doesn't map cleanly; a subagent may either fabricate pointless tests or skip the gate silently.

**Mitigation**: In the PRD, classify each task: code tasks (only the cache, if built; any scope helper) require `node:test` coverage incl. the stale-data scenario (Risk 2); markdown tasks declare "skill/doc authoring — verified by AC checklist + dry-run, no unit tests" per build-standards' documentation-only exception. Quality gate for markdown = `npm run typecheck && npm test` still green (no regressions) + AC checklist.

**Verification**: code tasks have tests; markdown tasks carry the explicit no-test rationale; full suite green before each commit.

---

## Summary

Total risks: **9** — 0 CRITICAL, 2 HIGH (Risk 1 harness coupling, Risk 2 cache staleness), 7 MEDIUM.

Categories covered: Platform/Integration (1,5), State/Code-Quality (2), Backward-compat (3), Reuse/Contract (4), Scope creep (8), Audience/Install (6), Documentation (7), Test patterns (9).

**Gate verdict: PROCEED** — no CRITICAL risk. The two HIGH risks both have concrete mitigations. Risk 2 (cache staleness) is the one that should drive a scope decision at the review gate: recommend **deferring or live-re-verifying** the WS-5 cache rather than caching the grounded bundle whole, because mtime-keyed caching of live-Jira facts reintroduces the exact bug this effort fixes.
