# Integration Skills — Build Learnings

**Date**: 2026-03-05
**PRD**: Split sync skill into focused integration skills
**Status**: ✅ Complete (5/5 tasks)

## What Was Done

Split the monolithic 386-line `sync` skill into four focused integration skills:
- `fathom` — Pull Fathom recordings with template documenting final format
- `krisp` — Pull Krisp recordings with template documenting final format
- `notion` — Pull Notion pages with 404/sharing gotcha
- `calendar` — View/pull calendar events with provider detection

Created `enrich_meeting_attendees` pattern in PATTERNS.md for cross-referencing calendar data.

## Metrics

- Tasks: 5/5 complete
- Engineering lead review: 4 critical, 6 important, 5 minor → all fixed
- Files created: 6 skill files, 2 templates
- Files deleted: sync/SKILL.md (386 lines)
- Commits: 6

## Learnings

1. **Template variable consistency matters** — Fathom used `{variable}` while Krisp used `{{variable}}`. Engineering lead caught it. Always check sister files for convention before writing new ones.

2. **Pattern consumer lists must be accurate** — When deleting sync and replacing with fathom/krisp, the developer incorrectly added fathom/krisp as consumers of `extract_decisions_learnings`. Pull-only skills don't do extraction — only process-meetings does.

3. **Enrichment timing must be unambiguous** — "Before saving" in a pull skill contradicts "apply during process-meetings step 2." Any instruction with timing implications needs ONE clear location, not two.

4. **Error handling tables should be on every integration skill** — Calendar and Notion initially lacked them. Every integration can fail; every skill needs a recovery table.

5. **Subagents can handle skill-file creation well** — The focused, bounded task of "create a skill file following this frontmatter template" produced good results consistently.
