# Workspace Areas Refactor

## Problem Statement

The current workspace structure lacks a concept for **persistent work domains** that accumulate intelligence across quarters. Goals are heavyweight, meetings aren't contextually linked to ongoing work, and there's no hub for "this is all the context about Glance Communications."

**User impact**: Meeting prep doesn't pull relevant history. Commitments aren't scoped to work areas. Weekly planning doesn't connect to ongoing initiatives. Context injection is generic rather than domain-aware.

**Success looks like**: When I prep for a CoverWhale meeting, the system knows it's part of Glance Communications, pulls relevant decisions/commitments, and provides area-specific context automatically.

---

## Key Decisions

1. **Areas as persistent hubs** — Areas are markdown files that accumulate knowledge across quarters. They link to goals, projects, and store recurring meeting mappings.

2. **Recurring meetings stored in area files** — Each area has a `## Recurring Meetings` table. Skills read this to auto-map meetings to areas. Non-area meetings simply don't get mapped.

3. **Goals simplified** — Single `goals/quarter.md` file with lightweight goal entries. Each goal links to an area.

4. **Context hierarchy** — `context/` for company-level resources, `context/{area}/` for area-level resources, `projects/{name}/inputs/` and `/outputs/` for project-specific resources.

5. **Links in project files, not area files** — Area files list active work with links to projects. External links (Jira, Notion, Drive) live in the project's `index.md`.

6. **Commitments get area field** — Add area association to commitments. Defer separate task system.

7. **Area-to-meeting inference** — Recurring meetings auto-map via area file. One-off meetings inferred from attendees/content, with fallback to user confirmation.

---

## Workspace Structure

```
areas/
  ├── glance-communications.md      # Hub file
  ├── glance-2-mvp.md
  └── onboarding.md

goals/
  ├── quarter.md                    # Simplified quarterly goals
  ├── strategy.md                   # Org strategy reference
  └── archive/

context/
  ├── business-overview.md          # Company-level (stable)
  ├── products-services.md
  ├── glance-communications/        # Area-level resources
  │   ├── template-inventory.csv
  │   └── architecture-diagram.md

projects/
  ├── active/
  │   ├── rollout-strategy/
  │   │   ├── index.md              # Links, external refs
  │   │   ├── inputs/
  │   │   └── outputs/
  └── archive/

now/
  ├── week.md                       # Weekly plan + daily cockpit
  ├── scratchpad.md
  ├── agendas/
  └── archive/
```

---

## Area Template

```markdown
---
area: Glance Communications
status: active
notion: https://...
jira_epic: COMMS-xxx
---

# Glance Communications

Glance's communication platform — enabling adjusters to send 
templated, tracked communications across channels.

## Active Goals
- [[goals/quarter.md#launch-comms-email|Launch Comms Email Feature]] (Q2 2026)

## Current State
- Email templates v1 shipping (POP live, CoverWhale in progress)
- 362 templates identified across org

## Active Work
- [[projects/active/rollout-strategy/|Rollout Strategy]] — In progress
- [[projects/active/coverwhale-templates/|CoverWhale Templates]] — In progress

## Recurring Meetings
| Meeting | Attendees | Frequency |
|---------|-----------|-----------|
| Glance Email Templates Weekly | Lindsay, Justin | Weekly, Tue 10am |
| CoverWhale Sync | Carla, Dev Team | Weekly, Thu 2pm |

## Key Decisions
- 2026-03-16: Native composer deferred to 2027
- 2026-03-04: Account-cluster rollout, not LOB-based

## Open Commitments
<!-- Auto-filtered from commitments by area -->

## Backlog
- SMS pilot program
- Phone call logging integration

## Notes
<!-- Working observations, questions, ideas -->
```

---

## Project Template

```markdown
---
area: glance-communications
status: active
---

# Rollout Strategy

Email template rollout across accounts.

## Links
- [Jira Epic](https://jira.com/COMMS-123)
- [Notion Spec](https://notion.com/rollout)
- [Drive Folder](https://drive.google.com/rollout)

## Inputs
- [[inputs/template-usage-data.csv]]
- [[inputs/account-analysis.xlsx]]

## Outputs
- [[outputs/rollout-plan.md]]
```

---

## Plan

### Part 1: Core Structure

1. **Create areas/ directory and templates**
   - Create `runtime/templates/area.md` with agreed template
   - Create `runtime/templates/project-index.md` with project template
   - Add `arete create area <name>` command scaffolding
   - AC: Running `arete create area glance-communications` creates file from template

2. **Update context/ structure for area-level resources**
   - Document `context/{area}/` pattern in workspace guide
   - Update context service to glob `context/**/*.md`
   - AC: Files in `context/glance-communications/` are included in context injection

3. **Update projects/ structure with inputs/outputs**
   - Update project template to include `inputs/` and `outputs/` sections
   - Document pattern in workspace guide
   - AC: New projects scaffold with inputs/outputs structure

4. **Simplify goals/quarter.md**
   - Create simplified quarter.md template
   - Each goal links to an area via `area:` field
   - AC: Goals reference areas, single scannable file

5. **Add area field to commitments**
   - Update commitment extraction to include area field
   - Update commitment storage schema
   - Add area filter to `arete commitments list --area <slug>`
   - AC: Commitments can be filtered by area

6. **Update GUIDE.md and workspace documentation**
   - Document areas lifecycle
   - Document context hierarchy (company → area → project)
   - Document recurring meeting mapping
   - AC: New users understand area-based workflow

### Part 2: Skill Updates

7. **Update meeting-prep skill for area context**
   - Read recurring meetings from area files to identify meeting→area mapping
   - Inject area context (Current State, Key Decisions, Open Commitments) into prep
   - When creating agenda for unmapped recurring meeting, prompt user to select area
   - AC: Meeting prep for "CoverWhale Sync" auto-pulls Glance Communications context

8. **Update process-meetings skill for area inference**
   - For recurring meetings: use area mapping from area file
   - For one-off meetings: infer from attendees + content, confirm if low confidence
   - Write extracted decisions to area's Key Decisions section
   - Scope commitment de-duplication to area
   - AC: Processed meeting updates correct area file, commitments tagged with area

9. **Update weekly planning skill**
   - Read goals with area links
   - Pull open commitments grouped by area
   - Link weekly priorities to areas
   - AC: Weekly plan shows commitments organized by area

10. **Update daily planning skill**
    - Pull area context for today's meetings (via recurring meeting mapping)
    - Include relevant area state in daily focus
    - AC: Daily plan reflects area priorities

11. **Create quarterly-review skill**
    - Review goals progress by area
    - Archive quarter.md to `goals/archive/`
    - Scaffold new quarter with suggested goals based on area backlog
    - AC: End-of-quarter flow produces new quarter.md linked to areas

---

## Size: Large (11 tasks across 2 phases)

## Risks

1. **Migration complexity** — Existing workspaces need migration path for new structure
2. **Area inference accuracy** — One-off meeting→area mapping could be wrong
3. **Skill interdependencies** — Skills depend on shared area-reading logic
4. **Breaking changes** — Current meeting processing flow changes significantly

## Recommendations

- Run `/pre-mortem` before building
- Consider `/review` for second opinion on area template design
- Phase 1 (Core Structure) can ship independently for manual testing
- Phase 2 (Skills) depends on Phase 1

---

## Out of Scope

- Separate task system (using commitments for now)
- Custom skills for external systems (Notion sync, etc.)
- Automated area creation from meeting patterns
- Area archival workflow
