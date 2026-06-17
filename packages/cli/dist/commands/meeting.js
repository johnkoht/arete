/**
 * arete meeting commands — add and process meetings
 */
import { createServices, loadConfig, saveMeetingFile, meetingFilename, slugifyPersonName, refreshQmdIndex, extractMeetingIntelligence, formatStagedSections, updateMeetingContent, SINGLE_PASS_STAGED_HEADERS, processMeetingExtraction, applyReconciliationDecision, extractUserNotes, parseStagedSections, parseStagedItemStatus, parseStagedItemEdits, parseStagedItemOwner, writeItemStatusToFile, commitApprovedItems, clearApprovedSections, formatFilteredStagedSections, parseGoals, buildMeetingContext, deserializeContextBundle, applyMeetingIntelligence, generateMeetingManifest, getCompletedItems, getOpenTasks, calculateSpeakingRatio, inferUrgency, loadReconciliationContext, reconcileMeetingBatch, loadRecentMeetingBatch, batchLLMReview, buildSkippedItemFateEvents, buildDismissedItemFateEvents, writeMeetingApplyFrontmatter, appendChefSkipLog, writeWithLock, 
// Phase 13 AC2/AC3 — meeting area write surface
listMeetingsForBackfill, qualifyMeetingAreaMatch, applyAreaToMeeting, resetBackfilledMeetingAreas, 
// Phase 10b-min wiring — reactive cross-meeting dedup
wireExtractDedup, adaptFilteredItemsForDedup, decorateStagedSectionsWithDupeBadges, 
// single-pass-extraction (W1.5/W2)
resolveMeetingSeries, renderSeriesContext, AreaParserService, 
// chef-holistic-reconcile W7 shadow-soak infra
writeRawExtractionSnapshot, 
// single-pass-extraction W1 — fail-loud + failure snapshot (S1/S2)
writeFailureSnapshot, ParseError, TruncationError, EmptyExtractionError, } from '@arete/core';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { success, error, info, warn, listItem } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
import { displayReconciliationDetails, displayReconciledCompletedItems } from '../lib/reconciliation-output.js';
/**
 * Format a person slug as a display name.
 * E.g., 'john-smith' → 'John Smith'
 */
