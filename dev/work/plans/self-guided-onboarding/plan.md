---
title: Self Guided Onboarding
slug: self-guided-onboarding
status: idea
size: unknown
tags: [feature]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Self-Guided Onboarding

**Status**: Blocked - needs infrastructure  
**Priority**: High (critical for adoption)  
**Effort**: Large (8-12 tasks)  
**Owner**: TBD

---

## Overview

Create `arete onboard` command that uses Areté itself to onboard users to Areté. Generates a personalized onboarding project with weekly/daily plans, adaptive paths based on user's available data and goals, and verifiable checkpoints to ensure value at each phase.

Core insight: **Use Areté to teach Areté.** Just like project management tools create an onboarding project with tasks, Areté should use its own project system, planning features, and skills to guide users to their first aha moment.

---

## Problem

**Two types of onboarding confusion:**

1. **Technical Setup** (`arete setup`) - Tools and integrations work, but workspace is empty
2. **Content Onboarding** - User has empty workspace and doesn't know where to start

**Current state:**
- ✅ `arete install` creates workspace structure
- ✅ `arete setup` could configure integrations (needs enhancement)
- ❌ No guidance on what context to add
- ❌ No clear path from "empty workspace" to "valuable workspace"
- ❌ Users bounce at the critical junction: tools work, but no data = no value

**The gap:** Users don't have all context ready immediately. They need a **plan to onboard themselves** that fits their:
- Available data sources (calendar, Fathom, notes, nothing yet)
- Immediate needs (meeting prep, strategy docs, roadmaps)
- Context readiness (ready now, need to gather, need days to collect)
- Time availability (30 min/day, weekends only, etc.)

---

## Solution

### Concept: Areté Onboards You to Areté

`arete onboard` command that:

1. **Asks discovery questions** about user's situation
2. **Generates personalized onboarding plan** (multiple paths based on answers)
3. **Creates onboarding project** in `projects/active/arete-onboarding/`
4. **Populates week plan** (`now/week.md`) with milestones
5. **Sets daily tasks** (`now/today.md`) for first few days
6. **Tracks progress** with checkpoints to verify value
7. **Adapts** based on what works (resumable, can pivot paths)

### Discovery Questions

```
? What data sources do you have access to?
  - Calendar (meetings scheduled)
  - Meeting recordings (Fathom, Grain, etc.)
  - Past project notes/docs
  - Customer feedback
  - Analytics/metrics
  - None yet - starting fresh

? What's your immediate need?
  - Prep for upcoming meetings
  - Build a roadmap
  - Document product strategy
  - Organize existing research
  - Not sure - want to explore

? Business context readiness?
  - Ready now - can fill in context files today
  - Partially ready - need to gather some info
  - Need to collect - will take a few days

? How much time this week?
  - 30 min/day
  - 1 hour/day
  - Just weekends
  - Whenever I have time
```

### Onboarding Paths (Examples)

**Path A: "Meeting Maestro"**  
*Has: Calendar + Fathom | Wants: Meeting prep*

- Phase 1: Technical setup (QMD + Fathom)
- Phase 2: Minimal context (3 core files)
- Phase 3: Import meetings (seed command)
- Phase 4: Meeting prep skill (first aha moment)
- Phase 5: Process meetings → people directory

**Path B: "Strategy Builder"**  
*Has: Docs/notes | Wants: Document strategy*

- Phase 1: Technical setup (QMD)
- Phase 2: Full context (all 6 context files)
- Phase 3: Start discovery project
- Phase 4: Synthesize into strategy doc
- Phase 5: Set quarter goals

**Path C: "Starting Fresh"**  
*Has: Nothing yet | Wants: Explore*

- Phase 1: Technical setup (minimal)
- Phase 2: Add basic context
- Phase 3: Manual meeting save (paste transcript)
- Phase 4: Try meeting-prep or synthesize
- Phase 5: Pick next integration to add

### Generated Artifacts

**1. Onboarding Project** (`projects/active/arete-onboarding/`)

```
arete-onboarding/
├── README.md              # Progress tracker, current phase
├── inputs/
│   └── assessment.md      # Answers from onboarding questions
├── working/
│   ├── context-draft.md   # Space to draft context
│   └── notes.md           # Learning notes
└── outputs/
    └── onboarding-plan.md # Personalized plan with phases
```

**2. Week Plan** (`now/week.md`)

