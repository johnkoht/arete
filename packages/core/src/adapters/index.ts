/**
 * IDE Adapter Factory and Registry
 */

import type { IDEAdapter, IDETarget } from './ide-adapter.js';
import type { AreteConfig } from '../models/workspace.js';
import { CursorAdapter } from './cursor-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';

export type { IDEAdapter, IDETarget, CanonicalRule } from './ide-adapter.js';
export { CursorAdapter } from './cursor-adapter.js';
export { ClaudeAdapter } from './claude-adapter.js';

export function getAdapter(target: IDETarget): IDEAdapter {
  if (target === 'cursor') return new CursorAdapter();
  if (target === 'claude') return new ClaudeAdapter();
  throw new Error(`Invalid IDE target: ${target}`);
}

export function detectAdapter(workspaceRoot: string): IDEAdapter {
  const cursorAdapter = new CursorAdapter();
  if (cursorAdapter.detectInWorkspace(workspaceRoot)) return cursorAdapter;
  const claudeAdapter = new ClaudeAdapter();
  if (claudeAdapter.detectInWorkspace(workspaceRoot)) return claudeAdapter;
  return new CursorAdapter();
}

export function getAdapterFromConfig(
  config: AreteConfig,
  workspaceRoot: string
): IDEAdapter {
  if (config.ide_target) return getAdapter(config.ide_target);
  return detectAdapter(workspaceRoot);
}
