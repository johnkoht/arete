# Review: Router Triggers Plan

**Type**: Plan (pre-execution)
**Audience**: Builder (internal tooling for Areté development)

## Concerns

1. **Completeness — Step 1 AC is contradictory**
   - The AC says "Tests exist and fail with current implementation" but Step 2's AC says "Golden tests from step 1 pass." This implies Step 1 tests should fail initially, then pass after Step 2. That's correct TDD — but the plan doesn't clearly sequence this: does Step 1 commit failing tests, or is it just a verification checkpoint?
   - **Suggestion**: Clarify that Step 1 verifies tests fail (no commit yet), Steps 2-3 implement fixes, Step 4 verifies all tests pass (then commit).

2. **Scope — Trigger list may be insufficient**
   - The proposed triggers ("save this document", "add this to context", etc.) are reasonable but weren't validated against the actual failing queries. Looking at the queries:
     - Query 1: "I have input data to add about Reserve, the product team, etc. Where should I add it?" — Does "add input data" match "input data to add"? Need to verify tokenization.
     - Query 2: "save a lengthy AI vision and roadmap document, summarize it, and include it in context" — Does "save and summarize" or "include in context" match this?
   - **Suggestion**: Before finalizing trigger list, run the tokenizer on both queries and verify proposed triggers will actually match. Consider adding: "add to workspace", "import content", "where to save".

3. **Risks — Pre-mortem identified 7 risks, plan only addresses 2**
   - The pre-mortem surfaced 7 testing-related risks. The plan mentions "mitigated by golden tests" and "mitigated by running full test suite" but doesn't incorporate the specific mitigations from the pre-mortem (e.g., realistic skill fixtures, negative assertions, pattern-based tests).
   - **Suggestion**: Update Step 1 to explicitly incorporate pre-mortem mitigations: use realistic fixtures from SKILL.md files, include negative assertions, test patterns not just specific queries.

4. **Dependencies — Step 3 is vague on implementation**
   - "Require minimum 2-token overlap" is clear, but "Consider weighting longer phrase matches higher" is ambiguous. What's the decision? Is this in scope or not?
   - **Suggestion**: Either commit to phrase weighting (add it as a sub-step with AC) or explicitly defer it to future work.

5. **Patterns — Test location unclear**
   - Step 1 says "packages/cli/test/golden/route.test.ts (or packages/core/test/services/intelligence.test.ts)" — which one? These test different things (CLI output vs. service logic). The pre-mortem recommends testing at the service level with realistic fixtures.
   - **Suggestion**: Pick one location. Recommend `packages/core/test/services/intelligence.test.ts` since it tests `routeToSkill` directly, which is where the bug is.

6. **Completeness — No step for documenting the scoring algorithm change**
   - Changing the scoring threshold from 1 to 2 tokens is a behavioral change that future developers should understand. No step documents this decision.
   - **Suggestion**: Add a sub-step to Step 3: "Add a comment in `scoreMatch()` explaining the 2-token minimum and why."

## Strengths

- Clear problem definition with concrete examples of failing queries
- Good analysis of options with explicit recommendation (A + D)
- TDD approach (tests first, then implementation)
- Pre-mortem was thorough and testing-focused
- Scope is appropriately small (4 steps, 2-3 files)

## Devil's Advocate

**If this fails, it will be because...** the trigger expansion is a band-aid that doesn't address the fundamental issue: keyword-based routing will always have edge cases. We'll fix these two queries, then next week face two more. The plan acknowledges this ("whack-a-mole") but proceeds anyway. The real question is: is this the right investment, or should we spike on LLM-based routing for low-confidence matches instead?

**The worst outcome would be...** the scoring algorithm change (2-token minimum) breaks routing for skills that legitimately rely on single-word description matches (e.g., "discovery" → `discovery`, "roadmap" → `construct-roadmap`). We don't have test coverage for all 26 skills, so regressions could ship undetected. The pre-mortem flagged this (Risk 3) but the plan doesn't add explicit regression tests for these cases.

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Recommendation**: The plan is solid but would benefit from:
1. Clarifying test location (pick one)
2. Incorporating pre-mortem mitigations into Step 1 (realistic fixtures, negative assertions)
3. Adding explicit regression tests for single-word routing ("discovery" → `discovery`) in Step 3
4. Deciding on phrase weighting (in scope or deferred)

