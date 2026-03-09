# Pre-Mortem: Split Sync Skill into Focused Integration Skills

## Plan Summary
- **Size**: Medium (5 steps)
- **Work Type**: Refactor + New Feature
- **Goal**: Split monolithic sync skill into focused integration skills (fathom, krisp, notion, calendar) with separate templates for meeting integrations

---

## Risk 1: Template vs Core Adapter Mismatch

**Problem**: The plan proposes skill-level templates, but core adapters (fathom/index.ts, krisp/index.ts) have hardcoded `DEFAULT_TEMPLATE` constants. The skill templates describe the *final* desired format, but the core writes files in a *different* format. This disconnect means:
- Files written by `arete pull fathom` won't match the skill's template
- The "Areté-generated Summary" and "Integration Notes" sections don't exist in core output
- Users may expect the template to control output, but it doesn't

**Mitigation**: Clarify the two-stage architecture in the plan:
1. **Stage 1 (pull)**: Core writes meeting with integration data using its hardcoded template
2. **Stage 2 (process-meetings)**: Transforms file to add Areté sections, reorganize per skill template

Add to skill documentation: "This template describes the format AFTER running `process-meetings`. Initial pull creates a simpler file that `process-meetings` transforms."

**Verification**: 
- [ ] Each skill doc explains the two-stage flow
- [ ] AC for `process-meetings` update is added (if transformation logic needed)

---

## Risk 2: process-meetings May Need Updates

**Problem**: The plan assumes `process-meetings` will add "## Summary" and "## Action Items" sections to meeting files. Looking at the skill, it extracts and writes these sections. But:
- Current format: `process-meetings` appends sections to existing file
- New format: Needs to recognize "Integration Notes" section and write Areté sections ABOVE it
- If file already has "## Summary" (from integration), there's ambiguity

**Mitigation**: 
- Check if `process-meetings` currently handles section placement correctly
- If not, add a step to update `process-meetings` to:
  1. Insert Areté sections after frontmatter/title
  2. Move integration sections under "## Integration Notes" (or "## Fathom Notes")
  3. Handle idempotency (don't duplicate sections on re-run)

**Verification**:
- [ ] Test `process-meetings` on a Fathom/Krisp file to see current behavior
- [ ] AC added if `process-meetings` modification needed

---

## Risk 3: Routing Overlap with Existing Skills

**Problem**: The new `calendar` skill has triggers like "what's on my calendar" - but this might overlap with `meeting-prep`, `daily-plan`, or `week-plan` which also query calendar. Could cause routing confusion.

**Mitigation**: 
- Differentiate triggers clearly:
  - `calendar` skill: Pull/view operations ("show my calendar", "pull calendar events")
  - `meeting-prep`: Prep for a specific meeting (needs calendar as input, not output)
  - `daily-plan`/`week-plan`: Planning that uses calendar context
- Review trigger lists before finalizing to avoid overlap

**Verification**:
- [ ] Run `arete skill route` tests for ambiguous queries
- [ ] Calendar skill triggers don't overlap with meeting-prep triggers

---

## Risk 4: Missing Name Enrichment Integration Point

**Problem**: The plan adds a `enrich_meeting_attendees` pattern, but doesn't specify WHERE in the workflow it runs:
- During pull? (core adapter would need to call it)
- During process-meetings? (skill instruction)
- As a separate step? (user-initiated)

If this is unclear, the pattern won't actually get used.

**Mitigation**: Specify integration point explicitly:
- **Option A**: Pattern in skill, agent applies during pull workflow (skill instructs: "after pull, check attendees and enrich if incomplete")
- **Option B**: Built into `process-meetings` step 2 (entity resolution already does people matching)

Recommend Option B - `process-meetings` already does entity resolution, extending it to include calendar cross-reference is natural.

**Verification**:
- [ ] Pattern specifies exact integration point
- [ ] Workflow step in skill explicitly references when to apply pattern

---

## Risk 5: Sync Skill Deletion Breaks Something

**Problem**: Deleting `sync` skill without comprehensive search for references could break:
- Documentation that mentions "sync skill"
- Other skills that say "see sync skill for..."
- Test fixtures or examples

**Mitigation**: Before deletion:
1. `grep -r "sync" packages/runtime/` to find all references
2. Update each reference to point to new skill
3. Check `arete skill route "sync my meetings"` routes correctly after

**Verification**:
- [ ] Full grep performed
- [ ] All references updated
- [ ] `arete skill list` shows new skills
- [ ] Old sync triggers route to appropriate new skill

---

## Risk 6: Template Resolution System Not Used

**Problem**: The plan puts templates in `packages/runtime/skills/{integration}/templates/meeting.md`. But the existing template resolution system (see PATTERNS.md § Template Resolution) uses:
- Workspace override: `templates/outputs/{skill-id}/{variant}.md`
- Skill default: `.agents/skills/{skill-id}/templates/{variant}.md`

The proposed path doesn't match either pattern. Templates may not be resolvable via `arete template resolve`.

**Mitigation**: 
- Use consistent path structure: `packages/runtime/skills/fathom/templates/meeting.md` → `{variant} = meeting`
- Add entries to PATTERNS.md template table for new skills
- Ensure `arete template resolve --skill fathom --variant meeting` works

**Verification**:
- [ ] Template paths follow convention
- [ ] PATTERNS.md template table updated
- [ ] `arete template resolve` command works for new skills

---

## Risk 7: Krisp Key Points vs Fathom Highlights Inconsistency

**Problem**: Looking at the core adapters:
- Krisp provides: `key_points`, `action_items`, `detailed_summary`
- Fathom provides: `summary` (no key_points, uses `highlights` for {key_points} placeholder)

The plan's templates have different sections, which is good. But `process-meetings` needs to handle both formats when transforming to the final Areté format.

**Mitigation**: 
- Ensure `process-meetings` reads the `source` frontmatter field to know which integration
- Apply appropriate transformation based on source
- Or: Make the transformation source-agnostic (look for sections that exist, don't assume structure)

**Verification**:
- [ ] `process-meetings` handles both Fathom and Krisp source files
- [ ] Test with actual files from each integration

---

## Summary

| Category | Risks |
|----------|-------|
| Context Gaps | Risk 4: pattern integration point |
| Integration | Risk 1, 2, 7: template/core/process-meetings coordination |
| Dependencies | Risk 5: sync deletion references |
| Code Quality | Risk 6: template resolution convention |
| Scope Creep | Risk 3: trigger overlap |

**Total risks identified**: 7

**Highest risk**: Risk 2 (process-meetings may need updates) - if transformation doesn't work, the whole template design falls apart.

---

## Recommended Plan Additions

Based on this pre-mortem:

1. **Add Step 0**: Verify/update `process-meetings` transformation logic
   - Test current behavior with Fathom/Krisp files
   - Add section insertion/reorganization if needed

2. **Clarify two-stage architecture** in all skill docs:
   - Stage 1: Pull writes integration data
   - Stage 2: process-meetings transforms to Areté format

3. **Add template entries** to PATTERNS.md template table

4. **Name enrichment integration point**: Add to `process-meetings` step 2 (entity resolution)

---

## Ready to Proceed?

With these mitigations applied, the plan should execute safely. The key change is recognizing this is a **two-stage system** (pull + transform) rather than templates directly controlling output.
