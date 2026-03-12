/**
 * Shared helper for reading the pre-built AGENTS.md from dist/
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getPackageRoot } from '../package-root.js';

/**
 * Read the pre-built AGENTS.md from dist/AGENTS.md.
 * Falls back to null if not found (caller should generate minimal version).
 */
export function readPrebuiltAgentsMd(): string | null {
  try {
    const packageRoot = getPackageRoot();
    const agentsPath = join(packageRoot, 'dist', 'AGENTS.md');
    if (existsSync(agentsPath)) {
      return readFileSync(agentsPath, 'utf-8');
    }
  } catch {
    // Fall through to return null
  }
  return null;
}

/**
 * Generate a minimal AGENTS.md/CLAUDE.md fallback when dist/AGENTS.md is not available.
 */
export function generateMinimalAgentsMd(): string {
  return `# Areté - Product Builder's Operating System

## Routing

Before responding to ANY user request in this Areté workspace:
Use \`arete route "<message>"\` to route to the right skill.

## CLI Commands

- \`arete route "<query>"\` — Route to skill and suggest model tier
- \`arete skill list\` — List available skills
- \`arete search "query"\` — Search across workspace (use --scope for specific areas)
- \`arete search "query" --scope memory\` — Search decisions and learnings
- \`arete search "query" --timeline\` — Show temporal view with themes
- \`arete brief --for "task"\` — Assemble briefing for a task

## Workspace Structure

\`\`\`
product-workspace/
├── now/               # Current focus
├── goals/             # Strategy and goals
├── context/           # Business context
├── resources/meetings/ # Meeting notes
├── projects/          # Active and archived projects
├── people/            # People
└── .arete/memory/     # Decisions, learnings
\`\`\`
`;
}
