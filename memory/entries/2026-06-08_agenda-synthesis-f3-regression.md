# Restoring a primitive ≠ restoring the behavior — agenda synthesis (F3) still regressed after Phase 9

**Date**: 2026-06-08
**Context**: Areté v2 Phase 9 (brief primitive restore) post-merge soak check

## What happened
Phase 9 restored typed `arete brief --meeting/--person/...` as a pure aggregator and refit
`prepare-meeting-agenda` SKILL.md to call it. Goal: recover April-quality agendas (themed,
time-boxed sections, discussion-topics woven in, commitment-ID citations, prior-conversation
callbacks). On 2026-06-08 the latest Anthony 1:1 agenda
(`now/agendas/2026-06-09-anthony-john-weekly.md`) was still a bare skeleton — decent Priorities,
but EMPTY Feedback&Growth / Support&Blockers / Next Steps.

Crucially, **all** Phase 9 machinery fired: arete-reserv is symlinked to the v2 worktree;
`dev/diary/brief-invocations.log` shows `--meeting "Anthony / John Weekly"` + `--person
"anthony-avina"` at generation time; the installed SKILL.md has the synthesize / "do NOT
pattern-fill the template's generic sections" prose; the person file still has the full
`1:1 Discussion Topics`. The agent had the data AND the instructions and pattern-filled the
template anyway — pre-mortem risk **F3** realized. **Aggravator CONFIRMED by A/B (batch generation):** re-running the same agenda in a
fresh single-meeting conversation produced a markedly richer agenda (framing lead-in, populated
Status Sweep / Feedback&Growth / Support&Blockers) — same code + data; single-run rich, batch-run
skeleton (still lighter than the April bar, so a second regression layer remains). The skeleton
came from a batch run
(four meetings briefed back-to-back at 03:38 → cheap Priorities filled, qualitative synthesis
skeletoned for all of them).

A red herring to avoid: it is **NOT** missing stance data. April agendas were rich with ZERO
stances on the person file; today's skeleton coexists with 10 stances. Stance completeness is a
separate (data) axis from agenda richness (a synthesis/behavior axis). The first diagnosis here
("missing stance refresh") was wrong and was disproven in minutes by looking at the actual files.

## Learning
- Restoring a CLI primitive (data) does NOT restore agent behavior (synthesis). A capability that
  "requires the agent to compose" needs a behavioral gate, not just an available verb + prose.
- Prose instructions in SKILL.md are skippable under load; batch / multi-target generation is a
  reliable trigger for corner-cutting (cheap section filled, expensive synthesis dropped).
- Verify regressions against PRIMARY artifacts (diff the actual good vs bad output + the
  invocation log), not against a plausible-sounding theory or a stale memory note.
- A soak success bar ("≥5 agendas at quality X") must be CHECKED against real output, not assumed
  met because the code shipped. Phase 9's bar was not met.

## Evidence
- `now/agendas/2026-06-09-anthony-john-weekly.md` (skeleton) vs `resources/meetings/2026-04-28-anthony-john-weekly.md` (rich, in arete-reserv)
- `dev/diary/brief-invocations.log` (verb fired); `people/internal/anthony-avina.md` (stances present + rich discussion topics left unused)
- Follow-up plan: `phase-9-followup-agenda-synthesis/plan.md`; `POST-MERGE-WORKLOG.md` I-0