```markdown
# Week of Feb 10, 2026

## Focus: Get Areté Working for You

### Onboarding Milestones
1. [ ] Complete technical setup
2. [ ] Add 3 core context files
3. [ ] Import last 30 days of meetings
4. [ ] Prep for one meeting using Areté
5. [ ] Process meetings to update people

## Monday: Technical Setup
- [ ] Run `arete setup`
- [ ] Fill in business-overview.md

## Tuesday: Add Context
- [ ] Fill in users-personas.md
- [ ] Fill in products-services.md

## Wednesday: Import Data
- [ ] Run `arete seed fathom --last 30`
- [ ] Review imported meetings

## Thursday: First Aha Moment
- [ ] Try: "Prep for my meeting with [person]"
- [ ] Review the brief

## Friday: Build Momentum
- [ ] Run process-meetings skill
- [ ] Check people/ directory
```

**3. Daily Tasks** (`now/today.md`)

```markdown
# Monday, Feb 10

## Onboarding: Phase 2 (Day 2 of 5)

### Today's Tasks
- [ ] Run `arete setup` (10 min)
- [ ] Fill in context/business-overview.md (10 min)

### Why This Matters
Context files help Areté understand your business...

### Tomorrow Preview
- User personas
- Product context
```

### Checkpoints (Verify Value)

At each phase completion:

```markdown
## Checkpoint: Phase 3 Complete ✓

You've imported meetings! Let's verify:
- [ ] Check resources/meetings/ - see your meetings?
- [ ] Open one - does it look right?
- [ ] Try: "What did we discuss about [topic]?"

✅ Yes → Ready for Phase 4
❌ No → Let's troubleshoot...
```

---

## Tasks (Draft)

### A. Foundation (Prerequisites)

1. **Enhance `arete setup`**
   - Add QMD installation automation
   - Detect architecture (arm64 vs x64)
   - Handle package manager preference (bun vs npm)
   - Integration configuration (Fathom, calendar)
   - Acceptance: `arete setup` installs QMD and configures integrations

2. **Week/Daily Planning Infrastructure**
   - Ensure `now/week.md` template
   - Ensure `now/today.md` template
   - Plan generation utilities
   - Acceptance: Can programmatically generate week/daily plans

### B. Core Onboarding Command

3. **Discovery Question Flow**
   - Interactive prompts (inquirer)
   - Answer validation
   - Store answers in `projects/active/arete-onboarding/inputs/assessment.md`
   - Acceptance: `arete onboard` asks questions, saves answers

4. **Path Determination Logic**
   - Map answers to onboarding paths
   - Define 3-5 standard paths (Meeting Maestro, Strategy Builder, etc.)
   - Path selection algorithm
   - Acceptance: Given answers, returns correct path

5. **Plan Generation Engine**
   - Generate personalized onboarding plan
   - Create phase breakdown with time estimates
   - Distribute across week based on time availability
   - Generate daily tasks for first 3 days
   - Acceptance: Produces complete onboarding plan from path + answers

6. **Project Scaffolding**
   - Create `projects/active/arete-onboarding/`
   - Generate README.md with progress tracker
   - Create working files (context-draft.md, notes.md)
   - Save onboarding plan to outputs/
   - Acceptance: Project structure created correctly

7. **Week/Daily Plan Population**
   - Write milestones to `now/week.md`
   - Write first day tasks to `now/today.md`
   - Link to onboarding project
   - Acceptance: Week and daily plans reflect onboarding path

### C. Progress Tracking

8. **Checkpoint System**
   - Define checkpoints per phase
   - Verification prompts at phase completion
   - Progress tracking in README.md
   - Acceptance: User can verify value at each checkpoint

9. **Resume/Pivot Logic**
   - Detect partially complete onboarding
   - Resume from last checkpoint
   - Allow path changes if original not working
   - Acceptance: Can restart onboarding, resume, or change paths

### D. Polish & Integration

10. **Onboarding Skill Integration**
    - When user completes checkpoint, trigger next skill
    - E.g., Phase 4 checkpoint → auto-prompt "try meeting-prep"
    - Acceptance: Smooth flow between phases

11. **Completion & Celebration**
    - Detect onboarding complete
    - Archive onboarding project
    - Generate "What's Next" suggestions
    - Acceptance: Clear end state, momentum to keep using Areté

