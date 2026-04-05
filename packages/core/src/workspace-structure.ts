/**
 * Canonical workspace structure: directories and default files.
 * Used by install (new workspaces) and update (backfill missing structure).
 */

/**
 * Base directories that should exist in an Areté workspace (IDE-agnostic).
 */
export const BASE_WORKSPACE_DIRS = [
  'now',
  'now/agendas',
  'goals',
  'goals/archive',
  'context',
  'context/_history',
  'areas',
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
  'resources/conversations',
  'resources/notes',
  'templates/plans',
  '.agents',
  '.agents/skills',
  '.credentials',
  'templates',
  'templates/inputs',
  'templates/outputs',
  'templates/projects',
];

/**
 * Rule files to copy on install (product rules only).
 */
export const PRODUCT_RULES_ALLOW_LIST = [
  'routing-mandatory.mdc',
  'arete-vision.mdc',
  'pm-workspace.mdc',
  'agent-memory.mdc',
  'context-management.mdc',
  'project-management.mdc',
  'qmd-search.mdc',
];

/**
 * Default files created when missing. Key = path relative to workspace root.
 */
export const DEFAULT_FILES: Record<string, string> = {
  'context/README.md': `# Context

Your business and product knowledge. Fill in business-overview.md, users-personas.md, etc.
`,
  'context/business-overview.md': `# Business Overview

## Company

[Add your company name, stage, and what you do]

## Problem Space

[Describe the customer problem you solve]

## Strategy

[Summarize current strategic focus]
`,
  'context/business-model.md': `# Business Model

## Revenue Model

[How you make money]

## Pricing

[Pricing approach and packaging]

## Unit Economics

[Key economics assumptions]
`,
  'context/competitive-landscape.md': `# Competitive Landscape

## Competitors

[List primary alternatives and competitors]

## Positioning

[How you are different]

## Market Dynamics

[Important market trends and shifts]
`,
  'context/products-services.md': `# Products & Services

## Current Offerings

[List what you offer today]

## Roadmap Themes

[Summarize where the product is heading]

## Gaps

[Known gaps or unmet needs]
`,
  'context/users-personas.md': `# Users & Personas

## Target Users

[Who uses your product]

## Needs and Pain Points

[What they need and what is hard today]

## Buying Stakeholders

[Who decides and influences purchases]
`,
  'now/scratchpad.md': `# Scratchpad

Quick capture space for notes and ideas.
`,
  'now/tasks.md': `# Tasks

Your task backlog organized by GTD buckets.

## Format

\`\`\`
- [ ] Description @area(slug) @project(slug) @person(slug) @from(type:id) @due(YYYY-MM-DD)
\`\`\`

All @tags are optional. Plain \`- [ ] Task\` is valid.

**@from types**: \`commitment:hash\` (linked commitment), \`meeting:slug\` (from meeting)

## Anytime

<!-- Tasks to do eventually — no specific deadline -->

## Someday

<!-- Things to consider doing — maybe never -->
`,
  'goals/strategy.md': `# Goals & Strategy

Business goals and strategic direction.
`,
  'goals/_template.md': `---
id: "{id}"
title: "{title}"
status: active
quarter: "{quarter}"
type: outcome
orgAlignment: ""
successCriteria: ""
area: ""
---

# {title}

{description}
`,
  'projects/index.md': `# Projects Index

## Active Projects

None yet.
`,
  'people/index.md': `# People Index

| Name | Category | Email | Role |
|------|----------|-------|------|
| (none yet) | — | — | — |
`,
  '.credentials/README.md': `# Credentials

API keys and tokens. Never commit credentials.yaml.

Copy credentials.yaml.example to credentials.yaml and add your real keys.
`,
  '.credentials/credentials.yaml.example': `# Copy this file to credentials.yaml and fill in real values.
# credentials.yaml is gitignored.

fathom:
  api_key: ""
`,
  '.gitignore': `# Areté
.credentials/credentials.yaml
.agents/
`,
  'areas/_template.md': `---
area: {name}
status: active
recurring_meetings:
  - title: "{meeting_title}"
    attendees: []
    frequency: weekly
---

# {name}

{description}

## Goal
<!-- Link to goals: - [Goal name](../goals/slug.md) (quarter) — one-liner -->

## Focus
<!-- Current priorities and active work streams -->

## Horizon
<!-- Upcoming work, next phases, future priorities -->

## Projects

<!-- Active projects table -->
| Project | Status |
| ------- | ------ |

## Backlog
<!-- Future work items for this area -->

## Stakeholders

<!-- Key people and their roles -->
| Person | Role |
| ------ | ---- |

## Notes
<!-- Working observations and context -->
`,
  '.arete/memory/items/agent-observations.md': `# Agent Observations

Observations about working with you. Agents add entries here when they notice
patterns, preferences, or corrections. These inform how agents collaborate with you.

---

<!-- Format: - [YYYY-MM-DD] [Observation] → [Implication] -->
`,
};

export interface EnsureWorkspaceStructureResult {
  directoriesAdded: string[];
  filesAdded: string[];
}

export interface EnsureWorkspaceStructureOptions {
  dryRun?: boolean;
  /** IDE adapter for IDE-specific dirs (getIDEDirs). When omitted, only base dirs are used. */
  getIDEDirs?: () => string[];
}
