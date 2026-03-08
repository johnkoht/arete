# Pre-Mortem: INT-0 Service Normalization

**Date**: 2026-03-08
**Plan**: Intelligence Tuning — INT-0 (Foundation)
**Size**: Medium (4 subtasks)

---

## Risk Analysis

### Category 1: Dependency Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI Config plan not complete | Medium | Critical | INT-0.2 requires AIService. If not ready, skip CLI command and do INT-0.1/0.3/0.4 only. |
| AIService API changes | Low | High | Check AI Config plan for finalized API before INT-0.2. |

### Category 2: Type Compatibility Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type mismatch core vs backend | Confirmed | Medium | Create explicit adapter `adaptBackendExtractionToCore()`. Don't try to unify types in INT-0. |
| ActionItem structure changes | Low | Medium | Core's `ActionItem` is stable. Document any changes in LEARNINGS.md. |

### Category 3: Regression Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backend output format changes | Medium | High | Test before/after with same meeting file. Compare staged section format. |
| Existing meeting files break | Low | Medium | Preserve backward compat in `updateMeetingContent()` — existing `## Summary` detection. |
| CLI LEARNINGS.md conflict | Low | Low | Update LEARNINGS.md explicitly to note architecture change. |

### Category 4: Test Coverage Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Insufficient formatter tests | Medium | Medium | Eng lead specified 8 test cases. Enforce as AC. |
| CLI extract tests missing | Medium | Medium | Require 12+ test cases per eng lead. |
| Integration test gaps | Medium | High | Add end-to-end test: CLI extract → check file content. |

### Category 5: Architecture Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skill-CLI fallback complexity | Medium | Medium | Keep skill simple: try CLI, if fails → agent does it. Don't over-engineer. |
| Prompt drift (core vs backend) | Confirmed | Low | Acceptable for INT-0. Will consolidate in INT-1. |

### Category 6: UX Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| "No AI configured" error confusing | Low | Medium | Clear actionable error: "Run `arete onboard` to configure AI providers." |
| `--stage` flag unclear | Low | Low | Add help text: "Write staged sections to meeting file for review". |

---

## Highest Risks (Top 3)

1. **AI Config dependency** — If not complete, INT-0.2 is blocked.
   - **Mitigation**: Verify AIService is available before starting INT-0.2. If not, reorder to do INT-0.1/0.3/0.4 first.

2. **Backend output format regression** — Users rely on staged section format.
   - **Mitigation**: Snapshot test with real meeting file. Compare output before/after.

3. **Type adapter complexity** — Bridging backend's flat strings to core's structured ActionItems.
   - **Mitigation**: Keep adapter minimal. Don't try to change backend's extraction logic — just format output.

---

## Assumptions

1. **AI Config plan delivers `AIService` with `call()` and `isConfigured()`** — This is the interface we'll use.
2. **Core's `MeetingIntelligence` type is stable** — We're building on it, not changing it.
3. **Backend's extraction logic doesn't need to change** — Just formatting moves to core.
4. **Cursor agents can run CLI commands** — Skill assumes `arete meeting extract` is callable.

---

## Go/No-Go Criteria

Before starting INT-0.2 (CLI command):
- [ ] Verify `AIService` exists in `@arete/core`
- [ ] Verify `AIService.call()` and `AIService.isConfigured()` APIs match plan
- [ ] Verify AI credentials can be loaded from `~/.arete/credentials.yaml`

Before starting INT-0.3 (Backend):
- [ ] INT-0.1 complete and exported from core
- [ ] Type adapter design finalized

---

## Rollback Plan

If INT-0 causes issues:
1. Backend can revert to its own `formatStagedSections()` (git revert)
2. CLI `extract` command can be feature-flagged or removed
3. Skill can revert to agent-only extraction

None of INT-0 changes are destructive to user data. All changes are to code, not data.

---

## Recommended Execution Order

Given the risks:

1. **INT-0.1** first (lowest risk, enables others)
2. **Verify AI Config** before INT-0.2
3. **INT-0.2** (CLI) — test thoroughly
4. **INT-0.3** (Backend) — snapshot test before/after
5. **INT-0.4** (Skill) — documentation only, lowest risk

---

## Sign-off

- [ ] Risks reviewed and mitigations acceptable
- [ ] Dependencies verified (AI Config status)
- [ ] Ready to proceed
