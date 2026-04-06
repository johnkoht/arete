# Pre-Mortem: Product Simplification Phase 4

## Scenario: "It's 2 weeks later and Phase 4 failed."

### Risk 1: Auto-approve silently breaks trust

**Scenario**: User enables auto-approve, doesn't realize what got approved. A wrong
decision gets committed to memory. User loses trust in the system.

**Probability**: Medium. Risk is real — auto-approval is inherently risky.

**Mitigation**:
- Make it explicitly opt-in (user must click "Auto-approve these")
- Show a prominent summary of WHAT was auto-approved
- Keep items visible in the summary for auditing
- Use language like "Auto-approved (review below)" not "Done automatically"
- The banner is informational, not a default action

### Risk 2: Confidence scores missing on real data

**Scenario**: Items extracted before intelligence-improvements shipped don't have
confidence scores. All buttons work but items without confidence scores fall through.

**Probability**: High — existing staged items from before intelligence-improvements
will have `confidence: undefined`.

**Mitigation**:
- Treat `confidence === undefined` as "no confidence" — exclude from threshold-based actions
- Show count of items that WILL be approved ("Approve High Confidence (5 items)" — only those qualifying)
- Items without confidence remain for manual review — this is the correct UX
- Document this in tests with explicit undefined confidence test cases

### Risk 3: Meeting grouping breaks existing layout

**Scenario**: Grouping decisions/learnings by meeting changes the visual layout enough
that users find it confusing, or it breaks existing test assertions.

**Probability**: Medium. The existing ReviewPage renders items as flat lists. Grouping
adds a new layer of nesting.

**Mitigation**:
- Keep the section structure (Decisions, Learnings) — only add subgroups within
- Use subtle visual grouping (thin border, gray background) to avoid over-engineering
- Update existing tests to account for new structure
- The grouped layout is strictly additive — no items are removed or reordered

### Risk 4: TypeScript errors in backend build

**Scenario**: `npm run typecheck` passes (doesn't check backend) but `npm run build:apps:backend`
fails due to type errors in the new backend endpoint.

**Probability**: Medium. Backend has a separate TypeScript config and isn't covered by
root `npm run typecheck`.

**Mitigation**:
- Always run `npm run build:apps:backend` after backend changes (per LEARNINGS.md)
- Check types against @arete/core exports before committing

### Risk 5: Review summary conflicts with TanStack Query cache invalidation

**Scenario**: After completing review, the summary renders but then immediately
disappears because TanStack Query refetches `/api/review/pending` and returns
empty data, showing the empty state instead.

**Probability**: Medium. The useCompleteReview hook invalidates the review cache
on success, triggering a refetch.

**Mitigation**:
- Use local state to track "review completed" and "completion result"
- After `onSuccess`, set local state with summary data, don't rely on query cache
- Show summary as a local state render, not a cache-driven render
- Test this flow in ReviewPage tests

### Risk 6: Performance — iterating all meetings for auto-approve

**Scenario**: User has 20+ processed meetings. The `/api/review/auto-approve` endpoint
has to load every full meeting to check confidence scores, causing slow response.

**Probability**: Low-medium. The review pending endpoint already does this iteration.

**Mitigation**:
- The endpoint reuses the same pattern as `/api/review/pending` (already proven)
- For Phase 4, this is acceptable — optimize if it becomes a problem
- Use the same service factory pattern (createServices once, reuse)

## Mitigations Checklist

- [ ] Treat `confidence === undefined` as unqualified (never auto-approve)
- [ ] Make auto-approve explicitly user-triggered (banner with action button)
- [ ] Show summary of what was auto-approved (auditable)
- [ ] Run `npm run build:apps:backend` before every commit touching backend
- [ ] Use local state for summary, not cache-driven renders
- [ ] Test with items that have no confidence score
