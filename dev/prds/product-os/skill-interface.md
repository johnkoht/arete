# Areté Skill Interface Contract

> **Status**: Active — defines the contract between Areté's intelligence layer and any skill (default or third-party).
> **Date**: 2026-02-07
> **Branch**: `feature/product-os-architecture`
> **Parent**: [Product OS Vision](./vision.md)

---

## Purpose

This document defines what Areté provides to skills and what skills produce back. It is the formal contract that enables the **adapter pattern**: Areté prepares context before any skill runs and captures output after, so that both default and third-party skills benefit from Areté's intelligence without knowing its internals.

The contract has four parts:
1. **Primitive Briefing** — context assembled before a skill runs
2. **Intelligence Services** — services a skill can consume or expect pre-run
3. **Output Contract** — what a skill produces that Areté captures back
4. **Skill Metadata** — frontmatter that describes a skill to the system

---

## 1. Primitive Briefing

When Areté prepares context before a skill runs, it assembles a **primitive briefing** — a structured summary of what the workspace knows about the primitives relevant to the task.

### Format

The briefing is a markdown document (or structured section in the agent's context) organized by primitive. Only primitives relevant to the skill are included (determined by the skill's `primitives` metadata).

```markdown
## Primitive Briefing: [Task Description]

**Assembled**: YYYY-MM-DD HH:MM
**Skill**: [skill-name]
**Confidence**: High / Medium / Low (overall)

### Problem
**Known problems relevant to this task:**
- [Problem statement] — Source: [file or meeting reference]
- [Problem statement] — Source: [reference]

**Open questions:**
- [What we don't know yet]

### User
**Relevant users/people:**
- **[Name]** — [Role, Company] | Last met: [date] | [1-line context]
- **[Segment/Persona]** — [Key characteristics] | Source: [reference]

**User evidence:**
- [Quote, behavior, or data point] — Source: [reference]

### Solution
**Current state:**
- [What exists today, if anything]

**Prior approaches:**
- [What was tried before] — Outcome: [what happened] | Source: [reference]

**Active work:**
- [Related project] — Status: [status] | [1-line summary]

### Market
**Competitive context:**
- [Competitor/alternative] — [Relevance to this task]

**Market signals:**
- [Trend, timing, or external factor] — Source: [reference]

### Risk
**Known risks:**
- [Risk] — Severity: [High/Med/Low] | Mitigation: [if known]

**Relevant decisions:**
- [Past decision] — [date] | [Rationale summary] | Source: [reference]

**Relevant learnings:**
- [Learning] — [date] | [Implication] | Source: [reference]

### Gaps
**What's missing that this skill might need:**
- [Gap description] — Suggestion: [how to fill it]
```

### Assembly Rules

1. **Primitive selection**: Include only primitives listed in the skill's `primitives` metadata. If the skill has no `primitives` field, include all five.
2. **Source priority**: Context files (`context/`) > active projects (`projects/active/`) > memory (`.arete/memory/`) > resources (`resources/`). More recent sources take precedence.
3. **Depth**: Keep each primitive section to 3-8 bullet points. The briefing is a summary, not a dump. Link to source files for depth.
4. **Gaps are explicit**: Always include a Gaps section. Calling out what's missing is as valuable as what's present.
5. **Confidence**: Rate overall confidence based on how much relevant context was found. Low = sparse workspace, many gaps. High = rich context across relevant primitives.

### When to Brief

- **Before any skill tagged `requires_briefing: true`** (default for community/third-party skills)
- **Before any skill with `category: community`** in metadata
- **Optional for essential/default skills** that have their own context-gathering steps
- **Always when the user explicitly says** "prep context" or "what do we know about X"

---

## 2. Intelligence Services

Intelligence services are capabilities the agent can invoke during or before skill execution. They are described here as patterns and conventions rather than formal APIs — they are agent behaviors, not code endpoints.

### 2.1 Context Injection

**Purpose**: Given a task, assemble relevant context from workspace files.

