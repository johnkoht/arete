# Pre-Mortem: Build Log

## Risk 1: Ship Skill is Large (~2000 lines)

**Problem**: Adding Phase 0 and updating all 17 phases requires editing a massive file. Easy to introduce formatting errors, break existing sections, or miss phases.

**Severity**: HIGH

**Mitigation**: 
- Before editing: Create a checklist of ALL phase headings that need update
- Use grep to identify all `### Phase X.Y` lines
- Edit Phase 0 as a single atomic addition (not scattered edits)
- After editing: Verify all phases still have correct headers

**Verification**: `grep -c "### Phase" .pi/skills/ship/SKILL.md` should return same count + new Phase 0 entries

---

## Risk 2: Phase Number References May Drift

**Problem**: Step 3 hardcodes phase→artifact mappings (1.2→pre-mortem.md, 2.2→prd.md, 3.1→worktree). If ship skill phases get renumbered later, verification logic breaks silently.

**Severity**: MEDIUM

**Mitigation**: 
- Document the mapping in the verification section itself
- Add a comment in Phase 0: "Phase mappings: update if phases renumbered"
- Consider using phase NAMES not numbers for verification logic

**Verification**: Verification section includes phase name, not just number (e.g., "Phase 1.2 (Pre-Mortem)" not just "Phase 1.2")

---

## Risk 3: Template Directory May Not Exist

**Problem**: Plan says create `.pi/skills/ship/templates/build-log.md` but need to verify templates/ directory exists and is the right pattern.

**Severity**: LOW

**Mitigation**: Check existing ship skill structure before creating template

**Verification**: `ls -la .pi/skills/ship/` before creating template

---

## Risk 4: "Atomic Writes" is Vague

**Problem**: Plan says "keep writes atomic" but build-log.md is markdown edited by agents. What does "atomic" mean in practice? Agents can't truly atomic-write files.

**Severity**: MEDIUM

**Mitigation**: Define "atomic" as: "Replace entire Status block or Progress entry in one edit, not multiple edits that could leave partial state"

**Verification**: Review phase instructions to ensure each specifies the full block to write, not incremental line additions

---

## Risk 5: AGENTS.md Structure Assumptions

**Problem**: Step 6 says "Add build-log.md to the Workspace section" and "Add resume workflow to the Workflows section" — need to understand exact format of these sections.

**Severity**: LOW

**Mitigation**: Read AGENTS.md [Workspace] and [Workflows] sections before writing documentation updates

**Verification**: Check that added entries match existing format/structure

---

## Risk 6: Scope Creep to Execute-PRD

**Problem**: While implementing, temptation to "just add execute-prd support too" since we're already in the files. V2 scope is explicit but easy to ignore.

**Severity**: MEDIUM

**Mitigation**: 
- During each task, explicitly check: "Is this V1 scope?"
- No changes to execute-prd skill at all
- If a task seems to require execute-prd changes, STOP and flag

**Verification**: `git diff .pi/skills/execute-prd/` should show NO changes

---

## Summary

| Risk | Severity | Category |
|------|----------|----------|
| Large skill file editing | HIGH | Code Quality |
| Phase number drift | MEDIUM | Dependencies |
| Template directory | LOW | Integration |
| Atomic writes vague | MEDIUM | Code Quality |
| AGENTS.md structure | LOW | Context Gaps |
| Scope creep | MEDIUM | Scope Creep |

**Total risks**: 6
**CRITICAL**: 0
**HIGH**: 1
**MEDIUM**: 3
**LOW**: 2
