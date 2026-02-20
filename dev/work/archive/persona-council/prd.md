# PRD: Persona Council

**Feature**: persona-council
**Branch**: feature/persona-council
**Status**: approved
**Pre-mortem**: dev/plans/persona-council/pre-mortem.md

## Goal

Introduce a Persona Council to the Arete BUILD MODE planning system — three behavioral archetypes (Harvester, Architect, Preparer) representing GUIDE MODE end users. The council acts as a standing voice-of-the-customer check during feature planning, preventing BUILD MODE enthusiasm from producing GUIDE MODE complexity. Wired into the PM agent for Pi and referenced in AGENTS.md.

## Context

When planning features for Arete, there's no systematic check against end-user reality. A feature that seems valuable from a builder perspective (e.g., mapping Slack people to the People system) can be friction-heavy or irrelevant to actual users. The council provides a repeatable framework for surfacing those mismatches before features are built.

Personas are hypothesis-based on day one — no user research yet. The Evidence sections in persona files are intentionally empty and labeled as unvalidated hypotheses to prevent fiction drift.

No Cursor rules are included in this implementation. The council is wired entirely through Pi's loading mechanisms (AGENTS.md + PM agent prompt). Cursor rule can be added later if needed.

No markdown tables in persona or instruction files — content is for machine consumption.

## Pre-mortem Risks (applied during execution)

- PM agent section must stay ≤15 lines and use "offer" framing, not "always invoke"
- Evidence sections must be prominent and labeled as hypothesis-only
- AGENTS.md format must be verified with grep after rebuild

---

## Task 1: Create Persona Council Documentation

Create the canonical persona definitions and operating manual in `dev/personas/`.

### Description

Create two files:

`dev/personas/PERSONA_COUNCIL.md` — The three behavioral archetypes. Each persona entry must include: a one-line core job, behavioral description, what they care about, what they don't care about, friction threshold, representative voice (2–3 direct quotes), and an Evidence section labeled as hypothesis-only.

`dev/personas/COUNCIL_INSTRUCTIONS.md` — The operating manual for when and how to invoke the council. Must include: trigger conditions (when to run / when not to run), the decision policy as a flat list, voice calibration guidance (specific > vague), and evidence grounding policy.

Content guidelines (both files):
- No markdown tables — use prose and labeled lists
- Written for agent consumption, not human readability
- Decision policy format: `all-three-value: required, on by default` (flat list, no table)
- Persona voice examples must be specific, not hedged ("The Harvester will close the tab" not "might find this friction-heavy")

### Acceptance Criteria

- `dev/personas/PERSONA_COUNCIL.md` exists with Harvester, Architect, and Preparer archetypes
- Each persona has: core job, behavior, cares/doesn't-care, friction threshold, representative voice (2-3 quotes), Evidence section
- Each Evidence section contains: "No evidence collected yet. This persona is hypothesis-based. Treat council output as directional, not validated."
- A `## Evidence Policy` note exists at the top of `PERSONA_COUNCIL.md`: unsupported persona claims are assumptions, not facts
- `dev/personas/COUNCIL_INSTRUCTIONS.md` exists with trigger conditions, decision policy (flat list, no table), voice calibration, evidence grounding guidance
- Neither file uses markdown tables
- Decision policy uses flat list format

---

## Task 2: Update PM Agent with Persona Council Section

Add a Persona Council section to `.pi/agents/product-manager.md` so the council fires automatically during plan mode when relevant.

### Description

Add a `## Persona Council` section to `.pi/agents/product-manager.md`.

Requirements:
- Section must be ≤15 lines total
- Trigger framing: "offer a council check" not "always run a council check"
- Trigger condition: when a feature involves user workflow steps, input prompts, configuration decisions, or any step the user must take
- Explicitly exclude: internal architecture, build tooling, bug fixes with no UX change
- Reference `dev/personas/COUNCIL_INSTRUCTIONS.md` for full decision policy — do not reproduce the policy inline
- Place the section after "Product Pre-Mortem" and before "PRD Creation" in the file structure

### Acceptance Criteria

- `.pi/agents/product-manager.md` contains a `## Persona Council` section
- Section is ≤15 lines
- Uses "offer a council check" framing (not "always" or "must")
- Trigger condition is scoped to user-facing workflow, input, or configuration decisions
- Exclusions are explicit (internal arch, build tooling, bug fixes)
- References `dev/personas/COUNCIL_INSTRUCTIONS.md` for decision policy
- Does not duplicate the decision policy inline
- Total file length remains under 145 lines
- Existing sections (Your Responsibilities, Pre-Mortem, etc.) are unchanged

---

## Task 3: Add Personas Source to AGENTS.md and Rebuild

Create `.agents/sources/builder/personas.md` to add a `[Personas]` section to the BUILD AGENTS.md, then rebuild.

### Description

Create `.agents/sources/builder/personas.md` with a compressed `[Personas]` block that tells all BUILD MODE agents about the council. This ensures the council is referenced in always-loaded context, not just in the PM agent prompt.

The content should follow the pipe-delimited compression style used in other AGENTS.md source files. Include:
- What the council is (one line)
- Where the definitions live (`dev/personas/PERSONA_COUNCIL.md`)
- Where the instructions live (`dev/personas/COUNCIL_INSTRUCTIONS.md`)
- When to invoke: user-facing workflow, input prompts, configuration
- When not to invoke: internal arch, build tooling, bug fixes

After creating the source file, update `scripts/build-agents.ts` if needed to include the new source file in the BUILD target, then run `npm run build:agents:dev`.

### Acceptance Criteria

- `.agents/sources/builder/personas.md` exists with a compressed `[Personas]` block
- Block follows the pipe-delimited format of other AGENTS.md sections
- `npm run build:agents:dev` runs without errors
- `grep -i "persona" AGENTS.md` returns a result showing the council is referenced
- The `[Personas]` block references both `dev/personas/PERSONA_COUNCIL.md` and `dev/personas/COUNCIL_INSTRUCTIONS.md`
- Existing AGENTS.md content is unchanged (additive only)

---

## Out of Scope

- Cursor rules (`.cursor/rules/persona-council.mdc`) — deferred; add later if Cursor agent workflow becomes primary
- PRD template updates — follow-on after validating council fires correctly
- Retrofitting existing plans/PRDs with council checks
- Orchestrator, reviewer, developer agent changes
- Any TypeScript or code changes — purely docs and agent wiring
- Populating Evidence sections with real data — that's ongoing operational work, not part of this build

## Success Criteria

- Council check is offered automatically during plan mode when a user-facing GUIDE MODE feature is discussed
- PM agent voices all three personas with specific, actionable reactions
- Decision policy produces a concrete outcome (required/optional/skip/cut) — not vague persona reactions
- Wired for Pi via AGENTS.md and PM agent prompt
- Evidence sections exist and are clearly labeled as hypothesis-only, preventing fiction drift
