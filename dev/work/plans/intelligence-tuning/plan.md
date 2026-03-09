---
title: "Intelligence Tuning (INT-1 through INT-5)"
slug: intelligence-tuning
status: idea
size: medium
tags: [ai, intelligence, backend]
created: "2026-03-07"
updated: 2026-03-09T03:59:36.826Z
completed: null
notes: "INT-0 (Service Normalization) completed separately. This covers the remaining quality improvements."
has_review: true
has_pre_mortem: true
---

# Intelligence Tuning Plan (INT-1 through INT-5)

## Overview

This plan addresses **AI extraction quality** issues:
- Meeting insights/learnings/decisions are overwhelming
- AI captures too much, lots of cleanup required
- User-documented notes should be auto-merged, not require approval

**Prerequisite**: INT-0 (Service Normalization) ✅ Complete

---

## INT-1: Extraction Quality Tuning

**Goal**: Reduce extraction volume while maintaining signal

**Approach**:
1. **Prompt Engineering**:
   - Add "be selective" / "only high-confidence" instructions
   - Provide examples of good vs bad extractions
   - Add context about user's role and what matters

2. **Filtering Heuristics**:
   - Minimum confidence threshold
   - Deduplicate near-identical items
   - Filter trivial/obvious items ("we should schedule a meeting")

3. **Category Limits**:
   - Max N items per category (e.g., 5 action items, 3 decisions, 3 learnings)
   - Prioritize by relevance/importance

**Acceptance Criteria**:
- [ ] Average items per meeting reduced by 40-60%
- [ ] Signal-to-noise ratio improved (user approval rate > 80%)
- [ ] No loss of genuinely important items

**Files to Modify**:
- `packages/core/src/services/intelligence/` — extraction prompts
- Backend processing routes

---

## INT-2: User Notes Auto-Merge

**Goal**: If user documented something, don't require re-approval

**Approach**:
1. **Detection**: Identify user-written content vs transcript-derived
   - Check if item text appears in user's meeting notes
   - Check if item matches user's pre-meeting agenda

2. **Auto-Approve**: Items that match user notes → auto-approved
   - Mark with "from your notes" badge
   - Still editable, but no approval click needed

3. **Deduplication**: Don't extract what user already wrote
   - If user wrote "Action: Send proposal", don't also extract it

**Acceptance Criteria**:
- [ ] User-documented items auto-approved
- [ ] Visual indicator "from your notes"
- [ ] No duplicate items between user notes and extractions

**Files to Modify**:
- Processing logic to compare extractions with user notes
- Review items status defaulting logic

---

## INT-3: Confidence-Based Pre-Selection

**Goal**: Agent pre-selects likely-good items, user reviews edge cases

**Approach**:
1. **Confidence Scoring**:
   - LLM returns confidence (0-1) with each extraction
   - Based on: specificity, actionability, importance signals

2. **Threshold Selection**:
   - High confidence (>0.8) → pre-approved
   - Medium confidence (0.5-0.8) → pending (needs review)
   - Low confidence (<0.5) → pre-skipped or filtered

3. **User Override**: User can always change any status

**Acceptance Criteria**:
- [ ] Confidence score returned with each extraction
- [ ] Items pre-selected based on confidence
- [ ] User review focuses on medium-confidence items
- [ ] Settings: adjustable confidence threshold

**Files to Modify**:
- Extraction prompts to include confidence
- Processing logic for threshold-based selection
- (Optional) Settings UI for threshold

---

## INT-4: Commitment Intelligence

**Goal**: Score commitments by priority/importance

**Approach**:
1. **Priority Scoring**:
   - Deadline proximity
   - Person importance (health score, category)
   - Commitment specificity
   - Duration open (staleness)

2. **Display Enhancements**:
   - Priority badge (High/Medium/Low)
   - Sort by priority
   - Filter by priority

3. **User Override**: User can manually adjust priority

**Acceptance Criteria**:
- [ ] Commitments have computed priority score
- [ ] Priority displayed in UI (badge or indicator)
- [ ] Sortable/filterable by priority
- [ ] User can override priority

**Files to Modify**:
- Commitment extraction/storage
- `packages/apps/backend/src/routes/commitments.ts`
- `packages/apps/web/src/pages/CommitmentsPage.tsx`

---

## INT-5: Commitment Reconciliation

**Goal**: Check recent meetings/notes to auto-resolve completed commitments

**Approach**:
1. **Reconcile Trigger**: Button or scheduled job
2. **Scan Sources**:
   - Recent meeting transcripts/summaries
   - Person notes
   - Check for completion signals

3. **Suggestions**: Present likely-completed items for user confirmation
   - "Based on your Mar 5 meeting, this may be done"
   - One-click confirm or dismiss

**Acceptance Criteria**:
- [ ] "Reconcile" button on Commitments page
- [ ] Scans recent meetings for completion signals
- [ ] Presents suggestions with evidence
- [ ] User confirms or dismisses

**Files to Modify**:
- New reconciliation service
- Backend endpoint
- Frontend UI for suggestions

---

## Build Order

```
INT-1 (Quality Tuning) ──► INT-2 (Notes Merge) ──► INT-3 (Confidence)
                                                          │
                                                          ▼
                                              INT-4 (Commitment Priority)
                                                          │
                                                          ▼
                                              INT-5 (Reconciliation)
```

**Recommended sequence**: INT-1 → INT-2 → INT-3 → INT-4 → INT-5

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Avg items per meeting | ~15-20 | ~8-10 |
| User approval rate | ~50-60% | >80% |
| Review time per meeting | ~5 min | <2 min |
| Commitment staleness | Many overdue | Auto-reconciled |

---

## Technical Notes

### Prompt Engineering Guidelines

1. **Be specific about quality bar**:
   ```
   Extract ONLY items that are:
   - Specific and actionable (not vague)
   - Important to the attendees (not trivial)
   - Novel information (not restating obvious facts)
   ```

2. **Provide negative examples**:
   ```
   DO NOT extract:
   - "We should meet again" (trivial)
   - "The project is going well" (vague)
   - "John will check on that" (too vague - check what?)
   ```

3. **Request confidence**:
   ```
   For each item, rate your confidence (0-1) that this is:
   - A genuine decision/action/learning (not filler)
   - Important enough to track
   - Accurately captured
   ```
