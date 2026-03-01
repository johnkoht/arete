---
title: Onboarding Project Enhancements
slug: onboarding-project-enhancements
status: complete
size: medium
tags: [onboarding, templates, ux]
created: 2026-02-28T04:23:02.857Z
updated: 2026-02-28T05:25:00.000Z
completed: 2026-02-28T05:25:00.000Z
execution: direct
has_review: true
has_pre_mortem: false
has_prd: false
steps: 6
---

# Onboarding Project Enhancements

Refactor the onboarding tool to use a simpler, more focused project structure with clear separation between guidance (playbook) and action (plan).

## Problem

The existing onboarding templates were hybrid documents that mixed philosophy with task lists. Users got overwhelmed with structure (working folders, trackers, weekly plans) before they needed it. The rich coaching content was locked in TOOL.md where users never saw it.

## Solution

Three core files with on-demand expansion:

| File | Purpose | Usage |
|------|---------|-------|
| **playbook.md** | Philosophy, principles, phase guidance | Read early, reference as needed |
| **plan.md** | Pure tactical checkboxes | Work in daily |
| **notes.md** | Questions, wins, learning backlog, burning problems | Write frequently |

Everything else (weekly plans, reflections, stakeholder maps) generated on-demand when the user asks.

## Persona Council Validation

- **Harvester**: Works — notes.md is low-friction freeform capture
- **Architect**: Works — can ask for more structure when ready
- **Preparer**: Works — simpler structure means faster time-to-output

## Steps

### 1. Create playbook.md template ✅

- Extracted philosophy content from TOOL.md
- Preserved full context (not just bullets) — each section coaches
- Added "What to Ask For" prompts section at bottom
- **File**: `packages/runtime/tools/onboarding/templates/playbook.md` (13KB)

### 2. Create notes.md template ✅

- Headers: Questions, Wins, Learning Backlog, Burning Problems, General Notes
- Freeform bullet space under each (no tables)
- "Permission slip" at top: "This is your space. Wipe it or ask for more structure."
- **File**: `packages/runtime/tools/onboarding/templates/notes.md` (600B)

### 3. Slim down plan.md template ✅

- Removed philosophy (now in playbook)
- Kept: phase structure, tactical checkboxes, exit criteria, key relationships, milestones
- **File**: `packages/runtime/tools/onboarding/templates/plan.md` (3.5KB)

### 4. Update TOOL.md instructions ✅

- New lean project structure (3 files + inputs/)
- Simplified activation workflow
- Documented on-demand expansions table
- Updated progress tracking and weekly rhythm
- Updated working file templates section to reflect on-demand model

### 5. Clean up templates directory ✅

- Removed: `30-60-90-plan.md` (replaced by plan.md), `working-tracker.md` (split into on-demand)
- Kept for on-demand: day-30/60/90 reflections, stakeholder-map, weekly-plan, 1-1-note

### 6. Verified ✅

- `npm run typecheck` passes
- `npm test` passes (901/901)

## New Project Structure

```
projects/active/onboarding/
├── playbook.md      # Read early, reference as needed
├── plan.md          # Work in daily
├── notes.md         # Write frequently
└── inputs/          # Dump files for processing
```

## On-Demand Expansions

| User Says | What Gets Created |
|-----------|-------------------|
| "Create a detailed plan for week 1" | `working/week-01.md` |
| "Help me track a burning problem" | `working/burning-problems.md` |
| "I'm at day 30, help me reflect" | `outputs/day-30-learnings.md` |
| "I'm at day 60, help me assess" | `outputs/day-60-assessment.md` |
| "Help me map stakeholders" | `working/stakeholders.md` |

## Out of Scope

- Migration of existing onboarding projects (manual, one active project)
