/**
 * Seed test-data command - copy fixture data into workspace for local dev testing.
 * Dev-only: test-data dir is not in published npm package.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync
} from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { findWorkspaceRoot, getWorkspacePaths, getPackageRoot } from '../core/workspace.js';
import { ensureWorkspaceStructure } from '../core/workspace-structure.js';
import { updateMeetingsIndex } from '../core/meetings.js';
import { updatePeopleIndex } from '../core/people.js';
import { success, error, info, header, section, listItem } from '../core/utils.js';
import { loadConfig, getWorkspaceConfigPath } from '../core/config.js';
import type { CommandOptions } from '../types.js';

export interface SeedTestDataOptions extends CommandOptions {
  force?: boolean;
  yes?: boolean;
}

const TEST_DATA_DIR = 'test-data';
const MEETING_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseMeetingFrontmatter(content: string): { title?: string; date?: string } | null {
  const match = content.match(MEETING_FRONTMATTER_REGEX);
  if (!match) return null;
  try {
    const fm = parseYaml(match[1]) as Record<string, unknown>;
    return {
      title: typeof fm.title === 'string' ? fm.title : undefined,
      date: typeof fm.date === 'string' ? fm.date : undefined
    };
  } catch {
    return null;
  }
}

function copyDir(
  srcDir: string,
  destDir: string,
  destPrefix: string,
  force: boolean
): string[] {
  const copied: string[] = [];
  if (!existsSync(srcDir)) return copied;

  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = join(srcDir, ent.name);
    const relPath = join(destPrefix, ent.name);
    const destPath = join(destDir, relPath);

    if (ent.isDirectory()) {
      const sub = copyDir(srcPath, destDir, relPath, force);
      copied.push(...sub);
    } else if (ent.isFile()) {
      if (!force && existsSync(destPath)) continue;
      mkdirSync(join(destPath, '..'), { recursive: true });
      copyFileSync(srcPath, destPath, force ? undefined : 0);
      copied.push(relPath);
    }
  }
  return copied;
}

function mergeInternalEmailDomain(workspaceRoot: string, testDataYamlPath: string): void {
  if (!existsSync(testDataYamlPath)) return;
  const content = readFileSync(testDataYamlPath, 'utf8');
  const parsed = parseYaml(content) as Record<string, unknown>;
  const domain = parsed?.internal_email_domain;
  if (typeof domain !== 'string') return;

  const configPath = getWorkspaceConfigPath(workspaceRoot);
  const config = loadConfig(workspaceRoot);
  if (config.internal_email_domain) return; // already set

  const existing = existsSync(configPath)
    ? (parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>)
    : {};
  const merged = { ...existing, internal_email_domain: domain };
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, stringifyYaml(merged), 'utf8');
}

/**
 * Seed test-data command handler
 */
