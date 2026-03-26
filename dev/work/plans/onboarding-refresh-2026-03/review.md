## Review: Onboarding Refresh

**Type**: Plan
**Audience**: Builder (internal tooling for developing Areté)
**Reviewer**: Engineering Lead
**Date**: 2026-03-24

### Concerns

1. **Scope creep between phases**: Phase 1 is labeled "quick fixes" (~1hr) but Task 1.4 (Session-Start Context Injection) is an architectural change that introduces a new behavior pattern (automatic context injection at session start). This is more than a "quick fix."
   - Suggestion: Move 1.4 to Phase 2, or create a Phase 1b. Keep Phase 1 purely mechanical fixes (model strings, messaging, file creation).

2. **Dependencies unclear for Phase 2**: Task 2.2 (Getting-Started Skill Overhaul) depends on CLI changes from 2.1 being complete. If the agent needs to "run commands directly," those commands (calendar choice, `--all` flag behavior) must exist first.
   - Suggestion: Explicitly state 2.1 → 2.2 dependency. Add verification step: "Test CLI commands work before updating skill."

3. **Multi-IDE impact not addressed**: Changes to `packages/runtime/rules/cursor/agent-memory.mdc` (Task 1.4) affect Cursor-specific rules. Does Claude Desktop use the same rules? The `packages/runtime/rules/` structure suggests IDE-specific directories.
   - Suggestion: Check if equivalent changes needed in `runtime/rules/claude/` or if rules are shared. Add explicit note about which IDEs are affected.

4. **OAuth flow ambiguity in getting-started skill**: Task 2.2 says agent should "open your browser for Google Calendar auth" but the plan doesn't specify how. Does the skill invoke `open <url>`? Does it use an MCP tool? This is a potential friction point.
   - Suggestion: Specify the mechanism. If uncertain, add a spike task to determine OAuth UX before committing to approach.

5. **Model string format inconsistency**: Task 1.1 shows current models with `anthropic/` prefix but target models without it (`claude-haiku-4-5` vs `anthropic/claude-3-5-haiku-latest`). This may indicate a model identifier format change, or it could be a typo.
   - Suggestion: Verify the correct target format. Check how other parts of the codebase reference models. Ensure consistency.

6. **Testing criteria missing for Phase 1**: Phase 1 is "no plan/PRD needed" but has no explicit verification steps. How do you confirm agent-observations.md is created correctly? How do you verify session-start injection works?
   - Suggestion: Add mini acceptance tests for Phase 1: "After install, run `cat .arete/memory/items/agent-observations.md`" and "Start new session, observe agent references week focus."

7. **Backward compatibility for existing workspaces**: Plan assumes fresh installs but what about existing users? Will `arete update` apply these changes? Will existing workspaces get agent-observations.md?
   - Suggestion: Add explicit note about migration path for existing workspaces, even if it's "not in scope — existing users won't get these changes automatically."

### Strengths

- **Clear problem diagnosis**: The plan traces back to specific issues found during fresh workspace testing (2026-03-24). Evidence-based planning.
- **Well-phased approach**: Quick wins in Phase 1, comprehensive overhaul in Phase 2, aspirational future in Phase 3. Good incremental structure.
- **Core principle stated upfront**: "Both paths should provide similar, complete experience" — this guides design decisions and prevents drift.
- **Parity checklist (2.3)**: Explicitly tracking feature parity between CLI and agent paths prevents gaps.
- **Defers appropriately**: Phase 3 correctly punts to the comprehensive self-guided-onboarding plan rather than reinventing it.
- **Code locations specified**: File paths and line numbers for each change make execution precise.

### Devil's Advocate

**If this fails, it will be because...** the plan conflates "quick fixes" with "architectural changes" in Phase 1. Task 1.4 (session-start context injection) requires modifying agent behavior rules, testing across IDEs, and validating the injection actually happens. If this gets rushed as a "quick fix," it will either not work reliably or introduce subtle bugs that erode trust. The scope creep hides under the "quick fixes" label.

**The worst outcome would be...** shipping Phase 2's getting-started skill overhaul before the CLI commands are solid, resulting in an agent that tells users "I'll configure your calendar" but then fails because the underlying command doesn't work correctly. Users who experience broken onboarding in the first 5 minutes rarely return. This is the highest-stakes path — the agent making promises it can't keep.

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Rationale**: The plan is well-structured and addresses real problems. The concerns are refinements, not blockers. Key suggestions:
1. Move Task 1.4 to Phase 2 (or 1b)
2. Verify model string format before implementing
3. Add explicit 2.1 → 2.2 dependency
4. Clarify multi-IDE impact for rule changes

The plan is ready to proceed if the builder acknowledges these risks. Phase 1 (minus 1.4) can ship immediately; Phase 2 needs the dependency ordering clarified.
