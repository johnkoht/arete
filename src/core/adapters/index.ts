/**
 * IDE Adapter Factory and Registry
 * 
 * Provides factory functions for creating and detecting IDE adapters.
 * Handles detection priority: config.ide_target → detected dir → default cursor
 */

import type { IDEAdapter, IDETarget } from '../ide-adapter.js';
import type { AreteConfig } from '../../types.js';
import { CursorAdapter } from './cursor-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';

/**
 * Get an IDE adapter instance for the specified target
 * 
 * @param target - IDE target identifier ('cursor' or 'claude')
 * @returns Adapter instance for the specified IDE
 * @throws Error if target is invalid (should never happen with TypeScript)
 */
export function getAdapter(target: IDETarget): IDEAdapter {
  if (target === 'cursor') {
    return new CursorAdapter();
  }
  
  if (target === 'claude') {
    return new ClaudeAdapter();
  }
  
  // Defensive: should never reach here due to TypeScript type checking
  throw new Error(`Invalid IDE target: ${target}`);
}

/**
 * Detect which IDE adapter to use based on workspace structure
 * 
 * Detection priority:
 * 1. .cursor/ directory → CursorAdapter
 * 2. .claude/ directory → ClaudeAdapter
 * 3. Default → CursorAdapter (backward compatibility)
 * 
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Detected adapter instance (defaults to Cursor if no IDE detected)
 */
export function detectAdapter(workspaceRoot: string): IDEAdapter {
  // Check Cursor first (existing installations)
  const cursorAdapter = new CursorAdapter();
  if (cursorAdapter.detectInWorkspace(workspaceRoot)) {
    return cursorAdapter;
  }
  
  // Check Claude
  const claudeAdapter = new ClaudeAdapter();
  if (claudeAdapter.detectInWorkspace(workspaceRoot)) {
    return claudeAdapter;
  }
  
  // Default to Cursor for backward compatibility
  return new CursorAdapter();
}

/**
 * Get adapter from config or detect from workspace
 * 
 * Priority:
 * 1. config.ide_target (if set) → use specified adapter
 * 2. Detected from workspace → use detected adapter
 * 3. Default → CursorAdapter (backward compatibility)
 * 
 * @param config - Areté configuration
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Adapter instance based on config or detection
 */
export function getAdapterFromConfig(config: AreteConfig, workspaceRoot: string): IDEAdapter {
  // Priority: config.ide_target takes precedence
  if (config.ide_target) {
    return getAdapter(config.ide_target);
  }
  
  // Fallback to detection
  return detectAdapter(workspaceRoot);
}

// Export adapter classes for use by tests and other modules
export { CursorAdapter, ClaudeAdapter };
