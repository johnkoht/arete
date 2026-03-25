---
title: "Workspace Areas Refactor"
slug: create-areas
status: planned
size: large
tags: [areas, workspace, refactor]
created: "2026-03-25T05:00:00.000Z"
updated: "2026-03-25T05:20:00.000Z"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 12
---

# Workspace Areas Refactor

## Goal
Introduce **Areas** as persistent work domains that accumulate intelligence across quarters, simplify goals, and enable context-aware meeting processing.

## Context
The current workspace lacks a hub for ongoing work. Meetings aren't linked to domains, commitments aren't scoped, and context injection is generic. When prepping for a CoverWhale meeting, the system doesn't know it's part of Glance Communications or pull relevant history.

## Key Decisions

| Decision | Resolution |
|----------|------------|
| Recurring meetings storage | YAML frontmatter (reliable parsing), display as markdown table |
| Template syntax | `{variable}` (matches existing `renderTemplate`) |
| `area` field on goals/commitments | Optional: `area?: string` |
| `AreaMatch` interface | `{ areaSlug: string; matchType: 'recurring' \| 'inferred'; confidence: number }` |
| Context service approach | Scan `context/**/*.md` and `areas/` as their own category (not primitives) |
| Area vs. Project | Area = persistent domain; Project = time-bound work with `area:` frontmatter |

## Area Template

```yaml
---
area: {name}
status: active
recurring_meetings:
  - title: CoverWhale Sync
    attendees: [carla, dev-team]
    frequency: weekly
---

# {name}

{description}

## Active Goals
- [[goals/quarter.md#goal-slug|Goal Title]] (Q2 2026)

## Current State
- Key status points

## Active Work
- [[projects/active/project-name/|Project Name]] — In progress

## Key Decisions
- YYYY-MM-DD: Decision description

## Open Commitments
<!-- Auto-filtered from commitments by area -->

## Backlog
- Future work items

## Notes
<!-- Working observations -->
```

## Plan

### Phase 1: Core Structure (Tasks 1-6)

**Task order: 1 → 2 → 3 → 4 → 5 → 6** (templates → context → parser → CLI → schemas)

1. **Create area and project templates**
   - Create `packages/runtime/templates/area.md` with YAML frontmatter for recurring meetings
   - Create `packages/runtime/templates/project-index.md` with inputs/outputs sections, external links
   - Add `areas/` to `BASE_WORKSPACE_DIRS` for `arete install`
   - Acceptance: Templates exist and are copied to new workspaces

2. **Update context service for area-level resources**
   - Add scanning for `context/**/*.md` (nested area directories) as category `'area-context'`
   - Add scanning for `areas/*.md` as category `'area'`
   - Keep primitives unchanged (company-level context only)
   - Acceptance: Files in `context/glance-communications/` appear in `arete brief` output

3. **Create area parser service**
   - Parse area files: extract YAML frontmatter (recurring_meetings), markdown sections (Current State, Key Decisions, Backlog)
   - Return `AreaMatch` type: `{ areaSlug: string; matchType: 'recurring' | 'inferred'; confidence: number }`
   - Provide `getAreaForMeeting(meetingTitle)` lookup using recurring_meetings array
   - Add `get_area_context` pattern to `runtime/skills/PATTERNS.md`
   - Acceptance: Given "CoverWhale Sync", returns `{ areaSlug: 'glance-communications', matchType: 'recurring', confidence: 1.0 }`

4. **Add `arete create area` command**
   - Scaffold new area file from template with slug-based naming
   - Create corresponding `context/{area-slug}/` directory
   - Add `arete create` command group (new command file)
   - Acceptance: `arete create area glance-communications` creates both files

5. **Simplify goals with area links**
   - Create new `goals/quarter.md` template with optional `area:` field per goal
   - Update goal parser to read `area?: string` from frontmatter
   - Add `arete goals list --area <slug>` filter (optional, can defer)
   - Acceptance: Goals with `area:` field are parsed correctly

6. **Add area field to commitments**
   - Add `area?: string` to Commitment type
   - Update commitment extraction to accept optional area
   - Update `CommitmentsService.sync()` to store area
   - Add `arete commitments list --area <slug>` filter
   - Acceptance: Commitments can be tagged and filtered by area

### Phase 2: Skill Updates (Tasks 7-11)

7. **Update meeting-prep skill for area context**
   - Use area parser's `getAreaForMeeting()` to identify meeting's area
   - Inject area context (Current State, Key Decisions, Open Commitments) into prep
   - For unmapped recurring meetings, prompt user to select/create area association
   - Use `get_area_context` pattern from PATTERNS.md
   - Acceptance: Meeting prep for "CoverWhale Sync" auto-pulls Glance Communications context

8. **Update process-meetings skill for area inference** (split into 3 subtasks)
   
   8a. **Area mapping for meetings**
   - For recurring meetings: auto-map via area parser
   - For one-off meetings: infer from attendees + content, confirm if confidence < 0.7
   - Acceptance: Processed meeting has area association
   
   8b. **Decision extraction to area file**
   - Write extracted decisions to area's `## Key Decisions` section
   - Use date-prefixed format matching existing pattern
   - Acceptance: New decision appears in correct area file
   
   8c. **Commitment area tagging**
   - Tag new commitments with area
   - Scope de-duplication to area (check existing commitments in same area first)
   - Acceptance: Commitments from meeting are tagged with area

9. **Update weekly planning skill**
   - Read goals with area links
   - Pull open commitments grouped by area
   - Include area context in weekly priorities section
   - Acceptance: Weekly plan shows "Glance Communications: 3 open commitments"

10. **Update daily planning skill**
    - Pull area context for today's meetings (via recurring meeting mapping)
    - Include relevant area state in daily focus
    - Acceptance: Daily plan notes area-specific context for today's meetings

11. **Update GUIDE.md and workspace documentation**
    - Document Area vs. Project taxonomy
    - Document areas lifecycle (create → accumulate → archive)
    - Document context hierarchy (company → area → project)
    - Document recurring meeting mapping (YAML frontmatter)
    - Acceptance: New users understand area-based workflow

### Phase 3: Onboarding Integration (Task 12)

12. **Add area setup to onboarding tool**
    - Add Day 1 area setup step: "What are your main work domains?"
    - Scaffold 2-3 areas from user input using `arete create area`
    - Acceptance: New users have areas set up during onboarding

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Context service regression | High | Add tests for existing context paths before modifying |
| Area parser YAML parsing | Medium | Use existing `yaml` package, add edge case tests |
| Skill interdependencies | Medium | Build area parser (task 3) before all skill updates |
| Breaking existing commitments | Low | `area` field is optional; existing data unchanged |
| Migration complexity | Low | Don't auto-migrate; document manual setup |

## Out of Scope

- Separate task system (using commitments, defer tasks)
- Custom skills for external systems (Notion sync, Jira push)
- Automated area creation from meeting patterns
- Area archival workflow
- Quarterly review skill (future enhancement)

---

**Size**: Large (12 tasks across 3 phases)

**Recommended approach**:
- Phase 1 (Core) ships first — enables manual testing
- Phase 2 (Skills) depends on Phase 1 task 3 (area parser)
- Phase 3 (Onboarding) can ship with Phase 2 or after
