# Phase 3: Pre-Mortem

## Scenario: "What could go wrong?"

### Risk 1: Agent ignores area-scope step in week-plan (HIGH likelihood if not explicit)

**What breaks**: The week-plan skill adds a new Step 1.5 asking "Which areas this week?" but the agent skips it and proceeds to Step 2 because the skill text is dense.

**Mitigation**: Make the step visually prominent with a clear heading. Add explicit instruction: "This step MUST precede Step 2 — do not gather context before area scope is confirmed." Also add a fallback: "If user says 'skip' or 'all' — proceed without area filtering."

**Signal to monitor**: In practice, check if weekly planning outputs include area-scoped goal lists.

---

### Risk 2: quarter-plan creates goal files without area when user skips the prompt

**What breaks**: User says "I don't know / skip" for the area question. Goal file has `area: ""`. Later, week-plan checks `goal.area` and shows the goal as "Unscoped" — user sees their goals labeled as unscoped every week and gets annoyed.

**Mitigation**: 
- The "Unscoped goals" section in week-plan should be presented neutrally ("Goals without area:")
- Not a warning or red flag — just a separate section
- User can still prioritize unscoped goals

---

### Risk 3: general-project asks for goal but no goals exist yet (NEW workspace)

**What breaks**: New user hasn't run quarter-plan yet. general-project asks "Which goal does this project advance?" with an empty list. Creates bad UX.

**Mitigation**: Explicit graceful-skip: "If no active quarter goals found — skip this step. You can link the project to a goal later by editing the README."

---

### Risk 4: Template `area:` field breaks existing goal parsing (FALSE RISK)

**What breaks**: The GoalParserService parses `area` as optional string. If the template uses `area: ""` and the parser does `if (area.trim()) return area`, an empty string would not be stored. This is CORRECT behavior — goals without area assignment should have `area: undefined`.

**Resolution**: This is not a risk. The GoalParserService already handles `area` as optional. Empty string becomes `undefined` which is the correct representation.

---

### Risk 5: Build fails because dist/ includes skill files (MUST BUILD)

**What breaks**: Skill SKILL.md files are copied to dist/ during build. If we change SKILL.md files but don't build, the dist/ is out of sync. Build standards require dist/ to be committed.

**Mitigation**: Always run `npm run build` before committing. Verify dist/ files are updated.

---

### Risk 6: week-plan area-scope step makes planning session longer

**What breaks**: The area-scoping question adds 1-2 more turns to week planning. User with 1 area finds it annoying.

**Mitigation**: If only 1 area exists, auto-select it without prompting. Only prompt when 2+ areas exist.

---

## Pre-Mortem Mitigations Summary

| Risk | Mitigation | Applied In |
|------|-----------|------------|
| Agent skips area-scope | Explicit MUST precede instruction | week-plan SKILL.md |
| Unscoped goals are annoying | Neutral "no area" section | week-plan SKILL.md |
| No goals for project linkage | Explicit graceful-skip | general-project SKILL.md |
| Empty area string parsing | Already handled in GoalParserService | No change needed |
| Dist out of sync | Build before commit | Standard process |
| Area-scope adds turns | Auto-skip if 1 area | week-plan SKILL.md |