12. **Testing & Documentation**
    - Tests for path logic, plan generation
    - Update ONBOARDING.md with `arete onboard` flow
    - Update SETUP.md to reference onboarding command
    - AGENTS.md section on onboarding system
    - Ensure ONBOARDING.md, SETUP.md, and onboarding flow are IDE-aware (paths, `ide_target`, `.cursor/` vs `.claude/`)
    - Acceptance: Comprehensive tests, docs updated

---

## Dependencies

### Required Infrastructure (Blockers)

- ⚠️ **Enhanced `arete setup`** - Must handle QMD installation, architecture detection
- ⚠️ **Week/Daily Planning System** - Templates and generation utilities in place
- ⚠️ **Progress Tracking** - Mechanism to track project phase completion
- ⚠️ **Skills Integration** - Ability to trigger skills programmatically after checkpoints

### Nice to Have (Can Build Without)

- ✅ Calendar integration (existing)
- ✅ Fathom integration (existing)
- ✅ QMD search (existing)
- ⚠️ Better project templates system (current templates work but could be enhanced)

---

## Benefits

### For Users

- **Clear path** from empty workspace to valuable workspace
- **Personalized** based on their situation (not one-size-fits-all)
- **Self-paced** with concrete tasks and time estimates
- **Verifiable** checkpoints ensure they're getting value
- **Resumable** if they need to pause or pivot
- **Uses Areté** to learn Areté (meta, but effective)

### For Areté Adoption

- **Reduces bounce rate** at critical junction (empty workspace)
- **Demonstrates value quickly** (aha moment in first week)
- **Builds confidence** through small wins
- **Creates momentum** from onboarding into regular use
- **Self-documenting** (onboarding project = tutorial artifact)

---

## Open Questions

1. **Onboarding as Skill or Tool?**
   - Skill: Stateless, simpler
   - Tool: Lifecycle-based with phases, better for progress tracking
   - Recommendation: **Tool** (fits the phased, stateful nature)

2. **How prescriptive vs adaptive?**
   - Highly prescriptive: "Do these 3 things in order"
   - Choose your own: "Pick what's relevant"
   - Adaptive: "I see you have Fathom, let's..."
   - Recommendation: **Adaptive with defaults** (smart suggestions, but user can override)

3. **What if user abandons mid-onboarding?**
   - Auto-cleanup after X days?
   - Keep forever as reference?
   - Prompt to resume or archive?
   - Recommendation: **Keep as reference** (shows what Areté can do)

4. **Multiple onboarding paths supported?**
   - Can user restart with different path?
   - Do paths converge (all lead to same "complete" state)?
   - Recommendation: **Yes, resumable and changeable** (paths are guides, not rails)

5. **Integration with existing workspace?**
   - What if they've already added some context?
   - Can onboarding detect and skip completed phases?
   - Recommendation: **Skip detection** (don't re-do what's done)

6. **Telemetry/feedback loop?**
   - Track which paths work best?
   - Collect feedback at end of onboarding?
   - Recommendation: **Optional anonymous feedback** (helps refine paths)

7. **Multi-IDE support?**
   - `arete onboard` should respect `ide_target` and reference correct paths (`.cursor/` vs `.claude/`)
   - Onboarding flow may need to surface which IDE the user chose
   - Recommendation: **IDE-aware** — use `ide_target` from config, avoid hardcoded `.cursor/` paths

---

## Related

- **Existing**: `arete install` (creates workspace), `arete setup` (needs enhancement)
- **Tools Framework**: `.cursor/tools/README.md` or `.claude/tools/README.md` (path depends on `ide_target`; onboarding would be a tool)
- **Planning System**: `goals/`, `now/week.md`, `now/today.md` (used by onboarding)
- **Skills**: meeting-prep, synthesize, process-meetings (triggered during onboarding)
- **Docs**: ONBOARDING.md (simple checklist, would reference `arete onboard`). When implementing, ensure ONBOARDING.md references IDE-appropriate paths and `arete install --ide`.

---

## Notes

**Key insight from conversation (2026-02-09):**

> "They might not have all that info right away. The onboarding should ask questions and output a plan to onboard them. Then they can go collect information to get started. The onboarding doc can be part of a weekly plan we generate to get going."

This shifts onboarding from "do these steps now" to "here's your personalized plan, go at your pace." Much better fit for how PMs actually work.

**Inspiration:**
- Project management tools that create onboarding projects
- "Use the product to learn the product" philosophy
- PM discovery process (ask questions, generate plan, verify value)
