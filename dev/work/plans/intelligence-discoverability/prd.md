# PRD: Intelligence Discoverability for Skill Authors & Agents

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-03-03  
**Depends on**: Skill integration hooks (complete), intelligence services (complete)

---

## 1. Problem & Goals

### Problem

Areté has a powerful intelligence layer (context injection, briefing assembly, memory search, entity resolution, people intelligence) but it's under-discoverable in three ways:

1. **Custom skill authors** don't know these services exist. The "Creating Your Own Skills" section is 4 lines with no mention of intelligence services. A community skill author writing a SKILL.md has no guidance on how to tap into `arete brief`, `arete context`, `arete resolve`, etc.

2. **AGENTS.md (GUIDE)** lists intelligence services as a reference table but doesn't tell agents *when* to proactively reach for them. An agent seeing "help me understand our onboarding strategy" has no guidance saying "this is a knowledge query — run `arete brief` or `arete context` first."

3. **`requires_briefing: true`** exists as frontmatter but `prepareForSkill()` has zero non-test callers. The `pm-workspace.mdc` rule mentions it but the instruction isn't strong enough — agents don't consistently auto-brief before community skills.

### Goals

1. **Skill Authoring Guide**: Create `_authoring-guide.md` with copy-paste intelligence recipe blocks that any skill author can drop into their SKILL.md
2. **AGENTS.md Intelligence Guidance**: Add proactive "when to use" heuristics to the compressed GUIDE so agents know which tool to reach for based on user intent
3. **Strengthen `requires_briefing` instructions**: Make the pm-workspace rule's briefing instruction unambiguous so agents reliably auto-brief for skills that opt in
4. **Update Skills README**: Point skill authors to the authoring guide from the "Creating Your Own Skills" section

### Out of Scope

- Automatic CLI-level briefing execution (code change to routing path) — keeping instruction-based for consistency
- Changes to core intelligence service code
- New CLI commands

---

## 2. Deliverables

### T1: Skill Authoring Guide

Create `packages/runtime/skills/_authoring-guide.md` — a companion to the existing `_integration-guide.md`.

**Sections**:

1. **What Intelligence Services Are Available** — Overview table: service → command → what it searches → when to use
2. **Intelligence Recipes** — Copy-paste blocks for common patterns:
   - **Quick Context Gathering** — `arete context --for` recipe with instructions for SKILL.md
   - **Full Briefing** — `arete brief --for` recipe (recommended for complex skills)
   - **People Resolution** — `arete resolve` + `arete people show` recipe
   - **Memory Search** — `arete memory search` recipe for decisions/learnings
   - **Commitments** — `arete commitments list --person` recipe
   - **Entity Relationships** — combining resolve + people show + commitments
3. **Frontmatter Reference** — Document `intelligence:`, `requires_briefing:`, `primitives:`, `work_type:` with examples
4. **Complete Example** — A minimal but realistic SKILL.md that uses intelligence services (e.g., a "stakeholder update" skill that resolves people, gathers context, and searches memory)
5. **Integration with Output** — Cross-reference to `_integration-guide.md` for the output side (where to save, indexing)

**Acceptance Criteria**:
- File exists at `packages/runtime/skills/_authoring-guide.md`
- All 5 sections present with working copy-paste recipe blocks
- Each recipe includes: the CLI command, what it returns, how to use the output in a skill workflow, and a paste-ready markdown block
- Complete example skill demonstrates at least 3 intelligence services
- Cross-references `_integration-guide.md` for output hooks

### T2: AGENTS.md Intelligence Guidance

Update `.agents/sources/guide/intelligence.md` to add proactive agent guidance.

**Changes**:

1. **Add "High-Value Patterns" section** near the top — before the detailed service docs. This is the "playbook" agents should internalize:
   - "User asks about a topic/project/person" → run `arete brief --for` (searches everything)
   - "User wants to prep for a meeting or task" → run `arete brief --for` with `--skill` if known
   - "User asks what decisions were made" → `arete memory search` (explicit memory only)
   - "User mentions a person by name" → `arete resolve` then `arete people show --memory`
   - "Starting any community/installed skill" → check `requires_briefing` in frontmatter, run `arete brief` if true
   - "After creating/editing workspace files" → run `arete index` to keep search current

2. **Add guidance annotations to each service section** — one sentence at the top of each service explaining *when the agent should proactively use it* (not just what it does)

3. **Update the compressed `[Intelligence]` section** in the pipe-delimited output — add a `|high_value:` line with the key heuristics that survive compression

