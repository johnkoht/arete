# Pre-Mortem: Onboarding Tool Fixes

**Plan**: Onboarding Fixes (4 steps)
**Date**: 2026-02-21

---

### Risk 1: `storage.list()` slice offset error corrupts backfill paths

**Category**: Code Quality / Test Patterns

**Problem**: Step 3's file-level backfill needs to compute relative paths from absolute source file paths. The existing template backfill pattern uses `srcFile.slice(templateSrc.length + 1)` — the `+ 1` skips the trailing slash. If the executor uses `templateSrc.length` (no `+ 1`), every destination path starts with `/` or an incorrect segment, writing files to wrong locations or failing silently.

**Mitigation**: Explicitly reference the existing template backfill block in `workspace.ts` (~line 404) as the pattern to follow for Step 3 — same `storage.list({ recursive: true })`, same `srcFile.slice(src.length + 1)` relative path computation, same `storage.mkdir(join(dest, '..'))` before write. Add a comment: "mirrors template backfill pattern — see templateSrc block above."

**Verification**: After Step 3, confirm the new test verifies a nested file (`templates/30-60-90-plan.md`) lands at exactly `{toolDest}/templates/30-60-90-plan.md` — not a flattened or double-slashed path.

---

### Risk 2: Step 4 `dist/` sync is partial — `resources/` directory gets missed

**Category**: Dependencies / Context Gaps

**Problem**: Step 4 is a manual sync. An executor is likely to copy `TOOL.md` (one file, obvious) but forget `resources/` (new directory, easy to miss). If `dist/tools/onboarding/resources/` doesn't exist after the commit, npm users get no reading list.

**Mitigation**: Verify Step 4 with a directory diff: `diff -r packages/runtime/tools/onboarding/ dist/tools/onboarding/` must produce zero output. This is the only way to confirm complete sync. Add this check explicitly to Step 4's AC.

**Verification**: `diff -r packages/runtime/tools/onboarding/ dist/tools/onboarding/` returns empty output.

---

### Risk 3: Step 2 deletes unique guidance alongside inline markdown duplication

**Category**: Scope Creep (user-facing content)

**Problem**: "Remove the raw inline markdown that duplicates what's in the template files" is ambiguous. The template files are structural starters — they don't contain the column-level descriptions, usage tips, and "why this file exists" context in the TOOL.md section. An executor interpreting "remove inline markdown" broadly could strip the entire section body, degrading agent guidance significantly.

**Mitigation**: Delete only fenced code blocks (content inside ` ``` `). Keep every prose paragraph. Heuristic: if it's inside a fenced block, it's duplicated content; if it's a prose sentence, it stays.

**Verification**: After Step 2, the Working File Templates section has no fenced code blocks but retains prose descriptions for each file. Section word count drops ~120 lines (the fenced blocks) but prose paragraphs are intact.

---

### Risk 4: Step 3 file-level backfill picks up unwanted source files

**Category**: Integration

**Problem**: `storage.list({ recursive: true })` on a tool dir will walk all files including any hidden files or OS artifacts (`.DS_Store`) if present in the runtime source. Low likelihood (runtime source is clean) but worth noting.

**Mitigation**: The outer loop is already over `listSubdirectories` (one tool dir at a time). The inner walk is within a single tool. If any concern about hidden files, add `if (basename.startsWith('.')) continue` check on filenames. The `_template/` tool dir is intentionally included — it's a useful reference for users.

**Verification**: Tests pass; no unexpected files appear in the test workspace after backfill.

---

### Risk 5: Step 4 run before Step 2 is complete — partial mirror

**Category**: State Tracking / Dependencies

**Problem**: Steps 1, 2, 3 are independent; Step 4 depends on both 1 and 2. If an executor does Step 4 right after Step 1 (before Step 2's TOOL.md edits), the `dist/` TOOL.md won't include the template wiring changes.

**Mitigation**: Execute in order: 1 → 2 → 3 → 4. The `diff -r` verification from Risk 2 enforces this — if Step 2 changes aren't in `dist/`, the diff will show TOOL.md differences.

**Verification**: Run `diff -r` check only after Steps 1 and 2 are both complete.

---

## Summary

**Total risks identified**: 5
**Categories covered**: Code Quality, Dependencies, Context Gaps, Scope Creep, Integration, State Tracking

| Risk | Likelihood | Impact | Key Mitigation |
|------|-----------|--------|----------------|
| Slice offset error (Step 3) | Medium | Medium | Follow existing template backfill pattern |
| Partial `dist/` sync (Step 4) | High | High | `diff -r` AC verification |
| Over-deletion in TOOL.md (Step 2) | Medium | High | Delete fenced blocks only; keep all prose |
| Unwanted files in backfill (Step 3) | Low | Low | Intentional; document behavior |
| Wrong Step 4 ordering | Low | Medium | Do 1 → 2 → 3 → 4; diff check enforces |

No blocking risks. Mitigations are concrete and verifiable.
