# Skills Gap Analysis — UI Support Audit

**Date**: 2026-03-07  
**Scope**: All skills in `packages/runtime/skills/` (build skills) and `~/code/arete-reserv/.agents/skills/` (workspace-level overrides/additions)  
**UI**: `packages/apps/web` — React SPA with routes: `/`, `/meetings`, `/meetings/:slug`, `/people`, `/people/:slug`, `/commitments`, `/goals`, `/memory`, `/intelligence`, `/search`, `/settings`

---

## UI Surface Summary

The web app currently has these primary surfaces:
- **Dashboard** — Today's meetings (read), recent meetings list, active projects list, commitment pulse (counts), recent memory, signal patterns, recent activity
- **Meetings** — List + filter + sort; Krisp sync button; per-meeting process button; detail view with review/approve items workflow
- **People** — Person list and detail view (read)
- **Commitments** — List with filter (open/overdue/this week/all); mark-done action
- **Goals** — Read-only view of `goals/strategy.md`, `goals/quarter.md` (outcomes), `now/week.md` (priorities with checkbox toggle)
- **Intelligence** — Signal patterns (cross-meeting topic detection) with day-range filter
- **Memory** — Read-only feed of decisions + learnings with filter/search
- **Search** — Full-text search across workspace
- **Settings** — Anthropic API key management only

---

## Skill-by-Skill Analysis

### Planning Skills

---

#### `quarter-plan`
**Purpose**: Guide the PM through defining 3–5 quarter outcomes, success criteria, and alignment to org strategy. Writes `goals/quarter.md`.

**User workflow enabled**: Set quarter goals and align them to org OKRs/pillars.

**UI support status**: **Partial**

- Goals page *reads* and displays `goals/quarter.md` (outcomes, success criteria, org alignment)
- No UI action to *create* or *edit* a quarter plan — file must be written via chat/CLI
- No "New Quarter Plan" button or wizard in the Goals page

**What UI action would trigger this**: A "Set quarter goals" button or wizard on the Goals page that initiates a chat with the quarter-plan skill, or an in-UI form for creating/editing `goals/quarter.md`.

---

#### `week-plan`
**Purpose**: Define the top 3–5 weekly outcomes linked to quarter goals. Writes `now/week.md`.

**User workflow enabled**: Plan the week and set weekly priorities.

**UI support status**: **Partial**

- Goals page *reads* and displays `now/week.md` priorities with checkbox toggles (mark done)
- No UI action to *create* a new week plan — must be triggered via chat/CLI
- No "Plan this week" button or wizard

**What UI action would trigger this**: A "Plan the week" button on the Goals page (or Dashboard) that triggers the week-plan skill in chat, or an in-UI form for creating `now/week.md`.

---

#### `week-review`
**Purpose**: Review and close the week; mark priorities as done/partial/carried; summarize quarter progress.

**User workflow enabled**: End-of-week close-out and reflection.

**UI support status**: **Partial**

- Goals page shows week priorities with checkbox toggles — user can mark items done
- No explicit "Close the week" / week-review flow in the UI
- No quarter progress summary or carried-over items UI

**What UI action would trigger this**: A "Close the week" button on the Goals page that triggers the week-review skill.

---

#### `daily-plan`
**Purpose**: Surface today's focus, week priorities, and per-meeting context for the day.

**User workflow enabled**: Start-of-day orientation — what to focus on and what meetings need prep.

**UI support status**: **Partial**

- Dashboard shows today's meetings (calendar events, read-only)
- Dashboard shows commitment pulse counts
- No assembled "daily plan" view — no synthesis of week priorities + meetings + commitments into a focused today view
- No "Generate daily plan" action in the UI

**What UI action would trigger this**: A "Plan my day" button on the Dashboard that triggers the daily-plan skill in chat, or a dedicated "Today" panel on the dashboard with synthesized focus + meetings + commitments.

---

#### `goals-alignment`
**Purpose**: Compare PM quarter goals to org strategy; produce alignment view with gap analysis.

**User workflow enabled**: Understand how weekly/quarterly work maps to org OKRs.

**UI support status**: **Partial**

- Goals page shows both `goals/strategy.md` and `goals/quarter.md` side-by-side (read)
- No explicit alignment mapping view — no table of "my goal → org pillar"
- No gap analysis UI
- No "Run alignment check" action

**What UI action would trigger this**: An "Alignment view" tab or button on the Goals page that invokes goals-alignment skill.

---

#### `weekly-winddown` *(workspace-only — not in build skills)*
**Purpose**: End-of-week reconciliation — process unprocessed meetings via parallel subagents, review wins, push to Notion, plan next week, refresh stakeholder intelligence.

**User workflow enabled**: Friday close-out combining meeting processing + week review + next-week planning in one orchestrated flow.

**UI support status**: **None**

