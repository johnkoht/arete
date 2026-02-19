---
title: Persona Council
slug: persona-council
status: draft
size: medium
created: 2026-02-19T02:49:27.000Z
updated: 2026-02-19T04:22:16.022Z
completed: null
has_review: false
has_pre_mortem: true
has_prd: false
backlog_ref: null
steps: 5
---

# Persona Council

Introduce a Persona Council to the Arete BUILD MODE planning system — three behavioral archetypes representing end users of Arete (GUIDE MODE). The council acts as a standing "voice of the customer" check during feature planning and PRD creation, preventing BUILD MODE enthusiasm from producing GUIDE MODE complexity.

## Problem

When planning features for Arete, there's no systematic check against end-user reality. Features that make sense from a developer/builder perspective can be friction-heavy or irrelevant to actual users. The Slack people-mapping example illustrated this clearly: a feature that seems valuable in planning would cause a Harvester-type user to abandon the flow entirely.

## The Three Personas

- **The Harvester** — Capture signal fast, zero interruptions, will skip anything that feels like data entry
- **The Architect** — Builds a compounding system, tolerates friction if payoff is explicit and real
- **The Preparer** — Output-driven, cares only about artifact quality, churns if output isn't differentiated

## Decision Table

| Council result | Policy |
|---|---|
| All three personas value it | Required, on by default |
| Two of three value it | Optional, on by default, skippable |
| One persona values it | Optional, off by default, discoverable |
| No persona values it | Cut it |
| Harvester rejects it but others want it | Must be async or skippable with no blocking |

## Plan

Plan:
1. Create `dev/personas/PERSONA_COUNCIL.md` — Three behavioral archetypes (Harvester, Architect, Preparer) with friction threshold, representative voice, risk note, and empty `## Evidence` section on each.
2. Create `dev/personas/COUNCIL_INSTRUCTIONS.md` — Operating manual: when to invoke, decision table, voice calibration, evidence grounding guidance.
3. Update `.pi/agents/product-manager.md` — Add a `## Persona Council` section: when discussing any user-facing feature in GUIDE MODE, run a council check before finalizing requirements. Reference `dev/personas/` for definitions and decision policy.
4. Create `.cursor/rules/persona-council.mdc` — Auto-applied Cursor rule with the same council trigger logic for Cursor-based planning sessions.
5. Update `.agents/sources/builder/rules-index.md` — Add `persona-council.mdc` to the rules table, then run `npm run build:agents:dev` to rebuild root `AGENTS.md`.

## Out of Scope

- PRD template updates (follow-on after validating the rule fires correctly)
- Retrofitting existing plans/PRDs with council checks
- Orchestrator/reviewer/developer agent changes
- Wisdom registry entry
- Any code changes (purely docs and agent wiring)

## Success Criteria

- Council check fires automatically during plan mode when a user-facing GUIDE MODE feature is discussed
- PM agent voices all three personas with specific, actionable reactions (not vague "they might not like this")
- The decision table is used to set concrete policy (on/off/skip/cut)
- Works in both Pi (via AGENTS.md) and Cursor (via rule)
