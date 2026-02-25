/**
 * arete seed [source] — import historical data
 */
import { createServices, getPackageRoot } from '@arete/core';
import { existsSync, readdirSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { header, section, listItem, success, error, warn, info } from '../formatters.js';
function copyFileIfNeeded(sourcePath, destinationPath, force) {
    if (!force && existsSync(destinationPath)) {
        return false;
    }
    mkdirSync(join(destinationPath, '..'), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
    return true;
}
function copyDirectoryEntries(sourceDir, destinationDir, force) {
    if (!existsSync(sourceDir)) {
        return 0;
    }
    const entries = readdirSync(sourceDir, { withFileTypes: true });
    let copied = 0;
    for (const entry of entries) {
        const sourcePath = join(sourceDir, entry.name);
        const destinationPath = join(destinationDir, entry.name);
        if (entry.isDirectory()) {
            if (!force && existsSync(destinationPath)) {
                continue;
            }
            cpSync(sourcePath, destinationPath, { recursive: true });
            copied += 1;
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        const wasCopied = copyFileIfNeeded(sourcePath, destinationPath, force);
        if (wasCopied) {
            copied += 1;
        }
    }
    return copied;
}
async function seedFromFixtures(root, force, json) {
    const packageRoot = getPackageRoot();
    const fixtureRoot = join(packageRoot, 'test-data');
    if (!existsSync(fixtureRoot)) {
        if (json) {
            console.log(JSON.stringify({
                success: false,
                error: 'Test-data fixtures are unavailable in this installation.',
            }));
        }
        else {
            error('Test-data fixtures are unavailable in this installation.');
            info('Use a local repository build to run: arete seed test-data');
        }
        process.exit(1);
    }
    const services = await createServices(process.cwd());
    const paths = services.workspace.getPaths(root);
    const stats = {
        meetings: 0,
        people: 0,
        plans: 0,
        projects: 0,
        memory: 0,
        context: 0,
        testScenarios: false,
    };
    const meetingsSource = join(fixtureRoot, 'meetings');
    const meetingsDestination = join(paths.resources, 'meetings');
    if (existsSync(meetingsSource)) {
        mkdirSync(meetingsDestination, { recursive: true });
        const files = readdirSync(meetingsSource).filter((name) => name.endsWith('.md'));
        for (const file of files) {
            const copied = copyFileIfNeeded(join(meetingsSource, file), join(meetingsDestination, file), force);
            if (copied) {
                stats.meetings += 1;
            }
        }
    }
    for (const category of ['internal', 'customers', 'users']) {
        const sourceDir = join(fixtureRoot, 'people', category);
        const destinationDir = join(paths.people, category);
        stats.people += copyDirectoryEntries(sourceDir, destinationDir, force);
    }
    const plansSource = join(fixtureRoot, 'plans');
    if (existsSync(plansSource)) {
        const planFiles = readdirSync(plansSource).filter((name) => name.endsWith('.md'));
        const quarter = planFiles.filter((name) => name.startsWith('quarter-')).sort().reverse()[0];
        const week = planFiles.filter((name) => name.startsWith('week-')).sort().reverse()[0];
        if (quarter) {
            const copied = copyFileIfNeeded(join(plansSource, quarter), join(paths.goals, 'quarter.md'), force);
            if (copied) {
                stats.plans += 1;
            }
        }
        if (week) {
            const copied = copyFileIfNeeded(join(plansSource, week), join(paths.now, 'week.md'), force);
            if (copied) {
                stats.plans += 1;
            }
        }
    }
    const projectsSource = join(fixtureRoot, 'projects');
    const activeProjectsDestination = join(paths.projects, 'active');
    const archiveProjectsDestination = join(paths.projects, 'archive');
    const lifecycleActiveSource = join(projectsSource, 'active');
    const lifecycleArchiveSource = join(projectsSource, 'archive');
    // New lifecycle-aware layout support
    stats.projects += copyDirectoryEntries(lifecycleActiveSource, activeProjectsDestination, force);
    stats.projects += copyDirectoryEntries(lifecycleArchiveSource, archiveProjectsDestination, force);
    // Backward compatibility: legacy flat projects/ entries seed into active/
    if (existsSync(projectsSource)) {
        const legacyEntries = readdirSync(projectsSource, { withFileTypes: true }).filter((entry) => entry.name !== 'active' && entry.name !== 'archive');
        for (const entry of legacyEntries) {
            const sourcePath = join(projectsSource, entry.name);
            const destinationPath = join(activeProjectsDestination, entry.name);
            if (entry.isDirectory()) {
                if (!force && existsSync(destinationPath)) {
                    continue;
                }
                cpSync(sourcePath, destinationPath, { recursive: true });
                stats.projects += 1;
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const copied = copyFileIfNeeded(sourcePath, destinationPath, force);
            if (copied) {
                stats.projects += 1;
            }
        }
    }
    const memorySource = join(fixtureRoot, 'memory', 'items');
    const memoryDestination = join(paths.memory, 'items');
    stats.memory += copyDirectoryEntries(memorySource, memoryDestination, force);
    const contextSource = join(fixtureRoot, 'context');
    if (existsSync(contextSource)) {
        const contextFiles = readdirSync(contextSource).filter((name) => name.endsWith('.md'));
        for (const file of contextFiles) {
            if (file === 'goals-strategy.md') {
                const copied = copyFileIfNeeded(join(contextSource, file), join(paths.goals, 'strategy.md'), force);
                if (copied) {
                    stats.context += 1;
                }
            }
            else {
                const copied = copyFileIfNeeded(join(contextSource, file), join(paths.context, file), force);
                if (copied) {
                    stats.context += 1;
                }
            }
        }
    }
    const scenariosSource = join(fixtureRoot, 'TEST-SCENARIOS.md');
    const scenariosDestination = join(root, 'TEST-SCENARIOS.md');
    if (existsSync(scenariosSource)) {
        const copied = copyFileIfNeeded(scenariosSource, scenariosDestination, force);
        if (copied) {
            stats.testScenarios = true;
        }
    }
    await services.entity.buildPeopleIndex(paths);
    if (json) {
        console.log(JSON.stringify({
            success: true,
            source: 'test-data',
            ...stats,
            message: 'Fixtures seeded. See TEST-SCENARIOS.md in the workspace root.',
        }, null, 2));
        return;
    }
    section('Seed Complete');
    listItem('Meetings', String(stats.meetings));
    listItem('People', String(stats.people));
    listItem('Plans', String(stats.plans));
    listItem('Projects', String(stats.projects));
    listItem('Memory items', String(stats.memory));
    listItem('Context files', String(stats.context));
    listItem('TEST-SCENARIOS.md', stats.testScenarios ? 'copied' : 'skipped');
    console.log('');
    success('Fixture data seeded successfully.');
}
export function registerSeedCommand(program) {
    program
        .command('seed [source]')
        .description('Import data: omit source for integrations, or use "test-data" for dev fixtures')
        .option('--days <n>', 'Number of days to import', parseInt)
        .option('--yes', 'Skip confirmation prompts')
        .option('--force', 'Overwrite existing files when seeding fixtures')
        .option('--json', 'Output as JSON')
        .action(async (source, opts) => {
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
        if (source === 'test-data') {
            await seedFromFixtures(root, opts.force ?? false, opts.json ?? false);
            return;
        }
        const days = opts.days ?? 60;
        if (!opts.json) {
            header('Seed Workspace');
            console.log('Import historical data from connected integrations.');
            console.log('');
        }
        const result = await services.integrations.pull(root, 'fathom', {
            integration: 'fathom',
            days,
        });
        if (opts.json) {
            console.log(JSON.stringify({
                success: result.errors.length === 0,
                integration: 'fathom',
                itemsProcessed: result.itemsProcessed,
                itemsCreated: result.itemsCreated,
                errors: result.errors,
            }, null, 2));
            return;
        }
        if (result.errors.length === 0) {
            section('Seeding Complete');
            success(`${result.itemsCreated} meeting(s) imported from Fathom`);
            console.log('');
            console.log(chalk.dim('Next steps:'));
            console.log(`  • Review: ${chalk.cyan('resources/meetings/')}`);
            console.log(`  • Run: ${chalk.cyan('arete status')}`);
            console.log('');
        }
        else {
            warn('Seeding had errors');
            for (const err of result.errors) {
                error(err);
            }
        }
    });
}
//# sourceMappingURL=seed.js.map