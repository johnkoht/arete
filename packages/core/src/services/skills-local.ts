/**
 * Skills-local seeding (Phase 2 — chef-orchestrator APPEND-file convention).
 *
 * `.arete/skills-local/<skill-slug>.md` files give the user a per-skill
 * APPEND surface — free-form guidance the chef-orchestrator agent reads
 * at the start of every skill run. Seeded on `arete install` and
 * `arete update`. Idempotent: never overwrites existing user content.
 *
 * The five Phase 2 chef-orchestrator skills are seeded by default:
 *   - daily-winddown
 *   - weekly-winddown
 *   - week-plan
 *   - process-meetings
 *   - meeting-prep
 *
 * If a skill file already exists at `.arete/skills-local/<slug>.md`,
 * it is preserved verbatim. Only missing files are seeded.
 *
 * Phase 3 transition note: when the skills directory split ships,
 * these files migrate naturally to `.agents/skills/<slug>/APPEND.md`
 * (or similar) as part of the user-skill dir. No data loss.
 */

import { join } from 'path';
import type { StorageAdapter } from '../storage/adapter.js';

/** Skills that get an APPEND-file template seeded by Phase 2. */
export const PHASE_2_CHEF_ORCHESTRATOR_SKILLS = [
  'daily-winddown',
  'weekly-winddown',
  'week-plan',
  'process-meetings',
  'meeting-prep',
] as const;

export type ChefOrchestratorSkillSlug =
  (typeof PHASE_2_CHEF_ORCHESTRATOR_SKILLS)[number];

/**
 * Render the seed template for a given skill slug.
 *
 * The template is the same for all five skills, customized only by the
 * skill name in the heading. Comments inside HTML comments give the
 * user examples without polluting the rendered file.
 */
export function renderSkillsLocalTemplate(slug: string): string {
  const displayName = slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `# ${displayName} — your context

The chef-orchestrator agent reads this file at the start of every \`${slug}\`
run. Edit freely; treat it like a personal briefing.

This file is preserved across \`arete update\`. The agent will read it
even if the upstream SKILL.md changes; the SKILL.md provides the
workflow envelope, and this file provides your per-skill context.

## My MCPs and how I use them

<!-- Examples:
- Slack MCP: send DMs to teammates; post to #channels for announcements
- GWS Calendar: schedule meetings, find availability
- Notion MCP: update Glance 2.0 stakes doc, customer research pages
-->

## Active initiatives / what's important right now

<!-- Examples:
- Glance 2.0 launch (Q3)
- Cover Whale email-template rollout
-->

## People to watch / patterns

<!-- Examples:
- Anthony: Glance comms eng; auto-attachments lead
- Items >14d old without movement → drop unless customer-touching
-->

## Cross-references the chef should always pull

<!-- Examples:
- Jira INGEST-* for sprint status
- Notion "Glance 2.0 Stakes" doc
-->

## Action verbs I want proposed (or drafted)

<!-- The chef proposes only verbs you list here. Examples:
- slack.send_dm — yes, executable (Slack MCP wired)
- calendar.create_event — yes, executable (GWS Calendar wired)
- notion.update_page — yes, executable (Notion MCP wired)
- jira.create_ticket — yes, draft-only (no MCP; agent drafts the ticket content)
- arete.commitments_create — yes, executable (always available in Areté workspace)
-->
`;
}

/**
 * Result of seedSkillsLocal — which files were seeded and which were preserved.
 */
export interface SeedSkillsLocalResult {
  /** Files newly created (relative to workspace root). */
  added: string[];
  /** Files preserved (already existed; verbatim untouched). */
  preserved: string[];
}

/**
 * Seed `.arete/skills-local/<slug>.md` for each Phase 2 chef-orchestrator
 * skill. Idempotent: if a file already exists at the destination, it is
 * preserved untouched. Only missing files are written.
 *
 * Caller is responsible for creating `.arete/skills-local/` directory
 * (handled via BASE_WORKSPACE_DIRS in workspace-structure.ts).
 */
export async function seedSkillsLocal(
  storage: StorageAdapter,
  workspaceRoot: string,
  options: {
    /** Override which skills get seeded (defaults to all Phase 2 chef skills). */
    skills?: readonly string[];
  } = {},
): Promise<SeedSkillsLocalResult> {
  const skills = options.skills ?? PHASE_2_CHEF_ORCHESTRATOR_SKILLS;
  const baseDir = join(workspaceRoot, '.arete', 'skills-local');

  const result: SeedSkillsLocalResult = {
    added: [],
    preserved: [],
  };

  // Ensure the directory exists (cheap, idempotent).
  try {
    await storage.mkdir(baseDir);
  } catch {
    // Non-fatal; storage adapter may auto-create on write.
  }

  for (const slug of skills) {
    const destPath = join(baseDir, `${slug}.md`);
    const exists = await storage.exists(destPath);

    if (exists) {
      result.preserved.push(join('.arete', 'skills-local', `${slug}.md`));
      continue;
    }

    try {
      await storage.write(destPath, renderSkillsLocalTemplate(slug));
      result.added.push(join('.arete', 'skills-local', `${slug}.md`));
    } catch {
      // Non-fatal: skip this skill's seed on error; install/update should
      // not fail because one APPEND template couldn't be written.
    }
  }

  return result;
}
