# PRD: Workspace Areas Refactor

**Version**: 1.0  
**Status**: Planned  
**Date**: 2026-03-25  
**Branch**: `feature/workspace-areas`  
**Plan**: `dev/work/plans/create-areas/plan.md`

---

## 1. Problem & Goals

### Problem

The current workspace lacks a hub for ongoing work domains. Meetings aren't linked to persistent areas, commitments aren't scoped, and context injection is generic. When prepping for a CoverWhale meeting, the system doesn't know it's part of Glance Communications or pull relevant history.

### Goals

1. **Introduce Areas** as persistent work domains that accumulate intelligence across quarters
2. **Simplify goals** with optional area links
3. **Enable context-aware meeting processing** by mapping meetings to areas via recurring patterns
4. **Scope commitments** to areas for better organization and de-duplication

### Design Decision: Dual-Location Storage

Areas use a **dual-location design**:
- `areas/{slug}.md` — The area definition file (metadata, recurring meetings, current state)
- `context/{slug}/` — Area-specific context files (resources, notes, subdirectory content)

This separates the area definition (structured, parseable) from accumulated context (free-form markdown). Both locations are scanned for context injection using the existing `'context'` category — no new category needed.

### Out of Scope

- Separate task system (using commitments, defer tasks)
- Custom skills for external systems (Notion sync, Jira push)
- Automated area creation from meeting patterns
- Area archival workflow
- Quarterly review skill (future enhancement)

---

## 2. Architecture Decisions

### Context Category Reuse

Area files and area context directories use the existing `'context'` category — not a new `'area'` category. This minimizes breakage to existing context service consumers. The context service will:
- Scan `context/**/*.md` (excluding `context/_history/`)
- Scan `areas/*.md`
- Both return category `'context'`

### Area Template via DEFAULT_FILES

The area template is added to `DEFAULT_FILES` in `packages/core/src/workspace-structure.ts`, not a new template directory. This follows the established pattern for workspace files.

### Matching Semantics

Area matching for meetings uses:
- **Case-insensitive substring matching** on meeting title against `recurring_meetings[].title`
- **Null** when no match (confidence 0)
- **Highest-confidence match** when multiple areas match (first match wins for equal confidence)

### Commitment Dedup Unchanged

The commitment deduplication hash remains unchanged — area is metadata only, not part of the identity. This prevents duplicate creation when area is added to existing commitments.

---

## 3. Pre-Mortem Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Context service regression | Critical | Write tests for existing context paths BEFORE modifying `getRelevantContext()`. TDD approach. |
| Area parser incomplete before Phase 2 | High | Task 3 (area parser) must fully complete including PATTERNS.md before any skill updates begin. Explicit dependency gate. |
| Commitment dedup hash changes | Medium | Area field is metadata only — not included in commitment identity hash. |
| PATTERNS.md missing get_area_context | Medium | Task 3 explicitly includes PATTERNS.md update as acceptance criterion. |

---

## 4. Tasks

### Phase 1: Core Structure (Tasks 1-6)

#### Task 1: Create area and project templates

**Description**: Add area template to DEFAULT_FILES and ensure `areas/` directory is created on install.

**Acceptance Criteria**:
- `areas/` added to `BASE_WORKSPACE_DIRS` in `packages/core/src/workspace-structure.ts`
- Area template added to `DEFAULT_FILES` with key `areas/_template.md` containing:
  - YAML frontmatter with `area`, `status`, `recurring_meetings[]` structure
  - Markdown sections: Active Goals, Current State, Active Work, Key Decisions, Open Commitments, Backlog, Notes
- `arete install` creates `areas/` directory in new workspaces
- `arete update` backfills `areas/` directory in existing workspaces
- Unit tests verify template content and directory creation

#### Task 2: Update context service for area-level resources

**Description**: Extend context service to scan `context/{slug}/` subdirectories and `areas/*.md` files, using the existing `'context'` category.

**Acceptance Criteria**:
- **TDD**: Write tests for existing context paths FIRST, verify they pass, then modify
- `getRelevantContext()` scans `context/**/*.md` (nested subdirectories)
- `getRelevantContext()` scans `areas/*.md` files
- Exclude `context/_history/` from scanning (pattern: skip any path containing `_history`)
- All discovered files use category `'context'` (NOT a new `'area'` category)
- Files in `context/glance-communications/notes.md` appear in `arete brief` output
- Existing context service tests continue to pass
- New tests verify subdirectory scanning and `_history` exclusion

