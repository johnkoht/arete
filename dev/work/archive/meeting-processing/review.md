# Review: Meeting Processing CLI Parity

**Type**: Plan
**Audience**: Builder (internal tooling for Areté development)

---

## Concerns

### 1. **Scope: Step 5 might be unnecessary**
The `--clear-approved` flag (Step 5) enables reprocessing from CLI, but this is a less common use case. Users are more likely to reprocess via UI where the modal UX already exists.

- **Suggestion**: Mark Step 5 as stretch/optional. Focus on Steps 1-4 for core interchangeability. Step 5 can be a fast-follow if users actually need CLI reprocessing.

### 2. **Dependencies: Step 3 and Step 4 both need Step 1**
Both CLI extract enhancement (Step 3) and CLI approve command (Step 4) need the core function from Step 1. However, Step 4 doesn't necessarily need Step 3.

- **Suggestion**: Clarify that Step 4 could be done in parallel with Step 3 after Step 1+2 complete. This could speed up execution.

### 3. **Test Coverage: Integration test gap**
The acceptance criteria mention "integration test: extract → approve → verify memory files" but don't specify where this test lives or what scenarios it covers.

- **Suggestion**: Add specific test file location (`packages/cli/test/commands/meeting.test.ts`) and scenarios:
  - Extract via CLI → Approve via CLI → Memory files updated
  - Process via UI → Approve via CLI → UI reflects changes
  - Extract via CLI → Approve via UI → Memory files updated

### 4. **Catalog: capabilities.json not checked**
The plan touches CLI commands and core services but doesn't mention checking `dev/catalog/capabilities.json` for affected capabilities.

- **Suggestion**: Add pre-step: "Review capabilities.json for entries related to meeting extraction/approval. Update after implementation if new capabilities added."

---

## Strengths

- **Clear problem statement**: The gap between CLI and UI is well-documented with a concrete table showing what's missing.
- **Interchangeability test**: The Monday/Tuesday scenario provides a clear, testable success metric.
- **Staged approach**: Moving logic to core first, then updating consumers, is the right sequence.
- **Pre-mortem was thorough**: 7 risks with clear mitigations — especially good coverage of frontmatter parsing (Risk 3, 7) and path resolution (Risk 4).

---

## Devil's Advocate

**If this fails, it will be because...** the new `processMeetingExtraction()` function produces *subtly different* output than the backend's inline implementation. The 30 backend tests pass because they mock at a different layer, but when a real meeting file goes through CLI vs UI, the `staged_item_status` values differ slightly (e.g., edge case around 0.8 confidence threshold) and the UI doesn't recognize CLI-processed files correctly.

**The worst outcome would be...** users trust the CLI workflow, process 10 meetings via daily-winddown skill, then discover in the UI that all their decisions/learnings show as "pending" instead of "approved" — and they can't easily re-approve because the frontmatter is in an inconsistent state. This would require manual file editing to fix.

---

## Recommendations

1. Add a **parity test** in core that validates: given identical input, `processMeetingExtraction()` produces identical output to a snapshot of what the current backend produces.

2. Add a **round-trip test** in CLI: extract → approve → read back → verify frontmatter matches expected structure.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

The plan is solid. Address the test coverage suggestions during implementation to prevent the "subtle difference" failure mode.
