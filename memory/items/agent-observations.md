# Agent Observations

> **Purpose**: Atomic facts I've noticed about how you work. These are discrete, timestamped observations that feed into the collaboration profile.

---

## How This Works

- Each observation is a single, specific fact
- Timestamped and traceable to a source
- No interpretation here - just facts
- Periodically synthesized into `summaries/collaboration.md`

---

## Writing Style

<!-- Observations about how you prefer written deliverables -->

---

## Working Patterns

- [2026-02-09] Prefers to discuss architecture and trade-offs before committing to a plan. Wants to hear concerns, what must be right now vs. what can improve later — before seeing a PRD.
- [2026-02-09] Comfortable making fast directional calls: "I'm good with this solution!" once trade-offs are clear. Doesn't need excessive deliberation.
- [2026-02-09] Uses the autonomous agent loop for building — prefers to review a PRD together, then hand off to a new conversation for execution via subagents. Separates planning from building.

---

## Domain Emphasis

- [2026-02-09] Strong preference for swappable/non-boxed-in designs: "Can we design and build it in a way that we could potentially swap that out in the near future?" Wants clean interfaces without over-engineering extensibility.
- [2026-02-09] Pragmatic about scope: chose Apple Calendar (ical-buddy) over Google OAuth because it's simpler and achieves the goal. Doesn't want to invest heavily in complex auth flows when a lighter path exists.
- [2026-02-09] Thinks in integration priority order: calendar first (highest PM impact), then Notion, then Linear/Jira, then Slack. Prioritizes by how much context each integration unlocks for daily PM work.

---

## Corrections

<!-- Things you've corrected me on - important context -->

---

## Process Preferences

- [2026-02-09] Asks for learnings and observations to be captured: "If there are any learnings you've uncovered about working with me, my styles, etc., please add them to the internal memories." Values institutional memory about collaboration, not just about code.
- [2026-02-09] Wants backlog items captured in scratchpad rather than lost: "Let's also add google and microsoft calendar integrations to the backlog in scratchpad." Uses scratchpad as a parking lot for future work.
- [2026-02-09] Prefers a single PRD covering related work (intelligence + calendar together) rather than separate PRDs — keeps the execution scope coherent.

---

<!-- 
Example observations:

## Writing Style
- [2026-02-03] You removed passive voice from PRD intro → preference for direct, active language
- [2026-02-03] You added "Why now?" section → timing context matters to you

## Working Patterns
- [2026-02-03] You asked for options before I proceeded → prefer choice over prescription
- [2026-02-03] You stopped me mid-task to redirect → I should check in more frequently

## Domain Emphasis
- [2026-02-03] You added user quotes to every section → evidence-based framing preferred

## Corrections
- [2026-02-03] "Don't assume enterprise = large company" → SMB can be enterprise-grade
- [2026-02-03] Corrected my use of "users" → you prefer "customers" for B2B context

## Process Preferences
- [2026-02-03] "Always show me the plan before executing" → explicit confirmation preferred
- [2026-02-03] "Let's punt on that for now" → items go to scratchpad for later

-->
