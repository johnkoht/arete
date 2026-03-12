# Engineering Manager B: Feasibility Assessment
## Meeting Processing Improvements Plan

**Date**: 2026-03-11  
**Assessed by**: Engineering Manager B (Scout)  
**Focus**: CORE side (meeting-extraction.ts, entity.ts, meeting-parser.ts, agent.ts, staged-items.ts)  
**Recent commits reviewed**: 7 commits (past 3 days, 7126585 → 868421f)

---

## Executive Summary

**Status**: ⚠️ **Plan is partially outdated due to recent commits, but Phase 1 scope is still valid and necessary**

The plan correctly identifies TWO disconnected extraction systems and a commitments flow gap. Recent commits (324a47c, a67aa05, etc.) have added quality tuning and confidence scoring to agent.ts, but **the core gaps remain untouched**:

1. **No owner attribution** — agent.ts extracts `{ text, confidence }` only; lacks owner slug and direction
2. **Format mismatch** — approved items are `- [ ] Text` not `- [ ] Text (@owner → @counterparty)`
3. **Commitments flow broken** — items reach meeting parser but lack owner context for reliable direction inference
4. **Under-utilized infrastructure** — meeting-extraction.ts has everything needed but isn't used by backend UI

**Recommendation**: Phase 1 is **necessary and achievable** (5-10 days effort). Phases 2-4 should be deferred pending Phase 1 outcome. Phase 1 scope needs slight refinement to account for what's already been built.

---

## Current State Assessment

### What HAS Been Built ✅

