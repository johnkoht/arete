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

Guide the PM through defining 3–5 quarter outcomes, success criteria, and alignment to org strategy. Individual goal files are created for each outcome.

## When to Use

- "set quarter goals"
- "plan the quarter"
- "align to org"
- "quarter planning"
- "define my Qn goals"

## Workflow

### 1. Gather Context

- **Read** `goals/strategy.md` — org pillars, OKRs, and strategic direction.
- **Read** existing goal files in `goals/` if any exist (e.g., `goals/2026-Q1-*.md`) to carry forward themes or unfinished outcomes.

### 2. Guide to 3–5 Outcomes

If your org has a vision, treat it as a *picture of a better place*. Check that each quarter outcome moves the company toward that picture.

Ask the PM to define **3–5 outcomes** for the quarter. For each outcome capture:

- **Title** — Short, outcome-oriented (e.g. "Ship onboarding v2", "Complete discovery for X").
- **Success criteria** — 1–2 sentences: how we know it's done.
- **Org alignment** — Which pillar or OKR from `goals/strategy.md` this supports (e.g. "Pillar 2: Retention", "O1-KR2").

### 3. Write Individual Goal Files

#### Quick Pre-Mortem

Use the `light_pre_mortem` pattern before locking outcomes.

#### File Creation

Create one file per outcome in `goals/`. Individual files are created for each outcome.

**Filename format**: `goals/YYYY-Qn-N-title-slug.md`
- Example: `goals/2026-Q1-1-ship-onboarding-v2.md`

**File structure**: Run this command and use its output as the individual file structure:
```
arete template resolve --skill quarter-plan --variant quarter-goals
```

Each file has:
- YAML frontmatter with `id`, `title`, `status`, `quarter`, `type`, `orgAlignment`, `successCriteria`
- Markdown body for notes, progress, and details

### 4. Confirm and Close

- Summarize the quarter outcomes and alignment.
- Show the list of created files.
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
- **Output**: Individual files in `goals/` (e.g., `goals/2026-Q1-1-ship-onboarding-v2.md`)
- **Template**: `templates/plans/quarter-goals.md` (override) or skill default

## Migration

Existing workspaces with `goals/quarter.md` can continue using it. The migration tool (`arete update`) will convert existing quarter files to individual goal files. New quarter planning sessions create individual files directly.

## Error Handling

- If `goals/strategy.md` is missing or sparse, still create goal files; note "Org alignment TBD" and suggest the user fill in context later.
- If the PM has more than 5 outcomes, suggest grouping or moving lower-priority items to "stretch" or next quarter.
