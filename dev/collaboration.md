# Builder Collaboration Profile

> **Purpose**: Synthesized profile of how to work with the builder of Areté. Derived from observations captured in build entries and direct interactions. Injected into new build conversations for immediate context.

---

## How This Works

- Entries (`dev/entries/`) capture detailed architecture decisions, session notes, and tooling changes. They may include a **Learnings** section with collaboration observations.
- This file synthesizes those observations into a working profile.
- Corrections from the builder become new observations in the next entry, then update this file.
- Review and edit anytime to improve accuracy.

---

## Working Patterns

- Prefers to discuss architecture and trade-offs **before** committing to a plan. Wants to hear concerns, what must be right now vs. what can improve later — before seeing a PRD.
- Comfortable making fast directional calls once trade-offs are clear. Doesn't need excessive deliberation — clarity enables speed.
- Uses the autonomous agent loop for building: review a PRD together in one conversation, then hand off to a new conversation for execution via subagents. Separates planning from building.
- Confirms decisions quickly when options are clear (e.g. scope, synthesis approach, defer to scratchpad).
- Before spawning subagents: if builder asks about constraints (e.g. install-count filtering) or access (e.g. "do subagents have Task tool?"), add those to the plan/prompts and confirm before proceeding; "no Task tool visible" should trigger tool introspection.
- Prefers fast/cheaper models for subagents when the task is structured and doesn't require heavy reasoning.
- **CLI: established patterns over bare minimum** (2026-02-11): When updating or adding CLI features, use **established design patterns and experience** (e.g. setup, seed) rather than the bare minimum or whatever the agent wants. Check how similar flows work first; match their UX (checkbox, copy, pageSize). Don't invent a lesser experience. After meaningful fixes—especially when the user had to report a gap—add a dated entry and a Learnings section.

---

## Design Philosophy

- Strong preference for swappable, non-boxed-in designs. Wants clean interfaces without over-engineering extensibility. Asks: "Can we design and build it in a way that we could potentially swap that out in the near future?"
- Pragmatic about scope: chose Apple Calendar (ical-buddy) over Google OAuth because it's simpler and achieves the goal. Doesn't invest heavily in complex paths when a lighter one exists.
- Thinks in integration priority order: calendar first (highest PM impact), then Notion, then Linear/Jira, then Slack. Prioritizes by how much context each integration unlocks for daily PM work.

---

## Process Preferences

- Asks for learnings and observations to be captured. Values institutional memory about collaboration, not just about code.
- Wants future work captured rather than lost. Raw or underdeveloped ideas → `scratchpad.md`; mature ideas with a plan → `dev/backlog/`.
- Prefers a single PRD covering related work (e.g. intelligence + calendar together) rather than separate PRDs — keeps the execution scope coherent.
- **Review workflow**: After reviewing completed work (PRD tasks, subagent deliverables, features), distinguish between:
  - **PRD-level changes** (significant functionality changes, missing acceptance criteria) → update the PRD
  - **Enhancement-level items** (performance optimizations, nice-to-haves, minor improvements) → add to scratchpad (raw) or `dev/backlog/` (if discussed with a plan). Never add to entries.
  - When minor observations emerge during a review, proactively add them to scratchpad or offer: "Should I add these enhancements to the scratchpad?"
- **Closing or pausing a project**: Clean up outstanding/completed backlog items, update MEMORY.md index, add a dated entry with learnings, and mark progress/backlog docs (complete or on hold). Keeps institutional memory accurate and avoids orphaned state.
- **Completed backlog artifacts**: Prefer delete over archive. The entry documents what was done; git history preserves content. Keeps repo lean; no need to bloat with an archive that duplicates the entry.
- Build-only rules (dev.mdc, testing.mdc, plan-pre-mortem.mdc) live in `.cursor/rules/` in the repo; PRODUCT_RULES_ALLOW_LIST controls what gets copied to user workspaces, not what exists in repo.
- Pre-mortem + documentation checklist + file-deletion policy (subagent justifies deletions; orchestrator reviews) together prevent "forgot to plan docs" and "deleted critical files" failure modes.

