/**
 * Commitments commands — list and resolve open commitments
 */
import { createServices, loadConfig, refreshQmdIndex, } from '@arete/core';
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
        console.log('');
        if (iOweThem.length > 0) {
            console.log(chalk.bold('I owe them'));
            for (const c of iOweThem) {
                const shortId = c.id.slice(0, 8);
                const personName = c.personName.padEnd(20).slice(0, 20);
                const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
                const date = c.date ? chalk.dim(`(${c.date})`) : '';
                console.log(`  ${chalk.dim(shortId)}  ${personName}  ${goalPrefix}${c.text}  ${date}`);
            }
            console.log('');
        }
        if (theyOweMe.length > 0) {
            console.log(chalk.bold('They owe me'));
            for (const c of theyOweMe) {
                const shortId = c.id.slice(0, 8);
                const personName = c.personName.padEnd(20).slice(0, 20);
                const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
                const date = c.date ? chalk.dim(`(${c.date})`) : '';
                console.log(`  ${chalk.dim(shortId)}  ${personName}  ${goalPrefix}${c.text}  ${date}`);
            }
            console.log('');
        }
        listItem('Total', String(commitments.length));
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete commitments resolve <id>
    // ---------------------------------------------------------------------------
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