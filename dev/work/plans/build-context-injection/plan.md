---
title: Build Context Injection
slug: build-context-injection
status: planned
size: medium
tags: []
created: 2026-03-28T05:54:31.003Z
updated: 2026-03-28T06:05:53.520Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 4
---

# Build Context Injection

## Problem

The 4-layer context stack defines expertise profiles (Layer 4) that should be injected into subagents based on the domain they're working in. Currently:

| Agent | Profiles Injected? |
|-------|-------------------|
| Developer (task execution) | ✅ Yes |
| Reviewer (pre-work sanity check) | ❌ No |
| Reviewer (code review) | ❌ No |
| Engineering-lead (ship final review) | ❌ No |

This means developers know the invariants when building, but reviewers don't know them when reviewing. The reviewer agent is explicitly designed to use profiles ("When loaded with an expertise profile, use it to verify the developer's changes respect domain invariants...") but execute-prd never passes them.

This contradicts the documented correction in `collaboration.md`:
> "Always inject expertise profiles for reviews — ALWAYS read the corresponding `.pi/expertise/{domain}/PROFILE.md` and inject the relevant sections"

## Success Criteria

- Reviewer subagents receive expertise profiles matching the task's touched files
- /ship final review receives expertise profiles matching what the PRD touched
- Existing profile selection logic (packages/core → core profile, etc.) is reused, not duplicated
- Profile injection is limited to key sections to avoid context bloat

## Pre-Mortem Mitigations (Incorporated)

| Risk | Mitigation |
|------|------------|
| Inconsistent profile selection | Reference Step 10's logic — don't duplicate heuristics |
| Ship Phase 4.2 lacks profile info | Use `git diff --name-only` to determine touched packages |
| Profile content becomes stale | Document trade-off in LEARNINGS (acceptable for now) |
| Reviewer prompt too long | Inject key sections only: Invariants, Anti-Patterns, Key Abstractions |
| Edit location ambiguity | Search by step name ("Reviewer: Pre-Work"), not step number |

Plan:

1. **Update execute-prd Reviewer Pre-Work** — Add expertise profile injection to the reviewer pre-work sanity check prompt.
   - Find step by searching for "Reviewer: Pre-Work Sanity Check" (not by step number)
   - Add instruction: "Include the same expertise profile(s) selected for the developer prompt"
   - Specify: "Include only key sections: Invariants, Anti-Patterns, Key Abstractions (~100-200 lines max)"
   - Do NOT duplicate the profile selection heuristics — reference the developer prompt selection
   - Update example prompt to include profile context
   - AC: Reviewer pre-work prompt template references developer's profile selection and specifies key sections only

2. **Update execute-prd Reviewer Code Review** — Add expertise profile injection to the reviewer code review prompt.
   - Find step by searching for "Reviewer: Code Review" (not by step number)
   - Add instruction: "Include the same expertise profile(s) the developer received"
   - Specify: "Include only key sections: Invariants, Anti-Patterns, Key Abstractions"
   - Update example prompt to include profile context
   - AC: Code review prompt template references developer's profile selection and specifies key sections only

3. **Update /ship Phase 4.2 (Final Review)** — Add expertise profile injection to the engineering-lead holistic review.
   - Find Phase 4.2 by searching for "Final Review" or "Holistic Review"
   - Add step: "Determine which packages were touched: `git diff --name-only main...HEAD | grep packages/`"
   - Add step: "Load corresponding expertise profiles based on packages touched"
   - Specify: "Include only key sections: Invariants, Anti-Patterns, Key Abstractions"
   - Update subagent prompt to include profile context
   - AC: Final review uses git diff to determine profiles and specifies key sections only

4. **Add LEARNINGS.md entry** — Document this gap and fix in `.pi/skills/LEARNINGS.md` to prevent regression.
   - Add gotcha: "Reviewer and final review subagents must receive expertise profiles (key sections only)"
   - Add gotcha: "Reference developer's profile selection — don't duplicate selection heuristics"
   - Add note: "Profiles are point-in-time snapshots. If profiles change mid-PRD, re-run final review with updated context."
   - Reference this as a violation of the 4-layer context stack
   - AC: LEARNINGS.md contains entry about profile injection for reviews with all three gotchas

## Out of Scope

- Changing which profiles exist
- Modifying the profile selection heuristics (file → profile mapping)
- Adding new expertise domains
- Full profile injection (only key sections)

## Size

**Small** (4 steps, all markdown edits to skill files)