/**
 * Canonical workspace structure: directories and default files.
 * Used by install (new workspaces) and update (backfill missing structure).
 * Single source of truth so new features (e.g. people/) are added here and
 * existing workspaces get them on `arete update`.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Directories that should exist in an Areté workspace.
 * Add new top-level or nested dirs here when shipping new features.
 */
export const WORKSPACE_DIRS = [
  'context',
  'context/_history',
  'memory',
  'memory/items',
  'memory/summaries',
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
  '.cursor',
  '.cursor/rules',
  '.cursor/skills',
  '.cursor/skills-core',
  '.cursor/skills-local',
  '.cursor/tools',
  '.cursor/integrations',
  '.cursor/integrations/configs',
  '.credentials',
  'templates',
  'templates/inputs',
  'templates/outputs',
  'templates/projects'
];

/**
 * Default files created when missing. Key = path relative to workspace root.
 * Do not overwrite existing files (preserves user content on update).
 */
export const DEFAULT_FILES: Record<string, string> = {
  'scratchpad.md': `# Scratchpad

Quick capture space for notes, ideas, and TODOs. Review periodically and move items to appropriate places.

---

## Ideas

## TODOs

## Notes

---
`,
  'projects/index.md': `# Projects Index

Track active and completed projects.

## Active Projects

None currently.

## Recently Completed

None yet.
`,
  'resources/meetings/index.md': `# Meetings Index

Meeting notes and transcripts organized by date.

## Recent Meetings

None yet.
`,
  'resources/notes/index.md': `# Notes Index

Standalone notes and observations.

## Recent Notes

None yet.
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
.cursor/skills-core/
`,
  'memory/activity-log.md': `# Activity Log

Chronological record of significant workspace activity.

---
`,
  'memory/items/decisions.md': `# Decisions Log

Key decisions with context and rationale.

---
`,
  'memory/items/learnings.md': `# Learnings Log

Insights and learnings from work.

---
`,
  'memory/items/agent-observations.md': `# Agent Observations

Observations about working preferences and patterns.

---
`,
  'memory/summaries/collaboration.md': `# Collaboration Profile

How to work effectively together.

---
`,
  'memory/summaries/sessions.md': `# Session Summaries

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

  for (const dir of WORKSPACE_DIRS) {
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