#### meeting-extraction.ts (Core Service)
- ✅ Owner attribution with `ownerSlug` field
- ✅ Direction classification (`i_owe_them` | `they_owe_me`)
- ✅ Counterparty tracking (`counterpartySlug`)
- ✅ Confidence scoring (0-1)
- ✅ Validation filters:
  - Garbage prefixes (me:, them:, yeah, i'm not sure, etc.)
  - Length limits (max 150 chars)
  - Multiple sentences rejection
  - Trivial patterns (schedule, follow-up, touch base)
- ✅ Deduplication (Jaccard > 0.8)
- ✅ Category limits (7 action items, 5 decisions, 5 learnings)
- ✅ Few-shot examples in LLM prompt (lines 249-289)
- ✅ Staged section formatting (`ai_001`, `de_001`, `le_001` with arrow notation)
- ✅ **Comprehensive test coverage** (950+ tests)

#### agent.ts (Backend UI Processing) — Recent Additions
- ✅ Confidence scoring (0-1)
- ✅ Configurable thresholds:
  - `DEFAULT_CONFIDENCE_THRESHOLD_APPROVED = 0.8`
  - `DEFAULT_CONFIDENCE_THRESHOLD_INCLUDE = 0.5`
  - `DEFAULT_DEDUP_JACCARD_THRESHOLD = 0.7`
- ✅ User notes deduplication (Jaccard matching)
- ✅ Item source tracking (ai vs dedup) — commit a67aa05
- ✅ Item status determination (approved vs pending)
- ✅ Quality tuning filters — commit 324a47c
- ✅ Reprocess with `clearApproved` option — commit 868421f

#### meeting-parser.ts (Commitments Flow)
- ✅ **Handles both section names**: `## Action Items` AND `## Approved Action Items` (regex on line 54)
- ✅ Arrow notation parsing (→, ->, -->, =>)
- ✅ Direction inference from text (fallback heuristics)
- ✅ Checkbox parsing (`- [ ]` and `- [x]`)
- ✅ Date extraction from frontmatter
- ✅ Hash computation for dedup

#### entity.ts (Person Memory / Commitments Sync)
- ✅ Integrated with CommitmentsService
- ✅ Action item lifecycle (stale detection, dedup, cap)
- ✅ Bidirectional sync (resolution of checked/deleted items)
- ✅ Meeting attendance tracking
- ✅ Action item extraction from meetings (via `parseActionItemsFromMeeting`)

#### CLI (packages/cli/src/commands/meeting.ts)
- ✅ Uses `extractMeetingIntelligence` from core (sophisticated path)
- ✅ Uses `formatStagedSections` and `updateMeetingContent`
- ✅ Integrated extraction pipeline

### What is MISSING ❌

#### 1. Owner Attribution in Backend Extraction
**Gap**: agent.ts extracts `{ text, confidence }` only.  
**Missing**: `owner`, `ownerSlug`, `direction`, `counterpartySlug`

```typescript
// agent.ts ExtractionItem (CURRENT)
type ExtractionItem = { text: string; confidence: number };

// meeting-extraction.ts ActionItem (MORE COMPLETE)
type ActionItem = {
  owner: string;
  ownerSlug: string;
  description: string;
  direction: 'i_owe_them' | 'they_owe_me';
  counterpartySlug?: string;
  due?: string;
  confidence?: number;
};
```

**Impact**: Commitments flow relies on owner context. Without it, `meeting-parser.ts` falls back to unreliable text heuristics.

#### 2. Arrow Notation in Approved Items
**Gap**: staged-items.ts (line 280) writes:
```markdown
## Approved Action Items
- [ ] Send API docs by Friday
```

**Expected by parser**: 
```markdown
## Action Items
- [ ] Send API docs by Friday (@john-smith → @sarah-chen)
```

**Impact**: Items reach parser but lack owner/direction. Parser infers direction using heuristics (checking if owner name appears in text), which is unreliable (~60-70% accuracy).

#### 3. No Backend Use of meeting-extraction.ts
**Gap**: agent.ts reimplements extraction with its own schema instead of using meeting-extraction.ts.

**Result**: 
- Duplication of logic (dedup, garbage patterns, etc.)
- Different prompts (agent.ts is generic; meeting-extraction.ts has few-shot examples)
- Different validation strategies
- Different output schema

**Why it matters**: meeting-extraction.ts is more sophisticated (owner, direction, counterparty) and better tested. Backend could benefit from its features.

---

## Plan Accuracy Review

### ✅ Correct Diagnoses

| Claim | Status | Evidence |
|-------|--------|----------|
| "No context injection" | ✅ Confirmed | agent.ts extraction prompt has no attendee context |
| "Two disconnected systems" | ✅ Confirmed | UI uses agent.ts, CLI uses meeting-extraction.ts |
| "Generic prompting" | ✅ Confirmed | agent.ts prompt is generic; meeting-extraction.ts has few-shot examples |
| "Action items lack structure" | ✅ Confirmed | agent.ts doesn't extract owner/direction |
| "Section naming issue" | ⚠️ Outdated | meeting-parser.ts NOW handles both section names, but format gap remains |
| "Better extraction exists" | ✅ Confirmed | meeting-extraction.ts is more complete |

### ⚠️ Partially Outdated Claims

| Claim | Then | Now | Commit |
|-------|------|-----|--------|
| "No confidence scoring" | ✅ True | ❌ False | a67aa05 |
| "No validation filters" | ✅ True | ❌ False | 324a47c |
| "No configurable thresholds" | ✅ True | ❌ False | 7126585 |
| "Backend doesn't extract" | ✅ True | ⚠️ Partial | agent.ts extracts but with incomplete schema |

### ✅ Still Required

| Phase | Status | Blocker? |
|-------|--------|----------|
| Phase 1: Unify + format fix | ⚠️ **Partially done** | **YES** — owner attribution missing |
| Phase 2: Context injection | ❌ Not started | Can defer |
| Phase 3: Few-shot + Krisp | ⚠️ **Partial** | Few-shot exists, not integrated |
| Phase 4: Multi-step pipeline | ❌ Not started | Can defer |

---

## Risk Analysis

### Phase 1 Risks

#### Risk 1: Schema Integration (HIGH)
**Problem**: Merging two different extraction schemas is non-trivial.

**Conflict**: 
```typescript
// agent.ts schema: ExtractionItem = { text, confidence }
// Needs to become: ActionItem = { owner, ownerSlug, description, direction, ... }

// But agent also tracks separately:
// - ItemSource (ai vs dedup) 
// - ItemStatus (approved vs pending)
// - Confidence levels for filtering
```

**Mitigation**:
- Write integration tests FIRST (test-driven approach)
- Design transition schema before coding
- Run both paths in parallel with feature flag during transition

#### Risk 2: Backward Compatibility (MEDIUM)
**Problem**: Existing meetings have `## Approved Action Items` without arrow notation.

**Impact**: Old meetings parse with unreliable direction inference.

**Mitigation**:
- meeting-parser.ts already handles both formats
- Fallback heuristics still work (just less reliable)
- No breaking change — just reduced accuracy for legacy items

#### Risk 3: Test Coverage Explosion (MEDIUM)
**Problem**: Owner extraction requires comprehensive test cases.

**Mitigation**:
- Copy test vectors from meeting-extraction.ts (950+ existing tests)
- Integration tests: extract → approve → parse → commitments.json
- Reuse meeting-extraction.ts test utilities

#### Risk 4: Prompt Tuning (LOW)
**Problem**: Adding owner/direction to agent.ts prompt may degrade confidence calibration.

**Mitigation**:
- meeting-extraction.ts prompt already proven (many tests)
- Run A/B test on a sample of meetings
- Roll back if calibration degrades

### Phase 2+ Risks

**Risk: Scope Creep (HIGH)**

Each phase adds 1-2 weeks:
- Phase 1: 1-2 weeks
- Phase 2: +1-2 weeks  
- Phase 3: +1 week
- Phase 4: +2 weeks
- **Total: 5-7 weeks combined**

**Recommendation**: Ship Phase 1 first, then evaluate Phase 2-4 separately.

---

## Revised Phase 1 Scope

### Phase 1 Tasks (Updated)

**1.1: Add Owner Extraction to agent.ts** 🆕
- Extend `MeetingExtractionSchema` to include `owner`, `owner_slug`, `direction`, `counterparty_slug`
- Update `buildExtractionPrompt()` to request owner attribution
- Leverage meeting-extraction.ts prompt guidance as template
- **Effort**: 2-3 days
- **Risk**: Confidence calibration needs testing

**1.2: Update Staged Sections Formatting** 🟡
- Update `formatStagedSections()` to include arrow notation when owner available
- Format: `- ai_001: [@owner-slug → @counterparty-slug] Text (Due)`
- Fall back to simple format if owner missing
- **Effort**: 0.5 days
- **Risk**: Low

**1.3: Update Approval Flow** 🟡
- Update `staged-items.ts` (line 280) to write arrow notation in approved items
- Format: `- [ ] Text (@owner-slug → @counterparty-slug)`
- meeting-parser.ts already handles this
- **Effort**: 0.5 days
- **Risk**: Low

**1.4: Verify Commitments Flow** ✅
- meeting-parser.ts already works with both section names
- Just need end-to-end test: extract → approve → parse → commitments.json
- **Effort**: 2-3 days (test creation + debugging)
- **Risk**: Medium (integration issues possible)

**1.5: Code Sharing** 🟡
- Extract common validation functions to shared module
- Both agent.ts and meeting-extraction.ts can reuse:
  - `isGarbageItem()`
  - `isTrivialItem()`
  - `deduplicateItems()`
- **Effort**: 1-2 days
- **Risk**: Low

**1.6: Comprehensive Tests** 🆕
- Owner extraction accuracy tests
- Direction inference tests
- Arrow notation output tests
- Integration tests (full pipeline)
- Backward compatibility tests (old meetings still parse)
- **Effort**: 2-3 days
- **Risk**: High (need thorough coverage)

### Revised Phase 1 Effort
- **Total**: 5-10 days (1-2 weeks)
- **Complexity**: **MEDIUM** (not trivial, but well-scoped)
- **Blocking**: YES (foundational for later phases)

### Phases 2-4
- **Recommendation**: Evaluate after Phase 1 ships
- **Justification**: Each is optional enhancement; Phase 1 unblocks commitments flow

---

## Quick Wins (In Parallel)

### Quick Win 1: Validation Code Sharing 🟢
**Effort**: 1 day  
**Impact**: Quality + maintainability

```typescript
// packages/core/src/services/extraction-validation.ts
export { isGarbageItem, isTrivialItem, deduplicateItems };
```

Both agent.ts and meeting-extraction.ts import it.

### Quick Win 2: Document Learnings 🟢
**Effort**: 0.5 day  
**Impact**: Prevent future confusion

Add to LEARNINGS.md:
```markdown
## Section Naming & Direction Inference

**Status**: Both `## Action Items` and `## Approved Action Items` work.

**Gotcha**: Without arrow notation, direction inference is ~60-70% accurate.
See meeting-parser.ts lines 145-203 for heuristics.

**Fix**: Phase 1 adds arrow notation to approved items.
```

### Quick Win 3: Integration Test Template 🟢
**Effort**: 1 day  
**Impact**: Enables Phase 1 testing

Create test file showing expected flow:
```typescript
// packages/core/test/integration/meeting-e2e.test.ts
describe('Extract → Approve → Parse → Commitments Flow', () => {
  it('produces correct owner/direction in commitments', async () => {
    // 1. Extract from meeting
    // 2. User approves items
    // 3. Parser reads approved items
    // 4. CommitmentsService syncs
    // 5. Verify commitments.json
  });
});
```

---

## Recommendations

### 1. Refine & Approve Phase 1 (Before Starting)
- Use revised tasks above
- Add explicit acceptance criteria
- Estimate: 5-10 days effort
- Get sign-off on scope

### 2. Run Pre-Mortem on Phase 1
Identify risks before starting:
- Schema integration complexity
- Prompt quality degradation
- Backward compatibility impact
- Test coverage adequacy

### 3. Execute Phase 1 (Test-Driven)
1. Write integration test first (red-green-refactor)
2. Add owner extraction to agent.ts
3. Update formatting and approval flow
4. Verify tests pass
5. Run on sample of meetings

### 4. Defer Phase 2-4
After Phase 1 ships:
- Measure quality improvement
- Assess whether Phase 2 (context injection) is still needed
- Plan Phase 2-4 as separate efforts (if at all)

### 5. Quick Wins in Parallel
- Code sharing (validation module)
- Documentation (LEARNINGS)
- Test templates (integration tests)

---

## Success Criteria

### Phase 1 Success
- [ ] Owner slugs extracted with ≥95% accuracy
- [ ] Arrow notation appears in approved items
- [ ] Integration test: extract → approve → parse → commitments.json ✅
- [ ] Zero regressions in existing meeting processing
- [ ] Confidence scores calibrated (no degradation)

### Team Confidence
- [ ] Plan is clear and scoped
- [ ] Risks identified and mitigated
- [ ] Test strategy defined
- [ ] Backward compat understood

---

## Summary

| Aspect | Status | Impact | Effort | Next |
|--------|--------|--------|--------|------|
| **Phase 1** | ⚠️ Partial | **CRITICAL** | 5-10 days | Refine & approve |
| Owner attribution | ❌ Missing | High | 2-3 days | Implement |
| Arrow notation | ❌ Missing | High | 1-2 days | Implement |
| Format alignment | 🟡 Partial | High | 1-2 days | Implement |
| Test coverage | ❌ Missing | High | 2-3 days | Add |
| **Phases 2-4** | ❌ Not started | Medium | 4-6 weeks | Defer |

**Verdict**: ✅ **Phase 1 is feasible, necessary, and well-scoped. Execute it before Phase 2-4.**

