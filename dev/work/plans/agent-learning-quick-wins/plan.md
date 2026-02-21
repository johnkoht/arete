---
title: Agent Learning Quick Wins
slug: agent-learning-quick-wins
status: building
size: medium
created: 2026-02-21T03:30:00.000Z
updated: 2026-02-21T04:05:52.557Z
steps: 5
tags: []
has_review: true
has_prd: true
---

# Agent Learning Quick Wins

## Problem Statement

Agents building Areté keep causing regressions because:
1. **Memory is write-only** — 58 structured entries exist but agents don't read them at the point of edit
2. **No component-specific knowledge** — nothing tells an agent "here are the gotchas for this module"
3. **Zero automation** — current system relies on voluntary compliance (agents choosing to read memory files)
4. **No component orientation** — no lightweight documentation exists at the component level to help agents understand how things work before making changes

## Vision

Two changes that solve the immediate regression problem without touching the memory system:

1. **LEARNINGS.md** — Component-specific technical knowledge (orientation, gotchas, invariants, checklists) that lives next to code. Read before editing, updated after regressions.
2. **Auto-injection pi extension** — Lightweight extension that automatically injects `memory/collaboration.md` into every session, removing the voluntary compliance gap for the most valuable memory artifact.

## Success Criteria

- Agents receive collaboration profile automatically every session (no voluntary compliance)
- Component-specific knowledge exists at the point of edit for high-regression areas
- Agents have lightweight architectural orientation for each component (how it works, key files, dependencies)
- Regression fixes produce LEARNINGS.md entries (enforced by rule)
- Orchestrator includes relevant LEARNINGS.md in subagent task prompts
- Zero changes to existing memory system (entries, MEMORY.md, skills all untouched)

---

## Plan

**1. Define LEARNINGS.md format and add rules to dev.mdc**

- Create LEARNINGS.md template with these sections (each section 3-10 lines initially; grow only after incidents demonstrate the need; if a file exceeds ~100 lines total, it has become documentation — split or trim):
  - **How This Works** — 5-10 line architectural orientation (key files, entry points, dependencies, how pieces connect)
  - **Key References** — pointers to related source files, tests, docs, and AGENTS.md sections
  - **Gotchas** — specific things that break and why
  - **Invariants** — things that must remain true
  - **Testing Gaps** — what's not covered, what to watch
  - **Patterns That Work** — proven approaches for this component (optional stub initially — fill when patterns emerge from incidents)
  - **Pre-Edit Checklist** — specific verification steps before and after changes

- Add rules to `dev.mdc` and `.pi/APPEND_SYSTEM.md` (add `<!-- SYNC: This section mirrors [other file] §LEARNINGS.md. Update both together. -->` comment to both files):
  1. "Before editing files in a directory, check for LEARNINGS.md in the same directory as the file being edited, then each parent directory up to (but not including) the repository root. Stop at the first LEARNINGS.md found; read it. If editing files in multiple directories, check each."
  2. "After fixing any bug or regression, add entry to nearest LEARNINGS.md describing what broke, why, and how to avoid it. If no LEARNINGS.md exists nearby and the gotcha is non-obvious, create one."
  3. "Regression tests should include a comment explaining the failure mode they prevent."
  4. "When an agent discovers something missing from or inaccurate in a LEARNINGS.md, update it immediately."

- Add to the Skill/Rule Changes checklist in dev.mdc:
  - `[ ] **APPEND_SYSTEM.md sync**: If changing LEARNINGS.md rules, update .pi/APPEND_SYSTEM.md to match (and vice versa)`

