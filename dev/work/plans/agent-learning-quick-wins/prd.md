# PRD: Agent Learning Quick Wins

**Version**: 1.0
**Status**: Ready
**Date**: 2026-02-21
**Branch**: `feature/agent-learning-quick-wins`
**Depends on**: None (no changes to existing memory system)

---

## 1. Problem & Goals

### Problem

Agents building Areté cause regressions because:

1. **Memory is write-only** — 58+ structured entries exist in `memory/entries/` but agents don't read them at the point of edit. The memory system captures knowledge but doesn't deliver it.
2. **No component-specific knowledge** — nothing tells an agent "here are the gotchas for this module" when it's about to edit files in that module.
3. **Zero automation** — the current system relies entirely on voluntary compliance (agents choosing to read `memory/collaboration.md`, scan `memory/MEMORY.md`). This has proven insufficient.
4. **No component orientation** — no lightweight documentation exists at the component level to help agents understand how things work before making changes.

### Goals

1. **LEARNINGS.md convention**: Establish component-local knowledge files that contain architectural orientation, gotchas, invariants, and pre-edit checklists. Seed 6 files in high-regression areas from real past incidents.
2. **Auto-injection extension**: Build a pi extension that automatically injects `memory/collaboration.md` into every agent session's system prompt, eliminating the voluntary compliance gap for the most valuable memory artifact.
3. **Orchestrator integration**: Update the execute-prd skill so the orchestrator explicitly includes relevant LEARNINGS.md files in subagent task prompts.
4. **Documentation**: Update AGENTS.md sources, conventions, and rules to codify the LEARNINGS.md convention.

### Out of Scope

- Changes to the memory entry system (entries, MEMORY.md, synthesis skills stay as-is)
- External memory packages (pi-memory or similar)
- LEARNINGS.md for every directory (only 6 high-pain areas; new ones created organically after regressions)
- qmd integration for LEARNINGS.md semantic search (future — see `dev/work/plans/memory-system-refactor/plan.md`)
- Session exit auto-summarization
- Full component documentation (LEARNINGS.md provides lightweight orientation, not comprehensive docs)

### Accepted Trade-offs

- **LEARNINGS.md for direct execution is voluntary compliance**: The orchestrator explicitly includes LEARNINGS.md in subagent prompts during PRD execution (the 80% case). For direct execution (small/tiny tasks outside execute-prd), the dev.mdc rule is the only enforcement — behavioral, not mechanical. qmd auto-injection is the future structural fix.
- **dev.mdc / APPEND_SYSTEM.md sync surface increases**: Adding shared rules increases drift risk flagged in capabilities catalog. Mitigated by SYNC comments and checklist item. If shared rules grow beyond ~10, consider a single-source approach.

---

## 2. Pre-Mortem Risks

Full analysis: `dev/work/plans/agent-learning-quick-wins/pre-mortem.md`

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | `before_agent_start` message accumulation | 🔴 High | Use `systemPrompt` return, not `message` |
| 2 | Multi-extension `before_agent_start` conflict | 🟡 Medium | Resolved by systemPrompt fix; test with plan-mode active |
| 3 | LEARNINGS.md seeded with generic content | 🟡 Medium | Concrete quality bar + negative example; builder review gate |
| 4 | Orchestrator LEARNINGS.md inclusion not actionable | 🟡 Medium | Move to "Prepare Context" step with explicit directory inspection |
| 5 | dev.mdc vs APPEND_SYSTEM.md drift | 🟡 Medium | SYNC comments + checklist item; character-level diff in AC |
| 6 | "Nearest parent" traversal undefined | 🟠 Low | Precise traversal definition in rule text |
| 7 | capabilities.json not updated | 🟠 Low | Explicitly in Task 3 AC |

---

## 3. Tasks

### Task 1: Define LEARNINGS.md Format and Add Rules

**Description**: Define the LEARNINGS.md template with 7 sections and add behavioral rules to both `dev.mdc` (Cursor) and `.pi/APPEND_SYSTEM.md` (pi). The rules in APPEND_SYSTEM.md should be compressed (just the 4 behavioral rules, concisely stated) — the full template definition and "NOT for" guidance lives in AGENTS.md sources (Task 4).

