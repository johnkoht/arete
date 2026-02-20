---
title: Onboarding Mvp
slug: onboarding-mvp
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

# Onboarding MVP - Conversational Bootstrap

**Status**: Ready for PRD  
**Priority**: High (critical for adoption)  
**Effort**: Medium (4-6 tasks)  
**Owner**: TBD  
**Version**: MVP (v1) - Conversational in-agent onboarding

---

## Overview

Create a **conversational onboarding skill** that runs entirely within Cursor/Claude chat. User says "Let's get started" or "Help me set up Areté" and the agent guides them through:

1. **Discovery questions** (What do you have? What do you need?)
2. **Data dump** (Drop docs, paste notes, or manual input)
3. **Bootstrap context** (Agent drafts initial context files)
4. **Quick win** (First valuable skill use - meeting prep or synthesis)

**No CLI command, no progress tracking, no adaptive paths.** Just a 15-30 minute guided conversation that gets the workspace from empty to useful.

**Full self-guided onboarding** (adaptive paths, checkpoint verification, project structure) becomes **v2** once infrastructure is in place.

---

## Problem

**Empty workspace = no value**

- Users install Areté, see empty context files, and don't know what to do
- Current state: `arete install` creates structure, but users bounce when workspace is empty
- Biggest friction: Getting context INTO the system

**What users need:**
- Clear starting point ("Let's get started")
- Quick way to dump existing info (docs, notes, strategy)
- Agent help to organize it
- One immediate win (see value in 30 min)

---

## Solution: Conversational Onboarding Skill

### User Flow

```
User: "Let's get started" or "Help me set up Areté"

Agent: [Loads onboarding skill]
       "Great! I'll help you set up your workspace. This takes 15-30 minutes.
       
       First, a few questions to understand your situation..."

Agent: [Discovery questions - 3-4 key ones]
       - What data sources do you have? (calendar, Fathom, docs, nothing)
       - What's your immediate need? (meeting prep, strategy, roadmap)
       - Do you have docs to upload? (yes/no)

Agent: [Based on answers]
       "Perfect! Let's start by getting your context in..."

Agent: [Context bootstrap - one of:]
       - PATH A: Data dump → User pastes/uploads docs → Agent extracts
       - PATH B: Guided input → Agent asks questions → User answers → Agent writes
       - PATH C: Integration first → "Let's connect your calendar/Fathom"

Agent: [Drafts initial context files]
       "I've drafted your business overview, goals, and product info. 
       Take a look at context/business-overview.md..."

User: [Reviews, makes edits]

Agent: "Great! Now let's get you a quick win. Based on your setup, 
       I recommend trying [meeting-prep / synthesize / week-plan]..."

Agent: [Guides user through first skill]

Agent: "🎉 You're set up! Here's what you can do next:
       - Try daily-plan for tomorrow's meetings
       - Run process-meetings after your next meeting
       - Add more context to goals/strategy.md
       
       Say 'What can Areté do?' to see all skills."
```

---

## Skill Structure

**Location**: `runtime/skills/onboarding/SKILL.md`

**Triggers**: 
- "Let's get started"
- "Help me set up Areté"
- "Onboard me"
- "I'm new to Areté"

**Workflow**:

### Phase 1: Discovery (2-3 min)

Ask 3-4 key questions:

1. **Data sources**: What do you have access to?
   - [ ] Calendar (meetings scheduled)
   - [ ] Meeting recordings (Fathom, Grain)
   - [ ] Past docs/notes (strategy, PRDs, research)
   - [ ] None yet - starting fresh

2. **Immediate need**: What do you want to accomplish first?
   - [ ] Prep for upcoming meetings
   - [ ] Document product strategy  
   - [ ] Organize existing research
   - [ ] Build a roadmap
   - [ ] Not sure - want to explore

3. **Context readiness**: Business context status?
   - [ ] I have docs to upload/paste
   - [ ] I can answer questions now
   - [ ] I need to gather info (will take time)

### Phase 2: Context Bootstrap (10-15 min)

Based on answers, choose approach:

**APPROACH A: Data Dump** (if user has docs)
1. "Great! Please do one of the following:
   - Paste content from your docs below (strategy docs, OKRs, product notes)
   - Or drag/drop files into chat (PDFs, markdown, text)
   - Or save files to `inputs/onboarding-dump/` and tell me when ready"

2. Agent reads pasted/uploaded content

