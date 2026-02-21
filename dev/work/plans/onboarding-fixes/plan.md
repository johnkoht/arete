---
title: Onboarding Fixes
slug: onboarding-fixes
status: idea
size: unknown
tags: []
created: 2026-02-21T21:13:54.383Z
updated: 2026-02-21T21:15:22.991Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---

Good, I have everything I need. Here's my read on it:

**Small — 3 focused steps, all self-contained.** Items 1 and 2 are markdown-only edits (no code). Item 3 is a targeted 15-20 line change to `workspace.ts` + 2 tests. No pre-mortem needed. My recommendation: **knock it out now**. Worktree is more overhead than this warrants.

---

Plan:

1. **Create `resources/reading-list.md`** in `packages/runtime/tools/onboarding/resources/` — pull the 13 source URLs + one-liner descriptions from `dev/work/archive/enhance-onboarding-tool/research.md`. Add a single reference line to TOOL.md's Phase 1 activation step pointing agents to the file.

2. **Wire templates into TOOL.md activation workflow** — update step 4 of the Activation Workflow to tell the agent to copy `templates/30-60-90-plan.md` → `plan/30-60-90.md`, `templates/weekly-plan.md` → `plan/weekly/week-01.md` etc., and `templates/stakeholder-map.md` → `working/stakeholders.md`. The 1-1 note template goes to `inputs/1-1s/` as a blank starter. Remove the redundant inline template content from the TOOL.md (the "Working File Templates" section is ~150 lines of duplication — those are now the actual files).

3. **Fix `workspace.ts` update backfill to be file-level within tools** — currently skips a tool dir entirely if it exists. Change it to walk source files within each tool and backfill any that are missing at the destination (same pattern as the templates backfill). Add 2 tests: one confirming missing files inside an existing tool dir get backfilled, one confirming existing files aren't overwritten.

---

Scope explicitly **out**: no changes to the onboarding SKILL.md (separate thing — that's for Areté setup, not the job onboarding tool), no changes to seed-context tool, no changes to routing.

Want to proceed?