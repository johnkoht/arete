---
name: generate-prototype-prompt
description: Generate a Lovable-ready prototype prompt from a PRD, plan, or conversation. Outputs a Knowledge file and implementation prompt the user pastes into Lovable. Use when the user wants to create a prototype, visualize a feature, or get a prompt for Lovable.
primitives:
  - Solution
  - User
work_type: delivery
category: default
intelligence:
  - context_injection
requires_briefing: false
---

# Generate Prototype Prompt Skill

Generate a Lovable-ready prototype prompt from a PRD, plan, or conversation. Outputs two files optimized for [Lovable](https://lovable.dev): a **Knowledge file** (context Lovable uses for every prompt) and an **Implementation prompt** (what to build first). The user pastes both into Lovable to build the prototype.

## When to Use

- "Generate a prototype prompt"
- "Create a prompt for Lovable from this PRD"
- "I want to build a prototype" (with a plan or PRD)
- "Visualize this feature in Lovable"
- After completing a PRD: "Do you want a prompt for Lovable to build a prototype?"

## Prerequisites

- **Input**: A PRD, a plan file, or a short conversation (this skill gathers context)
- **Output**: User pastes the generated files into [lovable.dev](https://lovable.dev) (no Areté integration required)

## Workflow

### 1. Detect Input Mode

Check the current project and workspace:

**Mode 1 – From PRD**
- Look for PRD in `outputs/prd-*.md` or `working/prd-*.md`
- If found, use PRD as primary source

**Mode 2 – From Plan**
- Look for a plan file (e.g. `.cursor/plans/*.plan.md` or project plan)
- If found, use plan as primary source

**Mode 3 – From Conversation**
- No PRD or plan found
- Ask 4–5 focused questions to build the prompt (see Conversation questions below)

If multiple sources exist, prefer PRD over plan over conversation. Optionally ask: "I found a PRD and a plan. Use PRD, plan, or both?"

### 2. Clarify Scope (Quick Questions)

Ask the user:

```markdown
A few quick questions to tailor the prompt:

1. **Build scope:**
   - [ ] Single screen (one page, mock data)
   - [ ] User flow (3–5 connected screens)
   - [ ] Full feature (all screens described)

2. **Fidelity:**
   - [ ] Wireframe (structure, minimal styling)
   - [ ] Polished (production-ready UI)

3. **Roles:** Does this app have different user types (e.g. Admin, User)?
   - If yes: Which role is this prototype for?

4. **Guardrails:** Any existing components/pages to avoid? (e.g. "Do not edit /shared/Layout")
```

Defaults if user skips: **User flow**, **Polished**, no roles, no guardrails.

### 3. Extract Context

From PRD, plan, or conversation answers, extract:

- **Product vision**: What this is, who it’s for, why it exists (2–3 sentences)
- **User persona(s)**: Who, goal, pain points
- **Key features**: Prioritized list (3–7)
- **Main user journey**: Steps 1 → 2 → 3 → completion
- **Design guidance**: Style, fidelity, any constraints

If content is very long (e.g. PRD > ~10k chars), summarize for the Knowledge file: keep problem, users, core flow, key requirements; drop long background, alternatives, implementation details.

### 4. Generate Two Files

Create a **dated prototype folder** in the project:

```
projects/active/[project-name]/prototypes/YYYY-MM-DD_[feature-slug]/
├── knowledge.md       # Lovable Knowledge file
├── implementation.md  # First build prompt
└── README.md          # Meta + instructions
```

**File: knowledge.md**

Use this structure (Lovable best practices: [best practice](https://docs.lovable.dev/tips-tricks/best-practice), [from idea to app](https://docs.lovable.dev/tips-tricks/from-idea-to-app)):

```markdown
# Product Vision

[Product name] helps [target users] [achieve goal] by [key differentiator].

**Problem:** [2–3 sentences on the problem this solves]

**Solution:** [2–3 sentences on how this solves it]

# User Personas

## [Primary Persona Name]
- **Who they are:** [Job title, context, tech comfort]
- **Their goal:** [What they're trying to accomplish]
- **Pain points:** [What frustrates them today]
- **Success looks like:** [Outcome they want]

[Add more personas if applicable]

# Key Features

1. **[Feature 1 Name]:** [What it does and why it matters]
2. **[Feature 2 Name]:** [What it does and why it matters]
3. **[Feature 3 Name]:** [What it does and why it matters]

# User Journeys

## [Main Journey Name]
User wants to [goal].

Steps:
1. [User action] → [System response]
2. [User action] → [System response]
3. [User action] → [System response]
4. [Completion state]

[Add more journeys for other features]

# Design System

- **Style:** [Modern, minimal, playful, professional, etc.]
- **Fidelity:** [Wireframe = structure only | Polished = production-ready]
- **Key patterns:** [e.g. card-based layout, sidebar navigation]
- **Accessibility:** [Standard best practices]

# Roles & Permissions
[If app has multiple user types]

- **[Role 1]:** Can [actions]. Cannot [actions].
- **[Role 2]:** Can [actions]. Cannot [actions].
```

**File: implementation.md**

Use this structure (verbose, step-by-step, frontend-first, guardrails):

```markdown
Build a [fidelity] [scope] for [specific feature/flow].

Use the Knowledge file for full context.

## What We're Building

[2–3 sentences: specific feature/flow for THIS prototype]

This prototype focuses on: [e.g. "the checkout flow from cart to confirmation"]

## Implementation Steps

Follow this order:

1. **Create the page(s):** [List specific pages, e.g. /cart, /payment, /confirmation]
2. **Add UI layout with MOCK DATA:**
   - [Specific element 1]
   - [Specific element 2]
   - [Specific element 3]
3. **Add interactions:**
   - When user [action], show [response]
   - When user [action], navigate to [page]
4. **Test the flow:** User should be able to complete [journey] without errors
5. **DO NOT connect database yet** – We'll add that in a future prompt

## Specific Requirements

- [Requirement 1 with detail]
- [Requirement 2 with detail]
- [Requirement 3 with detail]

Use natural language; be verbose about what each screen should show.

## Guardrails

- **Do not edit:** [List any existing components/pages to avoid, or "N/A for new project"]
- **Use mock data only:** No API calls or database connections yet
- **Scope:** [Reinforce what's in vs out]

## Success Criteria

When this is working, the user should be able to:
- [ ] [Specific testable action 1]
- [ ] [Specific testable action 2]
- [ ] [Specific testable action 3]
- [ ] Complete the flow without errors
```

**File: README.md**

```yaml
---
title: Prototype - [Feature Name]
generated: YYYY-MM-DD
source: [path to PRD / plan / conversation]
scope: [single-screen | flow | full-feature]
fidelity: [wireframe | polished]
lovable_project: ""
---

# Setup

1. Go to [lovable.dev](https://lovable.dev) and create a new project.
2. **Add Knowledge file:** In Lovable, open Knowledge and paste the contents of `knowledge.md`.
3. **Start building:** Paste the contents of `implementation.md` as your first prompt.
4. After Lovable builds the prototype, copy your Lovable project URL and paste it below.

# Lovable project URL

Paste here: ___________
```

### 5. Save and Output to Chat

- Always save the three files to `prototypes/YYYY-MM-DD_[feature-slug]/`.
- Reply in chat with:

```markdown
✓ Generated Lovable prompt files in:
  projects/active/[project]/prototypes/YYYY-MM-DD_[feature-slug]/

**Next steps:**

1. Go to [lovable.dev](https://lovable.dev) and create a new project.

2. **Add Knowledge file:**
   - In Lovable, open Knowledge and paste the contents of `knowledge.md`.
   - This gives Lovable context for every prompt.

3. **Start building:**
   - Paste the contents of `implementation.md` as your first prompt.
   - Lovable will build the prototype (frontend-first with mock data).

4. **After it's built:**
   - Copy your Lovable project URL.
   - Paste it into this folder's `README.md` so you can find it later.

Want me to show you the contents of `knowledge.md` and `implementation.md` here?
```

If the user says yes, output both files in copyable code blocks.

## Conversation Mode (No PRD or Plan)

When no artifact is found, ask these questions (keep to 5–10 minutes):

1. **What does this prototype do?** (1–2 sentences)
2. **Who is it for?** (primary user and their goal)
3. **Core flow:** What are the 3–5 main steps the user takes?
4. **Key screens:** What screens are needed, and what’s on each?
5. **Fidelity:** Wireframe (structure only) or Polished (production-ready)?
6. **Scope:** Single screen, Flow (3–5 screens), or Full app?

Then build `knowledge.md` and `implementation.md` from the answers. Do not turn this into a full discovery or PRD; if the user needs more structure, suggest the create-prd or discovery skill.

## Versioning and Iteration

- Each run creates a **new dated folder**: `prototypes/YYYY-MM-DD_[name]/`.
- If the user updates the PRD/plan and wants a new prompt, generate again; the new folder is the new version. Keep previous folders for comparison.
- User can delete or archive old `prototypes/` folders as needed.

## Integration with Other Skills

**After create-prd:**
- When the PRD is saved, offer: "Want me to generate a Lovable prototype prompt from this PRD? It will create a Knowledge file and implementation prompt you can paste into Lovable."

**After a plan is finalized:**
- Offer: "I can generate a Lovable prototype prompt from this plan. Want one?"

**Ad hoc:**
- User says "create a prototype" or "generate a prototype prompt" → run this skill; use PRD/plan if present, otherwise Conversation mode.

## Error Handling

| Situation | Action |
|-----------|--------|
| No project open | Ask user to open or create a project, or run in workspace root and ask which project to use. |
| No PRD/plan and user doesn’t answer conversation questions | Offer to generate from minimal context or suggest create-prd/discovery. |
| Very long PRD | Summarize for Knowledge file; focus on problem, users, core flow, top requirements. |
| User wants to edit the prompt later | They edit the files in `prototypes/...`; no need to detect. For a fresh version, they run this skill again (new dated folder). |

## Lovable Best Practices (Reference)

- **Clear, verbose prompts** produce better output ([Lovable best practice](https://docs.lovable.dev/tips-tricks/best-practice)).
- **Knowledge file** = product vision, users, features, design; Lovable uses it with every prompt.
- **Frontend-first:** Build with mock data, then connect backend later ([from idea to app](https://docs.lovable.dev/tips-tricks/from-idea-to-app)).
- **Guardrails:** Tell Lovable what not to edit (e.g. "Do not edit /shared/Layout").
- **Break work into steps:** One feature or flow at a time; test before expanding.
