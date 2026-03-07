/**
 * arete daily — morning intelligence brief
 *
 * Shows: today's meetings, overdue commitments, active projects,
 * recent decisions, and top cross-person signal patterns.
 */
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { createServices, detectCrossPersonPatterns } from '@arete/core';
import { header, section } from '../formatters.js';
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function today() {
    return new Date().toISOString().slice(0, 10);
}
function toDateStr(raw) {
    if (typeof raw !== 'string')
        return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 10);
}
/**
 * Pull today's calendar events by running `arete pull calendar --today --json`.
 * Returns empty array on any error (calendar may not be configured).
 */
function defaultPullCalendar(_workspaceRoot) {
    try {
        const result = spawnSync('arete', ['pull', 'calendar', '--today', '--json'], {
            encoding: 'utf8',
            timeout: 10_000,
        });
        if (result.status !== 0)
            return [];
        const parsed = JSON.parse(result.stdout);
        if (!parsed || typeof parsed !== 'object')
            return [];
        const asObj = parsed;
        const events = Array.isArray(asObj['events']) ? asObj['events'] : [];
        return events;
    }
    catch {
        return [];
    }
}
/**
 * Scan projects/active/ subdirectories, extract title from README.md,
 * and flag projects with no activity in 7+ days as stale.
 */
async function gatherActiveProjects(workspaceRoot, storage) {
    const projectsDir = join(workspaceRoot, 'projects', 'active');
    const dirExists = await storage.exists(projectsDir);
    if (!dirExists)
        return [];
    const subdirs = await storage.listSubdirectories(projectsDir);
    const projects = [];
    const staleThreshold = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const dir of subdirs) {
        const slug = dir.split('/').pop() ?? dir;
        const readmePath = join(dir, 'README.md');
        const readmeContent = await storage.read(readmePath);
        let title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (readmeContent) {
            const h1 = readmeContent.match(/^# (.+)/m);
            if (h1)
                title = h1[1].trim();
        }
        const lastModified = await storage.getModified(readmePath);
        const stale = lastModified
            ? now - lastModified.getTime() > staleThreshold
            : true;
        projects.push({ slug, title, lastModified, stale });
    }
    return projects.sort((a, b) => {
        if (a.stale !== b.stale)
            return a.stale ? 1 : -1;
        const aTime = a.lastModified?.getTime() ?? 0;
        const bTime = b.lastModified?.getTime() ?? 0;
        return bTime - aTime;
    });
}
/**
 * Extract recent decisions (last 7 days) from .arete/memory/items/decisions.md.
 * Returns up to 3 most recent.
 */
async function gatherRecentDecisions(workspaceRoot, storage) {
    const decisionsPath = join(workspaceRoot, '.arete', 'memory', 'items', 'decisions.md');
    const content = await storage.read(decisionsPath);
    if (!content)
        return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const decisions = [];
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('-') && !trimmed.startsWith('*'))
            continue;
        const text = trimmed.replace(/^[-*]\s+/, '');
        if (!text || text.length < 5)
            continue;
        const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})[:\s]/);
        if (dateMatch) {
            const entryDate = new Date(dateMatch[1]);
            if (!Number.isNaN(entryDate.getTime()) && entryDate >= cutoff) {
                decisions.push({ text: text.slice(dateMatch[0].length).trim(), date: dateMatch[1] });
            }
        }
        else {
            decisions.push({ text });
        }
        if (decisions.length >= 3)
            break;
    }
    return decisions.slice(0, 3);
}
/**
 * Filter open commitments to those that are overdue (date <= today).
 */
