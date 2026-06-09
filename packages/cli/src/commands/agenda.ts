/**
 * Agenda commands — `arete agenda scaffold` (Approach B: deterministic
 * agenda pre-seeding for the Phase 9 follow-up F3 synthesis fix).
 *
 * `arete agenda scaffold --meeting "<title>"` assembles the typed MeetingBrief,
 * pulls the per-attendee qualitative signal the brief does not surface
 * (`## 1:1 Discussion Topics`, `## Next 1:1 Focus`), loads the meeting-type
 * agenda template, and routes real candidate bullets into each template
 * section — emitting a PRE-POPULATED agenda skeleton the agent curates rather
 * than an empty template it must synthesize from scratch.
 *
 * Plan: dev/work/plans/arete-v2-chef-orchestrator/phase-9-followup-agenda-synthesis/plan.md
 */

import {
  createServices,
  resolveTemplateContent,
  TEMPLATE_REGISTRY,
  assembleAgendaScaffold,
  renderScaffoldMarkdown,
  extractDiscussionTopics,
  extractNextFocus,
  type AttendeeScaffoldInput,
  type TemplateInput,
} from '@arete/core';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';
import type { Command } from 'commander';
import { error, info } from '../formatters.js';

interface ScaffoldOpts {
  meeting: string;
  type?: string;
  project?: string;
  json?: boolean;
  maxPerSection?: string;
}

const PEOPLE_CATEGORIES = ['internal', 'customers', 'users'] as const;

/**
 * Infer the agenda template variant from the meeting title + attendee count,
 * mirroring the SKILL.md context-inference rules. A two-person sync (the person
 * + the owner) or a "1:1"/"weekly"/"check-in" title → one-on-one; otherwise the
 * general "other" template. Pass `--type` to override.
 */
function inferType(title: string, attendeeCount: number): string {
  const t = title.toLowerCase();
  if (/\b1:1\b|\bone[- ]on[- ]one\b|\bweekly\b|\bcheck[- ]?in\b/.test(t)) return 'one-on-one';
  if (attendeeCount <= 2) return 'one-on-one';
  return 'other';
}

/**
 * Parse a resolved agenda template's frontmatter + body into the shape the
 * scaffold helper needs (ordered `## ` headings + per-section minutes).
 */
function parseTemplate(type: string, content: string): TemplateInput {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let body = content;
  let timeAllocation: Record<string, number> | undefined;
  if (fmMatch) {
    body = fmMatch[2];
    try {
      const fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
      const ta = fm.time_allocation;
      if (ta && typeof ta === 'object') {
        timeAllocation = {};
        for (const [k, v] of Object.entries(ta as Record<string, unknown>)) {
          if (typeof v === 'number') timeAllocation[k] = v;
        }
      }
    } catch {
      // best-effort
    }
  }
  const sectionHeadings: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) sectionHeadings.push(m[1].trim());
  }
  return { type, sectionHeadings, timeAllocation };
}

export function registerAgendaCommands(program: Command): void {
  const agendaCmd = program
    .command('agenda')
    .description('Agenda scaffolding (deterministic pre-seeding for synthesis)');

  agendaCmd
    .command('scaffold')
    .description(
      'Emit a pre-populated agenda skeleton: each template section seeded with ' +
        'real candidate bullets (discussion topics, commitments, recent meetings, ' +
        'owed-sweep items, wiki) for the agent to curate + frame.',
    )
    .requiredOption('--meeting <slug-or-title>', 'Meeting slug or free-text title')
    .option('--type <variant>', 'Agenda template variant (default: inferred from attendee count)')
    .option('--project <slug>', 'Pin project context (passthrough to brief)')
    .option('--max-per-section <n>', 'Soft cap on candidate bullets per section', '8')
    .option('--json', 'Output the structured scaffold as JSON')
    .action(async (opts: ScaffoldOpts) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
        return;
      }
      const paths = services.workspace.getPaths(root);

      // 1. Assemble the typed MeetingBrief (single source of truth for context).
      const brief = await services.intelligence.assembleBriefForMeeting(opts.meeting, paths, {
        projectOverride: opts.project,
      });

      // 2. Per-attendee qualitative signal the brief does not surface:
      //    `## 1:1 Discussion Topics` + `## Next 1:1 Focus`.
      const attendees: AttendeeScaffoldInput[] = [];
      for (const mb of brief.attendeeMiniBriefs) {
        if (!mb.resolved || !mb.slug) continue;
        let content: string | null = null;
        for (const cat of PEOPLE_CATEGORIES) {
          const candidate = join(paths.people, cat, `${mb.slug}.md`);
          content = await services.storage.read(candidate);
          if (content) break;
        }
        if (!content) continue;
        attendees.push({
          slug: mb.slug,
          name: mb.name,
          discussionTopics: extractDiscussionTopics(content),
          nextFocus: extractNextFocus(content) ?? undefined,
        });
      }

      // 3. Resolve the agenda template (variant from --type or inferred).
      const type = opts.type ?? inferType(brief.metadata.title, brief.metadata.attendees.length);
      const known = TEMPLATE_REGISTRY['prepare-meeting-agenda'];
      if (opts.type && known && !known.includes(opts.type)) {
        const msg = `Unknown agenda variant '${opts.type}'. Known: ${known.join(', ')}`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
        return;
      }
      const tpl = await resolveTemplateContent(root, 'prepare-meeting-agenda', type);
      if (!tpl) {
        const msg = `No agenda template found for variant '${type}'`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
        return;
      }
      const template = parseTemplate(type, tpl.content);

      // 4. Assemble + render the scaffold.
      const maxPer = Number.parseInt(opts.maxPerSection ?? '8', 10);
      const scaffold = assembleAgendaScaffold(brief, attendees, template, {
        maxCandidatesPerSection: Number.isFinite(maxPer) && maxPer > 0 ? maxPer : 8,
      });

      if (opts.json) {
        console.log(JSON.stringify({ success: true, scaffold }, null, 2));
        return;
      }

      if (!brief.metadata.resolved) {
        info(
          `Note: meeting "${opts.meeting}" did not resolve to a file/calendar event — ` +
            'scaffold is title-only. Fall back to per-attendee briefs if needed.',
        );
      }
      console.log(renderScaffoldMarkdown(scaffold));
    });
}
