# Automated Code Review Checks

**Status**: Ready for PRD  
**Priority**: High  
**Effort**: Small (2-3 tasks)  
**Owner**: TBD

---

## Overview

Add automated pattern checks that run before manual orchestrator code review during PRD execution. Catches common issues early, saves orchestrator time.

---

## Problem

Current execute-prd workflow:
1. Subagent implements task
2. **Orchestrator manually reviews** code (6-point checklist)
3. Orchestrator runs tests
4. Accept or provide feedback

**Manual review catches**:
- ❌ Missing `.js` extensions in imports
- ❌ `any` types (strict TypeScript violation)
- ❌ Missing error handling (no try/catch)
- ❌ Missing tests for new code

**Issues**:
- Orchestrator spends time on mechanical checks
- Easy to miss in large diffs
- Feedback comes late (after full implementation)

---

## Solution

Add **automated pre-review checks** that run after subagent completes, before manual review:

```bash
# After subagent completes task
npm run code-review-check  # New script

# Output:
✅ Import extensions: All imports use .js (78 checked)
⚠️ TypeScript strictness: Found 2 'any' types
   - src/core/new-feature.ts:45
   - src/core/new-feature.ts:89
✅ Error handling: All async functions have try/catch (12 checked)
⚠️ Test coverage: New file missing tests
   - src/core/new-feature.ts (no test file found)
✅ Naming conventions: All pass (camelCase, PascalCase, kebab-case)
❌ Backward compatibility: 1 function signature changed
   - src/core/config.ts:123 getConfig() added required parameter

Summary: 3 issues found. Review required before acceptance.
```

Then orchestrator:
1. Sees automated report
2. Focuses manual review on logic/design/patterns
3. Provides targeted feedback if issues found

---

## Tasks (Draft)

1. **Code Review Script**
   - Create `scripts/code-review-check.ts`
   - Implement checks: imports, types, error handling, tests, naming, compatibility
   - Output formatter (✅/⚠️/❌ with line numbers)
   - Exit codes (0 = pass, 1 = warnings, 2 = errors)

2. **Integration with execute-prd**
   - Update execute-prd skill: add "Run code-review-check" step after subagent
   - Parse output, include in orchestrator review context
   - Add to progress.txt logging

3. **Testing & Documentation**
   - Tests for each check type (with fixture files)
   - Add npm script: `npm run code-review-check`
   - Update AGENTS.md: document automated review in orchestration section
   - Update execute-prd SKILL.md: include automated review step

---

## Check Details

### 1. Import Extensions
**Check**: All imports from local files use `.js` extension  
**Why**: NodeNext module resolution requires it  
**How**: Regex scan for `from ['"]\.\.?/.*(?<!\.js)['"]`

### 2. TypeScript Strictness
**Check**: No `any` types, no `as` without validation  
**Why**: Strict TypeScript, no escape hatches  
**How**: Parse TypeScript AST, find `any` keyword

### 3. Error Handling
**Check**: Async functions have try/catch or error handling  
**Why**: Prevent uncaught promise rejections  
**How**: Parse AST, find async functions without try/catch

### 4. Test Coverage
**Check**: New source files have corresponding test files  
**Why**: All code must be tested  
**How**: `git diff --name-only main` → check for matching test files

### 5. Naming Conventions
**Check**: Variables camelCase, types PascalCase, files kebab-case  
**Why**: Consistency with dev.mdc  
**How**: Parse AST + file names

### 6. Backward Compatibility
**Check**: Public function signatures unchanged (unless explicitly noted)  
**Why**: Breaking changes must be intentional  
**How**: Compare exported function signatures before/after (complex - may defer to v2)

---

## Benefits

- **Time savings**: Orchestrator focuses on logic, not mechanical checks
- **Consistency**: Same checks every time, no human oversight
- **Faster feedback**: Issues caught immediately after implementation
- **Learning**: Subagents see patterns, learn from feedback
- **Scalability**: As PRDs grow (15+ tasks), manual review doesn't scale

---

## Dependencies

- ✅ TypeScript AST parsing (use `ts-morph` or `@typescript-eslint/parser`)
- ✅ Git integration (detect changed files)
- ✅ execute-prd skill structure (Phase 2 workflow)

---

## Open Questions

1. **Strictness**: Should automated checks block acceptance, or just warn?
2. **Configuration**: Should checks be configurable per PRD? (probably not - keep consistent)
3. **Integration**: Run as git pre-commit hook too, or just in execute-prd?

---

## Future Enhancements

- **AI-powered review**: Use LLM to check code quality, suggest improvements
- **Performance checks**: Flag O(n²) algorithms, memory leaks
- **Security scan**: Check for common vulnerabilities
- **Dependency audit**: Flag outdated or vulnerable dependencies

---

## Related

- **execute-prd skill**: `dev/skills/execute-prd/SKILL.md` (Phase 2, step 9)
- **dev.mdc**: `.cursor/rules/dev.mdc` (coding conventions reference)
- **Learnings**: `dev/entries/2026-02-09_builder-orchestration-learnings.md` (code review checklist origin)
