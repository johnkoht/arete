/**
 * Canonical workspace structure: directories and default files.
 * Used by install (new workspaces) and update (backfill missing structure).
 * Single source of truth so new features (e.g. people/) are added here and
 * existing workspaces get them on `arete update`.
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { IDEAdapter } from './ide-adapter.js';
import { detectAdapter } from './adapters/index.js';

/**
 * Base directories that should exist in an Areté workspace (IDE-agnostic).
 * Add new top-level or nested dirs here when shipping new features.
 * IDE-specific directories (e.g., .cursor/, .claude/) are added via adapter.getIDEDirs().
 *
 * Phase 1 (Product OS): now/, goals/, .arete/ replace scratchpad, resources/plans, memory/.
 */
export const BASE_WORKSPACE_DIRS = [
  'now',
  'now/agendas',
  'goals',
  'goals/archive',
  'context',
  'context/_history',
  '.arete',
  '.arete/memory',
  '.arete/memory/items',
  '.arete/memory/summaries',
  '.arete/activity',
  '.arete/config',
  '.arete/templates/meeting-agendas',
  'projects',
  'projects/active',
  'projects/archive',
  'people',
  'people/internal',
  'people/customers',
  'people/users',
  'resources',
  'resources/meetings',
  'resources/notes',
  'templates/plans',
  '.agents',
  '.agents/skills',
  '.credentials',
  'templates',
  'templates/inputs',
  'templates/outputs',
  'templates/projects'
];

/**
 * Rule files to copy on install (product rules only). Build-only rules (dev.mdc, testing.mdc)
 * are excluded so end-user workspaces never get them. Add new product rules here when added.
 */
export const PRODUCT_RULES_ALLOW_LIST = [
  'routing-mandatory.mdc',
  'arete-vision.mdc',
  'pm-workspace.mdc',
  'agent-memory.mdc',
  'context-management.mdc',
  'project-management.mdc',
  'qmd-search.mdc'
];

/**
 * Default files created when missing. Key = path relative to workspace root.
 * Do not overwrite existing files (preserves user content on update).
 */
