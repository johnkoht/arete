---
title: "Product Simplification — Phase 4: Review UX"
slug: product-simplification-phase4
status: in-progress
size: medium
tags: [web, backend, review, ux, meetings]
created: "2026-04-04"
updated: "2026-04-04"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 4
---

# Product Simplification — Phase 4: Review UX

## Problem

Meeting review takes 25–45 minutes. The intelligence-improvements work (Phase 0) added
reconciliation and confidence scoring. Phase 4 leverages those signals to drastically reduce
the time spent in the review UI by adding:

1. Global bulk-approval with a confidence threshold
2. Per-meeting batch approval
3. Smart auto-approve on the backend (opt-in, auditable)
4. Review summary so nothing is silently approved

## Context

- Confidence scores already exist on `StagedMemoryItem` (`.confidence?: number`)
- The `ReviewPage` at `packages/apps/web/src/pages/ReviewPage.tsx` is the primary UI
- Backend review routes are in `packages/apps/backend/src/routes/review.ts`
- The `/api/review/pending` response already includes `confidence` on decisions/learnings
- The `/api/review/complete` endpoint already exists for submitting approval results
- Tasks (action items) live in the inbox; decisions and learnings have confidence scores

## Tasks

### Task 1: Global "Approve All (≥X Confidence)" button

Add a button in the ReviewPage header area that approves all pending decisions and learnings
where `confidence >= threshold`. Default threshold = 0.8. The threshold is shown on the
button label ("Approve All (≥80%)") and can be adjusted via a simple number input beside
the button.

**Acceptance criteria:**
- Button appears when there are pending items with confidence scores
- Clicking it approves all pending memory items (decisions + learnings) with confidence >= threshold
- Items below threshold or with no confidence score are NOT approved
- The threshold can be changed by the user (default 0.8)
- Tasks (inbox items) are NOT affected — they don't have confidence scores
- Button count shows how many items will be approved ("Approve High Confidence (5 items)")

### Task 2: Meeting-level batch approval

Group decisions and learnings by meeting source (`meetingSlug`). For each meeting group,
show "Approve Meeting" and "Skip Meeting" buttons that approve/skip ALL items from that
meeting at once.

**Acceptance criteria:**
- Decisions section groups items by meeting, shows meeting title as a subgroup header
- Learnings section groups items by meeting, shows meeting title as a subgroup header
- Each meeting group has "Approve All" and "Skip All" buttons
- Clicking "Approve Meeting" approves all pending items in that meeting's group
- Clicking "Skip Meeting" skips all pending items in that meeting's group
- Already-decided items are not changed by meeting-level bulk actions

### Task 3: Smart auto-approve on backend

Add a `GET /api/review/auto-approve-preview` endpoint that returns which meetings would
be auto-approved (all items >= 0.8 confidence). The ReviewPage calls this on load and
shows an informational banner: "X items from Y meetings can be auto-approved (all ≥80%
confidence). [Auto-approve these]"

When the user clicks "Auto-approve these", it calls the existing `/api/review/complete`
with those items pre-approved, OR adds a `GET /api/review/pending?autoApprove=true`
mode. The key design principle: this is NOT silent — the user explicitly triggers it.

**Revised approach (simpler, cleaner):**
Add a `POST /api/review/auto-approve` endpoint that:
1. Finds all processed meetings where ALL pending items have confidence >= 0.8
2. Marks those items as approved in the review session
3. Returns a summary: `{ autoApproved: { meetings: string[], itemCount: number } }`

The frontend shows this as a banner before showing other review items.

**Acceptance criteria:**
- `POST /api/review/auto-approve` endpoint exists and works correctly
- Only approves meetings where ALL items (decisions + learnings) have confidence >= 0.8
- Returns summary of what was auto-approved
- Frontend shows banner with auto-approval result when there are qualifying meetings
- User can still see/audit what was auto-approved (listed in summary)

### Task 4: Review summary

After completing review, show a summary card:
- "X items approved, Y items skipped, Z items skipped (not decided)"
- If any items were auto-approved in this session, list them

This summary appears after the "Done Reviewing" button is clicked, replacing the main
content area while the mutation runs, then showing the result.

**Acceptance criteria:**
- After `Done Reviewing` completes, show a summary in place of the review form
- Summary shows counts: approved, skipped, pending (undecided)
- Summary links back to meetings/dashboard
- If CompleteReviewResponse includes auto-approve info, show it

## Technical Notes

- `StagedMemoryItem.confidence` is `number | undefined` — handle items with no confidence
- Tasks (WorkspaceTask) don't have confidence, exclude from confidence-based actions
- Use existing `StagedMemoryItem.meetingSlug` and `meetingTitle` for grouping
- All backend changes stay in `routes/review.ts`
- All frontend changes stay in `pages/ReviewPage.tsx` (no new component files needed,
  minor helper components inline acceptable)
- Quality gates: `npm run typecheck`, `npm test`, `npm run build:apps:backend`
