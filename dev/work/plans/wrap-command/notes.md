# `/wrap` Command — Analysis & Detection Requirements

## Analysis Date: 2026-03-08

Merged from auto-documentation planning session.

---

## Why Current Rules Fail

### The Enforcement Gap

Rules exist in `.pi/standards/maintenance.md`, but agents don't follow them reliably because:

**Rules work when:**
- They're in the agent's immediate context (system prompt, role file)
- There's a clear trigger ("after regression → update LEARNINGS.md")
- Someone blocks completion if missing (reviewer)

**Rules fail when:**
- They're in a separate file the agent wasn't told to read
- They require remembering across conversation turns
- No one checks whether they were followed

### Current Enforcement Points

| What | Enforced By | Works? |
|------|-------------|--------|
| LEARNINGS.md after regressions | Reviewer blocks approval | ✅ Yes |
| Memory entry creation | Orchestrator Phase 3 | ⚠️ Sometimes |
| Expertise profile updates | No one | ❌ No |
| Capability catalog updates | No one | ❌ No |
| AGENTS.md sync | No one | ❌ No |

**The pattern:** Documentation is treated as optional cleanup, not part of done-done.

---

## Documentation Inventory (What `/wrap` Should Check)

### Current State (as of 2026-03-08)

| Artifact | Location | Count | Last Updated |
|----------|----------|-------|--------------|
| LEARNINGS.md | 16 locations across codebase | 16 | Mixed (some Mar 8, most Mar 7) |
| Memory entries | `memory/entries/` | 99 | Mar 8 |
| Expertise profiles | `.pi/expertise/*/PROFILE.md` | 4 | Mar 7 (stale) |
| Capability catalog | `dev/catalog/capabilities.json` | 8 capabilities | Mar 4 (stale) |

### LEARNINGS.md Locations

```
.pi/extensions/plan-mode/LEARNINGS.md
.pi/skills/execute-prd/LEARNINGS.md
packages/apps/backend/LEARNINGS.md
packages/apps/web/LEARNINGS.md
packages/cli/src/commands/LEARNINGS.md
packages/core/src/adapters/LEARNINGS.md
packages/core/src/integrations/LEARNINGS.md
packages/core/src/integrations/krisp/LEARNINGS.md
packages/core/src/integrations/notion/LEARNINGS.md
packages/core/src/search/LEARNINGS.md
packages/core/src/services/LEARNINGS.md
packages/runtime/rules/LEARNINGS.md
packages/runtime/skills/LEARNINGS.md
packages/runtime/skills/schedule-meeting/LEARNINGS.md
packages/runtime/tools/LEARNINGS.md
scripts/LEARNINGS.md
```

### Expertise Profiles

```
.pi/expertise/backend/PROFILE.md
.pi/expertise/cli/PROFILE.md
.pi/expertise/core/PROFILE.md
.pi/expertise/web/PROFILE.md
```

---

## Detection Logic (Option C)

### Checklist Items & Detection Method

| Item | Detection Method | Complexity |
|------|------------------|------------|
| Memory entry exists | Check `memory/entries/YYYY-MM-DD_*{plan-slug}*.md` exists | Easy |
| MEMORY.md index updated | Parse MEMORY.md, check for plan slug reference | Easy |
| LEARNINGS.md updated | Compare file mtime vs plan start time for touched directories | Medium |
| Expertise profiles accurate | Cannot auto-detect; prompt for manual confirmation | N/A |
| patterns.md updated | Cannot auto-detect; prompt if architecture tag | N/A |
| AGENTS.md rebuilt | Check mtime of dist/AGENTS.md vs source files | Medium |
| Capability catalog updated | Parse JSON, check for new services/commands from PRD | Hard |
| UPDATES.md entry added | Check for plan slug or date in UPDATES.md | Easy |
| Plan archived | Check plan status field | Easy |

### Detection Inputs

To run detection, `/wrap` needs:
1. **Plan slug** — to find related artifacts
2. **Plan start timestamp** — to compare mtimes
3. **Files touched** — from git diff or PRD task list
4. **PRD tasks** (if exists) — to know what was added (commands, services, etc.)

### Tiered Checklist

Based on plan tags/content:

**Tier 1: All Plans**
- Memory entry exists
- MEMORY.md index updated
- Plan status → complete

**Tier 2: Code Changes**
- All Tier 1 items
- LEARNINGS.md in touched directories

**Tier 3: New Capabilities**
- All Tier 2 items
- AGENTS.md rebuilt (if CLI/skill changes)
- Capability catalog updated

**Tier 4: Architecture Changes**
- All Tier 3 items
- Expertise profiles reviewed
- patterns.md reviewed

---

## Implementation Considerations

### Where to Implement

The `/wrap` command should live in the plan-mode extension alongside `/review`, `/pre-mortem`, `/prd`, `/build`.

File: `.pi/extensions/plan-mode/commands.ts`

### State Requirements

Needs access to:
- Current plan state (`PlanModeState`)
- Filesystem (for mtime checks, file existence)
- Git (for files touched since plan start)
- PRD JSON (if exists, for task list)

### Output Format

```
┌─────────────────────────────────────────────────────┐
│ /wrap — Close-out checklist for: my-feature        │
├─────────────────────────────────────────────────────┤
│ ✅ Memory entry exists                              │
│ ✅ MEMORY.md index updated                          │
│ ❌ LEARNINGS.md: packages/core/src/services/        │
│ ⚠️  Expertise profiles: manual review needed        │
│ ✅ AGENTS.md rebuilt                                │
│ ❌ Capability catalog: missing AIService            │
│ ❌ UPDATES.md entry                                 │
├─────────────────────────────────────────────────────┤
│ 3 items need attention.                            │
│ [F]ill gaps now  [S]kip and archive  [C]ancel      │
└─────────────────────────────────────────────────────┘
```

### Gap Filling

When user chooses "Fill gaps now":
1. For auto-fillable items (UPDATES.md entry): prompt for content
2. For complex items (LEARNINGS.md, catalog): spawn subagent with specific instructions
3. For manual items (profiles, patterns): prompt builder to confirm review

---

## Open Questions

1. **Auto-run at build end?** Should `/build` automatically run `/wrap` checklist when complete, or keep it manual?

2. **Blocking vs advisory?** Should missing items block plan completion, or just warn?

3. **Subagent quality?** Can a subagent reliably update LEARNINGS.md, or does it need builder review?

4. **Scope detection accuracy?** How reliably can we detect "new service added" vs "modified existing service"?

---

## Related Plans

- `auto-documentation` (merged into this plan)
- `review-artifact-consumption` — related gap (pre-execution artifacts not consumed)
