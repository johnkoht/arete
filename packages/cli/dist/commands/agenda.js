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
import { createServices, resolveTemplateContent, TEMPLATE_REGISTRY, assembleAgendaScaffold, renderScaffoldMarkdown, extractDiscussionTopics, extractNextFocus, slugifyPersonName, } from '@arete/core';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';
import { error, info } from '../formatters.js';
const PEOPLE_CATEGORIES = ['internal', 'customers', 'users'];
/**
 * Pull the owner's display name from `context/profile.md` frontmatter (`name:`).
 * Mirrors how the entity service derives the workspace owner. Best-effort: a
 * lightweight frontmatter read so the CLI need not import the YAML parser path.
 */
function parseOwnerName(profileContent) {
    const fm = profileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm)
        return undefined;
    const m = fm[1].match(/^name:\s*(.+?)\s*$/m);
    if (!m)
        return undefined;
    return m[1].replace(/^["']|["']$/g, '').trim() || undefined;
}
/**
 * Parse a resolved agenda template's frontmatter + body into the shape the
 * scaffold helper needs (ordered `## ` headings + per-section minutes).
 */
function parseTemplate(type, content) {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    let body = content;
    let timeAllocation;
    if (fmMatch) {
        body = fmMatch[2];
        try {
            const fm = parseYaml(fmMatch[1]);
            const ta = fm.time_allocation;
            if (ta && typeof ta === 'object') {
                timeAllocation = {};
                for (const [k, v] of Object.entries(ta)) {
                    if (typeof v === 'number')
                        timeAllocation[k] = v;
                }
            }
        }
        catch {
            // best-effort
        }
    }
    const sectionHeadings = [];
    for (const line of body.split('\n')) {
        const m = line.match(/^##\s+(.+?)\s*$/);
        if (m)
            sectionHeadings.push(m[1].trim());
    }
    return { type, sectionHeadings, timeAllocation };
}
export function registerAgendaCommands(program) {
    const agendaCmd = program
        .command('agenda')
        .description('Agenda scaffolding (deterministic pre-seeding for synthesis)');
    agendaCmd
        .command('scaffold')
        .description('Emit a pre-populated agenda skeleton: each template section seeded with ' +
        'real candidate bullets (discussion topics, commitments, recent meetings, ' +
        'owed-sweep items, wiki) for the agent to curate + frame.')
        .requiredOption('--meeting <slug-or-title>', 'Meeting slug or free-text title')
        .option('--type <variant>', 'Agenda template variant (default: inferred from attendee count)')
        .option('--project <slug>', 'Pin project context (passthrough to brief)')
        .option('--max-per-section <n>', 'Soft cap on candidate bullets per section', '8')
        .option('--json', 'Output the structured scaffold as JSON')
        .action(async (opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            }
            else {
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
        const attendees = [];
        for (const mb of brief.attendeeMiniBriefs) {
            if (!mb.resolved || !mb.slug)
                continue;
            let content = null;
            for (const cat of PEOPLE_CATEGORIES) {
                const candidate = join(paths.people, cat, `${mb.slug}.md`);
                content = await services.storage.read(candidate);
                if (content)
                    break;
            }
            if (!content)
                continue;
            attendees.push({
                slug: mb.slug,
                name: mb.name,
                discussionTopics: extractDiscussionTopics(content),
                nextFocus: extractNextFocus(content) ?? undefined,
                // Attendee-scoped commitments (judge #2 BLOCKER fix): seed Priorities
                // from each person's OWN owed-list, not the owner-global ledger.
                commitments: mb.commitments,
            });
        }
        // Workspace owner slug — exclude their own ledger from per-attendee
        // Priorities seeds (owner is on every 1:1). Source: context/profile.md.
        let ownerSlug;
        const profileContent = await services.storage.read(join(paths.context, 'profile.md'));
        if (profileContent) {
            const ownerName = parseOwnerName(profileContent);
            if (ownerName)
                ownerSlug = slugifyPersonName(ownerName);
        }
        // 3. Resolve the agenda template (variant from --type or inferred).
        // WS-1 / R10: when not overridden, derive the type from a prior same-
        // titled instance (recurring meeting) — additive, a genuine 1:1 with no
        // prior instance still resolves to one-on-one.
        const type = opts.type ??
            (await services.intelligence.deriveAgendaTemplateType(brief.metadata.title, brief.metadata.attendees.length, paths, brief.subjectSlug ? join(paths.resources, 'meetings', `${brief.subjectSlug}.md`) : undefined));
        const known = TEMPLATE_REGISTRY['prepare-meeting-agenda'];
        if (opts.type && known && !known.includes(opts.type)) {
            const msg = `Unknown agenda variant '${opts.type}'. Known: ${known.join(', ')}`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
            return;
        }
        const tpl = await resolveTemplateContent(root, 'prepare-meeting-agenda', type);
        if (!tpl) {
            const msg = `No agenda template found for variant '${type}'`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
            return;
        }
        const template = parseTemplate(type, tpl.content);
        // 4. Assemble + render the scaffold.
        const maxPer = Number.parseInt(opts.maxPerSection ?? '8', 10);
        const scaffold = assembleAgendaScaffold(brief, attendees, template, {
            maxCandidatesPerSection: Number.isFinite(maxPer) && maxPer > 0 ? maxPer : 8,
            ownerSlug,
        });
        if (opts.json) {
            console.log(JSON.stringify({ success: true, scaffold }, null, 2));
            return;
        }
        if (!brief.metadata.resolved) {
            info(`Note: meeting "${opts.meeting}" did not resolve to a file/calendar event — ` +
                'scaffold is title-only. Fall back to per-attendee briefs if needed.');
        }
        console.log(renderScaffoldMarkdown(scaffold));
    });
}
//# sourceMappingURL=agenda.js.map