- No "Weekly winddown" trigger in the UI
- Subskill components (meetings, goals) have partial UI support separately

**What UI action would trigger this**: A "Close the week" button (possibly on Goals page or Dashboard) that triggers the weekly-winddown skill in chat.

---

#### `daily-winddown` *(workspace-only — not in build skills)*
**Purpose**: End-of-day reconciliation — pull recordings, process meetings via subagents, sync Notion, reconcile tasks, update weekly plan, prime for tomorrow.

**User workflow enabled**: End-of-day close-out combining recording sync + meeting processing + task reconciliation.

**UI support status**: **None**

- No "End of day" or "Daily winddown" trigger in the UI

**What UI action would trigger this**: An "End of day" button on the Dashboard that triggers the daily-winddown skill in chat.

---

### Meeting Skills

---

#### `meeting-prep`
**Purpose**: Build a prep brief for an upcoming meeting — attendees, recent meetings, action items, talking points.

**User workflow enabled**: Prepare for a meeting before walking into it.

**UI support status**: **None**

- Dashboard shows today's meetings (calendar events) as read-only cards
- No "Prep for this meeting" action on any meeting card or meeting detail
- Meeting detail page is for *processed* meeting records (past meetings), not upcoming

**What UI action would trigger this**: A "Prep" button on each calendar event in the Dashboard's "Today's Meetings" section that triggers meeting-prep skill in chat with the meeting title/attendees pre-filled.

---

#### `prepare-meeting-agenda`
**Purpose**: Create a structured meeting agenda document (sections + time allocation).

**User workflow enabled**: Build a shareable agenda before a meeting.

**UI support status**: **None**

- No agenda creation UI anywhere
- No "Create agenda" button on meeting cards or calendar events

**What UI action would trigger this**: A "Create agenda" button on calendar events in the Dashboard, or a "New agenda" button in the Meetings section.

---

#### `save-meeting`
**Purpose**: Save pasted meeting content (summary, transcript, URL) to `resources/meetings/`.

**User workflow enabled**: Manually capture a meeting from any source (Fathom share link, Granola, Zoom, etc.).

**UI support status**: **None**

- Meetings page has a Krisp sync button but no manual meeting paste/save flow
- No "Paste meeting" or "Add meeting" UI entry point
- Must be done via chat ("save this meeting" trigger)

**What UI action would trigger this**: A "Add meeting" or "Paste meeting" button on the Meetings page that opens a text input/paste area and triggers save-meeting skill.

---

#### `process-meetings`
**Purpose**: Extract action items, decisions, and learnings from meeting files; create/update person records; write staged items for review.

**User workflow enabled**: Turn raw meeting notes into structured intelligence (memory, commitments, people).

**UI support status**: **Full** (for the core review workflow)

- Meeting detail page has a "Process" button that runs the skill
- Staged items are displayed as a review queue (approve/reject individual items)
- "Save & approve" commits approved items to memory
- SSE events update the UI in real-time during processing
- Meetings list shows status badges (triage / approved / processed)

---

#### `fathom`
**Purpose**: Pull meeting recordings from Fathom and save to workspace.

**User workflow enabled**: Sync Fathom recordings into the workspace.

**UI support status**: **None**

- Meetings page only has a Krisp sync button (`useSyncKrisp` hook)
- No Fathom sync button in the UI
- Must be triggered via CLI (`arete pull fathom`)

**What UI action would trigger this**: A "Sync Fathom" button on the Meetings page (alongside the existing Krisp sync button).

---

#### `krisp`
**Purpose**: Pull meeting recordings from Krisp and save to workspace.

**User workflow enabled**: Sync Krisp recordings into the workspace.

**UI support status**: **Full**

- Meetings page has a "Sync" button that triggers Krisp sync
- Job status polling shows sync progress
- Toast notifications on completion/failure

---

#### `notion` (meeting import)
**Purpose**: Pull Notion pages into workspace as markdown files.

**User workflow enabled**: Import a Notion page (PRD, doc, etc.) into workspace resources.

**UI support status**: **None**

- No Notion import UI anywhere
- Must be triggered via CLI or chat

**What UI action would trigger this**: A "Import from Notion" button in the Meetings or Resources section.

---

#### `sync` *(workspace-only — not in build skills)*
**Purpose**: Manually sync data from any connected integration (Fathom, Krisp, etc.).

**User workflow enabled**: One-stop sync from all connected integrations.

**UI support status**: **Partial**

- Krisp sync available in Meetings UI
- No unified "Sync all" button or integration status panel

---

#### `sync-to-notion` *(workspace-only — not in build skills)*
**Purpose**: Push a local agenda or meeting record to the Notion Meetings database.

**User workflow enabled**: After preparing an agenda or processing a meeting, push it to Notion.

**UI support status**: **None**

- No "Push to Notion" action on meeting detail or agenda pages

