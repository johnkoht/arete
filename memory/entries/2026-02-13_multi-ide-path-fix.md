# Multi-IDE Path Fix

**Date**: 2026-02-13  
**Type**: Bug Fix + Documentation  
**Discovered via**: Code review of agent transcript

## Execution Path

- **Size assessed**: Small (bug fix + doc update)
- **Path taken**: Direct execution
- **Decision tree followed?**: Yes (small fix, no pre-mortem needed)
- **Notes**: Issue discovered during transcript review; immediate fix applied.

## The Problem

The tool routing system implementation (2026-02-13_tool-routing-system.md) updated canonical rules in `runtime/rules/` with "either/or" path patterns:

```markdown
.cursor/tools/onboarding/TOOL.md or .claude/tools/onboarding/TOOL.md
```

The Claude adapter (`src/core/adapters/claude-adapter.ts`) transforms `.cursor/` → `.claude/` during transpilation.

**Result after transformation**:
```markdown
.claude/tools/onboarding/TOOL.md or .claude/tools/onboarding/TOOL.md  # Broken!
```

## Root Cause

The agent making the tool routing changes didn't know about the adapter transformation rules. The memory system has guidance about multi-IDE support, but:

1. The guidance wasn't specific enough about path patterns
2. There was no checklist to prompt "did you check multi-IDE impact?"
3. The agent didn't read the adapter code before editing rules

## The Fix

### 1. Fixed Path Patterns (2 files)

Changed "either/or" patterns back to single `.cursor/` paths:

**runtime/rules/pm-workspace.mdc**:
- `├── .cursor/ or .claude/` → `├── .cursor/`
- `.cursor/tools/X or .claude/tools/X` → `.cursor/tools/X`
- `IDE integrations config directory` → `.cursor/integrations/configs/`

**runtime/rules/routing-mandatory.mdc**:
- Removed "or .claude/" from tool path examples

### 2. Added Multi-IDE Consistency Check

New item 6 in "For Autonomous Development" checklist:
> 6. **Check Multi-IDE consistency** - Before editing `runtime/rules/` or `runtime/tools/`, see § Quality Practices item 6

New section in Quality Practices:
> #### 6. Multi-IDE Consistency Check (For Rule and Config Changes)
> 
> **Checklist**:
> - [ ] No "either/or" paths: Don't write `.cursor/X or .claude/X`
> - [ ] No hardcoded IDE names in content
> - [ ] Check adapter transforms
> - [ ] Test mentally: "If this path is transformed, does it still make sense?"

## Why Agents Don't Learn From Memory

This issue highlights a gap: the memory system is **passive** (agents can read it) rather than **active** (something that interrupts workflow).

**Current state**:
- `dev/MEMORY.md` exists with entries
- `dev/collaboration.md` has patterns and corrections
- `agent-memory.mdc` says "read memory before substantive work"
- But agents don't reliably check unless explicitly told

**Improvement applied**:
- Added explicit checklist item for multi-IDE impact
- Checklist is now in the numbered list agents see when they read AGENTS.md § For Autonomous Development
- Cross-reference to detailed guidance in Quality Practices

## Key Pattern (Remember This!)

**Canonical rules use `.cursor/` paths only. The Claude adapter transforms them.**

- ✅ `.cursor/tools/onboarding/TOOL.md` — correct
- ❌ `.cursor/tools/X or .claude/tools/X` — broken after transformation
- ❌ `See the tools README in your IDE config directory` — vague, loses context

**Reference**: `src/core/adapters/claude-adapter.ts` → `transformRuleContent()`

## Learnings

1. **Explicit checklists beat implicit guidance** — Adding item 6 to the numbered list is more likely to be followed than prose in another file.

2. **New features need multi-IDE review** — Any change to `runtime/rules/` or `runtime/tools/` should check adapter impact.

3. **Memory doesn't auto-apply** — Even with good entries, agents need explicit prompts to check them. The checklist approach creates that prompt.

4. **Code review catches this** — The transcript review that found this issue is exactly the kind of second-pass that catches integration problems.

## Files Changed

- `runtime/rules/pm-workspace.mdc` — Fixed 5 "either/or" patterns
- `runtime/rules/routing-mandatory.mdc` — Fixed 2 "either/or" patterns
- `AGENTS.md` — Added item 6 + Multi-IDE Consistency Check section
- `dev/MEMORY.md` — Index entry