#### Task 3: Create area parser service

**Description**: Create service to parse area YAML frontmatter and provide meeting-to-area lookup.

**Acceptance Criteria**:
- Create `packages/core/src/services/area-parser.ts`
- Parse YAML frontmatter: extract `recurring_meetings[]` with `title`, `attendees[]`, `frequency`
- Parse markdown sections: Current State, Key Decisions, Backlog (for context injection)
- `AreaMatch` type: `{ areaSlug: string; matchType: 'recurring' | 'inferred'; confidence: number }`
- `getAreaForMeeting(meetingTitle: string): AreaMatch | null`:
  - Case-insensitive substring match against `recurring_meetings[].title`
  - Return `null` when no match (not { confidence: 0 })
  - Return highest-confidence match when multiple match (first match wins for equal confidence)
- `getAreaContext(areaSlug: string): AreaContext` — returns parsed area content
- Add `get_area_context` pattern to `packages/runtime/skills/PATTERNS.md` with complete usage example
- Uses `StorageAdapter` for all file I/O (no direct fs calls)
- Unit tests: YAML parsing, meeting matching (case-insensitive), no-match returns null, multiple-match returns highest confidence
- Given "CoverWhale Sync", returns `{ areaSlug: 'glance-communications', matchType: 'recurring', confidence: 1.0 }`

**Critical**: This task MUST complete fully (including PATTERNS.md) before Phase 2 skill updates begin.

#### Task 4: Add `arete create area` command

**Description**: CLI command to scaffold new area with both area file and context directory.

**Acceptance Criteria**:
- Create `packages/cli/src/commands/create.ts` with `create` command group
- `arete create area <slug>` subcommand
- Creates `areas/{slug}.md` from template with placeholder values filled
- Creates `context/{slug}/` directory
- Runs `arete index` to add new files to search index
- Interactive prompts for: area name, initial description, first recurring meeting (optional)
- Error handling: slug already exists, invalid slug format
- Unit tests verify file creation, directory creation, and index trigger

#### Task 5: Simplify goals with area links

**Description**: Add optional `area:` field to goals for domain association.

**Acceptance Criteria**:
- Create `goals/quarter.md` template in `DEFAULT_FILES` with `area?: string` frontmatter field
- Update goal parser (`packages/core/src/services/goal-parser.ts`) to read `area?: string`
- `arete goals list` displays area column when goals have area values
- `arete goals list --area <slug>` filters to goals with matching area (can defer if complex)
- Goals without `area:` field continue to work unchanged
- Unit tests: parsing with/without area, list filtering

#### Task 6: Add area field to commitments

**Description**: Add optional `area:` field to commitments for domain scoping.

**Acceptance Criteria**:
- Add `area?: string` to `Commitment` type in `packages/core/src/types.ts`
- Update commitment extraction to accept optional area parameter
- Update `CommitmentsService.sync()` to store area field
- Area field is NOT included in commitment dedup hash (metadata only)
- `arete commitments list` displays area column when commitments have area values
- `arete commitments list --area <slug>` filters to matching area
- Existing commitments without area continue to work
- Unit tests: creation with area, dedup ignores area, list filtering

### Phase 2: Skill Updates (Tasks 7-11)

**Dependency**: All Phase 2 tasks depend on Task 3 (area parser) completing fully.

#### Task 7: Update meeting-prep skill for area context

**Description**: Inject area context into meeting preparation briefs.

**Acceptance Criteria**:
- Read `packages/runtime/skills/PATTERNS.md` and use `get_area_context` pattern
- Use `getAreaForMeeting()` to identify meeting's area from title
- When area found: inject area context (Current State, Key Decisions, Open Commitments) into prep
- When area not found for recurring meeting: prompt user to select/create area association
- Meeting prep for "CoverWhale Sync" auto-pulls Glance Communications context
- Skill file updated with area integration instructions

#### Task 8: Update process-meetings skill for area inference

**Description**: Map processed meetings to areas and route extracted intelligence.

