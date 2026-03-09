# Review: Split Sync Skill into Focused Integration Skills

**Type**: Plan  
**Audience**: Builder (internal Areté development)  
**Reviewer**: Engineering Lead perspective  
**Date**: 2026-03-04

---

## Concerns

### 1. **Completeness**: Two-stage architecture not documented in plan steps

The pre-mortem identified that this plan has an implicit two-stage architecture (pull → process-meetings), but **no plan step actually addresses this**. The plan needs:
- An explicit step to document the two-stage flow in each skill
- Verification that `process-meetings` handles the transformation correctly

**Suggestion**: Add Step 0: "Verify/document two-stage architecture" with AC:
- [ ] Each skill explains: "This template shows format AFTER running process-meetings"
- [ ] Tested `process-meetings` on Fathom/Krisp file to verify section insertion

---

### 2. **Scope**: Templates won't actually be used by core adapters

The plan creates templates in `packages/runtime/skills/{integration}/templates/`, but core adapters (fathom/index.ts, krisp/index.ts) have hardcoded `DEFAULT_TEMPLATE` constants. The skill templates will be **documentation only** — they won't control actual output.

This isn't necessarily wrong, but it's **unclear in the plan**. Are templates:
- (A) Documentation of final format (after process-meetings)?
- (B) Intended to replace core adapter templates?

**Suggestion**: Clarify in plan: "Templates are documentation of final format after process-meetings transformation. Core adapters continue using their hardcoded templates."

---

### 3. **Dependencies**: Step 1 pattern is underspecified for integration point

The `enrich_meeting_attendees` pattern is created in Step 1, but where exactly does it get applied?
- During `arete pull`? (Would require core changes — out of scope)
- During `process-meetings`? (Fits with entity resolution step)
- As a manual step? (User applies it)

The pre-mortem recommended Option B (process-meetings step 2), but this isn't reflected in the plan.

**Suggestion**: Add AC to Step 1: "Pattern specifies integration point: process-meetings step 2 (entity resolution)"

---

### 4. **Patterns**: PATTERNS.md template table not updated

Per existing PATTERNS.md § Template Resolution, new skills with templates need entries in the template table. The plan doesn't include this.

**Suggestion**: Add to Step 2/3 ACs: "Entry added to PATTERNS.md template resolution table"

---

### 5. **Backward Compatibility**: No verification that old sync triggers still work

After deleting sync, queries like "sync my meetings" or "pull from fathom" need to route to the new skills. Step 5 mentions `arete skill route` test but only for "pull from fathom".

**Suggestion**: Expand Step 5 AC to include: "Old sync triggers route correctly: 'sync my meetings' → fathom/krisp, 'sync from fathom' → fathom"

---

### 6. **Completeness**: Missing SKILL.md frontmatter details

Looking at existing skills, SKILL.md files have structured frontmatter:
```yaml
---
name: meeting-prep
description: ...
work_type: operations
category: essential
intelligence:
  - context_injection
  - memory_retrieval
---
```

The plan's template examples don't show this frontmatter. Skills need proper metadata for routing and categorization.

**Suggestion**: Add to Step 2/3/4 ACs: "SKILL.md includes proper frontmatter (name, description, work_type, category, intelligence services)"

---

## Strengths

- **Clear problem statement**: The sync skill monolith problem is well-articulated
- **Good separation**: CLI unchanged, core adapters unchanged — clean layering
- **Pre-mortem done**: 7 risks identified with mitigations
- **Out of scope defined**: Slack, CLI changes, core adapter changes explicitly excluded
- **Incremental**: Each skill can be created and tested independently

---

## Devil's Advocate

### If this fails, it will be because...

The two-stage architecture (pull → process-meetings) isn't communicated clearly enough. Users will:
1. Run `arete pull fathom`
2. See output that doesn't match the skill's template
3. Think the skill is broken
4. File bugs or lose trust

The skill docs need to be crystal clear: "This template shows the format AFTER running process-meetings. Immediately after pull, your file will look simpler."

### The worst outcome would be...

`process-meetings` transformation logic doesn't handle the new "Integration Notes" section structure, and when users run it:
- Existing Summary/Action Items sections (from integration) get duplicated instead of reorganized
- Files become corrupted with duplicate sections
- Users lose the clean structure they expected

Before executing, **manually test** `process-meetings` on a real Fathom/Krisp file to see how it handles section insertion.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

---

## Top Changes Before Execution

1. **Add Step 0**: Verify `process-meetings` handles transformation correctly (test on real Fathom/Krisp file)
2. **Clarify template purpose**: Templates document final format after process-meetings, not core adapter input
3. **Add PATTERNS.md entries**: Template resolution table needs entries for new skills
4. **Specify integration point**: Name enrichment pattern applies in process-meetings step 2
5. **Complete SKILL.md frontmatter**: All skills need proper metadata (name, description, work_type, category, intelligence)
6. **Expand routing tests**: Verify old sync triggers route to new skills

---

## Recommended Updated Plan

If these suggestions are accepted, the plan becomes 6 steps:

0. **Verify/document two-stage architecture** (NEW)
1. Create `enrich_meeting_attendees` pattern (with integration point specified)
2. Create Fathom skill with template (with frontmatter, PATTERNS.md entry)
3. Create Krisp skill with template (with frontmatter, PATTERNS.md entry)
4. Create Notion and Calendar skills (with frontmatter)
5. Delete sync skill and update references (with expanded routing tests)

This promotes the plan from Medium (5 steps) to Medium-Large (6 steps), but the added verification step is essential for risk mitigation.
