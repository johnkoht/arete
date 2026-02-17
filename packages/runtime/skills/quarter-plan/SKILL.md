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

Guide the PM through defining 3–5 quarter outcomes, success criteria, and alignment to org strategy. Output is `goals/quarter.md`.

## When to Use

- "set quarter goals"
- "plan the quarter"
- "align to org"
- "quarter planning"
- "define my Qn goals"

## Workflow

### 1. Gather Context

- **Read** `goals/strategy.md` — org pillars, OKRs, and strategic direction.
- **Read** `goals/quarter.md` if it exists (may have prior quarter content) to carry forward themes or unfinished outcomes.

### 2. Guide to 3–5 Outcomes

If your org has a vision, treat it as a *picture of a better place*. Check that each quarter outcome moves the company toward that picture.

Ask the PM to define **3–5 outcomes** for the quarter. For each outcome capture:

- **Title** — Short, outcome-oriented (e.g. "Ship onboarding v2", "Complete discovery for X").
- **Success criteria** — 1–2 sentences: how we know it’s done.
- **Org alignment** — Which pillar or OKR from `goals/strategy.md` this supports (e.g. "Pillar 2: Retention", "O1-KR2").

### 3. Write Quarter File

#### Quick Pre-Mortem

Use the `light_pre_mortem` pattern before locking outcomes.

- **File**: `goals/quarter.md`.
- **Structure**: Run this command and use its output as the quarter file structure. Do not add sections from elsewhere:
  ```
  arete template resolve --skill quarter-plan --variant quarter-goals
  ```

  Template sections:
  - Quarter dates
  - 3–5 outcomes with success criteria and org pillar/OKR link
  - **Alignment table**: My goal → Org pillar/OKR (so roll-up and review are easy).

### 4. Confirm and Close

- Summarize the quarter outcomes and alignment.
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
- **Template**: `templates/plans/quarter-goals.md` (override) or `.agents/skills/quarter-plan/templates/quarter-goals.md` (default)

## Error Handling

- If `goals/strategy.md` is missing or sparse, still create the quarter file; note "Org alignment TBD" and suggest the user fill in context later.
- If the PM has more than 5 outcomes, suggest grouping or moving lower-priority items to "stretch" or next quarter.
