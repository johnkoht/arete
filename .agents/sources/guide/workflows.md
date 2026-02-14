# Common PM Workflows

End-to-end workflows for typical product management tasks using Areté's skills and tools.

## Planning Workflows

### Daily Planning

**Goal**: Start each day with clarity on priorities, meetings, and context.

**Workflow**:

1. **Morning kickoff**
   ```
   User: "What's on my plate today?"
   → Agent runs daily-plan skill
   ```

2. **Agent provides**:
   - Today's focus from `now/today.md`
   - Week priorities from `now/week.md`
   - Meeting context for each of today's meetings:
     - Who's attending (with person details)
     - Recent meetings with attendees
     - Related projects
     - What you owe them
     - Prep suggestions
   - Commitments due today
   - Carry-over items from yesterday

3. **Optional follow-ups**:
   - "Prep for my 2pm meeting" → `meeting-prep` skill for deeper prep
   - "Create agenda for leadership sync" → `prepare-meeting-agenda` skill

**Skills used**: `daily-plan`, optionally `meeting-prep`, `prepare-meeting-agenda`

### Weekly Planning

**Goal**: Set 3-5 weekly priorities linked to quarter goals.

**Workflow**:

1. **Start of week**
   ```
   User: "Plan my week"
   → Agent runs week-plan skill
   ```

2. **Agent guides through**:
   - Review last week's `now/week.md` (carry-overs)
   - Review quarter goals from `goals/quarter.md`
   - Check active projects in `projects/active/`
   - Review scratchpad and commitments
   - Define 3-5 outcomes for the week
   - Link each outcome to quarter goals

3. **Output**: `now/week.md` with priorities, links to goals, commitments

4. **End of week**
   ```
   User: "Review the week"
   → Agent runs week-review skill
   ```

5. **Agent helps**:
   - Mark each priority: done / partial / carried
   - Summarize quarter goal progress
   - Optional: Capture learnings in memory

**Skills used**: `week-plan`, `week-review`

### Quarterly Planning

**Goal**: Define 3-5 quarter outcomes aligned to org strategy.

**Workflow**:

1. **Start of quarter**
   ```
   User: "Set my quarter goals"
   → Agent runs quarter-plan skill
   ```

2. **Agent guides through**:
   - Review org strategy from `goals/strategy.md` (pillars, OKRs)
   - Review prior quarter (carry-forward themes)
   - Define 3-5 outcomes for this quarter
   - Set success criteria per outcome
   - Link to org pillars/OKRs

3. **Output**: `goals/quarter.md` with outcomes, criteria, alignment

4. **Check alignment**
   ```
   User: "Show my goal alignment"
   → Agent runs goals-alignment skill
   ```

5. **Agent provides**:
   - Comparison: org pillars/OKRs vs PM quarter goals
   - Gap analysis (if requested)
   - Optional: Save snapshot to `goals/archive/`

**Skills used**: `quarter-plan`, `goals-alignment`

## Meeting Workflows

### Meeting Preparation

**Goal**: Prepare for a specific meeting with context and talking points.

**Workflow**:

1. **Before meeting**
   ```
   User: "Prep for my meeting with Jane tomorrow"
   → Agent runs meeting-prep skill
   ```

2. **Agent provides prep brief**:
   - Attendee details (from `people/`)
   - Recent meetings with attendees
   - Related projects
   - Open action items
   - Suggested talking points
   - Relevant decisions/learnings (from memory)

3. **Optional: Create agenda**
   ```
   User: "Create an agenda for my leadership sync"
   → Agent runs prepare-meeting-agenda skill
   ```

4. **Agent creates agenda document**:
   - Asks meeting type: leadership, customer, dev-team, 1:1, other
   - Loads template with type-specific sections
   - Optionally gathers context to suggest agenda items
   - Saves to `now/agendas/` or project folder

**Skills used**: `meeting-prep`, `prepare-meeting-agenda`

### Meeting Capture & Processing

**Goal**: Save meeting notes and extract decisions/learnings.

**Workflow**:

1. **After meeting (save notes)**
   ```
   User: "Save this meeting" (with notes pasted)
   → Agent runs save-meeting skill
   ```

