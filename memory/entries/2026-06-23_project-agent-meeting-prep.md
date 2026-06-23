# Project-agent grounding disposition for meeting agendas (2026-06-23)

## What

- **New `profiles/project-agent.md`** — a reusable grounding disposition: read the project's real `## Decisions` / `## Open Questions` body (NOT just the brief excerpt), run `arete project open` for the brief signal, verify every referenced Jira ticket live via the Atlassian MCP, flag superseded decisions, and emit a provenance-tagged grounded bundle. Has a live-grounding mode flag (ON for agenda prep; on-when-working for `/project`).
- **`prepare-meeting-agenda/SKILL.md`** — new step 4a "Ground the meeting's project(s)": resolve the projects each meeting touches, dedup to the unique set across the run, and ground each unique project ONCE inline (no subagent), writing the bundle to `now/.cache/agenda-grounding/<slug>.md`. Step 5 sources project facts from the bundle; step 5a gains item 8 — the anti-dark-code gate (every Jira/decision/owner/commitment in a saved agenda must trace to the bundle).
- **`project/SKILL.md`** — new step 3a: when the user works/reviews from a project (not a bare open), adopt the same `project-agent` disposition. Read-only-on-open boundary preserved.
- **`_authoring-guide.md`** — documented "grounding dispositions (profiles, applied inline)" as the inline-prose variant of the frontmatter `profile:` mechanism; explicitly steers away from spawned subagents unless a spike proves the need.

## Why

- Felt failure (2026-06-22): a meeting agenda confidently asserted a superseded decision + a wrong Jira ticket title + a stale commitment hash. WS-1 of plan-context-injection already surfaces the right project *document*, but a doc excerpt is not verified truth — it carries reversed decisions and stale ticket facts.
- The reliability of `/project` (which fixed those errors) was a **behavior**, not a richer payload: it read the README body directly and hit the MCP. CR-1 (verified): `arete project open` does NOT parse the README `## Decisions` block and returns zero Jira. So the fix had to encode the behavior, not load more context.

## Learnings

1. **Gate convergence killed the over-built design.** The original plan fanned out one grounding *subagent* per project. The pre-mortem (2 CRITICAL) + cross-model review (CR-6) independently converged: prose can't enforce that the prime spawns subagents OR that returned bundles reach the agenda (no schema validation) — replaying WS-1's CR-3 "dark code" failure on the exact facts the effort fixes; and for ~3 meetings/day the fan-out's only payoff (parallelism) wasn't valued. Descoped to **inline disposition + per-project dedup**. Aligns with the cheapest-first escalation rule.
2. **Prose-only "dark code" is closed with a disk artifact + a self-check that names it.** The grounded bundle is written to a real file; the step-5a gate requires every asserted fact to trace back to it; synthesis is told to source from it. The artifact's existence is the checkable signal a prose build can offer (no test layer exists for skill reasoning).
3. **Profiles are adopted two ways.** Frontmatter `profile:` (e.g. `profile: pm-orchestrator`) = skill-WIDE adoption, auto-generates an "adopt `.agents/profiles/<name>.md`" instruction. Inline prose reference = step-scoped or conditional adoption. Use inline when the disposition shouldn't govern the whole skill (here: only the grounding step / only when working from `/project`).
4. **Runtime path matters.** Skills must reference `.agents/profiles/<name>.md` (the install location), not the source `profiles/<name>.md`. Profiles auto-copy on install (`workspace.ts` lists all `.md`, no registry).
5. **F3 isolation reasoning was wrong.** Subagent isolation would only isolate *grounding*, never *synthesis* — the prime still synthesizes all N agendas in one context, so the F3 "agenda #4 of 4 skeletons" failure is unchanged. The AC1 self-check stays mandatory.

## Files touched

- **Added**: `packages/runtime/profiles/project-agent.md`; `dev/work/plans/project-agent-meeting-prep/` (plan + pre-mortem + review)
- **Updated**: `packages/runtime/skills/prepare-meeting-agenda/SKILL.md`; `packages/runtime/skills/project/SKILL.md`; `packages/runtime/skills/_authoring-guide.md`; `packages/runtime/UPDATES.md`
- **Verification**: workspace + skill-commands tests 69 pass / 0 fail; prose-only (no TS), so `brief-no-llm` and dist untouched.
