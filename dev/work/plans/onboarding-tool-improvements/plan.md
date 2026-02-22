---
title: Onboarding Tool Improvements
slug: onboarding-tool-improvements
status: building
size: medium
tags: [onboarding, templates, tools]
created: 2026-02-22T04:22:37.918Z
updated: 2026-02-22T05:04:45.901Z
completed: null
execution: null
has_review: false
has_pre_mortem: true
has_prd: false
steps: 5
---

# Onboarding Tool Template Improvements

**Status**: draft
**Size**: medium (5 steps, 8 file changes)
**Created**: 2026-02-21
**Updated**: 2026-02-22 (v2 — consolidated from 12 files to 8 after vision review)
**Source**: Real-world testing feedback — agent comparison of onboarding plans revealed gaps between TOOL.md guidance and template coverage

---

## Problem

The onboarding TOOL.md is comprehensive — it covers risks, burning problems, situational playback, Say/Do Ratio, relationship cadence, and working file structures. But the **templates** that agents use to generate plans don't reflect all of this guidance. Testing showed that:

1. Templates are missing sections the TOOL.md explicitly calls for (risks, burning problems, situational playback milestone, Say/Do ratio check)
2. Working file types described inline in TOOL.md have no standalone templates — agents reverse-engineer them from prose
3. No checkpoint deliverable templates exist for phase exits (day-30, day-60, day-90)
4. No Areté skills reference table exists to connect "when during onboarding" to "which skill to use"

The result: agents produce generic plans when the TOOL.md has the material for deeply specific ones. The gap is template coverage, not content.

## Design Principle

**Areté handles data plumbing; templates handle thinking work.**

- People Intelligence, entity resolution, and `people/` already automate relationship tracking — templates should not ask the user to manually maintain what Areté automates
- Templates should support metacognitive work: "What am I learning? What's burning? What did I accomplish?"
- Fewer files > more files. Consolidate related trackers into single documents with sections rather than separate files
- The relationship "backlog" is really a hit-list/checklist that belongs in the stakeholder map — not a standalone tracker that duplicates `people/`

## Success Criteria

- All sections referenced in TOOL.md are reflected in corresponding templates
- An agent running the onboarding tool produces plans that include risks, burning problems, skill mapping, and checkpoint deliverables
- Existing template quality is preserved (1-1-note.md unchanged; stakeholder-map.md Influence Map untouched)
- TOOL.md activation workflow references new templates correctly
- No template asks the user to manually track what Areté automates

## Out of Scope

- Changes to the onboarding SKILL.md (Areté workspace onboarding — different tool)
- Changes to TOOL.md content/guidance (the guidance is good; this is about template coverage)
- New tool features or workflow changes
- Standalone relationship-backlog.md (folded into stakeholder-map.md enhancement)

---

## Plan

### Step 1: Enhance 30-60-90-plan.md template

**File**: `packages/runtime/tools/onboarding/templates/30-60-90-plan.md`

**a) Add "Risks and Watch-Outs" section** — insert after the `## Phase 3: Lead` section (including its Graduation subsection and Phase 3 Success Criteria), before `## Key Relationships to Build`
- Template with categories: Role Scope, Technical/Domain, Relationship, Pace/Burnout
- Each risk row: Description, Mitigation, Watch-For signals
- Pre-populated with 2-3 universal risks as examples agents should customize (e.g., "drinking from the firehose", "scope creep before credibility")

**b) Add "Areté Skills for Onboarding" reference table** (after Risks, before Questions)
- Maps onboarding moments → Areté skills with brief "when to use" descriptions
- Skills to include: `daily-plan` (each morning), `week-plan` (Mondays), `meeting-prep` (before meetings), `save-meeting` + `process-meetings` (after meetings), `people-intelligence` (after meeting processing), `capture-conversation` (after key 1:1s)
- Include note: "Run `arete skill list` to see all available skills"

**c) Update Phase 1 exit milestones**
- Add to Phase 1 Success Criteria as checklist items:
  - `- [ ] Held situational conversation with manager (see outputs/day-30-learnings.md)`
  - `- [ ] Identified 2-3 burning problems to diagnose (see working/working-tracker.md)`
  - `- [ ] Day 30 learnings documented (outputs/day-30-learnings.md)`

**d) Update Phase 2 and Phase 3 exit milestones**
- Add to Phase 2 Success Criteria: `- [ ] Day 60 assessment documented (outputs/day-60-assessment.md)`
- Add to Phase 3 Success Criteria: `- [ ] Day 90 retrospective documented (outputs/day-90-retro.md)`

**AC**:
- [ ] Risks section has 4 categories with example entries
- [ ] Areté skills table has 6+ skill mappings with timing and descriptions
- [ ] Phase 1 criteria references situational playback and burning problems
- [ ] All three phases reference their checkpoint deliverable file

---

### Step 2: Enhance existing templates (stakeholder-map.md, weekly-plan.md)

