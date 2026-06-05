/**
 * Commitments commands — list and resolve open commitments
 */
import { isAbsolute, resolve as resolvePath, join } from 'node:path';
import { createServices, loadConfig, refreshQmdIndex, buildPersonDirectory, migrateCommitmentsToV2, formatMigrationDiff, parseCommitmentsFile, serializeCommitmentsFile, } from '@arete/core';
import chalk from 'chalk';
import { listItem, error, info, success } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
export function registerCommitmentsCommand(program) {
    const commitmentsCmd = program
        .command('commitments')
        .description('Track and resolve open commitments');
    // ---------------------------------------------------------------------------
    // arete commitments list
    // ---------------------------------------------------------------------------
    commitmentsCmd
        .command('list')
        .description('List open commitments')
        .option('--direction <direction>', 'Filter by direction: i_owe_them or they_owe_me')
        .option('--person <slugs...>', 'Filter by person slug(s)')
        .option('--area <slug>', 'Filter by area slug')
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
        // Validate direction if provided
        if (opts.direction &&
            opts.direction !== 'i_owe_them' &&
            opts.direction !== 'they_owe_me') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
                }));
            }
            else {
                error(`Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`);
            }
            process.exit(1);
        }
        const direction = opts.direction;
        let commitments;
        try {
            commitments = await services.commitments.listOpen({
                direction,
                personSlugs: opts.person,
                area: opts.area,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to list commitments';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        if (opts.json) {
            const out = commitments.map((c) => ({
                id: c.id,
                idShort: c.id.slice(0, 8),
                direction: c.direction,
                personSlug: c.personSlug,
                personName: c.personName,
                text: c.text,
                date: c.date,
                resolvedAt: c.resolvedAt,
                ...(c.goalSlug ? { goalSlug: c.goalSlug } : {}),
                ...(c.area ? { area: c.area } : {}),
            }));
            console.log(JSON.stringify({ success: true, commitments: out, count: out.length }, null, 2));
            return;
        }
        if (commitments.length === 0) {
            info('No open commitments.');
            return;
        }
        // Group by direction
        const iOweThem = commitments.filter((c) => c.direction === 'i_owe_them');
        const theyOweMe = commitments.filter((c) => c.direction === 'they_owe_me');
        // Check if any commitment has an area value (to conditionally show area column)
        const hasAreas = commitments.some((c) => c.area);
        console.log('');
        if (iOweThem.length > 0) {
            console.log(chalk.bold('I owe them'));
            for (const c of iOweThem) {
                const shortId = c.id.slice(0, 8);
                const personName = c.personName.padEnd(20).slice(0, 20);
                const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
                const areaTag = hasAreas ? (c.area ? chalk.magenta(`@${c.area} `) : '') : '';
                const date = c.date ? chalk.dim(`(${c.date})`) : '';
                console.log(`  ${chalk.dim(shortId)}  ${personName}  ${areaTag}${goalPrefix}${c.text}  ${date}`);
            }
            console.log('');
        }
        if (theyOweMe.length > 0) {
            console.log(chalk.bold('They owe me'));
            for (const c of theyOweMe) {
                const shortId = c.id.slice(0, 8);
                const personName = c.personName.padEnd(20).slice(0, 20);
                const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
                const areaTag = hasAreas ? (c.area ? chalk.magenta(`@${c.area} `) : '') : '';
                const date = c.date ? chalk.dim(`(${c.date})`) : '';
                console.log(`  ${chalk.dim(shortId)}  ${personName}  ${areaTag}${goalPrefix}${c.text}  ${date}`);
            }
            console.log('');
        }
        listItem('Total', String(commitments.length));
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete commitments create <text>
    // ---------------------------------------------------------------------------
    commitmentsCmd
        .command('create <text>')
        .description('Create a commitment')
        .requiredOption('--person <slug>', 'Person slug (e.g. anthony-avina)')
        .requiredOption('--direction <direction>', 'Direction: i_owe_them or they_owe_me')
        .option('--person-name <name>', 'Person display name (derived from slug if omitted)')
        .option('--goal <slug>', 'Goal slug to link')
        .option('--area <slug>', 'Area slug')
        .option('--date <date>', 'Date (YYYY-MM-DD, defaults to today)')
        .option('--source <source>', 'Source reference (e.g. meeting file)')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--json', 'Output as JSON')
        .action(async (text, opts) => {
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
        // Validate direction
        if (opts.direction !== 'i_owe_them' &&
            opts.direction !== 'they_owe_me') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
                }));
            }
            else {
                error(`Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`);
            }
            process.exit(1);
        }
        const direction = opts.direction;
        // Derive person name from slug if not provided
        const personName = opts.personName ??
            opts.person
                .split('-')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        // Parse date
        const date = opts.date ? new Date(opts.date) : undefined;
        if (date && Number.isNaN(date.getTime())) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Invalid date: "${opts.date}"` }));
            }
            else {
                error(`Invalid date: "${opts.date}"`);
            }
            process.exit(1);
        }
        let result;
        try {
            result = await services.commitments.create(text, opts.person, personName, direction, {
                goalSlug: opts.goal,
                area: opts.area,
                date,
                source: opts.source,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create commitment';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Refresh QMD index
        let qmdResult;
        if (!opts.skipQmd) {
            const config = await loadConfig(services.storage, root);
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                commitment: {
                    id: result.commitment.id,
                    idShort: result.commitment.id.slice(0, 8),
                    text: result.commitment.text,
                    direction: result.commitment.direction,
                    personSlug: result.commitment.personSlug,
                    personName: result.commitment.personName,
                    date: result.commitment.date,
                    status: result.commitment.status,
                },
                ...(result.task
                    ? { task: { id: result.task.id, destination: result.task.destination } }
                    : {}),
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
            return;
        }
        success('Commitment created.');
        listItem('Text', result.commitment.text);
        listItem('Person', personName);
        listItem('Direction', direction === 'i_owe_them' ? 'I owe them' : 'They owe me');
        listItem('ID', result.commitment.id.slice(0, 8));
        if (result.task) {
            listItem('Task', `${result.task.id} → ${result.task.destination}`);
        }
        displayQmdResult(qmdResult);
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete commitments resolve <id>
    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // arete commitments backfill-area  (phase-8-followup-8 AC3)
    // ---------------------------------------------------------------------------
    commitmentsCmd
        .command('backfill-area')
        .description('Backfill `area` on commitments missing it by inferring from source meeting. Default is preview (dry-run); pass --apply to write.')
        .option('--apply', 'Write changes (default: preview-only dry-run)')
        .option('--reset', 'Clear `area` ONLY on commitments where areaSetBy="backfill" provenance marker is present; leaves Path A / Path B / manual areas intact')
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
        // --reset path: clear backfill-marked areas only.
        if (opts.reset) {
            const result = await services.commitments.resetBackfilledAreas();
            if (opts.json) {
                console.log(JSON.stringify({ success: true, reset: result.reset }));
            }
            else {
                success(`Cleared area on ${result.reset} backfilled commitment(s).`);
                if (result.reset === 0) {
                    info('No commitments carried the backfill provenance marker. Nothing to reset.');
                }
            }
            return;
        }
        // Default + --apply path: resolve area per source meeting, propose, optionally write.
        const { join } = await import('node:path');
        const { parse: parseYaml } = await import('yaml');
        // Resolver closure — same precedence as AC2:
        //   1. meeting frontmatter `area:` (explicit signal)
        //   2. AreaParserService.suggestAreaForMeeting at ≥0.7 confidence
        const meetingsDir = join(root, 'resources', 'meetings');
        const resolveArea = async (source) => {
            const meetingPath = join(meetingsDir, source);
            const content = await services.storage.read(meetingPath);
            if (!content)
                return null;
            // Parse YAML frontmatter
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
            if (!fmMatch)
                return null;
            let frontmatter;
            try {
                frontmatter = parseYaml(fmMatch[1] ?? '');
            }
            catch {
                return null;
            }
            const body = fmMatch[2] ?? '';
            if (typeof frontmatter.area === 'string' && frontmatter.area.trim().length > 0) {
                return frontmatter.area;
            }
            if (typeof frontmatter.title !== 'string')
                return null;
            try {
                const match = await services.areaParser.suggestAreaForMeeting({
                    title: String(frontmatter.title),
                    summary: typeof frontmatter.summary === 'string' ? frontmatter.summary : undefined,
                    transcript: body,
                });
                if (match && match.confidence >= 0.7)
                    return match.areaSlug;
            }
            catch {
                // Inference failure non-fatal.
            }
            return null;
        };
        let report;
        try {
            report = await services.commitments.backfillArea(resolveArea, { apply: Boolean(opts.apply) });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to run backfill';
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                applied: report.applied,
                candidates: report.candidates,
                matched: report.matched,
                proposals: report.proposals,
            }, null, 2));
            return;
        }
        const mode = report.applied ? 'APPLIED' : 'PREVIEW (dry-run)';
        info(`Backfill: ${mode}`);
        listItem('Candidates (area=null)', String(report.candidates));
        listItem('Matched (proposed)', String(report.matched));
        if (report.matched > 0) {
            console.log('');
            console.log(chalk.bold('Proposed updates:'));
            for (const p of report.proposals) {
                console.log(`  ${chalk.dim(p.id.slice(0, 8))}  ${chalk.cyan(p.area)}  ${chalk.dim('←')} ${p.source}`);
            }
            console.log('');
            if (!report.applied) {
                info('Re-run with --apply to write changes.');
                info('Use `arete commitments backfill-area --reset` to undo backfill-set areas later.');
            }
            else {
                success(`Applied area to ${report.matched} commitment(s); stamped areaSetBy: 'backfill' provenance.`);
            }
        }
        else if (report.candidates === 0) {
            info('No area-null commitments. Nothing to backfill.');
        }
        else {
            info('No matches found at the 0.7 confidence threshold. Commitments unchanged.');
        }
    });
    // ---------------------------------------------------------------------------
    // arete commitments restore --from <path>  (phase-10a-pre AC0/AC1d)
    // ---------------------------------------------------------------------------
    commitmentsCmd
        .command('restore')
        .description('Restore .arete/commitments.json from a snapshot JSON file. Idempotent; writes a pre-restore snapshot to .arete/commitments.pre-restore-<ts>.json before overwriting (M6 mitigation).')
        .requiredOption('--from <path>', 'Path to snapshot JSON (absolute or relative to workspace root)')
        .option('--yes', 'Skip confirmation prompt')
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
        // Resolve the source path. Absolute paths are used as-is; relative
        // paths are anchored to the workspace root so users can pass
        // `.arete/commitments.pre-phase-10.json` without a leading ./.
        //
        // Path-handling policy (LOW-3 / 10a-pre code review): we accept ANY
        // absolute path the caller can supply, including paths outside the
        // workspace. The CLI runs with the workspace owner's privileges and
        // delegates read permission enforcement to the OS — there is no
        // explicit out-of-workspace rejection. `resolvePath` normalizes
        // for nicer error messages, not for security. Threat model: the
        // workspace owner is trusted; this CLI does not defend against
        // them reading their own files.
        const sourcePath = isAbsolute(opts.from)
            ? resolvePath(opts.from)
            : resolvePath(root, opts.from);
        // Read source snapshot
        const sourceContent = await services.storage.read(sourcePath);
        if (sourceContent === null) {
            const msg = `Snapshot file not found: ${sourcePath}`;
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Validate JSON shape — must parse and look like CommitmentsFile.
        // We accept anything with a `commitments` array; deeper schema
        // validation lives in CommitmentsService.load().
        let parsed;
        try {
            parsed = JSON.parse(sourceContent);
        }
        catch (err) {
            const msg = `Snapshot is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        if (!Array.isArray(parsed.commitments)) {
            const msg = 'Snapshot JSON does not match commitments file shape (missing or non-array `commitments` field)';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        const incomingCount = parsed.commitments.length;
        // Compute target + pre-restore snapshot paths
        const targetPath = join(root, '.arete/commitments.json');
        const currentContent = await services.storage.read(targetPath);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const preRestorePath = join(root, `.arete/commitments.pre-restore-${ts}.json`);
        // Confirmation prompt (unless --yes or --json)
        if (!opts.yes && !opts.json) {
            const { confirm } = await import('@inquirer/prompts');
            const currentCount = currentContent
                ? (() => {
                    try {
                        const cur = JSON.parse(currentContent);
                        return Array.isArray(cur.commitments) ? cur.commitments.length : 0;
                    }
                    catch {
                        return 0;
                    }
                })()
                : 0;
            console.log('');
            console.log(`  ${chalk.bold('From:')}    ${sourcePath}`);
            console.log(`  ${chalk.bold('To:')}      ${targetPath}`);
            console.log(`  ${chalk.bold('Current:')} ${currentCount} commitment(s)`);
            console.log(`  ${chalk.bold('Incoming:')} ${incomingCount} commitment(s)`);
            console.log(`  ${chalk.bold('Backup:')}  ${preRestorePath} (written before overwrite)`);
            console.log('');
            const confirmed = await confirm({
                message: 'Restore will REPLACE current commitments.json. Any commitments added since the snapshot will be lost. Continue?',
                default: false,
            });
            if (!confirmed) {
                info('Aborted.');
                process.exit(0);
            }
        }
        // Write pre-restore snapshot (best-effort; only if there's a current file)
        if (currentContent !== null) {
            try {
                await services.storage.write(preRestorePath, currentContent);
            }
            catch (err) {
                const msg = `Failed to write pre-restore snapshot: ${err instanceof Error ? err.message : String(err)}`;
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: msg }));
                }
                else {
                    error(msg);
                }
                process.exit(1);
            }
        }
        // Restore: write source content verbatim. Byte-equal round-trip is
        // the AC. We intentionally do NOT re-serialize via load/save
        // (which would apply pruning + key-order normalization) — restore
        // means restore.
        try {
            await services.storage.write(targetPath, sourceContent);
        }
        catch (err) {
            const msg = `Failed to write commitments.json: ${err instanceof Error ? err.message : String(err)}`;
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                restored: incomingCount,
                from: sourcePath,
                to: targetPath,
                preRestoreSnapshot: currentContent !== null ? preRestorePath : null,
            }, null, 2));
            return;
        }
        success(`Restored ${incomingCount} commitment(s) from snapshot.`);
        listItem('From', sourcePath);
        listItem('To', targetPath);
        if (currentContent !== null) {
            listItem('Pre-restore snapshot', preRestorePath);
        }
        else {
            info('No prior commitments.json — pre-restore snapshot skipped.');
        }
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete commitments migrate --to-v2 [--dry-run] [--apply]  (phase-10a Step 4 + 6)
    //
    // Dry-run is the default. `--apply` is wired but gated:
    //   - 24h quiet-window guard (AC1h): refuse if commitments.json mtime
    //     is within last 24h, unless --force-after-triage is passed.
    //   - Ambiguous rows present: refuse until user disambiguates via
    //     `.arete/commitments.pre-phase-10-ambiguities.json` sidecar (AC1e).
    //   - Atomic write via tmp + rename (AC1f partial-failure recovery).
    //
    // **This build does NOT touch production data.** All writes (both
    // --dry-run diff output AND the AC1f --apply path) are exercised
    // only against synthetic fixtures in tests. Real --apply against
    // arete-reserv happens in the user's AM after they review the
    // dry-run output — explicit out-of-scope per phase-10a brief.
    // ---------------------------------------------------------------------------
    commitmentsCmd
        .command('migrate')
        .description('Migrate commitments.json from v1 (personSlug + counterparty hash) to v2 (stakeholders[] + text+direction hash). Dry-run by default; --apply writes after the 24h quiet-window guard passes.')
        .requiredOption('--to-v2', 'Migrate to v2 shape (only supported direction in Phase 10a)')
        .option('--dry-run', 'Default — produce migration-diff.md without writing commitments.json')
        .option('--apply', 'Write the migrated commitments.json after the quiet-window guard passes')
        .option('--force-after-triage', 'Bypass the 24h quiet-window guard. Use ONLY when you understand the delta-diff (AC1g/AC1h).')
        .option('--owner-slug <slug>', 'Workspace owner slug (used to repair owner-as-personSlug rows). Required.')
        .option('--diff-dir <path>', 'Directory to write the migration-diff.md audit artifact (default: dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator)')
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
        if (!opts.ownerSlug) {
            const msg = '--owner-slug <slug> is required (e.g., "john-koht"). Used to repair owner-as-personSlug rows.';
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Default mode: dry-run unless --apply explicitly set.
        const mode = opts.apply ? 'apply' : 'dry-run';
        // Load v1 commitments.
        const commitmentsPath = join(root, '.arete/commitments.json');
        const raw = await services.storage.read(commitmentsPath);
        const commitments = parseCommitmentsFile(raw);
        if (commitments.length === 0) {
            const msg = 'No commitments found — nothing to migrate.';
            if (opts.json) {
                console.log(JSON.stringify({ success: true, migrated: 0, mode }));
            }
            else {
                info(msg);
            }
            return;
        }
        // Build person directory from people/ for the parser.
        const paths = services.workspace.getPaths(root);
        const people = await services.entity.listPeople(paths);
        const directory = buildPersonDirectory(people.map((p) => ({ slug: p.slug, name: p.name })));
        // Load sidecar disambiguations (optional).
        const sidecarPath = join(root, '.arete/commitments.pre-phase-10-ambiguities.json');
        const sidecarRaw = await services.storage.read(sidecarPath);
        let disambiguations = new Map();
        if (sidecarRaw !== null) {
            try {
                const parsed = JSON.parse(sidecarRaw);
                const m = new Map();
                for (const d of parsed.disambiguations ?? []) {
                    if (d.commitmentId && d.name && d.slug) {
                        m.set(`${d.commitmentId}::${d.name.toLowerCase()}`, d.slug);
                    }
                }
                disambiguations = m;
            }
            catch {
                // Surface the malformed sidecar so the user fixes it before
                // we proceed — don't silently ignore.
                const msg = `Malformed sidecar at ${sidecarPath}; expected {"disambiguations":[{"commitmentId":"...","name":"...","slug":"..."}]}`;
                if (opts.json)
                    console.log(JSON.stringify({ success: false, error: msg }));
                else
                    error(msg);
                process.exit(1);
            }
        }
        // Run the engine.
        const result = migrateCommitmentsToV2({
            commitments,
            ownerSlug: opts.ownerSlug,
            directory,
            disambiguations,
        });
        // Write the diff report.
        const ts = new Date().toISOString();
        const dateStamp = ts.slice(0, 10); // YYYY-MM-DD
        const diffDir = opts.diffDir ??
            join(root, 'dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator');
        const diffPath = join(diffDir, `migration-diff-${dateStamp}.md`);
        const md = formatMigrationDiff(result, {
            workspaceRoot: root,
            ownerSlug: opts.ownerSlug,
            timestamp: ts,
            mode,
        });
        try {
            await services.storage.write(diffPath, md);
        }
        catch (err) {
            const msg = `Failed to write migration-diff.md: ${err instanceof Error ? err.message : String(err)}`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // ----- Dry-run path: stop here.
        if (mode === 'dry-run') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: true,
                    mode,
                    summary: result.summary,
                    diffPath,
                    migrated: result.migrated.length,
                }, null, 2));
                return;
            }
            success(`Dry-run complete: ${result.summary.totalIn} → ${result.summary.totalOut} commitments`);
            listItem('Diff report', diffPath);
            listItem('Summary', `pass=${result.summary.passThrough} collapsed=${result.summary.collapsed} self-rewrite=${result.summary.selfRewrite} status-conflict=${result.summary.statusConflict} ambiguous=${result.summary.ambiguous}`);
            if (result.summary.ambiguous > 0) {
                console.log('');
                info(`${result.summary.ambiguous} ambiguous row(s) require disambiguation BEFORE --apply.`);
                info(`Edit ${join(root, '.arete/commitments.pre-phase-10-ambiguities.json')} to specify the chosen slug per row.`);
            }
            console.log('');
            info('To apply: rerun with --apply (24h quiet-window guard applies).');
            return;
        }
        // ----- Apply path: AC1h 24h quiet-window guard.
        if (raw !== null) {
            const mtime = await services.storage.getModified(commitmentsPath);
            if (mtime) {
                const ageMs = Date.now() - mtime.getTime();
                const ageHours = ageMs / (1000 * 60 * 60);
                if (ageHours < 24 && !opts.forceAfterTriage) {
                    const msg = `commitments.json modified ${ageHours.toFixed(1)} hours ago — wait 24h after the last manual triage for the diff to stabilize, or pass --force-after-triage to override (with delta-diff re-confirm).`;
                    if (opts.json)
                        console.log(JSON.stringify({ success: false, error: msg }));
                    else
                        error(msg);
                    process.exit(1);
                }
            }
        }
        // Ambiguous rows block apply (AC1e).
        if (result.summary.ambiguous > 0) {
            const msg = `${result.summary.ambiguous} ambiguous row(s) block --apply. Disambiguate via ${join(root, '.arete/commitments.pre-phase-10-ambiguities.json')}.`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Pre-migration snapshot (AC1d reversibility anchor).
        const snapshotPath = join(root, '.arete/commitments.pre-phase-10.json');
        if (raw !== null) {
            try {
                await services.storage.write(snapshotPath, raw);
            }
            catch (err) {
                const msg = `Failed to write pre-migration snapshot: ${err instanceof Error ? err.message : String(err)}`;
                if (opts.json)
                    console.log(JSON.stringify({ success: false, error: msg }));
                else
                    error(msg);
                process.exit(1);
            }
        }
        // Atomic write via tmp + rename (AC1f partial-failure recovery).
        // We rely on storage.write — for the file adapter this maps to a
        // single fs.writeFile call. Truly-atomic rename requires posix
        // semantics; future work to wrap in a tmp-then-rename helper at
        // the storage layer. For 10a we rely on the snapshot as the
        // recovery anchor.
        const migratedJson = serializeCommitmentsFile(result.migrated);
        try {
            await services.storage.write(commitmentsPath, migratedJson);
        }
        catch (err) {
            const msg = `Failed to write commitments.json: ${err instanceof Error ? err.message : String(err)}. Pre-migration snapshot at ${snapshotPath} is the recovery anchor; run \`arete commitments restore --from ${snapshotPath}\` to roll back.`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                mode,
                summary: result.summary,
                diffPath,
                snapshotPath,
                migrated: result.migrated.length,
            }, null, 2));
            return;
        }
        success(`Applied migration: ${result.summary.totalIn} → ${result.summary.totalOut} commitments`);
        listItem('Diff report', diffPath);
        listItem('Pre-migration snapshot', snapshotPath);
        listItem('Summary', `pass=${result.summary.passThrough} collapsed=${result.summary.collapsed} self-rewrite=${result.summary.selfRewrite} status-conflict=${result.summary.statusConflict}`);
        console.log('');
        info(`To roll back: \`arete commitments restore --from ${snapshotPath}\``);
        console.log('');
    });
    commitmentsCmd
        .command('resolve <id>')
        .description('Resolve or drop a commitment by ID (8-char prefix or full 64-char hash)')
        .option('--status <status>', 'Resolution status: resolved or dropped (default: resolved)')
        .option('--yes', 'Skip confirmation prompt')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--json', 'Output as JSON')
        .action(async (id, opts) => {
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
        const config = await loadConfig(services.storage, root);
        // Validate status
        const status = (opts.status ?? 'resolved');
        if (status !== 'resolved' && status !== 'dropped') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Invalid status: "${opts.status}". Must be resolved or dropped`,
                }));
            }
            else {
                error(`Invalid status: "${opts.status}". Must be resolved or dropped`);
            }
            process.exit(1);
        }
        // Look up the commitment to show details in confirmation prompt
        let targetCommitment;
        try {
            const open = await services.commitments.listOpen();
            targetCommitment = open.find((c) => c.id === id || c.id.startsWith(id));
        }
        catch {
            // Non-critical — resolve() will produce its own error if needed
        }
        // Confirmation prompt (unless --yes or --json)
        if (!opts.yes && !opts.json) {
            const { confirm } = await import('@inquirer/prompts');
            if (targetCommitment) {
                console.log('');
                console.log(`  ${chalk.bold('Commitment:')} ${targetCommitment.text}`);
                console.log(`  ${chalk.bold('Person:')}     ${targetCommitment.personName}`);
                console.log(`  ${chalk.bold('Direction:')}  ${targetCommitment.direction === 'i_owe_them'
                    ? 'I owe them'
                    : 'They owe me'}`);
                console.log('');
            }
            const confirmed = await confirm({
                message: `Mark as ${status}?`,
                default: false,
            });
            if (!confirmed) {
                info('Aborted.');
                process.exit(0);
            }
        }
        // Resolve the commitment
        let resolved;
        try {
            resolved = await services.commitments.resolve(id, status);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to resolve commitment';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Refresh QMD index
        let qmdResult;
        if (!opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                resolved: {
                    id: resolved.id,
                    text: resolved.text,
                    personName: resolved.personName,
                    direction: resolved.direction,
                    resolvedAt: resolved.resolvedAt,
                    status: resolved.status,
                },
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
            return;
        }
        success(`Commitment marked as ${status}.`);
        listItem('Text', resolved.text);
        listItem('Person', resolved.personName);
        displayQmdResult(qmdResult);
        console.log('');
    });
}
//# sourceMappingURL=commitments.js.map