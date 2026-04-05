/**
 * GWS CLI binary detection.
 * Never throws — returns { installed: false } when gws is not found.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GwsDeps, GwsDetectionResult } from './types.js';

const execFileAsync = promisify(execFile);

function defaultDeps(): GwsDeps {
  return {
    exec: (command: string, args: string[]) =>
      execFileAsync(command, args, { timeout: 10_000 }),
  };
}

/**
 * Detect whether the `gws` CLI binary is installed and authenticated.
 *
 * Uses DI via `deps` parameter for testability (see ical-buddy.ts pattern).
 */
export async function detectGws(deps?: GwsDeps): Promise<GwsDetectionResult> {
  const { exec } = deps ?? defaultDeps();

  // 1. Check if gws binary exists
  let version: string | undefined;
  try {
    const { stdout } = await exec('gws', ['--version']);
    const trimmed = (stdout ?? '').trim();
    // Parse version string — expect something like "gws v1.2.3" or "1.2.3"
    const match = trimmed.match(/(\d+\.\d+[\w.-]*)/);
    version = match ? match[1] : trimmed || undefined;
  } catch {
    return { installed: false };
  }

  // 2. Check auth status (best-effort — command may not exist)
  let authenticated: boolean | undefined;
  try {
    const { stdout } = await exec('gws', ['auth', 'status', '--format', 'json']);
    const parsed = JSON.parse((stdout ?? '').trim()) as { authenticated?: boolean };
    authenticated = parsed.authenticated ?? true;
  } catch {
    // If auth status command fails or doesn't exist, leave undefined
    authenticated = undefined;
  }

  return { installed: true, version, authenticated };
}
