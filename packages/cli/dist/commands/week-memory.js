/**
 * Week-memory commands — durable interpretive overrides for the current week.
 *
 * Thin CLI wrapper over the core week-memory store
 * (`packages/core/src/services/week-memory.ts`). All parsing, id generation,
 * dedup, and persistence live in core; this layer only handles arg parsing,
 * `--type` validation, and human-vs-`--json` output formatting.
 *
 * Mirrors the structure of `commands/commitments.ts`: obtain the
 * StorageAdapter + workspace root via `createServices`, emit `{ success, ... }`
 * JSON under `--json`, and `process.exit(1)` on errors.
 */
import { createServices, addWeekMemoryEntry, listWeekMemory, resolveWeekMemory, archiveWeekMemory, } from '@arete/core';
import chalk from 'chalk';
import { listItem, error, info, success } from '../formatters.js';
const WEEK_MEMORY_TYPES = [
    'framing-override',
    'deprioritization',
    'week-constraint',
];
/** Shape an entry for JSON output (mirrors commitments idShort convention). */
function entryToJson(e) {
    return {
        id: e.id,
        idShort: e.id.slice(0, 8),
        type: e.type,
        statement: e.statement,
        why: e.why,
        ...(e.suppresses ? { suppresses: e.suppresses } : {}),
        status: e.status,
        created: e.created,
        week: e.week,
    };
}
export function registerWeekMemoryCommand(program) {
    const weekMemoryCmd = program
        .command('week-memory')
        .description('Manage interpretive overrides for the current week');
    // ---------------------------------------------------------------------------
    // arete week-memory add
    // ---------------------------------------------------------------------------
    weekMemoryCmd
        .command('add')
        .description('Add a week-memory entry (interpretive override)')
        .requiredOption('--type <type>', `Entry type: ${WEEK_MEMORY_TYPES.join(', ')}`)
        .requiredOption('--statement <statement>', 'What is true now (the corrected interpretation)')
        .requiredOption('--why <why>', "John's correction — the reason")
        .option('--suppresses <target>', 'What daily-plan should NOT surface (commitment id or free text)')
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
        // Validate --type against the three allowed values.
        if (!WEEK_MEMORY_TYPES.includes(opts.type)) {
            const msg = `Invalid type: "${opts.type}". Must be one of: ${WEEK_MEMORY_TYPES.join(', ')}`;
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        let result;
        try {
            result = await addWeekMemoryEntry(services.storage, root, {
                type: opts.type,
                statement: opts.statement,
                why: opts.why,
                suppresses: opts.suppresses,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add week-memory entry';
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
                deduped: result.deduped,
                entry: entryToJson(result.entry),
            }, null, 2));
            return;
        }
        if (result.deduped) {
            info('Identical active entry already exists — no change made.');
        }
        else {
            success('Week-memory entry added.');
        }
        listItem('ID', result.entry.id.slice(0, 8));
        listItem('Type', result.entry.type);
        listItem('Statement', result.entry.statement);
        listItem('Why', result.entry.why);
        if (result.entry.suppresses) {
            listItem('Suppresses', result.entry.suppresses);
        }
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete week-memory list
    // ---------------------------------------------------------------------------
    weekMemoryCmd
        .command('list')
        .description('List week-memory entries')
        .option('--active', 'Show only active entries (excludes resolved)')
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
        let entries;
        try {
            entries = await listWeekMemory(services.storage, root, {
                ...(opts.active ? { active: true } : {}),
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to list week-memory entries';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        if (opts.json) {
            // Empty / absent store returns [] — never errors.
            console.log(JSON.stringify(entries.map(entryToJson), null, 2));
            return;
        }
        if (entries.length === 0) {
            info('No week-memory entries.');
            return;
        }
        console.log('');
        for (const e of entries) {
            const shortId = chalk.dim(e.id.slice(0, 8));
            const typeTag = chalk.cyan(`[${e.type}]`);
            const statusTag = e.status === 'resolved' ? chalk.dim('(resolved)') : '';
            console.log(`  ${shortId}  ${typeTag} ${e.statement} ${statusTag}`.trimEnd());
            console.log(`            ${chalk.dim('why:')} ${e.why}`);
            if (e.suppresses) {
                console.log(`            ${chalk.dim('suppresses:')} ${e.suppresses}`);
            }
        }
        console.log('');
        listItem('Total', String(entries.length));
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete week-memory resolve <id>
    // ---------------------------------------------------------------------------
    weekMemoryCmd
        .command('resolve <id>')
        .description('Resolve a week-memory entry by ID (retires without deleting; 8-char prefix or full id)')
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
        let result;
        try {
            result = await resolveWeekMemory(services.storage, root, id);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to resolve week-memory entry';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        // Unknown id is an error (commitments resolve exits non-zero when the id
        // does not resolve to an entry).
        if (result.outcome === 'unknown') {
            const msg = `No week-memory entry found for id "${id}"`;
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
                outcome: result.outcome,
                entry: result.entry ? entryToJson(result.entry) : null,
            }, null, 2));
            return;
        }
        if (result.outcome === 'already') {
            info('Entry was already resolved — no change made.');
        }
        else {
            success('Week-memory entry resolved.');
        }
        if (result.entry) {
            listItem('ID', result.entry.id.slice(0, 8));
            listItem('Statement', result.entry.statement);
        }
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete week-memory archive
    // ---------------------------------------------------------------------------
    weekMemoryCmd
        .command('archive')
        .description('Archive prior-week entries (no-op for the current week or an empty store)')
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
        let result;
        try {
            result = await archiveWeekMemory(services.storage, root);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to archive week-memory';
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
                skipped: result.skipped,
                ...(result.reason ? { reason: result.reason } : {}),
                ...(result.archivePath ? { archivePath: result.archivePath } : {}),
                ...(result.archivedWeek ? { archivedWeek: result.archivedWeek } : {}),
                ...(result.movedCount !== undefined ? { movedCount: result.movedCount } : {}),
            }, null, 2));
            return;
        }
        if (result.skipped) {
            const why = result.reason === 'empty' ? 'empty store' : 'current week';
            info(`Archive skipped (${why}).`);
            console.log('');
            return;
        }
        success(`Archived ${result.movedCount ?? 0} entry(ies) from week ${result.archivedWeek}.`);
        if (result.archivePath) {
            listItem('Archive', result.archivePath);
        }
        console.log('');
    });
}
//# sourceMappingURL=week-memory.js.map