# Phase 2: Skill Refactoring (Product OS)

**Date**: 2026-02-07
**Branch**: `feature/product-os-architecture`

## What changed

Implemented Phase 2 of the Product OS vision: slimmed default skills, extracted shared intelligence patterns, and added extended frontmatter to all 18 skills.

## Changes

### 1. Shared patterns document

- **`.cursor/skills/PATTERNS.md`** — New shipped document defining two intelligence patterns:
  - **get_meeting_context**: Resolve attendees, read person files, search meetings, read projects, extract action items, optional QMD. Used by meeting-prep, daily-plan.
  - **extract_decisions_learnings**: Scan for candidates, present for inline review (approve/edit/skip), write approved items to `.arete/memory/items/`. Used by process-meetings, sync, finalize-project.

### 2. Slimmed skills (intelligence-in-disguise)

- **meeting-prep**: Replaced long inlined "Get Meeting Context" section with reference to PATTERNS.md. Workflow now: identify meeting → run get_meeting_context → build brief → close.
- **daily-plan**: Replaced inlined pattern steps with reference to PATTERNS.md. Workflow unchanged; context for each meeting comes from the pattern.
- **process-meetings**: Step 4 (extract decisions/learnings) now references extract_decisions_learnings in PATTERNS.md; kept people/attendee resolution steps (entity resolution).
- **sync**: Replaced long "Synthesis Workflow (Inline Review)" section with single reference to extract_decisions_learnings pattern.
- **synthesize**: Added one-line description that this skill is the default implementation of the synthesis intelligence service; added frontmatter. Workflow and templates retained.
- **finalize-project**: Decisions/learnings logging now references PATTERNS.md for format; fixed activity log path to `.arete/activity/activity-log.md`; context checklist updated to `goals/strategy.md`.

### 3. Extended frontmatter (all 18 skills)

Added where applicable: `primitives`, `work_type`, `category`, `intelligence`, `creates_project`, `project_template`, `requires_briefing`.

- **Essential (category: essential)**: meeting-prep, daily-plan, process-meetings, save-meeting, finalize-project, workspace-tour, sync, goals-alignment, quarter-plan, week-plan, week-review, periodic-review, synthesize.
- **Default (category: default)**: create-prd, discovery, competitive-analysis, construct-roadmap, generate-mockup.

Path fixes: workspace-tour and periodic-review now reference `goals/strategy.md`; finalize-project context checklist and activity log path updated.

## Rationale

Per vision: skills are methods; value is the intelligence underneath. Duplicated logic (get_meeting_context, inline review) is now in one place. Skills reference patterns instead of inlining them. Frontmatter enables future primitive-aware briefing and work-type routing without changing skill content again.

## Files touched

- `.cursor/skills/PATTERNS.md` (new)
- `.cursor/skills/meeting-prep/SKILL.md`
- `.cursor/skills/daily-plan/SKILL.md`
- `.cursor/skills/process-meetings/SKILL.md`
- `.cursor/skills/sync/SKILL.md`
- `.cursor/skills/synthesize/SKILL.md`
- `.cursor/skills/finalize-project/SKILL.md`
- `.cursor/skills/workspace-tour/SKILL.md`
- `.cursor/skills/periodic-review/SKILL.md`
- All other skills: frontmatter only (save-meeting, goals-alignment, quarter-plan, week-plan, week-review, create-prd, discovery, competitive-analysis, construct-roadmap, generate-mockup)
