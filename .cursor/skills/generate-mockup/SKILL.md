---
name: generate-mockup
description: Generate interactive UI mockups and prototypes from PRDs, discovery findings, or feature ideas using Lovable or Vercel v0. Use when the user wants to visualize a feature, create a prototype, build a mockup, or see what something would look like.
---

# Generate Mockup Skill

Generate interactive UI mockups and prototypes from PM artifacts using AI design tools.

## When to Use

- "Generate a mockup for this feature"
- "Create a prototype from my PRD"
- "Visualize this user flow"
- "What would this look like?"
- "Build a quick prototype"
- After completing a PRD or discovery

## Prerequisites

This skill requires one of these MCP integrations to be configured:

- **Lovable MCP** - [Setup docs](https://docs.lovable.dev/integrations/mcp-servers)
- **Vercel v0** - Alternative for UI generation

If neither is configured, the skill will generate a detailed prompt the user can paste into their preferred tool.

## Workflow

### 1. Gather Context

Before generating, collect relevant context:

**From Current Project** (if active):
- PRD outputs (`outputs/prd-*.md`)
- Discovery findings (`outputs/findings.md`)
- Working drafts (`working/`)

**From Workspace Context**:
- User personas (`context/users-personas.md`)
- Product context (`context/products-services.md`)
- Brand/design guidelines (if documented)

### 2. Clarify Scope

Ask the user to specify:

```markdown
Before generating, I need a few details:

**What to prototype:**
- [ ] Full application/feature
- [ ] Single screen/page
- [ ] User flow (multiple screens)
- [ ] Specific component

**Fidelity level:**
- [ ] Wireframe (low-fi, focus on structure)
- [ ] Polished UI (high-fi, production-ready look)

**Any specific requirements?**
- Screens to include
- Key interactions
- Design constraints
```

### 3. Build the Prompt

Structure the prompt for the design tool:

```markdown
## Context
[Product/feature description from PRD or discovery]

## Target Users
[From personas - who is this for, what do they need]

## Requirements
[Key features/functionality to include]

## Screens/Flow
[Specific screens or user journey to prototype]

## Design Notes
[Any style, brand, or UX requirements]

## Fidelity
[Wireframe or polished]
```

### 4. Generate Mockup

**If Lovable MCP is available:**
- Use the MCP tools to create the prototype
- Lovable will generate an interactive, shareable prototype

**If Vercel v0 MCP is available:**
- Use v0 to generate UI components/screens
- Better for individual screens and components

**If no MCP available:**
- Output the structured prompt
- User can paste into Lovable, v0, or similar tool
- Provide the prompt in a copyable format

### 5. Save Output

After generation, save to the project:

```markdown
## Mockup: [Feature Name]

**Generated**: YYYY-MM-DD
**Tool**: Lovable / v0 / Manual
**Fidelity**: Wireframe / Polished

### Link
[Prototype URL]

### Screens Included
- [Screen 1]: [Description]
- [Screen 2]: [Description]

### Prompt Used
[Copy of the generation prompt for future reference]

### Notes
[Any feedback, iterations needed, or follow-ups]
```

Save to:
- `working/mockup-[feature].md` (if iterating)
- `outputs/mockup-[feature].md` (if finalized)

## Tool Preferences

If the user has a preferred tool, respect it. Otherwise, ask:

```
Which tool would you like to use for this mockup?
1. Lovable - Full interactive prototypes
2. Vercel v0 - UI components and screens
3. Generate prompt only - I'll use my own tool
```

**Future**: This could be stored in a workspace preferences file.

## Prompt Templates

### For Full Feature Prototype

```
Build an interactive prototype for [FEATURE NAME].

**Product Context:**
[Brief product description]

**Target User:**
[Primary persona and their goal]

**Core User Flow:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Key Screens:**
- [Screen]: [Purpose and key elements]

**Requirements:**
- [Requirement 1]
- [Requirement 2]

**Design Style:**
[Modern/minimal/corporate/playful] with [any specific notes]
```

### For Single Screen

```
Design a [SCREEN TYPE] screen for [PRODUCT].

**Purpose:**
[What this screen does]

**User:**
[Who uses it and why]

**Key Elements:**
- [Element 1]
- [Element 2]

**Interactions:**
- [What happens when user does X]

**Style:**
[Fidelity and design notes]
```

### For User Flow

```
Create a [NUMBER]-screen flow for [TASK/JOURNEY].

**Flow Overview:**
[Brief description of the journey]

**Screens:**
1. [Screen 1]: [Purpose] → leads to [Screen 2]
2. [Screen 2]: [Purpose] → leads to [Screen 3]
...

**Key Interactions:**
- [Interaction point and expected behavior]

**Success State:**
[What does completion look like]
```

## Integration with Other Skills

**After PRD Creation** (`create-prd`):
- Offer to generate mockup: "PRD complete. Want to visualize this with a quick prototype?"

**During Discovery** (`discovery`):
- Prototype ideas to validate: "Want to mock this up before user testing?"

**For Competitive Analysis** (`competitive-analysis`):
- Visualize differentiation: "Want to prototype how our approach differs?"

## Error Handling

**No project context:**
- Ask user to describe what they want to prototype
- Proceed with user-provided details only

**MCP not configured:**
- Generate the prompt anyway
- Provide clear instructions for manual generation
- Suggest setting up MCP for future use

**Unclear requirements:**
- Ask clarifying questions before generating
- Better to ask upfront than generate wrong thing

## Tips for Better Results

- **Be specific about users**: Include persona details for better UX decisions
- **Reference existing products**: "Similar to [app]'s approach to X"
- **Include constraints**: Mobile-first, accessibility needs, brand colors
- **Start with flows**: User journeys produce more coherent prototypes than feature lists
