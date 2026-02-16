---
name: workspace-tour
description: Orient users to the Areté PM workspace. Use when the user asks for a tour, how the workspace works, what they can do, or says they're new.
work_type: operations
category: essential
triggers:
  - give me a tour
  - tour of
  - how does this work
  - what can I do here
  - I'm new here
---

# Workspace Tour Skill

Help users understand Areté and how to use it effectively.

> **Areté** (ἀρετή) - "excellence" in Ancient Greek. This workspace is designed to help you pursue excellence in product management.

## When to Use

- "Give me a tour"
- "How does this workspace work?"
- "What can I do here?"
- "Help me understand this workspace"
- "I'm new here"

## Tour Flow

When giving a tour, walk through these areas in order:

### 1. Overview (30 seconds)

"Welcome to **Areté** - a PM workspace designed to help you pursue excellence in product management.

It helps you:
- Maintain context about your business and product
- Run structured PM workflows (discovery, PRDs, competitive analysis, etc.)
- Build institutional memory of decisions and learnings
- Search across everything with QMD"

### 2. Context Files

"Your **context** lives in `context/`. These are your source of truth:
- `business-overview.md` - Company basics, mission, stage
- `business-model.md` - How you make money
- `users-personas.md` - Who you're building for
- `products-services.md` - What you're building
- `goals/strategy.md` - Where you're headed
- `competitive-landscape.md` - Your market position

These change infrequently - only when you finalize a project."

### 3. Projects

"Work happens in **projects** (`projects/active/`). A project can be anything:
- A discovery sprint
- A single PRD
- Competitive research
- Roadmap planning

Each project has:
- `README.md` - Goal and status
- `inputs/` - Raw materials (notes, feedback, research)
- `working/` - Drafts and iterations
- `outputs/` - Final deliverables"

### 4. Memory

"Your **memory** (`.arete/memory/`) captures institutional knowledge:
- `decisions.md` - Why you made key choices
- `learnings.md` - Insights to remember
- `activity-log.md` - What happened when"

### 5. Scratchpad

"The **scratchpad** (`now/scratchpad.md`) is for quick capture:
- Ideas that pop up
- Quick notes
- TODOs for later

Not everything needs a project - scratchpad is fine for quick stuff."

### 6. How to Work

"The typical flow is:
1. **Start a project**: 'Start a discovery project for [topic]'
2. **Add inputs**: Drop in meeting notes, feedback, research
3. **Synthesize**: 'Synthesize what we've learned'
4. **Finalize**: 'Finalize this project' - commits to context, archives"

### 7. Search with QMD

"If you have QMD set up, I can search across everything:
- Past projects and decisions
- Related context
- Historical learnings

I'll run searches automatically when relevant."

### 8. What to Do First

Based on workspace state, suggest:

**If context is empty:**
"I'd suggest starting by filling out `context/business-overview.md` with your company basics. Want me to help with that?"

**If context exists but no projects:**
"Your context looks set up. Ready to start your first project? What are you working on?"

**If projects exist:**
"I see you have [X] active project(s). Want to continue working on one, or start something new?"

## Quick Reference Card

At the end, offer:

"Here's a quick reference:

**Start work:**
- 'Start a discovery project for [topic]'
- 'Create a PRD for [feature]'
- 'Analyze competitors'

**During work:**
- 'Add these notes to the project'
- 'Synthesize what we've learned'
- 'What decisions do we need to make?'

**Wrap up:**
- 'Finalize this project'
- 'Log this decision: [decision]'

**Quick questions:**
- 'What do we know about [topic]?'
- 'Why did we decide [decision]?'

Want me to help you get started with anything?"