**Files to modify**:
- `.cursor/rules/dev.mdc` — add LEARNINGS.md section with template, rules, paths, and "NOT for" guidance
- `.pi/APPEND_SYSTEM.md` — add compressed LEARNINGS.md behavioral rules (4 rules only, with SYNC comment)

**LEARNINGS.md template** (7 sections, each 3-10 lines initially; ~100 line soft cap per file):
1. **How This Works** — 5-10 line architectural orientation (key files, entry points, dependencies)
2. **Key References** — pointers to related source files, tests, docs
3. **Gotchas** — specific things that break and why (incident-anchored)
4. **Invariants** — things that must remain true
5. **Testing Gaps** — what's not covered, what to watch
6. **Patterns That Work** — proven approaches (stub initially)
7. **Pre-Edit Checklist** — specific verification steps before and after changes

**4 behavioral rules** (identical text in both files):
1. Before editing files in a directory, check for LEARNINGS.md in the same directory as the file being edited, then each parent directory up to (but not including) the repository root. Stop at the first found; read it. If editing files in multiple directories, check each.
2. After fixing any bug or regression, add entry to nearest LEARNINGS.md describing what broke, why, and how to avoid it. If no LEARNINGS.md exists nearby and the gotcha is non-obvious, create one.
3. Regression tests should include a comment explaining the failure mode they prevent.
4. When an agent discovers something missing from or inaccurate in a LEARNINGS.md, update it immediately.

**Additional requirements**:
- Add `<!-- SYNC: This section mirrors [other file] §LEARNINGS.md. Update both together. -->` comment to both files
- Add to Skill/Rule Changes checklist in dev.mdc: `[ ] **APPEND_SYSTEM.md sync**: If changing LEARNINGS.md rules, update .pi/APPEND_SYSTEM.md to match (and vice versa)`
- Include "What LEARNINGS.md is NOT for" guidance in dev.mdc (not in APPEND_SYSTEM.md — keep that compressed)
- List the 6 seeded paths in the dev.mdc rule text

**Acceptance Criteria**:
- `dev.mdc` contains: full template (7 sections with size guidance), all 4 rules, "NOT for" guidance, 6 seeded paths, SYNC comment
- `APPEND_SYSTEM.md` contains: all 4 behavioral rules (compressed), SYNC comment
- APPEND_SYSTEM.md sync item added to Skill/Rule Changes checklist
- Diff of the 4 behavioral rules between dev.mdc and APPEND_SYSTEM.md shows identical text
- `npm run typecheck` passes (no build impact)

---

### Task 2: Seed Initial LEARNINGS.md Files

**Description**: Create 6 LEARNINGS.md files in high-regression areas, seeded from real past incidents documented in memory entries and source code. Each file must include a "How This Works" orientation AND actionable, incident-anchored learnings. This is the highest-effort task and requires careful reading of source material.

**Files to create**:

| File | Source Material to Read |
|------|------------------------|
| `.pi/extensions/plan-mode/LEARNINGS.md` | `memory/entries/2026-02-18_plan-mode-ux-learnings.md`, `memory/entries/2026-02-18_planning-system-refinement-learnings.md`, git log for `.pi/extensions/plan-mode/` |
| `packages/core/src/search/LEARNINGS.md` | `packages/core/src/search/providers/qmd.ts`, `packages/core/test/search/providers.test.ts`, `memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md` |
| `packages/core/src/services/LEARNINGS.md` | `packages/core/src/services/index.ts`, `memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md`, `memory/entries/2026-02-07_phase-3-intelligence-services.md` |
| `packages/core/src/integrations/LEARNINGS.md` | `memory/entries/2026-02-11_calendar-provider-macos-alias.md`, `memory/entries/2026-02-11_calendar-integration-ux-and-learnings.md` |
| `packages/cli/src/commands/LEARNINGS.md` | `memory/collaboration.md` (Corrections section — CLI established patterns), `packages/cli/src/commands/*.ts` file structure |
| `packages/runtime/rules/LEARNINGS.md` | `memory/entries/2026-02-13_multi-ide-path-fix.md`, `memory/entries/2026-02-12_rules-architecture-refactor-learnings.md` |

**Quality bar** (include in task prompt for each file):
- ❌ Not acceptable: "The monorepo refactor showed that clean interfaces pay off. Keep SearchProvider swappable."
- ✅ Acceptable: "**Gotcha**: `createQmdProvider()` requires the `qmd` binary installed via Homebrew. CI environments and fresh installs will silently fall back to token search without an error — check `packages/core/src/search/providers/qmd.ts` L34 for the binary call."

