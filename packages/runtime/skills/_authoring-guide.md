# Skill Authoring Guide: Intelligence Services

How to use Areté's intelligence layer in your custom skills. This guide provides copy-paste recipe blocks you can drop into your SKILL.md to give your skill automatic access to workspace context, memory, people, and more.

> **For output integration** (where to save files, indexing, templates), see [_integration-guide.md](./_integration-guide.md).

---

## What's Available

Areté provides intelligence services that your skill can call via CLI commands. The agent running your skill executes these commands and uses the results to enrich its work.

| Service | Command | What It Searches | Best For |
|---------|---------|-----------------|----------|
| **Context** | `arete context --for "query"` | context/, goals/, projects/, people/, meetings, conversations | Finding relevant workspace files for a topic |
| **Briefing** | `arete brief --for "query"` | All of the above + memory + entity resolution | Comprehensive pre-task context gathering |
| **Memory** | `arete memory search "query"` | .arete/memory/items/ (decisions, learnings, observations) | Finding past decisions and institutional knowledge |
| **Timeline** | `arete memory timeline "query"` | Memory items + meeting files | Understanding how a topic evolved over time |
| **Resolve** | `arete resolve "reference"` | people/, meetings/, projects/ | Disambiguating names ("Jane" → jane-smith) |
| **People** | `arete people show <slug> --memory` | Person file + auto-generated memory highlights | Getting full person context with relationship health |
| **Commitments** | `arete commitments list --person <slug>` | Extracted commitments from meetings | Finding open action items with a person |

---

## Intelligence Recipes

Drop these blocks into your SKILL.md workflow steps. Each recipe is self-contained — paste it where you need context gathering.

### Recipe 1: Quick Context Gathering

Use when your skill needs relevant workspace files but doesn't need full briefing.

```markdown
### Gather Context

Run `arete context --for "<describe the user's task>" --json` to find relevant workspace files.

This searches context/, goals/, projects/, people/, meetings, and conversations. Use the returned file paths to read relevant background before proceeding.

If the user's task maps to specific product primitives, filter with:
`arete context --for "<task>" --primitives Problem,User,Solution --json`
```

**What it returns**: File paths with relevance scores, organized by product primitive (Problem, User, Solution, Market, Risk), plus identified gaps.

---

### Recipe 2: Full Briefing (Recommended for Complex Skills)

Use when your skill needs comprehensive context — this searches everything and combines results.

```markdown
### Assemble Briefing

Run `arete brief --for "<describe the user's task>" --json`

This combines context injection, memory retrieval, and entity resolution into a single briefing organized by product primitive. Present the briefing to the user:

"Here's what I found in your workspace. Here's what might be missing."

Use the briefing to inform the rest of this workflow — reference specific decisions, context files, and people mentioned in the results.
```

**What it returns**: Context files, memory items (decisions/learnings), resolved entities (people, projects), relationship data, and gap analysis — all in one response.

---

### Recipe 3: People Resolution

Use when your skill mentions people by name and needs their full context.

```markdown
### Resolve People

For each person mentioned:

1. Run `arete resolve "<name>" --json` to find their person file
2. Run `arete people show <slug> --memory --json` to get full details including:
   - Role, team, and relationship context
   - Communication preferences and working style
   - Auto-generated memory highlights (recurring topics, stances, open items)
   - Recent meeting history

Use this context to personalize the workflow — reference their priorities, adapt to their communication style, and surface relevant history.
```

**What it returns**: Person metadata, memory highlights (what they care about, recurring asks, stances), and relationship signals.

---

### Recipe 4: Memory Search

Use when your skill needs to know what's been decided or learned about a topic.

```markdown
### Search Memory

Run `arete memory search "<topic>" --json` to find past decisions and learnings.

This searches .arete/memory/items/ — the workspace's institutional memory:
- **Decisions**: What was decided, when, why, and by whom
- **Learnings**: What was learned from experience
- **Observations**: Agent observations about workspace patterns

Use memory results to avoid re-litigating past decisions and to build on existing knowledge.
```

**What it returns**: Matching memory items with scores. Memory is a narrow, high-signal search (3 files only) — for broader search, use `arete context` or `arete brief`.

---

### Recipe 5: Commitments

Use when your skill involves people and should surface open action items.

```markdown
### Check Commitments

For relevant people, run:
`arete commitments list --person <slug> --json`

This shows:
- What you owe them (action items you committed to)
- What they owe you (action items they committed to)

Surface relevant open commitments in your output — they're often the most actionable context for meetings, planning, and reviews.
```

**What it returns**: Structured list of open commitments with direction (i_owe_them / they_owe_me), source meeting, and extracted text.

---

### Recipe 6: Entity Relationships (Combining Services)

Use when your skill needs a complete picture of a person or project with full relationship context.

```markdown
### Build Entity Profile

For a key person or project:

1. **Resolve**: `arete resolve "<name>" --json` → get slug and type
2. **Details**: `arete people show <slug> --memory --json` → full profile with memory highlights
3. **Commitments**: `arete commitments list --person <slug> --json` → open action items
4. **Timeline**: `arete memory timeline "<name>" --days 30 --json` → recent history and recurring themes

Combine these into a relationship brief that informs the rest of the workflow.
```

**What it returns**: A comprehensive entity profile with context, memory, commitments, and temporal history.

---

## Frontmatter Reference

Your SKILL.md frontmatter tells Areté's router and intelligence layer how to work with your skill.

