import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runCli } from '../helpers.js';

export type IdeTarget = 'cursor' | 'claude';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(join(__dirname, '..', '..', '..', '..'));

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