2. **Agent creates meeting file**:
   - Extracts: title, date, attendees, summary, key points, action items, decisions
   - Saves to `resources/meetings/YYYY-MM-DD_title.md`
   - Updates meetings index

3. **Process meetings (batch)**
   ```
   User: "Process my meetings"
   → Agent runs process-meetings skill
   ```

4. **Agent processes all unprocessed meetings**:
   - Creates/updates person files in `people/` from attendees
   - Writes `attendee_ids` to meeting frontmatter
   - Extracts decisions and learnings
   - Presents for inline review: "Approve this decision for memory?"
   - Approved items → `.arete/memory/items/`

**Skills used**: `save-meeting`, `process-meetings`

### Meeting Sync (Integrations)

**Goal**: Pull meetings from external tools (Fathom, calendar).

**Workflow**:

1. **One-off sync**
   ```
   User: "Sync my meetings from this week"
   → Agent runs sync skill
   ```

2. **Agent syncs from integration**:
   - Asks which integration (Fathom, calendar)
   - Asks time range (today, this week, last N days)
   - Pulls meetings, saves to `resources/meetings/`
   - Updates meetings index

3. **Historical import (bulk)**
   ```
   User: "Seed my context from Fathom for the last 60 days"
   → Agent activates seed-context tool
   ```

4. **Agent bulk imports**:
   - Confirms scope (quick/standard/deep seed)
   - Imports historical meetings
   - Extracts decisions/learnings → `memory/pending-review.md` (queue-based review)
   - User reviews queue later

**Skills/Tools used**: `sync` (one-off), `seed-context` (bulk)

## Project Workflows

### Discovery Project

**Goal**: Understand a problem, validate assumptions, size opportunity.

**Workflow**:

1. **Start discovery**
   ```
   User: "Start a discovery project for improving onboarding"
   → Agent runs discovery skill
   ```

2. **Agent creates project**:
   - Creates `projects/active/[topic]-discovery/`
   - Asks discovery type: Problem / Solution / Market / Technical
   - Asks discovery questions (problem, users, current state, success)
   - Creates research plan

3. **Conduct research**:
   - Add inputs to `inputs/` (interviews, data, research)
   - User pastes notes, data, findings

4. **Synthesize findings**
   ```
   User: "Synthesize what we've learned"
   → Agent runs synthesize skill
   ```

5. **Agent synthesizes**:
   - Reviews all inputs in `inputs/`
   - Extracts themes, patterns, contradictions
   - Creates synthesis document in `working/`
   - Updates project README

6. **Finalize project**
   ```
   User: "Finalize this project"
   → Agent runs finalize-project skill
   ```

7. **Agent finalizes**:
   - Reviews outputs
   - Offers to update context files (business-overview, users-personas, etc.)
   - Extracts decisions/learnings for inline review
   - Approved items → `.arete/memory/items/`
   - Archives project to `projects/archive/`

**Skills used**: `discovery`, `synthesize`, `finalize-project`

### PRD Creation

**Goal**: Create a Product Requirements Document for a feature.

**Workflow**:

1. **Start PRD**
   ```
   User: "Create a PRD for checkout redesign"
   → Agent runs create-prd skill
   ```

2. **Agent creates project**:
   - Creates `projects/active/[feature-name]-prd/`
   - Adopts Product Leader persona
   - Asks strategic questions:
     - Problem space: What problem? Who has it? How urgent?
     - Solution space: Proposed approach? Alternatives? Why now?
     - Success: How will we know it works? Metrics?

3. **Agent gathers context**:
   - Runs context injection (relevant files from `context/`, `projects/`)
   - Queries memory for related decisions/learnings
   - Incorporates into discovery conversation

4. **Agent drafts PRD**:
   - User chooses template: simple / regular / full
   - Agent drafts PRD with discovered context
   - Optional light pre-mortem: risks and mitigations
   - Outputs to `outputs/prd.md`

5. **Optional: Generate prototype prompt**
   ```
   User: "Generate a prototype prompt for Lovable"
   → Agent runs generate-prototype-prompt skill
   ```

6. **Agent generates Lovable prompt**:
   - Creates Knowledge file (context for all prompts)
   - Creates Implementation prompt (what to build first)
   - User pastes into lovable.dev

