# Review: Project-Agent Meeting-Agenda Prep — grounded fan-out

> /ship Phase 1.3 cross-model review, run 2026-06-23 by an independent reviewer subagent against the plan + pre-mortem. Verdict carried into the PRD as the correctness contract.

**Type**: Plan · **Audience**: User (ships to `packages/runtime/profiles/` + `skills/`) · **Path**: Full · **Complexity**: Large · **Recommended Track**: full

## Verdict: Approve with suggestions — `STRUCTURAL_BLOCKERS: none`

The architecture is sound, every codebase claim is verified accurate, the pre-mortem exists (required for Large) and is high-quality. None of the concerns make the plan un-buildable. The five mitigations below MUST be carried into the PRD as acceptance criteria — they are refinements to the build contract, not structural rewrites.

## The five PRD-binding ACs (the correctness contract)

1. **Defer the WS-5 cache (Concern 1, HIGH).** mtime keying cannot detect server-side Jira changes → an mtime-keyed cache re-serves the exact stale fact this effort fixes, now stamped `verifiedAt` (false authority) under a green test suite. No latency problem exists (selection is deterministic/fast); backlog #5 gates the cache on a *measured* latency problem. **Decision: defer for v1.** If ever built: cache only file-derived fields and ALWAYS re-verify `tickets[]` live; never a TTL ceiling.

2. **Harness-agnostic spawn + inline fallback (Concern 2, HIGH→MEDIUM, non-optional).** Profile contains zero tool names (pure disposition prose); skill says "use your subagent/Task capability to spawn one grounding agent per unique project; **if no subagent tool is available, adopt the disposition inline and ground sequentially.**" Verify: `grep -nE 'subagent\(|agentScope|\.pi/|Task\('` over the shipped files returns nothing.

3. **Conditional F3 relaxation (Concern 3, MEDIUM — the hinge).** The F3 batch rule (`prepare-meeting-agenda/SKILL.md:98-106`) and the AC1 gate (`:120-132`) may be relaxed ONLY while isolation holds. Prose must read: "when each agenda is grounded+synthesized in an isolated subagent, per-agenda degradation is structurally prevented; **when running inline/degraded, the F3 rule AND the AC1 gate fully apply.**" Keep AC1 verbatim-equivalent. Relaxing it unconditionally re-opens the skeleton-agenda regression the skill exists to prevent.

4. **Single-source the bundle schema (Concern 4, MEDIUM).** Define the grounded-bundle schema EXACTLY ONCE in `project-agent.md`. Both `/project` and `prepare-meeting-agenda` reference it by pointer; never re-describe the field list.

5. **`/project` live-grounding is additive read-only (Concern 5, MEDIUM).** `/project` is read-only today (no LLM in data path, no Jira). On-when-working live-grounding is additive read-only *verification* (never writes — live Jira reads don't violate the write-invariant), gated on-when-working, and OFF on a bare `arete project open` so open stays fast. Promote to an explicit AC.

Plus **Concern 6 (MEDIUM)**: WS-D must RECONCILE `_authoring-guide.md:359` ("patterns run inline, no subagent"), not just append — distinguish "inline expert patterns (default)" from "sanctioned subagent-fan-out (batch + multi-project, graceful inline degradation)."

## Test coverage

- Cache deferred → its (critical) changed-ticket test has no home this round; capture the requirement in the deferral note.
- Dedup is pure skill prose (no code) → "skill authoring — verified by AC checklist + dry-run."
- Markdown-dominant tasks → documentation-only exception; gate on `npm run typecheck && npm test` staying green (no regressions) + AC checklist + grep verifications.

## Strengths

The core reframe is right — reliability is the *disposition*, not context volume. Shared profile consumed two ways (adopt/spawn) is correct DRY. Dedup at the grounding boundary keyed by unique project is the load-bearing efficiency insight. "Keep retrieval deterministic; the agent reasons on top" preserves reproducibility. Carve-outs show good YAGNI restraint. The profile-vs-`agentType` decision is verified correct (`packages/runtime/profiles/` ships; no `.claude/agents/`).

## Devil's Advocate

**If this fails, it will be because** the spawn mechanism doesn't degrade gracefully and the F3 relaxation was made unconditional — shipping a Jira-staleness fix that quietly re-opens the degradation hole (Concern 3 is the hinge).

**The worst outcome would be** the cache ships mtime-keyed over live Jira facts and the agenda again asserts a stale ticket — now with a `verifiedAt` stamp lending false authority and a green suite that never exercised the server-side-change path. Strictly worse than today's bug (Concern 1 — resolved by deferring).

## Dependency order

Correct: WS-A (profile + bundle contract) first; B/C/D consume it; E last. **Ordering gate**: WS-A must FINALIZE the bundle schema (not sketch it) before C and D reference it — pin schema-finalized as a WS-A exit gate.
