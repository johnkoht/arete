---
title: "/wrap — Post-Execution Close-Out Command"
slug: wrap-command
status: idea
size: small
tags: [plan-mode, dx]
created: 2026-03-02T00:00:00.000Z
updated: 2026-03-02T00:00:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# `/wrap` — Post-Execution Close-Out Command

**Source**: Builder frustration — orchestrator agents do documentation close-out partially or only when explicitly asked

---

## Problem

After a PRD execution completes, there's no enforced mechanism to verify that documentation is actually up to date. The orchestrator is *supposed* to handle this in Phase 3 (holistic review + System Improvements Applied), but in practice:

- It gets skipped or done partially
- The builder has to ask the orchestrator explicitly ("did you update LEARNINGS?")
- Memory entries get created but documentation (AGENTS.md, profiles, patterns.md) may not get updated
- No single place to see what the close-out checklist requires

The gap: execution ends, the conversation closes, and nobody has definitively confirmed documentation is current.

---

## Proposed Solution

A `/wrap` plan-mode command that acts as a structured post-execution close-out. When invoked:

1. **Loads the current plan context** — what was built, which files were touched, what the PRD tasks covered
2. **Runs a close-out checklist** against the plan's state:
   - [ ] Memory entry exists in `memory/entries/`
   - [ ] `MEMORY.md` index updated
   - [ ] LEARNINGS.md updated in all directories with code changes (or explicitly confirmed: no new gotchas)
   - [ ] Expertise profiles checked for accuracy (if architecture changed)
   - [ ] `patterns.md` updated (if new patterns discovered)
   - [ ] AGENTS.md rebuilt if CLI commands or Skills changed (`npm run build:agents:prod`)
   - [ ] `dev/catalog/capabilities.json` updated if new services/tools added
   - [ ] `UPDATES.md` entry added (user-facing release note, 1-3 sentences for GUIDE users)
   - [ ] Plan status set to `complete` with `completed:` timestamp
3. **Prompts for an `UPDATES.md` entry** — user-facing release note for what shipped (1-3 sentences, written for GUIDE mode users, not BUILD)
4. **Reports what's done, what's missing, what needs attention**
5. **Optionally executes the remaining items** (spawn a subagent to fill the gaps)
6. **Archives the plan** or prompts to archive

---

## Design Notes

### Command placement
- `/wrap` in plan mode, mirroring `/review` (pre-execution) and `/pre-mortem` (risk analysis)
- Could also surface as a reminder at end of `/build` — "Run `/wrap` to close out this plan"

### Checklist scope
The checklist should be **tiered by change type**:
- **Docs-only PRD** (e.g. agent-learning-loop): check memory entry + MEMORY.md index only
- **Code PRD, no new services**: add LEARNINGS.md check
- **Code PRD, new service/command**: add AGENTS.md rebuild + catalog check
- **Architecture PRD**: add profiles + patterns.md check

The plan's `tags` and `size` can help infer which tier applies, or it can just run all checks and mark inapplicable items N/A.

### Gap execution
When gaps are found, `/wrap` should offer to spawn a subagent to fill them — e.g. "3 LEARNINGS.md files need updating. Run now?" This avoids the current pattern where the builder asks the orchestrator who then does it incompletely.

### Relationship to execute-prd Phase 3
This doesn't replace Phase 3 — it's a safety net for when Phase 3 is rushed or partial. Think of it as the builder's manual audit trigger.

---

## Acceptance Criteria

1. `/wrap` command available in plan mode when a plan is open
2. Checklist shows actual status (green/red per item) based on filesystem inspection where possible
3. Missing items are actionable (clear instruction or offer to execute)
4. On completion: plan status set to `complete`, plan archived (or prompted)
5. `UPDATES.md` entry written in user-friendly language (not technical — "now you can do X")
6. Works for both PRD-executed plans and direct-execution plans

---

## Related

- `packages/runtime/UPDATES.md` — the file this command writes entries to
- `review-artifact-consumption` plan — related gap (pre-execution artifacts not consumed during build handoff)
- `execute-prd` SKILL.md Phase 3 — what the orchestrator is *supposed* to do; `/wrap` is the enforcement layer
- `maintenance.md` — the protocol being checked; `/wrap` makes it automatic