function filterOverdueCommitments(commitments) {
    const now = new Date();
    const todayStr = today();
    return commitments
        .filter((c) => c.status === 'open')
        .map((c) => {
        const dateStr = toDateStr(c.date) ?? todayStr;
        const itemDate = new Date(dateStr);
        const daysOverdue = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
        return { commitment: c, daysOverdue };
    })
        .filter((item) => item.daysOverdue >= 0)
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
// ---------------------------------------------------------------------------
// Core implementation (injectable for tests)
// ---------------------------------------------------------------------------
export async function runDaily(opts, deps = {}) {
    const { pullCalendarFn = defaultPullCalendar, detectPatternsFn = detectCrossPersonPatterns, } = deps;
    const services = await createServices(process.cwd());
    const root = await services.workspace.findRoot();
    if (!root) {
        if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        }
        else {
            console.error(chalk.red('✗'), 'Not in an Areté workspace');
            console.log(chalk.blue('ℹ'), 'Navigate to your workspace directory and try again.');
        }
        process.exit(1);
    }
    // Gather all data in parallel where possible
    const [meetings, openCommitments, activeProjects, recentDecisions, patterns] = await Promise.all([
        Promise.resolve(pullCalendarFn(root)),
        services.commitments.listOpen(),
        gatherActiveProjects(root, services.storage),
        gatherRecentDecisions(root, services.storage),
        detectPatternsFn(join(root, 'resources', 'meetings'), services.storage, {
            days: 30,
        }),
    ]);
    const overdueCommitments = filterOverdueCommitments(openCommitments);
    const brief = {
        meetings,
        overdueCommitments,
        activeProjects,
        recentDecisions,
        patterns: patterns.slice(0, 3),
        generatedAt: new Date().toISOString(),
    };
    if (opts.json) {
        console.log(JSON.stringify({ success: true, brief }, null, 2));
        return;
    }
    // ── Human-readable output ─────────────────────────────────────────────────
    header('Morning Intelligence Brief');
    console.log(chalk.dim(`  ${new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })}`));
    console.log('');
    // 1. Today's Meetings
    section("📅 Today's Meetings");
    if (brief.meetings.length === 0) {
        console.log(chalk.dim('  No meetings today (or calendar not configured)'));
    }
    else {
        for (const event of brief.meetings) {
            const timeStr = event.start
                ? chalk.dim(new Date(event.start).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                })) + ' '
                : '';
            console.log(`  ${timeStr}${chalk.bold(event.title)}`);
            if (event.attendees && event.attendees.length > 0) {
                console.log(chalk.dim(`    with: ${event.attendees.slice(0, 3).join(', ')}`));
            }
        }
    }
    console.log('');
    // 2. Commitments Due / Overdue
    section('✅ Commitments Due');
    if (brief.overdueCommitments.length === 0) {
        console.log(chalk.dim("  No overdue commitments — you're all caught up!"));
    }
    else {
        for (const { commitment: c, daysOverdue } of brief.overdueCommitments.slice(0, 5)) {
            const overdueBadge = daysOverdue === 0
                ? chalk.yellow('due today')
                : chalk.red(`${daysOverdue}d overdue`);
            const dirStr = c.direction === 'i_owe_them'
                ? chalk.dim('→ ' + c.personName)
                : chalk.dim('← ' + c.personName);
            console.log(`  ${overdueBadge}  ${c.text}`);
            console.log(`          ${dirStr}`);
        }
        if (brief.overdueCommitments.length > 5) {
            console.log(chalk.dim(`  ... and ${brief.overdueCommitments.length - 5} more. Run \`arete commitments list\` to see all.`));
        }
    }
    console.log('');
    // 3. Active Projects
    section('📋 Active Projects');
    if (brief.activeProjects.length === 0) {
        console.log(chalk.dim('  No active projects found in projects/active/'));
    }
    else {
        for (const p of brief.activeProjects.slice(0, 5)) {
            const staleBadge = p.stale ? chalk.yellow(' [stale]') : '';
            const lastActivity = p.lastModified
                ? chalk.dim(` — last activity ${p.lastModified.toLocaleDateString()}`)
                : '';
            console.log(`  ${chalk.bold(p.title)}${staleBadge}${lastActivity}`);
        }
    }
    console.log('');
    // 4. Recent Decisions
    section('🧠 Recent Decisions (last 7 days)');
    if (brief.recentDecisions.length === 0) {
        console.log(chalk.dim('  No recent decisions in memory'));
    }
    else {
        for (const d of brief.recentDecisions) {
            const datePart = d.date ? chalk.dim(` [${d.date}]`) : '';
            console.log(`  ${chalk.dim('•')} ${d.text}${datePart}`);
        }
    }
    console.log('');
    // 5. Signal Patterns
    section('⚡ Signal Patterns');
    if (brief.patterns.length === 0) {
        console.log(chalk.dim('  No cross-person patterns detected in the last 30 days'));
    }
    else {
        for (const p of brief.patterns) {
            const peopleStr = p.people.slice(0, 3).join(', ');
            const morePeople = p.people.length > 3 ? ` +${p.people.length - 3} more` : '';
            console.log(`  ${chalk.bold(p.topic)}`);
            console.log(chalk.dim(`    ${p.mentions} meetings · ${peopleStr}${morePeople} · last ${p.lastSeen}`));
        }
    }
    console.log('');
    // Footer hints
    console.log(chalk.dim('  Run `arete momentum` for commitment and relationship momentum.'));
    console.log(chalk.dim('  Run `arete commitments list` to manage open commitments.'));
    console.log('');
}
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------
export function registerDailyCommand(program, deps = {}) {
    program
        .command('daily')
        .description('Show your morning intelligence brief')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        await runDaily(opts, deps);
    });
}
//# sourceMappingURL=daily.js.map