**What it does**:
- Reads relevant `context/` files based on task topic
- Reads `goals/strategy.md` and `goals/quarter.md` for strategic alignment
- Scans `projects/active/` for related work
- Produces the Primitive Briefing (§1) or a subset of it

**When to use**: Before any substantial skill. Lightweight skills (save-meeting, workspace-tour) may skip.

**Pattern**:
```
1. Determine which primitives are relevant (from skill metadata or task analysis)
2. For each primitive, identify workspace files that inform it
3. Read files, extract relevant excerpts
4. Assemble into Primitive Briefing format
5. Note gaps
```

### 2.2 Memory Retrieval

**Purpose**: Surface relevant decisions, learnings, and past work from `.arete/memory/` and `resources/`.

**What it does**:
- Searches `.arete/memory/items/decisions.md` for related decisions
- Searches `.arete/memory/items/learnings.md` for related learnings
- Optionally runs QMD queries for semantic search across the workspace
- Returns relevant items with source references

**When to use**: During context injection (feeds into the briefing) and during skill execution when the agent encounters a topic that might have history.

**Pattern**:
```
1. Identify keywords/topics from the current task
2. Search decisions.md and learnings.md for matches
3. Run QMD queries if available: qmd query "[topic]"
4. Return matched items with date, source, and summary
```

### 2.3 Entity Resolution

**Purpose**: Resolve ambiguous references ("Jane", "the Acme meeting", "that onboarding project") to specific workspace entities.

**What it does**:
- Resolves person names to people slugs and files (`people/{category}/{slug}.md`)
- Resolves meeting references to specific meeting files (`resources/meetings/`)
- Resolves project references to active/archived projects
- Classifies people as internal/external using `internal_email_domain` config

**When to use**: Whenever a skill involves people, meetings, or projects referenced by name.

**Shared pattern** (extracted from `get_meeting_context`):
```
Person resolution:
1. Search people/index.md or people/**/*.md for name match
2. Match by slug (slugify name), email, or partial name
3. Return: slug, category, file path, key metadata (role, company)

Meeting resolution:
1. List resources/meetings/*.md
2. Filter by attendee_ids, title, or date
3. Sort by date descending
4. Return: file path, title, date, attendees summary

Project resolution:
1. Scan projects/active/*/README.md
2. Match by title, stakeholders, or topic keywords
3. Return: project path, status, 1-line summary
```

### 2.4 Synthesis

**Purpose**: Take N inputs and produce structured insights — patterns, contradictions, findings, recommendations.

**What it does**:
- Reads multiple input documents
- Extracts facts, interpretations, and questions from each
- Identifies patterns, contradictions, and surprises across inputs
- Produces structured synthesis output (findings, recommendations, open questions)

**When to use**: After gathering evidence in a project, after importing multiple meetings, or when any workflow needs to distill inputs into insights.

**Pattern**:
```
1. Inventory inputs (files to synthesize)
2. For each input: extract key facts, interpretations, questions
3. Cross-input analysis: patterns, contradictions, surprises, gaps
4. Produce structured output with confidence levels and source citations
5. Optionally extract candidate decisions/learnings for memory
```

### 2.5 Inline Review

**Purpose**: Present candidate decisions and learnings extracted from content for user approval before writing to memory.

**What it does**:
- Identifies potential decisions and learnings from processed content
- Presents each with source reference and suggested format
- User approves, edits, or skips each item
- Approved items are appended to `.arete/memory/items/decisions.md` or `learnings.md`

**When to use**: After synthesis, after processing meetings, after sync imports — any time extracted insights should be committed to institutional memory.

**Pattern**:
```
1. Scan content for decision signals ("we decided", "going with", "the plan is")
2. Scan content for learning signals (insights, user quotes, surprises)
3. Present candidates: title, source, context, suggested format
4. For each: Approve / Edit / Skip
5. Write approved items to .arete/memory/items/
```

### Service Availability for Skills