function formatSlugAsName(slug) {
    return slug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
/**
 * Add an entry to the ## Waiting On section in week.md.
 * Creates the section if it doesn't exist.
 *
 * Format: - [ ] Person Name: What they owe @person(slug) @from(commitment:hashPrefix)
 */
async function addWaitingOnEntry(storage, nowPath, personName, personSlug, text, commitmentHashPrefix) {
    const weekFile = join(nowPath, 'week.md');
    let content = await storage.read(weekFile);
    if (!content) {
        // File doesn't exist, create minimal structure
        content = `# Week\n\n## Waiting On\n`;
    }
    const entry = `- [ ] ${personName}: ${text} @person(${personSlug}) @from(commitment:${commitmentHashPrefix})`;
    // Find ## Waiting On section
    const waitingOnMatch = content.match(/^## Waiting On\s*$/m);
    if (waitingOnMatch) {
        // Section exists - insert entry after header
        const insertPos = (waitingOnMatch.index ?? 0) + waitingOnMatch[0].length;
        const before = content.slice(0, insertPos);
        const after = content.slice(insertPos);
        content = `${before}\n${entry}${after}`;
    }
    else {
        // Section doesn't exist - append it
        // Find a good place to insert (after Tasks section or at end)
        const tasksMatch = content.match(/^### Could complete[\s\S]*?(?=\n## |\n---|\z)/m);
        if (tasksMatch && tasksMatch.index !== undefined) {
            const insertPos = tasksMatch.index + tasksMatch[0].length;
            const before = content.slice(0, insertPos);
            const after = content.slice(insertPos);
            content = `${before}\n\n## Waiting On\n${entry}${after}`;
        }
        else {
            // Append at end
            content = content.trimEnd() + `\n\n## Waiting On\n${entry}\n`;
        }
    }
    await storage.write(weekFile, content);
}
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
/**
 * Confidence floor for meeting area inference (Phase 13 AC2/AC3 — inherited
 * from the phase-12 backfill contract; pre-mortem R3, non-negotiable).
 * Per-signal qualification (`qualifyMeetingAreaMatch`) is applied ON TOP of
 * this floor for backfill — stricter, never looser.
 */
const MEETING_BACKFILL_CONFIDENCE_FLOOR = 0.7;
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
        // -----------------------------------------------------------------
        // Phase 13 AC2 — propose an area when the meeting lacks one.
        // PROPOSAL ONLY: process performs ZERO area writes. The
        // process-meetings skill presents this; on confirm,
        // `arete meeting set-area` writes BEFORE approve so commitments
        // inherit. ≥0.7 floor; below floor → proposedArea: null in JSON,
        // silent in human output.
        // -----------------------------------------------------------------
        const { frontmatter: meetingFm, body: meetingBody } = extractFrontmatter(content);
        let proposedArea = null;
        const hasExplicitArea = typeof meetingFm['area'] === 'string' && meetingFm['area'].trim().length > 0;
        if (!hasExplicitArea) {
            try {
                const areaMatch = await services.areaParser.suggestAreaForMeeting({
                    title: typeof meetingFm['title'] === 'string' && meetingFm['title'].trim()
                        ? meetingFm['title']
                        : meetingPath.replace(/^.*\//, '').replace(/\.md$/, ''),
                    summary: typeof meetingFm['summary'] === 'string' ? meetingFm['summary'] : undefined,
                    transcript: meetingBody,
                });
                if (areaMatch && areaMatch.confidence >= MEETING_BACKFILL_CONFIDENCE_FLOOR) {
                    proposedArea = {
                        slug: areaMatch.areaSlug,
                        confidence: Number(areaMatch.confidence.toFixed(2)),
                        signal: areaMatch.signal,
                        corroborated: Boolean(areaMatch.corroborated),
                    };
                }
            }
            catch {
                // Inference failure is non-fatal — process continues without a proposal.
            }
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
            // Phase 13 AC2: null when the meeting already has an area, no
            // confident match exists, or inference failed.
            proposedArea,
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
        if (proposedArea) {
            info(`Proposed area: ${proposedArea.slug} (confidence ${proposedArea.confidence}) — confirm with \`arete meeting set-area <file> ${proposedArea.slug}\``);
        }
        if (unknownQueue.length > 0) {
            warn('Some attendees remain in unknown_queue and require review.');
        }
        displayQmdResult(qmdResult);
    });
    // ---------------------------------------------------------------------------
    // arete meeting backfill-area  (Phase 13 AC3)
    //
    // Third instantiation of the backfill contract (commitments, projects,
    // now meetings): preview by default, --apply gated, --reset scoped to
    // `area_set_by: backfill` provenance, 0.7 floor, --json complete in all
    // exit paths, qmd refresh after apply. Meeting-specific additions:
    // per-signal qualification (pre-mortem D1 — summary-only name matches
    // refused, title-only flagged `name-only`), the D2
    // `also-via-topics` recall-loss column, and surfaced lock abstains (D4).
    // ---------------------------------------------------------------------------
    meetingCmd
        .command('backfill-area')
        .description('Backfill `area:` on meetings missing it by inferring from title + summary + transcript. Default is preview (dry-run); pass --apply to write.')
        .option('--apply', 'Write changes (default: preview-only dry-run)')
        .option('--reset', 'Clear `area`/`area_set_by` ONLY on meetings where area_set_by="backfill"; approval/manual/legacy areas stay intact')
        .option('--days <n>', 'Limit candidates to meetings from the last N days (default: all history)')
        .option('--skip-qmd', 'Skip automatic qmd index update after --apply')
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
                info('Run "arete install" to create a workspace');
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        // --reset path: clear backfill-stamped areas only.
        if (opts.reset) {
            const result = await resetBackfilledMeetingAreas(services.storage, paths);
            if (opts.json) {
                console.log(JSON.stringify({ success: true, reset: result.reset }));
            }
            else {
                success(`Cleared area on ${result.reset.length} backfilled meeting(s).`);
                for (const file of result.reset)
                    listItem('Reset', file);
                if (result.reset.length === 0) {
                    info('No meeting carried the backfill provenance marker. Nothing to reset.');
                }
            }
            return;
        }
        // Optional --days candidate limiter (OQ1: default all history).
        let sinceDay;
        if (opts.days !== undefined) {
            const days = Number(opts.days);
            if (!Number.isFinite(days) || days <= 0) {
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: '--days must be a positive number' }));
                }
                else {
                    error('--days must be a positive number');
                }
                process.exit(1);
            }
            sinceDay = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
        }
        const areas = await services.areaParser.listAreas();
        const candidates = await listMeetingsForBackfill(services.storage, paths, {
            sinceDay,
            areaSlugs: areas.map((a) => a.slug),
        });
        const proposals = [];
        const unmatched = [];
        for (const candidate of candidates) {
            try {
                const match = await services.areaParser.suggestAreaForMeeting({
                    title: candidate.title,
                    summary: candidate.summary,
                    transcript: candidate.body,
                });
                if (match) {
                    const q = qualifyMeetingAreaMatch(match, MEETING_BACKFILL_CONFIDENCE_FLOOR);
                    if (q.qualified) {
                        proposals.push({
                            file: candidate.file,
                            path: candidate.path,
                            area: match.areaSlug,
                            confidence: Number(match.confidence.toFixed(2)),
                            signal: match.signal,
                            corroborated: Boolean(match.corroborated),
                            nameOnly: q.nameOnly,
                            alsoMatchesViaTopics: candidate.alsoMatchesViaTopics,
                        });
                        continue;
                    }
                    unmatched.push({ file: candidate.file, reason: q.reason ?? 'unqualified' });
                    continue;
                }
            }
            catch {
                // Inference failure is non-fatal — the meeting stays unmatched.
            }
            unmatched.push({ file: candidate.file, reason: 'no-match' });
        }
        // D1: name-only rows grouped LAST so the spot-check tail is visible.
        proposals.sort((a, b) => Number(a.nameOnly) - Number(b.nameOnly));
        const nameOnlyCount = proposals.filter((p) => p.nameOnly).length;
        // --apply path. Lock abstains are surfaced, never silent (D4).
        let applied = false;
        const unwritten = [];
        if (opts.apply && proposals.length > 0) {
            for (const proposal of proposals) {
                const res = await applyAreaToMeeting(services.storage, proposal.path, proposal.area, 'backfill');
                if (!res.written && !res.noop) {
                    unwritten.push({ file: proposal.file, reason: res.abstainReason ?? 'unknown' });
                }
            }
            applied = true;
        }
        // qmd refresh after workspace writes — before the JSON return so
        // JSON mode still indexes (cli LEARNINGS).
        let qmdResult;
        if (applied && !opts.skipQmd) {
            const config = await loadConfig(services.storage, root);
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                applied,
                candidates: candidates.length,
                matched: proposals.length,
                nameOnly: nameOnlyCount,
                proposals: proposals.map(({ path: _p, ...rest }) => rest),
                unmatched,
                unwritten,
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
            return;
        }
        const mode = applied ? 'APPLIED' : 'PREVIEW (dry-run)';
        info(`Backfill: ${mode}`);
        listItem('Candidates (no `area:` frontmatter)', String(candidates.length));
        listItem(`Qualified at ≥${MEETING_BACKFILL_CONFIDENCE_FLOOR} + signal policy`, String(proposals.length));
        if (proposals.length > 0) {
            console.log('');
            console.log(chalk.bold('Proposed areas:'));
            for (const p of proposals) {
                const flags = [`confidence ${p.confidence}`];
                if (p.signal)
                    flags.push(p.signal);
                if (p.nameOnly)
                    flags.push(chalk.yellow('name-only'));
                const alsoVia = p.alsoMatchesViaTopics.length > 0
                    ? chalk.magenta(`  [also-via-topics: ${p.alsoMatchesViaTopics.join(', ')}]`)
                    : '';
                console.log(`  ${chalk.dim(p.file.padEnd(52))} ${chalk.cyan(p.area)} ${chalk.dim(`(${flags.join(', ')})`)}${alsoVia}`);
            }
            if (nameOnlyCount > 0) {
                console.log('');
                warn(`${nameOnlyCount} of ${proposals.length} proposals are name-only title matches — eyeball these before --apply (MC3 long-tail spot-check).`);
            }
        }
        if (unmatched.length > 0) {
            console.log('');
            console.log(chalk.bold('No qualified match (left area-less — honest):'));
            for (const u of unmatched)
                console.log(`  ${chalk.dim(u.file)} (${u.reason})`);
        }
        if (unwritten.length > 0) {
            console.log('');
            for (const u of unwritten) {
                warn(`NOT written (lock abstain): ${u.file} — ${u.reason}`);
            }
        }
        console.log('');
        if (proposals.length > 0 && !applied) {
            info('Re-run with --apply to write changes.');
            info('Use `arete meeting backfill-area --reset` to undo backfill-set areas later.');
        }
        else if (applied) {
            success(`Applied area to ${proposals.length - unwritten.length} meeting(s); stamped area_set_by: backfill provenance.`);
            displayQmdResult(qmdResult);
        }
        else if (candidates.length === 0) {
            info('Every meeting already carries an `area:`. Nothing to backfill.');
        }
    });
    // ---------------------------------------------------------------------------
    // arete meeting set-area <file> <area-slug>  (Phase 13 AC2)
    //
    // The confirm-time writer in the propose→confirm→approve flow:
    // `meeting process` PROPOSES (zero area writes), the process-meetings
    // skill presents the proposal, and on John's confirm this verb writes
    // `area:` + `area_set_by:` BEFORE `meeting approve` so created
    // commitments inherit the area (meeting.ts approve path reads
    // frontmatter.area). Default provenance `approval` (OQ2); `--set-by
    // manual` for hand-corrections (e.g. re-stamping a legacy carrier).
    // ---------------------------------------------------------------------------
    meetingCmd
        .command('set-area <file> <area-slug>')
        .description('Write `area:` + `area_set_by:` into a meeting\'s frontmatter (body preserved). Area slug must match a file in areas/.')
        .option('--set-by <provenance>', 'Provenance marker: approval | manual', 'approval')
        .option('--json', 'Output as JSON')
        .action(async (file, areaSlug, opts) => {
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
        const setBy = opts.setBy ?? 'approval';
        if (setBy !== 'approval' && setBy !== 'manual') {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: '--set-by must be approval or manual' }));
            }
            else {
                error('--set-by must be approval or manual');
            }
            process.exit(1);
        }
        // Validate the area slug against areas/*.md BEFORE any write —
        // an unknown slug is an error, never a write (AC2).
        const areaContext = await services.areaParser.getAreaContext(areaSlug);
        if (!areaContext) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Unknown area slug '${areaSlug}' — no areas/${areaSlug}.md`,
                }));
            }
            else {
                error(`Unknown area slug '${areaSlug}' — no areas/${areaSlug}.md`);
                info('Run `ls areas/` to see valid slugs.');
            }
            process.exit(1);
        }
        // Always WRITE the canonical slug — getAreaContext() resolves
        // aliases, so the input may be an alias; writing it as-is would
        // mint fresh non-canonical refs.
        const canonicalSlug = areaContext.slug;
        if (canonicalSlug !== areaSlug && !opts.json) {
            info(`Alias '${areaSlug}' resolved to canonical area slug '${canonicalSlug}'.`);
        }
        // Resolve the meeting file: absolute → as-is; has a slash →
        // workspace-relative; bare name → resources/meetings/.
        const meetingPath = file.startsWith('/')
            ? file
            : file.includes('/')
                ? join(root, file)
                : join(root, 'resources', 'meetings', file);
        if (!(await services.storage.exists(meetingPath))) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Meeting not found: ${meetingPath}` }));
            }
            else {
                error(`Meeting not found: ${meetingPath}`);
            }
            process.exit(1);
        }
        const result = await applyAreaToMeeting(services.storage, meetingPath, canonicalSlug, setBy);
        // D4: a lock abstain is an ERROR, never silent — the approve step
        // would not inherit the area.
        if (!result.written && !result.noop) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Area not written (lock abstain: ${result.abstainReason ?? 'unknown'})`,
                    abstainReason: result.abstainReason ?? 'unknown',
                }));
            }
            else {
                error(`Area not written (lock abstain: ${result.abstainReason ?? 'unknown'})`);
            }
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                meeting: meetingPath,
                area: canonicalSlug,
                areaSetBy: setBy,
                written: result.written,
                noop: result.noop,
            }));
            return;
        }
        if (result.noop) {
            info(`Meeting already carries area: ${canonicalSlug} (${setBy}) — nothing to write.`);
        }
        else {
            success(`Set area: ${canonicalSlug} (area_set_by: ${setBy}) on ${meetingPath}`);
        }
    });
    // Extract subcommand - uses AIService for LLM-based extraction
    meetingCmd
        .command('extract <file>')
        .description('Extract intelligence from a meeting transcript using AI')
        .option('--json', 'Output as JSON')
        .option('--stage', 'Write staged sections to the meeting file')
        .option('--dry-run', 'Show what would be written without writing')
        .option('--dry-run-topics', 'Run lexical topic detection only (no LLM call); print detected topics with scores + matched tokens for tuning')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--clear-approved', 'Clear approved sections before re-extracting (requires --stage)')
        .option('--clear', 'Alias for --clear-approved (requires --stage)')
        .option('--context <file>', 'Context bundle JSON file (use - for stdin)')
        .option('--prior-items <file>', 'Prior items JSON file for deduplication (use - for stdin)')
        .option('--importance <level>', 'Override importance level (skip, light, normal, important)')
        .option('--reconcile', 'Run cross-meeting reconciliation (dedup + relevance scoring)')
        .option('--reconcile-days <n>', 'Days of recent meetings to include (default: 7)', '7')
        .action(async (file, opts) => {
        // Merge --clear into --clear-approved
        if (opts.clear)
            opts.clearApproved = true;
        const services = await createServices(process.cwd());
        // Early check: --clear-approved requires --stage
        if (opts.clearApproved && !opts.stage) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: '--clear-approved requires --stage',
                }));
            }
            else {
                error('--clear-approved requires --stage');
            }
            process.exit(1);
        }
        // Early check: stdin can only be consumed once
        if (opts.context === '-' && opts.priorItems === '-') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Cannot read both --context and --prior-items from stdin',
                }));
            }
            else {
                error('Cannot read both --context and --prior-items from stdin');
            }
            process.exit(1);
        }
        // Early check: is AI configured?
        // --dry-run-topics skips the LLM entirely (lexical detection only),
        // so don't require an AI provider for that path.
        if (!opts.dryRunTopics && !services.ai.isConfigured()) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'No AI provider configured. Run `arete credentials configure` or set up via arete.yaml.',
                }));
            }
            else {
                error('No AI provider configured. Run `arete credentials configure` or set up via arete.yaml.');
            }
            process.exit(1);
        }
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
        const paths = services.workspace.getPaths(root);
        // (Fail-fast for --reconcile + missing standard tier is deferred until
        // after the importance-skip short-circuit below so `--importance skip`
        // can exit without paying any LLM cost even on misconfigured workspaces.)
        // Resolve file path
        const meetingPath = file.startsWith('/') ? file : join(root, file);
        // Read meeting content
        const content = await services.storage.read(meetingPath);
        if (!content) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Meeting file not found: ${file}` }));
            }
            else {
                error(`Meeting file not found: ${file}`);
            }
            process.exit(1);
        }
        // Extract transcript/body for analysis
        let { frontmatter, body } = extractFrontmatter(content);
        // Handle --clear-approved: clear approved sections and metadata before re-extraction
        if (opts.clearApproved && opts.stage) {
            // Clear approved sections from body (using backend's pattern)
            body = clearApprovedSections(body);
            // Delete approved metadata from frontmatter
            delete frontmatter['approved_items'];
            delete frontmatter['approved_at'];
            delete frontmatter['status'];
            // Write the cleared file
            const clearedFile = `---\n${stringifyYaml(frontmatter)}---\n\n${body}`;
            await services.storage.write(meetingPath, clearedFile);
        }
        const transcript = body.trim();
        if (!transcript) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Meeting file has no content to extract from' }));
            }
            else {
                error('Meeting file has no content to extract from');
            }
            process.exit(1);
        }
        // --dry-run-topics: lexical topic detection only. Pre-mortem R2's
        // empirical-tuning lever — operator sees the score + matched
        // tokens for each detected topic so they can tune STOP_TOKENS and
        // the threshold constants without paying any LLM cost. Skips the
        // actual extraction call entirely.
        if (opts.dryRunTopics) {
            const { detectTopicsLexicalDetailed, TopicMemoryService } = await import('@arete/core');
            const { topics } = await services.topicMemory.listAll(paths);
            const identities = TopicMemoryService.toIdentities(topics);
            const detected = detectTopicsLexicalDetailed(transcript, identities);
            if (opts.json) {
                console.log(JSON.stringify({
                    detectedTopics: detected.map((d) => ({
                        slug: d.slug,
                        score: d.score,
                        nonStopMatches: d.nonStopMatches,
                        stopMatches: d.stopMatches,
                        lastRefreshed: d.lastRefreshed ?? null,
                    })),
                }, null, 2));
            }
            else if (detected.length === 0) {
                info('Detected topics: (none)');
            }
            else {
                info('Detected topics:');
                detected.forEach((d, idx) => {
                    console.log(`  ${idx + 1}. ${d.slug}`);
                    console.log(`     Score: ${d.score.toFixed(2)}`);
                    console.log(`     Non-stop matches: ${d.nonStopMatches.length > 0 ? d.nonStopMatches.join(', ') : '(none)'}`);
                    console.log(`     Stop matches: ${d.stopMatches.length > 0 ? d.stopMatches.join(', ') : '(none)'}`);
                    console.log(`     Last refreshed: ${d.lastRefreshed ?? '(unknown)'}`);
                });
            }
            return;
        }
        // Get attendees from frontmatter if available
        const attendees = [];
        if (Array.isArray(frontmatter.attendees)) {
            for (const a of frontmatter.attendees) {
                if (typeof a === 'string') {
                    const parsed = parseAttendeeToken(a);
                    if (parsed.name)
                        attendees.push(parsed.name);
                }
            }
        }
        // Parse context bundle if provided
        let contextBundle;
        if (opts.context) {
            try {
                let contextJson;
                if (opts.context === '-') {
                    // Read from stdin
                    const chunks = [];
                    for await (const chunk of process.stdin) {
                        chunks.push(chunk);
                    }
                    contextJson = Buffer.concat(chunks).toString('utf8');
                }
                else {
                    // Read from file
                    contextJson = readFileSync(opts.context, 'utf8');
                }
                const parsed = JSON.parse(contextJson);
                // W2/S5: deserialize the WHOLE bundle (not a 6-field hand-copy) so
                // areaContext / existingTasks / topicWikiContext (+ future fields)
                // survive the --context JSON boundary. Accepts wrapped
                // ({success:true, ...}) and direct-bundle forms; validates the
                // required `meeting` field; shape-guards / degrades malformed optional
                // blocks the prompt builder indexes (rather than throwing inside
                // now-fail-loud extraction).
                contextBundle = deserializeContextBundle(parsed);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: `Failed to parse context: ${msg}` }));
                }
                else {
                    error(`Failed to parse context: ${msg}`);
                }
                process.exit(1);
            }
        }
        // Parse prior items if provided
        let priorItems;
        if (opts.priorItems) {
            try {
                let priorItemsJson;
                if (opts.priorItems === '-') {
                    // Read from stdin
                    const chunks = [];
                    for await (const chunk of process.stdin) {
                        chunks.push(chunk);
                    }
                    priorItemsJson = Buffer.concat(chunks).toString('utf8');
                }
                else {
                    // Read from file
                    const content = await services.storage.read(opts.priorItems);
                    if (!content) {
                        if (opts.json) {
                            console.log(JSON.stringify({ success: false, error: `Prior items file not found: ${opts.priorItems}` }));
                        }
                        else {
                            error(`Prior items file not found: ${opts.priorItems}`);
                        }
                        process.exit(1);
                    }
                    priorItemsJson = content;
                }
                const parsed = JSON.parse(priorItemsJson);
                if (!Array.isArray(parsed)) {
                    throw new Error('Prior items must be an array');
                }
                // Validate each element has required fields
                for (const item of parsed) {
                    if (!item.type || !item.text) {
                        throw new Error('Each prior item must have type and text');
                    }
                }
                priorItems = parsed;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: `Failed to parse prior items: ${msg}` }));
                }
                else {
                    error(`Failed to parse prior items: ${msg}`);
                }
                process.exit(1);
            }
        }
        // Determine effective importance:
        // 1. CLI flag overrides frontmatter
        // 2. Frontmatter importance used if no flag
        // 3. Default to undefined (normal processing)
        let effectiveImportance = undefined;
        if (opts.importance) {
            // Validate CLI flag value
            const validLevels = ['skip', 'light', 'normal', 'important'];
            if (validLevels.includes(opts.importance)) {
                effectiveImportance = opts.importance;
            }
            else {
                if (opts.json) {
                    console.log(JSON.stringify({
                        success: false,
                        error: `Invalid importance level: ${opts.importance}. Valid values: skip, light, normal, important`,
                    }));
                }
                else {
                    error(`Invalid importance level: ${opts.importance}. Valid values: skip, light, normal, important`);
                }
                process.exit(1);
            }
        }
        else if (frontmatter.importance) {
            // Read from frontmatter
            effectiveImportance = frontmatter.importance;
        }
        // Handle importance === 'skip': return early with empty result
        if (effectiveImportance === 'skip') {
            const response = {
                success: true,
                file: meetingPath,
                intelligence: {
                    summary: '',
                    actionItems: [],
                    nextSteps: [],
                    decisions: [],
                    learnings: [],
                },
                validationWarnings: [],
                staged: false,
                dryRun: Boolean(opts.dryRun),
                skipped: true,
                reason: 'importance: skip',
                contextUsed: false,
                priorItemsUsed: false,
                reconciled: [],
                qmd: { indexed: false, skipped: true },
            };
            if (opts.json) {
                console.log(JSON.stringify(response, null, 2));
            }
            else {
                info(`Skipped extraction: ${meetingPath} (importance: skip)`);
            }
            return;
        }
        // Fail-fast (moved here from earlier): --reconcile requires the 'standard'
        // tier because batchLLMReview routes to it. Placed AFTER the
        // importance-skip short-circuit so `--importance skip` exits cleanly on
        // workspaces missing the tier. Still runs before any LLM call, so no
        // extraction tier cost is paid if config is bad.
        // CHR-W0: in day-level mode batchLLMReview runs in `reconcile-day`,
        // not here — the standard tier is not needed at extract time.
        if (opts.reconcile && config.reconcile_mode !== 'day-level' && !config.ai?.tiers?.standard) {
            const msg = '`--reconcile` requires `ai.tiers.standard` to be set in arete.yaml. Run `arete credentials configure` or set the standard tier explicitly.';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Speaking ratio upgrade: If importance === 'light', check speaking ratio
        // If owner speaks > 40%, upgrade to 'normal' (they led the meeting)
        if (effectiveImportance === 'light') {
            try {
                const ownerName = execSync('git config user.name', { encoding: 'utf-8' }).trim();
                if (ownerName) {
                    const ratio = calculateSpeakingRatio(transcript, ownerName);
                    if (ratio !== undefined && ratio > 0.4) {
                        const percentage = (ratio * 100).toFixed(0);
                        if (!opts.json) {
                            info(`Speaking ratio ${percentage}% > 40%, upgrading importance to 'normal'`);
                        }
                        effectiveImportance = 'normal';
                    }
                }
            }
            catch {
                // git config unavailable, keep inferred importance
            }
        }
        // Determine extraction mode:
        // - Reprocessing (status: processed or approved) → thorough mode
        // - Light importance → light mode
        // - Otherwise → normal mode
        const currentStatus = frontmatter.status;
        const mode = (currentStatus === 'processed' || currentStatus === 'approved')
            ? 'thorough'
            : (effectiveImportance === 'light' ? 'light' : 'normal');
        // single-pass-extraction (W2): pipeline mode from arete.yaml
        // (`extraction_mode: single_pass`). Default legacy = bit-identical
        // behavior. Light-importance meetings keep the light prompt either way.
        const singlePassMode = config.extraction_mode === 'single_pass' && mode !== 'light';
        // Create LLM call wrapper using AIService.
        // single_pass W1/S7: the single-pass prompt has NO category caps and can
        // emit a large JSON body (tiered items + open questions + markers). The
        // model-default maxTokens (~8k) can truncate that, and W1 now treats
        // truncation as a loud failure (TruncationError). Raise the ceiling for
        // single_pass so truncation only fires on a genuine overflow, not the
        // common case. Legacy passes no maxTokens (model default) → unchanged,
        // bit-identical to today.
        const EXTRACTION_MAX_TOKENS_SINGLE_PASS = 16000;
        const callLLM = async (prompt) => {
            const result = await services.ai.call('extraction', prompt, singlePassMode ? { maxTokens: EXTRACTION_MAX_TOKENS_SINGLE_PASS } : undefined);
            return result.text;
        };
        // Reconciliation review runs on the cheaper 'reconciliation' tier
        // (typically 'standard'/Sonnet) rather than the 'extraction' tier
        // (often 'frontier'/Opus). Keep callLLM bound to 'extraction' so the
        // main extraction path is unchanged; only batchLLMReview uses this.
        const callLLMReconciliation = async (prompt) => {
            const result = await services.ai.call('reconciliation', prompt);
            return result.text;
        };
        // Load active topic slugs (bare, no wikilinks) to bias the extraction
        // prompt toward reusing existing topics — first line of sprawl defense
        // (plan Phase A #3). Best-effort: failure to load degrades to no bias,
        // which is the prior behavior.
        let activeTopicSlugs;
        try {
            const { loadMemorySummary, renderActiveTopicsAsSlugList } = await import('@arete/core');
            const paths = services.workspace.getPaths(root);
            // I-3: the bias list is a bare-slug nudge for the extraction LLM, not a
            // human-facing view. The default 25-entry cap on getActiveTopics starves
            // it — canonical slugs ranked >25 never reach the LLM, so it proposes
            // near-duplicate sub-slugs (orphan-topic churn). Pass no limit here so
            // every active canonical slug biases extraction; the 25-cap stays on the
            // human CLAUDE.md Active Topics view (its own loadMemorySummary call).
            const memory = await loadMemorySummary(services.topicMemory, paths, {
                activeTopics: { limit: Number.POSITIVE_INFINITY },
            });
            const rendered = renderActiveTopicsAsSlugList(memory.activeTopics);
            activeTopicSlugs = rendered.length > 0 ? rendered : undefined;
        }
        catch {
            activeTopicSlugs = undefined;
        }
        // single-pass Layer-1 context assembly (W1.5 series + open commitments).
        // Best-effort: every block degrades to absent on failure — extraction
        // proceeds with whatever context assembled.
        let singlePassContext;
        if (singlePassMode) {
            singlePassContext = {};
            // Series context (W1.5): prior same-series meetings' items + open
            // questions. recurring_meetings titles from area config rescue
            // drifted titles.
            try {
                // NOTE: paths.resources is ALREADY absolute (getPaths joins the
                // workspace root) — joining root again doubles the prefix and
                // storage.list silently returns [] for the nonexistent dir. The
                // legacy inline-reconcile block below carries that exact doubled
                // join (pre-existing, left untouched for flags-off bit-identity —
                // see build-report).
                const seriesMeetingsDir = join(paths.resources, 'meetings');
                let recurringTitles = [];
                try {
                    const areaParser = new AreaParserService(services.storage, root);
                    const areas = await areaParser.listAreas();
                    recurringTitles = areas.flatMap((a) => (a.recurringMeetings ?? [])
                        .map((m) => m.title)
                        .filter((t) => typeof t === 'string' && t.length > 0));
                }
                catch {
                    // no area config — title+attendee matching still applies
                }
                const series = await resolveMeetingSeries(services.storage, seriesMeetingsDir, meetingPath, { recurringTitles });
                if (series) {
                    singlePassContext.seriesContext = renderSeriesContext(series);
                }
            }
            catch {
                // series context degrades to absent
            }
            // Open commitments filtered to attendees — dedup at source: the model
            // marks continuation_of instead of re-emitting (Layer-1 table row 4).
            try {
                const attendeeSlugs = attendees.map((name) => slugifyPersonName(name));
                if (attendeeSlugs.length > 0) {
                    const open = await services.commitments.listOpen({ personSlugs: attendeeSlugs });
                    const MAX_COMMITMENTS_IN_PROMPT = 20;
                    if (open.length > 0) {
                        singlePassContext.openCommitments = open
                            .slice(0, MAX_COMMITMENTS_IN_PROMPT)
                            .map((c) => `- ${c.id.slice(0, 8)}: ${c.text} (@${c.personSlug}, ${c.direction}, since ${c.date})`)
                            .join('\n');
                    }
                }
            }
            catch {
                // commitments context degrades to absent
            }
        }
        // W4/S6 (RC4): auto-load priorItems for cross-meeting dedup when
        // --prior-items was not passed and we're in single_pass. The winddown
        // runs extract WITHOUT --prior-items (SKILL.md 1h), so without this the
        // priorItems block is never populated and recent cross-meeting dups
        // (e.g. the week.md re-stage, 10b) slip through. Mirrors the backend
        // recipe (agent.ts:681-700): 7-day batch, current meeting EXCLUDED via
        // loadRecentMeetingBatch's excludePath (LEARNINGS 2026-04-29 trap — a
        // reprocess must not feed its own staged items back as "already
        // extracted"). buildKnownItemsSection is already MARK-don't-skip (S6),
        // so this only ADDS dedup context; it cannot suppress a supersession arc.
        // Best-effort: a load failure degrades to no prior items.
        if (singlePassMode && !priorItems) {
            try {
                // paths.resources is ALREADY absolute (getPaths joins the workspace
                // root) — do NOT join root again (that double-prefixes and
                // loadRecentMeetingBatch silently returns []). Same correct form as
                // the series block above; the legacy inline-reconcile blocks below
                // carry the doubled join (pre-existing, left untouched for flags-off
                // bit-identity).
                const meetingsDir = join(paths.resources, 'meetings');
                const recentBatch = await loadRecentMeetingBatch(services.storage, meetingsDir, 7, meetingPath);
                const loaded = recentBatch.flatMap((batch) => [
                    ...batch.extraction.decisions.map((text) => ({ type: 'decision', text })),
                    ...batch.extraction.learnings.map((text) => ({ type: 'learning', text })),
                    ...batch.extraction.actionItems.map((ai) => ({ type: 'action', text: ai.description })),
                ]);
                if (loaded.length > 0) {
                    priorItems = loaded;
                    if (!opts.json)
                        info(`Auto-loaded ${loaded.length} prior items from recent meetings (single_pass dedup)`);
                }
            }
            catch {
                // degrade to no prior items — extraction proceeds
            }
        }
        // W3/RC3: resolve owner identity for single_pass so the prompt's
        // "## Who is reading this" frame is populated and direction is
        // owner-relative (fixes Nate-backwards, 10c). Prefer the bundle owner
        // (read from context/profile.md by buildMeetingContext + carried through
        // the W2 --context deserialization); fall back to `git config user.name`
        // when profile.md is absent. Only set for single_pass — legacy is
        // bit-identical.
        let ownerSlug;
        let ownerName;
        if (singlePassMode) {
            if (contextBundle?.owner?.slug) {
                ownerSlug = contextBundle.owner.slug;
                ownerName = contextBundle.owner.name;
            }
            else {
                try {
                    const gitName = execSync('git config user.name', { encoding: 'utf-8' }).trim();
                    if (gitName) {
                        ownerName = gitName;
                        ownerSlug = slugifyPersonName(gitName);
                    }
                }
                catch {
                    // git unavailable — identity frame falls back to the prompt default
                }
            }
        }
        // Extract intelligence
        let extractionResult;
        try {
            extractionResult = await extractMeetingIntelligence(transcript, callLLM, {
                attendees: attendees.length > 0 ? attendees : undefined,
                ownerSlug,
                ownerName,
                context: contextBundle,
                priorItems,
                mode,
                activeTopicSlugs,
                singlePass: singlePassMode,
                singlePassContext,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // W1/S1: write a FAILURE snapshot BEFORE exiting. With fail-loud
            // propagation the success-path snapshot writer below never runs on a
            // failure (we exit here first), so without this the targeted failure
            // would leave no snapshot → AC2/AC7 unreachable. Classify the failure
            // by error type for the W1 taxonomy. Best-effort: never let snapshot
            // failure mask the original error.
            if (config.reconcile_shadow === true && !opts.dryRun) {
                let failureReason = 'call_error';
                let failurePreview;
                if (err instanceof ParseError) {
                    failureReason = 'parse_error';
                    failurePreview = err.preview;
                }
                else if (err instanceof TruncationError) {
                    failureReason = 'truncation';
                }
                else if (err instanceof EmptyExtractionError) {
                    // Finding #11/#13: call succeeded + parsed, but a real transcript
                    // yielded nothing → over-suppression surfaced, not a silent 0.
                    failureReason = 'empty_extraction';
                }
                else if (err instanceof Error) {
                    failureReason = 'call_error';
                }
                else {
                    failureReason = 'unknown';
                }
                try {
                    await writeFailureSnapshot(services.storage, root, {
                        meetingPath,
                        extractionMode: singlePassMode ? 'single_pass' : 'legacy',
                        promptMode: mode,
                        failureReason,
                        failureMessage: msg,
                        failurePreview,
                    });
                }
                catch {
                    // instrumentation only — surface the original failure regardless
                }
            }
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Extraction failed: ${msg}` }));
            }
            else {
                error(`Extraction failed: ${msg}`);
            }
            process.exit(1);
        }
        // CHR-W7 (shadow-soak infra): persist the RAW pre-reconcile extraction
        // snapshot BEFORE any mutation — this point is upstream of the inline
        // cross-meeting reconcile, processMeetingExtraction (confidence filter,
        // completed/open-task matching, silent merges), batchLLMReview, and
        // wireExtractDedup. Pre-mortem R2: the shadow engine consumes these,
        // never post-inline state. Gated on `reconcile_shadow: true` (default
        // off — zero writes, legacy bit-identical); best-effort, never fails
        // the extraction.
        if (config.reconcile_shadow === true && !opts.dryRun) {
            try {
                await writeRawExtractionSnapshot(services.storage, root, {
                    meetingPath,
                    // Schema requires 'legacy' | 'single_pass' (pipeline shape) —
                    // NOT the prompt depth mode, which is recorded separately.
                    extractionMode: singlePassMode ? 'single_pass' : 'legacy',
                    promptMode: mode,
                    intelligence: extractionResult.intelligence,
                    validationWarnings: extractionResult.validationWarnings,
                });
            }
            catch {
                // instrumentation only — extraction proceeds
            }
        }
        // CHR-W0 (Stage-0 day-level reconcile): when `reconcile_mode:
        // day-level`, the inline per-file cross-meeting reconcile (this block)
        // AND the per-file batchLLMReview below are SKIPPED — extraction stays
        // pure and the winddown runs ONE `arete meeting reconcile-day` call at
        // Step 2 scope instead. This is the surgical fix for the
        // collapse-to-oldest artifact: the chef sees the undeduped day.
        // Default 'inline' keeps today's behavior bit-identical.
        const dayLevelReconcile = config.reconcile_mode === 'day-level';
        if (opts.reconcile && dayLevelReconcile && !opts.json) {
            info('reconcile_mode: day-level — inline reconcile deferred to `arete meeting reconcile-day`');
        }
        // Run cross-meeting reconciliation if requested
        let reconciliationResult;
        let cachedReconciliationContext;
        if (opts.reconcile && !dayLevelReconcile) {
            try {
                // Load reconciliation context (area memories + committed items)
                cachedReconciliationContext = await loadReconciliationContext(services.storage, root);
                // Load recent meetings batch.
                // Excludes meetingPath so a reprocess (status: processed | approved)
                // doesn't pick up its own on-disk staged items and flag the fresh
                // extraction as a duplicate of itself in findDuplicates.
                const meetingsDir = join(root, paths.resources, 'meetings');
                const days = parseInt(opts.reconcileDays || '7', 10);
                const recentBatch = await loadRecentMeetingBatch(services.storage, meetingsDir, days, meetingPath);
                // Add current extraction to batch
                const currentBatch = {
                    meetingPath: meetingPath,
                    extraction: extractionResult.intelligence,
                };
                // Run reconciliation
                reconciliationResult = reconcileMeetingBatch([...recentBatch, currentBatch], cachedReconciliationContext);
            }
            catch (err) {
                // Graceful degradation: log warning but continue without reconciliation
                const msg = err instanceof Error ? err.message : String(err);
                if (!opts.json) {
                    warn(`Reconciliation failed, continuing without it: ${msg}`);
                }
            }
        }
        // Handle --stage (write to file with full metadata)
        let qmdResult;
        const dryRun = Boolean(opts.dryRun);
        const shouldStage = Boolean(opts.stage);
        // For --stage: process extraction to get filtered items and metadata
        let stagedSections;
        let processed;
        // Phase 10b-min wiring — cross-meeting dedup outcome, lifted to outer
        // scope so the response payload + post-stage summary can surface
        // per-decision counts to the user.
        let dedupResult;
        // Lifted so the post-merge response can surface counts to the user.
        const silentlyMerged = { decisions: 0, learnings: 0 };
        // Phase 0 instrumentation — snapshots of items that get silently merged
        // (decisions/learnings dropped from filteredItems by reconciliation) so
        // we can write item-fate events after `applyReconciliationDecision`
        // mutates `processed`.
        const dismissedSnapshots = [];
        if (shouldStage) {
            // Extract user notes and process extraction (filtering, dedup, metadata).
            // single-pass: exclude the extractor-written sections that didn't exist
            // pre-W1 so a re-extract doesn't read its own output as user notes.
            const userNotes = extractUserNotes(body, singlePassMode
                ? ['open questions', 'parser-flagged (mirror-pair suspects)']
                : undefined);
            // Read completed items from week.md and scratchpad.md for reconciliation,
            // and read OPEN tasks from week.md and tasks.md for existing-task dedup.
            const weekContent = await services.storage.read(join(paths.now, 'week.md')) ?? '';
            const scratchpadContent = await services.storage.read(join(paths.now, 'scratchpad.md')) ?? '';
            const tasksContent = await services.storage.read(join(paths.now, 'tasks.md')) ?? '';
            const completedItems = [
                ...getCompletedItems(weekContent),
                ...getCompletedItems(scratchpadContent),
            ];
            const openTasks = [
                ...getOpenTasks(weekContent),
                ...getOpenTasks(tasksContent),
            ];
            processed = processMeetingExtraction(extractionResult, userNotes, {
                priorItems,
                completedItems,
                openTasks,
                importance: effectiveImportance,
                // W1 (risk 1): tier-derived approval + keep low-confidence items.
                singlePass: singlePassMode,
            });
            // Merge reconciliation decisions into processed items.
            // silentlyMerged counts surface to the user via JSON output and the
            // post-extract summary so silent merges aren't truly invisible.
            if (reconciliationResult) {
                for (const reconciledItem of reconciliationResult.items) {
                    // Skip items that reconciliation wants to keep
                    if (reconciledItem.status === 'keep')
                        continue;
                    // Find matching filtered item by text
                    const matchingItem = processed.filteredItems.find((fi) => {
                        if (reconciledItem.type === 'action' && typeof reconciledItem.original !== 'string') {
                            return fi.text === reconciledItem.original.description;
                        }
                        return fi.text === reconciledItem.original;
                    });
                    if (!matchingItem)
                        continue;
                    // Only override if processing didn't already skip this item
                    const currentStatus = processed.stagedItemStatus[matchingItem.id];
                    if (currentStatus === 'skipped')
                        continue;
                    // Action items get a visible 'skipped' marker; decisions and
                    // learnings are silently merged into committed memory.
                    // See `applyReconciliationDecision` for the type-dependent contract.
                    if (reconciledItem.status === 'duplicate' || reconciledItem.status === 'completed') {
                        // Phase 0: snapshot dismissed decisions/learnings before
                        // applyReconciliationDecision deletes them from filteredItems.
                        if (matchingItem.type !== 'action') {
                            dismissedSnapshots.push({
                                item_text: matchingItem.text,
                                item_kind: matchingItem.type,
                                confidence: processed.stagedItemConfidence[matchingItem.id],
                                reason: reconciledItem.status === 'completed' ? 'matched_completed' : 'duplicate',
                            });
                        }
                        applyReconciliationDecision(processed, matchingItem, silentlyMerged);
                    }
                }
            }
            // Run batch LLM quality review when reconciliation is active.
            // Limited to action items: "skipped" / "already done" is coherent
            // vocabulary for a commitment, but a learning is an insight and a
            // decision is a point-in-time fact — neither has a "done" state. For
            // those types, duplicate detection happens via cross-meeting matching
            // above and is handled as silent merge into committed memory.
            // CHR-W0: in day-level mode this moves into `reconcile-day` (one
            // batched review over the whole day instead of N per-file calls).
            if (opts.reconcile && !dayLevelReconcile && processed) {
                try {
                    const proc = processed;
                    const reviewItems = proc.filteredItems
                        .filter(fi => proc.stagedItemStatus[fi.id] !== 'skipped')
                        .filter(fi => fi.type === 'action')
                        .map(fi => ({ text: fi.text, type: fi.type, id: fi.id }));
                    if (reviewItems.length > 0) {
                        // Reuse cached context to avoid redundant I/O
                        const ctx = cachedReconciliationContext ?? await loadReconciliationContext(services.storage, root);
                        const drops = await batchLLMReview(reviewItems, ctx.recentCommittedItems, callLLMReconciliation);
                        for (const drop of drops) {
                            processed.stagedItemStatus[drop.id] = 'skipped';
                            processed.stagedItemSource[drop.id] = 'reconciled';
                        }
                        if (drops.length > 0 && !opts.json) {
                            warn(`Batch review dropped ${drops.length} item(s)`);
                        }
                    }
                }
                catch {
                    if (!opts.json) {
                        warn('Batch LLM review skipped due to error');
                    }
                }
            }
            // Phase 10b-min wiring — reactive cross-meeting dedup pipeline.
            //
            // Runs AFTER the existing reconciliation passes (so they get first
            // crack at semantic dedup against memory + last-7d) but BEFORE the
            // staged sections are formatted and written. Marks definite-dupe
            // items as `'skipped'` with a `staged_item_skip_reason` whose
            // `reason = "dupe_of_<canonical-id>"` so the apply-flow's existing
            // dupe-of-status honors the cross-meeting decision (Phase 10b-min
            // Step 4 contract).
            //
            // Safe to run on every extract:
            //   - When the filtered set has no action items, returns immediately
            //     without an LLM call.
            //   - When commitments.json is empty and no other same-day meetings
            //     exist, returns new-canonical for every item (no skips).
            //   - When the LLM is unreachable, the pipeline fail-safes to
            //     UNCERTAIN (item kept as new canonical, flagged for review).
            try {
                const extractedItemsForDedup = adaptFilteredItemsForDedup(processed.filteredItems.map((fi) => ({
                    id: fi.id,
                    text: fi.text,
                    type: fi.type,
                    ownerMeta: fi.ownerMeta,
                })));
                if (extractedItemsForDedup.length > 0) {
                    // Same-tier wrapper as the dedup pipeline — `fast` per AC3a /
                    // eng Q1. Tier promotion to `standard` is the AC11a soak gate.
                    const dedupCallConcurrent = async (prompts) => services.ai.callConcurrent(prompts);
                    // Meeting date from frontmatter; default to filename prefix if
                    // missing (preserves the date-filter semantics for items where
                    // the user hasn't filled in the date yet).
                    const meetingDateRaw = typeof frontmatter.date === 'string'
                        ? frontmatter.date.slice(0, 10)
                        : (file.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10));
                    const meetingFilename = meetingPath.split('/').pop() ?? '';
                    const meetingSlug = meetingFilename.replace(/\.md$/, '');
                    const meetingsDir = join(root, paths.resources, 'meetings');
                    dedupResult = await wireExtractDedup({ storage: services.storage, commitments: services.commitments }, {
                        workspaceRoot: root,
                        meetingsDir,
                        currentMeetingPath: meetingPath,
                        currentMeetingSlug: meetingSlug,
                        meetingDate: meetingDateRaw,
                        extractedItems: extractedItemsForDedup,
                    }, dedupCallConcurrent, { tier: 'fast', dryRun });
                    // Apply statusPatch to processed.stagedItemStatus so the
                    // downstream writeWithLock mutator sees `'skipped'` for dupes.
                    // The skipReasonPatch is threaded into the mutator below.
                    for (const [id, status] of Object.entries(dedupResult.statusPatch)) {
                        processed.stagedItemStatus[id] = status;
                    }
                }
            }
            catch (err) {
                // Pipeline failure should NEVER block the extract. Surface as a
                // warning; staged items proceed as new canonicals.
                if (!opts.json) {
                    const msg = err instanceof Error ? err.message : String(err);
                    warn(`Cross-meeting dedup skipped due to error: ${msg}`);
                }
            }
            // Format body sections from filtered items (IDs in body match IDs in metadata).
            // Task 10: thread `core` and `could_include` (from Task 7's wiki-aware
            // extraction) so the formatter emits `## Core` + `## Could include`
            // when the LLM populates them. Falls back to `## Summary` when absent
            // (formatter handles the precedence — see meeting-processing.ts:625).
            stagedSections = formatFilteredStagedSections(processed.filteredItems, extractionResult.intelligence.summary, extractionResult.intelligence.core, extractionResult.intelligence.could_include, extractionResult.validationWarnings, 
            // single-pass: persist open questions + mirror-pair flag section.
            singlePassMode
                ? {
                    openQuestions: extractionResult.intelligence.openQuestions,
                    telemetryEvents: extractionResult.telemetryEvents,
                }
                : undefined);
            // Phase 10b-min wiring — decorate staged sections with `↪ canonical
            // in <slug>` badges (definite-dupe) and `↪ possibly merges with
            // <slug>` flags (possibly-mergeable). Idempotent against re-extract.
            if (dedupResult && dedupResult.decisions.length > 0) {
                stagedSections = decorateStagedSectionsWithDupeBadges(stagedSections, dedupResult.decisions);
            }
            if (!dryRun) {
                // Topics + counts + status via unified writer (phase-3-5-followup-5
                // AC1). Pre-AC1, path 3 (`extract --stage`) silently omitted
                // `topics`/counts — the chef-orchestrator regression caught by the
                // 2026-05-27 wiki-discoverability investigation. Alias/merge uses the
                // 'synthesis' tier to match path 1/2.
                const stageStatus = effectiveImportance === 'light' ? 'approved' : 'processed';
                const aliasCallLLM = services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1'
                    ? async (prompt) => {
                        const r = await services.ai.call('synthesis', prompt);
                        return r.text;
                    }
                    : undefined;
                // phase-10-followup-2 HIGH-1: wire extract through `writeWithLock`
                // so the F2 partial-merge contract protects chef-written sibling
                // fields (`staged_item_skip_reason`, etc.) from being wholesale-
                // overwritten. The mutator returns ONLY the keys this path owns —
                // anything we don't mention survives by definition. mtimeGuard=0
                // because the extract command is the user-initiated entry point;
                // the partial-merge contract (not the mtime guard) provides race
                // safety with chef writes.
                const proc = processed;
                const writeResult = await writeWithLock(services.storage, meetingPath, async (current) => {
                    // Build the patch object — start empty so `writeMeetingApplyFrontmatter`
                    // (which mutates the object passed in) only sets the keys it owns.
                    const patch = {};
                    await writeMeetingApplyFrontmatter(patch, extractionResult.intelligence, { status: stageStatus, processedAt: new Date().toISOString() }, {
                        topicMemory: services.topicMemory,
                        workspacePaths: paths,
                        callLLM: aliasCallLLM,
                        onWarning: (msg) => {
                            if (!opts.json)
                                warn(msg);
                        },
                    });
                    // D1 (wiki-repair W2): the unified writer set-or-DELETEs
                    // `could_include`, but this patch flows through the
                    // `writeWithLock` PARTIAL-MERGE contract — an absent key
                    // would leave a stale `could_include` from a prior extract
                    // surviving the merge. Explicit `undefined` deletes it.
                    if (!('could_include' in patch)) {
                        patch['could_include'] = undefined;
                    }
                    // Status map: merge chef-set `'skipped'` (entries with a
                    // `staged_item_skip_reason` whose `setBy ∈ {'chef','chef-proposed'}`)
                    // on top of the extract-produced status so a re-extract cannot
                    // silently demote a chef skip back to `'pending'`. Bare-extract
                    // statuses fall through unchanged.
                    const currentStatus = (current.frontmatter['staged_item_status'] ?? {});
                    const currentSkipReason = (current.frontmatter['staged_item_skip_reason'] ?? {});
                    const mergedStatus = { ...proc.stagedItemStatus };
                    for (const [id, prior] of Object.entries(currentStatus)) {
                        const sr = currentSkipReason[id];
                        const isChefOwned = sr?.setBy === 'chef' || sr?.setBy === 'chef-proposed';
                        if (isChefOwned && prior === 'skipped' && mergedStatus[id] !== 'approved') {
                            // chef-confirmed skip survives re-extract
                            mergedStatus[id] = 'skipped';
                        }
                    }
                    // Staged-item maps owned by the extract path. `staged_item_skip_reason`
                    // is intentionally NOT mentioned by default — partial-merge
                    // preserves it. Phase 10b-min wiring adds the cross-meeting
                    // dedup entries on top of any existing chef-set entries
                    // (the merge below handles that explicitly).
                    patch['staged_item_source'] = proc.stagedItemSource;
                    patch['staged_item_confidence'] = proc.stagedItemConfidence;
                    patch['staged_item_status'] = mergedStatus;
                    // Owner/direction map (finding #12). single_pass ALWAYS assigns a
                    // direction per action item (invalid/missing → `none`), so this is
                    // normally non-empty — but mirror the judgment-map pattern: in
                    // single_pass write explicit `undefined` when empty so a re-extract
                    // CLEARS a stale owner map under the partial-merge contract (rather
                    // than silently leaving last run's owners). Legacy keeps the
                    // length-guarded write (no key mention → partial-merge preserves →
                    // byte-identical).
                    if (singlePassMode) {
                        patch['staged_item_owner'] =
                            Object.keys(proc.stagedItemOwner).length > 0 ? proc.stagedItemOwner : undefined;
                    }
                    else if (Object.keys(proc.stagedItemOwner).length > 0) {
                        patch['staged_item_owner'] = proc.stagedItemOwner;
                    }
                    if (proc.stagedItemMatchedText && Object.keys(proc.stagedItemMatchedText).length > 0) {
                        patch['staged_item_matched_text'] = proc.stagedItemMatchedText;
                    }
                    // single-pass judgment maps (W1/D3). Explicit `undefined` when
                    // empty so a re-extract clears stale maps under the partial-
                    // merge contract (same pattern as could_include above). Legacy
                    // mode never mentions these keys — existing files untouched.
                    if (singlePassMode) {
                        patch['staged_item_importance'] =
                            proc.stagedItemImportance && Object.keys(proc.stagedItemImportance).length > 0
                                ? proc.stagedItemImportance
                                : undefined;
                        patch['staged_item_uncertain'] =
                            proc.stagedItemUncertainReason && Object.keys(proc.stagedItemUncertainReason).length > 0
                                ? proc.stagedItemUncertainReason
                                : undefined;
                        patch['staged_item_links'] =
                            proc.stagedItemLinks && Object.keys(proc.stagedItemLinks).length > 0
                                ? proc.stagedItemLinks
                                : undefined;
                    }
                    // Skip-reason merge. We explicitly merge (not relying on
                    // partial-merge) because adding NEW IDs requires mentioning the
                    // key. Three sources, layered:
                    //   1. existing chef/user entries (currentSkipReason) — preserved
                    //   2. Issue C extract-time auto-skips (completed/open-task
                    //      matches) with `matchedRef` for the `[[link]]` render
                    //   3. Phase 10b-min cross-meeting dedup entries
                    // (2)+(3) are definitive extract-time `setBy: 'chef'` decisions
                    // and take precedence over a stale prior auto-skip on the same id;
                    // a USER override ([[unskip]]) deletes the entry entirely so it
                    // won't be in currentSkipReason to be re-clobbered.
                    const extractSkipReason = proc.stagedItemSkipReason ?? {};
                    const dedupSkipReason = dedupResult?.skipReasonPatch ?? {};
                    const haveExtractSkips = Object.keys(extractSkipReason).length > 0;
                    const haveDedupSkips = Object.keys(dedupSkipReason).length > 0;
                    if (haveExtractSkips || haveDedupSkips) {
                        const mergedSkipReason = {
                            ...currentSkipReason,
                            ...extractSkipReason,
                            ...dedupSkipReason,
                        };
                        patch['staged_item_skip_reason'] = mergedSkipReason;
                    }
                    // Update body with staged sections. `current.body` already
                    // reflects whatever the file held when the lock was acquired;
                    // `updateMeetingContent` rewrites only the staged sections so
                    // user edits to other body regions are preserved.
                    const updatedBody = updateMeetingContent(current.body, stagedSections, 
                    // single-pass: extractor owns Open Questions / Parser-flagged
                    // sections, so re-extract replaces them. Legacy: omitted, so
                    // user sections with those names are preserved (invariant).
                    singlePassMode ? SINGLE_PASS_STAGED_HEADERS : undefined);
                    return { frontmatter: patch, body: updatedBody };
                }, { mtimeGuardSeconds: 0 });
                // Fallback: a vanished/raced file makes `writeWithLock` abstain;
                // surface as warning so the extraction artifacts aren't silently
                // lost. Backwards-compatible no-throw shape.
                if (!writeResult.written && !opts.json) {
                    warn(`Extract write abstained: ${writeResult.abstainReason ?? 'unknown'}`);
                }
                // Phase 0 instrumentation — emit one item-fate event per skipped
                // staged item and per silently-merged decision/learning. Best
                // effort; never blocks the extract write.
                try {
                    const fateImportance = effectiveImportance ?? null;
                    const skippedEvents = buildSkippedItemFateEvents(processed, meetingPath, fateImportance);
                    const dismissedEvents = buildDismissedItemFateEvents(dismissedSnapshots.map((s) => ({
                        item_text: s.item_text,
                        item_kind: s.item_kind,
                        confidence: s.confidence,
                        reason: s.reason,
                    })), meetingPath, fateImportance);
                    for (const ev of [...skippedEvents, ...dismissedEvents]) {
                        await services.memoryLog.appendItemFate(paths, ev);
                    }
                }
                catch {
                    // best-effort instrumentation
                }
                // single-pass W3 (D4): detector telemetry → item-fates stream.
                // The mechanical filters no longer gate items; their fires are
                // recorded here as `type: 'extraction_telemetry'` events. Best
                // effort; never blocks the extract write.
                if (singlePassMode && extractionResult.telemetryEvents && extractionResult.telemetryEvents.length > 0) {
                    try {
                        const kindMap = { action: 'action_item', decision: 'decision', learning: 'learning', open_question: 'open_question' };
                        for (const ev of extractionResult.telemetryEvents) {
                            await services.memoryLog.appendExtractionTelemetry(paths, {
                                detector: ev.detector,
                                item_kind: kindMap[ev.itemType],
                                item_text: ev.item,
                                detail: ev.detail,
                                source_path: meetingPath,
                            });
                        }
                    }
                    catch {
                        // best-effort telemetry
                    }
                }
                // Refresh qmd index unless --skip-qmd
                if (!opts.skipQmd) {
                    qmdResult = await refreshQmdIndex(root, config.qmd_collection);
                }
            }
        }
        else {
            // Non-stage mode: just format for display (uses raw extraction, no metadata)
            stagedSections = formatStagedSections(extractionResult);
        }
        // Build reconciled items array for JSON output
        const reconciled = processed?.stagedItemMatchedText
            ? Object.entries(processed.stagedItemMatchedText).map(([id, matchedText]) => ({
                id,
                matchedText,
            }))
            : [];
        // Per-source skip tally (observability for dedup behavior).
        // Lets users see why items were skipped without spelunking through frontmatter.
        const skippedBySource = processed
            ? Object.entries(processed.stagedItemStatus).reduce((acc, [id, status]) => {
                if (status !== 'skipped')
                    return acc;
                const source = processed.stagedItemSource[id];
                if (source === 'reconciled')
                    acc.reconciled += 1;
                else if (source === 'existing-task')
                    acc.existingTask += 1;
                else if (source === 'slack-resolved')
                    acc.slackResolved += 1;
                return acc;
            }, { reconciled: 0, existingTask: 0, slackResolved: 0 })
            : { reconciled: 0, existingTask: 0, slackResolved: 0 };
        // Phase 10b-min wiring — surface cross-meeting dedup outcome counts
        // so callers (and the post-stage summary) can see how many items the
        // pipeline marked as definite dupes vs flagged as possibly-mergeable.
        const crossMeetingDedup = dedupResult
            ? {
                evaluated: dedupResult.decisions.length,
                definiteDupes: dedupResult.decisions.filter((d) => d.outcome.kind === 'definite-dupe').length,
                possiblyMergeable: dedupResult.decisions.filter((d) => d.outcome.kind === 'possibly-mergeable').length,
                newCanonical: dedupResult.decisions.filter((d) => d.outcome.kind === 'new-canonical').length,
                reverseStamps: dedupResult.reverseStampResults.length,
            }
            : { evaluated: 0, definiteDupes: 0, possiblyMergeable: 0, newCanonical: 0, reverseStamps: 0 };
        // Build response
        const response = {
            success: true,
            file: meetingPath,
            intelligence: extractionResult.intelligence,
            validationWarnings: extractionResult.validationWarnings,
            staged: shouldStage,
            dryRun,
            contextUsed: !!contextBundle,
            priorItemsUsed: !!priorItems,
            reconciled,
            skippedBySource,
            silentlyMerged,
            crossMeetingDedup,
            qmd: qmdResult ?? { indexed: false, skipped: true },
            // CHR-W0: tells the winddown that --reconcile was deferred to the
            // day-level call (`arete meeting reconcile-day` at Step 2).
            ...(opts.reconcile && dayLevelReconcile ? { reconcileDeferred: 'day-level' } : {}),
        };
        // Add reconciliation stats when reconciliation was run
        if (reconciliationResult) {
            response.reconciliation = {
                enabled: true,
                stats: reconciliationResult.stats,
                items: reconciliationResult.items.map((item) => ({
                    type: item.type,
                    status: item.status,
                    relevanceTier: item.relevanceTier,
                    relevanceScore: item.relevanceScore,
                    annotations: item.annotations,
                })),
            };
        }
        if (opts.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        // Human-readable output
        if (shouldStage && dryRun) {
            info('Dry run — would write the following staged sections:');
            console.log('');
            console.log(stagedSections);
            // Display reconciliation details
            if (reconciliationResult) {
                displayReconciliationDetails(reconciliationResult, reconciled);
            }
            else if (reconciled.length > 0) {
                displayReconciledCompletedItems(reconciled);
            }
            return;
        }
        if (shouldStage) {
            success(`Staged sections written to: ${meetingPath}`);
            // Per-source skip summary
            const totalSkipped = skippedBySource.reconciled + skippedBySource.existingTask + skippedBySource.slackResolved;
            if (totalSkipped > 0) {
                const parts = [];
                if (skippedBySource.reconciled > 0)
                    parts.push(`${skippedBySource.reconciled} reconciled`);
                if (skippedBySource.existingTask > 0)
                    parts.push(`${skippedBySource.existingTask} existing-task`);
                if (skippedBySource.slackResolved > 0)
                    parts.push(`${skippedBySource.slackResolved} slack-resolved`);
                info(`Skipped ${totalSkipped} items: ${parts.join(', ')}`);
            }
            // Silent-merge summary — duplicate decisions/learnings dropped from
            // staging (already in committed memory).
            const totalMerged = silentlyMerged.decisions + silentlyMerged.learnings;
            if (totalMerged > 0) {
                const parts = [];
                if (silentlyMerged.decisions > 0)
                    parts.push(`${silentlyMerged.decisions} decision${silentlyMerged.decisions === 1 ? '' : 's'}`);
                if (silentlyMerged.learnings > 0)
                    parts.push(`${silentlyMerged.learnings} learning${silentlyMerged.learnings === 1 ? '' : 's'}`);
                info(`Merged into committed memory: ${parts.join(', ')}`);
            }
            // Phase 10b-min wiring — cross-meeting dedup summary.
            if (dedupResult && (crossMeetingDedup.definiteDupes > 0 || crossMeetingDedup.possiblyMergeable > 0)) {
                const parts = [];
                if (crossMeetingDedup.definiteDupes > 0) {
                    parts.push(`${crossMeetingDedup.definiteDupes} dupe${crossMeetingDedup.definiteDupes === 1 ? '' : 's'}`);
                }
                if (crossMeetingDedup.possiblyMergeable > 0) {
                    parts.push(`${crossMeetingDedup.possiblyMergeable} possibly-mergeable`);
                }
                info(`Cross-meeting dedup: ${parts.join(', ')}`);
            }
            // Display reconciliation details
            if (reconciliationResult) {
                displayReconciliationDetails(reconciliationResult, reconciled);
            }
            else if (reconciled.length > 0) {
                displayReconciledCompletedItems(reconciled);
            }
            displayQmdResult(qmdResult);
            return;
        }
        // Default: output formatted extraction
        const { intelligence } = extractionResult;
        console.log('');
        console.log(chalk.bold('Summary'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(intelligence.summary);
        console.log('');
        if (intelligence.actionItems.length > 0) {
            console.log(chalk.bold('Action Items'));
            console.log(chalk.dim('─'.repeat(40)));
            for (const item of intelligence.actionItems) {
                const arrow = item.direction === 'i_owe_them' ? '→' : '←';
                const counterparty = item.counterpartySlug ? ` @${item.counterpartySlug}` : '';
                const due = item.due ? chalk.dim(` (${item.due})`) : '';
                console.log(`  • [@${item.ownerSlug} ${arrow}${counterparty}] ${item.description}${due}`);
            }
            console.log('');
        }
        if (intelligence.decisions.length > 0) {
            console.log(chalk.bold('Decisions'));
            console.log(chalk.dim('─'.repeat(40)));
            for (const decision of intelligence.decisions) {
                console.log(`  • ${decision}`);
            }
            console.log('');
        }
        if (intelligence.learnings.length > 0) {
            console.log(chalk.bold('Learnings'));
            console.log(chalk.dim('─'.repeat(40)));
            for (const learning of intelligence.learnings) {
                console.log(`  • ${learning}`);
            }
            console.log('');
        }
        if (extractionResult.validationWarnings.length > 0) {
            const mirrorPairCount = extractionResult.validationWarnings.filter(w => w.reason.startsWith('mirror-pair duplicate')).length;
            if (mirrorPairCount > 0) {
                warn(`${extractionResult.validationWarnings.length} items rejected during validation ` +
                    `(${mirrorPairCount} mirror-pair duplicate${mirrorPairCount === 1 ? '' : 's'} dropped — ` +
                    `see "## Parser-dropped (mirror-pair duplicates)" section in the meeting file)`);
            }
            else {
                warn(`${extractionResult.validationWarnings.length} items rejected during validation`);
            }
        }
    });
    // CHR-W0 (Stage-0) — day-level cross-meeting reconcile.
    //
    // Moves the EXISTING reconcileMeetingBatch + batchLLMReview invocations from
    // per-file extract time to ONE call over the whole day, run by the winddown
    // at Step 2 scope when `reconcile_mode: day-level`. Differences from the
    // inline path, by design:
    //   - the chef/user sees the full undeduped day first (extraction is pure);
    //   - NO silent merges: decisions/learnings that the inline path silently
    //     deleted are instead flipped to visible `status: 'skipped'` +
    //     `staged_item_skip_reason` (day-level apply is post-write, so silent
    //     merge would be data loss);
    //   - one batched LLM review instead of N per-file calls;
    //   - user decisions win: items already 'approved' or 'skipped' are never
    //     touched (idempotent re-runs).
    meetingCmd
        .command('reconcile-day')
        .description('Day-level cross-meeting reconcile (reconcile_mode: day-level; CHR-W0)')
        .option('--date <date>', 'Day to reconcile, YYYY-MM-DD (default: today)')
        .option('--days <n>', 'Context window of recent meetings in days (default: 7)', '7')
        .option('--dry-run', 'Compute and report decisions without writing')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            else
                error('Not in an Areté workspace');
            process.exit(1);
        }
        const config = await loadConfig(services.storage, root);
        const paths = services.workspace.getPaths(root);
        const date = opts.date ?? (() => {
            const d = new Date();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${d.getFullYear()}-${mm}-${dd}`;
        })();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: `Invalid --date: ${date}` }));
            else
                error(`Invalid --date: ${date}`);
            process.exit(1);
        }
        const days = parseInt(opts.days || '7', 10);
        const dryRun = Boolean(opts.dryRun);
        // paths.resources is already absolute — do NOT join root again (the
        // legacy inline path's doubled join silently empties the batch; this
        // command must actually see the day).
        const meetingsDir = join(paths.resources, 'meetings');
        // Load batch (the day's meetings + lookback context) and sort by date
        // prefix ASC so first-occurrence-wins keeps the OLDEST as canonical —
        // identical semantics to the inline path's [...recent, current] order.
        const batch = await loadRecentMeetingBatch(services.storage, meetingsDir, days);
        batch.sort((a, b) => {
            const da = a.meetingPath.split('/').pop() ?? '';
            const db = b.meetingPath.split('/').pop() ?? '';
            return da < db ? -1 : da > db ? 1 : 0;
        });
        const dayPaths = new Set(batch.map((b) => b.meetingPath).filter((p) => (p.split('/').pop() ?? '').startsWith(date)));
        if (dayPaths.size === 0) {
            const out = { success: true, date, dayMeetings: 0, applied: {}, note: 'No processed meetings for the date' };
            if (opts.json)
                console.log(JSON.stringify(out, null, 2));
            else
                info(`No processed meetings found for ${date} — nothing to reconcile.`);
            return;
        }
        const context = await loadReconciliationContext(services.storage, root);
        const reconciliation = reconcileMeetingBatch(batch, context);
        const byFile = new Map();
        for (const item of reconciliation.items) {
            if (item.status !== 'duplicate' && item.status !== 'completed')
                continue;
            if (!dayPaths.has(item.meetingPath))
                continue;
            const text = typeof item.original === 'string' ? item.original : item.original.description;
            const list = byFile.get(item.meetingPath) ?? [];
            list.push({
                text,
                type: item.type,
                status: item.status,
                reason: item.status === 'completed' ? 'already completed (day-level reconcile)' : 'duplicate (day-level reconcile)',
                evidence: item.annotations.duplicateOf ?? item.annotations.completedOn ?? item.annotations.why ?? '',
            });
            byFile.set(item.meetingPath, list);
        }
        // Apply mechanical decisions per file via writeWithLock. User decisions
        // win: approved/skipped items are never touched.
        const applied = [];
        const skippedExisting = [];
        const unmatched = [];
        const applyToFile = async (filePath, decisions) => {
            if (decisions.length === 0)
                return;
            if (dryRun) {
                // Review fix (should-fix 3): dry-run must run the SAME staged-line
                // matching + user-decision checks as the real run, READ-ONLY — the
                // flip rule trusts a clean dry-run to predict a clean real run, so
                // it must populate real ids, `unmatched`, and `skippedExisting`
                // exactly as the write path would.
                const content = await services.storage.read(filePath);
                if (content === null) {
                    for (const d of decisions) {
                        unmatched.push({ file: filePath, text: d.text });
                    }
                    return;
                }
                const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
                const body = fmMatch ? fmMatch[2] : content;
                const sections = parseStagedSections(body);
                const allStaged = [...sections.actionItems, ...sections.decisions, ...sections.learnings];
                const currentStatus = parseStagedItemStatus(content);
                for (const d of decisions) {
                    const match = allStaged.find((s) => s.text === d.text);
                    if (!match) {
                        unmatched.push({ file: filePath, text: d.text });
                        continue;
                    }
                    const prior = currentStatus[match.id];
                    if (prior === 'approved' || prior === 'skipped') {
                        skippedExisting.push({ file: filePath, id: match.id, priorStatus: prior });
                        continue;
                    }
                    applied.push({ file: filePath, id: match.id, text: d.text, reason: d.reason, evidence: d.evidence });
                }
                return;
            }
            await writeWithLock(services.storage, filePath, async (current) => {
                const sections = parseStagedSections(current.body);
                const allStaged = [...sections.actionItems, ...sections.decisions, ...sections.learnings];
                const currentStatus = (current.frontmatter['staged_item_status'] ?? {});
                const currentSkipReason = (current.frontmatter['staged_item_skip_reason'] ?? {});
                const currentSource = (current.frontmatter['staged_item_source'] ?? {});
                const mergedStatus = { ...currentStatus };
                const mergedSkipReason = { ...currentSkipReason };
                const mergedSource = { ...currentSource };
                let changed = false;
                for (const d of decisions) {
                    const match = allStaged.find((s) => s.text === d.text);
                    if (!match) {
                        unmatched.push({ file: filePath, text: d.text });
                        continue;
                    }
                    const prior = mergedStatus[match.id];
                    if (prior === 'approved' || prior === 'skipped') {
                        skippedExisting.push({ file: filePath, id: match.id, priorStatus: prior });
                        continue;
                    }
                    mergedStatus[match.id] = 'skipped';
                    mergedSource[match.id] = 'reconciled';
                    // NOTE: `setAt` is REQUIRED — parseStagedItemSkipReason drops
                    // entries without it (shape-validated reader).
                    mergedSkipReason[match.id] = {
                        reason: d.reason,
                        evidence: d.evidence,
                        setBy: 'chef',
                        setAt: new Date().toISOString(),
                    };
                    changed = true;
                    applied.push({ file: filePath, id: match.id, text: d.text, reason: d.reason, evidence: d.evidence });
                }
                if (!changed) {
                    // Nothing to write — abstain so the file is untouched (no
                    // mtime churn, no frontmatter re-serialization).
                    return { abstain: 'no day-level changes for this file' };
                }
                return {
                    frontmatter: {
                        staged_item_status: mergedStatus,
                        staged_item_source: mergedSource,
                        staged_item_skip_reason: mergedSkipReason,
                    },
                    body: current.body,
                };
            }, { mtimeGuardSeconds: 0 });
        };
        for (const [filePath, decisions] of byFile) {
            await applyToFile(filePath, decisions);
        }
        // ONE batched LLM quality review over the day's surviving action items
        // (replaces N per-file batchLLMReview calls). Degrades gracefully when
        // the standard tier is missing.
        let llmDrops = [];
        const canLLM = services.ai.isConfigured() && Boolean(config.ai?.tiers?.standard) && process.env.ARETE_NO_LLM !== '1';
        if (canLLM) {
            try {
                const reviewItems = [];
                for (const filePath of dayPaths) {
                    const content = await services.storage.read(filePath);
                    if (!content)
                        continue;
                    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
                    const body = fmMatch ? fmMatch[2] : content;
                    const statusMap = parseStagedItemStatus(content);
                    const sections = parseStagedSections(body);
                    for (const item of sections.actionItems) {
                        const st = statusMap[item.id];
                        if (st === 'skipped' || st === 'approved')
                            continue;
                        reviewItems.push({ text: item.text, type: 'action', id: `${filePath}::${item.id}`, file: filePath });
                    }
                }
                if (reviewItems.length > 0) {
                    const callLLMReconciliation = async (prompt) => {
                        const r = await services.ai.call('reconciliation', prompt);
                        return r.text;
                    };
                    const drops = await batchLLMReview(reviewItems.map((r) => ({ text: r.text, type: r.type, id: r.id })), context.recentCommittedItems, callLLMReconciliation);
                    // Group drops by file and apply.
                    const dropsByFile = new Map();
                    for (const drop of drops) {
                        const sep = drop.id.lastIndexOf('::');
                        const filePath = drop.id.slice(0, sep);
                        const item = reviewItems.find((r) => r.id === drop.id);
                        if (!item)
                            continue;
                        const list = dropsByFile.get(filePath) ?? [];
                        list.push({ text: item.text, reason: `batch LLM review: ${drop.reason}`, evidence: 'day-level batchLLMReview' });
                        dropsByFile.set(filePath, list);
                        llmDrops.push({ file: filePath, id: drop.id.slice(sep + 2), text: item.text, reason: drop.reason });
                    }
                    for (const [filePath, decisions] of dropsByFile) {
                        await applyToFile(filePath, decisions);
                    }
                }
            }
            catch {
                if (!opts.json)
                    warn('Day-level batch LLM review skipped due to error');
                llmDrops = [];
            }
        }
        else if (!opts.json) {
            info('Batch LLM review skipped (AI not configured, standard tier missing, or ARETE_NO_LLM=1)');
        }
        const out = {
            success: true,
            date,
            dryRun,
            windowDays: days,
            batchMeetings: batch.length,
            dayMeetings: dayPaths.size,
            stats: reconciliation.stats,
            applied,
            llmDrops,
            preservedUserDecisions: skippedExisting,
            unmatched,
        };
        if (opts.json) {
            console.log(JSON.stringify(out, null, 2));
            return;
        }
        success(`Day-level reconcile for ${date}${dryRun ? ' (dry run)' : ''}`);
        info(`Batch: ${batch.length} meetings (${dayPaths.size} on ${date})`);
        info(`Duplicates: ${reconciliation.stats.duplicatesRemoved} · Completed: ${reconciliation.stats.completedMatched} · LLM drops: ${llmDrops.length}`);
        for (const a of applied) {
            listItem(`${a.file.split('/').pop()} ${a.id}: ${a.text.slice(0, 60)} ← ${a.reason}`);
        }
        if (skippedExisting.length > 0) {
            info(`${skippedExisting.length} item(s) untouched (already approved/skipped by user)`);
        }
        if (unmatched.length > 0) {
            warn(`${unmatched.length} reconciled item(s) had no matching staged line (text drift)`);
        }
    });
    // Approve subcommand - commit staged items to memory
    meetingCmd
        .command('approve <slug>')
        .description('Commit approved staged items to memory files')
        .option('--all', 'Mark all pending items as approved before committing')
        .option('--items <ids>', 'Comma-separated item IDs to mark as approved (e.g., ai_001,de_001)')
        .option('--skip <ids>', 'Comma-separated item IDs to mark as skipped (won\'t be committed)')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--skip-topics', 'Skip topic page integration after commit (defer to `arete topic refresh`)')
        .option('--json', 'Output as JSON')
        .action(async (slug, opts) => {
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
        const paths = services.workspace.getPaths(root);
        // Resolve meeting file path from slug
        const meetingPath = join(paths.resources, 'meetings', `${slug}.md`);
        const content = await services.storage.read(meetingPath);
        if (!content) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Meeting not found: ${slug}` }));
            }
            else {
                error(`Meeting not found: ${slug}`);
            }
            process.exit(1);
        }
        // Parse frontmatter to check status
        const { frontmatter, body } = extractFrontmatter(content);
        const status = frontmatter['status'];
        // Error if already approved
        if (status === 'approved') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Meeting already approved',
                    hint: 'This meeting has already been approved. Use `arete meeting extract --stage` to reprocess if needed.',
                }));
            }
            else {
                error('Meeting already approved');
                info('This meeting has already been approved. Use `arete meeting extract --stage` to reprocess if needed.');
            }
            process.exit(1);
        }
        // Error if not processed (no staged items)
        if (status !== 'processed') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Meeting not processed',
                    hint: 'Run `arete meeting extract <file> --stage` to process this meeting first.',
                }));
            }
            else {
                error('Meeting not processed');
                info('Run `arete meeting extract <file> --stage` to process this meeting first.');
            }
            process.exit(1);
        }
        // Parse staged sections and current status
        const stagedSections = parseStagedSections(body);
        const currentStatus = parseStagedItemStatus(content);
        const allItems = [
            ...stagedSections.actionItems,
            ...stagedSections.decisions,
            ...stagedSections.learnings,
        ];
        // Parse --items and --skip flags
        const itemsToApprove = opts.items ? opts.items.split(',').map((id) => id.trim()) : [];
        const itemsToSkip = opts.skip ? opts.skip.split(',').map((id) => id.trim()) : [];
        // Handle --all: mark all pending items as approved
        if (opts.all) {
            for (const item of allItems) {
                const existingStatus = currentStatus[item.id];
                if (!existingStatus || existingStatus === 'pending') {
                    await writeItemStatusToFile(services.storage, meetingPath, item.id, { status: 'approved' });
                }
            }
        }
        // Handle --items: mark specific IDs as approved
        for (const itemId of itemsToApprove) {
            const exists = allItems.some((item) => item.id === itemId);
            if (!exists) {
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: `Item not found: ${itemId}` }));
                }
                else {
                    error(`Item not found: ${itemId}`);
                }
                process.exit(1);
            }
            await writeItemStatusToFile(services.storage, meetingPath, itemId, { status: 'approved' });
        }
        // Handle --skip: mark specific IDs as skipped
        for (const itemId of itemsToSkip) {
            const exists = allItems.some((item) => item.id === itemId);
            if (!exists) {
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: `Item not found: ${itemId}` }));
                }
                else {
                    error(`Item not found: ${itemId}`);
                }
                process.exit(1);
            }
            await writeItemStatusToFile(services.storage, meetingPath, itemId, { status: 'skipped' });
        }
        // Re-read to get updated status after flag processing
        const updatedContent = await services.storage.read(meetingPath);
        if (!updatedContent) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Failed to read updated meeting file' }));
            }
            else {
                error('Failed to read updated meeting file');
            }
            process.exit(1);
        }
        const finalStatus = parseStagedItemStatus(updatedContent);
        // Count approved items
        const approvedIds = Object.entries(finalStatus)
            .filter(([, s]) => s === 'approved')
            .map(([id]) => id);
        // Error if no approved items (and not using --all or --items)
        if (approvedIds.length === 0) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'No items approved',
                    hint: 'Use --all to approve all items, or --items <id1,id2,...> to approve specific items.',
                }));
            }
            else {
                error('No items approved');
                info('Use --all to approve all items, or --items <id1,id2,...> to approve specific items.');
            }
            process.exit(1);
        }
        // --------------------------------------------------------------------------
        // Goal linking: prompt user to link action items to goals
        // --------------------------------------------------------------------------
        let selectedGoalSlug;
        const approvedActionItemIds = approvedIds.filter((id) => id.startsWith('ai_'));
        if (approvedActionItemIds.length > 0 && !opts.json) {
            // Load active goals
            const goalsDir = join(root, 'goals');
            const allGoals = await parseGoals(goalsDir, services.storage);
            const activeGoals = allGoals.filter((g) => g.status === 'active');
            if (activeGoals.length === 0) {
                info('No active goals found, skipping goal linking');
            }
            else if (activeGoals.length <= 2) {
                // Inline prompt for 1-2 goals
                const { confirm } = await import('@inquirer/prompts');
                for (const goal of activeGoals) {
                    const confirmed = await confirm({
                        message: `Link action items to ${goal.id} "${goal.title}"?`,
                        default: false,
                    });
                    if (confirmed) {
                        selectedGoalSlug = goal.slug;
                        break;
                    }
                }
            }
            else {
                // Numbered list for 3+ goals
                const { select } = await import('@inquirer/prompts');
                const choices = [
                    ...activeGoals.map((g) => ({
                        name: `${g.id} ${g.title}`,
                        value: g.slug,
                    })),
                    { name: 'None', value: '__none__' },
                ];
                const result = await select({
                    message: 'Link action items to a goal:',
                    choices,
                });
                if (result !== '__none__') {
                    selectedGoalSlug = result;
                }
            }
        }
        // --------------------------------------------------------------------------
        // Save owner metadata BEFORE commitApprovedItems clears it
        // --------------------------------------------------------------------------
        const ownerMap = parseStagedItemOwner(updatedContent);
        const editsMap = parseStagedItemEdits(updatedContent);
        // Get meeting metadata for task/commitment creation
        const meetingDate = typeof frontmatter['date'] === 'string'
            ? new Date(frontmatter['date'].slice(0, 10))
            : new Date();
        const meetingArea = typeof frontmatter['area'] === 'string'
            ? frontmatter['area']
            : undefined;
        // Commit approved items (decisions, learnings to memory)
        const memoryDir = join(root, '.arete', 'memory', 'items');
        // Phase 0 instrumentation — write one item-fate event per approved item.
        // Best-effort; never blocks approve.
        const importanceForFate = typeof frontmatter['importance'] === 'string'
            && ['light', 'normal', 'important', 'skip'].includes(frontmatter['importance'])
            ? frontmatter['importance']
            : null;
        // phase-10-followup-2 Step 4 / AC9 — derive meeting slug for audit
        // log payloads (slug = basename without `.md`).
        const meetingSlug = meetingPath.replace(/^.*\//, '').replace(/\.md$/, '');
        await commitApprovedItems(services.storage, meetingPath, memoryDir, {
            onApproved: async (item) => {
                try {
                    await services.memoryLog.appendItemFate(paths, {
                        item_text: item.text,
                        item_kind: item.kind,
                        source_path: meetingPath,
                        fate: 'approved',
                        reason: null,
                        confidence: item.confidence,
                        importance_at_extraction: importanceForFate,
                    });
                }
                catch {
                    // best-effort
                }
            },
            onSkipped: async (item) => {
                // phase-10-followup-2 AC9: APPLY-SKIP audit log line per
                // skipped item. Best-effort; appendChefSkipLog already
                // swallows errors internally.
                await appendChefSkipLog(root, {
                    action: 'APPLY-SKIP',
                    id: item.id,
                    meeting: meetingSlug,
                    ...(item.reason !== null ? { reason: item.reason } : {}),
                    ...(item.evidence !== null ? { evidence: item.evidence } : {}),
                    ...(item.setBy !== null ? { setBy: item.setBy } : {}),
                });
            },
        });
        // --------------------------------------------------------------------------
        // D1 (wiki-repair W2) — capture `could_include` headlines staged by
        // `extract --stage` (persisted via the unified frontmatter writer).
        // Consumed by the approve-time summary hook below as FYI candidates.
        //
        // Meetings staged BEFORE the key existed simply have no key:
        // `couldIncludeHeadlines` stays undefined, the FYI block is omitted,
        // and the clear below is a no-op (live-fleet upgrade path —
        // pre-mortem R5).
        // --------------------------------------------------------------------------
        let couldIncludeHeadlines;
        const rawCouldInclude = frontmatter['could_include'];
        if (Array.isArray(rawCouldInclude)) {
            const headlines = rawCouldInclude.filter((h) => typeof h === 'string' && h.trim().length > 0);
            if (headlines.length > 0)
                couldIncludeHeadlines = headlines;
        }
        // --------------------------------------------------------------------------
        // W2 (wiki-repair) — approve-time meeting summary (ALSO-FIRE, not move:
        // `applyMeetingIntelligence` keeps its own call for the backend web
        // agent + standalone `arete meeting apply`).
        //
        // Writes `.arete/memory/summaries/meetings/<date>-<slug>.md` from the
        // just-committed meeting BEFORE Hook 2 runs, so the EXISTING
        // summary-first integration read (topic-memory.ts loadMeetingSummaryBody)
        // engages on the SAME approve — curated input instead of raw
        // transcript, and the `ingest` log event records
        // `input_kind: summary` (AC2).
        //
        // Gated identically to Hook 2 (`--skip-topics`, `ai.isConfigured()`,
        // `ARETE_NO_LLM`). OWN try/catch, independent of Hook 2's
        // (pre-mortem R4): a summary LLM failure must NEVER skip
        // integration, and an integration failure must never un-write the
        // summary. Approve exit stays 0 either way — Hook 2 falls back to
        // transcript input when no summary file exists.
        // --------------------------------------------------------------------------
        let approveSummary;
        if (!opts.skipTopics && services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1') {
            try {
                // Re-read the just-committed file: the summary must reflect the
                // post-commit body (approved sections) and post-alias topics.
                const committedForSummary = await services.storage.read(meetingPath);
                if (committedForSummary !== null) {
                    const { frontmatter: committedFm, body: committedBody } = extractFrontmatter(committedForSummary);
                    const { writeMeetingSummaryFromFrontmatter } = await import('@arete/core');
                    const summaryResult = await writeMeetingSummaryFromFrontmatter({
                        absPath: meetingPath,
                        frontmatter: committedFm,
                        body: committedBody,
                        couldInclude: couldIncludeHeadlines,
                    }, {
                        storage: services.storage,
                        workspaceRoot: root,
                        callLLM: async (prompt) => {
                            const r = await services.ai.call('synthesis', prompt);
                            return r.text;
                        },
                    });
                    if (summaryResult !== null) {
                        approveSummary = {
                            path: summaryResult.summaryPath,
                            written: summaryResult.written,
                            ...(summaryResult.reason !== undefined ? { reason: summaryResult.reason } : {}),
                        };
                        if (!opts.json) {
                            for (const w of summaryResult.warnings)
                                warn(w);
                        }
                    }
                }
            }
            catch (err) {
                // Non-fatal AND independent of Hook 2 — integration below still
                // runs (with transcript fallback). Warn (human mode) + JSON
                // surface + log event (W5 lossy-logger rule: visible, never
                // vanishes).
                const msg = err instanceof Error ? err.message : 'unknown';
                approveSummary = { path: null, written: false, reason: `error: ${msg}` };
                if (!opts.json) {
                    warn(`Meeting summary failed (non-fatal; topic integration still runs): ${msg}`);
                }
                try {
                    await services.memoryLog.append(paths, {
                        event: 'meeting-summary-failed',
                        fields: { meeting: meetingSlug, detail: msg },
                    });
                }
                catch (logErr) {
                    if (!opts.json) {
                        warn(`Could not write meeting-summary-failed log event: ${logErr instanceof Error ? logErr.message : 'unknown'}`);
                    }
                }
            }
        }
        // --------------------------------------------------------------------------
        // D1 consume-or-clear: drop the `could_include` key UNCONDITIONALLY —
        // even when the summary hook is gated off (no AI / ARETE_NO_LLM /
        // --skip-topics) or fails — so gated-off approves never leave fossil
        // keys that a later reprocess would render from stale data
        // (pre-mortem R5). Non-fatal: a failed clear only warns.
        // --------------------------------------------------------------------------
        if (rawCouldInclude !== undefined) {
            try {
                await writeWithLock(services.storage, meetingPath, 
                // Explicit `undefined` deletes the key under writeWithLock's
                // partial-merge contract; all other keys are untouched.
                async () => ({ frontmatter: { could_include: undefined } }), { mtimeGuardSeconds: 0 });
            }
            catch (err) {
                warn(`Could not clear could_include frontmatter (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`);
            }
        }
        // --------------------------------------------------------------------------
        // Hook 2 — Integrate this meeting into its topic wiki pages (Phase A #2)
        //
        // After commit succeeds, materialize the LLM-synthesized narrative into
        // each topic page tagged on the meeting. Uses refreshAllFromSources
        // scoped to this meeting's slugs — content-hash idempotency means only
        // this new meeting's integration spends LLM; any previously-integrated
        // sources for the same topics skip cleanly.
        //
        // Gated on `services.ai.isConfigured()` + `!opts.skipTopics`. Non-fatal:
        // failure is reported to the user but never blocks the approve flow
        // (the committed items are already persisted at this point).
        // --------------------------------------------------------------------------
        let topicIntegration;
        // W1 (wiki-repair): when Hook 2 is skipped/fails, capture WHY so it
        // surfaces in command output + JSON instead of a swallowed warn —
        // the 6/05–6/09 silent-integration-death class.
        let topicIntegrationError;
        if (!opts.skipTopics && services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1') {
            try {
                // Re-read the just-committed file to get the post-alias topics list.
                const committed = await services.storage.read(meetingPath);
                if (committed !== null) {
                    const { parseMeetingFile } = await import('@arete/core');
                    const parsed = parseMeetingFile(committed);
                    const meetingTopics = parsed?.frontmatter.topics ?? [];
                    if (meetingTopics.length > 0) {
                        // Signal-aware (wiki-repair T5): the integration path's
                        // per-call timeout aborts the signal so a wedged HTTP
                        // call is actually torn down, not just raced past.
                        const topicCallLLM = async (prompt, callOpts) => {
                            const r = await services.ai.call('synthesis', prompt, { signal: callOpts?.signal });
                            return r.text;
                        };
                        const integrationStart = Date.now();
                        const result = await services.topicMemory.refreshAllFromSources(paths, {
                            today: new Date().toISOString().slice(0, 10),
                            callLLM: topicCallLLM,
                            slugs: meetingTopics,
                            workspaceRoot: root,
                            lockLabel: 'meeting approve (topic ingest)',
                        });
                        topicIntegration = {
                            topics: result.topics.length,
                            integrated: result.totalIntegrated,
                            fallback: result.totalFallback,
                            skipped: result.totalSkipped,
                            durationMs: Date.now() - integrationStart,
                        };
                    }
                }
            }
            catch (err) {
                // Non-fatal for the approve itself (committed items are already
                // persisted) — but NOT silent. Stale locks are taken over inside
                // acquireSeedLock now, so reaching here means a LIVE process
                // holds the lock (or integration genuinely failed). Record the
                // error for JSON + human output below AND write a log event so
                // the skipped integration is visible in the replay log.
                if (err instanceof Error && err.name === 'SeedLockHeldError') {
                    topicIntegrationError = { kind: 'seed-lock-held', message: err.message };
                }
                else {
                    topicIntegrationError = {
                        kind: 'error',
                        message: err instanceof Error ? err.message : 'unknown',
                    };
                }
                try {
                    await services.memoryLog.append(paths, {
                        event: 'topic-integration-skipped',
                        fields: {
                            meeting: meetingSlug,
                            reason: topicIntegrationError.kind,
                            detail: topicIntegrationError.message,
                        },
                    });
                }
                catch (logErr) {
                    // W5 lossy-logger rule: log-append failures warn, never vanish.
                    warn(`Could not write topic-integration-skipped log event: ${logErr instanceof Error ? logErr.message : 'unknown'}`);
                }
            }
        }
        // --------------------------------------------------------------------------
        // Create commitments and tasks from action items
        // --------------------------------------------------------------------------
        let tasksCreated = 0;
        let waitingOnCreated = 0;
        if (approvedActionItemIds.length > 0) {
            for (const itemId of approvedActionItemIds) {
                const item = stagedSections.actionItems.find((ai) => ai.id === itemId);
                if (!item)
                    continue;
                const ownerMeta = ownerMap[itemId];
                const text = editsMap[itemId] ?? item.text;
                const direction = (ownerMeta?.direction ?? item.direction ?? 'i_owe_them');
                const counterpartySlug = ownerMeta?.counterpartySlug ?? item.counterpartySlug;
                const ownerSlug = ownerMeta?.ownerSlug ?? item.ownerSlug;
                // Determine person slug (the other party in the commitment)
                const personSlug = direction === 'i_owe_them' ? counterpartySlug : ownerSlug;
                if (!personSlug)
                    continue;
                // Get person display name
                const personName = formatSlugAsName(personSlug);
                if (direction === 'i_owe_them') {
                    // I owe them: create commitment + task with urgency-based bucket
                    const result = await services.commitments.create(text, personSlug, personName, 'i_owe_them', {
                        createTask: false, // We'll create the task manually with proper bucket
                        goalSlug: selectedGoalSlug,
                        area: meetingArea,
                        date: meetingDate,
                        source: `${slug}.md`,
                    });
                    // Infer urgency and create task with proper bucket
                    const urgencyBucket = inferUrgency(text);
                    const taskDestination = urgencyBucket;
                    await services.tasks.addTask(text, taskDestination, {
                        area: meetingArea,
                        person: personSlug,
                        from: { type: 'commitment', id: result.commitment.id.slice(0, 8) },
                    });
                    tasksCreated++;
                }
                else {
                    // They owe me: create commitment only + add to Waiting On
                    const result = await services.commitments.create(text, personSlug, personName, 'they_owe_me', {
                        createTask: false,
                        goalSlug: selectedGoalSlug,
                        area: meetingArea,
                        date: meetingDate,
                        source: `${slug}.md`,
                    });
                    // Add to Waiting On section in week.md
                    await addWaitingOnEntry(services.storage, paths.now, personName, personSlug, text, result.commitment.id.slice(0, 8));
                    waitingOnCreated++;
                }
            }
        }
        // Refresh QMD index unless --skip-qmd
        let qmdResult;
        if (!opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        // Read final meeting state for response
        const finalContent = await services.storage.read(meetingPath);
        const { frontmatter: finalFm, body: finalBody } = extractFrontmatter(finalContent ?? '');
        // Phase 2 (Areté v2): approved items live in body sections
        // (## Approved Action Items / Decisions / Learnings) — the
        // frontmatter.approved_items duplicate is gone. Backward-compat:
        // fall back to legacy frontmatter when body has no approved
        // sections (pre-Phase-2 meeting files).
        const { parseApprovedSection } = await import('@arete/core');
        const bodyActions = parseApprovedSection(finalBody ?? '', 'Action Items');
        const bodyDecisions = parseApprovedSection(finalBody ?? '', 'Decisions');
        const bodyLearnings = parseApprovedSection(finalBody ?? '', 'Learnings');
        const legacyApproved = finalFm['approved_items'];
        const approvedItems = {
            actionItems: bodyActions.length > 0 ? bodyActions : (legacyApproved?.actionItems ?? []),
            decisions: bodyDecisions.length > 0 ? bodyDecisions : (legacyApproved?.decisions ?? []),
            learnings: bodyLearnings.length > 0 ? bodyLearnings : (legacyApproved?.learnings ?? []),
        };
        const response = {
            success: true,
            slug,
            approvedItems,
            memoryUpdated: {
                decisions: approvedItems.decisions.length > 0,
                learnings: approvedItems.learnings.length > 0,
            },
            ...(selectedGoalSlug ? { goalSlug: selectedGoalSlug } : {}),
            summary: approveSummary ?? null,
            topicIntegration: topicIntegration ?? null,
            topicIntegrationError: topicIntegrationError ?? null,
            qmd: qmdResult ?? { indexed: false, skipped: true },
        };
        if (opts.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        // Human-readable output
        success(`Meeting approved: ${slug}`);
        const actionCount = approvedItems.actionItems.length;
        const decisionCount = approvedItems.decisions.length;
        const learningCount = approvedItems.learnings.length;
        if (actionCount > 0) {
            const goalNote = selectedGoalSlug ? ` (linked to ${selectedGoalSlug})` : '';
            listItem('Action items', `${actionCount}${goalNote}`);
        }
        if (decisionCount > 0) {
            listItem('Decisions', `${decisionCount} (written to memory)`);
        }
        if (learningCount > 0) {
            listItem('Learnings', `${learningCount} (written to memory)`);
        }
        if (approveSummary !== undefined) {
            if (approveSummary.written && approveSummary.path !== null) {
                listItem('Summary', approveSummary.path);
            }
            else if (approveSummary.reason === 'already-fresh' && approveSummary.path !== null) {
                listItem('Summary', `${approveSummary.path} (already fresh)`);
            }
            else {
                warn(`Meeting summary not written (${approveSummary.reason ?? 'unknown'}) — integration falls back to transcript input.`);
            }
        }
        if (topicIntegration !== undefined) {
            const parts = [];
            if (topicIntegration.integrated > 0)
                parts.push(`${topicIntegration.integrated} integrated`);
            if (topicIntegration.fallback > 0)
                parts.push(`${topicIntegration.fallback} fallback`);
            if (topicIntegration.skipped > 0)
                parts.push(`${topicIntegration.skipped} skipped`);
            if (parts.length > 0) {
                listItem('Topics', `${topicIntegration.topics} touched (${parts.join(', ')})`);
            }
            const dur = topicIntegration.durationMs ?? 0;
            if (dur > 5000 || topicIntegration.topics > 2) {
                const secs = (dur / 1000).toFixed(1);
                // NOTE: the catch-up verb is `arete topic refresh` — `arete
                // memory refresh` has NOT done topic integration since Phase 7b
                // (the old hint sent users down a path that never catches up).
                warn(`Topic integration took ${secs}s (${topicIntegration.topics} topics). Use --skip-topics to defer; run \`arete topic refresh\` later to catch up.`);
            }
        }
        if (topicIntegrationError !== undefined) {
            if (topicIntegrationError.kind === 'seed-lock-held') {
                error(`Topic integration SKIPPED — ${topicIntegrationError.message}`);
                info('This meeting was NOT integrated into its topic wiki pages.');
                info(`Catch up once the conflicting process finishes: arete topic refresh --slugs <topics> (or arete topic refresh --all).`);
            }
            else {
                error(`Topic integration FAILED (approve itself succeeded): ${topicIntegrationError.message}`);
                info(`Catch up with: arete topic refresh --slugs <topics> (or arete topic refresh --all).`);
            }
        }
        displayQmdResult(qmdResult);
    });
    // Context subcommand - assemble context bundle for a meeting
    meetingCmd
        .command('context <file>')
        .description('Assemble a context bundle for a meeting file')
        .option('--json', 'Output as JSON (required for piping)')
        .option('--skip-agenda', 'Skip agenda lookup')
        .option('--skip-people', 'Skip attendee resolution')
        .action(async (file, opts) => {
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
        const paths = services.workspace.getPaths(root);
        // Resolve file path
        const meetingPath = file.startsWith('/') ? file : join(root, file);
        // Build context bundle
        let bundle;
        try {
            bundle = await buildMeetingContext(meetingPath, {
                storage: services.storage,
                intelligence: services.intelligence,
                entity: services.entity,
                paths,
                topicMemory: services.topicMemory,
            }, {
                skipAgenda: opts.skipAgenda,
                skipPeople: opts.skipPeople,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Output
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                ...bundle,
            }, null, 2));
            return;
        }
        // Human-readable output
        console.log('');
        console.log(chalk.bold('Meeting Context Bundle'));
        console.log(chalk.dim('─'.repeat(50)));
        console.log('');
        // Meeting info
        console.log(chalk.bold('Meeting'));
        console.log(`  Title: ${bundle.meeting.title}`);
        console.log(`  Date: ${bundle.meeting.date}`);
        console.log(`  Attendees: ${bundle.meeting.attendees.length}`);
        console.log(`  Transcript length: ${bundle.meeting.transcript.length} chars`);
        console.log('');
        // Agenda
        if (bundle.agenda) {
            console.log(chalk.bold('Agenda'));
            console.log(`  Path: ${bundle.agenda.path}`);
            console.log(`  Items: ${bundle.agenda.items.length}`);
            console.log(`  Unchecked: ${bundle.agenda.unchecked.length}`);
            console.log('');
        }
        else {
            console.log(chalk.dim('No agenda found'));
            console.log('');
        }
        // Resolved attendees
        if (bundle.attendees.length > 0) {
            console.log(chalk.bold('Resolved Attendees'));
            for (const attendee of bundle.attendees) {
                console.log(`  • ${attendee.name} (@${attendee.slug}) — ${attendee.category}`);
                if (attendee.stances.length > 0) {
                    console.log(`    Stances: ${attendee.stances.length}`);
                }
                if (attendee.openItems.length > 0) {
                    console.log(`    Open items: ${attendee.openItems.length}`);
                }
            }
            console.log('');
        }
        // Unknown attendees
        if (bundle.unknownAttendees.length > 0) {
            console.log(chalk.yellow('Unknown Attendees'));
            for (const unknown of bundle.unknownAttendees) {
                console.log(`  • ${unknown.name || unknown.email}`);
            }
            console.log('');
        }
        // Related context
        const rc = bundle.relatedContext;
        if (rc.goals.length > 0 || rc.projects.length > 0 || rc.recentDecisions.length > 0 || rc.recentLearnings.length > 0) {
            console.log(chalk.bold('Related Context'));
            if (rc.goals.length > 0) {
                console.log(`  Goals: ${rc.goals.map(g => g.title).join(', ')}`);
            }
            if (rc.projects.length > 0) {
                console.log(`  Projects: ${rc.projects.map(p => p.title).join(', ')}`);
            }
            if (rc.recentDecisions.length > 0) {
                console.log(`  Recent decisions: ${rc.recentDecisions.length}`);
            }
            if (rc.recentLearnings.length > 0) {
                console.log(`  Recent learnings: ${rc.recentLearnings.length}`);
            }
            console.log('');
        }
        // Warnings
        if (bundle.warnings.length > 0) {
            console.log(chalk.yellow('Warnings'));
            for (const warning of bundle.warnings) {
                console.log(`  ⚠ ${warning}`);
            }
            console.log('');
        }
        success('Context bundle assembled');
    });
    // Apply subcommand - apply extracted intelligence to a meeting file
    meetingCmd
        .command('apply <file>')
        .description('Apply extracted intelligence to a meeting file')
        .option('--intelligence <json>', 'Intelligence JSON (or - for stdin)')
        .option('--skip-agenda', 'Skip agenda archival')
        .option('--clear', 'Clear existing staged sections before writing')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--skip-topics', 'Skip topic alias/merge pass (write intelligence.topics verbatim; `arete topic refresh` will normalize later)')
        .option('--json', 'Output as JSON')
        .action(async (file, opts) => {
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
        // Parse intelligence from --intelligence flag or stdin
        if (!opts.intelligence) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Provide --intelligence <json> or --intelligence -' }));
            }
            else {
                error('Provide --intelligence <json> or --intelligence -');
                info('Example: arete meeting apply meeting.md --intelligence \'{"summary":"..."}\'');
                info('Example: arete meeting extract meeting.md --json | arete meeting apply meeting.md --intelligence -');
            }
            process.exit(1);
        }
        let intelligenceJson;
        if (opts.intelligence === '-') {
            // Read from stdin
            const chunks = [];
            for await (const chunk of process.stdin) {
                chunks.push(chunk);
            }
            intelligenceJson = Buffer.concat(chunks).toString('utf8');
        }
        else {
            intelligenceJson = opts.intelligence;
        }
        // Parse intelligence JSON
        let intelligence;
        try {
            const parsed = JSON.parse(intelligenceJson);
            // Handle both wrapped (success: true, intelligence: {...}) and unwrapped formats
            if (parsed.intelligence && typeof parsed.intelligence === 'object') {
                intelligence = parsed.intelligence;
            }
            else {
                intelligence = parsed;
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Invalid intelligence JSON: ${msg}` }));
            }
            else {
                error(`Invalid intelligence JSON: ${msg}`);
            }
            process.exit(1);
        }
        // Resolve file path
        const meetingPath = file.startsWith('/') ? file : join(root, file);
        // Apply intelligence using the core service. Threads TopicMemoryService
        // + callLLM so the alias/merge pass (Phase A #1 of topic-wiki-memory)
        // normalizes `intelligence.topics` against existing topic pages before
        // writing frontmatter. `--skip-topics` bypasses the pass.
        const applyCallLLM = services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1'
            ? async (prompt) => {
                const r = await services.ai.call('synthesis', prompt);
                return r.text;
            }
            : undefined;
        const applyPaths = services.workspace.getPaths(root);
        let result;
        try {
            result = await applyMeetingIntelligence(meetingPath, intelligence, {
                storage: services.storage,
                workspaceRoot: root,
                topicMemory: services.topicMemory,
                workspacePaths: applyPaths,
                callLLM: applyCallLLM,
            }, {
                skipAgenda: opts.skipAgenda,
                clear: opts.clear,
                skipTopicAlias: opts.skipTopics,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Refresh QMD index unless --skip-qmd
        let qmdResult;
        if (!opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        // Build response
        const response = {
            success: true,
            ...result,
            qmd: qmdResult ?? { indexed: false, skipped: true },
        };
        if (opts.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        // Human-readable output
        success(`Applied intelligence to: ${file}`);
        listItem('Action items staged', `${result.actionItemsStaged}`);
        listItem('Decisions staged', `${result.decisionsStaged}`);
        listItem('Learnings staged', `${result.learningsStaged}`);
        if (result.agendaArchived) {
            info(`Agenda archived: ${result.agendaArchived}`);
        }
        if (result.warnings.length > 0) {
            for (const warning of result.warnings) {
                warn(warning);
            }
        }
        displayQmdResult(qmdResult);
        // Fire-and-forget manifest refresh (non-blocking — do not await)
        const paths = services.workspace.getPaths(root);
        generateMeetingManifest(paths, services.storage).catch((err) => {
            warn(`Meeting manifest update failed: ${err instanceof Error ? err.message : String(err)}`);
        });
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