# Intelligence Services

Intelligence services provide context, search, and resolution capabilities that make skills and workflows dramatically more effective. These services run automatically during skill execution or can be invoked manually via CLI.

## Overview

Intelligence services are the foundation of Areté's context-aware capabilities. They assemble relevant workspace information, search institutional memory, resolve ambiguous references, and combine everything into comprehensive briefings.

## Context Injection

**Command**: `arete context --for "query"`

**Purpose**: Map product primitives (Problem, User, Solution, Market, Risk) to workspace files and assemble a context bundle.

**What it does**:
- Maps query to relevant product primitives
- Searches workspace for files matching those primitives
- Identifies gaps (missing context)
- Returns file paths with relevance scores

**Example**:
```bash
arete context --for "user onboarding improvements"
```

**Returns**:
- Relevant files from `context/`, `goals/`, `projects/`
- Gaps: Missing primitives or context areas
- Scores: Relevance ranking per file

**Used by**: Skills with `intelligence: context_injection` in frontmatter (create-prd, discovery, competitive-analysis, etc.)

**Product Primitives**:
- **Problem** - Business/user problems being solved
- **User** - User personas, needs, behaviors
- **Solution** - Products, features, capabilities
- **Market** - Competitive landscape, market dynamics
- **Risk** - Dependencies, constraints, blockers

## Memory Retrieval

**Command**: `arete memory search "query"`

**Purpose**: Search across `.arete/memory/` items (decisions, learnings) using token-based or semantic search (if QMD installed).

**What it does**:
- Searches memory items: decisions, learnings, observations
- Token-based search (default) or semantic search (QMD)
- Returns matching items with scores and context

**Example**:
```bash
arete memory search "pricing model"
```

**Returns**:
- Matching decisions (when, what, why, who)
- Relevant learnings and observations
- Context snippets with match scores

**Used by**: Skills with `intelligence: memory_retrieval` in frontmatter (meeting-prep, create-prd, synthesize, etc.)

**Memory Structure**:
- **L1: Resources** (`resources/`) - Raw inputs (meetings, notes)
- **L2: Items** (`.arete/memory/items/`) - Atomic facts (decisions, learnings)
- **L3: Summaries** (`.arete/memory/summaries/`) - Synthesized context (collaboration profile)

**When memory is updated**:
- `process-meetings` - Extracts from meetings
- `finalize-project` - Extracts from project work
- `arete people memory refresh` - Updates person-specific recurring asks/concerns in `people/*/*.md`
- `arete people memory refresh --person <slug> --if-stale-days N` - Targeted stale-aware refresh for prep/planning flows
- Skills automatically append during key decisions

## Entity Resolution

**Command**: `arete resolve "reference"`

**Purpose**: Fuzzy resolve names to people, meetings, or projects.

**What it does**:
- Resolves ambiguous names (first name, partial match)
- Searches across: `people/`, `resources/meetings/`, `projects/`
- Returns matching entities with paths and details

**Example**:
```bash
arete resolve "Jane"
```

**Returns**:
- Person files: `people/internal/jane-smith.md`
- Recent meetings with Jane
- Projects mentioning Jane

**Used by**: Skills with `intelligence: entity_resolution` in frontmatter (meeting-prep, daily-plan, process-meetings)

**Resolution Strategy**:
1. Exact match (email, slug)
2. Name match (full name)
3. Fuzzy match (first name, partial)
4. Context-based ranking (recent interactions, project involvement)

## Briefing Assembly

**Command**: `arete brief --for "query"`

**Purpose**: Combine all services into a comprehensive briefing (context + memory + resolved entities).

**What it does**:
- Runs context injection for query
- Retrieves relevant memory items
- Resolves mentioned entities
- Assembles comprehensive briefing with all sources

**Example**:
```bash
arete brief --for "redesign checkout flow"
```

**Returns**:
- **Context**: Relevant workspace files (context, projects, goals)
- **Memory**: Related decisions and learnings
- **Entities**: Resolved people, meetings, projects
- **Gaps**: Missing information or context

**Used by**: Skills with `requires_briefing: true` in frontmatter

**Briefing Structure**:
```
## Context
- [List of relevant files with paths]

## Memory
- [Decisions and learnings from memory]

## Entities
- [Resolved people, meetings, projects]

## Gaps
- [Missing context or information]
```

## Routing

**Command**: `arete route "query" [--json]`

