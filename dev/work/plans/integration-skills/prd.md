# PRD: Split Sync Skill into Focused Integration Skills

## Problem Statement

The `sync` skill is a 400+ line monolith trying to document 5 different integrations (Fathom, Krisp, Notion, Calendar, Slack). This creates routing confusion (triggers overlap), maintenance burden (changing one integration risks breaking others), and context bloat (asking about Fathom loads Slack/Notion/Calendar docs).

## Success Criteria

1. Each integration has its own focused skill (~60-100 lines)
2. Meeting integrations (Fathom, Krisp) have their own templates
3. Templates produce output compatible with `process-meetings` skill
4. Name enrichment from calendar is documented as a pattern
5. `sync` skill is deleted
6. CLI (`arete pull [integration]`) unchanged

## Architecture

Two-stage architecture:
- **Stage 1**: `arete pull fathom` → Core adapter writes meeting file (hardcoded template)
- **Stage 2**: `process-meetings` → Transforms file to Areté format (adds Summary, Action Items)

Templates in skills document the *final format* after both stages. They do NOT replace core adapter templates.

## Tasks

### Task 1: Create `enrich_meeting_attendees` pattern in PATTERNS.md

Add a new pattern for cross-referencing calendar to fill in missing attendee names.

**Pattern covers:**
- When to enrich (incomplete names, email-only, first-name-only)
- How to match (time overlap ±15 min, email domain, title similarity)
- CLI command: `arete pull calendar --json`
- How to merge info (calendar names + integration emails)
- Integration point: process-meetings step 2 (entity resolution)

**AC:**
- Pattern documented in `packages/runtime/skills/PATTERNS.md`
- Includes example workflow steps for skill authors
- Specifies integration point: "Apply during process-meetings step 2 (entity resolution)"

### Task 2: Create Fathom skill with template

**Skill**: `packages/runtime/skills/fathom/SKILL.md`

Create focused skill with proper frontmatter (name, description, work_type: operations, category: essential, intelligence: [synthesis], triggers). Document two-stage flow. Reference `enrich_meeting_attendees` pattern.

**Template**: `packages/runtime/skills/fathom/templates/meeting.md` — Documents final format after process-meetings (empty Summary/Action Items for Areté generation, Fathom Notes with raw summary, collapsible transcript).

**AC:**
- Skill file created with proper frontmatter
- Skill documents two-stage flow: "Run process-meetings after pull"
- Template created matching process-meetings expectations
- Template has empty Summary/Action Items sections for Areté generation
- Template preserves Fathom's raw summary in "Fathom Notes"
- Skill references `enrich_meeting_attendees` pattern
- Entry added to PATTERNS.md template resolution table

### Task 3: Create Krisp skill with template

**Skill**: `packages/runtime/skills/krisp/SKILL.md`

Same structure as Fathom but with Krisp-specific sections (detailed_summary, key_points, action_items). Proper frontmatter, two-stage flow, pattern reference.

**Template**: `packages/runtime/skills/krisp/templates/meeting.md`

**AC:**
- Skill file created with proper frontmatter
- Skill documents two-stage flow: "Run process-meetings after pull"
- Template includes Krisp-specific sections (key_points, action_items)
- Template has empty Summary/Action Items for Areté generation
- Skill references `enrich_meeting_attendees` pattern
- Entry added to PATTERNS.md template resolution table

### Task 4: Create Notion and Calendar skills

**Notion skill**: `packages/runtime/skills/notion/SKILL.md` — Check integration status, ask for page URL(s), run pull, destination handling, error handling (404 = not shared gotcha). No template.

**Calendar skill**: `packages/runtime/skills/calendar/SKILL.md` — Check provider, run pull/display events. No template. Triggers scoped to calendar operations (not overlapping with meeting-prep).

**AC:**
- Notion skill created with proper frontmatter
- Notion skill documents 404/sharing gotcha
- Calendar skill created with proper frontmatter
- Calendar skill triggers don't overlap with meeting-prep
- Both skills are focused (<80 lines each)

### Task 5: Delete sync skill and update references

- Delete `packages/runtime/skills/sync/` directory
- Update `packages/runtime/skills/README.md` with new skills
- Update any cross-references found via grep
- Verify routing with test queries

**AC:**
- `sync/` directory deleted
- No broken references to sync skill (grep verified)
- README.md updated with new skills
- Old sync triggers route to appropriate new skills

## Out of Scope

- Slack skill (integration doesn't exist yet)
- CLI changes (`arete pull [integration]` already works)
- Core adapter changes (implementations stay as-is)
- process-meetings modifications