**What UI action would trigger this**: A "Sync to Notion" button on the Meeting Detail page (after processing).

---

#### `capture-conversation`
**Purpose**: Capture a pasted Slack/Teams/email conversation into a structured artifact in `resources/conversations/`.

**User workflow enabled**: Save and preserve important async conversations as searchable workspace resources.

**UI support status**: **None**

- No "Capture conversation" UI entry point anywhere
- No resources/conversations section in the UI
- Must be done via chat

**What UI action would trigger this**: A "Capture conversation" button (possibly in a "Resources" section or on the Meetings page) that opens a paste area.

---

### Project Skills

---

#### `create-prd`
**Purpose**: Interactive PRD creation with a Product Leader persona. Creates a project in `projects/active/{name}-prd/`.

**User workflow enabled**: Write a Product Requirements Document.

**UI support status**: **None**

- Active projects are listed on the Dashboard (read-only list)
- No "Create PRD" button or project creation flow in the UI
- No project detail page — projects only appear as a name/status card on the Dashboard

**What UI action would trigger this**: A "New project" or "Create PRD" button on the Dashboard's Active Projects section, or a dedicated /projects page with a "New" button.

---

#### `discovery`
**Purpose**: Guide problem discovery and research synthesis. Creates a project in `projects/active/{name}-discovery/`.

**User workflow enabled**: Start and run a structured discovery project.

**UI support status**: **None**

- Same as create-prd — projects are read-only list on Dashboard
- No "Start discovery" entry point

**What UI action would trigger this**: A "New project → Discovery" option in a project creation flow.

---

#### `competitive-analysis`
**Purpose**: Research and document competitive landscape. Creates a project in `projects/active/{name}-competitive-analysis/`.

**User workflow enabled**: Run competitive research and document the landscape.

**UI support status**: **None**

- No competitive analysis entry point in the UI
- Dashboard shows active projects list but no way to create one

**What UI action would trigger this**: A "New project → Competitive Analysis" option in a project creation flow.

---

#### `construct-roadmap`
**Purpose**: Build and maintain product roadmaps. Creates a project in `projects/active/{name}-roadmap/`.

**User workflow enabled**: Roadmap planning and prioritization.

**UI support status**: **None**

- No roadmap creation or viewing in the UI

**What UI action would trigger this**: A "New project → Roadmap" option in a project creation flow.

---

#### `general-project`
**Purpose**: Start a general-purpose project for work that doesn't fit specialized categories.

**User workflow enabled**: Create any ad-hoc project (migration, domain ownership, operational work).

**UI support status**: **None**

- Projects are listed on Dashboard as read-only

**What UI action would trigger this**: A "New project → General" option in a project creation flow.

---

#### `finalize-project`
**Purpose**: Complete a project, commit outputs to context, archive.

**User workflow enabled**: Close out a project and persist its learnings.

**UI support status**: **None**

- No project detail view or "Finalize" action in the UI
- Projects only appear as name/status entries on Dashboard

**What UI action would trigger this**: A project detail page with a "Finalize project" button.

---

#### `generate-prototype-prompt`
**Purpose**: Generate a Lovable-ready prototype prompt from a PRD or plan.

**User workflow enabled**: Turn a PRD into a visual prototype in Lovable.

**UI support status**: **None**

- No prototype generation UI anywhere

**What UI action would trigger this**: A "Generate prototype prompt" action on a PRD project detail page.

---

#### `synthesize`
**Purpose**: Process project inputs into structured insights, patterns, and decisions.

**User workflow enabled**: Synthesize research/interview inputs before finalization.

**UI support status**: **None**

- No synthesis flow in the UI
- No project inputs view

**What UI action would trigger this**: A "Synthesize" button on a project detail page (within the inputs/ folder context).

---

#### `notion-project-sync` *(workspace-only — not in build skills)*
**Purpose**: Link local projects to Notion databases (Product Roadmap, Product Library, Personal Projects); push/pull content.

**User workflow enabled**: Bi-directional sync between local project artifacts and Notion.

**UI support status**: **None**

- No Notion project sync UI anywhere

---

### Onboarding / Workspace Skills

---

#### `getting-started`
**Purpose**: Conversational onboarding flow that bootstraps a new workspace in 15–30 minutes.

**User workflow enabled**: New user setup — context bootstrap, first meeting pull, first win.

**UI support status**: **None**

- No onboarding flow in the UI
- No first-run detection or setup wizard
- Settings page only manages API key (no integration setup, no workspace bootstrap)

**What UI action would trigger this**: A first-run onboarding screen or a "Get started" wizard accessible from Settings.

---

#### `workspace-tour`
**Purpose**: Orient users to the Areté workspace — what it is, what they can do, how it's structured.

**User workflow enabled**: Help a new/returning user understand the workspace.

**UI support status**: **None**

- No tour or help flow in the UI

