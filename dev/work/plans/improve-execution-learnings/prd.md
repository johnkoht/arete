# PRD: Improve execute-prd Based on Learnings

## Goal

Incorporate proven patterns from recent PRD executions (ai-config, reimagine-v2, multi-ide-support) into the execute-prd skill so future orchestrators benefit from institutional knowledge without reading all memory entries.

## Background

The execute-prd skill has been used successfully for multiple PRDs, but learnings are scattered across memory entries. Key patterns like phantom task detection (which saved 80% work on reimagine-v2) exist only in memory entries. This PRD consolidates those learnings into the skill itself.

## Success Criteria

- Orchestrators get phantom task detection guidance before wasting work on already-implemented features
- The "grumpy reviewer" adversarial mindset is codified and repeatable
- DRY guidance is specific enough to prevent constant duplication issues  
- LEARNINGS.md reflects actual execution metrics from recent PRDs
- SKILL.md grows by <60 lines total (per pre-mortem risk mitigation)

## Out of Scope

- Changes to `.pi/agents/reviewer.md` — backwards compat guidance goes in orchestrator's prompt, not reviewer's permanent definition
- Renumbering SKILL.md steps — use sub-bullets to avoid cascading changes
- Creating new LEARNINGS.md sections beyond proven patterns and metrics

---

## Tasks

### Task 0: Pre-Flight Structure Verification

Verify SKILL.md structure matches plan assumptions before making any edits.

**Acceptance Criteria**:
- [ ] Confirm Step 2 = "Read and Internalize the PRD" (Phase 0)
- [ ] Confirm Step 6 = risk categories table (Phase 1)
- [ ] Confirm Step 7 = mitigations section (Phase 1)
- [ ] Confirm Step 10 = subagent prompt template (Phase 2)
- [ ] Confirm Step 13 = reviewer code review dispatch (Phase 2)
- [ ] Document current structure in progress.md
- [ ] Read LEARNINGS.md to confirm table format

---

### Task 1: Add High-Impact Improvements to SKILL.md

Add phantom task detection and grumpy reviewer mindset — the two highest-impact patterns from learnings.

**Acceptance Criteria**:
- [ ] Step 2 ("Read and Internalize the PRD") has sub-bullets for phantom task detection:
  - Check if proposed files already exist
  - Check if proposed functionality already works
  - Verify PRD is current vs codebase state
  - If phantom tasks detected, surface to builder with options
- [ ] Phantom detection guidance focuses on VERIFICATION mindset, not just file existence
- [ ] Phantom detection cites source: "reimagine-v2 PRD (2026-03-07) — 5/6 phantom tasks, ~80% work saved"
- [ ] Reviewer role section has "Mindset" paragraph with:
  - "Grumpy senior engineer" persona description
  - Adversarial questions: "What if this already exists?", "What about legacy data?"
  - Source citation: "reimagine-v2 PRD"
- [ ] Lines added in this task: <30

---

### Task 2: Add Medium-Impact Improvements to SKILL.md

Add DRY constant extraction, backwards compatibility check, build scripts risk, and shared utility mitigation.

**Acceptance Criteria**:
- [ ] Step 10 (Reuse & Design section) has bullet: "Extract constants for repeated structures..."
  - Cites: ai-config PRD (2026-03-08)
- [ ] Step 13 (reviewer code review prompt) includes backwards compatibility guidance:
  - "For data-writing code: Does implementation handle legacy formats? What about existing data?"
  - Cites: reimagine-v2 PRD
- [ ] Step 6 (risk categories table) has new row:
  - "Build Scripts | Do referenced scripts exist? | Verify before putting in prompts"
  - Cites: ai-config PRD
- [ ] Step 7 (mitigations) has "Shared Utility Mitigation" section after Documentation Impact:
  - Task 0 approach OR explicit import instruction
  - Cites: execute-prd LEARNINGS.md
- [ ] Lines added in this task: <30

---

### Task 3: Update LEARNINGS.md with New Patterns and Metrics

Add proven patterns and update execution metrics table.

**Acceptance Criteria**:
- [ ] Pattern 4 added: "Phantom task detection before execution"
  - Evidence: reimagine-v2-orchestration (2026-03-07) — 5/6 phantom tasks, ~80% saved
- [ ] Pattern 5 added: "Backwards compatibility for data-writing code"
  - Evidence: reimagine-v2-orchestration — priority toggle needed dual format
- [ ] Pattern 6 added: "Extract constants for repeated structures"
  - Evidence: ai-config (2026-03-08) — duplicate aiConfig objects
- [ ] Metrics table has new rows:
  - ai-config (2026-03-08): 5/5, 100%, 3 iterations, +75 tests, 8/8 mitigated
  - reimagine-v2 (2026-03-07): 1/6*, 100%, 1 iteration, n/a, 9/9 mitigated (*5/6 phantom)
- [ ] Table format matches existing (columns, alignment)

---

## Pre-Mortem Risks

| Risk | Mitigation |
|------|------------|
| Structure mismatch | Task 0 verifies before any edits |
| Content bloat | Line limits in each task AC (<30 per task, <60 total) |
| Formatting inconsistency | Match existing style from target sections |
| Missing citations | Every addition must cite source entry |
| Table format mismatch | Visual verification in Task 3 |

## References

- Source learnings: `memory/entries/2026-03-08_ai-config-learnings.md`
- Source learnings: `memory/entries/2026-03-07_reimagine-v2-orchestration-learnings.md`
- Target file: `.pi/skills/execute-prd/SKILL.md`
- Target file: `.pi/skills/execute-prd/LEARNINGS.md`
- Detailed notes: `dev/work/plans/improve-execution-learnings/notes.md`
