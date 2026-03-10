---
name: hotfix
description: Structured bug fix process with diagnosis, implementation, review, and documentation. Lighter than PRD but ensures quality through eng lead mindset and reviewer validation.
category: build
work_type: development
triggers:
  - bug
  - fix
  - broken
  - not working
  - issue
  - "fix this"
  - "yes fix it"
  - "please fix"
  - regression
---

# Hotfix Skill

A structured process for fixing bugs that prevents "quick fixes" from creating more problems.

⚠️ **INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- ✅ User reports a bug and asks you to fix it
- ✅ You discover a bug while working and need to address it
- ✅ Test failures reveal unexpected behavior
- ❌ Feature requests (use plan mode)
- ❌ Refactoring (use plan mode)
- ❌ Multiple unrelated bugs (triage first, then one hotfix per bug)

## Prerequisites

- Bug is understood well enough to diagnose
- You have access to the codebase
- **Optional**: `subagent` tool for spawning reviewer (fallback: self-review)

## Workflow

### Phase 1: Diagnose (Adopt Eng Lead Mindset)

Before writing any code, understand the problem deeply.

1. **Read the bug report / user description**
   - What's the expected behavior?
   - What's the actual behavior?
   - What are the reproduction steps?

2. **Load relevant expertise** (based on affected code)
   - If touching `packages/core/` → read `.pi/expertise/core/PROFILE.md`
   - If touching `packages/cli/` → read `.pi/expertise/cli/PROFILE.md`
   - Check LEARNINGS.md in affected directories (see Path Resolution below)

3. **Identify**:
   - Root cause hypothesis
   - Affected files (list them)
   - Risk areas (what else might break?)
   - Existing test coverage (are there tests for this code path?)

4. **Present analysis to user**:
   ```
   ## Bug Analysis
   
   **Issue**: [one sentence summary]
   
   **Root cause**: [your hypothesis]
   
   **Affected files**:
   - path/to/file.ts — [why]
   - path/to/other.ts — [why]
   
   **Risk**: [what else might be affected]
   
   **Test coverage**: [existing tests? need new ones?]
   
   **Game plan**:
   1. [step 1]
   2. [step 2]
   ...
   
   Ready to proceed?
   ```

5. **Wait for user approval** before moving to Phase 2.

---

### Phase 2: Implement (After User Approval)

1. **Apply the fix** following your game plan
   - Focus on the minimal change that fixes the bug
   - Avoid scope creep (no "while I'm here" changes)

2. **Add/update tests**
   - Regression test that would have caught this bug
   - Verify the fix with `npm run typecheck && npm test`

3. **Commit with proper message**
   - Format: `fix(scope): description`
   - Example: `fix(cli): handle null calendar response gracefully`

---

### Phase 3: Review

**If subagent tool is available**, spawn the reviewer:

```typescript
subagent({
  agent: "reviewer",
  task: `Code review for hotfix: [bug summary]

Files changed:
- [list files]

What was fixed:
[description]

Tests added/updated:
[list tests]

Review the implementation. Return APPROVED or ITERATE with structured feedback.`,
  agentScope: "project"
})
```

- If reviewer returns **APPROVED** → proceed to Phase 4
- If reviewer returns **ITERATE** → apply feedback, re-run quality gates, request review again

**If subagent tool is NOT available**, perform self-review using the checklist from `.pi/agents/reviewer.md`:

- [ ] Uses `.js` extensions in imports
- [ ] No `any` types
- [ ] Proper error handling (try/catch with graceful fallback)
- [ ] Tests for happy path and edge cases
- [ ] Backward compatibility preserved
- [ ] Follows project patterns
- [ ] LEARNINGS.md updated if this was a regression

Run quality gates: `npm run typecheck && npm test`

---

### Phase 4: Close

1. **Update LEARNINGS.md** (if applicable)
   
   If this bug was a regression or revealed a non-obvious gotcha:
   
   **Path resolution**:
   - Check for LEARNINGS.md in the affected file's directory
   - If not found, check the parent directory
   - If still not found, create one in the directory of the primary changed file
   
   **Entry format**:
   ```markdown
   ## [Date] — [Short description]
   
   **What broke**: [description]
   **Why**: [root cause]
   **Fix**: [what you did]
   **Prevention**: [how to avoid in future]
   ```

2. **Report to user**:
   ```
   ## ✅ Bug Fixed
   
   **Issue**: [summary]
   **Fix**: [what you changed]
   **Files**: [list]
   **Tests**: [added/updated]
   **Commit**: [sha or message]
   **LEARNINGS.md**: [updated / not applicable]
   ```

---

## Out of Scope

This skill handles **single bug fixes**. Do NOT use for:

- **Multi-bug triage** → Prioritize first, then one hotfix per bug
- **Refactor discovery** → If fixing reveals need for refactor, note it and stay focused on the bug
- **Feature changes disguised as bugs** → Route to plan mode

---

## References

- **Reviewer checklist**: `.pi/agents/reviewer.md`
- **Expertise profiles**: `.pi/expertise/{domain}/PROFILE.md`
- **Maintenance protocol**: `.pi/standards/maintenance.md`
- **Quality gates**: `.pi/standards/build-standards.md`
