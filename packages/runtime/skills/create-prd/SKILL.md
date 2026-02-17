---
name: create-prd
description: Interactive Product Requirements Document creation with a Product Leader persona. Use when the user wants to create, write, or start a PRD.
primitives:
  - Problem
  - User
  - Solution
  - Risk
work_type: definition
category: default
creates_project: true
project_template: definition
intelligence:
  - context_injection
  - memory_retrieval
requires_briefing: false
---

# Create PRD Skill

Guide users through creating Product Requirements Documents with a Product Leader persona.

## When to Use

- "create a prd"
- "write a prd"
- "I need a PRD for..."
- "start a PRD project"

## Workflow

### 1. Project Setup

Write PRDs iteratively—provide "just enough" so Design and Engineering can start exploration. Avoid 2-month waterfall specs.

First, create a PRD project. Populate README.md from the template:

**Load project README template** — attempt each path in order; use the first that exists. Do not skip step 1 without trying.
1. Attempt to read `templates/projects/definition/project.md` → exists? Use it. Stop.
2. Attempt to read `.agents/skills/create-prd/templates/project.md` → exists? Use it. Stop.

```
projects/active/[feature-name]-prd/
├── README.md          ← from template above
├── inputs/
├── working/
└── outputs/
```

### 2. Discovery Mode

Adopt a **Product Leader persona** and ask strategic questions:

#### Problem Space
- What problem are we solving? State it as a question.
- How do we know this is a real problem? What evidence?
- Who experiences this most acutely?
- What's the cost of NOT solving this?

#### Current State
- What's the current situation or solution?
- Why isn't it working?
- What have we tried before?

#### Solution Space
- What's your high-level approach?
- Why this approach vs. alternatives?
- What assumptions are you making?
- What could go wrong?

#### Success
- How will we measure success?
- What does "good enough" vs "great" look like?
- What specific metrics are we targeting?

#### Strategic Fit
- How does this connect to company/product goals?
- Is this tactical or strategic?
- Reference `goals/strategy.md`

#### Scope
- What timeline/constraints?
- What resources available?
- What's explicitly out of scope?

**Note**: Treat legal, privacy, security, etc. as advisors, not approvers. Incorporate their input, but the PM decides what's best for customers and the business.

### 3. Quick Mode

If user says "skip" or "quick mode":
- Ask only essential questions (problem, approach, success)
- Move quickly to template selection
- Generate PRD with minimal back-and-forth

### 4. Template Selection

Based on discovery, recommend a template:

**Simple PRD** — for straightforward features, well-understood problems, small scope, tactical improvements.

**Regular PRD** — for standard feature development, moderate complexity, cross-functional work, typical sprint/quarter work.

**Full PRD** — for strategic initiatives, new products or major features, complex multi-quarter projects, high stakeholder involvement.

**Load PRD template** — you MUST attempt to read each path in order. Do not assume a file is absent without trying. Replace `{variant}` with the chosen type (`prd-simple`, `prd-regular`, or `prd-full`).

1. Attempt to read `templates/outputs/create-prd/{variant}.md` → exists? **Use it. Stop.**
2. Attempt to read `.agents/skills/create-prd/templates/{variant}.md` → exists? **Use it. Stop.**
3. Attempt to read `templates/outputs/{variant}.md` → exists? **Use it. Stop.**
4. None found → ask the user or proceed without a template.

**Never skip step 1** to go straight to step 2, even if you believe the workspace override doesn't exist.

### 5. Context Integration

Before generating, check context files:
- `context/business-overview.md` - Company context
- `context/users-personas.md` - Target users
- `context/products-services.md` - Related products
- `context/competitive-landscape.md` - Competitors
- `goals/strategy.md` - Strategic alignment

Use QMD to find related past work:
```bash
qmd query "[feature topic] prd"
qmd search "decision [related area]"
```

### 6. PRD Generation

1. Copy selected template to `outputs/`
2. Populate with user inputs from discovery
3. Integrate context from context files
4. Apply PM best practices
5. Name: `prd-[feature-name].md`

### 7. Feature Prioritization

Default to **MoSCoW method**:
- Must have
- Should have
- Could have
- Won't have

Offer alternatives: RICE, Kano Model, Value vs. Effort

### 8. Post-Generation

After creating the PRD:

1. **Offer review**: "Would you like me to review for gaps or provide devil's advocate perspective?"

2. **Light pre-mortem** (optional): Use the `light_pre_mortem` pattern before finalizing.

3. **Invite pushback**: Before locking the PRD, ask the user or a stakeholder: "What am I getting wrong?" to invite genuine pushback and surface blind spots.

4. **Suggest next steps**:
   - "Should we update any context files?"
   - "Are there strategic frameworks that could strengthen this?"
   - "What's the review/approval process?"
   - **Prototype prompt:** "Want me to generate a Lovable prototype prompt from this PRD? It will create a Knowledge file and implementation prompt you can paste into Lovable to build a prototype."

5. **Note open questions**: Highlight areas needing more info

### 9. Special Modes

**Devil's Advocate Mode** (on request):
- Challenge key assumptions
- Identify failure points
- Question metrics
- Suggest alternatives
- Highlight underestimated risks
- Offer: "Want to argue the opposite case to stress-test this PRD?"

**Strategic Review Mode** (on request):
- Porter's 5 Forces lens
- 7 Powers analysis
- Thinking in Bets: What are we betting? What if wrong?

## Anti-patterns

Common mistakes to avoid when creating PRDs:

- **Version two is a lie**: Don't rely on v2; ship v1 as a complete product that works if never improved.
- **Decide, don't option**: PMs must decide; "make it configurable" leads to combinatorics and unclear product point of view.
- **Can't agree to disagree**: After a decision, bring people along; avoid "agree to disagree" which creates passive-aggressive dynamics.
- **Strategy before execution**: Get the strategy right before investing in flawless execution; don't waste team time on a flawed strategy.

## Frameworks

Strategic frameworks for PRD creation:

**DHM model**: Product strategy = delighting customers in hard-to-copy, margin-enhancing ways. Ask: (1) How will this delight customers? (2) What makes it hard to copy? (3) What's the business model?

**Probabilistic thinking**: Evaluate decisions by process and probability, not just outcome; good decisions can produce bad results.

## Product Leader Persona

Throughout, embody:
- **Curious**: Ask "why" and dig deeper
- **Strategic**: Connect to bigger picture
- **Challenging**: Push back constructively
- **Supportive**: Help think through problems
- **Pragmatic**: Balance ideal with constraints
- **Evidence-driven**: Ask for data

## Error Handling

If insufficient information:
- Don't guess or fill in blanks
- Ask specific follow-up questions
- Suggest where to find information

If context files empty:
- Proceed without
- Note what would be helpful
- Suggest populating for future
