# Review: Project Updates Plan

**Type**: Plan (pre-execution)  
**Audience**: User (GUIDE MODE PMs) — Clear. Work is in `packages/runtime/skills/` which is user-facing.  
**Date**: 2026-02-24

---

## Checklist Results

| Concern | Status | Notes |
|---------|--------|-------|
| Audience | ✅ | Clear — user-facing skills in `packages/runtime/` |
| Scope | ✅ | Appropriate — 6 steps for 3 distinct problems |
| Risks | ✅ | Pre-mortem completed with 7 risks |
| Dependencies | ⚠️ | Implicit in phases but not explicit |
| Patterns | ✅ | Follows existing skill/pattern conventions |
| Multi-IDE | ✅ | N/A — Skills are IDE-agnostic |
| Backward compatibility | ✅ | Additive work, no breaking changes |
| Catalog | ✅ | N/A — Product skills, not build infrastructure |
| Completeness | ⚠️ | Minor gaps (see below) |

---

## Concerns

### 1. Dependencies not explicit

Steps 3-4 depend on Step 2 (pattern must exist before skills reference it). Step 4 depends on Step 1 (general-project must exist before updating it). The phased structure implies this but doesn't state it.

**Suggestion**: Add explicit dependency note: "Steps 3-4 depend on Step 2. Step 4 depends on Step 1."

### 2. Analysis structure undefined

The research_intake pattern says "create `working/analysis-[slug].md` with structured analysis" but doesn't specify the analysis structure. Without a template, agents will improvise — which is exactly the problem the plan is trying to solve.

**Suggestion**: Add an analysis template to the pattern (or in general-project's templates/). Simple structure:
- `## Summary` (2-3 sentences)
- `## Key Points` (5-7 bullet points max)
- `## Questions/Concerns` (what's unclear or needs follow-up)
- `## Relevance to Project` (how this connects to the project goal)

This gives agents structure while keeping it concise.

### 3. Word count guidance is unenforceable

The plan includes word count targets (200 words/analysis, 500-1000 words synthesis) but agents have no way to measure or enforce this. It's guidance that may be ignored.

**Suggestion**: Strengthen the guidance with structural constraints instead of word counts:
- "If your analysis exceeds 10 bullet points, you're being too verbose. Cut to the most important 5-7 points."
- "Summary should be 2-3 sentences, not paragraphs."

### 4. Step 5 audit may expand scope

The pre-implementation audit in Step 5 may identify more skills than listed (synthesize, save-meeting, process-meetings, finalize-project). If the audit finds 10+ skills, Step 5 becomes larger than estimated.

**Suggestion**: Cap the audit scope: "Audit identifies up to 8 skills. If more are found, prioritize by frequency of use or defer to follow-up work."

---

## Strengths

- **Pre-mortem is thorough** — 7 risks identified with concrete mitigations
- **Persona Council consulted** — Decisions are grounded in user archetypes
- **User feedback incorporated** — Changed auto-trigger to suggest based on real experience with verbosity
- **Reference example** — glance-comms provides concrete template guidance
- **Routing context is clear** — Explicitly documents how general-project relates to specialized skills
- **Cleanup step included** — Addresses the "2x word count" concern directly

---

## Devil's Advocate

**If this fails, it will be because...**  
Agents ignore the pattern guidance and continue improvising. The pattern is in PATTERNS.md but skills only reference it — there's no enforcement. If agents skip to the skill-specific steps (which have the actual triggers), they'll miss the conciseness guidance, word count limits, and cleanup suggestions. The pattern becomes documentation that nobody reads.

**The worst outcome would be...**  
Users get bloated `working/` directories full of verbose analysis files that clutter their projects. The research_intake pattern *amplifies* the verbosity problem instead of solving it, because agents interpret "structured analysis" as "comprehensive prose" despite the 200-word guidance. Users end up with more files and more words than before, losing the thread of what actually matters.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Summary**: The plan is solid. The pre-mortem work and persona council review have addressed most risks. The main concern is that pattern guidance may be ignored without structural enforcement (analysis template). Consider adding the analysis template structure to the pattern before execution. The word count guidance is best-effort but the stronger framing ("no more than 10 bullet points") may help.

---

## Recommended Changes Before Execution

1. Add explicit dependency notes to the plan
2. Include analysis template structure in Step 2 (research_intake pattern)
3. Replace word count guidance with structural limits (bullet point caps, sentence caps)
4. Add scope cap to Step 5 audit