**8a. Area mapping for meetings**:
- For recurring meetings: auto-map via area parser's `getAreaForMeeting()`
- For one-off meetings: infer from attendees + content, confirm if confidence < 0.7
- Processed meeting has area association in output

**8b. Decision extraction to area file**:
- Write extracted decisions to area's `## Key Decisions` section
- Use date-prefixed format: `- YYYY-MM-DD: Decision description`
- New decision appears in correct area file

**8c. Commitment area tagging**:
- Tag new commitments with area
- Scope de-duplication check to area first (check existing commitments in same area)
- Commitments from meeting are tagged with area

**Acceptance Criteria**:
- All three subtasks implemented and tested
- Skill file updated with area integration
- Unit tests: area mapping, decision writing, commitment tagging

#### Task 9: Update weekly planning skill

**Description**: Include area-organized goals and commitments in weekly planning.

**Acceptance Criteria**:
- Read goals with area links from goal parser
- Pull open commitments grouped by area using `commitments list --area`
- Include area context summaries in weekly priorities section
- Weekly plan shows format: "Glance Communications: 3 open commitments"
- Skill file updated with area integration

#### Task 10: Update daily planning skill

**Description**: Include area context for today's scheduled meetings.

**Acceptance Criteria**:
- Pull area context for today's meetings via recurring meeting mapping
- Use `getAreaForMeeting()` for each calendar event
- Include relevant area state (Current State section) in daily focus
- Daily plan notes area-specific context for today's meetings
- Skill file updated with area integration

#### Task 11: Update GUIDE.md and workspace documentation

**Description**: Document the areas system for users.

**Acceptance Criteria**:
- Document Area vs. Project taxonomy (Area = persistent domain; Project = time-bound with `area:` link)
- Document areas lifecycle: create → accumulate intelligence → archive
- Document context hierarchy: company (context/) → area (context/{slug}/ + areas/{slug}.md) → project
- Document recurring meeting mapping (YAML frontmatter in area file)
- Document dual-location design decision (`areas/` + `context/{slug}/`)
- Update AGENTS.md with areas system summary
- New users can understand area-based workflow from documentation

### Phase 3: Onboarding Integration (Task 12)

#### Task 12: Add area setup to onboarding tool

**Description**: Help new users set up initial areas during onboarding.

**Acceptance Criteria**:
- Add Day 1 area setup step: "What are your main work domains?"
- Present example areas (e.g., "Customer: Acme Corp", "Initiative: Platform Migration")
- Scaffold 2-3 areas from user input using `arete create area`
- Search index updated after area creation
- New users have areas set up during onboarding flow
- Onboarding tool tests verify area creation step

---

## 5. Dependencies Between Tasks

```
Task 1 (templates) → Task 2 (context service needs areas/ to scan)
Task 1 (templates) → Task 4 (CLI needs template to copy)
Task 2 (context service) → Task 3 (parser needs scanned files)
Task 3 (area parser) → ALL Phase 2 tasks (7, 8, 9, 10)
Task 3 (area parser) → Task 6 (commitments area tagging)
Task 4 (CLI) → Task 12 (onboarding uses create command)
Task 5 (goals) → Task 9 (weekly planning reads goal areas)
Task 6 (commitments) → Task 8c (commitment tagging)
Task 11 (docs) should happen after core implementation (Tasks 1-6)
```

**Critical Path**: 1 → 2 → 3 → 7-11 (parallel) → 12

**Execution Order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

---

## 6. Testing Strategy

- **TDD for Task 2**: Write context service tests BEFORE modifying to prevent regression
- All services use `StorageAdapter` — mock for unit tests
- Existing tests must pass after each task
- `npm run typecheck` and `npm test` after every task
- Area parser tests cover: YAML parsing edge cases, case-insensitive matching, null returns, multiple-match resolution

---

## 7. Success Criteria

- Areas can be created via `arete create area <slug>`
- Area files appear in `arete brief` context output
- Meeting prep auto-pulls area context for known recurring meetings
- Commitments can be filtered by area: `arete commitments list --area <slug>`
- Goals can link to areas via `area:` frontmatter
- Process-meetings extracts decisions to correct area file
- All existing tests continue to pass
- Documentation explains area-based workflow
