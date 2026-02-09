# PRD: Meeting Intelligence

**Version**: 1.0  
**Status**: Implemented (2026-02-06)  
**Depends on**: Meeting Propagation PRD (process-meetings, template enrichment, people propagation)

---

## 1. Problem & Goals

### Problem

PMs have meeting notes and people data after propagation, but no structured way to prepare for upcoming meetings or surface meeting context in daily planning. They must manually search meetings, people, and projects to recall what they owe attendees or what was discussed last time.

### Goals

- **Meeting prep**: A meeting-prep skill builds a prep brief for an upcoming (or past) meeting: attendee details, recent meetings with those people, related projects, open action items.
- **Meeting context helper**: A reusable pattern (in skill or core) aggregates "context for a meeting" — related project, attendee details, outstanding items — so prep and daily-plan can use it.
- **Daily planning**: A daily-plan skill extends the planning system; for today's meetings it surfaces meeting context (what you owe, prep suggestions) alongside week priorities.
- **Documentation**: AGENTS.md, SETUP.md, and pm-workspace.mdc updated; skills discoverable.

### Out of Scope

- Task/commitment system (open action items derived from meeting files only).
- Calendar integration (user provides meeting title/attendees; no calendar pull in v1).
- Background sync or automation.
- MCP tools (e.g. Work MCP) for external task systems.

---

## 2. User Stories (Summary)

1. As a PM I can use the **meeting-prep** skill with a meeting title and attendees to get a prep brief: who they are, recent meetings, related projects, and open action items involving them.
2. As a PM I can use **meeting-prep** for a meeting I'm about to have (or just had) and receive suggested talking points based on context.
3. As a PM I can use the **daily-plan** skill to see today's focus, week priorities, and meeting context for each of today's meetings.
4. As a PM I can provide today's meetings (title + attendees) to daily-plan so it can fetch context per meeting.
5. As a PM I can find meeting-prep and daily-plan in AGENTS.md, SETUP.md, and the skills index.

---

## 3. Requirements

### 3.1 Get Meeting Context (Logic)

**Purpose**: Aggregate context for a single meeting so meeting-prep and daily-plan can reuse it.

**Inputs**: `meeting_title: string`, `attendees: string[]` (names or slugs).

**Outputs** (structure for skill use):
- **Related project**: From `projects/active/` READMEs where `stakeholders` or body mentions attendee names/slugs.
- **Attendee details**: From `people/` — name, role, company, last interaction (from person file or most recent meeting with that person).
- **Recent meetings with attendees**: From `resources/meetings/` where frontmatter `attendee_ids` or body/attendees list matches.
- **Outstanding action items**: From meeting files — unchecked action items in "## Action Items" where the item implies involvement of an attendee (or from any meeting with that attendee).
- **Prep suggestions**: Derived from above — e.g. "Review 2 open action items with Jane", "Last met 2026-02-01: discussed X; you said you'd Y".

**Implementation**: For v1, **documented workflow in skills** is sufficient — no new TS required unless we want a shared helper.

### 3.2 Meeting-Prep Skill

**Location**: `.cursor/skills/meeting-prep/SKILL.md`

**When to use**:
- "Prep for my meeting with Jane"
- "I have a call with Acme in 30 minutes"
- "Meeting prep for Product Review"
- Before or after a meeting to refresh context

**Workflow**:

1. **Identify meeting** — User provides meeting title and/or attendee names. If not provided, ask.
2. **Gather context** (get_meeting_context pattern) — Resolve attendees to people slugs, read person files, search meetings, read projects, extract action items.
3. **Build prep brief** — Attendees, recent meetings, related projects, open action items, suggested talking points.
4. **Tone** — Concise; prep-focused.

### 3.3 Daily-Plan Skill

**Location**: `.cursor/skills/daily-plan/SKILL.md`

**When to use**:
- "What's on my plate today?"
- "Daily plan"
- "Today's focus"

**Workflow**:

1. **Gather context** — Week file, quarter file, scratchpad. Ask user for today's meetings (title + attendees) or "none".
2. **For each meeting** — Run get_meeting_context pattern; summarize per meeting.
3. **Build daily plan** — Today's focus, meetings with context, commitments due, carry-over.
4. **Optional** — Offer to create `resources/plans/day-YYYY-MM-DD.md` (Phase 2; v1 output to chat only).

### 3.4 Documentation

- **AGENTS.md**: Add "Meeting Intelligence" subsection.
- **SETUP.md**: Add meeting-prep and daily-plan under skills or planning.
- **pm-workspace.mdc**: Add both skills to PM Actions table.

---

## 4. Acceptance Criteria (Implementation)

- [x] Skill file exists: `.cursor/skills/meeting-prep/SKILL.md` with When to Use, Workflow, output structure.
- [x] Skill file exists: `.cursor/skills/daily-plan/SKILL.md` with When to Use, Workflow, output structure.
- [x] Both skills use the get_meeting_context pattern (documented in skill).
- [x] AGENTS.md updated with Meeting Intelligence and skill references.
- [x] SETUP.md updated with meeting-prep and daily-plan.
- [x] pm-workspace.mdc updated with both skills in PM Actions.
- [x] No new CLI commands or TS modules required for v1 (skills-only).
- [x] Running `npm run typecheck` and `npm test` passes.

---

## 5. Dependencies & References

- **Meeting Propagation PRD**: `.cursor/build/prds/meeting-propagation/prd.md`
- **People System**, **Meetings**, **Planning**, **Projects**: See AGENTS.md

---

## 6. Success Metrics

- User runs meeting-prep for "Call with Jane"; receives a brief with details and suggested talking points.
- User runs daily-plan, supplies today's meetings; receives a plan with meeting context and prep suggestions per meeting.

---

## 7. Arete Alignment

- **Think better**: Prep briefs surface context before meetings.
- **Move faster**: Daily plan shows what matters today and what each meeting needs.
- **Gain clarity**: Outstanding items and recent history are explicit, not scattered.