7. **Finalize project** (when PRD is done)
   ```
   User: "Finalize this project"
   → Agent runs finalize-project skill
   ```

**Skills used**: `create-prd`, `generate-prototype-prompt` (optional), `finalize-project`

### Competitive Analysis

**Goal**: Research competitors and document competitive landscape.

**Workflow**:

1. **Start analysis**
   ```
   User: "Analyze Notion, Linear, and Asana"
   → Agent runs competitive-analysis skill
   ```

2. **Agent creates project**:
   - Creates `projects/active/[topic]-competitive-analysis/`
   - Asks for competitor list
   - Creates research framework for each competitor:
     - Product positioning
     - Key features
     - Pricing model
     - Target users
     - Strengths/weaknesses

3. **Conduct research**:
   - Agent searches web for each competitor
   - User adds notes, screenshots to `inputs/`

4. **Synthesize findings**
   ```
   User: "Synthesize"
   → Agent runs synthesize skill
   ```

5. **Agent synthesizes**:
   - Cross-competitor patterns
   - Opportunities and gaps
   - Positioning recommendations
   - Outputs to `outputs/competitive-analysis.md`

6. **Finalize project**
   ```
   User: "Finalize this project"
   → Agent runs finalize-project skill
   ```

7. **Agent finalizes**:
   - Offers to update `context/competitive-landscape.md`
   - Extracts learnings for memory
   - Archives project

**Skills used**: `competitive-analysis`, `synthesize`, `finalize-project`

### Roadmap Planning

**Goal**: Build a product roadmap with prioritization and timeline.

**Workflow**:

1. **Start roadmap**
   ```
   User: "Build roadmap for Q2 2026"
   → Agent runs construct-roadmap skill
   ```

2. **Agent creates project**:
   - Creates `projects/active/[name]-roadmap/`
   - Asks for scope: quarter, half, year
   - Reviews quarter goals from `goals/quarter.md`
   - Reviews active projects and backlog

3. **Agent guides prioritization**:
   - Applies framework (RICE, Value vs Effort, etc.)
   - Feature breakdown per outcome
   - Timeline and dependencies
   - Risk assessment

4. **Output roadmap**:
   - Saves to `outputs/roadmap.md`
   - Optional: Creates timeline view

5. **Finalize project**
   ```
   User: "Finalize this project"
   → Agent runs finalize-project skill
   ```

**Skills used**: `construct-roadmap`, `finalize-project`

## Onboarding Workflow (Tool)

**Goal**: Thrive at a new job with a 30/60/90 day plan.

**Workflow**:

1. **Activate onboarding tool**
   ```
   User: "I'm starting a new job"
   → Agent activates onboarding tool
   ```

2. **Agent asks scope**:
   - **Comprehensive** (default): Full 90-day plan, weekly check-ins, full context
   - **Streamlined**: 30-day focused plan, bi-weekly check-ins, core context

3. **Agent creates project**:
   - Creates `projects/active/onboarding/`
   - Generates 30/60/90 day plan with detailed first 30 days

4. **Phase 1 (Days 1-30): Learn**
   - Weekly check-ins: "Review my onboarding progress"
   - Agent guides: Fill context, map stakeholders, schedule 1:1s
   - Agent tracks: 1:1 notes, key learnings, relationship building

5. **Phase 2 (Days 31-60): Contribute**
   - Deliver first value, establish credibility
   - Agent guides: Identify quick wins, deepen expertise
   - Weekly check-ins continue

6. **Phase 3 (Days 61-90): Lead**
   - Own outcomes, influence decisions, expand impact
   - Agent guides: Take ownership, drive alignment
   - Bi-weekly check-ins

7. **Complete tool**
   ```
   User: "Complete my onboarding"
   → Agent runs finalize-project skill
   ```

8. **Agent finalizes**:
   - Reviews wins and learnings
   - Updates context with org knowledge
   - Extracts key decisions/learnings for memory
   - Archives onboarding project

**Tool used**: `onboarding`, `finalize-project`

## Context Management Workflow

**Goal**: Keep workspace context current and accurate.

**Workflow**:

1. **Periodic review**
   ```
   User: "Review my context"
   → Agent runs periodic-review skill
   ```