```yaml
---
name: my-skill
description: What this skill does (used for routing)
triggers:                    # Phrases that should route to this skill
  - "trigger phrase one"
  - "trigger phrase two"
primitives:                  # Product primitives this skill works with
  - Problem                  # Options: Problem, User, Solution, Market, Risk
  - User
work_type: planning          # Options: planning, discovery, definition, execution, review
category: community          # Options: essential, default, community
intelligence:                # Intelligence services this skill uses
  - context_injection        # Gathers relevant workspace files
  - memory_retrieval         # Searches decisions and learnings
  - entity_resolution        # Resolves names to entities
  - inline_review            # Extracts decisions for user approval during execution
requires_briefing: true      # If true, agent MUST run arete brief before starting
---
```

### Key Fields

| Field | Purpose | Effect |
|-------|---------|--------|
| `requires_briefing: true` | Tells the agent to run `arete brief` before starting your skill | Agent gathers comprehensive context automatically |
| `intelligence:` | Declares which services your skill uses | Documents capabilities; used by integration hooks |
| `primitives:` | Product primitives your skill works with | Helps context injection find the right files |
| `work_type:` | Type of PM work | Affects routing priority and model tier suggestion |
| `category: community` | Marks as community/custom skill | Affects update behavior and routing weight |

**Tip**: Set `requires_briefing: true` if your skill benefits from workspace context but you don't want to write custom context-gathering steps. The agent will automatically run `arete brief` and present the results before starting your workflow.

---

## Complete Example

A realistic skill that uses intelligence services:

```markdown
---
name: stakeholder-update
description: Generate a stakeholder update for a project or initiative
triggers:
  - stakeholder update
  - status update for
  - executive summary
primitives:
  - Problem
  - Solution
  - Risk
work_type: execution
category: community
intelligence:
  - context_injection
  - memory_retrieval
  - entity_resolution
requires_briefing: true
---

# Stakeholder Update

Generate a concise stakeholder update with context from your workspace.

## Workflow

### 1. Identify the Topic

Ask the user: "What project or initiative is this update for?"

### 2. Resolve Stakeholders

For each stakeholder mentioned:

1. Run `arete resolve "<name>" --json` to find their person file
2. Run `arete people show <slug> --memory --json` to understand:
   - What they care about (recurring topics from memory highlights)
   - Their communication preferences
   - Open commitments with them

### 3. Gather Project Context

Run `arete context --for "<project name> status and progress" --json`

Read the returned project files to understand current state, goals, and recent activity.

### 4. Search Memory for Decisions

Run `arete memory search "<project name>" --json`

Find recent decisions and learnings related to this project.

### 5. Check Commitments

For each stakeholder:
`arete commitments list --person <slug> --json`

Surface any open items that should be addressed in the update.

### 6. Generate Update

Produce the update with these sections:
- **Progress**: What's been accomplished since last update
- **Decisions**: Key decisions made (from memory search)
- **Risks & Blockers**: Current risks and open items
- **Next Steps**: What's planned, including commitment follow-ups
- **Ask**: What you need from each stakeholder

Tailor language and detail level to each stakeholder's preferences (from person memory highlights).
```

---

## Expert Agent Patterns

Expert agent patterns are instruction-based intelligence phases within skills — they shift the agent into a specialized reasoning mode after mechanical workflow steps are complete. Unlike CLI recipes (which call tools and use their output), expert agent patterns are invoked by referencing them from `PATTERNS.md`; the agent then follows those steps inline as its current reasoning mode.

### Available Patterns

| Pattern | Purpose | When to Use |
|---------|---------|------------|
| `context_bundle_assembly` | Assemble strategy, memory, and people context into a structured bundle | Before any expert reasoning phase; feeds the analyst patterns |
| `significance_analyst` | Context-aware extraction of decisions and learnings — distinguishes genuine signal from discussion | When a skill needs to extract memory items and has context assembled upstream |
| `relationship_intelligence` | Context-aware relationship assessment — tracks stance changes, health signals, and generates prep recommendations | When a skill processes meeting content involving tracked people |

### When to Use Expert Agent Patterns

Expert patterns are appropriate for intelligence-heavy skills that need context-aware reasoning, not just keyword matching or data retrieval. Signals that an expert pattern is warranted:

- The skill extracts decisions or learnings from unstructured content (use `significance_analyst`)
- The skill assesses or prepares for a relationship (use `relationship_intelligence`)
- Either of the above requires assembled context first (always pair with `context_bundle_assembly`)

Skills that do straightforward data retrieval or template-driven output don't need expert patterns — use the CLI recipes in the Intelligence Recipes section instead.

### How to Reference from a Skill

After mechanical workflow steps (entity resolution, data gathering, template loading), add a step that references the pattern by name:

```markdown
### Step N: Extract Decisions and Learnings

Use the `extract_decisions_learnings` pattern from PATTERNS.md.
Context bundle was assembled in Step N-1 — pass it to `significance_analyst`
for context-aware extraction rather than keyword scanning.
```

The agent reads PATTERNS.md, follows the referenced pattern's steps, and returns to the skill workflow with the results.

> **Note**: Expert agent patterns run in the same conversation — the agent does not spawn a new agent or call a subagent. The pattern steps execute in the current context, with the context bundle already in scope.

---

## See Also

- **[Output Integration Guide](./_integration-guide.md)** — Configure where your skill saves output (projects, resources, context files) and how to enable automatic indexing
- **[Skills README](./README.md)** — Overview of Areté skills, customization, and installation
- **[Agent Skills](https://agentskills.io)** — Standard skill format and best practices
- **[skills.sh](https://skills.sh/docs)** — Community skill ecosystem and publishing
