# PRD: Rules Architecture Refactor

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-13  
**Depends on**: None

---

## 1. Problem & Goals

### Problem

The current rules architecture has two overlapping rule locations:

- `.cursor/rules/` - loaded by Cursor in the dev repo (BUILDER context)
- `runtime/rules/` - canonical source shipped to end users (GUIDE context)

This causes:

1. **Sync drift** - edits to one don't propagate to the other
2. **Accidental deletions** - agents don't know which files should exist where
3. **Mode complexity** - rules have internal BUILDER/GUIDE checks that add overhead
4. **Irrelevant noise** - PM rules (meeting prep, tours) load when building Areté
5. **AGENTS.md bloat** - 1,103 lines mixing architecture, BUILDER practices, and GUIDE examples

### Goals

1. **Separate BUILDER and GUIDE rules** - No rule file exists in both locations (except `arete-vision.mdc` which rarely changes)
2. **Eliminate mode checks** - Rules no longer need internal BUILDER/GUIDE conditionals
3. **Consolidate build practices** - Move quality practices from AGENTS.md to `dev.mdc` (auto-loaded by Cursor)
4. **Trim AGENTS.md** - Focus on architecture documentation, remove GUIDE content and build practices
5. **Clear ownership** - `.cursor/rules/` = BUILDER only (6 files), `runtime/rules/` = GUIDE only (unchanged)

### Out of Scope

- Modifying `runtime/rules/` content (those are canonical GUIDE rules)
- Adding new rules or features
- Changing the transpilation system
- Restructuring `dev/` directory

---

## 2. Architecture Decisions

### Rule Separation

After refactor:

| Location | Purpose | Files |
|----------|---------|-------|
| `.cursor/rules/` | BUILDER rules for dev repo | 5 files: dev.mdc, testing.mdc, plan-pre-mortem.mdc, arete-vision.mdc, agent-memory.mdc |
| `runtime/rules/` | GUIDE rules shipped to users | 8 files (unchanged) |

### Accepted Duplication

`arete-vision.mdc` exists in both locations. This is acceptable because:
- Small file (~90 lines), rarely changes
- Applies to both contexts (vision guides all work)
- Sync burden is low

### Content Migration

| Content | From | To |
|---------|------|-----|
| Execution Path Decision Tree | AGENTS.md | dev.mdc |
| Quality Practices for Any Execution | AGENTS.md | dev.mdc |
| Documentation Planning Checklist | AGENTS.md | dev.mdc |
| GUIDE mode examples (Flow: meeting prep, etc.) | AGENTS.md | Removed (exists in pm-workspace.mdc) |
| BUILDER vs GUIDE context section | AGENTS.md | Simplified to 3 lines |

---

## 3. User Stories

1. As a developer building Areté, I only see BUILDER-relevant rules in `.cursor/rules/` — no PM workflow rules cluttering my context.
2. As a developer, I find all quality practices (pre-mortem, quality gates, code review checklist, memory capture) in `dev.mdc` — not scattered across AGENTS.md.
3. As a developer, when I read AGENTS.md, I see architecture documentation — not a mix of how-to guides for end users.
4. As a developer, rules no longer contain mode checks — each rule is written for its specific context.

---

## 4. Requirements

### 4.1 Delete GUIDE-only rules from `.cursor/rules/`

Delete these 5 files that are GUIDE-only (PM workspace rules):
- `pm-workspace.mdc`
- `routing-mandatory.mdc`
- `qmd-search.mdc`
- `context-management.mdc`
- `project-management.mdc`

**Acceptance criteria:**
- Files are deleted from `.cursor/rules/`
- `runtime/rules/` equivalents are unchanged
- 6 files remain in `.cursor/rules/`

### 4.2 Edit agent-memory.mdc (BUILDER-only version)

Rewrite to contain only BUILDER memory management:
- Keep: Memory locations (dev/entries/, dev/MEMORY.md, dev/collaboration.md)
- Keep: Leverage build memory guidance
- Keep: Entry format and observation triggers
- Keep: Synthesis triggers for collaboration.md
- Remove: GUIDE mode memory architecture (.arete/memory/)
- Remove: All .arete/memory/items/ references
- Remove: GUIDE-specific triggers and formats
- Remove: Mode routing logic

**Acceptance criteria:**
- File is BUILDER-only with no GUIDE content
- No mode checks or conditionals
- Covers build memory, entries, collaboration profile

### 4.3 Mode rule (removed)

The redundant mode rule was removed — this repo IS builder mode. No separate mode file in `.cursor/rules/`.

### 4.4 Expand dev.mdc with quality practices

Add sections from AGENTS.md:
- **Execution Path Decision Tree** - Tiny/Small/Medium-Large decision logic
- **Quality Practices for Any Execution**:
  - Pre-mortem (when, how, template reference)
  - Quality Gates (typecheck, test commands)
  - Code Review Checklist (6 points)
  - Build Memory Capture (when, how, format)
  - Reuse and Avoid Duplication
  - Multi-IDE Consistency Check
- **Documentation Planning Checklist**

**Acceptance criteria:**
- All quality practices content is in dev.mdc
- dev.mdc is ~200-250 lines (expanded from ~85)
- Content is actionable and well-organized
- References to other files (templates, skills) are preserved

### 4.5 Trim AGENTS.md

**Remove entirely:**
- "Context: BUILDER vs GUIDE" section (2-3 lines replacement)
- `AGENT_MODE` references
- "How the System Operates (Production Flow)" section (GUIDE examples)
- "For Autonomous Development" section (moved to dev.mdc)
- "Quality Practices for Any Execution" section (moved to dev.mdc)
- "Execution Path Decision Tree" (moved to dev.mdc)
- "Documentation Planning Checklist" (moved to dev.mdc)

