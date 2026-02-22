# Pre-Mortem: Onboarding Tool Template Improvements

**Plan**: Onboarding Tool Template Improvements
**Date**: 2026-02-21
**Size**: Medium (5 steps, 12 files — all markdown)

---

### Risk 1: Template Bloat Confuses Agents

**Category**: Context Gaps / Scope Creep

**Problem**: Currently there are 4 templates (581 lines total). This plan adds 8 more files, roughly tripling the template count. When an agent loads the TOOL.md and sees `templates/` referenced, it may try to read all 12 templates before starting — consuming context window and potentially getting confused about which template goes where. The TOOL.md activation workflow (step 4 vs 4.5) already distinguishes "plan templates" from "working file templates" but the file listing doesn't make this obvious.

**Mitigation**: 
- Use clear naming conventions that signal purpose: plan templates (`30-60-90-plan.md`, `weekly-plan.md`), working files (`learning-backlog.md`, `burning-problems.md`), checkpoint outputs (`day-30-learnings.md`, `day-60-assessment.md`, `day-90-retro.md`)
- Each new template gets a 2-3 line header comment: "Phase: X | Created in: working/ (or outputs/) | When: [trigger]"
- Consider organizing into subdirectories (`templates/working/`, `templates/checkpoints/`) — but **only if** the activation workflow in TOOL.md can reference subdirectories cleanly. If this adds complexity to the TOOL.md instructions, keep flat.

**Verification**: After creating templates, re-read the TOOL.md activation workflow end-to-end and confirm an agent can unambiguously determine which templates to copy where.

---

### Risk 2: Areté Skills Table Goes Stale

**Category**: Dependencies / Scope Creep

**Problem**: The plan calls for an "Areté Skills for Onboarding" reference table in 30-60-90-plan.md mapping skills like `daily-plan`, `meeting-prep`, `process-meetings` to onboarding moments. These skill names are not stable — they could be renamed, removed, or new ones added. A hardcoded table becomes misleading over time.

**Mitigation**: 
- Frame the table as "recommended skills" with a note: "Run `arete skill list` to see current available skills"
- Use descriptive names alongside technical ones: "Meeting prep (`meeting-prep`)" so even if the name changes, the intent is clear
- Keep the table to 6-8 entries max — the highest-value mappings only, not an exhaustive catalog

**Verification**: Check that every skill name referenced in the table actually exists: `ls packages/runtime/skills/` and confirm each referenced skill is present.

---

### Risk 3: TOOL.md Activation Workflow Inconsistency

**Category**: Integration

**Problem**: Step 5 updates TOOL.md's activation workflow to reference new template files. But step 4.5 currently describes inline creation of working files (not template copying). If we change 4.5 to "copy templates" but the template content differs from what 4.5 currently describes, agents get conflicting instructions — the TOOL.md prose says one thing, the template says another.

**Mitigation**: 
- When creating working file templates (Step 3), use the TOOL.md's "Working File Templates" section as the source of truth for structure/content
- When updating TOOL.md (Step 5), do a diff between what 4.5 currently describes and what the new templates contain — they must match
- Keep the "Working File Templates" prose section in TOOL.md as documentation/context, but update step 4.5 to say "Copy `templates/learning-backlog.md` → `working/learning-backlog.md`" (matching the step 4 pattern)

**Verification**: After Step 5, compare each template file's structure against its corresponding TOOL.md prose description. No structural divergence allowed.

---

### Risk 4: Checkpoint Deliverables Duplicate Existing Graduation Criteria

**Category**: Scope Creep

**Problem**: TOOL.md already has detailed "Phase Complete When" criteria and a "Graduation Criteria" checklist. Adding day-30-learnings.md, day-60-assessment.md, and day-90-retro.md could create redundancy — the graduation criteria say one thing, the checkpoint template structures another. Agents might use the template structure as the authoritative checklist and miss criteria only listed in TOOL.md.

**Mitigation**: 
- Checkpoint templates should explicitly reference (not duplicate) the TOOL.md phase completion criteria: "See Phase 1 completion criteria in your 30-60-90 plan"
- Structure checkpoint templates as **reflection + synthesis** artifacts, not checklists. They're for the manager conversation, not for tracking completion.
- Include a "Criteria Check" section that lists the phase criteria as yes/no items, sourced from TOOL.md, so there's one source of truth

**Verification**: Read each checkpoint template alongside the corresponding TOOL.md "Phase Complete When" section. Every TOOL.md criterion should appear in the template (no orphans).

---

### Risk 5: Update Backfill Behavior for New Template Files

**Category**: Platform Issues

**Problem**: When a user who already has the onboarding tool installed runs `arete update`, the workspace service does file-level backfill — it adds missing files but never overwrites existing ones. New template files (8 additions) will be backfilled correctly. BUT: the enhanced 30-60-90-plan.md, stakeholder-map.md, and weekly-plan.md are **edits to existing files** that will NOT be picked up by update. Users who installed before this change will have the old templates forever.

**Mitigation**: 
- This is by design (don't overwrite user modifications) and is acceptable for templates — they're starting points, not runtime dependencies
- The TOOL.md itself WILL be backfilled if any fields are missing, but content changes to existing TOOL.md files are also not overwritten
- Document in the commit message that existing installs get new templates but not enhanced existing ones
- The 8 new files are the highest-value additions (they didn't exist before); the 3 edits are enhancements to already-good templates

**Verification**: This is an accepted limitation, not a bug. No action needed beyond awareness. Confirm that new files do get backfilled by reviewing `WorkspaceService.update()` behavior in `packages/core/src/services/workspace.ts`.

---

### Risk 6: Forgetting to Re-save the Plan Content

**Category**: State Tracking

**Problem**: The plan body was overwritten by the plan-mode extension (only frontmatter remains in `plan.md`). The full plan content exists only in conversation context. If the plan isn't re-saved before building, the builder during execution won't have the detailed steps and acceptance criteria.

**Mitigation**: 
- Re-save the full plan content to `dev/work/plans/onboarding-tool-improvements/plan.md` before transitioning to build
- Include this pre-mortem as a saved artifact alongside the plan

**Verification**: Read `plan.md` after save and confirm it has all 5 steps with acceptance criteria.

---

## Summary

**Total risks identified**: 6
**Categories covered**: Context Gaps, Dependencies, Integration, Scope Creep, Platform Issues, State Tracking

| # | Risk | Severity | Likelihood | Mitigation Complexity |
|---|------|----------|------------|----------------------|
| 1 | Template bloat confuses agents | Medium | Medium | Low — naming + headers |
| 2 | Skills table goes stale | Low | Medium | Low — descriptive names + note |
| 3 | TOOL.md activation inconsistency | High | Medium | Medium — careful diffing at Step 5 |
| 4 | Checkpoint templates duplicate graduation criteria | Medium | Medium | Low — reference, don't duplicate |
| 5 | Update backfill won't enhance existing templates | Low | Certain | Accepted — by design |
| 6 | Plan content lost from plan.md | High | Certain | Low — re-save before build |

**Highest priority mitigations**: #3 (TOOL.md consistency) and #6 (re-save plan). These are the ones most likely to cause problems if skipped.

**Ready to proceed with these mitigations?**