**a) stakeholder-map.md** — Add Cadence column + Relationship Hit List

**File**: `packages/runtime/tools/onboarding/templates/stakeholder-map.md`

- Add a `Cadence` column to Key Stakeholders tables (Product, Engineering, Design, Data, Other Functions) — insert after `Priority`, before `1:1 Status`. Values: Weekly / Bi-weekly / Monthly / Quarterly (matching TOOL.md: Essential=weekly, Important=bi-weekly, Valuable=monthly). Note: Other Functions table uses `Function` instead of `Relationship` — apply same relative position (after `Priority`, before `1:1 Status`).
- Add a **"Relationship Hit List"** section (after Key Stakeholders, before Organizational Structure) — a phased checklist of who to meet:
  - Week 1-2 (Essential): Manager, key peers, HR/People partner
  - Week 2-4 (Important): Skip-level, cross-functional partners (Eng, Design, Data)
  - Week 4-8 (Valuable): Customers (if possible), other PMs, tenured employees
  - Each entry: `- [ ] [Name/Role] — [Purpose] → links to `people/[slug].md` once created by Areté`
  - Brief note: "As you meet people and process meetings, Areté creates person files in `people/`. This list becomes your progress tracker — check off as connections are made."
- Do NOT touch the Influence Map, Go-To People, or org structure sections

**b) weekly-plan.md** — Add Say/Do Ratio Check

**File**: `packages/runtime/tools/onboarding/templates/weekly-plan.md`

- Add a "Say/Do Ratio Check" section at the bottom of the "End of Week Check-in" block
- Fields: Commitments made this week, Commitments delivered, In progress (on track)
- Match TOOL.md's Weekly Check-in Template format exactly (it uses these 3 fields — do not add "Overdue" as a 4th)

**AC**:
- [ ] stakeholder-map.md tables include Cadence column
- [ ] stakeholder-map.md has Relationship Hit List section with phased checklist and `people/` integration note
- [ ] weekly-plan.md has Say/Do Ratio Check in end-of-week section
- [ ] No changes to 1-1-note.md

---

### Step 3: Create working-tracker.md (consolidated working file)

**File**: `packages/runtime/tools/onboarding/templates/working-tracker.md`

One file, three sections — the user's thinking work organized by phase:

**Section 1: Learning Backlog (Phase 1)**
- 4-category matrix: PM Craft, Product, Market, Business
- Each category: What do I need to learn? Why? Who can teach me? How will I get it?
- 1-2 example entries per category

**Section 2: Burning Problems (Phase 1)**
- Tracker table: Problem | Flagged By | Investigation Notes | Diagnosis | Recommendation Timing
- Prompt: "Ask your manager, eng lead, and design lead: 'Is there a burning problem I can investigate and diagnose (not solve)?' Aim for 2-3."
- 1 example row

**Section 3: Quick Wins (Phase 2)**
- Opportunity tracker table: Opportunity | Effort (days) | Visibility | Risk | Owner Status | Criteria Met?
- Criteria reminder: Fast (2-3 weeks), Visible (others see impact), Low-risk, Unowned
- 1 example row

Header should explain: "This file tracks your active thinking work during onboarding. Update it as you learn, discover problems, and identify opportunities. Sections activate by phase."

**AC**:
- [ ] Single file with 3 clearly labeled sections
- [ ] Each section has structure matching TOOL.md descriptions
- [ ] Example rows in each section
- [ ] Self-contained — usable without reading TOOL.md

---

### Step 4: Create checkpoint deliverable templates (3 new files)

**Directory**: `packages/runtime/tools/onboarding/templates/`

**a) day-30-learnings.md** (Phase 1 exit)
- Combines situational playback + learnings reflection
- Sections: What I Learned (Business & Strategy, Product & Users, Team & Dynamics), Gaps in Understanding, Questions for Validation, Key Relationships Built (reference `people/` files), Burning Problems Status (reference working-tracker.md)
- Framed as: "This is your prep for the situational conversation with your manager. Play back what you've learned, surface gaps, validate understanding."
- References Phase 1 completion criteria from TOOL.md

**b) day-60-assessment.md** (Phase 2 exit)
- Sections: Contributions Delivered (with links to artifacts), Quick Wins Completed, Trust Battery Status (Say/Do ratio, commitments kept), Key Relationships Deepened, Target Area for Phase 3 Ownership, Feedback Received
- References Phase 2 completion criteria from TOOL.md

**c) day-90-retro.md** (Phase 3 exit / graduation)
- Sections: Initiatives Led (with outcomes), Relationships Built (reference `people/`), Context Mastery (which context files are complete), What I'd Do Differently, 6-Month Vision, Graduation Criteria Checklist
- This is the artifact shared with manager at graduation
- References Phase 3 completion criteria and Graduation Criteria from TOOL.md