| Service | Essential defaults | Community/third-party |
|---------|-------------------|----------------------|
| Context injection | Available, often skill handles its own | Pre-run via Primitive Briefing |
| Memory retrieval | Available during execution | Pre-run (included in briefing) |
| Entity resolution | Available during execution | Available during execution |
| Synthesis | Available during execution | Available during execution |
| Inline review | Available after execution | Available after execution |

---

## 3. Output Contract

When a skill completes, Areté expects to capture outputs back into the workspace. Skills should produce artifacts in predictable locations and formats.

### 3.1 Project Files

If the skill operates within a project, outputs go to the project's standard structure:

```
projects/active/[project-name]/
├── README.md          # Updated status, completion notes
├── inputs/            # Raw inputs captured during the skill
├── working/           # Drafts, synthesis, iterations
└── outputs/           # Final deliverables
```

**Conventions**:
- Final deliverables in `outputs/` with descriptive names (e.g., `prd-feature-name.md`, `findings.md`, `competitive-analysis.md`)
- Working documents in `working/` (e.g., `synthesis.md`, `draft-roadmap.md`)
- All files are markdown with clear headers and metadata

### 3.2 Memory Items

Skills that surface decisions or learnings should produce them in the standard memory format:

**Decisions** (appended to `.arete/memory/items/decisions.md`):
```markdown
### YYYY-MM-DD: [Decision Title]

**Project**: [Project name, if applicable]
**Context**: [What led to this decision]
**Decision**: [What was decided]
**Rationale**: [Why this choice]
**Alternatives Considered**: [If known]
**Status**: Active
**Review Date**: [When to revisit, if applicable]
```

**Learnings** (appended to `.arete/memory/items/learnings.md`):
```markdown
### YYYY-MM-DD: [Learning Title]

**Source**: [What surfaced this]
**Insight**: [What was learned]
**Implications**: [How this affects future work]
**Applied To**: [Updated as learning is used]
```

**Rule**: Skills should never write directly to memory without user review. Use the Inline Review service (§2.5) to present candidates for approval.

### 3.3 Context Updates

Skills that produce findings which update business context should:
1. Identify which `context/` files need updating
2. Present proposed changes to the user
3. Archive the previous version to `context/_history/YYYY-MM-DD_[file].md`
4. Apply the update with a Change History entry

Context updates typically happen during `finalize-project`, not during the skill itself.

### 3.4 Follow-up Actions

Skills should surface follow-up actions that the user or agent can pick up later:

```markdown
### Suggested Next Steps
- [ ] [Action item] — [Why / context]
- [ ] [Action item] — [Why / context]

### Suggested Skills
- [skill-name]: [Why this skill would be useful next]
```

Follow-ups can be:
- Added to `now/scratchpad.md` (parking lot)
- Added to the project README (project-specific)
- Presented in chat (ephemeral)

### 3.5 Output Summary

Every skill execution should end with a brief summary of what was produced:

```markdown
## Summary

**Skill**: [skill-name]
**Project**: [project-name, if applicable]

**Produced**:
- [Output file or artifact]
- [Memory items (N decisions, N learnings)]

**Follow-ups**:
- [Suggested next actions]
```

---

## 4. Skill Metadata

Skills declare their characteristics via YAML frontmatter. This metadata is used by the skill router, the intelligence layer (to determine what context to assemble), and the UI (to describe skills to users).

### Current Frontmatter

```yaml
---
name: skill-name
description: One-line description. Use when the user wants to...
triggers:                    # Optional — phrases that strongly indicate this skill
  - trigger phrase one
  - trigger phrase two
---
```

### Extended Frontmatter

