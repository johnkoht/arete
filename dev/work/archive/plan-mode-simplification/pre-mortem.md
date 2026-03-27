# Pre-Mortem: Plan Mode Simplification

*Imagining this refactor has failed. What went wrong?*

---

## 1. Backward Compatibility — Existing Plans Break

**Risk**: Users have existing plans in `dev/plans/` with the old frontmatter schema (`previous_status`, `blocked_reason`, 8 status values). After refactor, loading these fails or behaves unexpectedly.

**Likelihood**: High — we know there are existing plans  
**Impact**: Medium — plans become unreadable

**Mitigation**: 
- Add migration logic in `loadPlan()` to normalize old frontmatter to new schema
- Map old statuses: `planned|reviewed → draft`, `in-progress → building`, `blocked|on-hold → draft`
- Ignore removed fields gracefully

---

## 2. Auto-Save Triggers Too Often or Not Enough

**Risk**: Auto-save fires on every agent response, creating many partial plan files. OR it never fires because plan extraction fails to detect "Plan:" headers in varied formats.

**Likelihood**: Medium  
**Impact**: Medium — cluttered filesystem or no auto-save at all

**Mitigation**:
- Only auto-save when: (a) plan has 2+ steps extracted, AND (b) no save exists yet OR content materially changed
- Keep existing `extractTodoItems()` logic which is proven
- Add a "dirty" flag to avoid re-saving identical content

---

## 3. Template Removal Breaks `/plan new`

**Risk**: We remove templates but forget to update `/plan new` handler, causing it to error or do nothing.

**Likelihood**: Low — we're explicitly handling this  
**Impact**: Low — easy to catch in testing

**Mitigation**: 
- `/plan new` simply enables plan mode and notifies "Plan mode enabled. Describe your idea."
- Delete `templates.ts` and all references

---

## 4. Widget/Footer Breaks Due to Missing State

**Risk**: `renderFooterStatus()` references removed state fields (`currentPhase`, old statuses), causing runtime errors or wrong display.

**Likelihood**: Medium  
**Impact**: Low — UI glitch, not functionality loss

**Mitigation**:
- Audit all `widget.ts` functions for references to removed fields
- Simplify to only use: `planModeEnabled`, `currentSlug`, `planSize`, `preMortemRun`, `reviewRun`, `status`

---

## 5. Test Coverage Gaps After Deletions

**Risk**: We delete lifecycle tests but don't update other tests that indirectly depended on lifecycle behavior. Tests pass but we've lost coverage.

**Likelihood**: Medium  
**Impact**: Medium — hidden bugs

**Mitigation**:
- Before deleting, grep for all test files referencing lifecycle concepts
- Ensure core flows are still tested: save plan, load plan, approve, build, auto-save

---

## 6. Context Injection Regression

**Risk**: Simplifying `before_agent_start` context injection breaks plan mode restrictions or loses the PM persona.

**Likelihood**: Low-Medium  
**Impact**: High — plan mode could allow destructive commands

**Mitigation**:
- Keep the core restrictions block intact
- Test: in plan mode, bash should still reject `rm`, `git commit`, etc.
- Keep PM agent prompt injection (just simplify what's around it)

---

## 7. `/build` Handoff to Execute-PRD Skill Breaks

**Risk**: The simplified `/build` command loses the logic that detects PRD existence and invokes execute-prd skill correctly.

**Likelihood**: Low-Medium  
**Impact**: High — autonomous execution breaks

**Mitigation**:
- Preserve the PRD detection logic: check `has_prd` flag and invoke execute-prd skill
- Test both paths: build with PRD, build without PRD

---

## 8. Agent Prompt Update — Work Type Guidance Too Vague

**Risk**: We add work-type guidance to PM prompt but it's too abstract. Agent doesn't actually adapt behavior or communicate its approach.

**Likelihood**: Medium  
**Impact**: Low — feature doesn't work but nothing breaks

**Mitigation**:
- Make guidance concrete with example phrases
- Test: describe a "refactor" scenario, verify agent mentions pre-mortem recommendation
- Iterate on prompt after initial implementation

---

## Summary Table

| Risk | Likelihood | Impact | Mitigation Priority |
|------|------------|--------|---------------------|
| Backward compatibility | High | Medium | **Do first** |
| Auto-save timing | Medium | Medium | Test thoroughly |
| Template removal | Low | Low | Straightforward |
| Widget state | Medium | Low | Audit carefully |
| Test coverage gaps | Medium | Medium | Grep before delete |
| Context injection | Low-Medium | High | Preserve core, test |
| /build handoff | Low-Medium | High | Preserve logic, test |
| Agent prompt | Medium | Low | Iterate |

---

## Top 3 Actions from Pre-Mortem

1. **Add migration logic for existing plans** before touching persistence
2. **Preserve and test bash restriction logic** in context injection
3. **Preserve and test PRD detection** in `/build` handler
