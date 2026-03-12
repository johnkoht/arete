---
title: Meeting Processing Improvements
slug: meeting-processing-improvements
status: draft
size: small
tags: [meetings, extraction, intelligence]
created: 2026-03-10T00:00:00.000Z
updated: 2026-03-11T00:00:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: false
has_prd: false
steps: 2
---

# Meeting Processing Improvements

> **Plan Updated**: 2026-03-11 (v4) — Addressed review concerns: type mismatch, frontend display, mapping task.

## Problem Statement (Final)

The **extraction engine** (meeting-extraction.ts) is feature-complete. The **approval→commitments flow** is now working (38be75e). 

**One gap remains**: The Web UI doesn't use the extraction engine.

| Path | Uses | Quality |
|------|------|---------|
| **CLI** (`arete meeting extract --stage`) | meeting-extraction.ts | ✅ High (owner attribution, confidence, validation) |
| **Web UI** (`/api/meetings/:slug/process`) | agent.ts inline prompting | ⚠️ Basic (no owner, no confidence, no filters) |

**Result**: Users processing meetings via the web app get worse extractions than CLI users.

---

## User Value

When this plan is complete:

| Before | After |
|--------|-------|
| Web extractions have no owner attribution | "@sarah-chen → @john-doe: Send report" |
| No confidence scores in Web UI | Each item shows confidence (0.0-1.0) |
| Garbage items slip through | Validation filters remove non-actionable items |
| Web UI quality << CLI quality | **Parity** — same extraction everywhere |
| Owner/direction not visible in review UI | **Owner badge shown** on action items |

---

## What's Complete

### Built Mar 4-9, 2026
| Capability | Status |
|------------|--------|
| Owner/direction/counterparty extraction | ✅ Done |
| Confidence scoring | ✅ Done |
| Few-shot examples (positive + negative) | ✅ Done |
| Validation filters (garbage, length, dedup) | ✅ Done |
| Arrow notation parsing | ✅ Done |
| CLI integration | ✅ Done |
| Configurable thresholds (config schema) | ✅ Done |

### Completed by 38be75e (Mar 11, 2026)
| Capability | Status |
|------------|--------|
| Parser accepts `## Approved Action Items` header | ✅ Done |
| Post-approval QMD index refresh | ✅ Done |
| Post-approval person memory refresh for attendees | ✅ Done |
| Commitments sync via CommitmentsService | ✅ Done |
| Parser test for new header format | ✅ Done |

---

## Technical Context: Type Mismatch (from review)

The extraction service returns `ActionItem`, but the backend/frontend use `StagedItem`:

| Field | `ActionItem` (extraction) | `StagedItem` (current) | Action |
|-------|---------------------------|------------------------|--------|
| text | `description` | `text` | Map |
| owner | `owner`, `ownerSlug` | ❌ Missing | **Add** |
| direction | `direction` | ❌ Missing | **Add** |
| counterparty | `counterpartySlug` | ❌ Missing | **Add** |
| confidence | `confidence` | `confidence` | ✅ Exists |

**Solution**: Extend `StagedItem` type, add mapping function, update frontend.

---

## What Remains

### Step 1: Extend Types + Create Mapping
**Goal**: `StagedItem` can carry owner/direction data from extraction

**Tasks**:
1. In `packages/core/src/models/integrations.ts`, extend `StagedItem`:
   ```typescript
   type StagedItem = {
     id: string;
     text: string;
     type: 'ai' | 'de' | 'le';
     source?: 'ai' | 'dedup';
     confidence?: number;
     // NEW fields:
     ownerSlug?: string;
     direction?: 'i_owe_them' | 'they_owe_me';
     counterpartySlug?: string;
   };
   ```
2. In `packages/apps/web/src/api/types.ts`, mirror the type extension
3. Create `ActionItem → StagedItem` mapping utility (in agent.ts or shared module)

**Acceptance Criteria**:
- [ ] `StagedItem` type includes owner/direction/counterparty fields
- [ ] Web types match core types
- [ ] Mapping function converts `ActionItem[]` → `StagedItem[]` without data loss

**Estimate**: 0.5 day

---

### Step 2: Wire Backend + Update Frontend
**Goal**: Web UI processing uses extraction service and displays owner info

**Tasks**:
1. In `packages/apps/backend/src/services/agent.ts`:
   - Import `extractMeetingIntelligence` from `@arete/core`
   - Replace inline prompting with extraction service call
   - Use mapping function to convert results to `StagedItem[]`
   - Pass configurable thresholds from workspace config
2. In `packages/apps/web/src/components/ReviewItems.tsx`:
   - Display owner badge on action items (e.g., `@sarah-chen →` prefix)
   - Show confidence as visual indicator (optional: color/icon based on score)
3. Add parity test comparing Web UI output to CLI output

**Acceptance Criteria**:
- [ ] Web UI extraction produces same quality as CLI
- [ ] Owner/direction appears in staged items API response
- [ ] ReviewItems.tsx displays owner attribution for action items
- [ ] Confidence thresholds from config are respected
- [ ] Existing tests pass, new parity test added

**Estimate**: 1 day

---

## Out of Scope (Deferred)

| Item | Why Deferred |
|------|--------------|
| Context injection (attendee profiles) | Enhancement; extraction quality already improved |
| Multi-step pipeline with validation | Overkill; single-pass with filters is sufficient |
| Confidence visual indicator in UI | Nice-to-have; can add later based on feedback |
| Full integration test (process→approve→commit) | 38be75e added parser test; approval flow validated |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type extension breaks existing code | Low | Medium | Fields are optional; backward compatible |
| Frontend changes require design review | Low | Low | Simple badge/prefix; no major UX change |
| Mapping function loses data | Low | High | Test mapping explicitly; compare field counts |

---

## Success Metrics

- **Parity**: Web UI extraction matches CLI extraction quality
- **Owner attribution**: 100% of Web UI action items have owner visible
- **Type safety**: No `any` types; all fields typed
- **No regressions**: Existing approval→commitments flow continues working

---

## Effort Estimate

| Step | Effort |
|------|--------|
| Step 1: Extend types + mapping | 0.5 day |
| Step 2: Wire backend + frontend | 1 day |
| **Total** | **1.5 days** |

**Size**: Small (2 steps)

---

## Plan:

1. **Extend StagedItem type + create mapping**
   - Add `ownerSlug?`, `direction?`, `counterpartySlug?` to `StagedItem` in core
   - Mirror type in web/src/api/types.ts
   - Create `ActionItem → StagedItem` mapping function
   - Test: verify mapping preserves all fields

2. **Wire backend to extraction service + update frontend**
   - Import and call `extractMeetingIntelligence()` in agent.ts
   - Use mapping to convert results
   - Pass configurable thresholds from config
   - Update ReviewItems.tsx to display owner badge on action items
   - Add parity test (Web UI vs CLI output quality)

---

## Review Feedback Addressed

| Concern | Resolution |
|---------|------------|
| Type mismatch | Step 1 explicitly extends types |
| Frontend not addressed | Step 2 includes ReviewItems.tsx update |
| Missing mapping task | Step 1 includes mapping function |

---

## Next Steps

1. ~~Engineering audit~~ ✅ Done
2. ~~Review (38be75e)~~ ✅ Done
3. ~~Address review feedback~~ ✅ Done
4. `/approve` this plan
5. Execute directly (small scope, no PRD needed)