```yaml
---
name: skill-name
description: One-line description. Use when the user wants to...
triggers:                    # Optional — phrases that strongly indicate this skill
  - trigger phrase one
  - trigger phrase two

# --- New fields (Phase 2) ---

primitives:                  # Which product primitives this skill builds clarity on
  - Problem
  - User
  # Valid values: Problem, User, Solution, Market, Risk

work_type: discovery         # What kind of work this skill supports
  # Valid values: discovery, definition, delivery, analysis, planning, operations

category: default            # How tightly coupled to Areté this skill is
  # essential — Core to Areté, not replaceable (finalize-project, workspace-tour)
  # default   — Ships with Areté, opinionated but swappable (create-prd, discovery)
  # community — Third-party or user-created skill

intelligence:                # Intelligence services this skill consumes
  - context_injection
  - entity_resolution
  # Valid values: context_injection, memory_retrieval, entity_resolution, synthesis, inline_review

requires_briefing: false     # Whether Areté should assemble a Primitive Briefing before this skill runs
                             # Default: false for essential, true for community

creates_project: true        # Whether this skill creates/operates within a project
project_template: discovery  # Which project template to use (maps to templates/projects/{name}/)
---
```

### Field Definitions

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Unique skill identifier (kebab-case) |
| `description` | Yes | string | One-line description including "Use when..." trigger |
| `triggers` | No | string[] | Phrases that strongly indicate this skill (used by router) |
| `primitives` | No | string[] | Product primitives this skill builds clarity on |
| `work_type` | No | enum | Work type: discovery, definition, delivery, analysis, planning, operations |
| `category` | No | enum | essential, default, or community. Default: `default` |
| `intelligence` | No | string[] | Intelligence services consumed |
| `requires_briefing` | No | boolean | Whether to assemble Primitive Briefing pre-run. Default: false |
| `creates_project` | No | boolean | Whether this skill creates/works within a project |
| `project_template` | No | string | Project template name (maps to `templates/projects/{name}/`) |

### Work Types

| Work Type | Description | Example Skills |
|-----------|-------------|----------------|
| `discovery` | Understanding problems, validating assumptions, research | discovery, competitive-analysis |
| `definition` | Defining solutions, requirements, specifications | create-prd |
| `delivery` | Shipping, launching, communicating results | construct-roadmap, generate-mockup |
| `analysis` | Researching, comparing, evaluating | competitive-analysis, synthesize |
| `planning` | Setting goals, priorities, schedules | quarter-plan, week-plan, week-review, daily-plan, goals-alignment |
| `operations` | Workspace management, lifecycle, data flow | save-meeting, sync, finalize-project, process-meetings, periodic-review, workspace-tour |

Note: A skill can serve multiple work types (e.g., competitive-analysis is both discovery and analysis). Use the primary work type. The `primitives` field captures the knowledge dimension; `work_type` captures the activity dimension.

### Skill Router Impact

The skill router (`src/core/skill-router.ts`) currently uses `name`, `description`, and `triggers`. The new fields are additive — they don't change routing behavior but enable:
- **Primitive-aware context assembly**: Router can tell the intelligence layer which primitives to brief on
- **Work-type routing**: "I want to do discovery" can match skills by `work_type`
- **Category awareness**: Router can prefer essential/default skills over community for core operations

---

## 5. Shared Intelligence Patterns

These are documented patterns that multiple skills reference rather than inlining. They live as named patterns in this contract and are referenced by skill files.

### Pattern: `get_meeting_context`

**Used by**: meeting-prep, daily-plan, process-meetings (partially)

**Purpose**: Given a meeting (title and/or attendees), assemble full context about the people, prior meetings, related projects, and outstanding action items.

**Steps**:
1. **Resolve attendees** (Entity Resolution): Match names to people slugs via `people/index.md` or `people/**/*.md`
2. **Read person files**: For each attendee, read `people/{category}/{slug}.md`. Extract name, role, company, recent notes
3. **Search meetings**: List `resources/meetings/*.md`. Filter by `attendee_ids` or name mentions. Sort by date descending; take 1-3 most recent
4. **Read projects**: Scan `projects/active/*/README.md` for stakeholder matches
5. **Extract action items**: From recent meetings, collect unchecked items (`- [ ] ...`) referencing attendees
6. **QMD search** (optional): `qmd query "decisions or learnings involving [attendee] or [company]"`

