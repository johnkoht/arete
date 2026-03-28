---
title: Build Context Injection
slug: build-context-injection
status: building
size: medium
tags: []
created: 2026-03-28T05:54:31.003Z
updated: 2026-03-28T06:08:02.469Z
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
- Profile injection works for profiles with different structures (core vs cli)

## Pre-Mortem Mitigations (Incorporated)

| Risk | Mitigation |
|------|------------|
| Inconsistent profile selection | Reference Step 10's logic — don't duplicate heuristics |
| Ship Phase 4.2 lacks profile info | Use `git diff --name-only` to determine touched packages |
| Profile content becomes stale | Document trade-off in LEARNINGS (acceptable for now) |
| Reviewer prompt too long | Inject key sections only with fallback for different profile structures |
| Edit location ambiguity | Search by step name ("Reviewer: Pre-Work"), not step number |

## Review Feedback (Incorporated)

| Concern | Resolution |
|---------|------------|
| Profile sections inconsistent across profiles | Added fallback: core uses Invariants/Anti-Patterns/Key Abstractions; cli uses Purpose & Boundaries + Command Architecture |
| Step 4 dependency unclear | Made explicit: Step 4 runs after Steps 1-3 |

## Profile Section Mapping

Different profiles have different structures. Use this mapping:

| Profile | Key Sections |
|---------|--------------|
| Core (`packages/core/`) | `## Invariants`, `## Anti-Patterns & Common Mistakes`, `## Key Abstractions & Patterns` |
| CLI (`packages/cli/`) | `## Purpose & Boundaries`, `## Command Architecture` + first 100 lines of `## Command Map` |
| Fallback (unknown profile) | First 150-200 lines of the profile |

Plan:

1. **Update execute-prd Reviewer Pre-Work** — Add expertise profile injection to the reviewer pre-work sanity check prompt.
   - Find step by searching for "Reviewer: Pre-Work Sanity Check" (not by step number)
   - Add instruction: "Include the same expertise profile(s) selected for the developer prompt"
   - Specify key sections with fallback:
     - Core: `## Invariants`, `## Anti-Patterns & Common Mistakes`, `## Key Abstractions & Patterns`
     - CLI: `## Purpose & Boundaries`, `## Command Architecture` + first 100 lines of `## Command Map`
     - Unknown: first 150-200 lines of the profile
   - Do NOT duplicate the profile selection heuristics — reference the developer prompt selection
   - Update example prompt to include profile context
   - AC: Reviewer pre-work prompt template references developer's profile selection and includes section fallback logic

2. **Update execute-prd Reviewer Code Review** — Add expertise profile injection to the reviewer code review prompt.
   - Find step by searching for "Reviewer: Code Review" (not by step number)
   - Add instruction: "Include the same expertise profile(s) the developer received"
   - Use same key sections with fallback as Step 1 (reference, don't duplicate)
   - Update example prompt to include profile context
   - AC: Code review prompt template references developer's profile selection with section fallback

3. **Update /ship Phase 4.2 (Final Review)** — Add expertise profile injection to the engineering-lead holistic review.
   - Find Phase 4.2 by searching for "Final Review" or "Holistic Review"
   - Add step: "Determine which packages were touched: `git diff --name-only main...HEAD | grep packages/`"
   - Add step: "Load corresponding expertise profiles based on packages touched"
   - Use same key sections with fallback (reference execute-prd's approach)
   - Update subagent prompt to include profile context
   - AC: Final review uses git diff to determine profiles and includes section fallback logic

4. **Add LEARNINGS.md entry (after Steps 1-3)** — Document this gap and fix in `.pi/skills/LEARNINGS.md` to prevent regression.
   - Add gotcha: "Reviewer and final review subagents must receive expertise profiles (key sections only)"
   - Add gotcha: "Reference developer's profile selection — don't duplicate selection heuristics"
   - Add gotcha: "Profiles have different structures — use section mapping (Invariants for core, Purpose for cli, fallback for unknown)"
   - Add note: "Profiles are point-in-time snapshots. If profiles change mid-PRD, re-run final review with updated context."
   - Reference this as a violation of the 4-layer context stack
   - AC: LEARNINGS.md contains entry about profile injection with all four gotchas

## Out of Scope

- Changing which profiles exist
- Modifying the profile selection heuristics (file → profile mapping)
- Adding new expertise domains
- Full profile injection (only key sections)
- Standardizing profile section structure across all profiles

## Size

**Small** (4 steps, all markdown edits to skill files)