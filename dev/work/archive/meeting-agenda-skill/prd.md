# PRD: Prepare Meeting Agenda Skill

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-11  
**Branch**: `feature/meeting-agenda-skill`  
**Depends on**: Calendar integration (optional), get_meeting_context pattern, skill router

---

## 1. Problem & Goals

### Problem

Users can ask the agent to "create a meeting agenda" and receive ad-hoc output. There is no skill that defines how to build an agenda, so quality and consistency vary. **meeting-prep** gives context *about* people and past meetings but does not produce an agenda document or account for meeting type (leadership vs customer vs dev team). Users also have no way to list, view, or override agenda templates.

### Goals

1. **Prepare Meeting Agenda skill**: A dedicated skill that produces a structured meeting agenda (not just prep context), with context selector (meeting type), calendar-aware "which meeting?" flow, and optional workspace context (get_meeting_context).
2. **Template system**: Default meeting-type templates (leadership, customer, dev team, 1:1, other) with sections and time allocation; users can list and view templates via CLI.
3. **Template overrides**: File-based custom templates in `.arete/templates/meeting-agendas/` override defaults; users can create entirely new meeting types (e.g., Board Meeting, QBR).
4. **Save location**: Agendas save to `now/agendas/` (or project folder / clipboard); distinct from `resources/meetings/` (post-meeting notes).
5. **Router integration**: "Create meeting agenda" / "prepare agenda" routes to this skill; "prep for meeting with [name]" continues to route to meeting-prep.

### Out of Scope (v1)

- Inline customization during agenda creation (add/remove/reorder sections in chat) — document in skill for future; not required for first ship.
- Calendar write (append agenda to event notes).
- Slack/email share of agenda.

---

## 2. Architecture Decisions

### Template Discovery Order

1. `.arete/templates/meeting-agendas/[type].md` (workspace custom) — highest priority  
2. `runtime/templates/meeting-agendas/[type].md` (shipped defaults)  
3. If neither exists: skill uses inline template definition (Leadership, Customer, Dev Team, 1:1, Other) embedded in SKILL.md

### Template File Format

Markdown with optional YAML frontmatter: `name`, `type`, `description`, `time_allocation` (section → percentage). Sections are `##` headings in the body.

### Agenda Save Location

- **Primary**: `now/agendas/YYYY-MM-DD-meeting-title.md`  
- **Alternative**: `projects/active/[project]/agendas/[title].md` when meeting is project-specific  
- **Option**: Copy to clipboard only (no save)

### Skill vs meeting-prep

- **meeting-prep**: "Prep for my meeting with Jane" → prep brief (attendees, recent meetings, action items, talking points). Uses get_meeting_context.  
- **prepare-meeting-agenda**: "Create an agenda for this meeting" → structured agenda document with type-based sections, optional time allocation, suggested items from context. Uses get_meeting_context optionally; produces agenda output and save flow.

---

## 3. User Stories

1. As a PM, when I say "create a meeting agenda" or "prepare an agenda for my 1:1 with Jane", the agent uses the prepare-meeting-agenda skill and produces a structured agenda (sections, optional time allocation) that I can save or copy.
2. As a PM, I can choose or confirm meeting type (leadership, customer, dev team, 1:1, other) so the agenda sections match the meeting purpose.
3. As a PM, when calendar is configured, the agent can list my meetings (today or upcoming) and I pick one; the agenda is built from that event's title, duration, and attendees.
4. As a PM, I can run `arete template list meeting-agendas` to see default and custom templates, and `arete template view meeting-agenda --type leadership` to view a template's structure.
5. As a PM, I can add custom templates in `.arete/templates/meeting-agendas/` (e.g., `board-meeting.md`) to define new meeting types or override defaults.
6. As a PM, I can save a created agenda to `now/agendas/` or copy it to clipboard; the skill suggests process-meetings after the meeting.

---

## 4. Requirements

### 4.1 Template Loader / Discovery (`src/core/meeting-agenda-templates.ts`)

**Types:**
- `MeetingAgendaTemplate`: `{ name: string; type: string; description?: string; path: string; sections?: string[]; timeAllocation?: Record<string, number> }`
- `listMeetingAgendaTemplates(workspaceRoot: string): Promise<{ default: MeetingAgendaTemplate[]; custom: MeetingAgendaTemplate[] }>` — scan runtime and .arete dirs, parse frontmatter
- `getMeetingAgendaTemplate(workspaceRoot: string, type: string): Promise<MeetingAgendaTemplate | null>` — resolve type to template (custom first, then default), return template with content/path
- Parse frontmatter (name, type, description, time_allocation); derive sections from ## headings in body

**Behavior:**
- Default templates dir: Use `getSourcePaths().templates` from `src/core/workspace.ts` plus `meeting-agendas` (so `runtime/templates/meeting-agendas/` in dev, `dist/templates/meeting-agendas/` when built)
- Custom templates dir: `.arete/templates/meeting-agendas/` under workspace root
- If type not found in files, return null (caller can use inline template)

