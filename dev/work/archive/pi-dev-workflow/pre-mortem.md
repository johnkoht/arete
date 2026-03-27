# Pre-Mortem: Pi Dev Workflow Migration

## Risk 1: Extension TypeScript Import Resolution

**Problem**: The plan-mode extension imports from `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui`. Pi uses `jiti` to transpile extensions at runtime, which resolves imports from the globally installed Pi package. If Pi is not installed globally or the version mismatches, the extension will fail to load with cryptic import errors.

**Mitigation**: 
- Verify Pi is installed globally before starting Task 3: `which pi && pi --version`
- Pin the expected Pi version in a comment at the top of `index.ts`
- Test extension loading in isolation before Task 6: `pi -e .pi/extensions/plan-mode/index.ts --no-session -p "test"`

**Verification**: Extension loads without errors in Pi startup header during Task 6.

---

## Risk 2: Symlink Relative Path Fragility

**Problem**: Symlinks from `.pi/skills/{name}` to `../../.agents/skills/{name}` depend on exact directory depth. If anyone moves `.pi/` or `.agents/`, symlinks break silently. Pi would report "0 skills discovered" with no error.

**Mitigation**:
- Use `ln -s` with relative paths and immediately verify each with `ls -la .pi/skills/`
- Add a verification step in Task 4: `for d in .pi/skills/*/; do test -d "$d" && echo "OK: $d" || echo "BROKEN: $d"; done`
- Document the symlink relationship in a comment in `.pi/settings.json`

**Verification**: All 7 symlinks resolve (no broken links) and Pi startup shows 7 skills.

---

## Risk 3: APPEND_SYSTEM.md Content Divergence

**Problem**: Dev rules in `.cursor/rules/dev.mdc` and `.cursor/rules/testing.mdc` will continue to evolve. The ported `.pi/APPEND_SYSTEM.md` has no mechanism to stay in sync. Over time, Pi and Cursor developers will have different quality gates or testing requirements.

**Mitigation**:
- Add a header comment in `APPEND_SYSTEM.md`: `<!-- Ported from .cursor/rules/dev.mdc and testing.mdc on 2026-02-16. Check for divergence periodically. -->`
- Add a note to the backlog decision item (`dev/backlog/decisions/cursor-vs-pi-dev-agent.md`): "Check APPEND_SYSTEM.md for divergence from .cursor/rules/ during review"
- Long-term: Consider a shared source format (future work, not this PRD)

**Verification**: APPEND_SYSTEM.md content matches current dev.mdc + testing.mdc at time of creation. Divergence check noted in backlog.

---

## Risk 4: Plan-Mode Extension Adaptation Scope Creep

**Problem**: The Pi plan-mode extension is ~320 lines across two files. Adapting it with pre-mortem references, PRD gateway, execution path decision tree, and quality gate context could balloon the modification scope. Over-customization risks breaking the base extension behavior.

**Mitigation**:
- Keep modifications surgical: only change the injected context strings, not the extension's control flow
- The three additions are all in string templates within `before_agent_start` handler:
  1. Plan mode context: add pre-mortem + PRD gateway text
  2. Execution context: add quality gates reminder
  3. Safe commands: add npm commands to allowlist
- Do NOT modify: toggle logic, todo extraction, widget rendering, session persistence, keyboard shortcuts

**Verification**: Extension still passes basic toggle test (`/plan` enables/disables correctly) and todo extraction works on a numbered plan.

---

## Risk 5: Agent Definition Format Mismatch

**Problem**: The agent definitions in Task 5 are prep for a future subagent extension that hasn't been installed yet. If Pi's subagent extension changes its expected format (frontmatter fields, body conventions), the definitions will need rework.

**Mitigation**:
- Base definitions on the current subagent extension source (`agents.ts` in pi-mono): it expects frontmatter with `name`, `description`, optional `tools` and `model`
- Keep system prompts concise (role description + key responsibilities) rather than copying entire execute-prd skill text
- Note the Pi version/commit these were based on

**Verification**: Frontmatter matches the `AgentConfig` interface from Pi's subagent extension. Format is simple enough that minor changes are easy to adapt.

---

## Risk 6: Git Tracking of .pi/ Directory

**Problem**: `.gitignore` might already have a pattern that catches `.pi/` (e.g., a broad `.*` pattern or explicit `.pi/`). The `.pi/` directory would silently fail to be tracked. Extensions, skills symlinks, and agent definitions would not persist for other contributors.

**Mitigation**:
- Check `.gitignore` first: `grep -n "\.pi" .gitignore` and `grep -n "^\.\*$" .gitignore`
- If `.pi/` is caught by a pattern, add an explicit `!.pi/` negation
- Verify tracking after adding files: `git status .pi/`

**Verification**: `git status` shows `.pi/` files as untracked (ready to add) or tracked after committing.

---

## Risk 7: AGENTS.md Compressed Format Effectiveness

**Problem**: The root `AGENTS.md` uses a pipe-delimited compressed format designed for efficient token usage in Cursor. Pi reads AGENTS.md as plain project context. The compressed format may be harder for Pi's LLM to parse effectively, leading to lower context quality (e.g., Pi not knowing about CLI commands, conventions, or skill locations).

**Mitigation**:
- During Task 6 validation, explicitly test Pi's understanding by asking questions that require AGENTS.md knowledge:
  - "What CLI commands does Arete support?" (tests [CLI] section)
  - "Where are the build skills located?" (tests [Skills] section)
  - "What are the TypeScript conventions?" (tests [Conventions] section)
- If Pi struggles, add key sections to APPEND_SYSTEM.md as supplementary context (Phase 2 follow-up, not this PRD)

**Verification**: Pi correctly answers 3+ AGENTS.md-derived questions during validation.

---

## Summary

Total risks identified: 7
Categories covered: Dependencies (R1), Integration (R2), Scope Creep (R3, R4), Code Quality (R5), State Tracking (R6), Context Gaps (R7)

**Ready to proceed with these mitigations?**