2. **Agent audits**:
   - Checks "Last Updated" dates in `context/` files
   - Reviews active projects for context updates
   - Checks memory for unincorporated learnings
   - Identifies stale or missing context

3. **Agent recommends updates**:
   - "Your `users-personas.md` is 6 months old. Want to refresh?"
   - "Recent meetings mention new features not in `products-services.md`"

4. **Update context**:
   - User updates context files directly, or
   - Create project to update specific context area

5. **After projects** (finalize-project skill):
   - Agent offers: "Update `context/business-model.md` with new pricing info?"
   - User approves/skips
   - If approved, agent archives old version to `context/_history/`
   - Agent updates context file

**Best practices**:
- Run periodic review quarterly
- Update context after major changes (new feature, pivot, pricing change)
- Set "Last Reviewed" dates as reminders
- Finalize projects promptly to capture learnings

**Skills used**: `periodic-review`, `finalize-project`

## Synthesis Workflow

**Goal**: Process raw inputs into structured insights.

**Workflow**:

1. **During project work** (discovery, PRD, analysis):
   - User adds inputs to `inputs/` folder (interviews, data, research notes)

2. **Run synthesis**
   ```
   User: "Synthesize what we've learned"
   → Agent runs synthesize skill
   ```

3. **Agent inventories inputs**:
   - Lists all files in `inputs/`
   - Confirms: "I see 5 interview notes, 2 data files. Synthesize all?"

4. **Agent extracts patterns**:
   - Reads all inputs
   - Extracts themes, patterns, insights
   - Identifies contradictions and gaps
   - Cross-analyzes inputs

5. **Agent produces synthesis**:
   - Structured synthesis document in `working/synthesis.md`
   - Themes and patterns
   - Key insights
   - Contradictions
   - Gaps and open questions
   - Optional: Decision framework

6. **Agent updates project**:
   - Updates project README with synthesis reference
   - User uses synthesis for PRD, roadmap, or strategy work

**Skills used**: `synthesize`

## Integration Sync Workflow

**Goal**: Keep workspace synced with external tools.

**Workflow**:

### One-off Sync (Recent Data)

1. **Pull recent meetings**
   ```
   User: "Sync my meetings from this week"
   → Agent runs sync skill
   ```

2. **Agent syncs**:
   - Asks integration: Fathom, calendar, etc.
   - Asks time range: today, this week, last N days
   - Pulls meetings
   - Saves to `resources/meetings/`
   - Updates meetings index

3. **Process synced meetings**
   ```
   User: "Process my meetings"
   → Agent runs process-meetings skill
   ```

### Bulk Import (Historical Data)

1. **Seed context**
   ```
   User: "Seed my context from Fathom for the last 60 days"
   → Agent activates seed-context tool
   ```

2. **Agent bulk imports**:
   - Confirms scope: quick (30d) / standard (60d) / deep (90d+)
   - Imports historical meetings
   - Extracts decisions/learnings → `memory/pending-review.md` (queue)

3. **Review queue (later)**
   ```
   User: "Review pending items"
   → Agent loads pending-review.md
   ```

4. **Agent presents items**:
   - One by one: "Approve this decision for memory?"
   - User approves/skips/edits
   - Approved items → `.arete/memory/items/`

**Skills/Tools used**: `sync` (one-off), `seed-context` (bulk), `process-meetings`

## Tips for Effective Workflows

### Plan Before You Execute

- Use quarter-plan → week-plan → daily-plan progression
- Link weekly priorities to quarter goals
- Review alignment regularly with goals-alignment

### Process Meetings Regularly

- Don't let meetings pile up unprocessed
- Run process-meetings weekly
- Synced meetings provide richer context (summaries, transcripts)

### Finalize Projects Promptly

- Don't leave projects lingering in `active/`
- Run finalize-project when work is done
- Extract learnings while context is fresh

### Keep Context Current

- Run periodic-review quarterly
- Update context after major changes
- Finalize projects to propagate context updates

### Leverage Memory

- Memory grows more valuable over time
- Use memory search before starting new work
- Inline review maintains memory quality

### Use Synthesis for Clarity

- Run synthesize when inputs feel overwhelming
- Use synthesis output for PRDs, roadmaps, strategy
- Cross-analyze inputs to surface contradictions
