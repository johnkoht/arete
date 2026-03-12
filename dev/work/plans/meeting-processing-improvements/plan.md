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
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---

# Meeting Processing Improvements

> **Plan Updated**: 2026-03-11 — Engineering audit revealed most extraction capabilities were built Mar 4-9. Plan rescoped to integration work only.

## Problem Statement (Revised)

The **extraction engine** (meeting-extraction.ts) is now feature-complete with:
- ✅ Owner attribution with slugs and direction
- ✅ Confidence scoring with calibration guidance
- ✅ Validation filters (garbage, length, dedup)
- ✅ Few-shot examples (positive and negative)
- ✅ Arrow notation parsing

**What's broken**: The Web UI doesn't use it. Two disconnected systems exist:
1. **CLI** (`arete meeting extract --stage`) → uses meeting-extraction.ts → works correctly
2. **Web UI** (`/api/meetings/:slug/process`) → uses agent.ts with basic prompting → missing all the above

**Result**: Users processing meetings via the web app get worse extractions than CLI users.

---

## User Value

When this plan is complete, users will see:

| Before | After |
|--------|-------|
| Action items have no owner attribution | "Send report" becomes "@sarah-chen → @john-doe: Send report" |
| No confidence scores | Each item shows confidence (0.0-1.0) for informed review |
| Garbage items slip through | Validation filters remove non-actionable items |
| Approved items don't sync to commitments | Approved items flow into `.arete/commitments.json` automatically |
| Section name mismatch breaks flow | Consistent naming enables people intelligence features |

**Bottom line**: Meeting processing goes from ~60% useful to ~85%+ useful. Action items become trackable commitments tied to real people.

---

## What's Already Built (Mar 4-9, 2026)

| Capability | Location | Status |
|------------|----------|--------|
| Owner/direction/counterparty extraction | meeting-extraction.ts | ✅ Done |
| Confidence scoring | meeting-extraction.ts | ✅ Done |
| Few-shot examples (positive + negative) | meeting-extraction.ts | ✅ Done |
| Validation filters (garbage, length, dedup) | meeting-extraction.ts | ✅ Done |
| Arrow notation parsing | meeting-extraction.ts | ✅ Done |
| Staged sections formatting | meeting-extraction.ts | ✅ Done |
| CLI integration | arete meeting extract | ✅ Done |
| Configurable thresholds (config schema) | workspace.ts | ✅ Done |

---

## What Remains (Integration Work)

### Step 1: Wire Backend to Use Extraction Service
**Goal**: Web UI processing uses the same extraction logic as CLI

**Tasks**:
- Import and call `extractMeetingIntelligence()` from agent.ts instead of inline prompting
- Pass configurable thresholds from arete.yaml config
- Ensure staged items include owner, direction, confidence fields

**Acceptance Criteria**:
- [ ] Web UI extraction produces same quality as CLI
- [ ] Confidence thresholds from config are respected
- [ ] Owner attribution appears in staged items

**Estimate**: 0.5-1 day

---

### Step 2: Fix Section Header Naming
**Goal**: Approved items flow correctly to commitments

**Tasks**:
- Audit section header naming across staged-items.ts, meeting-parser.ts
- Ensure approval creates `## Action Items` (not `## Approved Action Items`)
- Update meeting-parser.ts to accept both formats for backward compatibility

**Acceptance Criteria**:
- [ ] Approved action items appear in `.arete/commitments.json`
- [ ] Person memory refresh picks up new commitments
- [ ] Existing meetings with old format still work

**Estimate**: 0.5 day

---

### Step 3: Integration Testing & Validation
**Goal**: End-to-end flow is verified and documented

**Tasks**:
- Add integration test: process → stage → approve → commitments → person memory
- Verify confidence scoring is always present (not optional)
- Test with real meeting transcript to validate quality improvement

**Acceptance Criteria**:
- [ ] Integration test covers full flow
- [ ] Documented improvement in extraction quality (before/after comparison)
- [ ] No regressions in existing CLI workflow

**Estimate**: 1 day

---

## Out of Scope (Deferred)

These were in the original plan but are **not needed** now:

| Item | Why Deferred |
|------|--------------|
| Context injection (attendee profiles, user role) | Nice-to-have enhancement; extraction quality is already improved |
| Multi-step pipeline with validation | Overkill for current needs; single-pass with filters is sufficient |
| Krisp summary integration | Krisp already provides transcripts; summaries are bonus |
| Confidence calibration tuning | Current calibration is good enough; tune based on user feedback |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backend refactor breaks existing flow | Medium | High | Feature flag, integration tests first |
| Section header changes break existing meetings | Low | Medium | Parser accepts both old and new formats |
| Extraction quality doesn't improve | Low | High | CLI already validates the extraction logic works |

---

## Success Metrics

- **Commitments flow**: 100% of approved action items sync to commitments (currently 0%)
- **Owner attribution**: 100% of action items have owner/counterparty (currently 0%)
- **Quality**: Reduction in garbage/non-actionable items (measure before/after)
- **Parity**: Web UI extraction matches CLI extraction quality

---

## Effort Estimate

| Step | Effort |
|------|--------|
| Step 1: Wire backend | 0.5-1 day |
| Step 2: Section headers | 0.5 day |
| Step 3: Integration testing | 1 day |
| **Total** | **2-2.5 days** |

**Size**: Small (3 steps, 2-2.5 days)

---

## Next Steps

1. ~~Review and refine this plan~~ ✅ Done (EM audit complete)
2. Approve plan
3. Execute (direct or PRD)
