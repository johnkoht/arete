---
title: Update Area Template Structure
slug: update-area-template-structure
status: complete
size: large
tags: []
created: 2026-04-04T02:48:30.319Z
updated: 2026-04-04T03:12:52.721Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 12
---

# Update Area Template Structure

Migrate area sections from old (`Current State`, `Key Decisions`, `Active Goals`, `Active Work`, `Open Commitments`) to new (`Goal`, `Focus`, `Horizon`, `Projects`, `Stakeholders`, `Backlog`, `Notes`).

## Plan:

1. ✅ Update `AreaSections` type in `packages/core/src/models/entities.ts`
2. ✅ Update area-parser section extraction + suggestAreaForMeeting keyword matching in `packages/core/src/services/area-parser.ts`
3. ✅ Update workspace template in `packages/core/src/workspace-structure.ts`
4. ✅ Update meeting-extraction area context formatting in `packages/core/src/services/meeting-extraction.ts`
5. ✅ Update test: `packages/core/test/services/area-parser.test.ts`
6. ✅ Update test: `packages/core/test/services/area-memory.test.ts`
7. ✅ Update test: `packages/core/test/services/meeting-extraction.test.ts`
8. ✅ Update test: `packages/core/test/services/meeting-context.test.ts` + `workspace.test.ts` + `packages/cli/test/commands/create.test.ts`
9. ✅ Run typecheck and tests — 2635 tests pass, 0 failures
10. ✅ Update documentation: GUIDE.md, PATTERNS.md, meeting-prep SKILL.md, process-meetings SKILL.md, week-plan SKILL.md, UPDATES.md
11. ✅ Update LEARNINGS.md with section change note
12. ✅ Memory entry created + MEMORY.md index updated