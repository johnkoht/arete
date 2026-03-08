---
title: Meeting Enhancements
slug: meeting-enhancements
status: draft
size: medium
tags: [meetings, web-app, reimagine]
created: 2026-03-07T16:56:06.629Z
updated: 2026-03-07T16:59:03.405Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---

Shaped and saved. Here's what's in the plan:

---

## Meeting Enhancements — Summary

**Problem**: Fragmented meeting workflow (agenda, notes, transcript, processing are separate). Plus users want external tool flexibility.

**Design Decision**: Separate meeting *entity* (always in Areté) from meeting *content* (pluggable storage via `content_source` field).

### Plan (6 steps)

| Step | What | Dependency |
|------|------|------------|
| **1** | Unify frontmatter schema (`state`, `content_source`, `exports`) | None |
| **2** | Merge agenda into meeting document (one lifecycle) | None |
| **3** | Meeting detail page in web app | V2-5 (TipTap editor) |
| **4** | Krisp sync flow with auto-match + picker | Step 3 |
| **5** | Enhanced processing using user notes | Steps 2, 3 |
| **6** | Export to Linear (v1) | Step 3 |

**Out of Scope (v1)**: Bidirectional Notion sync, reading from external systems, collaborative editing

**Sized as**: Medium (6 steps) — recommend `/pre-mortem` before building

---

**Saved files:**
- `dev/work/plans/meeting-enhancements/plan.md` — full plan with ACs
- `dev/work/plans/meeting-enhancements/notes.md` — design discussion notes

**Open questions captured in notes:**
1. Calendar pull → should it set `state: scheduled`?
2. Krisp matching UX (auto vs picker)
3. Is V2-5 sufficient for meeting editor or do we need more?

Ready for your testing feedback. When you want to proceed, we can run `/pre-mortem` or `/review` given the scope.