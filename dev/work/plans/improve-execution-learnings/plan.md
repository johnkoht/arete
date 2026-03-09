---
title: Improve execute-prd Based on Learnings
slug: improve-execution-learnings
status: draft
size: small
tags: []
has_pre_mortem: true
updated: 2026-03-09T04:00:17.497Z
has_review: true
---

# Plan: Improve execute-prd Based on Learnings

**Size**: Small (3 steps)
**Type**: Refactor (documentation/skill improvement)
**Files**: 2 (`.pi/skills/execute-prd/SKILL.md`, `.pi/skills/execute-prd/LEARNINGS.md`)

## Problem Statement

The execute-prd skill has accumulated learnings from recent PRD executions (ai-config, reimagine-v2, multi-ide-support) that aren't yet incorporated into the skill itself. Key patterns like phantom task detection (which saved 80% work on reimagine-v2) and the "grumpy reviewer" mindset exist only in memory entries, not in the skill that future orchestrators will read.

## Success Criteria

- Orchestrators running execute-prd get phantom task detection guidance before wasting work
- The effective "grumpy reviewer" pattern is codified and repeatable
- DRY guidance is specific enough to prevent constant duplication issues
- LEARNINGS.md reflects actual execution metrics and proven patterns
- **SKILL.md grows by <60 lines total** (per pre-mortem)

## Pre-Mortem Risks & Mitigations

| Risk | Mitigation | Verification |
|------|------------|--------------|
| **Structure mismatch** — Step numbers in notes.md may not match current SKILL.md | Verify structure before ANY edits; confirm Step 2, 6, 7, 10, 13 match expectations | Document current structure at execution start |
| **Content bloat** — SKILL.md already 600+ lines, adding more creates cognitive overload | Keep each addition to 5-10 lines; use bullets not paragraphs; integrate into existing sections | Total growth <60 lines |
| **Formatting inconsistency** — New content uses different markdown conventions | Sample existing style from target section before inserting; match exactly | Visual scan of each edit area |
| **Missing citations** — Additions become generic advice without evidence | Every pattern must cite source entry + specific metric | Grep for citations after edit |
| **Table format mismatch** — New LEARNINGS.md rows break table rendering | Read current table format, match columns and alignment exactly | Visual verification |

## Plan

### Step 0: Pre-Flight Verification (MANDATORY)

Before making any edits:
1. Read SKILL.md lines 100-350 (core workflow steps)
2. Confirm step numbers match notes.md expectations:
   - Step 2 = "Read and Internalize the PRD"
   - Step 6 = risk categories table
   - Step 7 = mitigations section
   - Step 10 = subagent prompt template
   - Step 13 = reviewer code review dispatch
3. Read LEARNINGS.md to confirm table format
4. If structure differs, update approach before proceeding

### Step 1: Update SKILL.md with high-impact improvements

Add the two highest-impact improvements from learnings:

**1a. Phantom Task Detection** — Add as sub-bullets under existing Step 2 ("Read and Internalize the PRD"):
- Check if proposed files already exist
- Check if proposed functionality already works  
- Verify PRD is current vs codebase state
- If phantom tasks detected, surface to builder with options (skip/verify/proceed)
- **Focus on verification, not just `ls -la`** — existence check + functionality check
- **Cite source**: reimagine-v2 PRD (2026-03-07) — 5/6 phantom tasks detected, saved ~80% work

**1b. Grumpy Reviewer Mindset** — Add paragraph after the Reviewer role description:
- "Grumpy senior engineer who doesn't trust anything" persona
- Ask adversarial questions: "What if this already exists?", "What about legacy data?"
- **Cite source**: reimagine-v2 PRD — caught 5 phantom tasks + backwards compat issue

**AC**:
- [ ] Step 2 has phantom detection sub-bullets with both existence AND functionality verification
- [ ] Reviewer section includes mindset paragraph with specific adversarial questions
- [ ] Both additions include evidence citations
- [ ] Total lines added: <30

### Step 2: Update SKILL.md with medium-impact improvements

**2a. DRY Constant Extraction** (Step 10, Reuse & Design section):
- Add: "Extract constants for repeated structures: if you use the same config object, schema, or data structure more than once, extract to a named constant"
- **Cite**: ai-config PRD (2026-03-08) — duplicate aiConfig objects caught in review

**2b. Backwards Compatibility Check** (Step 13, reviewer dispatch prompt):
- Add guidance for data-writing code: handle legacy formats, ask "what about existing data?"
- **Cite**: reimagine-v2 PRD — priority toggle needed both old (`[x]`) and new (`- [x]`) formats

**2c. Build Scripts Risk** (Step 6, risk categories table):
- Add row: "Build Scripts | Do referenced scripts exist? | Verify before putting in prompts"
- **Cite**: ai-config PRD — referenced non-existent `build:agents:dev` script

**2d. Shared Utility Mitigation** (Step 7, after Documentation Impact Mitigation):
- If two tasks need same helper, either add Task 0 to create it first OR explicitly tell Task 2 to import from Task 1
- **Cite**: execute-prd LEARNINGS.md (existing pattern)

**AC**:
- [ ] Step 10 Reuse & Design has constant extraction bullet
- [ ] Step 13 reviewer prompt includes backwards compat check for data-writing code
- [ ] Step 6 risk table has Build Scripts row
- [ ] Step 7 has Shared Utility Mitigation section
- [ ] All additions include evidence citations
- [ ] Total lines added: <30

### Step 3: Update LEARNINGS.md with new patterns and metrics

**3a. Add proven patterns** (after existing pattern #3):
- Pattern 4: Phantom task detection before execution
  - Evidence: reimagine-v2-orchestration (2026-03-07) — 5/6 tasks phantom, ~80% work saved
- Pattern 5: Backwards compatibility for data-writing code
  - Evidence: reimagine-v2-orchestration — priority toggle needed dual format support
- Pattern 6: Extract constants for repeated structures
  - Evidence: ai-config (2026-03-08) — duplicate aiConfig objects caught in review

**3b. Update metrics table**:
- Add ai-config (2026-03-08): 5/5, 100%, 3 iterations, +75 tests, 8/8 mitigated
- Add reimagine-v2 (2026-03-07): 1/6*, 100%, 1 iteration, n/a tests, 9/9 mitigated
- Note: *5/6 tasks were phantom

**AC**:
- [ ] Patterns 4-6 exist with evidence citations
- [ ] Metrics table has 5 entries (3 existing + 2 new)
- [ ] Table format matches existing (columns, alignment)

## Out of Scope

- Changes to `.pi/agents/reviewer.md` — The backwards compat guidance goes in the orchestrator's prompt to the reviewer, not in the reviewer's permanent definition. Can be a follow-up if warranted.
- Renumbering SKILL.md steps — Use sub-bullets to avoid cascading changes.
- Creating new LEARNINGS.md sections beyond proven patterns and metrics.

## Review Feedback Incorporated

From review.md:
1. ✅ Using sub-bullets under Step 2 instead of "2.5" to avoid renumbering
2. ✅ Added pre-execution verification to Step 2 (now Step 0)
3. ✅ Explicitly scoped out reviewer.md changes
4. ✅ Phantom detection focuses on verification, not just file existence
5. ✅ Devil's advocate concern (skill too long) — mitigated by keeping additions concise and focused

From pre-mortem.md:
1. ✅ Added Step 0 for structure verification
2. ✅ Added line count limits to each step AC
3. ✅ Added citation requirements to all additions
4. ✅ Added table format verification for LEARNINGS.md