### 4.2 Default Template Files (`runtime/templates/meeting-agendas/`)

Five files: `leadership.md`, `customer.md`, `dev-team.md`, `one-on-one.md`, `other.md`. Each has YAML frontmatter (name, type, description, time_allocation) and markdown body with ## sections and brief bullet guidance. Content aligns with backlog/plan templates (Updates, Decisions, Asks/Blockers, Next Steps for leadership; etc.).

### 4.3 Workspace Structure

- Add `now/agendas` to `BASE_WORKSPACE_DIRS` in `src/core/workspace-structure.ts`
- Add `.arete/templates/meeting-agendas` to `BASE_WORKSPACE_DIRS`
- Ensure `arete install` and `arete update` create these dirs (no overwrite of existing files)

### 4.4 CLI: `arete template list meeting-agendas`

- Subcommand under `arete template` (or top-level `arete template list` with first arg `meeting-agendas`)
- Calls `listMeetingAgendaTemplates(workspaceRoot)`
- Output: two groups, "Default Templates" and "Custom Templates", with name and description per template
- With `--json`: structured JSON array

### 4.5 CLI: `arete template view meeting-agenda --type <name>`

- Resolves template by type via `getMeetingAgendaTemplate(workspaceRoot, type)`
- Output: template name, type, description, sections, time allocation, and body (or path) so user can see structure
- With `--json`: full template object
- Exit non-zero with message if type not found

### 4.6 Skill: `runtime/skills/prepare-meeting-agenda/SKILL.md`

**Frontmatter:** name, description, triggers (meeting agenda, create agenda, prepare agenda, agenda for, build agenda), primitives (User, Problem, Solution), work_type: planning, category: essential, intelligence (context_injection, entity_resolution, memory_retrieval), requires_briefing: false.

**Workflow (documented in skill):**
1. Identify meeting (calendar list via `arete pull calendar --today --json` or user input)
2. Select or infer meeting type (context selector; inference rules from title/attendees)
3. Choose template (default for type, or "list all" → pick from CLI/list)
4. Optionally gather context (get_meeting_context for attendees) to suggest items
5. Build agenda (sections from template, time allocation if duration known, inject suggested items)
6. Review and adjust (offer to edit)
7. Save or copy (offer `now/agendas/YYYY-MM-DD-title.md`, project folder, or clipboard); suggest process-meetings after meeting

**Context inference rules:** Document in skill (title keywords and attendee signals for 1:1, leadership, customer, dev team, other). User can always override.

**Output format:** Markdown with # Meeting Agenda: [Title], metadata (date, duration, attendees, type), ## sections with optional (Xmin), bullets and checkboxes for action items.

### 4.7 Skill Router

- New skill is under `runtime/skills/prepare-meeting-agenda/` and ships with package; router discovers it via existing skill discovery (paths.agentSkills from install).
- Triggers in skill frontmatter ensure "create meeting agenda" / "prepare agenda" match; meeting-prep triggers remain distinct ("prep for meeting", "prep me for").
- No code change to router required if discovery is file-based; verify routing with a test or manual check.

### 4.8 Documentation

- **AGENTS.md**: Add subsection under Skills or Meeting Intelligence for "Prepare Meeting Agenda" — purpose, when to use (vs meeting-prep), template system (list/view, custom dir), save location (`now/agendas/`).
- **Skill doc**: In prepare-meeting-agenda SKILL.md, add "Related: meeting-prep" and when to use which (prep brief vs agenda document).
- **Backlog**: Update `dev/backlog/features/meeting-agenda-skill.md` to mark implemented or link to PRD.

---

## 5. Task Breakdown

### Group A: Template System & Workspace

**Task A1: Template loader and types**  
Create `src/core/meeting-agenda-templates.ts` with types `MeetingAgendaTemplate`, `listMeetingAgendaTemplates(workspaceRoot)`, `getMeetingAgendaTemplate(workspaceRoot, type)`. Resolve default dir from package/runtime path; custom dir `.arete/templates/meeting-agendas/`. Parse frontmatter (name, type, description, time_allocation) and ## sections from body. Return null when type not found.  
- Acceptance: Types compile; list returns default + custom arrays; get returns custom first then default; unit tests with mock fs or temp dirs.

**Task A2: Default template files**  
Create `runtime/templates/meeting-agendas/` with five files: `leadership.md`, `customer.md`, `dev-team.md`, `one-on-one.md`, `other.md`. Each has YAML frontmatter and ## sections with short bullet guidance per backlog/plan.  
- Acceptance: All five files present; frontmatter parses; loader returns them as default templates.