**CRITICAL**: The `compressIntelligence()` function in `scripts/build-agents.ts` is **hardcoded** — it ignores the intelligence.md content entirely and returns a static string. You MUST update both `intelligence.md` (full source) AND `compressIntelligence()` in `build-agents.ts` (compressed output).

**Acceptance Criteria**:
- "High-Value Patterns" section exists with at least 6 patterns
- Each existing service section has a "When to proactively use this" annotation
- `compressIntelligence()` in `scripts/build-agents.ts` updated to include high-value guidance
- Compressed `[Intelligence]` section includes `|high_value:` or equivalent guidance line
- `npm run build` regenerates dist/AGENTS.md with the new content
- Guidance is actionable (tells agent what to do), not descriptive (tells agent what exists)

### T3: Update Shared CLI Commands

Update `.agents/sources/shared/cli-commands.md` to strengthen the intelligence decision tree already there.

**Changes**:

1. **Promote the decision tree** — the `tool_selection` line is good but it's compressed. Add a brief "Intelligence Quick Reference" callout before the detailed command list that makes the high-value patterns unmissable
2. **Add `arete people show <slug> --memory`** to the intelligence section (currently only in People section) — this is a high-value command that returns relationship health, stances, open items, and commitments inline
3. **Add brief descriptions of what each command actually searches** (the scope distinction we just discovered) so agents understand context searches everything vs memory searches 3 files

**Acceptance Criteria**:
- Decision tree / quick reference is prominent (not buried after command list)
- `arete people show --memory` appears in intelligence guidance section
- Scope descriptions are present (what each command searches)
- Compressed pipe-delimited output preserves the guidance

### T4: Strengthen `requires_briefing` in pm-workspace Rule

Update `packages/runtime/rules/cursor/pm-workspace.mdc` (and mirror to `claude-code/`) to make the briefing instruction for `requires_briefing: true` unambiguous.

**Changes**:

1. **Make the instruction mandatory-sounding** — change from "assemble a primitive briefing" to explicit "You MUST run `arete brief` before executing any skill where `requires_briefing: true`" with the same emphasis as the skill-routing mandate
2. **Add the check to the mandatory workflow** — in the "When the user asks for PM work" section, add a step between routing and execution: "Check skill frontmatter for `requires_briefing: true`. If set, run `arete brief --for <task> --skill <name> --json` and present the briefing before starting the workflow."
3. **Add a brief note for community skills** — "Community/third-party skills installed via `arete skill install` should set `requires_briefing: true` to get automatic context injection. If a community skill doesn't set this flag, consider running `arete brief` anyway for complex tasks."

**Acceptance Criteria**:
- Rule uses MUST language for `requires_briefing: true` skills
- Briefing step is integrated into the mandatory workflow sequence (not a separate section)
- Both `cursor/` and `claude-code/` versions are updated identically
- Guidance for community skills without the flag is present

### T5: Update Skills README

Update `packages/runtime/skills/README.md` "Creating Your Own Skills" section.

**Changes**:

1. **Expand from 4 lines to a proper section** with:
   - Basic steps (create folder, add SKILL.md) — keep what's there
   - **New**: "Tap into Areté Intelligence" paragraph explaining that skills can use intelligence services to gather context, search memory, and resolve entities — with link to `_authoring-guide.md`
   - **New**: "Configure Output Integration" paragraph with link to `_integration-guide.md`
   - **New**: Quick frontmatter reference showing the key fields (`intelligence:`, `requires_briefing:`, `primitives:`, `work_type:`, `category:`)
2. **Add "See Also" links** at the bottom pointing to both guides

**Acceptance Criteria**:
- "Creating Your Own Skills" section expanded with intelligence + integration guidance
- Links to both `_authoring-guide.md` and `_integration-guide.md`
- Frontmatter quick reference present
- Existing content preserved (folder creation, SKILL.md, .arete-meta.yaml)

---

## 3. Task Dependencies

```
T1 (authoring guide) ──┐
                        ├── T5 (README update, links to T1)
T2 (AGENTS.md guide) ──┤
                        │
T3 (CLI commands) ──────┘
T4 (pm-workspace rule) ── independent
```

T1 should be done before T5 (T5 links to it). T2, T3, T4 are independent. T1 is the largest task.

---

## 4. Quality Gates

- `npm run build` succeeds (regenerates dist/AGENTS.md)
- `npm run typecheck` passes (no code changes expected, but verify)
- `npm test` passes (no code changes expected, but verify)
- Manual review: read the authoring guide recipes and verify they reference real, working CLI commands with correct flags
- Manual review: read the compressed AGENTS.md output and verify intelligence guidance survives compression