**Keep:**
- Architecture overview (What Areté Is)
- High-Level Features
- Key Systems documentation (1-12)
- Technology Stack and Coding Conventions
- Common Patterns (adding integrations, skills, CLI)
- Troubleshooting for Agents
- Test Data section
- Future Concepts

**Add:**
- Simple "Context" section (2-3 lines: this is dev repo, see dev.mdc)
- "Rules Architecture" section (table showing the BUILDER/GUIDE split)

**Acceptance criteria:**
- AGENTS.md is significantly smaller (~700-800 lines vs 1,103)
- No GUIDE-specific content or examples
- No build practices (all in dev.mdc)
- Has new Rules Architecture section
- Architecture documentation preserved

### 4.6 Update .gitignore comment

Update the comment about `.cursor/rules/`:

```
# .cursor/rules/ contains BUILDER-only rules for this dev repo.
# These are NOT copies of runtime/rules/ — they are separate files.
# runtime/rules/ contains GUIDE rules shipped to end users.
```

**Acceptance criteria:**
- Comment clarifies the rule separation
- Existing ignore patterns unchanged

### 4.7 Update references to moved content

Search for and update any references to sections that moved:
- "For Autonomous Development" → "dev.mdc § Quality Practices"
- "Quality Practices for Any Execution" → "dev.mdc § Quality Practices"
- "Execution Path Decision Tree" → "dev.mdc § Execution Path"
- References to agent-memory.mdc GUIDE sections → remove or update

**Acceptance criteria:**
- No broken references to removed sections
- Updated references point to correct locations

---

## 5. Task Breakdown

### Task 1: Delete GUIDE-only rules

- Delete 5 files from `.cursor/rules/`: pm-workspace.mdc, routing-mandatory.mdc, qmd-search.mdc, context-management.mdc, project-management.mdc
- Verify 6 files remain

**Acceptance criteria:**
- [ ] 5 files deleted
- [ ] `ls .cursor/rules/` shows exactly 6 files

### Task 2: Edit agent-memory.mdc

- Rewrite as BUILDER-only memory management
- Remove all GUIDE content and mode checks
- Keep build memory locations, entry format, observation triggers, synthesis triggers

**Acceptance criteria:**
- [ ] No GUIDE content (.arete/memory/, etc.)
- [ ] No mode checks or conditionals
- [ ] Covers dev/entries/, dev/MEMORY.md, dev/collaboration.md

### Task 3: (superseded — mode rule removed)

The mode rule was removed in dev-cleanup-phase-1.

### Task 4: Expand dev.mdc

- Add Execution Path Decision Tree
- Add Quality Practices for Any Execution (6 subsections)
- Add Documentation Planning Checklist
- Organize for readability

**Acceptance criteria:**
- [ ] Contains Execution Path Decision Tree
- [ ] Contains all 6 Quality Practices subsections
- [ ] Contains Documentation Planning Checklist
- [ ] File is ~200-250 lines

### Task 5: Trim AGENTS.md

- Remove "Context: BUILDER vs GUIDE" (replace with 3 lines)
- Remove "How the System Operates (Production Flow)"
- Remove "For Autonomous Development"
- Remove "Quality Practices for Any Execution"
- Remove "Execution Path Decision Tree"
- Remove "Documentation Planning Checklist"
- Add simple "Context" section
- Add "Rules Architecture" section

**Acceptance criteria:**
- [ ] ~700-800 lines (down from 1,103)
- [ ] No GUIDE examples or content
- [ ] No build practices
- [ ] Has Rules Architecture section
- [ ] Architecture docs preserved

### Task 6: Update .gitignore

- Update comment about `.cursor/rules/`

**Acceptance criteria:**
- [ ] Comment clarifies BUILDER-only rules
- [ ] Ignore patterns unchanged

### Task 7: Update references

- Search for references to moved sections
- Update or remove broken references

**Acceptance criteria:**
- [ ] No broken references to removed sections
- [ ] Updated references point to dev.mdc

### Task 8: Verify and commit

- Run `ls .cursor/rules/` to confirm 6 files
- Run `npm run typecheck`
- Run `npm test`
- Commit with message: "refactor: separate BUILDER and GUIDE rules, consolidate build practices in dev.mdc"

**Acceptance criteria:**
- [ ] 6 files in `.cursor/rules/`
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Commit created

---

## 6. Dependencies Between Tasks

```
Task 1 (delete rules) → Task 2 (edit agent-memory) → Task 3 (superseded)
                                                   ↓
Task 4 (expand dev.mdc) ← content from AGENTS.md ← Task 5 (trim AGENTS.md)
                                                   ↓
Task 6 (gitignore) → Task 7 (references) → Task 8 (verify/commit)
```

Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Note: Tasks 4 and 5 are interrelated — content moves from AGENTS.md to dev.mdc. Execute together or extract content first.

---

## 7. Testing Strategy

- No code changes, so unit tests won't change
- Run `npm run typecheck` to catch any TypeScript issues (unlikely)
- Run `npm test` to ensure test suite still passes
- Manual verification: `ls .cursor/rules/` shows 6 files

---

## 8. Success Criteria

- `.cursor/rules/` contains exactly 5 files: dev.mdc, testing.mdc, plan-pre-mortem.mdc, arete-vision.mdc, agent-memory.mdc
- `runtime/rules/` unchanged (8 files)
- `dev.mdc` contains all quality practices and is auto-loaded by Cursor
- AGENTS.md is significantly smaller (~700-800 lines), focused on architecture
- No broken references to moved content
- Typecheck and tests pass
