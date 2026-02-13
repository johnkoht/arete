# Scratchpad

Quick capture for build ideas, questions, and TODOs. Review periodically; move mature items to `dev/backlog/` or turn into PRDs.

---

## Background
<!-- Reference context: people, plans, company strategy. Expand into context/ or memory as it solidifies. -->

### People
- **Index**: ✓ Implemented. `people/{internal|customers|users}/[slug].md`; `people/index.md`; `arete people list/show/index`.
- **IDs / mapping**: ✓ Stable slug per person; link via:
  - **Person → meeting**: Meeting frontmatter or body lists `attendees: [person-id]` or link to people index.
  - **Person → project**: Project README or inputs list `stakeholders: [person-id]` or key contacts.
- Enables: "All meetings with Jane", "Projects where Sarah is stakeholder", and per-person memory (preferences, quotes).

### Plans
- **Day plan**: Today's focus, meetings, top 3 priorities. ✓ **daily-plan** skill outputs to chat; optional day file in Phase 2.
- **Weekly plan**: This week's goals, key meetings, themes. ✓ **week-plan** skill; `now/week.md` (was `resources/plans/week-*.md`).
- **Review**: Weekly review (what shipped, what slipped, learnings). ✓ **week-review** skill.

### Company (strategic pillars / outcomes)
- **Already in context**: `goals/strategy.md` (was `context/goals-strategy.md`) has Strategic Pillars, OKRs, and outcomes (e.g. bets and their outcomes).
- Keep pillars and outcomes there; reference from projects and roadmap work.

---

## Ideas
<!-- Quick ideas - date them so you know when they came up -->

### High priority (user voice)

- [2026-02-12] **User voice / writing style from uploads** — *User voice:* "I'd like the user to be able to upload emails, PRDs, documents, etc. to help define and shape their voice for the agent. Not sure what this looks like." Explore: let users upload sample artifacts (emails, PRDs, docs) so the agent can learn and mirror their tone, structure, and style. Shape could be: a "voice" or "style" context folder, a briefing step that injects style cues, or a dedicated onboarding flow. Needs product exploration.

---

- [2026-02-12] **Meeting agendas shouldn't be so robust** — Simplify prepare-meeting-agenda / meeting agenda output; avoid over-engineered or overly detailed agendas.

