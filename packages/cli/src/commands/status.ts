/**
 * arete status — workspace health and intelligence overview
 */

import {
  createServices,
  loadConfig,
  getAdapterFromConfig,
  detectCrossPersonPatterns,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { header, listItem, section, error, info, formatPath } from '../formatters.js';
import { countInboxItems } from '../lib/inbox-count.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSkillsList(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .filter((d) => !d.name.startsWith('_'))
    .map((d) => d.name);
}

interface IntegrationInfo {
  name: string;
  status: string;
  type?: string;
  error?: string;
}

function getIntegrationStatus(configsDir: string): IntegrationInfo[] {
  if (!existsSync(configsDir)) return [];
  const integrations: IntegrationInfo[] = [];
  const files = readdirSync(configsDir).filter((f) => f.endsWith('.yaml'));

  for (const file of files) {
    try {
      const content = readFileSync(join(configsDir, file), 'utf8');
      const config = parseYaml(content) as Record<string, string>;
      integrations.push({
        name: config.name || file.replace('.yaml', ''),
        status: config.status || 'inactive',
        type: config.type || 'unknown',
      });
    } catch (err) {
      integrations.push({
        name: file.replace('.yaml', ''),
        status: 'error',
        error: (err as Error).message,
      });
    }
  }
  return integrations;
}

/**
 * Count .md files in a directory (non-recursive, immediate children only).
 */
function countMdFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

/**
 * Count .md files in all immediate subdirectories of a directory.
 */
function countMdFilesInSubdirs(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    let total = 0;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        total += countMdFiles(join(dir, e.name));
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Count meeting files by status: synced vs total.
 */
function countMeetingsByStatus(meetingsDir: string): { total: number; unprocessed: number } {
  if (!existsSync(meetingsDir)) return { total: 0, unprocessed: 0 };
  try {
    const files = readdirSync(meetingsDir).filter((f) => f.endsWith('.md'));
    let unprocessed = 0;
    for (const file of files) {
      const content = readFileSync(join(meetingsDir, file), 'utf8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        try {
          const data = parseYaml(match[1]) as Record<string, unknown>;
          if (data['status'] === 'synced') unprocessed++;
        } catch { /* ignore */ }
      }
    }
    return { total: files.length, unprocessed };
  } catch {
    return { total: 0, unprocessed: 0 };
  }
}

/**
 * Count entries in a memory items file (lines starting with -).
 */
function countMemoryItems(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.split('\n').filter((l) => l.trim().startsWith('-')).length;
  } catch {
    return 0;
  }
}

/**
 * Count active projects (subdirs of projects/active/).
 */
