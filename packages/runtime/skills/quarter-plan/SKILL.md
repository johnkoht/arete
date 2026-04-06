---
name: quarter-plan
description: Set quarter goals and align to org strategy. Use when the user wants to set quarter goals, plan the quarter, or align PM outcomes to org pillars/OKRs.
primitives:
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
---

# Quarter Plan Skill

Guide the PM through defining 3–5 quarter outcomes, success criteria, and alignment to org strategy. Output is a single `goals/quarter.md` file.

## When to Use

- "set quarter goals"
- "plan the quarter"
- "align to org"
- "quarter planning"
- "define my Qn goals"

## Workflow

### 1. Gather Context

- **Read** `goals/strategy.md` — org pillars, OKRs, and strategic direction.
- **Read** existing `goals/quarter.md` if it exists, to carry forward themes or unfinished outcomes.

### 1.5. Discover Available Areas

**Before defining outcomes**, read `areas/*.md` (excluding `_template.md`) to identify available work domains. Extract the `area:` or display name from each file's frontmatter.

If areas exist, keep the list handy for Step 2. If no areas exist, note this — goals will be created without area association and can be linked later.

**Example area list**: `glance-communications`, `product-platform`, `team-operations`

### 2. Guide to 3–5 Outcomes

If your org has a vision, treat it as a *picture of a better place*. Check that each quarter outcome moves the company toward that picture.

Ask the PM to define **3–5 outcomes** for the quarter. For each outcome capture:

- **Title** — Short, outcome-oriented (e.g. "Ship onboarding v2", "Complete discovery for X").
- **Success criteria** — 1–2 sentences: how we know it's done.
- **Org alignment** — Which pillar or OKR from `goals/strategy.md` this supports (e.g. "Pillar 2: Retention", "O1-KR2").
- **Area** — Which persistent work domain does this goal belong to? (from the list discovered in Step 1.5)

**Area prompt** (after capturing title and success criteria):

> "Which area does this goal belong to?
> [list available areas]
> — or press Enter to leave unassigned for now"

- If areas exist and user selects one: store the slug as `area:` in the goal file.
- If user skips or no areas exist: leave `area: ""` — goal can be linked to an area later.
- This is a soft prompt — never block goal creation if the user doesn't assign an area.

### 3. Write Quarter Goals File

#### Quick Pre-Mortem

Use the `light_pre_mortem` pattern before locking outcomes.

#### File Creation

Create or update a single `goals/quarter.md` file containing all outcomes.

**File format**:
```markdown
---
quarter: "YYYY-Qn"
status: active
---
# Qn YYYY Goals

## Goal Title
- **Area**: [Area Name](../areas/area-slug.md)
- **Success**: Measurable criteria
- **Status**: Active

## Another Goal Title
- **Area**: [Area Name](../areas/area-slug.md)
- **Success**: Measurable criteria
- **Status**: Active
```

Each goal is a `## Heading` with simple markdown fields — no YAML frontmatter per goal.

### 4. Confirm and Close

- Summarize the quarter outcomes and alignment.
- Confirm `goals/quarter.md` was written.
- If any goals are missing an area (the `**Area**` field is blank or absent), mention them briefly: "Note: [Goal Title] has no area assigned — you can link it to an area later by editing the file."
- Suggest next steps: **goals-alignment** to view the alignment view, **week-plan** when ready to plan the first week.

## Frameworks

Strategic frameworks for quarter planning:

**Strategy kernel**: Good strategy has three parts: (1) Diagnosis (what's really going on), (2) Guiding policy (approach to obstacles), (3) Coherent action (coordinated steps). Before finalizing quarter outcomes, check: Do we have all three?

**Disagree and commit**: Aim for clarity and commitment over consensus. If stakeholders disagree, document the disagreement but still commit to the decision. Clarity > consensus.

**SMT and OKRs**: Use Strategy → Metrics → Tactics to create OKRs. Each outcome should have a proxy metric; add a forecast (e.g., "improve retention from 95% to 96%") to turn SMT into OKRs. Beware false precision—these are guesses, not certainties.

**Proxy metrics checklist**: Good proxy metrics are: (1) Measurable, (2) Moveable (you can impact it), (3) Non-average (segment new vs existing), (4) Correlated to outcomes, (5) Not gameable. Use this checklist when defining success criteria.

**Shallow vs deep alignment**: Alignment is dynamic equilibrium, not a checkbox. Shallow = low-stakes, fits on a slide. Deep = embraces tension and conflicting truths, requires psychological safety. Aim for deep alignment when planning the quarter.

**Empowered teams**: Teams should own outcomes (solve problems), not outputs (build features). Frame quarter goals as outcomes to solve, not a list of features to ship.

**Operating system for decisions**: Define who decides, who consults, and who is informed for each major decision type. Clarify this with stakeholders when planning the quarter.

**PM leverage pyramid**: PM leverage is highest in vision and strategy; scope and backlog are optimization. When planning the quarter, ensure you're operating at the vision/strategy level, not just optimizing tactics.

## Anti-patterns

Common mistakes to avoid:

- **Fluff and goals-as-strategy**: Avoid gibberish posing as strategy and mistaking goals for strategy. Strategy requires diagnosis, guiding policy, and coherent action.
- **Superficial objectives**: Failing to address real obstacles is not strategy.

## References

- **Org strategy**: `goals/strategy.md`
- **Output**: `goals/quarter.md`

## Error Handling

- If `goals/strategy.md` is missing or sparse, still create `goals/quarter.md`; note "Org alignment TBD" and suggest the user fill in context later.
- If the PM has more than 5 outcomes, suggest grouping or moving lower-priority items to "stretch" or next quarter.
