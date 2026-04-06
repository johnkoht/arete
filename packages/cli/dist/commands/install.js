/**
 * arete install [directory] — initialize a new Areté workspace
 */
import { createServices, isAreteWorkspace, parseSourceType, getSourcePaths, getPackageRoot, getAdapter, ensureQmdCollections, } from '@arete/core';
import { join, resolve } from 'path';
import chalk from 'chalk';
import { success, error, warn, info, header, listItem, formatPath, } from '../formatters.js';
export function registerInstallCommand(program) {
    program
        .command('install [directory]')
        .description('Initialize a new Areté workspace')
        .option('--source <source>', 'Installation source: npm, symlink, or local:/path', 'npm')
        .option('--ide <target>', 'Target IDE: cursor or claude', 'cursor')
        .option('--skip-qmd', 'Skip automatic qmd collection setup')
        .option('--json', 'Output as JSON')
        .action(async (directory, opts) => {
        const targetDir = resolve(directory || '.');
        const source = opts.source ?? 'npm';
        const ide = (opts.ide ?? 'cursor');
        if (ide !== 'cursor' && ide !== 'claude') {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Invalid IDE target: ${ide}. Must be 'cursor' or 'claude'`,
                }));
            }
            else {
                error(`Invalid IDE target: ${ide}. Must be 'cursor' or 'claude'`);
            }
            process.exit(1);
        }
        if (isAreteWorkspace(targetDir)) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Directory is already an Areté workspace',
                    path: targetDir,
                }));
            }
            else {
                warn(`Directory is already an Areté workspace: ${formatPath(targetDir)}`);
                info('Use "arete update" to pull latest changes');
            }
            process.exit(1);
        }
        let sourceInfo;
        try {
            const packageRoot = getPackageRoot();
            sourceInfo = parseSourceType(source, source === 'symlink' ? packageRoot : undefined);
        }
        catch (err) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: err.message }));
            }
            else {
                error(err.message);
            }
            process.exit(1);
        }
        const services = await createServices(process.cwd());
        const adapter = getAdapter(ide);
        if (!opts.json) {
            header('Installing Areté Workspace');
            console.log(`  Target: ${chalk.cyan(formatPath(targetDir))}`);
            console.log(`  Source: ${chalk.cyan(source)}`);
            console.log('');
        }
        const packageRoot = getPackageRoot();
        const basePaths = getSourcePaths(packageRoot);
        const rulesSubdir = ide === 'cursor' ? 'cursor' : 'claude-code';
        const sourcePaths = {
            root: basePaths.root,
            skills: basePaths.skills,
            tools: basePaths.tools,
            rules: join(basePaths.rules, rulesSubdir),
            integrations: basePaths.integrations,
            templates: basePaths.templates,
            profiles: basePaths.profiles,
            guide: basePaths.guide,
            updates: basePaths.updates,
        };
        const result = await services.workspace.create(targetDir, {
            ideTarget: ide,
            source: source,
            sourcePaths,
        });
        // Auto-setup qmd collections if available (6 scoped collections)
        let qmdResult;
        if (!opts.skipQmd) {
            if (!opts.json) {
                console.log(chalk.dim('  Setting up search index...'));
            }
            qmdResult = await ensureQmdCollections(targetDir);
            // Persist collections to arete.yaml
            if (!qmdResult.skipped && Object.keys(qmdResult.collections).length > 0) {
                // Write qmd_collections (new, scoped)
                await services.workspace.updateManifestField(targetDir, 'qmd_collections', qmdResult.collections);
                // Backward compat: write qmd_collection (singular) as the 'all' collection
                if (qmdResult.collections.all) {
                    await services.workspace.updateManifestField(targetDir, 'qmd_collection', qmdResult.collections.all);
                }
            }
        }
        if (opts.json) {
            // Compute backward-compat 'created' field: true if any scope was created
            const createdAny = qmdResult?.scopes?.some((s) => s.created) ?? false;
            console.log(JSON.stringify({
                success: true,
                path: targetDir,
                source: sourceInfo,
                results: result,
                qmd: qmdResult
                    ? { ...qmdResult, created: createdAny }
                    : { skipped: true, available: false, collections: {}, indexed: false, created: false },
            }, null, 2));
            return;
        }
        console.log('');
        success('Workspace installed successfully!');
        console.log('');
        listItem('Location', formatPath(targetDir));
        listItem('Source', source);
        listItem('Skills installed', result.skills.length.toString());
        listItem('Tools installed', result.tools.length.toString());
        listItem('Rules installed', result.rules.length.toString());
        if (qmdResult && !qmdResult.skipped) {
            const createdCount = qmdResult.scopes.filter((s) => s.created).length;
            const totalCount = Object.keys(qmdResult.collections).length;
            if (createdCount > 0) {
                listItem('Search index', `${createdCount} qmd collection${createdCount > 1 ? 's' : ''} created (${totalCount} total)`);
            }
            else if (qmdResult.indexed && totalCount > 0) {
                listItem('Search index', `${totalCount} qmd collection${totalCount > 1 ? 's' : ''} updated`);
            }
            if (qmdResult.warning) {
                warn(qmdResult.warning);
            }
        }
        else if (qmdResult && qmdResult.skipped) {
            listItem('Search index', chalk.dim('qmd not installed, skipping'));
        }
        else if (!qmdResult) {
            listItem('Search index', chalk.dim('skipped (--skip-qmd)'));
        }
        if (result.errors.length > 0) {
            console.log('');
            warn(`${result.errors.length} errors occurred:`);
            for (const err of result.errors) {
                console.log(`  - ${err.path}: ${err.error}`);
            }
        }
        console.log('');
        console.log(chalk.dim('Next steps:'));
        console.log(`  1. ${chalk.cyan('cd ' + formatPath(targetDir))}`);
        if (ide === 'claude') {
            console.log(`  2. Type ${chalk.cyan('/getting-started')} in Claude Code to begin`);
        }
        else {
            console.log(`  2. ${chalk.cyan('arete onboard')} to set up your profile and integrations`);
            console.log(`  3. Say ${chalk.cyan('"Let\'s get started"')} in chat to continue onboarding`);
        }
        console.log('');
    });
}
//# sourceMappingURL=install.js.map