## Review: Unify Meeting Extraction

**Type**: Plan (pre-execution)  
**Audience**: Builder (internal Areté refactor)

### Checklist Assessment

| Concern | Assessment |
|---------|------------|
| **Audience** | ✓ Clear — internal refactor, touches `packages/apps/backend/` |
| **Scope** | ✓ Appropriate — replaces one extraction path with existing core service |
| **Risks** | ⚠️ Pre-mortem identified 7 risks, but 2 gaps remain (see below) |
| **Dependencies** | ✓ Clear — Steps 1→2→3→4 is correct order |
| **Patterns** | ✓ Uses existing `extractMeetingIntelligence` — not novel |
| **Multi-IDE** | N/A — doesn't touch `runtime/` or `.agents/sources/` |
| **Backward compat** | ⚠️ Plan says "keep dedup/auto-approval logic" but doesn't verify format compatibility |
| **Catalog** | ✓ No new capabilities; existing code consolidation |
| **Completeness** | ⚠️ Two implicit assumptions need resolution (see Concerns) |

### Concerns

1. **Attendees context not addressed**
   
   Core extraction accepts `attendees?: string[]` for better owner attribution:
   ```typescript
   await extractMeetingIntelligence(transcript, callLLM, { attendees });
   ```
   
   The plan doesn't mention whether/how backend will pass attendees. Without attendees, owner attribution quality may be lower than CLI.
   
   **Suggestion**: Add to Step 3: "Determine attendees source (frontmatter? API param?) and pass to extractMeetingIntelligence"

2. **`nextSteps` field mismatch**
   
   Core extraction returns `nextSteps: string[]` as a separate field. The current backend schema only has `actionItems`, `decisions`, `learnings`. Either:
   - Backend ignores nextSteps (waste)
   - Backend needs schema change to include nextSteps
   - nextSteps get merged into actionItems (confusing)
   
   **Suggestion**: Add explicit decision to Step 3: "nextSteps: [ignore | add to schema | merge into actionItems]"

3. **Acceptance criteria could be more testable**
   
   Step 3 AC: "Owner/direction appear in extracted action items" — what format? The core uses `@owner → counterparty: description` but does this match what the Web UI expects?
   
   **Suggestion**: Make AC explicit: "Owner badge appears in format `@{ownerSlug}` in staged action item text"

### Strengths

- **Clear problem statement**: Before/after comparison table makes the gap obvious
- **Incremental steps**: Each step has a natural checkpoint (tests pass)
- **Good scoping**: Explicitly lists what's out of scope (threshold changes, new capabilities)
- **Pre-mortem done**: 7 risks identified with mitigations
- **Existing imports**: The fact that `extractMeetingIntelligence` is already imported (but unused) suggests this was always the intended direction

### Devil's Advocate

**If this fails, it will be because...** the test refactoring in Step 2 takes longer than 1 day. 30 tests × (understand old mock → create new mock → update assertions) = easily 30-60 minutes per test for the complex ones. If you hit 45 min avg, that's 22 hours (2.75 days), not 1 day. The "gradual migration" escape hatch is good, but the estimate may cause schedule pressure.

**The worst outcome would be...** shipping with subtly different extraction behavior that passes tests but produces worse real-world results. The pre-mortem flags confidence calibration, but the real risk is that "fewer garbage items" (a success metric) is measured qualitatively. If core extraction produces DIFFERENT garbage (not less), you won't know until users complain. Add a manual comparison step with real transcripts.

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Recommendations**:
1. Add attendees source to Step 3 tasks
2. Decide `nextSteps` handling explicitly  
3. Make Step 4 validation more rigorous: process 2-3 real transcripts and compare old vs new side-by-side

The plan is solid. Concerns are addressable without restructuring.
