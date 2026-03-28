# Pre-Mortem: Audit Skill

Generated: 2026-03-28

---

## Risk 1: Skill Pattern Inconsistency

**Problem**: Existing skills in `.pi/skills/` follow specific patterns (frontmatter schema, orchestrator structure, tool references). If the audit skill deviates from these patterns, it will be harder to maintain and may confuse the agent when loading it.

**Mitigation**: 
- Before writing SKILL.md, read and follow patterns from:
  - `.pi/skills/execute-prd/SKILL.md` (orchestrator + subagent pattern)
  - `.pi/skills/ship/SKILL.md` (another orchestrator pattern)
- Match frontmatter schema exactly: `name`, `description`, `category: build`, `work_type: development`
- Include Tool Reference section with `subagent` tool syntax

**Verification**: Compare audit SKILL.md structure against execute-prd SKILL.md before finalizing.

---

## Risk 2: Subagent Context Gaps

**Problem**: Domain expert subagents need specific context to audit their domains effectively. Fresh subagents won't know file paths, expertise profile locations, or capabilities.json structure unless explicitly told.

**Mitigation**:
- In orchestrator.md, provide explicit file lists for each domain expert:
  - core-expert: "Read `.pi/expertise/core/PROFILE.md`, `dev/catalog/capabilities.json`, then scan `packages/core/src/services/`"
  - cli-expert: "Read `.pi/expertise/cli/PROFILE.md`, check `packages/cli/src/commands/` against capabilities.json"
- Include the manifest.yaml path so agents know the source of truth for what to audit

**Verification**: Each subagent prompt in orchestrator.md must include a "Read first" file list.

---

## Risk 3: Conflicting Edits to capabilities.json

**Problem**: If core-expert and cli-expert both try to update capabilities.json, they may produce conflicting edits or duplicate entries. The orchestrator receives text reports but capabilities.json requires precise JSON.

**Mitigation**:
- Domain experts write proposed additions to their `/tmp/audit-{domain}.md` reports as exact JSON snippets
- Domain experts do NOT directly edit capabilities.json
- Orchestrator collects all proposals, deduplicates, merges, and applies as single edit
- Use approval gate before applying capabilities.json changes

**Verification**: Orchestrator.md must state: "Experts report proposed capabilities.json changes but do not edit it directly."

---

## Risk 4: AGENTS.md Skill Listing Registration

**Problem**: Plan step 5 says "Add skill to AGENTS.md [Skills] section (or verify auto-generation picks it up)." But AGENTS.md is hand-written (script only generates dist/AGENTS.md). The [Skills] section lists `runtime/skills` as root, but audit goes in `.pi/skills/`. The skill may not be discoverable.

**Mitigation**:
- Check how existing `.pi/skills/` (execute-prd, ship, hotfix) are listed — they appear in `<available_skills>` block injected by pi, not in [Skills] section
- Confirm pi auto-discovers `.pi/skills/*/SKILL.md` (don't need manual AGENTS.md edit)
- If manual registration needed, add to appropriate section

**Verification**: After creating skill, run `pi skill list` or check if skill appears in pi's skill routing.

---

## Risk 5: manifest.yaml Schema Drift

**Problem**: The documentation manifest (what to audit) could become stale itself. If manifest.yaml says to audit files that no longer exist, or misses new docs, the audit will be incomplete.

**Mitigation**:
- Design manifest.yaml to use glob patterns where possible (e.g., `packages/core/src/**/LEARNINGS.md`) rather than explicit file lists
- Include "auto-discover" entries: "Check packages/*/README.md exists"
- The audit skill itself can flag when manifest entries don't match reality

**Verification**: manifest.yaml should have a "last_verified" field and the audit skill should update it.

---

## Risk 6: Report Aggregation Complexity

**Problem**: Orchestrator must collect 5 subagent reports, extract structural changes requiring approval, merge them into a single report, and write to `dev/work/audits/{date}.md`. This is complex string/file manipulation that could lose information or format poorly.

**Mitigation**:
- Create a report template (`templates/audit-report.md`) with clear sections per domain
- Have each subagent write to `/tmp/audit-{domain}.md` in a consistent format
- Orchestrator reads all 5, extracts sections, and composes final report using template
- For approval items: create a separate `/tmp/audit-approvals.md` that's easy to scan

**Verification**: Template must define exact section headers; subagent prompts must require that format.

---

## Risk 7: No Expert Agent Definitions

**Problem**: Plan references "core-expert", "cli-expert", etc. but no `.pi/agents/core-expert.md` exists. Existing agents are: developer, engineering-lead, orchestrator, reviewer, product-manager, gitboss.

**Mitigation**: Two options:
1. **Create expert agents**: Add `.pi/agents/core-expert.md` etc. with domain-specific instructions
2. **Reuse developer with profile injection**: Use `developer` agent but inject expertise profile in the task prompt

Recommend option 2 (profile injection) for MVP — simpler, no new agent definitions, follows pattern from execute-prd.

**Verification**: Orchestrator.md should show spawning `developer` agent with expertise profile content injected, not a non-existent `core-expert` agent.

---

## Risk 8: Validation Runs May Be Expensive

**Problem**: Steps 6-7 run the audit skill to validate it. If the skill actually spawns 5 subagents and does real file edits, validation could make unintended changes or consume many tokens.

**Mitigation**:
- Add `--dry-run` flag to audit skill for validation: report findings but don't apply fixes
- Step 6 (`/audit --scope cli`) should use `--dry-run`
- Step 7 full audit should also use `--dry-run` first, then run for real

**Verification**: SKILL.md must document `--dry-run` flag behavior.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | Skill pattern inconsistency | Code Quality | Medium |
| 2 | Subagent context gaps | Context Gaps | High |
| 3 | Conflicting capabilities.json edits | Integration | High |
| 4 | AGENTS.md registration | Dependencies | Low |
| 5 | manifest.yaml schema drift | State Tracking | Medium |
| 6 | Report aggregation complexity | Integration | Medium |
| 7 | No expert agent definitions | Dependencies | Medium |
| 8 | Validation runs may be expensive | Scope Creep | Low |

**Total risks identified**: 8
**Categories covered**: Context Gaps, Code Quality, Integration, Dependencies, State Tracking, Scope Creep
**Critical risks**: 0
**High severity**: 2 (Risk 2, Risk 3)

---

## Mitigations Applied to Plan

Based on pre-mortem analysis, the following should be incorporated:

1. **Use profile injection** (Risk 7): Spawn `developer` agent with expertise profile injected, not create new expert agents
2. **Add --dry-run flag** (Risk 8): Support validation without side effects
3. **Single-point capabilities.json edits** (Risk 3): Orchestrator owns all capabilities.json changes
4. **Explicit file lists in prompts** (Risk 2): Each domain expert gets "Read first" file list
