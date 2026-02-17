import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runCli } from '../helpers.js';

export type IdeTarget = 'cursor' | 'claude';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(join(__dirname, '..', '..', '..', '..'));

export function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

export function loadEnvFiles(root: string, fileNames: string[]): void {
  for (const fileName of fileNames) {
    const filePath = join(root, fileName);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    const parsed = parseDotEnv(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

// Allow integration tests to use .env files for sandbox configuration.
// Priority: .env.test.local > .env.test > .env.local > .env
loadEnvFiles(REPO_ROOT, ['.env.test.local', '.env.test', '.env.local', '.env']);

export function createIntegrationSandbox(prefix: string): string {
  const configuredRoot = process.env.ARETE_E2E_SANDBOX_ROOT?.trim();
  if (configuredRoot) {
    const absoluteRoot = resolve(configuredRoot);
    assertOutsideRepo(absoluteRoot);
    mkdirSync(absoluteRoot, { recursive: true });
    const sandbox = mkdtempSync(join(absoluteRoot, `${prefix}-`));
    assertOutsideRepo(sandbox);
    return sandbox;
  }

  const sandbox = mkdtempSync(join(tmpdir(), `${prefix}-`));
  assertOutsideRepo(sandbox);
  return sandbox;
}

export function assertOutsideRepo(candidatePath: string): void {
  const absoluteCandidate = resolve(candidatePath);
  const rel = relative(REPO_ROOT, absoluteCandidate);
  const isInsideRepo = rel === '' || (!rel.startsWith('..') && !rel.startsWith('../'));
  assert.equal(
    isInsideRepo,
    false,
    `Integration sandbox must be outside repo root. Received: ${absoluteCandidate}`,
  );
}

export function installWorkspace(workspacePath: string, ide: IdeTarget): {
  success: boolean;
  path: string;
} {
  assertOutsideRepo(workspacePath);
  const output = runCli(['install', workspacePath, '--json', '--ide', ide]);
  return JSON.parse(output) as { success: boolean; path: string };
}

export function getStatusJson(workspacePath: string): {
  success: boolean;
  workspace: { ide: string };
} {
  const output = runCli(['status', '--json'], { cwd: workspacePath });
  return JSON.parse(output) as { success: boolean; workspace: { ide: string } };
}

export function runUpdateJson(workspacePath: string): {
  success: boolean;
  mode: string;
} {
  const output = runCli(['update', '--json'], { cwd: workspacePath });
  return JSON.parse(output) as { success: boolean; mode: string };
}

export function seedWorkspaceFromFixtures(workspacePath: string): void {
  assertOutsideRepo(workspacePath);
  const output = runCli(['seed', 'test-data', '--json'], { cwd: workspacePath });
  const result = JSON.parse(output) as { success: boolean };
  assert.equal(result.success, true, 'seed test-data should succeed in integration sandbox');
}