- **Can Areté use [find-skills](https://skills.sh/vercel-labs/skills/find-skills) to find and recommend skills when a user is trying to accomplish something that is not built in?** — The Skills CLI (`npx skills find [query]`) lets users search the open agent skills ecosystem. When the router returns no match (or the user's intent isn't covered by a default skill), Areté could run `npx skills find <query>` and suggest installable skills (e.g. `npx skills add vercel-labs/skills@find-skills`). Explore: integrate find-skills workflow into skill routing / "no match" path, or add a dedicated "suggest skills" step in GUIDE mode.

- [2026-02-10] **find-skills product decision (deferred)** — After skills.sh evaluation (5 runtime skills evaluated, all kept native), decide: (a) add find-skills to default skill set so users can discover OSS skills via agent, (b) document only in `runtime/skills/README.md` ("run `npx skills find` to discover more skills"), or (c) leave for later. Recommendation from evaluation: install as optional skill (`arete skill install vercel-labs/skills --skill find-skills`), document in README under "Adding new capabilities," but don't ship in core 19 skills. Useful for discovery, not for core workflow replacement.

- [2026-01-27] **Subagents for Competitive Research**: When analyzing 2+ competitors, spawn parallel subagents to research each competitor simultaneously. Each subagent gathers pricing, features, positioning, then main agent synthesizes into comparison matrix. Could extend to other parallel tasks (market research, multi-source discovery).

- [2026-01-27] **Mockup/Prototype Generation via Lovable** (implemented 2026-02): Replaced generate-mockup with **generate-prototype-prompt**. Skill outputs a Lovable Knowledge file + implementation prompt from PRD, plan, or conversation; user pastes into lovable.dev. No MCP—prompt output only. Vercel v0 left as future option.

---

## TODOs
<!-- Action items that don't belong to a specific project yet -->

- [ ] **Organize PRD directory structure** (2026-02-13): Currently all PRDs live in `dev/prds/` flat structure with completed PRDs mixed with active ones. Consider adding `dev/prds/archive/` or year-based organization (e.g. `dev/prds/2026/`) to better separate completed work. The README table tracks "Implemented" vs others, but filesystem could be clearer. Could also archive execution artifacts (`prd.json`, `progress.txt`) to `dev/autonomous/archive/YYYY-MM-DD-{prd-name}/` after each PRD completes.

- [ ] **Skill customization documentation**: Create user-facing docs explaining how to override/customize skills. Cover: (1) when to use default vs customize, (2) how to override just a template vs entire skill, (3) examples of common customizations, (4) how overrides merge with core. Should be part of skill onboarding flow.

- [ ] **Evaluate arete-context.mdc for end users** (2026-02-13): Currently `runtime/rules/arete-context.mdc` ships to end users and contains BUILDER mode content (dev/entries, dev/MEMORY.md, etc.) that's irrelevant to them. Question: Do we need this rule at all for end users? In user workspaces, the agent should always be in GUIDE mode—there's no `src/cli.ts` or `dev/` directory. Consider: (a) remove from PRODUCT_RULES_ALLOW_LIST entirely, (b) simplify to GUIDE-only content, or (c) leave as-is if auto-detection works well enough. Related to rules-architecture-refactor PRD.

---

## Notes
<!-- Quick notes, observations, things to remember -->

### YYYY-MM-DD
[Note content]

---

## Questions to Explore
<!-- Questions that came up that we should investigate -->

- [2026-02-05] **Generate Mockup skill dependencies** (resolved 2026-02): Replaced generate-mockup with generate-prototype-prompt. No dedicated Lovable/v0 integration; skill generates prompt files (knowledge.md + implementation.md) for user to paste into Lovable. Sufficient for v1.

---

## Future Enhancements (to build later)

### Tools/Agents/Models Configuration
- Config file for AI model preferences per task type
- Recommendations for when to use Plan mode vs regular mode
- Options for deep research vs quick tasks
- Let user customize model selection for: discovery, synthesis, PRD writing, etc.

### Product Coach (built-in)
*Added: 2026-02-05*

Some kind of built-in product coach that can:
- **Challenge**: Question assumptions, poke holes in strategy, ask "so what?" and "why this first?"
- **Sounding board**: Think through options out loud, rehearse arguments, stress-test narratives
- **Push**: Hold accountable to goals, call out drift, nudge when stuck or avoiding hard decisions

Form TBD: could be a **skill** ("talk to my coach"), a **tool** with phases (e.g. weekly check-in), a **persona** the agent adopts in certain modes, or a dedicated **coach mode** in the CLI. Might use context (goals, roadmap, memory) to stay relevant and push on the right things.

### Proactive Recommendations System
*Added: 2026-02-06*

A system where the agent can proactively recommend actions or prompt the user about workspace health. The system should track **timestamps** for key actions and recommend when things are stale.

**Timestamp-based checks (examples):**
- **Quarterly goals**: If `goals/quarter.md` (or equivalent) hasn't been updated in e.g. **4 months** → treat as a problem; agent should recommend setting/refreshing goals.
- **Calendar / meeting sync**: If the user hasn't synced (e.g. `arete pull` or calendar sync) in **1–2 days** → recommend they sync so meetings and context are current.
- **Weekly plan**: If there's no plan for the current week or it's very stale → nudge to update.

**Stored timestamps (concept):**
- Persist "last synced at", "last goals update", etc. (e.g. in workspace state or derived from file mtimes).
- Agent (or `arete status`) compares these to thresholds and surfaces recommendations.

**Triggers:**
- User asks a question → agent can include a gentle prompt ("By the way, your quarterly goals haven't been updated in 4 months…")
- Agent proactively suggests ("You haven't synced in a couple of days — want to run a quick pull?")
- Periodic check-in when user starts a session.

**Implementation:**
- Part of `arete status` (workspace health) with clear "last done" ages and thresholds.
- Lightweight checks (file timestamps, stored last-run times).
- User can ask "what should I do?" or "check my workspace health" to get recommendations.

---

### Background sync worker
*Added: 2026-02-06*

A **background worker** that syncs pullable sources (e.g. calendar, Fathom meetings) on an interval (e.g. **every 30 minutes**), so the workspace stays up to date without the user having to run `arete pull` manually.

- Run `arete pull` (or equivalent) for configured integrations on a schedule.
- Could be a long-running process (e.g. `arete daemon` or `arete sync --watch`) or a system cron/launchd job.
- Respect rate limits and credentials; log failures for user visibility.
- Complements the recommendation system: if background sync is enabled, "last synced" stays fresh; if not, agent can still recommend syncing after 1–2 days.

### People/Stakeholders Tracking
- ✓ **Foundation built**: people/, process-meetings (auto-populate from meeting attendees), meeting-prep (uses people when preparing). See **Background → People**.
- **Remaining (future)**: Per-person memory enrichment (what they care about, pet peeves); agent patterns for "CEO always asks about ROI".

### Package-Based Distribution (Shelved)
*Added: 2026-01-27*

Current approach: Fork + Upstream remote for updates. Works fine for single workspace.

**Future option:** Publish as npm package for cleaner distribution:
```
my-workspace/
├── node_modules/@arete/workspace/   # Framework as dependency
├── .cursor/rules/                   # Symlinked from package
├── context/                         # Your data
├── projects/                        # Your data
└── arete.config.js                  # Optional customization
```

**CLI commands:**
- `npx @arete/workspace init` - Scaffold workspace, copy rules
- `npx @arete/workspace update` - Update rules/templates
- `npx @arete/workspace sync` - Re-sync after package update

**Benefits:** Semantic versioning, `npm update` for upgrades, easy multi-workspace setup, simpler distribution.

**Trade-offs:** Adds Node.js dependency, more complex setup, symlink quirks.

**When to revisit:** If using across multiple clients/projects, or sharing with others.

---

### Meeting Automation (Fathom Integration)
*Added: 2026-02-03*

Explore automating meeting capture via Fathom API/webhook:
- Auto-add meeting summaries to `resources/meetings/` when meeting ends
- Include both summary and transcript
- Auto-populate meeting index
- Could trigger post-meeting: extract decisions → `memory/items/decisions.md`

**To investigate:**
- Fathom API capabilities and authentication
- Webhook setup for meeting end events
- File format for transcripts (separate file or embedded?)
- How to handle meeting metadata (attendees, duration, etc.)

---

### Google & capability-based integrations (scope later)
*Added: 2026-02-12*

Integrations are **capability-first** (calendar, meeting-recordings, notes). Multiple Google (or Microsoft) products = separate integrations; scope each when ready.

**To scope later:**
- **Google Drive / file store** — Different capability (e.g. `documents` or `file-store`): list/sync docs, get content, optional "notepad" style export to workspace. Providers: Google Drive, OneDrive, Dropbox. Notion is already `notes`; decide if file-store is same or sibling capability.
- **Gmail / email** — Separate capability (e.g. `email`): threads, search, "pull this thread into context." Different skills and UX from calendar or file store. Provider: Gmail (later Outlook, etc.).
- **Shared Google OAuth** — One Google Cloud project / OAuth client can expose multiple scopes (Calendar, Drive, Gmail). Each integration (google-calendar, future google-drive, future gmail) stays a separate registry entry; they may share credentials under `.credentials/` or config when we add more. Implementation detail, not a single "Google" integration.

**Current:** Google Calendar provider is scoped as its own PRD (calendar capability only). See `dev/backlog/features/google-calendar-provider.md`.

---

### MCP Integrations
When MCP integrations are added, consider these use cases:

**Linear**
- Pull roadmap items and sync with `goals/strategy.md`
- Create issues from PRD requirements
- Track project status

**Notion**
- Pull/push documentation
- Sync meeting notes to project inputs
- Export PRDs to Notion pages

**Jira**
- Import tickets as inputs for discovery
- Create tickets from PRD requirements
- Track sprint progress

**Jira Confluence**
- Pull docs/pages as context for PRDs and discovery
- Sync strategy or requirements to Confluence spaces
- Link PRD outputs or decisions to Confluence pages

**Dovetail**
- Pull research projects, insights, and tags as inputs for discovery/PRDs
- Map themes and findings to problem/solution framing
- Export synthesis or decisions back for traceability

**Slack**
- Import meeting summaries as inputs
- Capture feedback from channels
- Post project updates

**Calendar**
- Pull meeting context before note-taking
- Suggest inputs to gather based on upcoming meetings
- Track stakeholder availability

**Figma**
- Pull design context for PRDs
- Reference designs in competitive analysis
- Link mockups to requirements

**Metrics / analytics (Mixpanel, Amplitude, etc.)** *Added: 2026-02-11*
- **Pull**: Events, funnels, retention, user segments → inject into context for PRDs, discovery, or briefings (e.g. "how is feature X performing?"). Could power a "metrics brief" alongside memory/context.
- **Push**: Optional — tag goals/outcomes in workspace so metrics tools can track corresponding events or dashboards; or one-way sync of "success criteria" from PRD to analytics.
- **Shape**: Likely read-heavy (pull reports/summaries or key metrics); full two-way would require product-specific mapping (events ↔ workspace primitives). Start with pull-only: fetch funnel/retention for a feature or time range, drop into `context/` or briefing.

---

### Planning System: Automations, Integrations, and Proactive Use
*Added: 2026-02-06*

Once `goals/` and `now/` (quarter goals, week priorities) and skills exist, the system can use this data for:

**Proactive / agent-driven**
- **Quarter goals stale**: If no `goals/quarter.md` for current quarter (or file > 4 months old) → nudge "Set or refresh your quarter goals" (link quarter-plan skill). Integrate with Proactive Recommendations and `arete status`.
- **Week plan missing or stale**: If no `now/week.md` for current week (or empty/stale) → nudge "Plan your week" (week-plan skill). E.g. Monday morning or when user asks "what should I focus on?"
- **Alignment check**: Periodically (e.g. start of quarter or when goals/strategy.md changes) suggest "View goals alignment" (goals-alignment skill) so PM sees org vs PM goals and gaps.
- **Review prompts**: End of week → suggest week-review; end of quarter → suggest quarter review (and feed into next quarter-plan).

**Integrations (future)**
- **Calendar**: When building week plan, pull this week's meetings and suggest which days have deep-work blocks; surface "commitments due" from meeting notes or calendar.
- **Linear / Jira**: Map quarter goals (e.g. Q1-1, Q1-2) to initiatives or epics; show "progress toward Q1 goals" from completed issues. Optional: tag issues with goal ID.
- **Meetings (Fathom)**: After saving a meeting, suggest linking it to a quarter goal or week priority ("Did this advance a goal?") for traceability.
- **arete status**: Extend workspace health to include "Last quarter goals set", "Current week plan exists", "Goals alignment last viewed" (from file mtimes or optional metadata).

**Automations (lightweight)**
- **Archive old plans**: Optional script or `arete` subcommand: move past quarter file to `goals/archive/`, rename or archive past weeks so current week is easy to find.
- **Alignment snapshot**: When PM runs goals-alignment, optionally auto-save a snapshot to `goals/archive/alignment-YYYY-Qn.md` for history (e.g. once per quarter).

**Coach / accountability**
- Product Coach (see above) can use quarter and week plans to "push": "You said Q1-2 was a priority; nothing in this week's plan advances it," or "Your week plan has 5 deep-work items but only 2 free blocks."

---

### Plan → Autonomous Execution: Feedback for Improvement
*Added: 2026-02-06*

When going from a **plan** (e.g. PM Planning System plan) to **autonomous agent execution** (execute-prd with prd.json):

**What worked well**
- PRD in `dev/prds/{name}/prd.md` gives a single source of truth; prd.json tasks can reference it ("Reference PRD outputs for structure"). (PRDs for Areté features live in dev folder, not projects/active.)
- Atomic tasks (one TS change + test, then skills as separate tasks) keep each subagent scope small and typecheck/test reliable.
- Having a copy of prd.json in repo root when write to dev was restricted; then `cp` into autonomous folder with elevated permissions.

**Improvements to try**
- **Plan → PRD → prd.json in one flow**: When creating a plan, optionally output a "PRD summary" and a "suggested prd.json task list" so the maintainer can paste into autonomous without re-authoring. Or a small script/skill: "Convert plan section 7 (Implementation outline) into prd.json userStories."
- **Default file content in the repo**: For tasks that add DEFAULT_FILES with long content, consider checking in the desired README/template content as real files under a `workspace-structure-defaults/` or in the PRD project, so the subagent can read and paste instead of inventing. Reduces drift and ensures consistency.
- **First task includes test updates**: Including "add tests for new dirs/files" in the same task as workspace-structure changes keeps the codebase green and documents expected structure.
- **Branch name in plan**: If the plan specified a branch (e.g. `feature/pm-planning-system`), include it in the PRD or prd.json so execute-prd doesn't need a second step.
- **Execute-prd prerequisite check**: Before spawning, verify that the task description and acceptance criteria are sufficient for a fresh subagent (e.g. "contains path to edit" and "contains pass criteria"). Optional: light validation or prompt hint to subagent: "If the task references a file, open it first."

---

*Restored from git history (bd91c09). Paths updated for Phase 1 layout: goals/, now/, dev/prds/.*
