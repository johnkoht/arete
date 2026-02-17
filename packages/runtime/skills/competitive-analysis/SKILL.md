---
name: competitive-analysis
description: Research and document competitive landscape. Use when the user wants to analyze competitors, do competitive research, or update competitive landscape.
primitives:
  - Market
  - Risk
work_type: analysis
category: default
creates_project: true
project_template: analysis
intelligence:
  - context_injection
requires_briefing: false
---

# Competitive Analysis Skill

Guide users through competitive research and landscape documentation.

## When to Use

- "competitive analysis"
- "analyze competitor"
- "research [competitor name]"
- "update competitive landscape"
- "competitor comparison"

## Workflow

### 1. Project Setup

Create the project folder and populate README.md from the template.

**Load project README template** — attempt each path in order; use the first that exists. Do not skip step 1 without trying.
1. Attempt to read `templates/projects/analysis/project.md` → exists? Use it. Stop.
2. Attempt to read `.agents/skills/competitive-analysis/templates/project.md` → exists? Use it. Stop.

Create project:

```
projects/active/[scope]-competitive-analysis/
├── README.md          ← from template above
├── inputs/
│   ├── competitor-research/
│   └── market-data/
├── working/
│   ├── competitor-profiles/
│   └── comparison-matrix.md
└── outputs/
    └── competitive-analysis.md
```

### 2. Define Scope

Clarify the analysis scope:

- **Single Competitor**: Deep dive on one competitor
- **Landscape Overview**: Map all relevant competitors
- **Feature Comparison**: Specific capability comparison
- **Strategic Analysis**: Positioning and market dynamics

### 3. Identify Competitors

#### Direct Competitors
- Same problem, same solution approach
- Fighting for same customers

#### Indirect Competitors
- Same problem, different solution
- Adjacent markets

#### Potential Competitors
- Could enter the space
- Have relevant capabilities

### 4. Research Framework

For each competitor, gather:

**Company Overview**
- Founded, funding, stage
- Team size, key people
- Mission/vision

**Product**
- Core offering
- Key features
- Pricing model
- Target customers

**Positioning**
- Value proposition
- Messaging
- Brand perception

**Strengths**
- What they do well
- Competitive advantages
- Customer love

**Weaknesses**
- Known gaps
- Customer complaints
- Vulnerabilities

**Recent Moves**
- Product launches
- Pricing changes
- Market expansion
- Partnerships

### 5. Competitor Profile Template

Create in `working/competitor-profiles/[name].md`:

```markdown
# Competitor Profile: [Name]

**Website**: [URL]
**Founded**: [Year]
**Funding**: [Amount/Stage]
**HQ**: [Location]

## Overview
[2-3 sentence description]

## Product
### Core Offering
[What they sell]

### Key Features
- Feature 1
- Feature 2

### Pricing
[Pricing model and tiers]

### Target Customers
[Who they serve]

## Positioning
### Value Proposition
[Their main pitch]

### Messaging Themes
- Theme 1
- Theme 2

## Strengths
- [Strength with evidence]

## Weaknesses
- [Weakness with evidence]

## Recent Activity
- [Date]: [Activity]

## Customer Sentiment
[What customers say - reviews, social, etc.]

## Threat Assessment
**Level**: Low / Medium / High
**Rationale**: [Why]

---
*Last Updated: YYYY-MM-DD*
```

### 6. Comparison Matrix

Create `working/comparison-matrix.md`:

```markdown
# Competitive Comparison Matrix

| Dimension | Us | Competitor A | Competitor B |
|-----------|-----|--------------|--------------|
| **Pricing** | | | |
| **Core Feature 1** | | | |
| **Core Feature 2** | | | |
| **Target Segment** | | | |
| **Strengths** | | | |
| **Weaknesses** | | | |

## Legend
- ✅ Strong
- ⚠️ Moderate
- ❌ Weak
- ➖ N/A
```

### 7. Strategic Analysis

Apply frameworks as relevant:

**Porter's Five Forces**
- Threat of new entrants
- Bargaining power of suppliers
- Bargaining power of buyers
- Threat of substitutes
- Competitive rivalry

**Positioning Map**
- Plot competitors on 2 key dimensions
- Identify white space
- Assess our position

**SWOT by Competitor**
- Strengths, Weaknesses, Opportunities, Threats

### 8. Final Output

Create `outputs/competitive-analysis.md`:

```markdown
# Competitive Analysis: [Scope]

**Date**: YYYY-MM-DD
**Scope**: [What this covers]

## Executive Summary
[Key takeaways in 3-5 bullets]

## Competitive Landscape Overview
[Market map, key players, dynamics]

## Competitor Profiles

### [Competitor A]
[Summary from profile]

### [Competitor B]
[Summary from profile]

## Comparison Matrix
[Embedded or linked]

## Strategic Analysis
### Market Position
[Where we stand]

### Competitive Advantages
[Our differentiation]

### Threats
[Key competitive threats]

### Opportunities
[Gaps we can exploit]

## Recommendations
1. [Strategic recommendation]
2. [Tactical recommendation]

## Monitoring Plan
- [What to track]
- [Frequency]

---
*See full profiles in working/competitor-profiles/*
```

### 9. Context Update

After completing:

1. Update `context/competitive-landscape.md`
2. Archive old competitive context
3. Log key learnings
4. Set reminders for refresh (quarterly typical)

## Research Sources

**Public Sources**
- Company websites
- Press releases
- Job postings
- LinkedIn
- Crunchbase/PitchBook

**Customer Intel**
- G2, Capterra reviews
- Social media
- Support forums
- Sales team insights

**Product Research**
- Free trials
- Demo videos
- Documentation
- Pricing pages

**Market Research**
- Industry reports
- Analyst coverage
- News coverage
