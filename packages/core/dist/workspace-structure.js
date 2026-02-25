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
export const DEFAULT_FILES = {
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
    'goals/strategy.md': `# Goals & Strategy

Business goals and strategic direction.
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
};
//# sourceMappingURL=workspace-structure.js.map