**What UI action would trigger this**: A "?" help button or a "Take a tour" option in the sidebar or Settings.

---

#### `rapid-context-dump`
**Purpose**: Bootstrap workspace context from docs, website, or pasted content with review-before-promote workflow.

**User workflow enabled**: Import existing docs/content into workspace context files.

**UI support status**: **None**

- No context import UI anywhere
- No resources/context editing surface in the web app

**What UI action would trigger this**: A "Import content" or "Bootstrap context" action in Settings or a dedicated onboarding flow.

---

#### `periodic-review`
**Purpose**: Quarterly workspace health check — reviews context freshness, memory health, and completeness.

**User workflow enabled**: Ensure workspace context is current and complete.

**UI support status**: **None**

- No context health/freshness view in the UI (no "last updated" indicators)
- `arete status` equivalent is CLI only

**What UI action would trigger this**: A "Workspace health" section in Settings or a Dashboard widget showing context staleness.

---

### People Skills

---

#### `people-intelligence`
**Purpose**: Classify people mentions into uncertainty-safe queue with evidence-backed suggestions; batch/digest review.

**User workflow enabled**: Triage unknown contacts from meetings into proper categories (internal/customer/user).

**UI support status**: **Partial**

- People page exists (list + detail view, read-only)
- No people classification/triage queue in the UI
- No batch review of "unknown" people from recent meetings
- People are created/classified by the process-meetings skill (via chat/CLI)

**What UI action would trigger this**: A "Triage people" section or badge count on the People page showing unclassified contacts from recent meetings.

---

#### `schedule-meeting`
**Purpose**: Schedule a meeting or block focus time by finding mutual availability and booking via Google Calendar.

**User workflow enabled**: Book a meeting with someone from within the workspace.

**UI support status**: **None**

- Dashboard shows today's meetings (read-only calendar events)
- No scheduling action on calendar events or person profiles
- No "Schedule meeting" button on person detail pages

**What UI action would trigger this**: A "Schedule meeting" button on Person detail pages, or a calendar event creation button on the Dashboard's today view.

---

## Skills Available Only in Workspace (not in build)

These skills exist in `~/code/arete-reserv/.agents/skills/` but not in `packages/runtime/skills/`:

| Skill | Description | UI Support |
|-------|-------------|------------|
| `daily-winddown` | End-of-day reconciliation via subagent orchestration | None |
| `weekly-winddown` | End-of-week review + transition via subagent orchestration | None |
| `sync` | Unified sync from all connected integrations | Partial (Krisp only) |
| `sync-to-notion` | Push agendas/meeting records to Notion Meetings database | None |
| `notion-project-sync` | Link local projects to Notion databases, bi-directional sync | None |

---

## Summary Table

| Skill | Category | UI Status | UI Entry Point Exists? |
|-------|----------|-----------|------------------------|
| `quarter-plan` | Planning | Partial | No (Goals page reads output, can't create) |
| `week-plan` | Planning | Partial | No (Goals page reads output, can't create) |
| `week-review` | Planning | Partial | Checkbox toggles only; no close-week flow |
| `daily-plan` | Planning | Partial | No (Dashboard shows calendar/commitments but no synthesis) |
| `goals-alignment` | Planning | Partial | No (Goals shows both files but no alignment view) |
| `weekly-winddown` | Planning | None | No |
| `daily-winddown` | Planning | None | No |
| `meeting-prep` | Meetings | None | No |
| `prepare-meeting-agenda` | Meetings | None | No |
| `save-meeting` | Meetings | None | No |
| `process-meetings` | Meetings | **Full** | Yes (Process button on meeting detail) |
| `fathom` | Meetings | None | No (Krisp sync exists; Fathom does not) |
| `krisp` | Meetings | **Full** | Yes (Sync button on Meetings page) |
| `notion` (import) | Meetings | None | No |
| `sync` (workspace) | Meetings | Partial | Krisp only |
| `sync-to-notion` | Meetings | None | No |
| `capture-conversation` | Meetings | None | No |
| `create-prd` | Projects | None | No |
| `discovery` | Projects | None | No |
| `competitive-analysis` | Projects | None | No |
| `construct-roadmap` | Projects | None | No |
| `general-project` | Projects | None | No |
| `finalize-project` | Projects | None | No |
| `generate-prototype-prompt` | Projects | None | No |
| `synthesize` | Projects | None | No |
| `notion-project-sync` | Projects | None | No |
| `getting-started` | Onboarding | None | No |
| `workspace-tour` | Onboarding | None | No |
| `rapid-context-dump` | Onboarding | None | No |
| `periodic-review` | Onboarding | None | No |
| `people-intelligence` | People | Partial | No classification queue in UI |
| `schedule-meeting` | People | None | No |

**Totals**: 33 skills audited — Full: 2, Partial: 6, None: 25
