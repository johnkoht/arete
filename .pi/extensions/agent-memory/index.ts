/**
 * Agent Memory Extension
 *
 * Automatically injects memory/collaboration.md into every agent session's
 * system prompt via `before_agent_start`. Uses `systemPrompt` return (not
 * `message`) to avoid token accumulation and multi-extension conflicts.
 *
 * The file is loaded once on session_start and cached for the session.
 * If collaboration.md is missing, the extension silently does nothing.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AgentMemoryOptions {
  /** Override the path to collaboration.md (used in tests) */
  filePath?: string;
}

export default function agentMemoryExtension(
  pi: ExtensionAPI,
  options: AgentMemoryOptions = {},
): void {
  let collaborationContent: string | null = null;

  pi.on('session_start', async (_event, _ctx) => {
    const filePath =
      options.filePath ?? join(process.cwd(), 'memory/collaboration.md');
    try {
      collaborationContent = await readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist or can't be read — silently skip
      collaborationContent = null;
    }
  });

  pi.on('before_agent_start', async (event, _ctx) => {
    if (!collaborationContent) return;
    return {
      systemPrompt:
        event.systemPrompt +
        '\n\n## Builder Collaboration Profile\n\n' +
        collaborationContent,
    };
  });
}