export async function seedTestDataCommand(options: SeedTestDataOptions): Promise<void> {
  const { json, force = false } = options;

  const packageRoot = getPackageRoot();
  const testDataDir = join(packageRoot, TEST_DATA_DIR);

  if (!existsSync(testDataDir)) {
    const msg =
      'Test data is not available. This is a development-only feature. ' +
      'Use a local build (npm link or clone the repo) to access it.';
    if (json) {
      console.log(JSON.stringify({ success: false, error: msg }));
    } else {
      error(msg);
    }
    process.exit(1);
  }

  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);

  if (!json) {
    header('Seed Test Data');
    console.log('Copy fixture data into this workspace for local testing.');
    console.log('');
  }

  ensureWorkspaceStructure(workspaceRoot);

  const stats = {
    meetings: 0,
    people: 0,
    plans: 0,
    projects: 0,
    memory: 0,
    context: 0,
    testScenarios: false
  };

  // Copy meetings -> resources/meetings
  const meetingsSrc = join(testDataDir, 'meetings');
  const meetingsDest = paths.resources ? join(workspaceRoot, 'resources', 'meetings') : null;
  if (meetingsDest && existsSync(meetingsSrc)) {
    const meetingFiles = readdirSync(meetingsSrc, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'));
    for (const f of meetingFiles) {
      const destPath = join(meetingsDest, f.name);
      if (!force && existsSync(destPath)) continue;
      mkdirSync(meetingsDest, { recursive: true });
      copyFileSync(join(meetingsSrc, f.name), destPath, force ? undefined : 0);
      stats.meetings++;
    }
  }

  // Copy people -> people/internal, people/customers
  for (const cat of ['internal', 'customers', 'users']) {
    const src = join(testDataDir, 'people', cat);
    const dest = join(paths.people, cat);
    if (!existsSync(src)) continue;
    const files = readdirSync(src, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'));
    for (const f of files) {
      const destPath = join(dest, f.name);
      if (!force && existsSync(destPath)) continue;
      mkdirSync(dest, { recursive: true });
      copyFileSync(join(src, f.name), destPath, force ? undefined : 0);
      stats.people++;
    }
  }

  // Copy plans -> resources/plans
  const plansSrc = join(testDataDir, 'plans');
  const plansDest = paths.resources ? join(workspaceRoot, 'resources', 'plans') : null;
  if (plansDest && existsSync(plansSrc)) {
    const files = readdirSync(plansSrc, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'));
    for (const f of files) {
      const destPath = join(plansDest, f.name);
      if (!force && existsSync(destPath)) continue;
      mkdirSync(plansDest, { recursive: true });
      copyFileSync(join(plansSrc, f.name), destPath, force ? undefined : 0);
      stats.plans++;
    }
  }

  // Copy projects -> projects/active
  const projectsSrc = join(testDataDir, 'projects');
  const projectsDest = join(workspaceRoot, 'projects', 'active');
  if (existsSync(projectsSrc)) {
    const dirs = readdirSync(projectsSrc, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    for (const d of dirs) {
      const destProj = join(projectsDest, d.name);
      if (!force && existsSync(destProj)) continue;
      const subCopied = copyDir(
        join(projectsSrc, d.name),
        workspaceRoot,
        join('projects', 'active', d.name),
        force
      );
      stats.projects += subCopied.length > 0 ? 1 : 0;
    }
  }

  // Copy memory/items
  const memorySrc = join(testDataDir, 'memory', 'items');
  const memoryDest = join(paths.memory, 'items');
  if (existsSync(memorySrc)) {
    const files = readdirSync(memorySrc, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'));
    for (const f of files) {
      const destPath = join(memoryDest, f.name);
      if (!force && existsSync(destPath)) continue;
      mkdirSync(memoryDest, { recursive: true });
      copyFileSync(join(memorySrc, f.name), destPath, force ? undefined : 0);
      stats.memory++;
    }
  }

  // Copy context (goals-strategy and any others)
  const contextSrc = join(testDataDir, 'context');
  if (existsSync(contextSrc)) {
    const files = readdirSync(contextSrc, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'));
    for (const f of files) {
      const destPath = join(paths.context, f.name);
      if (!force && existsSync(destPath)) continue;
      mkdirSync(paths.context, { recursive: true });
      copyFileSync(join(contextSrc, f.name), destPath, force ? undefined : 0);
      stats.context++;
    }
  }

  // Copy TEST-SCENARIOS.md to workspace root
  const scenariosSrc = join(testDataDir, 'TEST-SCENARIOS.md');
  const scenariosDest = join(workspaceRoot, 'TEST-SCENARIOS.md');
  if (existsSync(scenariosSrc)) {
    if (force || !existsSync(scenariosDest)) {
      copyFileSync(scenariosSrc, scenariosDest, force ? undefined : 0);
      stats.testScenarios = true;
    }
  }

  // Merge internal_email_domain into arete.yaml
  const testDataYaml = join(testDataDir, 'arete.yaml');
  mergeInternalEmailDomain(workspaceRoot, testDataYaml);

  // Update meetings index
  if (meetingsDest && existsSync(meetingsDest)) {
    const meetingFiles = readdirSync(meetingsDest)
      .filter((n) => n.endsWith('.md') && n !== 'index.md');
    for (const f of meetingFiles) {
      const content = readFileSync(join(meetingsDest, f), 'utf8');
      const parsed = parseMeetingFrontmatter(content);
      if (parsed?.title && parsed?.date) {
        updateMeetingsIndex(meetingsDest, {
          filename: f,
          title: parsed.title,
          date: parsed.date
        });
      }
    }
  }

  // Update people index
  updatePeopleIndex(paths);

  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          ...stats,
          message: 'See TEST-SCENARIOS.md for test prompts and journeys.'
        },
        null,
        2
      )
    );
    return;
  }

  section('Seed Complete');
  listItem('Meetings', String(stats.meetings));
  listItem('People', String(stats.people));
  listItem('Plans', String(stats.plans));
  listItem('Projects', String(stats.projects));
  listItem('Memory items', String(stats.memory));
  listItem('Context files', String(stats.context));
  listItem('TEST-SCENARIOS.md', stats.testScenarios ? 'copied' : 'skipped (already exists)');
  console.log('');
  success('Test data seeded successfully.');
  info('See TEST-SCENARIOS.md for test prompts and journeys.');
  console.log('');
}

export default seedTestDataCommand;