function countActiveProjects(projectsDir: string): number {
  if (!existsSync(projectsDir)) return 0;
  try {
    return readdirSync(projectsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show workspace health and intelligence overview')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();

      if (!root) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Not in an Areté workspace',
              hint: 'Run "arete install" to create a workspace',
            }),
          );
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace');
        }
        process.exit(1);
      }

      const status = await services.workspace.getStatus(root);
      const basePaths = services.workspace.getPaths(root);
      const config = await loadConfig(services.storage, root);
      const adapter = getAdapterFromConfig(config, root);
      const integrationsConfigsDir = join(
        root,
        adapter.integrationsDir(),
        'configs',
      );

      const skillsList = getSkillsList(basePaths.agentSkills);
      const integrations = getIntegrationStatus(integrationsConfigsDir);

      // ── Stats gathering ──────────────────────────────────────────────────
      const internalPeopleCount = countMdFiles(join(root, 'people', 'internal'));
      const customerPeopleCount = countMdFiles(join(root, 'people', 'customers'));
      const userPeopleCount = countMdFiles(join(root, 'people', 'users'));
      const totalPeopleCount = internalPeopleCount + customerPeopleCount + userPeopleCount;

      const meetingsDir = join(root, 'resources', 'meetings');
      const meetings = countMeetingsByStatus(meetingsDir);

      const openCommitments = await services.commitments.listOpen();
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const overdueCount = openCommitments.filter((c) => {
        const d = new Date(c.date);
        return !Number.isNaN(d.getTime()) && c.date.slice(0, 10) <= todayStr;
      }).length;

      const activeProjectsCount = countActiveProjects(join(root, 'projects', 'active'));
      const inbox = countInboxItems(join(root, 'inbox'));

      const memoryItemsDir = join(root, '.arete', 'memory', 'items');
      const decisionsCount = countMemoryItems(join(memoryItemsDir, 'decisions.md'));
      const learningsCount = countMemoryItems(join(memoryItemsDir, 'learnings.md'));

      // Area memory staleness (best-effort)
      let areaMemoryStale = 0;
      let areaMemoryTotal = 0;
      try {
        const areaStatuses = await services.areaMemory.listAreaMemoryStatus(basePaths);
        areaMemoryTotal = areaStatuses.length;
        areaMemoryStale = areaStatuses.filter(s => s.stale).length;
      } catch { /* non-critical */ }

      // Pattern detection (best-effort, don't fail status if it errors)
      let patternCount = 0;
      try {
        const patterns = await detectCrossPersonPatterns(meetingsDir, services.storage, {
          days: 30,
        });
        patternCount = patterns.length;
      } catch { /* non-critical */ }

      const directories = {
        context: existsSync(basePaths.context),
        memory: existsSync(basePaths.memory),
        projects: existsSync(basePaths.projects),
        people: existsSync(basePaths.people),
        resources: existsSync(basePaths.resources),
      };

      const payload = {
        success: true,
        workspace: {
          path: root,
          version: status.version,
          ide: config.ide_target ?? status.ideTarget ?? 'cursor',
        },
        people: {
          total: totalPeopleCount,
          internal: internalPeopleCount,
          customers: customerPeopleCount,
          users: userPeopleCount,
        },
        meetings: {
          total: meetings.total,
          unprocessed: meetings.unprocessed,
        },
        commitments: {
          open: openCommitments.length,
          overdue: overdueCount,
        },
        inbox: {
          unprocessed: inbox.unprocessed,
          needsReview: inbox.needsReview,
        },
        projects: { active: activeProjectsCount },
        memory: {
          decisions: decisionsCount,
          learnings: learningsCount,
          areaMemory: { total: areaMemoryTotal, stale: areaMemoryStale },
        },
        intelligence: {
          patterns: patternCount,
        },
        skills: { list: skillsList, count: skillsList.length },
        integrations,
        directories,
      };

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      // ── Human-readable output ────────────────────────────────────────────
      header('Areté Workspace Status');
      listItem('Workspace', formatPath(root));
      listItem('Version', status.version ?? 'unknown');
      listItem('IDE', payload.workspace.ide);
      console.log('');

      // Intelligence stats
      section('Intelligence Overview');
      console.log(
        `  ${chalk.dim('🗂  People:')}  ${chalk.bold(String(totalPeopleCount))} ${chalk.dim(`(${internalPeopleCount} internal, ${customerPeopleCount} customers, ${userPeopleCount} users)`)}`,
      );
      const meetingBadge =
        meetings.unprocessed > 0
          ? chalk.yellow(` (${meetings.unprocessed} unprocessed)`)
          : '';
      console.log(
        `  ${chalk.dim('📅 Meetings:')} ${chalk.bold(String(meetings.total))} total${meetingBadge}`,
      );
      const commitmentBadge =
        overdueCount > 0
          ? chalk.red(` (${overdueCount} overdue)`)
          : '';
      console.log(
        `  ${chalk.dim('✅ Commitments:')} ${chalk.bold(String(openCommitments.length))} open${commitmentBadge}`,
      );
      console.log(
        `  ${chalk.dim('📋 Active Projects:')} ${chalk.bold(String(activeProjectsCount))}`,
      );
      if (inbox.unprocessed > 0 || inbox.needsReview > 0) {
        const parts: string[] = [];
        if (inbox.unprocessed > 0) parts.push(`${inbox.unprocessed} unprocessed`);
        if (inbox.needsReview > 0) parts.push(`${inbox.needsReview} needs review`);
        console.log(
          `  ${chalk.dim('📥 Inbox:')} ${chalk.yellow(parts.join(', '))}`,
        );
      }
      console.log(
        `  ${chalk.dim('🧠 Memory:')} ${chalk.bold(String(decisionsCount))} decisions, ${chalk.bold(String(learningsCount))} learnings`,
      );
      if (areaMemoryTotal > 0) {
        const staleBadge = areaMemoryStale > 0
          ? chalk.yellow(` (${areaMemoryStale} stale)`)
          : chalk.green(' (all fresh)');
        console.log(
          `  ${chalk.dim('📦 Area Memory:')} ${chalk.bold(String(areaMemoryTotal))} areas${staleBadge}`,
        );
      } else {
        console.log(
          `  ${chalk.dim('📦 Area Memory:')} ${chalk.dim('none — run `arete memory refresh`')}`,
        );
      }
      console.log(
        `  ${chalk.dim('⚡ Intelligence:')} Patterns detected in last 30 days: ${chalk.bold(String(patternCount))}`,
      );
      console.log('');

      section('Skills');
      listItem('Skills', payload.skills.count.toString());
      if (payload.skills.count > 0) {
        console.log('');
        console.log(chalk.dim('  Available skills:'));
        for (const skill of payload.skills.list.sort()) {
          console.log(`    ${chalk.dim('•')} ${skill}`);
        }
      }

      section('Integrations');
      if (integrations.length === 0) {
        console.log(chalk.dim('  No integrations configured'));
        console.log(chalk.dim('  Run "arete integration configure <name>" to configure one'));
      } else {
        for (const int of integrations) {
          const statusColor =
            int.status === 'active'
              ? chalk.green
              : int.status === 'error'
                ? chalk.red
                : chalk.dim;
          console.log(
            `  ${chalk.dim('•')} ${int.name}: ${statusColor(int.status)}`,
          );
        }
      }

      section('Workspace Directories');
      for (const [name, exists] of Object.entries(directories)) {
        const icon = exists ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${name}/`);
      }
      console.log('');

      // Recommendations
      if (areaMemoryStale > 0) {
        console.log(chalk.yellow(`  Run \`arete memory refresh\` to update ${areaMemoryStale} stale area memory file(s).`));
      }
      console.log(chalk.dim('  Run `arete daily` for your morning brief.'));
      console.log(chalk.dim('  Run `arete momentum` for commitment and relationship momentum.'));
      console.log('');
    });
}
