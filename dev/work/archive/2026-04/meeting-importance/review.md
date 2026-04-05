# Review: Meeting Importance Plan

**Type**: Plan
**Audience**: Builder (internal tooling for Areté development)

---

## Concerns

### 1. Scope: Missing Context Injection for Light Extraction

**Concern**: Step 3 says "learnings filtered by goals/areas" but doesn't specify how goals/areas are passed to the light extraction prompt. Currently `extractMeetingIntelligence()` receives a `MeetingContextBundle` that includes goals, but the plan doesn't mention using this for light mode filtering.

**Suggestion**: Either:
- Use existing `context.relatedContext.goals` to inform the prompt
- Or simplify to keyword-based filtering ("skip tool configuration, meeting logistics")
- Clarify in Step 3 acceptance criteria: "Light extraction uses goals from context bundle" or "Light extraction uses hardcoded domain heuristics"

### 2. Dependencies: Step 2 Depends on Step 1 for Organizer Data

**Concern**: Step 2 creates `inferMeetingImportance()` but depends on organizer data from CalendarEvent (Step 1). The plan lists them as separate steps but doesn't make the dependency explicit.

**Suggestion**: Reorder or note dependency: "Step 2 must complete after Step 1 provides CalendarEvent.organizer"

### 3. Completeness: CLI Integration Not Detailed

**Concern**: The plan mentions `arete meeting extract` behavior changes (reprocessing = thorough mode) but doesn't detail CLI changes needed in `packages/cli/src/commands/meeting.ts`:
- How does `extract` know if a file was already processed? (Check frontmatter status)
- How is importance passed? (Read from frontmatter vs `--importance` flag)
- Where does thorough mode get triggered?

**Suggestion**: Add acceptance criteria to Step 5 or create Step 6: "CLI `meeting extract` reads importance from frontmatter; `--importance` flag overrides; reprocessing uses thorough mode"

### 4. Test Coverage: No Test Strategy Mentioned

**Concern**: The plan doesn't mention test requirements. Given the expertise profiles emphasize `testDeps` patterns and test coverage, this is a gap.

**Suggestion**: Each step should include test requirements:
- Step 1: Tests for `mapGoogleEvent()` with organizer data
- Step 2: Tests for `inferMeetingImportance()` with various attendee counts
- Step 3: Tests for light extraction prompt (mock LLM, verify output shape)
- Step 4: Tests for speaking ratio calculation with various transcript formats
- Step 5: Tests for auto-approve logic in `processMeetingExtraction()`

### 5. Patterns: Speaking Ratio Could Be Separate Service

**Concern**: Step 4 creates `calculateSpeakingRatio()` as a standalone function. Per core expertise profile, services are the standard pattern. A standalone function may be fine for pure computation, but consider where this lives architecturally.

**Suggestion**: Place in `packages/core/src/services/meeting-processing.ts` alongside existing processing logic. Export from barrel. No new service class needed (pure function is fine per core patterns).

---

## Strengths

- **Clear problem statement**: The "7-9 meetings, 2-4 important" framing is concrete and measurable
- **Well-scoped tiers**: The 4-tier system (skip/light/normal/important) with clear triggers is thoughtful
- **Backward compatible**: All new fields are optional, existing flows unchanged
- **Out of scope defined**: Explicit about what's NOT included (ical-buddy, UI changes, configurable thresholds)
- **Pre-mortem addresses real risks**: Integration ripple effects, API field availability, test patterns identified

---

## Devil's Advocate

**If this fails, it will be because...**
The light extraction prompt is too simplistic and users find they're losing important learnings. The threshold of "2 domain learnings" is arbitrary — what if a meeting has 3 critical insights? Users will immediately reprocess everything, defeating the purpose. The real problem might not be *extraction volume* but *approval fatigue* — maybe the answer is smarter auto-approval, not less extraction.

**The worst outcome would be...**
Users trust the "light" classification, skip reviewing auto-approved meetings, and miss a critical decision or commitment. A customer commitment gets buried in a "light" meeting because the user was an observer but the commitment was still made. This is a trust failure that's hard to recover from.

---

## Suggested Mitigations for Devil's Advocate Concerns

1. **Add a safety net for light meetings**: Include a "highlights only" summary that surfaces anything commitment-like, even if not fully extracted
2. **Don't auto-classify as light if transcript contains "I will" or "we agreed"**: Simple regex guard
3. **Show light meetings prominently in triage UI (future)**: Badge as "Light — auto-approved" so user knows to scan if needed

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Summary**: The plan is solid and well-thought-out. Address the dependency ordering (Concern 2), CLI integration details (Concern 3), and test strategy (Concern 4) during PRD creation. The devil's advocate concerns are valid but can be mitigated with simple safety checks during implementation.