**Per-file requirements**:
- "How This Works" must explain: key files, entry points, how the component connects to others, where tests live
- "Key References" must point to relevant source files and test files
- Gotchas/invariants must reference specific file paths, line ranges, or named past incidents
- "Patterns That Work" and "Testing Gaps" may be thin stubs initially
- Follow the template from Task 1

**Acceptance Criteria**:
- 6 LEARNINGS.md files exist at the specified paths
- Each file follows the 7-section template from Task 1
- Each file has a "How This Works" section (5-10 lines)
- Each file has at least 3 concrete gotchas or invariants referencing specific file paths or past incidents
- No file contains generic advice that could appear in any coding guide
- Builder has reviewed and approved each file (builder review gate — present files for approval before marking complete)

---

### Task 3: Build Auto-Injection Pi Extension

**Description**: Create a minimal pi extension at `.pi/extensions/agent-memory/index.ts` that automatically injects `memory/collaboration.md` into every agent session's system prompt. Include unit tests.

**Files to create**:
- `.pi/extensions/agent-memory/index.ts` — the extension (~30-50 lines)
- `.pi/extensions/agent-memory/agent-memory.test.ts` — unit tests

**Implementation requirements**:
- On `session_start`: read `memory/collaboration.md` (via `path.join(process.cwd(), 'memory/collaboration.md')`) and cache content
- On `before_agent_start`: inject cached content into system prompt
- Gracefully handle file-not-found (no error if collaboration.md doesn't exist)

**Critical: Use `systemPrompt`, NOT `message`**:
```typescript
pi.on("before_agent_start", async (event, _ctx) => {
  if (!collaborationContent) return;
  return {
    systemPrompt: event.systemPrompt + "\n\n## Builder Collaboration Profile\n\n" + collaborationContent,
  };
});
```
Rationale: `systemPrompt` is chained across extensions and applied per-turn without persisting in session history. `message` would inject copies into conversation history on every turn and conflict with the plan-mode extension's `before_agent_start` handler.

**Unit tests** (`.pi/extensions/agent-memory/agent-memory.test.ts`):
- Test: graceful handling when `collaboration.md` doesn't exist (no error, no injection)
- Test: content is cached on session_start and available for before_agent_start
- Test: systemPrompt is correctly modified (appended, not replaced)
- Use `node:test` + `node:assert/strict`; mock `fs.readFile`

**Capability registry update**: Add entry to `dev/catalog/capabilities.json`:
```json
{
  "id": "pi-agent-memory-extension",
  "name": "Pi Agent Memory Extension",
  "type": "extension",
  "provenance": "built",
  "status": "active",
  "usageStatus": "active",
  "owner": "build",
  "platform": "pi",
  "isPiCore": false,
  "summary": "Auto-injects memory/collaboration.md into agent system prompt via before_agent_start.",
  "implementationPaths": [".pi/extensions/agent-memory/index.ts"],
  "readBeforeChange": [
    ".pi/extensions/agent-memory/index.ts",
    "memory/collaboration.md",
    ".pi/APPEND_SYSTEM.md"
  ]
}
```

**Acceptance Criteria**:
- Extension loads without errors in a new pi session
- New pi session's system prompt includes `## Builder Collaboration Profile` header with collaboration.md content
- If collaboration.md is missing, extension silently does nothing (no error, no injection)
- Extension works correctly when plan-mode extension is also active (both inject without conflict — plan-mode uses `message`, agent-memory uses `systemPrompt`)
- Unit tests pass: `tsx --test '.pi/extensions/agent-memory/agent-memory.test.ts'`
- `dev/catalog/capabilities.json` updated with `pi-agent-memory-extension` entry
- `npm run typecheck` passes

---

### Task 4: Update AGENTS.md Sources and Execute-PRD

**Description**: Update documentation sources and the execute-prd skill to codify the LEARNINGS.md convention and ensure orchestrators include LEARNINGS.md in subagent prompts.

**Files to modify**:
- `.agents/sources/builder/memory.md` — add LEARNINGS.md section
- `.agents/sources/builder/conventions.md` — add LEARNINGS.md to commit workflow
- `.agents/skills/execute-prd/SKILL.md` — add LEARNINGS.md lookup to "Prepare Context" step

**memory.md changes**: Add a new section explaining:
- The LEARNINGS.md convention (what it is, why it exists)
- The 7-section template with per-section size guidance
- The 4 behavioral rules
- "What it's NOT for" guidance
- The 6 seeded paths
- How LEARNINGS.md relates to memory entries (complementary, not overlapping)

**conventions.md changes**: Add to the "Before Committing" workflow:
- After regression fixes, check for LEARNINGS.md updates

**execute-prd SKILL.md changes**: Add to the "Prepare Context" step (step 9 of the execution loop):
```markdown
**Pre-task LEARNINGS.md check** (Orchestrator, before crafting subagent prompt):
For each file the subagent will edit, check for LEARNINGS.md in the same
directory and one level up. If found, add to "Context - Read These Files First":
  `packages/core/src/services/LEARNINGS.md` — component gotchas and invariants
```

**Rebuild**: Run `npm run build:agents:dev` to regenerate AGENTS.md from sources.

**Acceptance Criteria**:
- `.agents/sources/builder/memory.md` contains LEARNINGS.md section with template, rules, paths, and "NOT for" guidance
- `.agents/sources/builder/conventions.md` mentions LEARNINGS.md in commit workflow
- `.agents/skills/execute-prd/SKILL.md` has LEARNINGS.md lookup in the "Prepare Context" step (not as a generic footer)
- `npm run build:agents:dev` succeeds
- Generated `AGENTS.md` contains LEARNINGS.md references

---

### Task 5: Verification and Close-Out

**Description**: Verify all artifacts work together and create a memory entry documenting the new conventions.

**Verification checks**:
1. `npm run typecheck` passes
2. `npm test` passes (full suite)
3. Grep verify: `rg "SYNC.*LEARNINGS" .cursor/rules/dev.mdc .pi/APPEND_SYSTEM.md` returns hits in both files
4. Grep verify: `rg "LEARNINGS" .agents/skills/execute-prd/SKILL.md` returns the "Prepare Context" addition
5. All 6 LEARNINGS.md files exist: `ls .pi/extensions/plan-mode/LEARNINGS.md packages/core/src/search/LEARNINGS.md packages/core/src/services/LEARNINGS.md packages/core/src/integrations/LEARNINGS.md packages/cli/src/commands/LEARNINGS.md packages/runtime/rules/LEARNINGS.md`
6. capabilities.json contains agent-memory entry: `grep "agent-memory" dev/catalog/capabilities.json`
7. Extension test passes: `tsx --test '.pi/extensions/agent-memory/agent-memory.test.ts'`
8. Diff of behavioral rules in dev.mdc vs APPEND_SYSTEM.md shows no differences

**Memory entry**: Create `memory/entries/2026-02-21_agent-learning-quick-wins.md` documenting:
- What changed (LEARNINGS.md convention, auto-injection extension, execute-prd integration)
- The 6 seeded files and their content quality
- Any surprises from seeding
- Execution path taken

**Update index**: Add line to `memory/MEMORY.md`.

**Acceptance Criteria**:
- All 8 verification checks pass
- Memory entry created at `memory/entries/2026-02-21_agent-learning-quick-wins.md`
- `memory/MEMORY.md` index updated with new entry
- No regressions in existing tests

---

## 4. Dependencies

```
Task 1 (rules/template)
    ↓
Task 2 (seed files) ──→ Task 4 (docs/execute-prd)
    ↓                         ↓
Task 3 (extension) ──────→ Task 5 (verification)
```

- Task 1 must complete first (template needed for seeding)
- Tasks 2 and 3 can run in parallel after Task 1
- Task 4 depends on Task 2 (needs to reference seeded paths)
- Task 5 depends on all other tasks

---

## 5. Success Criteria (Overall)

1. A new pi session automatically includes `memory/collaboration.md` in its system prompt (zero voluntary compliance)
2. 6 component-local LEARNINGS.md files exist with real, incident-anchored content
3. The execute-prd orchestrator explicitly includes LEARNINGS.md in subagent task prompts
4. Rules in dev.mdc and APPEND_SYSTEM.md instruct agents to read LEARNINGS.md before editing and update after regressions
5. Zero changes to existing memory system
6. All quality gates pass (typecheck, tests)
