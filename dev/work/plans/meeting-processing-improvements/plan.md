---
title: Meeting Processing Improvements
slug: meeting-processing-improvements
status: draft
size: tiny
tags: [meetings, extraction, intelligence]
created: 2026-03-10T00:00:00.000Z
updated: 2026-03-11T00:00:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 1
---

# Meeting Processing Improvements

> **Plan Updated**: 2026-03-11 (v3) — Commit 38be75e completed Step 2 (section headers) and added post-approval automation. Only Step 1 remains.

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

## What Remains

### Step 1: Wire Backend to Use Extraction Service
**Goal**: Web UI processing uses the same extraction logic as CLI

**Tasks**:
- In `packages/apps/backend/src/services/agent.ts`, replace inline prompting with call to `extractMeetingIntelligence()` from `@arete/core`
- Pass configurable thresholds from arete.yaml config (already defined in schema)
- Ensure staged items include owner, direction, confidence fields
- Update any frontend components that consume these fields (if needed)

**Acceptance Criteria**:
- [ ] Web UI extraction produces same quality as CLI
- [ ] Confidence thresholds from config are respected
- [ ] Owner attribution appears in staged items
- [ ] Existing tests pass, new test added for parity

**Estimate**: 0.5-1 day

---

## Out of Scope (Deferred)

| Item | Why Deferred |
|------|--------------|
| Context injection (attendee profiles) | Enhancement; extraction quality already improved |
| Multi-step pipeline with validation | Overkill; single-pass with filters is sufficient |
| End-to-end integration test | Nice-to-have; 38be75e added parser test, approval flow works |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backend refactor breaks existing flow | Low | High | Existing tests + new parity test |
| Frontend doesn't handle new fields | Low | Medium | Check ReviewItems.tsx for field usage |

---

## Success Metrics

- **Parity**: Web UI extraction matches CLI extraction quality
- **Owner attribution**: 100% of Web UI action items have owner/counterparty
- **No regressions**: Existing approval→commitments flow continues working

---

## Effort Estimate

| Step | Effort |
|------|--------|
| Step 1: Wire backend | 0.5-1 day |
| **Total** | **0.5-1 day** |

**Size**: Tiny (1 step)

---

## Plan:

1. **Wire backend agent.ts to use extractMeetingIntelligence()**
   - Import `extractMeetingIntelligence` from `@arete/core`
   - Replace inline prompting in meeting processing with extraction service call
   - Pass configurable thresholds from workspace config
   - Ensure staged items include owner, direction, confidence
   - Add parity test comparing Web UI output to CLI output
   - Verify frontend (ReviewItems.tsx) handles new fields gracefully

---

## Next Steps

1. ~~Engineering audit~~ ✅ Done
2. ~~Review commit 38be75e~~ ✅ Done  
3. `/approve` this plan
4. Execute directly (tiny scope, no PRD needed)
