---
title: Plan Mode Post-Merge Cleanup
slug: plan-mode-post-merge-cleanup
status: abandoned
size: small
tags: [improvement]
created: 2026-02-20T04:33:00Z
updated: 2026-02-20T04:33:00Z
completed: 2026-02-22T21:17:43Z
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Plan Mode Post-Merge Cleanup

Minor issues identified during `plan-cleanup` merge review. None are bugs — all are hardening/debt items.

## Items

### 1. Stale frontmatter in migrated plan files
Many migrated plans still carry legacy fields on disk (`backlog_ref`, `previous_status`, `blocked_reason`) and legacy status values (`in-progress`, `approved`, `completed`, `on-hold`). The parser handles this at runtime, but the files are stale. Consider a one-time migration script to rewrite all plan files with clean frontmatter.

### 2. `promoteBacklogItem` / `shelveToBacklog` / `archiveItem` basePath convention is fragile
When `basePath` is provided, `plansDir` is computed as `join(basePath, "../plans")` — assumes backlog dir is always a sibling of plans. Works for the default `dev/work/` layout and tests, but would break for arbitrary basePath values. Consider making plansDir/backlogDir/archiveDir independently configurable rather than deriving siblings.

### 3. `moveItem` uses cpSync + rmSync (not atomic)
`shelveToBacklog`, `archiveItem`, and `promoteBacklogItem` copy then delete. If process crashes between copy and delete, duplicates remain. No data loss risk. Could use `renameSync` for same-filesystem moves, falling back to copy+delete for cross-filesystem.
