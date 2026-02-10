# Implementation Phase 1 - Complete

**Date**: 2026-02-10  
**Concepts Implemented**: 5  
**Skills Modified**: 3  
**Agent**: aaa3f5b4 (fast model)

---

## Concepts Implemented

| # | Concept | Skill | Location | Status |
|---|---------|-------|----------|--------|
| 1 | "What am I getting wrong?" | create-prd | Step 8 (Post-Generation), bullet 2 | ✅ |
| 2 | The Mom Test (3 anti-patterns) | discovery | New ## Anti-patterns section | ✅ |
| 3 | Light pre-mortem | construct-roadmap | Step 4 (Prioritization), subsection | ✅ |
| 4 | "How can we do this in half the time?" | construct-roadmap | Step 9 (Confirm and Close), closing prompt | ✅ |
| 5 | Confirmation bias / solution-first | discovery | ## Anti-patterns (4th bullet) | ✅ |

---

## Files Modified

1. `runtime/skills/create-prd/SKILL.md` - Added "Invite pushback" step
2. `runtime/skills/discovery/SKILL.md` - Added ## Anti-patterns section (4 bullets)
3. `runtime/skills/construct-roadmap/SKILL.md` - Added pre-mortem subsection + closing prompt

---

## Quality Review (Orchestrator)

**Tone match**: ✅ All additions conversational and agent-friendly  
**Formatting**: ✅ Markdown structure preserved; proper bullets and subsections  
**Length**: ✅ Proportional (1 sentence for inline; 3-5 bullets for sections)  
**Agent prompts**: ✅ Natural phrasing ("Want to…?", "Should we…?")  
**Location accuracy**: ✅ All concepts placed in appropriate workflow steps or sections  
**Typecheck**: ✅ Passed (no breakage)

---

## Implementation Details

### create-prd: "What am I getting wrong?"
- Added as bullet 2 in "Post-Generation" step (after "Offer review")
- Prompt: "Before locking the PRD, ask the user or a stakeholder: 'What am I getting wrong?' to invite genuine pushback and surface blind spots."
- Effect: Agents will now offer this prompt when finalizing PRDs

### discovery: The Mom Test + solution-first
- Created new "## Anti-patterns" section with 4 bullets
- Placed after "### 7. Finalize" and before "## Research Best Practices"
- Covers: don't pitch, past behavior > hypotheticals, compliments are lies, solution-first
- Effect: Clear guardrails against most common discovery failures

### construct-roadmap: Pre-mortem + half-time challenge
- Pre-mortem: Added as subsection "#### Quick Pre-Mortem" in Step 4 (Prioritization Framework), before RICE scoring table
- Half-time: Added closing prompt in new Step 9 (Confirm and Close), before Step 10 (Context Update)
- Effect: Roadmap planning now includes risk identification and ruthless prioritization challenge

---

## Next Steps

**Remaining high-priority concepts** (from top 25):
- #6: Light pre-mortem (quarter-plan)
- #7: Light pre-mortem (create-prd)
- #8: "Version two is a lie" (create-prd)
- #9: Disagree and commit (quarter-plan)
- #10: Argue the opposite / devil's advocate (create-prd)
- ... (20 more in top 25)

**Recommendation**: Batch next 5-10 concepts and spawn another fast subagent using the same pattern.

**Alternative**: Cherry-pick specific skills to enhance (e.g., all create-prd improvements, all quarter-plan improvements).
