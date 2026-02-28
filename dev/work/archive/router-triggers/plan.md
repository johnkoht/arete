---
title: Router Triggers
slug: router-triggers
status: complete
size: unknown
tags: []
created: 2026-02-24T04:57:53.761Z
updated: 2026-02-24T05:10:19.609Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 4
---

Now I understand the Persona Council. Let me evaluate this feature against the three personas. 

**Important context**: The skill router is used when a user asks a question, and Areté automatically routes to the appropriate skill. This is an **ambient/invisible** feature — users don't directly interact with routing, they just ask questions and get routed. However, when routing fails (current bug), users see the wrong skill selected, which affects their experience.

---

## Persona Council Review: Router Trigger Improvements

### Feature Under Review

The skill router automatically matches user queries to skills. When routing fails, users see the wrong skill selected (e.g., asked about "input data to add" → routed to "prepare-meeting-agenda").

**User-facing surface**: Minimal. Users don't see "routing" — they see skill selection. But bad routing = wrong skill = friction.

---

### The Harvester

**Would they use this feature?**
Yes, but unknowingly. The Harvester pastes content and expects Areté to "just work." They don't know routing exists — they just know whether Areté understood their intent or not.

**Friction threshold for this step?**
Zero tolerance for being routed wrong. If they paste content and Areté starts building a meeting agenda instead of saving their document, they'll think "this is broken" and close the tab. They won't debug the routing — they'll just leave.

**What's the right default?**
The routing must be **invisible and correct**. No fallback to "which skill did you mean?" — that's an interruption. If uncertain, better to pick nothing than ask.

**Concrete policy**: Routing failures to the Harvester are critical bugs, not edge cases. The fix (expanded triggers) is the minimum bar. Consider: if routing confidence is low, should it just... not suggest a skill, rather than suggesting the wrong one?

*Status: hypothesis — not validated*

---

### The Architect

**Would they use this feature?**
Yes, and they'll notice when it's wrong. The Architect understands the skill system and will notice if `prepare-meeting-agenda` is suggested when they said "input data." They'll correct it manually, but they'll also file a mental note: "routing is unreliable."

**Friction threshold for this step?**
High tolerance for setup, but low tolerance for incorrect behavior. A wrong routing decision is worse to them than asking "did you mean X?" — because it signals the system doesn't understand the workflow.

**What's the right default?**
Correct routing is baseline. If routing is uncertain, the Architect would prefer a disambiguation prompt over a wrong guess. They'd also appreciate a way to teach the router (e.g., "remember: queries like this should go to rapid-context-dump").

**Concrete policy**: For the Architect, consider a future enhancement: user-defined trigger aliases. But for this plan, the focus is correct — fix the false positives first.

*Status: hypothesis — not validated*

---

### The Preparer

**Would they use this feature?**
Yes, but only indirectly. The Preparer cares about artifact quality. If routing sends them to the wrong skill, the artifact is wrong — that's the friction.

**Friction threshold for this step?**
Medium. They'll tolerate being routed wrong once if they can easily correct it. But repeated wrong routing erodes trust: "Areté doesn't understand what I'm asking for."

**What's the right default?**
Correct routing is table stakes for the Preparer. They're evaluating: "Is Areté better than just asking Claude?" Wrong routing = "Claude would have understood this."

**Concrete policy**: The fix addresses Preparer needs directly. No additional requirements.

*Status: hypothesis — not validated*

---

### Council Decision

| Persona | Uses Feature? | Friction Threshold | Policy |
|---------|---------------|-------------------|--------|
| Harvester | Yes (unknowingly) | Zero | Wrong routing = critical bug. Never interrupt to ask. |
| Architect | Yes | Low for incorrect behavior | Correct routing is baseline. Future: user aliases. |
| Preparer | Yes (indirectly) | Medium | Correct routing is table stakes. |

**Decision**: **Required fix, no additional UX changes needed.**

All three personas benefit from correct routing. None require prompts, dialogs, or configuration for this fix. The plan as written is appropriate.

**One insight from the Harvester lens**: The pre-mortem didn't consider what happens when routing confidence is low. Currently, the router returns the best match even if the score is weak (threshold is 4 points). The Harvester would prefer "no match" over "wrong match."

---

### Recommendation from Council Review

**Add to Plan Step 3**: Consider raising the minimum score threshold (currently 4 points) or returning `null` when the best match is weak. This prevents low-confidence false positives. 

Test case to add:
- "What is the weather" → `null` (not weak match to some random skill)
- "input data to add about Reserve" → `rapid-context-dump` OR `null` (not `prepare-meeting-agenda`)

This aligns with Harvester's zero-tolerance for wrong suggestions.

---

## Updated Plan (incorporating all feedback)

Based on the pre-mortem, review, and council feedback, here's the refined plan:

### Plan:

1. **Add comprehensive test cases in `packages/core/test/services/intelligence.test.ts`**
   - Create realistic skill fixtures (copy triggers/descriptions verbatim from SKILL.md files):
     - `rapid-context-dump`
     - `prepare-meeting-agenda`
     - `save-meeting`
     - `capture-conversation`
   - Test cases for the two failing queries (expect `rapid-context-dump`)
   - Negative assertions (should NOT match `prepare-meeting-agenda`)
   - Pattern-based variations (3-4 content ingestion queries)
   - Disambiguation tests (`save this meeting` → `save-meeting`, not `rapid-context-dump`)
   - Single-word regression tests (`discovery` → `discovery`, `roadmap planning` → `construct-roadmap`)
   - AC: Tests exist; failing queries route incorrectly with current implementation

2. **Expand `rapid-context-dump` triggers**
   - Add validated triggers that match failing query tokens:
     - "save this document"
     - "add this to context" / "add to context"
     - "where should I put this" / "where to put"
     - "add input" / "input data"
     - "save and summarize"
     - "include in context"
     - "import content"
   - AC: Failing query tests now pass

3. **Improve scoring algorithm to reduce false positives**
   - Require minimum 2-token overlap for description scoring (was: 1 token = 4 points)
   - Add code comment explaining the threshold rationale
   - **Defer** phrase weighting to future work (out of scope)
   - AC: "input data to add" no longer routes to `prepare-meeting-agenda`; single-word tests still pass

4. **Run full test suite and verify no regressions**
   - `npm run typecheck && npm test`
   - AC: All tests pass including new and existing routing tests

**Size estimate**: Small (4 steps, ~3 files: intelligence.test.ts, SKILL.md, intelligence.ts)

**Out of scope** (deferred):
- Phrase weighting in scoring
- LLM-based routing fallback
- User-defined trigger aliases
- Raising minimum score threshold (consider for future based on data)

---

Ready for `/approve` and `/build`?