**Purpose**: Route user message to best-matching skill or tool, suggest model tier (fast/balanced/powerful).

**What it does**:
- Analyzes user intent and keywords
- Matches to skill/tool triggers and descriptions
- Suggests model tier based on complexity
- Returns routing decision with confidence

**Example**:
```bash
arete route "create meeting agenda"
```

**Returns**:
```json
{
  "type": "skill",
  "id": "prepare-meeting-agenda",
  "action": "load",
  "model": "balanced"
}
```

**Used by**: Agents at the start of every PM action (mandatory workflow)

**Model Tiers**:
- **fast**: Simple, well-defined tasks (save-meeting, workspace-tour)
- **balanced**: Standard PM work (meeting-prep, week-plan, process-meetings)
- **powerful**: Complex reasoning (create-prd, discovery, competitive-analysis)

## Synthesis (Intelligence Service)

**Purpose**: Extract patterns, contradictions, and insights from inputs. Used during project work to process raw inputs into structured insights.

**What it does**:
- Inventories inputs in project `inputs/` folder
- Extracts themes and patterns
- Identifies contradictions and gaps
- Produces structured synthesis document

**Used by**: `synthesize` skill, `finalize-project` skill

**Pattern**: Extract → Cross-analyze → Synthesize → Document

## Inline Review

**Purpose**: Extract decisions and learnings during skill execution and get immediate user approval before writing to memory.

**What it does**:
- During skill execution, extract candidate decisions/learnings
- Present to user for review (approve/skip/edit)
- Approved items written to `.arete/memory/items/`
- Maintains memory quality through user confirmation

**Used by**: Skills with `intelligence: inline_review` in frontmatter (finalize-project, process-meetings)

**Pattern**:
1. Extract candidates from work (decisions, learnings)
2. Present for inline review: "Approve this decision for memory?"
3. User approves/skips/edits
4. Write approved items to memory

**Contrast with Queue-based Review**:
- **Inline**: Immediate review during skill execution (focused work)
- **Queue**: Batch review later (bulk imports via seed-context tool)

## How Services Work Together

**Example: Meeting Prep Workflow**

1. User: "Prep for my meeting with Jane about checkout redesign"
2. **Routing**: Routes to `meeting-prep` skill
3. **Entity Resolution**: Resolves "Jane" → `people/internal/jane-smith.md`
4. **Memory Retrieval**: Searches for "checkout" decisions/learnings
5. **Context Injection**: Finds relevant context (users, products, checkout projects)
6. Agent assembles prep brief combining all sources

**Example: PRD Creation Workflow**

1. User: "Create a PRD for mobile notifications"
2. **Routing**: Routes to `create-prd` skill
3. **Briefing Assembly**: Runs full brief (context + memory + entities)
4. **Context Injection**: Finds user personas, product docs, notification-related projects
5. **Memory Retrieval**: Finds past decisions about notifications, push strategy
6. Agent guides discovery with full context

## QMD Integration (Optional)

When [QMD Search](https://github.com/tobi/qmd) is installed, memory retrieval and context injection gain semantic search capabilities:

- **Keyword search** (fast): `qmd search "keyword"`
- **Semantic search** (concept-based): `qmd vsearch "concept"`
- **Hybrid search** (best quality): `qmd query "question"`

**Setup**:
```bash
# Install QMD
bun install -g https://github.com/tobi/qmd

# Create collection
qmd collection add ~/path/to/workspace --name arete

# Add context descriptions
qmd context add qmd://arete/context "Core business context"
qmd context add qmd://arete/projects "PM projects"
qmd context add qmd://arete/memory "Decisions and learnings"

# Generate embeddings
qmd embed
```

**Maintenance**:
- `qmd update`: Re-index after adding/editing files
- `qmd embed`: Regenerate embeddings (weekly/monthly)

Skills that use memory retrieval will automatically leverage QMD when available.

## CLI Reference

```bash
# Intelligence Services
arete context --for "query"           # Inject context
arete memory search "query"           # Search memory
arete resolve "reference"             # Resolve entity
arete brief --for "query"             # Assemble briefing
arete route "query" [--json]          # Route to skill/tool

# Supporting Commands
arete people list                     # List people
arete people show <slug|email>        # Show person details
arete people memory refresh           # Refresh person memory highlights
arete pull calendar [--today]         # Pull calendar events
arete pull fathom [--days N]          # Pull Fathom recordings
```
