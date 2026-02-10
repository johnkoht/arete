# Builder Collaboration Profile

> **Purpose**: Synthesized profile of how to work with the builder of Areté. Derived from observations captured in build entries and direct interactions. Injected into new build conversations for immediate context.

---

## How This Works

- Entries (`.cursor/build/entries/`) capture detailed architecture decisions, session notes, and tooling changes. They may include a **Learnings** section with collaboration observations.
- This file synthesizes those observations into a working profile.
- Corrections from the builder become new observations in the next entry, then update this file.
- Review and edit anytime to improve accuracy.

---

## Working Patterns

- Prefers to discuss architecture and trade-offs **before** committing to a plan. Wants to hear concerns, what must be right now vs. what can improve later — before seeing a PRD.
- Comfortable making fast directional calls once trade-offs are clear. Doesn't need excessive deliberation — clarity enables speed.
- Uses the autonomous agent loop for building: review a PRD together in one conversation, then hand off to a new conversation for execution via subagents. Separates planning from building.

---

## Design Philosophy

- Strong preference for swappable, non-boxed-in designs. Wants clean interfaces without over-engineering extensibility. Asks: "Can we design and build it in a way that we could potentially swap that out in the near future?"
- Pragmatic about scope: chose Apple Calendar (ical-buddy) over Google OAuth because it's simpler and achieves the goal. Doesn't invest heavily in complex paths when a lighter one exists.
- Thinks in integration priority order: calendar first (highest PM impact), then Notion, then Linear/Jira, then Slack. Prioritizes by how much context each integration unlocks for daily PM work.

---

## Process Preferences

- Asks for learnings and observations to be captured. Values institutional memory about collaboration, not just about code.
- Wants backlog items captured in scratchpad rather than lost. Uses root `scratchpad.md` as a parking lot for future work.
- Prefers a single PRD covering related work (e.g. intelligence + calendar together) rather than separate PRDs — keeps the execution scope coherent.
- **Review workflow**: After reviewing completed work (PRD tasks, subagent deliverables, features), distinguish between:
  - **PRD-level changes** (significant functionality changes, missing acceptance criteria) → update the PRD
  - **Enhancement-level items** (performance optimizations, nice-to-haves, minor improvements) → add to scratchpad
  - When minor observations emerge during a review, proactively add them to scratchpad or offer: "Should I add these enhancements to the scratchpad?"

---

## Writing & Communication

<!-- Observations about how the builder prefers written deliverables, communication style, level of detail -->

[Not yet observed — will update as patterns emerge]

---

## Corrections

<!-- Things the builder has corrected — important context for avoiding repeat mistakes -->

[None yet]

---

## Last Synthesized

2026-02-09 — Initial synthesis from builder observations migrated from `memory/items/agent-observations.md`.

---
