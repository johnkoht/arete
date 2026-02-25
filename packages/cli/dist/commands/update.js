/**
 * arete update — pull latest skills/tools/integrations
 */
import { createServices, getPackageRoot, getSourcePaths, ensureQmdCollection, loadConfig } from '@arete/core';
import { join } from 'node:path';
import { header, listItem, success, error, info, warn } from '../formatters.js';
export function registerUpdateCommand(program) {
    program
        .command('update')
        .description('Pull latest skills/tools/integrations from upstream')
        .option('--check', 'Check for updates without applying')
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
                info('Run "arete install" to create a workspace first');
            }
            process.exit(1);
        }
        // Load config once for ideTarget and qmd_collection
        const config = await loadConfig(services.storage, root);
        const ideTarget = config.ide_target ?? 'cursor';
        const packageRoot = getPackageRoot();
        const basePaths = getSourcePaths(packageRoot);
        const sourcePaths = {
            root: basePaths.root,
            skills: basePaths.skills,
            tools: basePaths.tools,
            rules: join(basePaths.rules, ideTarget === 'claude' ? 'claude-code' : 'cursor'),
            integrations: basePaths.integrations,
            templates: basePaths.templates,
            guide: basePaths.guide,
        };
        const result = await services.workspace.update(root, { sourcePaths });
        // Auto-update qmd index (skip for --check and --skip-qmd)
        let qmdResult;
        if (!opts.check && !opts.skipQmd) {
            const existingCollection = config.qmd_collection;
            qmdResult = await ensureQmdCollection(root, existingCollection);
            if (qmdResult.collectionName && qmdResult.created) {
                // New collection created — persist to arete.yaml
                await services.workspace.updateManifestField(root, 'qmd_collection', qmdResult.collectionName);
            }
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                mode: opts.check ? 'check' : 'update',
                result,
                qmd: qmdResult ?? { skipped: true, available: false, created: false, indexed: false },
            }, null, 2));
            return;
        }
        if (!opts.json) {
            header(opts.check ? 'Checking for Updates' : 'Updating Workspace');
            listItem('Added', result.added.length.toString());
            listItem('Updated', result.updated.length.toString());
            listItem('Preserved', result.preserved.length.toString());
            if (qmdResult && !qmdResult.skipped) {
                if (qmdResult.created) {
                    listItem('Search index', `qmd collection "${qmdResult.collectionName}" created`);
                }
                else if (qmdResult.indexed) {
                    listItem('Search index', 'qmd index updated');
                }
                if (qmdResult.warning) {
                    warn(qmdResult.warning);
                }
            }
            console.log('');
            success('Update complete!');
            console.log('');
        }
    });
}
//# sourceMappingURL=update.js.map