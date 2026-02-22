---
name: discovery
description: Guide problem discovery and research synthesis. Use when the user wants to start discovery, understand a problem, research a topic, or validate assumptions.
primitives:
  - Problem
  - User
work_type: discovery
category: default
creates_project: true
project_template: discovery
intelligence:
  - context_injection
  - memory_retrieval
requires_briefing: false
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

Create the discovery project folder and populate README.md from the template.

**Load project README template** — run this command and use its output as the README structure. Do not add sections from elsewhere:
```
arete template resolve --skill discovery --variant project
```

Create project:

```
projects/active/[topic]-discovery/
├── README.md          ← from template above
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

As user conducts research, help capture in `inputs/`. Load structured input templates (resolution order — use first that exists):

Load input templates by running the appropriate command and using its output as the document structure. Do not add sections from elsewhere:
```
arete template resolve --skill discovery --variant research-note
arete template resolve --skill discovery --variant user-feedback
```


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
3. Log key learnings to `.arete/memory/items/learnings.md`
4. Run `arete index` to make all saved research and findings immediately searchable
5. Use `finalize-project` skill to archive

## Anti-patterns

Common mistakes to avoid in discovery:

- **Don't pitch your idea**: Talk about their life and experience; avoid describing or pitching your solution, which contaminates feedback
- **Past behavior over hypotheticals**: Ask "Tell me about the last time…" not "Would you use…"; specific stories over opinions
- **Compliments are lies**: Generic praise ("This is great!") is unreliable; dig for specifics ("What's the last time you struggled with X?")
- **Solution-first discovery**: Starting with a solution and seeking confirming evidence is a common failure mode; start with the problem space and let solutions emerge from research
- **Behaviors over stated preferences**: Focus on what users actually do, not what they say they'll do; past behavior predicts future action better than hypothetical intentions

## Frameworks

Strategic frameworks for discovery:

**Jobs-to-be-done**: Frame discovery around the job users hire the product to do. Use the job statement template: *When [situation], I want to [motivation], so I can [outcome]*. Focus on the job's functional, emotional, and social dimensions.

**Build-Measure-Learn loop**: Minimize total time through the loop—not just build time. Run small experiments to test hypotheses; use validated learning to decide next steps (pivot or persevere).

**Rachleff's Law (Product/Market Fit)**: A great team with a bad market fails. A bad team with a great market often succeeds. Signals of PMF: users spontaneously tell others, usage grows organically, press wants to cover you without you pitching. If you have to ask whether you have PMF, you don't.

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
