## Review: Contextual Memory Retrieval in Planning Skills

**Type**: Plan (pre-execution)
**Audience**: User (PM-facing planning skills)

---

### Concerns

1. **Scope: Step 2.5 (Surface key meetings) may be scope creep**
   - The stated problem is about memory retrieval, but Step 2.5 adds meeting surfacing/confirmation to week-plan
   - This is meeting identification, not memory search — it's a distinct workflow change
   - **Suggestion**: Either split into a separate task (Step 2.5a) with its own AC, or clarify why meeting confirmation is prerequisite for the memory enrichment step. If it's "we need confirmed meeting titles before we can search memory for them," say that explicitly in the pattern.

2. **Pattern overlap with `context_bundle_assembly`**
   - PATTERNS.md already has `context_bundle_assembly` which includes "Gather existing memory — Run `arete search "<topic>" --scope memory`"
   - The new `contextual_memory_search` pattern seems to overlap but adds the "gather → confirm → enrich" pre-phase
   - **Suggestion**: Clarify the relationship in the pattern definition. Options: (a) `contextual_memory_search` is a lightweight alternative to full bundles for planning skills, or (b) `contextual_memory_search` is a specialized pre-phase that can feed into `context_bundle_assembly` later. Either way, state it.

3. **No empty-result handling guidance**
   - What should the agent say when memory search returns nothing relevant?
   - Risk: Awkward UX ("I searched memory and found nothing. Anything here that changes your priorities?")
   - **Suggestion**: Add to pattern: "If memory search returns no relevant results, skip the 'Anything here' question and proceed with a note: 'No directly relevant past decisions found.'"

4. **Meeting-prep complexity compounding**
   - Meeting-prep already references 3 patterns (get_meeting_context, get_area_context, relationship_intelligence)
   - Adding a 4th pattern reference increases cognitive load for both agents and skill maintainers
   - **Suggestion**: Consider whether the memory step should be inline prose rather than a pattern reference in meeting-prep specifically, since it has unique requirements (meeting topic + each attendee name). Pattern references work best when the steps are truly reusable without modification.

5. **Missing AC: Step 5 authoring guide**
   - AC says "Links to `contextual_memory_search` pattern" but doesn't specify where/how
   - Is this a cross-reference in prose, or an actual hyperlink?
   - **Suggestion**: Add specific AC like "Cross-reference example shows how to add a memory step to a skill"

---

### Strengths

- **Problem is well-defined**: The gap between frontmatter declaration and actual execution is real. Verified that week-plan and daily-plan truly have no memory steps despite declaring `memory_retrieval` in intelligence.

- **Follows existing precedent**: Using week-review Step 3.5 as the model is exactly right. That step shows the working pattern: `arete search "<topic>" --scope memory`.

- **Verified CLI flags**: The plan uses `--limit` which is confirmed as a real flag (`arete search --help` shows `--limit <n>`).

- **Appropriate scope boundary**: Not trying to build runtime enforcement or auto-injection — those would be over-engineering. Prose instructions that match existing working patterns (week-review) is the pragmatic choice.

- **Clear task dependency ordering**: Pattern definition (Step 1) comes before skills that reference it (Steps 2-4), and authoring guide update (Step 5) comes after the pattern exists.

- **Risk mitigations are practical**: "Max 5 items, only if genuinely relevant" directly addresses the "too much memory" failure mode.

---

### Devil's Advocate

**If this fails, it will be because...** agents are unpredictable in following prose instructions. The same root cause that makes `memory_retrieval` frontmatter decorative (agents don't read it) could apply to explicit workflow steps — agents may skip them if they're optimizing for speed or if the user seems in a hurry. There's no enforcement mechanism.

The mitigation (explicit command examples) helps, but the fundamental reliance on "agent reads and follows prose" is the weak link. We're betting that explicit numbered steps with command examples are more reliably followed than frontmatter declarations. That bet is probably correct, but it's not guaranteed.

**The worst outcome would be...** we add all these memory steps to skills, but agent behavior remains inconsistent. Users see `memory_retrieval` in frontmatter AND explicit Step 2.6 in the workflow, yet still don't get memory surfaced reliably. This makes the system feel *more* broken because it's now "supposed to work."

---

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Summary**: The plan addresses a real gap with a pragmatic approach (prose instructions matching working precedents). The scope is appropriate and risks are identified.

**Concerns Addressed in Revised Plan**:
1. Clarified why Step 2.5 (meeting confirmation) is part of this plan
2. Added empty-result handling guidance to the pattern
3. Changed meeting-prep to use inline prose instead of pattern reference
4. Tightened Step 5 AC with specific cross-reference guidance
5. Added relationship to `context_bundle_assembly` in pattern definition

**Reviewer**: Engineering Lead (via subagent)
**Date**: 2026-03-25