**Returns**: Attendee details, recent meetings (with summaries), related projects, outstanding action items, prep suggestions

### Pattern: `extract_decisions_learnings`

**Used by**: process-meetings, sync, finalize-project

**Purpose**: Scan content for candidate decisions and learnings, present for inline review, write approved items to memory.

**Steps**:
1. **Scan for decisions**: Look for signals — "we decided", "going with", "the plan is", "consensus was"
2. **Scan for learnings**: Look for signals — user insights, process observations, market/competitive insights, surprises
3. **Format candidates**: Title, source reference, context quote, suggested memory format
4. **Present for review**: Approve / Edit / Skip per item
5. **Write approved items**: Append to `.arete/memory/items/decisions.md` or `learnings.md`

---

## 6. Lifecycle: Before / During / After

Summary of the full skill execution lifecycle with intelligence integration.

```
┌─────────────────────────────────────────────┐
│                  BEFORE                      │
│                                              │
│  1. Route to skill (skill router)            │
│  2. Load skill metadata (frontmatter)        │
│  3. If requires_briefing or community:       │
│     → Run Context Injection                  │
│     → Assemble Primitive Briefing            │
│     → Present briefing + gaps to user        │
│  4. If creates_project:                      │
│     → Scaffold project from template         │
│                                              │
├─────────────────────────────────────────────┤
│                  DURING                      │
│                                              │
│  5. Execute skill workflow                   │
│     → Skill can invoke intelligence services │
│       (entity resolution, memory retrieval,  │
│        synthesis) as needed                  │
│  6. Produce outputs to project structure     │
│                                              │
├─────────────────────────────────────────────┤
│                  AFTER                       │
│                                              │
│  7. Run extract_decisions_learnings if       │
│     skill produced substantial content       │
│  8. Present follow-up actions                │
│  9. Suggest next skills                      │
│ 10. Output summary                           │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 7. Example: Third-Party PRD Skill

To illustrate the contract, here's how a third-party PRD skill from skills.sh would work with Areté:

1. **User says**: "Create a PRD for the new search feature"
2. **Skill router**: Routes to user's preferred PRD skill (or Areté default)
3. **Before** (Areté handles):
   - Reads skill metadata: `primitives: [Problem, User, Solution, Risk]`, `work_type: definition`
   - Assembles Primitive Briefing with Problem (what we know about search problems), User (who needs search), Solution (prior search work), Risk (past failures, technical constraints)
   - Presents: "Here's what I've gathered about the search feature context. Here's what's missing."
4. **During** (third-party skill handles):
   - Runs its own PRD creation procedure (questions, templates, whatever)
   - Has full context from the briefing without knowing Areté's file structure
5. **After** (Areté handles):
   - Captures PRD output to `projects/active/search-prd/outputs/`
   - Runs `extract_decisions_learnings` on the PRD content
   - Suggests: "Want to generate a mockup? Run competitive analysis on search alternatives?"

The third-party skill never reads `context/` files or `.arete/memory/` directly. Areté's intelligence layer provides everything through the briefing, and captures everything through the output contract.

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Briefing is markdown, not JSON/structured data | Agent context is text. Markdown is readable by both agents and humans. Structured data can come later. |
| Intelligence services are patterns, not APIs | No runtime code exists for these yet. Defining them as agent behavior patterns lets skills reference them today. Code extraction happens in Phase 3. |
| `requires_briefing` defaults to false | Essential skills have their own context-gathering steps. Forcing a briefing would duplicate work. Community skills need it because they don't know Areté's internals. |
| Inline review required for memory writes | Institutional memory is high-value. Automated writes risk noise. User approval keeps quality high. |
| Shared patterns extracted and named | `get_meeting_context` and `extract_decisions_learnings` are duplicated across skills today. Naming them and defining them once enables DRY references. |
| Work types are activity-based, primitives are knowledge-based | Two orthogonal dimensions. A skill can do discovery (activity) focused on User and Problem (knowledge). Both are useful for routing and context assembly. |
