# Pre-Mortem: Improve execute-prd Based on Learnings

**Date**: 2026-03-08
**Work Type**: Documentation refactor (skill improvement)
**Files**: 2 (SKILL.md, LEARNINGS.md)

---

## Risk 1: SKILL.md Structure Mismatch

**Problem**: The notes.md references specific step numbers (Step 2, Step 6, Step 7, Step 10, Step 13). If SKILL.md has been modified since notes.md was written, edits will land in wrong places or create inconsistent content.

**Mitigation**: Before making ANY edits, verify:
1. Read current SKILL.md structure
2. Confirm Step 2 = "Read and Internalize the PRD"
3. Confirm Step 6 = risk categories table
4. Confirm Step 7 = mitigations section
5. Confirm Step 10 = subagent prompt template
6. Confirm Step 13 = reviewer code review dispatch
If structure differs, update notes.md references before editing.

**Verification**: Document current structure at start of execution; compare against notes.md expectations.

---

## Risk 2: Content Bloat / Cognitive Overload

**Problem**: SKILL.md is already 600+ lines. Adding 6 improvements (phantom detection, grumpy reviewer, DRY guidance, backwards compat, build scripts, shared utility) could make it too long to be usable. Orchestrators may skim or skip the very guidance meant to help them.

**Mitigation**: 
- Keep each addition to 5-10 lines max
- Use bullet points, not paragraphs
- Integrate into existing sections (don't create new top-level sections)
- Phantom detection = sub-bullets under Step 2, not a new numbered step
- After all edits, review for conciseness — cut any fluff

**Verification**: After edits, SKILL.md should grow by <60 lines total. If more, trim.

---

## Risk 3: Formatting Inconsistency

**Problem**: New content uses different markdown conventions than existing content (different heading levels, bullet styles, code block formats). Results in a jarring, unprofessional document.

**Mitigation**: Before inserting content, sample existing style from the target section:
- Check heading levels (###, ####)
- Check bullet markers (-, *)
- Check code block indentation
- Match exactly

**Verification**: Visual scan of each edit area for style consistency.

---

## Risk 4: Missing Evidence Citations

**Problem**: The value of learnings-based improvements is their evidence base. If additions say "this pattern works" without citing the specific entry that proved it (e.g., "reimagine-v2 PRD saved 80% work"), they become generic advice that future readers may ignore.

**Mitigation**: Every pattern addition must include:
- Source entry name (e.g., "2026-03-07_reimagine-v2-orchestration-learnings.md")
- Specific metric when available (e.g., "5/6 phantom tasks detected", "80% work saved")

**Verification**: Grep for each new pattern; confirm citation exists.

---

## Risk 5: LEARNINGS.md Table Format Mismatch

**Problem**: The metrics table in LEARNINGS.md has a specific format. New rows (ai-config, reimagine-v2) might not match column alignment or content format, breaking the table rendering.

**Mitigation**: Before adding rows, read current table format:
- Check column headers
- Check alignment characters
- Match exactly
- Test render if possible

**Verification**: View LEARNINGS.md in a markdown previewer after edit.

---

## Summary

| Risk | Category | Severity | Mitigation |
|------|----------|----------|------------|
| Structure mismatch | Dependencies | Medium | Verify structure before editing |
| Content bloat | Scope Creep | Medium | Keep additions <60 lines total |
| Formatting inconsistency | Code Quality | Low | Match existing style |
| Missing citations | Code Quality | Low | Include evidence for all patterns |
| Table format mismatch | Integration | Low | Match existing column format |

**Total risks identified**: 5
**Categories covered**: Dependencies, Scope Creep, Code Quality, Integration

---

## Mitigations to Apply During Execution

1. **Before Step 1**: Read SKILL.md, document current structure, verify step numbers match notes.md
2. **During each edit**: Match surrounding style, keep additions concise
3. **After Step 1**: Check line count increase (<30 lines for high-impact)
4. **After Step 2**: Check line count increase (<30 lines for medium-impact)
5. **After Step 3**: Verify table renders correctly, citations present
6. **Final**: Total SKILL.md growth <60 lines; each addition has evidence citation
