---
name: discovery
description: Guide problem discovery and research synthesis. Use when the user wants to start discovery, understand a problem, research a topic, or validate assumptions.
---

# Discovery Skill

Guide users through discovery projects to understand problems, validate assumptions, and size opportunities.

## When to Use

- "start discovery"
- "I need to understand..."
- "research [topic]"
- "validate [assumption]"
- "discovery project"

## Discovery Types

1. **Problem Discovery**: Understand user pain points
2. **Solution Discovery**: Validate approach viability
3. **Market Discovery**: Size opportunity, assess fit
4. **Technical Discovery**: Assess feasibility, constraints

## Workflow

### 1. Project Setup

Create discovery project:

```
projects/active/[topic]-discovery/
├── README.md
├── inputs/
│   ├── interviews/
│   ├── data/
│   └── research/
├── working/
│   ├── synthesis.md
│   └── hypotheses.md
└── outputs/
    └── findings.md
```

### 2. Frame the Discovery

Ask framing questions:

#### Problem Framing
- What do we think the problem is?
- Who experiences it?
- Why do we care about solving it?
- What evidence suggests this is worth exploring?

#### Hypotheses
- What are we assuming to be true?
- What would prove us wrong?
- What's the riskiest assumption?

#### Scope
- What decisions will this discovery inform?
- What's out of scope?
- Timeline and constraints?

### 3. Plan Research

Help plan research activities:

**User Research**
- Who should we talk to?
- What questions matter most?
- How many conversations needed?

**Data Analysis**
- What existing data is available?
- What metrics would inform this?
- Any analytics to review?

**Competitive Research**
- How do competitors handle this?
- What can we learn from adjacent spaces?

**Technical Discovery**
- What technical constraints exist?
- Who should we consult?

### 4. Capture Inputs

As user conducts research, help capture in `inputs/`:

**Interview Notes Template**:
```markdown
# Interview: [Name/ID]
**Date**: YYYY-MM-DD
**Role/Segment**: [Who they are]
**Duration**: X minutes

## Key Quotes
> "Quote that captures insight"

## Pain Points
- 
- 

## Current Behavior
- 

## Desires/Needs
- 

## Surprises
- 

## Follow-ups
- 
```

### 5. Synthesis

When ready to synthesize (use `synthesize` skill):

1. Review all inputs
2. Identify patterns and themes
3. Test hypotheses against evidence
4. Note contradictions
5. Form recommendations

Create `working/synthesis.md`:
```markdown
# Discovery Synthesis: [Topic]

## Key Findings
1. [Finding with evidence]
2. [Finding with evidence]

## Patterns Observed
- [Pattern]: Seen in [sources]

## Hypotheses Tested
| Hypothesis | Result | Evidence |
|------------|--------|----------|
| [H1] | Validated/Invalidated/Inconclusive | [Summary] |

## Surprises
- [Unexpected finding]

## Open Questions
- [What we still don't know]

## Recommendations
1. [Recommendation]: Because [rationale]
```

### 6. Outputs

Final deliverable in `outputs/findings.md`:

```markdown
# Discovery Findings: [Topic]

**Project**: [Link to project README]
**Date**: YYYY-MM-DD
**Research Scope**: [What we explored]

## Executive Summary
[2-3 sentence summary of key findings and recommendation]

## The Problem
[Clear problem statement informed by research]

## Key Findings
### Finding 1: [Title]
**Evidence**: [Sources/quotes]
**Implication**: [What this means]

### Finding 2: [Title]
...

## Opportunity Assessment
- **Size**: [How big is this?]
- **Urgency**: [How pressing?]
- **Fit**: [How aligned with strategy?]

## Recommendations
1. **[Action]**: [Why and what]

## Next Steps
- [ ] [Follow-up action]

## Appendix
- [Link to raw research]
- [Link to data]
```

### 7. Finalize

When discovery is complete:

1. Review findings with user
2. Identify context updates (users, competitive landscape, etc.)
3. Log key learnings to `memory/learnings.md`
4. Use `finalize-project` skill to archive

## Research Best Practices

**During Interviews**:
- Ask open-ended questions
- Follow the energy (dig into what excites/frustrates)
- Ask for specific examples
- Avoid leading questions

**During Analysis**:
- Look for patterns across sources
- Note outliers and contradictions
- Quantify where possible
- Stay curious, not confirmatory

**When Synthesizing**:
- Separate observations from interpretations
- Be explicit about confidence levels
- Acknowledge what you don't know
- Make recommendations actionable
