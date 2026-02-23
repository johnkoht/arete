/**
 * Test helpers for CLI tests — run CLI, create temp workspace.
 */

import { spawnSync } from 'child_process';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the CLI package root (packages/cli) */
export const CLI_PKG_DIR = join(__dirname, '..');

/** Path to the CLI entry — use tsx to run TypeScript directly (no build required) */
export const CLI_ENTRY = join(CLI_PKG_DIR, 'src', 'index.ts');

export function createTmpDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupTmpDir(dir: string): void {
  if (dir && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface RunCliOptions {
  cwd?: string;
  encoding?: BufferEncoding;
  env?: NodeJS.ProcessEnv;
}

/** tsx from monorepo root node_modules (tests run from repo root) */
function getTsxPath(): string {
  const root = join(CLI_PKG_DIR, '..', '..');
  return join(root, 'node_modules', '.bin', 'tsx');
}

function runCliInternal(
  args: string[],
  options: RunCliOptions = {},
): { stdout: string; stderr: string; code: number | null } {
  const cwd = options.cwd ?? process.cwd();
  const encoding = options.encoding ?? 'utf8';
  const tsxPath = getTsxPath();
  const result = spawnSync(tsxPath, [CLI_ENTRY, ...args], {
    cwd,
    encoding,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', ...options.env },
  });
  const stdout = (result.stdout ?? '').toString();
  const stderr = (result.stderr ?? '').toString();
  const code = result.status;
  return { stdout, stderr, code };
}

/**
 * Run the arete CLI with given args. Uses tsx to run TypeScript directly.
 * Throws if exit code is non-zero.
 */
export function runCli(args: string[], options: RunCliOptions = {}): string {
  const { stdout, stderr, code } = runCliInternal(args, options);
  if (code !== 0) {
    throw new Error(`CLI exited ${code}: ${stderr || stdout}`);
  }
  return stdout;
}

/**
 * Run the arete CLI and capture stdout, stderr, and exit code.
 */
export function runCliRaw(
  args: string[],
  options: RunCliOptions = {},
): { stdout: string; stderr: string; code: number | null } {
  return runCliInternal(args, options);
}
