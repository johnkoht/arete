---
title: Calendar Event Filters
slug: calendar-event-filters
status: idea
size: unknown
tags: []
created: 2026-03-20T04:25:54.637Z
updated: 2026-03-20T04:26:32.293Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

Saved the notes to the plan directory.

Good problem framing — this is noise reduction for daily workflows. A few questions before we shape the plan:

1. **Pattern matching scope**: You mentioned `*Sync*` as "maybe overkill." I'd lean toward starting with prefix/suffix only (`Block: *`, `*Standup`) and adding contains-match later if needed. Simpler to implement, easier to reason about. Sound right?

2. **Hybrid approach validation**: Your recommendation (Option A for `ignore`, Option B for `no_prep`) makes sense — `ignore` is truly invisible, `no_prep` is metadata. But this means skills need to check the flag. Have you thought about whether there are skills where showing `no_prep` events differently (e.g., grayed out, no prep link) would add value, or is it purely about suppressing prompts?

3. **Default behavior**: Should `no_prep` suppress the prompt silently, or should it still show the meeting but skip the "Create agenda?" question? (Subtle difference in whether the user sees the meeting mentioned at all.)

4. **Error handling**: What happens if a filter pattern matches nothing? Silent (user typo goes unnoticed) or warn-once per session?

Once we align on these, I can shape a concrete plan with steps and acceptance criteria.