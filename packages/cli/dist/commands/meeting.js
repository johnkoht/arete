/**
 * arete meeting commands — add and process meetings
 */
import { createServices, loadConfig, saveMeetingFile, meetingFilename, slugifyPersonName, refreshQmdIndex, } from '@arete/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { success, error, info, warn } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

## Transcript
{transcript}
`;
export function registerMeetingCommands(program) {
    const meetingCmd = program.command('meeting').description('Add meetings');
    meetingCmd
        .command('add')
        .description('Add a meeting from JSON file or stdin')
        .option('--file <path>', 'Path to JSON file')
        .option('--stdin', 'Read JSON from stdin')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        if (!opts.file && !opts.stdin) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Provide --file <path> or --stdin',
                }));
            }
            else {
                error('Provide --file <path> or --stdin');
                info('Example: arete meeting add --file meeting.json');
            }
            process.exit(1);
        }
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
        }
        const config = await loadConfig(services.storage, root);
        let raw;
        try {
            if (opts.stdin) {
                const chunks = [];
                for await (const chunk of process.stdin) {
                    chunks.push(chunk);
                }
                raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            else if (opts.file) {
                raw = JSON.parse(readFileSync(opts.file, 'utf8'));
            }
            else {
                throw new Error('No input');
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Invalid JSON: ${msg}` }));
            }
            else {
                error(`Invalid JSON: ${msg}`);
            }
            process.exit(1);
        }
        const meeting = normalizeMeetingInput(raw);
        const paths = services.workspace.getPaths(root);
        const outputDir = join(paths.resources, 'meetings');
        const fullPath = await saveMeetingFile(services.storage, meeting, outputDir, DEFAULT_TEMPLATE, { integration: 'Manual', force: false });
        // Auto-refresh qmd index after write (skip if meeting already existed or --skip-qmd)
        let qmdResult;
        if (fullPath !== null && !opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: !!fullPath,
                saved: !!fullPath,
                path: fullPath,
                filename: fullPath ? meetingFilename(meeting) : null,
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }));
            return;
        }
        if (fullPath) {
            success(`Saved: ${fullPath}`);
        }
        else {
            info(`Skipped (already exists): ${meetingFilename(meeting)}`);
        }
        displayQmdResult(qmdResult);
    });
    meetingCmd
        .command('process')
        .description('Process a meeting file with People Intelligence classification')
        .option('--file <path>', 'Path to meeting markdown file (relative to workspace or absolute)')
        .option('--latest', 'Process latest meeting in resources/meetings')
        .option('--threshold <n>', 'Confidence threshold override (default from policy or 0.65)')
        .option('--feature-extraction-tuning', 'Enable extraction tuning for this run')
        .option('--feature-enrichment', 'Enable optional enrichment for this run')
        .option('--dry-run', 'Analyze only; do not write people files or attendee_ids')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--json', 'Output as JSON')
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
        }
        const config = await loadConfig(services.storage, root);
        if (!opts.file && !opts.latest) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Provide --file <path> or --latest' }));
            }
            else {
                error('Provide --file <path> or --latest');
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        const meetingPath = await resolveMeetingPath(services, paths.resources, root, opts.file, Boolean(opts.latest));
        if (!meetingPath) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'No meeting file found to process' }));
            }
            else {
                error('No meeting file found to process');
            }
            process.exit(1);
        }
        const content = await services.storage.read(meetingPath);
        if (!content) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Meeting not found: ${meetingPath}` }));
            }
            else {
                error(`Meeting not found: ${meetingPath}`);
            }
            process.exit(1);
        }
        const attendees = extractAttendeesFromMeeting(content, meetingPath, root);
        if (attendees.length === 0) {
            if (opts.json) {
                console.log(JSON.stringify({ success: true, meeting: meetingPath, candidates: 0, message: 'No attendees detected' }));
            }
            else {
                warn('No attendees detected in meeting content.');
            }
            return;
        }
        const thresholdRaw = opts.threshold ? Number(opts.threshold) : undefined;
        const confidenceThreshold = typeof thresholdRaw === 'number' && Number.isFinite(thresholdRaw)
            ? thresholdRaw
            : undefined;
        const digest = await services.entity.suggestPeopleIntelligence(attendees.map((candidate) => ({
            name: candidate.name,
            email: candidate.email ?? null,
            text: candidate.text ?? null,
            source: candidate.source,
        })), paths, {
            confidenceThreshold,
            features: {
                enableExtractionTuning: Boolean(opts.featureExtractionTuning),
                enableEnrichment: Boolean(opts.featureEnrichment),
            },
        });
        const dryRun = Boolean(opts.dryRun);
        const applied = [];
        const unknownQueue = digest.suggestions.filter((s) => s.recommendation.category === 'unknown_queue');
        if (!dryRun) {
            for (const suggestion of digest.suggestions) {
                const category = suggestion.recommendation.category;
                if (category === 'unknown_queue')
                    continue;
                const name = suggestion.candidate.name?.trim();
                if (!name)
                    continue;
                const slug = slugifyPersonName(name);
                const personPath = join(paths.people, category, `${slug}.md`);
                const exists = await services.storage.exists(personPath);
                if (!exists) {
                    const frontmatter = [
                        '---',
                        `name: "${name.replace(/"/g, '\\"')}"`,
                        `category: "${category}"`,
                        suggestion.candidate.email ? `email: "${suggestion.candidate.email}"` : null,
                        suggestion.candidate.company ? `company: "${suggestion.candidate.company}"` : null,
                        '---',
                        '',
                        `# ${name}`,
                        '',
                        `- Created from meeting process on ${new Date().toISOString().slice(0, 10)}`,
                        '',
                    ].filter((line) => line != null).join('\n');
                    await services.storage.write(personPath, frontmatter);
                }
                applied.push({ slug, category });
            }
            const attendeeIds = [...new Set(applied.map((p) => p.slug))];
            if (attendeeIds.length > 0) {
                const updatedMeeting = upsertAttendeeIds(content, attendeeIds);
                if (updatedMeeting !== content) {
                    await services.storage.write(meetingPath, updatedMeeting);
                }
            }
            if (applied.length > 0) {
                await services.entity.buildPeopleIndex(paths);
            }
        }
        // Auto-refresh qmd index after write (skip if nothing written or dry-run or --skip-qmd)
        let qmdResult;
        if (applied.length > 0 && !opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        const response = {
            success: true,
            meeting: meetingPath,
            candidates: attendees.length,
            digest,
            dryRun,
            applied,
            unknownQueue: unknownQueue.map((u) => ({
                name: u.candidate.name ?? null,
                confidence: u.confidence,
                rationale: u.rationale,
            })),
            qmd: qmdResult ?? { indexed: false, skipped: true },
        };
        if (opts.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        success(`Processed meeting: ${meetingPath}`);
        info(`Candidates: ${attendees.length}`);
        info(`Applied: ${applied.length}`);
        info(`Unknown queue: ${unknownQueue.length}`);
        if (unknownQueue.length > 0) {
            warn('Some attendees remain in unknown_queue and require review.');
        }
        displayQmdResult(qmdResult);
    });
}
async function resolveMeetingPath(services, resourcesPath, root, file, latest) {
    if (file) {
        return file.startsWith('/') ? file : join(root, file);
    }
    if (!latest)
        return null;
    const meetingsDir = join(resourcesPath, 'meetings');
    const files = await services.storage.list(meetingsDir, { extensions: ['.md'] });
    const filtered = files
        .filter((path) => !path.endsWith('/index.md') && !path.endsWith('index.md'))
        .sort((a, b) => b.localeCompare(a));
    return filtered[0] ?? null;
}
function extractFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match)
        return { frontmatter: {}, body: content };
    try {
        const frontmatter = parseYaml(match[1]);
        return { frontmatter, body: match[2] };
    }
    catch {
        return { frontmatter: {}, body: content };
    }
}
function parseAttendeeToken(token) {
    const trimmed = token.trim();
    if (!trimmed)
        return {};
    const angleMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (angleMatch) {
        return {
            name: angleMatch[1].trim(),
            email: angleMatch[2].trim().toLowerCase(),
        };
    }
    const emailOnly = trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    if (emailOnly) {
        return {
            name: trimmed.split('@')[0].replace(/[._-]/g, ' '),
            email: trimmed.toLowerCase(),
        };
    }
    return { name: trimmed, email: null };
}
function dedupeCandidates(candidates) {
    const seen = new Set();
    const unique = [];
    for (const candidate of candidates) {
        const key = `${candidate.email?.toLowerCase() ?? ''}|${candidate.name?.toLowerCase() ?? ''}`;
        if (!candidate.name && !candidate.email)
            continue;
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(candidate);
    }
    return unique;
}
function extractAttendeesFromMeeting(content, sourcePath, root) {
    const { frontmatter, body } = extractFrontmatter(content);
    const candidates = [];
    const attendees = frontmatter.attendees;
    if (Array.isArray(attendees)) {
        for (const attendee of attendees) {
            if (typeof attendee === 'string') {
                const parsed = parseAttendeeToken(attendee);
                candidates.push({ ...parsed, source: relativePath(sourcePath, root), text: body.slice(0, 400) });
            }
        }
    }
    else if (typeof attendees === 'string') {
        for (const token of attendees.split(',')) {
            const parsed = parseAttendeeToken(token);
            candidates.push({ ...parsed, source: relativePath(sourcePath, root), text: body.slice(0, 400) });
        }
    }
    const attendeesLine = body.match(/\*\*Attendees\*\*:\s*(.+)$/im) || body.match(/^Attendees:\s*(.+)$/im);
    if (attendeesLine && attendeesLine[1]) {
        for (const token of attendeesLine[1].split(',')) {
            const parsed = parseAttendeeToken(token);
            candidates.push({ ...parsed, source: relativePath(sourcePath, root), text: body.slice(0, 400) });
        }
    }
    const speakerRegex = /\*\*(?:\[[^\]]+\]\s*)?([^*:\n]{2,80})\*\*:/g;
    let match = null;
    while ((match = speakerRegex.exec(body)) !== null) {
        const speakerName = match[1].trim();
        if (/^(unknown|you|host|speaker|attendees|date|duration|source)$/i.test(speakerName))
            continue;
        candidates.push({
            name: speakerName,
            email: null,
            source: relativePath(sourcePath, root),
            text: body.slice(Math.max(0, match.index - 120), Math.min(body.length, match.index + 220)),
        });
    }
    return dedupeCandidates(candidates);
}
function upsertAttendeeIds(content, attendeeIds) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        const frontmatter = stringifyYaml({ attendee_ids: attendeeIds }).trimEnd();
        return `---\n${frontmatter}\n---\n\n${content}`;
    }
    let parsed = {};
    try {
        parsed = parseYaml(match[1]) ?? {};
    }
    catch {
        parsed = {};
    }
    parsed.attendee_ids = attendeeIds;
    const yaml = stringifyYaml(parsed).trimEnd();
    return `---\n${yaml}\n---\n\n${match[2]}`;
}
function relativePath(path, root) {
    return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
function normalizeMeetingInput(raw) {
    const today = new Date().toISOString().slice(0, 10);
    const title = raw.title?.trim() || 'Untitled Meeting';
    const date = raw.date?.trim()?.slice(0, 10) || today;
    const summary = raw.summary?.trim() ?? '';
    const transcript = raw.transcript?.trim() ?? '';
    if (!summary && !transcript) {
        throw new Error('At least one of summary or transcript is required');
    }
    const actionItems = Array.isArray(raw.action_items)
        ? raw.action_items.filter((a) => typeof a === 'string')
        : [];
    const attendees = Array.isArray(raw.attendees)
        ? raw.attendees.map((a) => typeof a === 'string'
            ? a
            : {
                name: a.name,
                email: a.email,
            })
        : [];
    return {
        title,
        date,
        duration_minutes: (typeof raw.duration_minutes === 'number' ? raw.duration_minutes : 0),
        summary: summary || 'No summary available.',
        transcript: transcript || 'No transcript available.',
        action_items: actionItems,
        highlights: [],
        attendees,
        url: raw.url?.trim() ?? '',
    };
}
//# sourceMappingURL=meeting.js.map