**AC**:
- [ ] 3 new files exist in `templates/`
- [ ] day-30-learnings.md includes situational playback framing and covers business/product/team/gaps
- [ ] day-60-assessment.md covers contributions, trust battery, quick wins, Phase 3 target
- [ ] day-90-retro.md covers initiatives, relationships, context mastery, forward vision
- [ ] All three reference relevant phase completion criteria (not duplicate them)
- [ ] Checkpoint templates reference Areté artifacts where appropriate (`people/`, context files)

---

### Step 5: Update TOOL.md activation workflow and project structure

**File**: `packages/runtime/tools/onboarding/TOOL.md`

**a) Update "Activation Workflow" step 4.5**
- Change from inline "Create enhanced working files" to template-copy pattern:
  - Copy `templates/working-tracker.md` → `working/working-tracker.md`
  - Copy `templates/day-30-learnings.md` → `outputs/day-30-learnings.md` (blank, fill at Phase 1 exit)
  - Copy `templates/day-60-assessment.md` → `outputs/day-60-assessment.md` (blank, fill at Phase 2 exit)
  - Copy `templates/day-90-retro.md` → `outputs/day-90-retro.md` (blank, fill at Phase 3 exit)
- All files are copied at activation. Checkpoint templates include a note: "Fill in this document when you reach Phase N exit."
- No phase-transition mechanism needed — simpler to copy all upfront.

**b) Update "Project Structure" section AND "New Files in This Enhancement" section**
- Project Structure tree: Replace individual working files (learning-backlog.md, relationship-backlog.md, burning-problems.md, quick-wins.md) with single `working-tracker.md`
- Project Structure tree: Add `outputs/day-30-learnings.md`, `outputs/day-60-assessment.md`, `outputs/day-90-retro.md`
- Project Structure tree: Remove `plan/situational-playback.md` (merged into day-30-learnings.md)
- "New Files in This Enhancement" section: Rewrite to reflect consolidated layout — `working-tracker.md` replaces the 4 individual working files; add 3 checkpoint templates; remove `situational-playback.md` reference. Keep `leverage-docs/` reference.

**c) Update "Working File Templates" prose section**
- Add a note at the top: "These descriptions document the sections within `working-tracker.md` and `day-30-learnings.md`. See those templates for the files you'll actually use."
- Keep the detailed descriptions (Learning Backlog, Burning Problems, Quick Wins, Situational Playback) as reference documentation
- Remove standalone Relationship Backlog description (folded into stakeholder-map.md)

**d) Verify consistency** (Pre-mortem Risk #3)
- Diff new template structures against TOOL.md prose descriptions — no structural divergence
- Verify weekly-plan.md Say/Do format matches TOOL.md Weekly Check-in Template
- Verify "New Files in This Enhancement" section matches actual `templates/` directory listing
- Verify Project Structure tree matches actual file layout

**AC**:
- [ ] Activation workflow step 4.5 copies all templates at activation (working-tracker + 3 checkpoints)
- [ ] Project structure tree reflects consolidated file layout
- [ ] "New Files in This Enhancement" section reflects consolidated layout
- [ ] "Working File Templates" prose section updated with consolidation note, descriptions preserved
- [ ] Relationship Backlog description removed from Working File Templates (now in stakeholder-map.md)
- [ ] No structural divergence between templates and TOOL.md descriptions (weekly Say/Do, project structure, new files section all verified)
- [ ] No TOOL.md content/guidance changes

---

## Risks

See `pre-mortem.md` for full analysis. Key risks (updated for v2):

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Skills table goes stale as skills change | Descriptive names + "check `arete skill list`" note |
| 2 | TOOL.md activation workflow inconsistency | Diff templates against TOOL.md prose at Step 5 — including New Files section, Working File Templates, project structure tree |
| 3 | Checkpoint templates duplicate graduation criteria | Reference TOOL.md criteria, don't duplicate |
| 4 | Update backfill won't enhance existing templates | Accepted — by design. New files backfill; edits don't. |
| 5 | Stale LEARNINGS.md re: dist/ mirroring | Update LEARNINGS.md — dist/ is gitignored, `packages/runtime/` ships directly via npm `files` field |

## File Summary

| Action | File | Step |
|--------|------|------|
| Edit | `templates/30-60-90-plan.md` | 1 |
| Edit | `templates/stakeholder-map.md` | 2a |
| Edit | `templates/weekly-plan.md` | 2b |
| Create | `templates/working-tracker.md` | 3 |
| Create | `templates/day-30-learnings.md` | 4 |
| Create | `templates/day-60-assessment.md` | 4 |
| Create | `templates/day-90-retro.md` | 4 |
| Edit | `TOOL.md` | 5 |

**4 edits + 4 new files = 8 total** (down from 12 in v1)

**No code changes** — all markdown template work. No typecheck/test impact.

**Housekeeping**: Update `packages/runtime/tools/LEARNINGS.md` to correct stale dist/ mirroring claim (dist/ is gitignored; `packages/runtime/` ships directly via npm `files` field).