export const DEFAULT_FILES: Record<string, string> = {
  'context/business-overview.md': `# Business Overview

> **Purpose**: High-level overview of your business - what you do, who you serve, and your core value proposition.
> **Last Updated**: [Date]
> **Last Reviewed**: [Date]
> **Updated By**: [Initial setup]

## Company Name
[Your company name]

## Mission Statement
[What is your company's mission? Why does your company exist?]

## Vision
[Where is the company headed? What does success look like in 3-5 years?]

## Industry & Market
[What industry/market do you operate in? Any relevant sub-markets or niches?]

## Core Value Proposition
[What unique value do you provide? Why do customers choose you?]

## Company Stage
- [ ] Pre-seed / Idea stage
- [ ] Seed
- [ ] Series A
- [ ] Series B+
- [ ] Growth stage
- [ ] Mature/Established

## Company Size
- Employees: [Number]
- Customers: [Number/Range]
- Annual Revenue: [Range or specific if comfortable]

## Key Company Milestones
[List major achievements, launches, funding rounds, expansions, etc.]

## Strategic Focus Areas (Current)
[What are the top 2-3 strategic priorities right now?]

---

## Change History
- [Date]: Initial setup
`,
  'context/users-personas.md': `# Users & Personas

> **Purpose**: Your target users, their characteristics, needs, and pain points.
> **Last Updated**: [Date]
> **Last Reviewed**: [Date]
> **Updated By**: [Initial setup]

## Persona 1: [Name/Title]

### Demographics
- **Role/Title**: [e.g., Marketing Manager, Software Engineer]
- **Company Size**: [e.g., 50-200 employees]
- **Industry**: [e.g., SaaS, Healthcare]
- **Experience Level**: [e.g., 3-5 years]

### Goals & Motivations
[What are they trying to achieve? What drives them?]
- Goal 1
- Goal 2
- Goal 3

### Pain Points & Challenges
[What problems do they face? What frustrates them?]
- Pain point 1
- Pain point 2
- Pain point 3

### Current Solutions
[What tools/processes do they currently use? What are the limitations?]

### Key Needs
[What do they need from a solution?]
- Need 1
- Need 2
- Need 3

### Behavior Patterns
- **Tech Savviness**: Low / Medium / High
- **Decision-Making Authority**: Individual / Influencer / Decision Maker
- **Buying Process**: [How do they evaluate and purchase?]

### Success Metrics
[How do they measure their own success?]

### Quote
> "[A representative quote that captures their perspective]"

---

## Persona 2: [Name/Title]

[Repeat structure above]

---

## User Segmentation

### Primary Segments
1. **[Segment Name]**
   - Size: [% of user base or number]
   - Value: [High/Medium/Low]
   - Characteristics: [Key differentiators]

2. **[Segment Name]**
   - Size:
   - Value:
   - Characteristics:

### User Journey Touchpoints
[Key moments in the user's interaction with your product]
1. Awareness
2. Consideration
3. Activation
4. Engagement
5. Retention

## Research Sources
[Where does this persona data come from?]
- User interviews conducted: [Date/Number]
- Surveys: [Date/Number of responses]
- Analytics data: [Date range]
- Customer support insights: [Source]

---

## Change History
- [Date]: Initial setup
`,
  'context/products-services.md': `# Products & Services

> **Purpose**: Current product portfolio and service offerings.
> **Last Updated**: [Date]
> **Updated By**: [Initial setup]

## Product Portfolio Overview
[High-level summary of all products/services]

---

## Product 1: [Product Name]

### Description
[What is this product? What does it do?]

### Target Users
[Which personas/segments use this product?]

### Status
- [ ] In Development
- [ ] Beta
- [ ] Generally Available
- [ ] Sunset/Deprecated

### Launch Date
[When did this launch or when will it launch?]

### Key Features
1. Feature 1
2. Feature 2
3. Feature 3

### Value Proposition
[Why do customers use this product? What problem does it solve?]

### Pricing
[Pricing model and tiers if applicable]

### Usage Metrics
- Active Users: [Number/Range]
- Key Metric: [e.g., DAU, MAU, engagement rate]

### Tech Stack (High-Level)
- Platform: [e.g., Web, Mobile, Desktop]
- Key Technologies: [e.g., React, Node.js, AWS]

### Integration Points
[What does this product integrate with?]

### Product Health
- [ ] Thriving (high growth, strong engagement)
- [ ] Healthy (steady state, meeting goals)
- [ ] Needs attention (declining metrics, tech debt)
- [ ] Under review (considering pivot/sunset)

---

## Product 2: [Product Name]
[Repeat structure]

---

## Product Relationships

### Product Ecosystem
[How do products work together? Are they standalone or interconnected?]

### Cross-Product Features
[Any features that span multiple products?]

### Upsell/Cross-sell Paths
[How do users move between products?]

---

## Sunset Products
[Products that have been discontinued - keep for historical context]

### [Product Name]
- **Active Period**: [Date range]
- **Reason for Sunset**: [Why was it discontinued?]
- **Key Learnings**: [What did we learn?]

---

## Change History
- [Date]: Initial setup
`,
  'context/business-model.md': `# Business Model

> **Purpose**: How your business makes money and creates value.
> **Last Updated**: [Date]
> **Updated By**: [Initial setup]

## Business Model Type
- [ ] SaaS (Software as a Service)
- [ ] Marketplace
- [ ] E-commerce
- [ ] Subscription
- [ ] Freemium
- [ ] Enterprise/B2B
- [ ] Advertising
- [ ] Transaction-based
- [ ] Other: [Specify]

## Revenue Streams
[List your primary revenue sources]

1. **[Revenue Stream 1]**
   - Description: [How does this generate revenue?]
   - % of Total Revenue: [Approximate percentage]
   - Pricing Model: [How do you charge?]

2. **[Revenue Stream 2]**
   - Description:
   - % of Total Revenue:
   - Pricing Model:

## Customer Acquisition
- **Primary Channels**: [How do customers find you?]
- **CAC (Customer Acquisition Cost)**: [If known]
- **Sales Cycle**: [How long from first touch to close?]
- **Sales Model**: Self-service / Sales-assisted / Enterprise sales

## Unit Economics
- **LTV (Lifetime Value)**: [If known]
- **LTV:CAC Ratio**: [If known]
- **Payback Period**: [How long to recoup CAC?]
- **Gross Margin**: [If known]

## Pricing Strategy
[Describe your pricing approach and tiers]

## Key Partnerships
[List strategic partners that are core to your business model]

## Cost Structure
**Major Cost Categories**:
- [e.g., Engineering/Development]
- [e.g., Sales & Marketing]
- [e.g., Infrastructure/Hosting]
- [e.g., Customer Support]

## Growth Levers
[What are the primary ways you drive growth? e.g., virality, network effects, expansion revenue]

---

## Change History
- [Date]: Initial setup
`,
  'goals/strategy.md': `# Goals & Strategy

> **Purpose**: Business goals, OKRs, strategic direction, and market positioning.
> **Last Updated**: [Date]
> **Updated By**: [Initial setup]

## North Star Metric
**Metric**: [Your single most important metric]
**Definition**: [How is this calculated?]
**Why this metric**: [Why is this the north star?]
**Current Value**: [Current performance]
**Target**: [What are you aiming for?]

---

## Strategic Framework

### Vision
[Where is the company headed? What does success look like in 3-5 years?]

### Strategic Pillars
[The 3-5 core pillars that support your strategy]

1. **[Pillar 1]**
   - Description: [What does this mean?]
   - Why it matters: [Why is this strategic?]
   - Key initiatives: [What are we doing here?]

2. **[Pillar 2]**
   - Description:
   - Why it matters:
   - Key initiatives:

3. **[Pillar 3]**
   - Description:
   - Why it matters:
   - Key initiatives:

---

## Current Goals & OKRs

### Current Period: [Q#, Year]

**Objective 1**: [High-level goal]
- **KR1**: [Measurable key result]
  - Current: [Value]
  - Target: [Goal]
- **KR2**: [Measurable key result]
  - Current:
  - Target:

**Objective 2**: [High-level goal]
- **KR1**:
  - Current:
  - Target:
- **KR2**:
  - Current:
  - Target:

---

## Market Positioning

### Target Market
[Who are you primarily serving? What's your ideal customer profile?]

### Market Position
- [ ] Market Leader
- [ ] Fast Follower
- [ ] Niche Specialist
- [ ] Disruptor
- [ ] New Market Creator

### Positioning Statement
**For** [target customer]
**Who** [statement of need or opportunity]
**Our product** is a [product category]
**That** [key benefit, reason to buy]
**Unlike** [primary competitive alternative]
**We** [primary differentiation]

---

## Strategic Advantages
[What gives you an edge? Consider: 7 Powers framework]

1. **[Advantage Type]** (e.g., Network Effects, Scale Economics, Brand, etc.)
   - Description: [How does this manifest?]
   - Defensibility: [How sustainable is this advantage?]

2. **[Advantage Type]**
   - Description:
   - Defensibility:

### Where We Compete
**We compete on**:
-
-

**We explicitly don't compete on**:
-
-

---

## Strategic Bets

### Current Bets
[What are you betting will be true? What are you investing in?]

1. **[Bet 1]**
   - The Bet: [What do you believe?]
   - If we're right: [Potential upside]
   - If we're wrong: [Risk / downside]
   - How we'll know: [Success criteria]
   - Timeline: [When will we know?]

### Past Bets (for learning)
[Bets you've made previously and their outcomes]

**[Bet Name]** - [Outcome: Success / Partial / Failure]
- What we learned:

---

## Strategic Risks

### Key Risks
[What could derail the strategy?]

1. **[Risk Category]** (e.g., Market Risk, Execution Risk, Competitive Risk)
   - Description: [What's the risk?]
   - Likelihood: Low / Medium / High
   - Impact: Low / Medium / High
   - Mitigation: [How are we addressing this?]

---

## Must-Win Battles (Current Year)
[The 2-3 things that absolutely must succeed this year]

1. **[Priority 1]**
   - Why it's critical:
   - Success criteria:

2. **[Priority 2]**
   - Why it's critical:
   - Success criteria:

---

## Change History
- [Date]: Initial setup
`,
  'context/competitive-landscape.md': `# Competitive Landscape

> **Purpose**: Competitors, their strengths/weaknesses, and market positioning. Update using competitive analysis projects.
> **Last Updated**: [Date]
> **Updated By**: [Initial setup]

## Market Overview
- **Market Size**: [TAM/SAM/SOM if known]
- **Market Growth Rate**: [% annual growth]
- **Market Maturity**: Emerging / Growing / Mature / Declining

## Direct Competitors

### Competitor 1: [Name]
- **Website**: [URL]
- **Description**: [Brief overview]
- **Target Market**: [Who do they serve?]
- **Key Strengths**:
  - Strength 1
  - Strength 2
- **Key Weaknesses**:
  - Weakness 1
  - Weakness 2
- **Pricing**: [Pricing model/range]
- **Market Position**: Leader / Challenger / Niche
- **Estimated Market Share**: [If known]

### Competitor 2: [Name]
[Repeat structure]

---

## Indirect Competitors
[Companies solving the same problem differently, or alternative solutions]

### Alternative 1: [Name]
- **Description**:
- **Why users might choose them**:
- **Why users might choose us instead**:

---

## Competitive Matrix

| Feature/Capability | Us | Competitor 1 | Competitor 2 | Competitor 3 |
|-------------------|-------|--------------|--------------|--------------|
| Feature 1         | ✓     | ✓            | ✗            | ✓            |
| Feature 2         | ✓     | ✗            | ✓            | ✓            |
| Pricing           | [Range] | [Range]    | [Range]      | [Range]      |

## Our Differentiation

### Unique Advantages
[What do we do better or differently?]
1.
2.
3.

### Competitive Moats
[What makes us defensible? Network effects, data, technology, brand, etc.]
-
-

## Market Trends
[Key trends affecting the competitive landscape]
- Trend 1
- Trend 2

## Threats & Opportunities
**Threats**:
-
-

**Opportunities**:
-
-

## Win/Loss Analysis
**Why customers choose us**:
-
-

**Why customers choose competitors**:
-
-

---

## Change History
- [Date]: Initial setup
`,
  'context/README.md': `# Context

Your business and product knowledge — the source of truth for goals, strategy, users, and competitive landscape.

## Files

Fill these in (see SETUP.md for guidance):

- **business-overview.md** — Company basics, mission, value proposition
- **users-personas.md** — Target users and personas
- **products-services.md** — Product portfolio and offerings
- **business-model.md** — How you make money
- **Strategy** — Moved to \`goals/strategy.md\` (see goals/ for strategy, quarter, initiatives)
- **competitive-landscape.md** — Competitors and market positioning

When you finalize projects that update context, previous versions are archived to \`context/_history/\`.
`,
  'now/scratchpad.md': `# Scratchpad

Quick capture space for notes, ideas, and TODOs. Review periodically and move items to appropriate places.

---

## Ideas

## TODOs

## Notes

---
`,
  'now/week.md': `# Week Priorities

**Week of**: [Monday date]

## Top 3–5 outcomes

### 1. [Outcome]
- **Success criteria**:
- **Advances quarter goal**:
- **Effort**: deep / medium / quick (optional)

### 2. [Outcome]

(Add more as needed. Use **week-plan** skill to set priorities.)

## Commitments due this week

-

## Carried over from last week

-

## End of week review (fill during week-review)

-
`,
  'now/today.md': `# Today's Focus

**Date**: [YYYY-MM-DD]

## Top priorities

1.
2.
3.

## Meetings today

-

## Commitments due

-

(Use **daily-plan** skill to populate. User supplies today's meetings.)
`,
  'goals/quarter.md': `# Quarter Goals — [YYYY-Qn]

**Quarter**: [Start date] – [End date]

## Outcomes (3–5)

### [Qn-1] [Outcome title]
- **Success criteria**: [1–2 sentences]
- **Org alignment**: [Pillar / OKR from goals/strategy.md]

### [Qn-2] [Outcome title]
- **Success criteria**:
- **Org alignment**:

(Add more as needed. Use **quarter-plan** skill.)

## Alignment table

| My goal | Org pillar / OKR |
|--------|------------------|
| [Qn-1] | |
| [Qn-2] | |

## Notes / milestones

-
`,
  'goals/initiatives.md': `# Strategic Initiatives

Lightweight strategic bets that projects reference for alignment.

## Current initiatives

### [Initiative 1]
- **What**: [One-line description]
- **Why**: [Strategic rationale]
- **Projects**: [Links to projects/active/...]

### [Initiative 2]
- **What**:
- **Why**:
- **Projects**:

## Past initiatives (for reference)

-
`,
  'projects/index.md': `# Projects Index

Track active and completed projects.

## Active Projects

None currently.

## Recently Completed

None yet.
`,
  'resources/meetings/index.md': `# Meetings Index

Meeting notes and transcripts organized by date. Scan the table for topics/themes, then open the linked file for details.

## Recent Meetings

None yet.
`,
  'resources/notes/index.md': `# Notes Index

Standalone notes and observations.

## Recent Notes

None yet.
`,
  'templates/plans/quarter-goals.md': `# Quarter Goals — [YYYY-Qn]

**Quarter**: [Start date] – [End date]

## Outcomes (3–5)

### [Qn-1] [Outcome title]
- **Success criteria**: [1–2 sentences]
- **Org alignment**: [Pillar / OKR from goals/strategy.md]

### [Qn-2] [Outcome title]
- **Success criteria**:
- **Org alignment**:

(Add more as needed.)

## Alignment table

| My goal | Org pillar / OKR |
|--------|------------------|
| [Qn-1] | |
| [Qn-2] | |

## Notes / milestones

-
`,
  'templates/plans/week-priorities.md': `# Week Priorities — [YYYY-Www]

**Week of**: [Monday date]

## Top 3–5 outcomes

### 1. [Outcome]
- **Success criteria**: 
- **Advances quarter goal**: [e.g. Q1-2]
- **Effort**: deep / medium / quick (optional)

### 2. [Outcome]
- **Success criteria**:
- **Advances quarter goal**:

(Add more as needed.)

## Commitments due this week

-

## Carried over from last week

-

## End of week review (fill during week-review)

-
`,
  'people/index.md': `# People Index

People you work with: internal colleagues, customers, and users.

| Name | Category | Email | Role | Company / Team |
|------|----------|-------|------|----------------|
| (none yet) | — | — | — | — |

Add person files under \`people/internal/\`, \`people/customers/\`, or \`people/users/\` (e.g. \`people/internal/jane-doe.md\`). Run \`arete people list\` to regenerate this table from person files.
`,
  'people/README.md': `# People

Track the people you work with: colleagues, customers, and product users. Each category has its own folder and a README with guidance.

## Categories

- **[Internal](internal/README.md)** — Colleagues, teammates, and internal stakeholders
- **[Customers](customers/README.md)** — Key accounts, buyers, and customer contacts
- **[Users](users/README.md)** — Product users and end users you learn from

## Quick Start

1. Create a person file: \`people/<category>/<slug>.md\` (e.g. \`people/internal/jane-doe.md\`).
2. Add YAML frontmatter: \`name\`, \`email\`, \`role\`, \`company\` or \`team\`, \`category\`.
3. Use the template in \`templates/inputs/person.md\` or copy from an existing person file.
4. Run \`arete people list\` to see everyone; \`arete people index\` to regenerate the table in \`people/index.md\`.

## Linking to Meetings and Projects

- **Meetings**: Add \`attendee_ids: [slug]\` in meeting frontmatter to link attendees to person pages.
- **Projects**: Add \`stakeholders: [slug]\` in project README or frontmatter to link key contacts.
`,
  'people/internal/README.md': `# Internal

Colleagues, teammates, and internal stakeholders.

## What Goes Here

- **Manager** — Your direct manager (track 1:1s, feedback, career discussions)
- **Direct reports** — People you manage (track development, 1:1s, feedback given)
- **Teammates** — People on your immediate team
- **Cross-functional partners** — Eng, design, marketing, sales, etc.
- **Executives** — Leadership you interact with

## Key Sections (per person)

For each person file, track:
- **Role and team** — What they do
- **Relationship** — How you work together
- **Recent meetings** — Link to meetings in \`resources/meetings/\` (use \`attendee_ids: [slug]\` in meeting frontmatter when you add it)
- **Key topics** — Ongoing threads and projects
- **Action items** — What you owe them / they owe you
- **Notes** — Important context (communication style, what they care about, etc.)

## Usage

- **Before 1:1s** — Review their page to remember context
- **After meetings** — Update with new action items or insights
- **During planning** — Check who you haven't connected with recently
`,
  'people/customers/README.md': `# Customers

Key accounts, buyers, and customer contacts.

## What Goes Here

- **Customers** — Users of your product, key accounts
- **Prospects** — Potential customers or partners
- **Partners** — Integration partners, vendors, contractors
- **Other stakeholders** — Anyone external you work with regularly

## Key Sections (per person)

For each person file, track:
- **Role and company** — What they do, who they work for
- **Relationship** — How you know them, context of relationship
- **Recent meetings** — Link to meetings in \`resources/meetings/\`
- **Key topics** — What they care about, ongoing discussions
- **Action items** — What you owe them / they owe you
- **Notes** — Important context (preferences, pain points, goals)

## Usage

- **Before customer calls** — Review their page for context
- **After interactions** — Update with new insights or commitments
- **During planning** — Check who you need to follow up with
`,
  'people/users/README.md': `# Users

Product users and end users you learn from.

## What Goes Here

- **Power users** — People who use your product heavily and give feedback
- **Beta / early adopters** — Users in programs or early access
- **Churned or at-risk** — Users you're trying to win back or retain
- **Persona representatives** — Users who exemplify a segment you care about

## Key Sections (per person)

For each person file, track:
- **Role and company** — What they do, who they work for
- **Relationship** — How you know them (support ticket, interview, beta, etc.)
- **Recent meetings** — Link to meetings in \`resources/meetings/\`
- **Key topics** — Pain points, feature requests, workflows
- **Action items** — Follow-ups, commitments
- **Notes** — Quotes, preferences, segment context

## Usage

- **Before user interviews** — Review their page for prior context
- **After feedback** — Update with new requests or themes
- **For roadmap** — Surface recurring themes across users
`,
  '.credentials/README.md': `# Credentials

This directory contains API keys and tokens for integrations.
Files here are gitignored and should never be committed.

## Setup

1. Copy credentials.yaml.example to credentials.yaml
2. Fill in your API keys
3. Or use environment variables (preferred)

## Environment Variables

- FATHOM_API_KEY - Fathom meeting recorder API key
`,
  '.credentials/credentials.yaml.example': `# Areté Credentials
# Copy this to credentials.yaml and fill in your values
# Or use environment variables instead

fathom:
  api_key: ""

# Add other integrations as needed
`,
  '.gitignore': `# Areté gitignore additions
.credentials/credentials.yaml
.agents/
`,
  '.arete/activity/activity-log.md': `# Activity Log

Chronological record of significant workspace activity.

---
`,
  '.arete/memory/items/decisions.md': `# Decisions Log

Key decisions with context and rationale.

---
`,
  '.arete/memory/items/learnings.md': `# Learnings Log

Insights and learnings from work.

---
`,
  '.arete/memory/items/agent-observations.md': `# Agent Observations

Observations about working preferences and patterns.

---
`,
  '.arete/memory/summaries/collaboration.md': `# Collaboration Profile

How to work effectively together.

---
`,
  '.arete/memory/summaries/sessions.md': `# Session Summaries

Work session tracking for continuity.

---
`
};

