---
title: Onboarding Improvements
slug: onboarding-improvements
status: draft
size: large
created: 2026-02-18T03:12:45.227Z
updated: 2026-02-19T02:53:24.196Z
completed: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 4
---

Now I have full context. Here's my honest take, then a concrete plan.

---

## Review

**The idea is strong. The execution plan needs one structural adjustment.**

### What's working

The three personas are genuinely well-calibrated. Behavioral archetypes beat demographic profiles for this use case — what matters isn't "a 34-year-old PM at a Series B" but *how someone relates to context capture vs. output generation*. The Harvester/Architect/Preparer triangle covers the realistic behavioral range without over-segmenting.

The decision table in COUNCIL_INSTRUCTIONS is the best part of the proposal. "Harvester rejects it but others want it → must be async or skippable with no blocking" is immediately actionable and prevents the exact class of feature mistake you described (the Slack people-mapping dialog).

The Slack paste example is a perfect proof case. The council would have said: Harvester abandons the flow here, Preparer doesn't care about people tracking, Architect wants it but would accept deferred review. Outcome: make the mapping async and optional, not a blocking dialog.

### One structural concern

The proposal treats the council as two loose markdown docs that you'd reference manually. That works initially, but the pattern in Arete build already has a clear solution: `.cursor/rules/*.mdc` files are auto-applied, and `.agents/sources/builder/` feeds AGENTS.md. If the council isn't wired into the rule layer, it becomes "a doc I remember occasionally" — which is exactly what you don't want.

Concretely: the council check should live in a `.cursor/rules/persona-council.mdc` that auto-triggers during user-facing feature planning, the same way `plan-pre-mortem.mdc` auto-triggers before execution.

### What I'd scope differently

The previous agent's plan also left some leftover context from a different onboarding session (Phase 2 PRD JSON, Stream C, etc.) — I'd set that aside. This is a fresh, focused implementation.

One thing I'd add that wasn't in the proposal: a lightweight **Evidence section** standard for persona updates. You mentioned it in passing ("update the persona files when you have real signal"), but that should be a first-class field from the start. The council drifts toward fiction fast without it. We should build in the habit now, even if the evidence blocks start empty.

---

## Plan

**Size: Small** (4 targeted steps, purely docs and rule files, no code changes)

Plan:
1. **Create `dev/personas/` directory with `PERSONA_COUNCIL.md`** — The three behavioral archetypes (Harvester, Architect, Preparer) with persona voice, friction threshold, risk note, and an empty `## Evidence` section on each for future grounding.
2. **Create `dev/personas/COUNCIL_INSTRUCTIONS.md`** — The operating manual: when to invoke, the decision table, voice calibration examples, and guidance for keeping personas grounded with evidence.
3. **Create `.cursor/rules/persona-council.mdc`** — The auto-applied rule. Triggers during user-facing feature planning (not internal arch, build tooling, or bug fixes). Defines the structured council check format and how to surface it during PRD review and planning conversations.
4. **Update `.agents/sources/builder/rules-index.md`** to reference the new rule, then run `npm run build:agents:dev` to rebuild AGENTS.md so the council is always-loaded context for BUILD MODE agents.

**Out of scope for this plan:**
- Adding a council check section to existing PRD templates (follow-on, once we validate the rule is firing correctly)
- Retrofitting council checks onto existing plans/PRDs in `dev/`
- Any code changes — this is purely documentation and agent wiring

---

Want to save this plan and proceed? Or do you have feedback on the scope — anything you'd add, cut, or restructure before we move forward?