3. Agent extracts and categorizes:
   - Business overview → `context/business-overview.md`
   - Goals/strategy → `goals/strategy.md`
   - Users/personas → `context/users-personas.md`
   - Products → `context/products-services.md`
   - Competitors → `context/competitive-landscape.md`

4. Agent drafts context files with `[DRAFT - review and edit]` headers

5. "I've drafted these files. Please review:
   - context/business-overview.md
   - goals/strategy.md
   [links to files]
   
   Edit them directly or tell me what to change."

**APPROACH B: Guided Input** (if user doesn't have docs)
1. Agent asks structured questions (5-7 key ones):
   - What's your company/product?
   - Who are your users?
   - What problem do you solve?
   - What are your top goals this quarter?
   - Who are your main competitors?

2. User answers in chat

3. Agent writes context files from answers

4. "I've created your initial context files. Take a look..."

**APPROACH C: Integration First** (if user has calendar/Fathom)
1. "Let's connect your integrations first, then we'll add context.
   Run: `arete setup` to configure calendar and Fathom."

2. [User runs setup, or agent guides through it]

3. "Great! Now let's pull some meetings: `arete pull`"

4. After pulling: "You have X meetings. Let's add some context about your work..."

5. [Falls back to APPROACH B with fewer questions]

### Phase 3: First Win (5-10 min)

Based on what's set up, suggest first valuable action:

**If calendar/meetings exist:**
- "Let's try meeting-prep. Who's your next meeting with?"
- [Guide through meeting-prep skill]
- "You can also try daily-plan for tomorrow's full schedule"

**If docs were dumped:**
- "Want to synthesize these into insights? Let's try the synthesize skill"
- [Guide through synthesize with dumped inputs]

**If starting fresh:**
- "Let's plan your week. I'll help you set priorities"
- [Guide through week-plan]

### Phase 4: Next Steps (1 min)

"🎉 **You're all set!** Your workspace is ready.

**What you've accomplished:**
- ✓ Context files populated
- ✓ [Integration] connected (if applicable)
- ✓ First skill used successfully

**What to do next:**
- Try `daily-plan` before tomorrow's meetings
- Run `process-meetings` after your next meeting to capture decisions
- Explore more: Ask 'What can Areté do?' or 'Show me all skills'
- Customize: Edit context files as your work evolves

**Need help?** Say 'Help with [skill name]' or 'What should I do?'"

---

## Implementation Details

### Skill Metadata

```yaml
name: Onboarding
description: Get started with Areté - conversational setup that bootstraps your workspace
category: core
requires_briefing: false
work_type: setup
primitives: []
triggers:
  - "let's get started"
  - "help me set up"
  - "onboard me"
  - "I'm new to Areté"
  - "getting started"
```

### Key Patterns Used

1. **Document extraction** (from context-dump plan):
   - Accept pasted content or uploaded files
   - Parse and categorize by content type
   - Map to Areté primitives (context/, goals/)

2. **Guided questions** (from self-guided onboarding):
   - Ask 3-4 discovery questions
   - Branch based on answers
   - Fill in gaps with structured Q&A

3. **Quick win** (from adoption research):
   - Don't end without user experiencing value
   - Suggest first skill based on what's available
   - Guide through it (don't just recommend)

### Context Files Bootstrapped

Minimal set (not all 6):
- ✅ `context/business-overview.md` - Company, product, mission
- ✅ `goals/strategy.md` - Pillars, OKRs, top goals
- ⚠️ `context/users-personas.md` - If user has this info
- ⚠️ `context/products-services.md` - If applicable
- ⚠️ `context/competitive-landscape.md` - If mentioned

**Guideline**: Get 2-3 files with substance. Don't force all 6 if user doesn't have info.

### What's NOT in MVP

❌ **No CLI command** (`arete onboard`) - Agent-driven only  
❌ **No progress tracking** - Single conversation, no resume  
❌ **No adaptive paths** - Simple branching (A/B/C approaches)  
❌ **No onboarding project** - No `projects/active/arete-onboarding/`  
❌ **No checkpoints** - Trust user to know if it's working  
❌ **No week/day plan generation** - User can run those skills separately

These become **v2 (Self-Guided Onboarding)** once infrastructure is ready.

---

## Dependencies

**Required (already exist):**
- ✅ Context file structure (`context/`, `goals/`)
- ✅ Skills (meeting-prep, synthesize, week-plan)
- ✅ People system (if processing meetings)

**Nice to have (not blocking):**
- ⚠️ `arete setup` enhancement (for integration config)
- ⚠️ Document parsing (PDF/DOCX) - Start with markdown/text paste only

**v2 dependencies (not needed for MVP):**
- Project templates (for onboarding project)
- Progress tracking system
- Enhanced `arete setup` with QMD automation

---

## Success Criteria

**User can complete onboarding in 15-30 minutes and:**
1. Has 2-3 context files with real content (not placeholders)
2. Has successfully used 1 skill (meeting-prep, synthesize, or week-plan)
3. Knows what to do next (clear next steps)
4. Workspace has data (not empty anymore)

**Adoption metric**: % of new users who complete onboarding and use a 2nd skill within 7 days

---

## Task Breakdown (Draft)

1. **Create onboarding skill** (`runtime/skills/onboarding/SKILL.md`)
   - Discovery questions workflow
   - Three approaches (data dump, guided input, integration first)
   - Context file drafting pattern
   - First win guidance
   - Next steps

2. **Add document extraction helpers** (optional)
   - Accept pasted content in chat
   - Parse and categorize by primitives
   - Map to context/ and goals/ files
   - Generate [DRAFT] headers

3. **Add skill to router/table**
   - Triggers for onboarding skill
   - Ensure "let's get started" routes correctly

4. **Update SETUP.md**
   - New getting started section
   - "Say 'Let's get started' to the agent"
   - Link to onboarding flow

5. **Test with fresh workspace**
   - All three approaches (dump, guided, integration)
   - Verify drafts are useful
   - Ensure first skill works

6. **Documentation**
   - README mention of onboarding
   - Agent knows to suggest it for new users

---

## MCP Integrations (Separate Track)

User also requested: **Notion, Linear, Jira MCP integrations**

These are **separate from onboarding** but would enhance the "integration first" path. Add to backlog:

### Notion MCP Integration
**Capability**: `notes` (read-only sync of Notion pages)  
**Effort**: Large (8-10 tasks: OAuth, page sync, mapping to workspace)  
**Use in onboarding**: Pull Notion docs → context-dump flow

### Linear MCP Integration  
**Capability**: `project-tracking` (issues, roadmap, status)  
**Effort**: Large (6-8 tasks: API client, issue sync, project mapping)  
**Use in onboarding**: Pull Linear roadmap → goals/strategy.md

### Jira MCP Integration
**Capability**: `project-tracking` (tickets, sprints, epics)  
**Effort**: Large (6-8 tasks: API client, ticket sync, status)  
**Use in onboarding**: Pull Jira epics → discovery inputs

**Recommendation**: Start with **Notion** (most PM-centric), then Linear, then Jira.

---

## Why This is Better Than Full Self-Guided (for MVP)

| Aspect | Full Self-Guided | MVP Conversational |
|--------|------------------|-------------------|
| **Complexity** | Large (8-12 tasks) | Medium (4-6 tasks) |
| **Infrastructure** | Needs progress tracking, checkpoints | Uses existing skills |
| **Time to value** | 30-60 min (multiple phases) | 15-30 min (one conversation) |
| **User friction** | CLI command, project structure | "Let's get started" |
| **Flexibility** | Adaptive paths, resumable | Simple branching |
| **Dependencies** | Enhanced setup, QMD auto | Only what exists today |

**MVP gets users to value faster.** v2 adds sophistication for complex cases.

---

## Next Steps

1. **Create PRD** for Onboarding MVP (this document → full PRD)
2. **Implement skill** (4-6 tasks via execute-prd)
3. **Test with beta users** (get feedback on flow)
4. **Iterate on questions/paths** (based on what works)
5. **Plan v2** (self-guided with full infrastructure)
6. **Separately**: Add Notion/Linear/Jira to MCP backlog

---

## Open Questions

1. **Document upload in chat**: Can Cursor/Claude accept file uploads? If not, fallback: user saves to `inputs/onboarding-dump/` folder
2. **How much to extract**: Draft all 6 context files or just 2-3 essential ones? Recommend: 2-3 minimum, add more if content supports it
3. **Integration setup in-skill**: Should onboarding guide through `arete setup` or just say "run this command"? Recommend: Guide if possible
4. **QMD setup**: Include in onboarding or defer? Recommend: Mention but don't block on it ("Optional: run qmd setup for semantic search")