---

## Areté Product Strategy

- **Product OS vision**: Areté is evolving from a skill-centric workspace to a product intelligence platform. The value is the intelligence layer (context injection, memory retrieval, entity resolution, briefing) that makes any skill or workflow more effective. Skills are methods; Areté is the intelligence underneath.
- **Five product primitives**: Problem, User, Solution, Market, Risk — the knowledge model the intelligence layer reasons about.
- **Skills as interchangeable methods**: Areté ships opinionable default skills, but users can swap them. The intelligence services (context, memory, briefing) work with any skill, including third-party skills from skills.sh.
- **Integration is the moat** (validated 2026-02-10): Skills.sh has 200+ skills including high-quality PRD/competitive/roadmap skills with hundreds of weekly installs. Yet none can replace Areté's native skills because value isn't in the procedure (OSS has strong workflows), it's in the integration (workspace structure, memory, context, intelligence metadata). This confirms: skills are commoditized; Areté's differentiation is the intelligence layer and workspace continuity.
- **Continuous improvement via OSS methodology**: While OSS skills can't replace native ones due to integration gaps, they offer frameworks and methodology depth (Opportunity Solution Tree, battlecards, thematic analysis) that can be folded into native skills without losing integration. This is the path for skill enhancement.

---

## Writing & Communication

- Values conciseness: one comprehensive report organized by theme (e.g. Metrics → Pre-mortem → Learnings → Recommendations → Next Steps), not separate sections that duplicate content. Long, repetitive reports reduce signal.
- Prefers actionable recommendations over abstract learnings; wants self-learning mechanisms (reflection, skills, rules) that improve the system over time, not one-off reports.
- For PRD/orchestration: scale reflection requests by task complexity — small tasks 1-2 sentences (what helped, token estimate); large tasks 3-5 sentences (memory impact, rule effectiveness, suggestions).
- For large architectural changes, update AGENTS.md mid-execution (after core architecture phase) rather than deferring to post-execution.

---

## Corrections

Things the builder has corrected — important context for avoiding repeat mistakes.

- **Backlog placement** (2026-02-10): Do not put backlog items or future enhancements in `dev/entries/`. Entries = actions, decisions, learnings (what happened). Backlog = future work → `dev/backlog/`.
- **Backlog subfolders** (2026-02-10): When adding to `dev/backlog/`, use subfolders — do not put files in the root. Use `dev/backlog/features/` for new capabilities (progress-dashboard, google-calendar-provider) and `dev/backlog/improvements/` for enhancements to existing functionality (automated-code-review, skills-enhancement).
- **Report format** (2026-02-10): Produce ONE comprehensive report organized by theme, not separate sections per request that duplicate content.
- **Reflection scaling** (2026-02-10): Scale reflection requests by task complexity—small tasks 1-2 sentences; large tasks 3-5 with specific insights.
- **Documentation timing** (2026-02-10): For large architectural changes, update AGENTS.md mid-execution (after core phase) rather than post-execution.
- **Entries and learnings after meaningful fixes** (2026-02-11): Calendar integration was fixed (icalBuddy binary, list parsing, checkbox UX) but no entry or learnings were added. When you fix a meaningful gap—especially after the user reports it—add a dated entry and a Learnings section. Otherwise the same kind of miss (subpar UX, no institutional memory) can repeat.

---

## Last Synthesized

2026-02-10 — Added: Writing & Communication (conciseness, one report by theme, reflection scaling, doc timing); Working Patterns (confirms quickly, subagent constraints/access, fast model for subagents); Process (build-only rules in repo, pre-mortem+doc+file-deletion mitigations); Corrections (report format, reflection scaling, documentation timing). Sources: multi-ide-support-learnings, doc-completeness-and-file-deletion-safety, auto-capture-corrections, memory-boundaries-and-path-cleanup, skills-evaluation-learnings, skills-sh-evaluation-synthesis.

---