- Add guidance on what LEARNINGS.md is NOT for:
  - Not for architecture decisions or rationale (that's memory entries)
  - Not for TODO items or future work (that's scratchpad/backlog)
  - Not for full API documentation (that's code comments/README)
  - Not for general coding standards (that's AGENTS.md/conventions)

- List the six seeded LEARNINGS.md paths in the rule text so agents know where to look: `.pi/extensions/plan-mode/`, `packages/core/src/search/`, `packages/core/src/services/`, `packages/core/src/integrations/`, `packages/cli/src/commands/`, `packages/runtime/rules/`.

- AC: 
  - `dev.mdc` and `APPEND_SYSTEM.md` contain all 4 rules (enumerated: traversal rule, regression-update rule, regression-test-comment rule, update-on-discovery rule)
  - LEARNINGS.md template documented with all 7 sections including per-section size guidance (~3-10 lines each, ~100 line soft cap)
  - "What it's NOT for" guidance included
  - SYNC comments present in both files
  - APPEND_SYSTEM.md sync item added to Skill/Rule Changes checklist
  - Diff of LEARNINGS.md rule sections in dev.mdc and APPEND_SYSTEM.md shows no differences

**2. Seed initial LEARNINGS.md files (6 files, from real pain)**

Only where we have real knowledge from past regressions — not blanket coverage. Each file must include the "How This Works" orientation section AND actionable learnings.

| Location | Source material |
|---|---|
| `.pi/extensions/plan-mode/LEARNINGS.md` | Read: `memory/entries/2026-02-18_plan-mode-ux-learnings.md`, `memory/entries/2026-02-18_planning-system-refinement-learnings.md`, git log for `.pi/extensions/plan-mode/` |
| `packages/core/src/search/LEARNINGS.md` | Read: `packages/core/src/search/providers/qmd.ts`, `packages/core/test/search/providers.test.ts`, `memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md` |
| `packages/core/src/services/LEARNINGS.md` | Read: `packages/core/src/services/index.ts` (createServices factory), `memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md`, `memory/entries/2026-02-07_phase-3-intelligence-services.md` |
| `packages/core/src/integrations/LEARNINGS.md` | Read: `memory/entries/2026-02-11_calendar-provider-macos-alias.md`, `memory/entries/2026-02-11_calendar-integration-ux-and-learnings.md` |
| `packages/cli/src/commands/LEARNINGS.md` | Read: `memory/collaboration.md` Corrections section (CLI established patterns), `packages/cli/src/commands/*.ts` file structure |
| `packages/runtime/rules/LEARNINGS.md` | Read: `memory/entries/2026-02-13_multi-ide-path-fix.md`, `memory/entries/2026-02-12_rules-architecture-refactor-learnings.md` |

**Quality bar** — each entry must be component-specific and incident-anchored. Include a negative example in the task prompt:
- ❌ Not acceptable (memory-entry style): "The monorepo refactor showed that clean interfaces pay off. Keep SearchProvider swappable."
- ✅ Acceptable (LEARNINGS.md style): "**Gotcha**: `createQmdProvider()` requires the `qmd` binary installed via Homebrew. CI environments and fresh installs will silently fall back to token search without an error — check `packages/core/src/search/providers/qmd.ts` L34 for the binary call."

For each file:
- The "How This Works" section must explain: key files, entry points, how the component connects to others, and where tests live
- The "Key References" section must point to relevant source files and test files
- The gotchas/invariants must reference specific file paths, line ranges, or named past incidents — not generic advice
- "Patterns That Work" and "Testing Gaps" may be thin stubs initially — that's fine, fill them when incidents demonstrate the need
- Builder reviews and approves each file before step 2 is marked complete

- AC: 6 LEARNINGS.md files exist with real, specific content; each has "How This Works" orientation + at least 3 concrete gotchas or invariants referencing specific file paths or past incidents. Builder has reviewed and approved each file with the question: "Are these component-specific and incident-anchored, or could any appear in a generic coding guide?"

**3. Build lightweight pi extension for auto-injection**

Create `.pi/extensions/agent-memory/index.ts` — a minimal extension that:
- On `session_start`: reads `memory/collaboration.md` (resolved via `path.join(process.cwd(), 'memory/collaboration.md')`) and caches the content
- On `before_agent_start`: injects cached content into the system prompt
- Respects file-not-found gracefully (no error if collaboration.md doesn't exist)
- ~30-50 lines of TypeScript

**Critical implementation detail**: Use `systemPrompt` return from `before_agent_start`, NOT `message` return:
```typescript
pi.on("before_agent_start", async (event) => {
  if (!collaborationContent) return;
  return {
    systemPrompt: event.systemPrompt + "\n\n## Builder Collaboration Profile\n\n" + collaborationContent,
  };
});
```
Rationale: `systemPrompt` is chained across extensions and applied per-turn without persisting in session history. `message` would inject a copy of collaboration.md into conversation history on every turn (30 turns = 30 copies = 30-60K wasted tokens) and would conflict with the plan-mode extension that also uses `before_agent_start`. The collaboration profile is a background instruction, not a conversation message.

- AC:
  - New pi session's system prompt includes `## Builder Collaboration Profile` header with collaboration.md content (verify via pi debug output or by asking the agent to describe the builder's working style — it should cite specifics)
  - Extension loads without errors
  - If collaboration.md is missing, extension silently does nothing
  - Extension works correctly when plan-mode extension is also active (both inject without conflict)
  - `dev/catalog/capabilities.json` updated with new `agent-memory-extension` entry (type: extension, provenance: built, implementationPaths: [`.pi/extensions/agent-memory/index.ts`], readBeforeChange pointing to `memory/collaboration.md`)

**4. Update AGENTS.md sources and execute-prd for LEARNINGS.md convention**

- `.agents/sources/builder/memory.md` — add LEARNINGS.md section explaining the convention, format (all 7 sections with size guidance), rules, "what it's NOT for", and the 6 seeded paths
- `.agents/sources/builder/conventions.md` — add LEARNINGS.md to the commit workflow ("check for LEARNINGS.md updates after regression fixes")
- `.agents/skills/execute-prd/SKILL.md` — update the task prompt preparation to include explicit LEARNINGS.md lookup:
  ```
  **Pre-task LEARNINGS.md check** (Orchestrator, before crafting subagent prompt):
  For each file the subagent will edit, check for LEARNINGS.md in the same 
  directory and one level up. If found, add to "Context - Read These Files First":
    `packages/core/src/services/LEARNINGS.md` — component gotchas and invariants
  ```
  This goes in the "Prepare Context" step of the execution loop, not as a generic footer note.
- Rebuild: `npm run build:agents:dev`
- AC: AGENTS.md includes LEARNINGS.md convention; execute-prd has explicit LEARNINGS.md lookup instructions in the context preparation step; `npm run build:agents:dev` succeeds

**5. Verification and close-out**

- Start new pi session → confirm collaboration.md is injected in system prompt (check with plan-mode also active)
- Open a file in `packages/core/src/services/` → confirm agent reads LEARNINGS.md (per dev.mdc rule)
- Simulate a regression fix → confirm agent adds entry to nearest LEARNINGS.md
- Run `npm run typecheck && npm test` → confirm nothing broken
- Grep verify: `rg "SYNC.*LEARNINGS" .cursor/rules/dev.mdc .pi/APPEND_SYSTEM.md` returns hits in both files
- Create `memory/entries/YYYY-MM-DD_agent-learning-quick-wins-learnings.md` documenting the new conventions and any surprises from seeding
- AC: All verification checks pass; memory entry created

---

## What We're NOT Doing

- Not changing the memory entry system (entries, MEMORY.md, synthesis skills all stay as-is)
- Not adopting pi-memory or any external memory package
- Not creating LEARNINGS.md for every directory (only 6 high-pain areas; new ones created organically after regressions)
- Not building qmd integration for LEARNINGS.md (future enhancement — see memory-system-refactor plan)
- Not building session exit auto-summarization (future — memory refactor territory)
- Not writing full component documentation (LEARNINGS.md "How This Works" provides lightweight orientation; comprehensive docs are a separate concern)

## Accepted Trade-offs

- **LEARNINGS.md for direct execution is voluntary compliance**: The orchestrator explicitly includes LEARNINGS.md in subagent prompts during PRD execution (the 80% case). For direct execution (small/tiny tasks outside execute-prd), the dev.mdc rule is the only enforcement — behavioral, not mechanical. This is acceptable for quick-wins; qmd auto-injection is the future fix.
- **dev.mdc / APPEND_SYSTEM.md sync surface increases**: Adding 4 shared rules increases drift risk flagged in capabilities catalog. Mitigated by SYNC comments and checklist item. If shared rules grow beyond ~10, consider a single-source approach.

## Risks

1. **LEARNINGS.md seeded with shallow/generic content** — mitigation: explicit source file lists per component; negative example in task prompt; builder reviews each file with "incident-anchored?" quality question; AC requires specific file paths or past incidents
2. **Agents ignore LEARNINGS.md despite the rule** — mitigation: orchestrator explicitly includes LEARNINGS.md in subagent prompts (PRD execution path); rule covers direct execution; qmd indexing is a future enhancement
3. **Pi extension uses wrong injection pattern** — mitigation: plan explicitly specifies `systemPrompt` return (not `message`); code example provided; rationale documented (token accumulation + multi-extension conflict)
4. **LEARNINGS.md files become stale** — mitigation: mandatory update rule after regression fixes; agents update when they notice inaccuracies; 5-10 line "How This Works" limit reduces maintenance burden; starts with only 6 files
5. **"How This Works" section drifts from reality** — mitigation: keep it to 5-10 lines (less to maintain); agents update when they notice the architecture has changed
6. **dev.mdc / APPEND_SYSTEM.md drift** — mitigation: SYNC comments in both files; checklist item in Skill/Rule Changes section; diff verification in step 1 AC
7. **capabilities.json not updated** — mitigation: explicitly included in step 3 AC

## Size Estimate

- **Medium** (5 steps, ~15 files created/modified)
- Steps 1-2 are markdown writing (low risk)
- Step 3 is a small pi extension (~30-50 lines, low risk — design decision resolved in plan)
- Step 4 is documentation updates
