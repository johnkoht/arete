# Builder Collaboration Profile

> **Purpose**: Synthesized profile of how to work with the builder of Areté. Derived from observations captured in build entries and direct interactions. Injected into new build conversations for immediate context.

---

## How This Works

- Entries (`memory/entries/`) capture detailed architecture decisions, session notes, and tooling changes. They may include a **Learnings** section with collaboration observations.
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
- **Explicit file reading lists in subagent prompts** (2026-03-xx, 90%+ evidence): The single highest-impact practice for subagent success. Every developer prompt must list exact files to read before starting. "Read these files first: [path1], [path2]" in the prompt prevents context gaps. This appeared in >90% of "what worked" sections across 51 PRDs.
- **Pre-mortem mitigations embedded in task prompts** (2026-03-xx, 15+ PRDs): When mitigations live only in pre-mortem.md (not in each task prompt), they don't get applied. When mitigations are embedded directly in the developer's task prompt, 0 risks materialized across 15+ PRDs. Always copy relevant mitigations into the developer prompt.
- **Phantom task detection saves 80% of planned work** (2026-03-07, reimagine-v2): Before implementing ANY task, verify the proposed output doesn't already exist (ls the output files, grep for proposed function/class names). In reimagine-v2, this saved ~80% of the planned work. Now a mandatory pre-execution check.
- **Sequential subagent execution, never parallel** (2026-03-05 reimagine-v1, 2026-03-25 workspace-areas): Running subagents in parallel on the same codebase causes lock contention and failures. Always dispatch subagents sequentially. This is a hard constraint, not a preference.

- **Per-phase reviewer subagent protocol is load-bearing** (2026-04-23, topic-wiki-memory): User asks for "spawn a reviewer subagent for each phase or feature" and "incorporate their recommendations and then move to the next phase." Treat this as mandatory, not optional. Each phase: build → spawn focused lane-specific reviewer (core services, CLI/UX, search/indexing, skills/runtime) → synthesize must-fixes → fix → next phase. End-to-end final review before merge. The dual-round pattern caught real bugs (dark code, asymmetric locking, qmd path filter dropped) that neither tests nor my self-review would have found.

- **"Services tested" ≠ "services shipped"** (2026-04-23, topic-wiki-memory): When declaring a plan `status: completed`, the predicate is NOT "all the new exports have tests and typecheck passes." It is "every production call path reaches the new code." User wants a dark-code audit before merge: `rg 'export.*function|export.*class'` added in the branch, then confirm every match has a non-test caller. I shipped `aliasAndMerge` and `renderActiveTopicsAsSlugList` as tested-but-never-called service methods in topic-wiki-memory; the end-to-end reviewer caught both. This is a recurring failure mode for me — build the service, write the tests, forget the caller. Flag when I see it.

- **Reviewer prompts should be direct — "candid engineering judgment, not diplomatic hedging"** (2026-04-23): User wants reviewers to call out scope cuts, corner-cutting, and disagreements plainly. Adding that phrase to reviewer prompts materially changed the quality of the output (prior reviews hedged on "could be fine"; direct reviews say "this is a scope cut, defensible because X, but own it"). Include it in every reviewer prompt.

- **"NEEDS FIXES BEFORE MERGE" is a stop-and-sync signal, not auto-continue** (2026-04-23): Previous instruction was "continue through entire plan unless critical." A `NEEDS FIXES BEFORE MERGE` verdict from an end-to-end reviewer counts as critical — pause and present findings for the user's direction rather than auto-fixing. Even if the fixes are clear, the user wants to see the reviewer's verdict and the proposed response before code moves.

---

## Design Philosophy

- Strong preference for swappable, non-boxed-in designs. Wants clean interfaces without over-engineering extensibility. Asks: "Can we design and build it in a way that we could potentially swap that out in the near future?"
- Pragmatic about scope: chose Apple Calendar (ical-buddy) over Google OAuth because it's simpler and achieves the goal. Doesn't invest heavily in complex paths when a lighter one exists.
- Thinks in integration priority order: calendar first (highest PM impact), then Notion, then Linear/Jira, then Slack. Prioritizes by how much context each integration unlocks for daily PM work.

---

## Process Preferences

- Asks for learnings and observations to be captured. Values institutional memory about collaboration, not just about code.
- Wants future work captured rather than lost. Raw or underdeveloped ideas → `scratchpad.md`; mature ideas with a plan → `dev/work/backlog/`.
- Prefers a single PRD covering related work (e.g. intelligence + calendar together) rather than separate PRDs — keeps the execution scope coherent.
- **Review workflow**: After reviewing completed work (PRD tasks, subagent deliverables, features), distinguish between:
  - **PRD-level changes** (significant functionality changes, missing acceptance criteria) → update the PRD
  - **Enhancement-level items** (performance optimizations, nice-to-haves, minor improvements) → add to scratchpad (raw) or `dev/work/backlog/` (if discussed with a plan). Never add to entries.
  - When minor observations emerge during a review, proactively add them to scratchpad or offer: "Should I add these enhancements to the scratchpad?"