These are all quick clarifications, not blockers. The core approach (triggers + scoring fix + TDD) is sound.

---

## Persona Council Review

### Feature Under Review

The skill router automatically matches user queries to skills. When routing fails, users see the wrong skill selected (e.g., asked about "input data to add" → routed to "prepare-meeting-agenda").

**User-facing surface**: Minimal. Users don't see "routing" — they see skill selection. But bad routing = wrong skill = friction.

### The Harvester

**Would they use this feature?**
Yes, but unknowingly. The Harvester pastes content and expects Areté to "just work." They don't know routing exists — they just know whether Areté understood their intent or not.

**Friction threshold for this step?**
Zero tolerance for being routed wrong. If they paste content and Areté starts building a meeting agenda instead of saving their document, they'll think "this is broken" and close the tab. They won't debug the routing — they'll just leave.

**What's the right default?**
The routing must be **invisible and correct**. No fallback to "which skill did you mean?" — that's an interruption. If uncertain, better to pick nothing than ask.

**Concrete policy**: Routing failures to the Harvester are critical bugs, not edge cases. The fix (expanded triggers) is the minimum bar. Consider: if routing confidence is low, should it just... not suggest a skill, rather than suggesting the wrong one?

*Status: hypothesis — not validated*

### The Architect

**Would they use this feature?**
Yes, and they'll notice when it's wrong. The Architect understands the skill system and will notice if `prepare-meeting-agenda` is suggested when they said "input data." They'll correct it manually, but they'll also file a mental note: "routing is unreliable."

**Friction threshold for this step?**
High tolerance for setup, but low tolerance for incorrect behavior. A wrong routing decision is worse to them than asking "did you mean X?" — because it signals the system doesn't understand the workflow.

**What's the right default?**
Correct routing is baseline. If routing is uncertain, the Architect would prefer a disambiguation prompt over a wrong guess. They'd also appreciate a way to teach the router (e.g., "remember: queries like this should go to rapid-context-dump").

**Concrete policy**: For the Architect, consider a future enhancement: user-defined trigger aliases. But for this plan, the focus is correct — fix the false positives first.

*Status: hypothesis — not validated*

### The Preparer

**Would they use this feature?**
Yes, but only indirectly. The Preparer cares about artifact quality. If routing sends them to the wrong skill, the artifact is wrong — that's the friction.

**Friction threshold for this step?**
Medium. They'll tolerate being routed wrong once if they can easily correct it. But repeated wrong routing erodes trust: "Areté doesn't understand what I'm asking for."

**What's the right default?**
Correct routing is table stakes for the Preparer. They're evaluating: "Is Areté better than just asking Claude?" Wrong routing = "Claude would have understood this."

**Concrete policy**: The fix addresses Preparer needs directly. No additional requirements.

*Status: hypothesis — not validated*

### Council Decision

| Persona | Uses Feature? | Friction Threshold | Policy |
|---------|---------------|-------------------|--------|
| Harvester | Yes (unknowingly) | Zero | Wrong routing = critical bug. Never interrupt to ask. |
| Architect | Yes | Low for incorrect behavior | Correct routing is baseline. Future: user aliases. |
| Preparer | Yes (indirectly) | Medium | Correct routing is table stakes. |

**Decision**: **Required fix, no additional UX changes needed.**

All three personas benefit from correct routing. None require prompts, dialogs, or configuration for this fix. The plan as written is appropriate.

**One insight from the Harvester lens**: The pre-mortem didn't consider what happens when routing confidence is low. Currently, the router returns the best match even if the score is weak (threshold is 4 points). The Harvester would prefer "no match" over "wrong match."

### Recommendation from Council Review

**Add to Plan Step 3**: Consider raising the minimum score threshold (currently 4 points) or returning `null` when the best match is weak. This prevents low-confidence false positives.

Test case to add:
- "What is the weather" → `null` (not weak match to some random skill)
- "input data to add about Reserve" → `rapid-context-dump` OR `null` (not `prepare-meeting-agenda`)

This aligns with Harvester's zero-tolerance for wrong suggestions.
