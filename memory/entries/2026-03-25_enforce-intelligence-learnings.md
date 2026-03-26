# Contextual Memory Retrieval in Planning Skills — Learnings

**PRD**: `dev/work/plans/enforce-intelligence/plan.md`
**Executed**: 2026-03-25
**Type**: Feature (markdown-only skill updates)

## Summary

Added explicit memory retrieval steps to planning skills (week-plan, daily-plan, meeting-prep) based on the insight that `intelligence:` frontmatter declarations are metadata-only — agents don't execute them unless workflow steps explicitly instruct them to.

## Changes Made

| File | Change |
|------|--------|
| `PATTERNS.md` | New `contextual_memory_search` pattern |
| `week-plan/SKILL.md` | Step 2.5 (surface meetings) + Step 2.6 (memory search) |
| `daily-plan/SKILL.md` | Step 4.5 (memory-informed meeting context) |
| `meeting-prep/SKILL.md` | Step 4.5 (inline memory search) |
| `_authoring-guide.md` | Documentation on frontmatter semantics |

## What Worked Well

- **Review-first approach**: Engineering lead review caught 5 concerns before implementation, all addressed in revised plan
- **Inline vs. pattern decision**: Meeting-prep uses inline prose (not pattern reference) because it already has 3 pattern refs — reduced cognitive load
- **Empty-result handling**: Consistent guidance across all skills to avoid awkward "nothing found" UX

## Key Learnings

### Frontmatter is Metadata, Not Enforcement

The `intelligence:` list in SKILL.md frontmatter declares what services a skill *can use*, but doesn't make the agent actually use them. Agents follow prose instructions in the workflow section, not frontmatter.

**Pattern**: If you want a behavior, put it in the workflow steps with explicit commands.

### Pattern References vs. Inline Steps

| Situation | Recommendation |
|-----------|----------------|
| Skill has 0-2 pattern references | Use pattern reference |
| Skill has 3+ pattern references | Use inline steps |
| Unique requirements | Use inline steps |

Meeting-prep needed inline steps because it already references get_meeting_context, get_area_context, and relationship_intelligence.

### Context Sources for Memory Search

The "gather → confirm → enrich" flow works well:
1. Gather raw context (calendar, goals)
2. User confirms priorities and key meetings
3. Search memory using confirmed items as search terms

This avoids searching for generic keywords — search terms come from what the user actually cares about.

## Collaboration Notes

- Builder prefers explicit step-by-step instructions over implicit magic
- Review process caught scope creep (Step 2.5 meeting surfacing needed justification)
- Pattern relationship clarity important (contextual_memory_search vs. context_bundle_assembly)

## References

- Plan: `dev/work/plans/enforce-intelligence/plan.md`
- Review: `dev/work/plans/enforce-intelligence/review.md`
- Pattern: `packages/runtime/skills/PATTERNS.md` → `contextual_memory_search`