- **Closing or pausing a project**: Clean up outstanding/completed backlog items, update MEMORY.md index, add a dated entry with learnings, and mark progress/backlog docs (complete or on hold). Keeps institutional memory accurate and avoids orphaned state.
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
- For PRD/orchestration: use structured signal tags instead of freeform reflections — REUSE/MISSING_CONTEXT/NEW_PATTERN/BLOCKER_RESOLVED/NOTHING_NOVEL/OTHER. Token estimates are noise and have never been meaningfully used; signals are immediately actionable (updated 2026-04-04).
- For large architectural changes, update AGENTS.md mid-execution (after core architecture phase) rather than deferring to post-execution.

---

## Corrections

Things the builder has corrected — important context for avoiding repeat mistakes.

- **Audit all instances of a pattern before changing one** (2026-02-17): When making a structural change to one instance of a pattern (e.g. moving a template into a skill), immediately grep for ALL other instances of that pattern (other skills with `project_template:`, other template dirs, other `creates_project: true` flags) and surface them proactively. Don't finish the N=1 case and wait to be asked about N=2…N. The builder should hear "I also see these 4 other skills with the same structure — should we handle them consistently?" before work is done, not after.

- **Always use plan-to-prd skill** (2026-02-14): When converting a plan to a PRD (e.g., user chose "Create a PRD" execution path), you MUST load and follow `.pi/skills/plan-to-prd/SKILL.md`. Do not write PRDs directly without using the skill. The skill ensures correct structure, creates prd.json, and generates the handoff prompt for execute-prd. This applies whenever: (1) user selected "Convert to PRD" from PRD Gateway, or (2) user requested PRD creation after plan approval.
- **Backlog placement** (2026-02-10): Do not put backlog items or future enhancements in `memory/entries/`. Entries = actions, decisions, learnings (what happened). Backlog = future work → `dev/work/backlog/`.
- **Backlog subfolders** (2026-02-10): When adding to `dev/work/backlog/`, use subfolders — do not put files in the root. Use `dev/work/backlog/` for new capabilities (progress-dashboard, google-calendar-provider) and `dev/work/backlog/` for enhancements to existing functionality (automated-code-review, skills-enhancement).
- **Report format** (2026-02-10): Produce ONE comprehensive report organized by theme, not separate sections per request that duplicate content.
- **Reflection scaling** (2026-02-10): Scale reflection requests by task complexity—small tasks 1-2 sentences; large tasks 3-5 with specific insights.
- **Documentation timing** (2026-02-10): For large architectural changes, update AGENTS.md mid-execution (after core phase) rather than post-execution.
- **Entries and learnings after meaningful fixes** (2026-02-11): Calendar integration was fixed (icalBuddy binary, list parsing, checkbox UX) but no entry or learnings were added. When you fix a meaningful gap—especially after the user reports it—add a dated entry and a Learnings section. Otherwise the same kind of miss (subpar UX, no institutional memory) can repeat.

- **Always inject expertise profiles for reviews** (2026-03-25): When running `/review` or spawning subagent reviewers for code that touches `packages/core/`, `packages/cli/`, `packages/apps/backend/`, or `packages/apps/web/`, ALWAYS read the corresponding `.pi/expertise/{domain}/PROFILE.md` and inject the relevant sections (invariants, DI patterns, anti-patterns, key abstractions) into the review task. Generic reviewers miss project-specific patterns. The 4-layer context stack (Layer 4 = domain expertise) exists for this reason. Check which packages the plan touches → load those profiles → include in review prompt.

- **Actively reference collaboration.md for process decisions** (2026-03-25): Don't assume injected context is internalized. When making workflow decisions (spawning subagents, running reviews, choosing execution paths), explicitly re-read the relevant sections of `collaboration.md` and `AGENTS.md` to check for established patterns before proceeding. Having context in the system prompt ≠ actually using it.

- **Use plan-mode extension commands, not manual tool calls** (2026-03-25): When working with plans, ALWAYS use `/plan`, `/review`, `/pre-mortem`, `/approve`, `/build`, `/ship`, `/wrap` commands. These manage frontmatter, status transitions, and artifact placement. NEVER manually write plan.md with the Write tool or update status fields with Edit. The extension handles lifecycle correctly. If you're about to use Write/Edit on a plan file, STOP and find the correct slash command instead. If unsure how a command works, read `.pi/extensions/plan-mode/` first.

- **Don't let urgency override process** (2026-03-25): When builder says "do this while I'm away" or similar time-pressure language, that's NOT permission to skip proper workflows. The builder trusts the established process MORE than they trust improvised solutions. If you're tempted to "just do it manually" because it feels faster, that's a signal to slow down and use the right tooling.

---

## Last Synthesized

2026-04-04 — Added: Working Patterns (explicit file reading lists, pre-mortem mitigations in prompts, phantom task detection, sequential subagent constraint); Writing & Communication (signal tags replace token estimates/freeform reflections). Sources: build-skills-tighten plan analysis of 51 PRD entries (2026-02-10 through 2026-04-03). Corrections 9-12 from 2026-03-25 were already added manually. Full entry-by-entry synthesis pending — see `memory/entries/` for individual learnings.

---