export interface EnsureWorkspaceStructureResult {
  directoriesAdded: string[];
  filesAdded: string[];
}

export interface EnsureWorkspaceStructureOptions {
  /** If true, only report what would be added; do not create anything. */
  dryRun?: boolean;
  /** IDE adapter to use; auto-detects if not provided. */
  adapter?: IDEAdapter;
}

/**
 * Ensure workspace has all required directories and default files.
 * Only creates missing items; never overwrites existing files.
 * Used by `arete update` to backfill structure when new features add dirs/files.
 */
export function ensureWorkspaceStructure(
  workspaceRoot: string,
  options: EnsureWorkspaceStructureOptions = {}
): EnsureWorkspaceStructureResult {
  const { dryRun = false } = options;
  const directoriesAdded: string[] = [];
  const filesAdded: string[] = [];

  // Get adapter (auto-detect if not provided)
  const adapter = options.adapter || detectAdapter(workspaceRoot);
  
  // Combine base workspace dirs with IDE-specific dirs
  const allDirs = [...BASE_WORKSPACE_DIRS, ...adapter.getIDEDirs()];

  for (const dir of allDirs) {
    const fullPath = join(workspaceRoot, dir);
    if (!existsSync(fullPath)) {
      if (!dryRun) {
        mkdirSync(fullPath, { recursive: true });
      }
      directoriesAdded.push(dir);
    }
  }

  for (const [filePath] of Object.entries(DEFAULT_FILES)) {
    const fullPath = join(workspaceRoot, filePath);
    if (!existsSync(fullPath)) {
      if (!dryRun) {
        const dir = join(workspaceRoot, filePath.split('/').slice(0, -1).join('/'));
        if (dir && dir !== workspaceRoot && !existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(fullPath, DEFAULT_FILES[filePath], 'utf8');
      }
      filesAdded.push(filePath);
    }
  }

  return { directoriesAdded, filesAdded };
}

export interface MigrateLegacyResult {
  migrated: string[];
  skipped: string[];
  messages: string[];
}

/**
 * Migrate legacy workspace structure to Product OS layout.
 * Copies from old locations to new; never overwrites existing files.
 * Call before ensureWorkspaceStructure so new dirs exist for migration.
 */
export function migrateLegacyWorkspaceStructure(workspaceRoot: string): MigrateLegacyResult {
  const migrated: string[] = [];
  const skipped: string[] = [];
  const messages: string[] = [];

  function copyIfMissing(src: string, dest: string, label: string): void {
    if (!existsSync(src)) return;
    if (existsSync(dest)) {
      skipped.push(label);
      return;
    }
    const destDir = join(dest, '..');
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    migrated.push(label);
  }

  function copyDirContentsIfMissing(srcDir: string, destDir: string, labelPrefix: string): void {
    if (!existsSync(srcDir)) return;
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    const entries = readdirSync(srcDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
      const srcPath = join(srcDir, ent.name);
      const destPath = join(destDir, ent.name);
      if (existsSync(destPath)) {
        skipped.push(`${labelPrefix}/${ent.name}`);
      } else {
        copyFileSync(srcPath, destPath);
        migrated.push(`${labelPrefix}/${ent.name}`);
      }
    }
  }

  // memory/ → .arete/memory/
  const oldMemoryItems = join(workspaceRoot, 'memory', 'items');
  const newMemoryItems = join(workspaceRoot, '.arete', 'memory', 'items');
  copyDirContentsIfMissing(oldMemoryItems, newMemoryItems, 'memory/items');

  const oldMemorySummaries = join(workspaceRoot, 'memory', 'summaries');
  const newMemorySummaries = join(workspaceRoot, '.arete', 'memory', 'summaries');
  copyDirContentsIfMissing(oldMemorySummaries, newMemorySummaries, 'memory/summaries');

  const oldActivityLog = join(workspaceRoot, 'memory', 'activity-log.md');
  const newActivityLog = join(workspaceRoot, '.arete', 'activity', 'activity-log.md');
  copyIfMissing(oldActivityLog, newActivityLog, 'memory/activity-log.md');

  // scratchpad.md → now/scratchpad.md
  copyIfMissing(
    join(workspaceRoot, 'scratchpad.md'),
    join(workspaceRoot, 'now', 'scratchpad.md'),
    'scratchpad.md'
  );

  // context/goals-strategy.md → goals/strategy.md
  copyIfMissing(
    join(workspaceRoot, 'context', 'goals-strategy.md'),
    join(workspaceRoot, 'goals', 'strategy.md'),
    'context/goals-strategy.md'
  );

  // resources/plans/quarter-*.md → goals/quarter.md (most recent)
  const plansDir = join(workspaceRoot, 'resources', 'plans');
  const goalsQuarterDest = join(workspaceRoot, 'goals', 'quarter.md');
  if (existsSync(plansDir) && !existsSync(goalsQuarterDest)) {
    const files = readdirSync(plansDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /^quarter-\d{4}-Q\d\.md$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
    if (files.length > 0) {
      const latest = join(plansDir, files[0]);
      if (!existsSync(goalsQuarterDest)) {
        mkdirSync(join(goalsQuarterDest, '..'), { recursive: true });
        copyFileSync(latest, goalsQuarterDest);
        migrated.push(`resources/plans/${files[0]} → goals/quarter.md`);
      }
    }
  }

  // resources/plans/week-*.md → now/week.md (most recent)
  const nowWeekDest = join(workspaceRoot, 'now', 'week.md');
  if (existsSync(plansDir) && !existsSync(nowWeekDest)) {
    const files = readdirSync(plansDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /^week-\d{4}-W\d{2}\.md$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
    if (files.length > 0) {
      const latest = join(plansDir, files[0]);
      mkdirSync(join(nowWeekDest, '..'), { recursive: true });
      copyFileSync(latest, nowWeekDest);
      migrated.push(`resources/plans/${files[0]} → now/week.md`);
    }
  }

  if (migrated.length > 0) {
    messages.push(`Migrated ${migrated.length} item(s) from legacy structure. Old files preserved.`);
  }
  if (skipped.length > 0) {
    messages.push(`Skipped ${skipped.length} (destination already exists).`);
  }

  return { migrated, skipped, messages };
}