**Task A3: Workspace structure**  
Add `now/agendas` and `.arete/templates/meeting-agendas` to `BASE_WORKSPACE_DIRS` in `src/core/workspace-structure.ts`. Ensure install/update create these; no default file content required in DEFAULT_FILES for these dirs.  
- Acceptance: `arete install` in temp workspace creates dirs; `arete update` backfills if missing; existing tests or new test for structure.

### Group B: CLI Commands

**Task B1: Template list command**  
Add `arete template list meeting-agendas` (implement via `arete template` command with subcommands, or equivalent). Use `listMeetingAgendaTemplates(workspaceRoot)`; output human-readable list (default vs custom) and support `--json`.  
- Acceptance: Command exists; lists default and custom templates; --json returns structured output; test for command.

**Task B2: Template view command**  
Add `arete template view meeting-agenda --type <name>`. Use `getMeetingAgendaTemplate(workspaceRoot, type)`; print template name, type, description, sections, time allocation, body snippet. Support `--json`. Exit non-zero if type not found.  
- Acceptance: Command exists; view leadership shows content; unknown type exits non-zero; test.

### Group C: Skill & Routing

**Task C1: Prepare meeting agenda skill**  
Create `runtime/skills/prepare-meeting-agenda/SKILL.md` with frontmatter (name, description, triggers, primitives, work_type, category, intelligence), workflow (7 steps: identify meeting, select/infer type, choose template, gather context, build agenda, review, save/share), context inference rules table, output format, and references (PATTERNS.md get_meeting_context, calendar pull, now/agendas).  
- Acceptance: Skill file exists; workflow and inference rules documented; agent can follow to produce agenda; triggers include "meeting agenda", "create agenda", "prepare agenda".

**Task C2: Skill router verification**  
Verify skill is discoverable (in package dist/skills or install copy) and that "create meeting agenda" / "prepare agenda" route to prepare-meeting-agenda while "prep for meeting with X" routes to meeting-prep. Add or adjust a test in `test/core/skill-router.test.ts` if needed.  
- Acceptance: Router test or manual check shows correct skill for agenda vs prep phrases; no regression for meeting-prep.

### Group D: Documentation

**Task D1: Documentation updates**  
Update AGENTS.md with Prepare Meeting Agenda skill (purpose, when to use vs meeting-prep, template list/view, custom templates, save location). In prepare-meeting-agenda SKILL.md add "Related: meeting-prep" and when to use which. Optionally update `dev/backlog/features/meeting-agenda-skill.md` (implemented, link to PRD).  
- Acceptance: AGENTS.md contains meeting agenda skill and template system; skill doc references meeting-prep; docs accurate.

---

## 6. Pre-Mortem (Risks & Mitigations)

| Risk | Problem | Mitigation | Verification |
|------|--------|------------|--------------|
| **Context gaps** | Subagents may not know template format or workspace paths | PRD and task descriptions specify exact paths and frontmatter schema; reference runtime/templates and .arete/templates | Each task AC references paths; subagent prompt includes "read PRD section 4" |
| **Test patterns** | New loader might not mock fs consistently | Follow existing test patterns (e.g. workspace.test.ts, config.test.ts) for path resolution; use real temp dir or mock readdir/readFile | Tests pass in CI; no external fs assumptions |
| **Integration** | Template loader used by CLI and skill; wrong resolution order breaks overrides | Loader explicitly checks .arete first, then runtime; single source of truth in meeting-agenda-templates.ts | Unit test: custom template with same type overrides default |
| **Scope creep** | Inline customization (add/remove sections in chat) could expand scope | Out of scope in PRD; skill describes workflow without requiring agent to implement interactive section edit loop | AC for skill is "workflow documented" and "triggers present", not full interactive customization |
| **Reuse** | Subagent might reimplement calendar or get_meeting_context | Skill doc says "run arete pull calendar", "use get_meeting_context pattern"; no new calendar or context logic | Skill references PATTERNS.md and existing commands only |
| **State tracking** | prd.json not updated after task | Execute-prd workflow requires update prd.json after each task | Orchestrator checklist includes "prd.json updated" |
| **Documentation** | AGENTS.md and skill doc out of sync with behavior | Doc task D1 depends on all implementation tasks; doc subagent gets summary of what was built | Final review: AGENTS.md section matches template CLI and save location |

---

## 7. Success Criteria

- PM can say "create a meeting agenda" and receive a structured agenda (sections, optional time) from the prepare-meeting-agenda skill.
- PM can run `arete template list meeting-agendas` and `arete template view meeting-agenda --type leadership` to browse templates.
- Custom template in `.arete/templates/meeting-agendas/` overrides default for that type; new types (e.g. board-meeting) appear in list.
- Agendas can be saved to `now/agendas/`; skill suggests process-meetings after the meeting.
- "Create meeting agenda" routes to prepare-meeting-agenda; "prep for meeting with Jane" routes to meeting-prep.
- All new code has tests; `npm run typecheck` and `npm test` pass.
