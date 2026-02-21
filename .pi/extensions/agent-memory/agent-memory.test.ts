/**
 * Tests for agent-memory extension
 *
 * Strategy: call the extension factory with a mock pi that captures
 * registered handlers, then invoke those handlers directly with
 * controlled inputs (real temp files for "exists" cases, non-existent
 * path for "missing" cases).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import agentMemoryExtension from './index.js';

// ── Mock pi API ────────────────────────────────────────────────────────────

type EventHandler = (event: Record<string, unknown>, ctx: unknown) => Promise<unknown>;

function createMockPi(): { on: (event: string, handler: EventHandler) => void; handlers: Record<string, EventHandler> } {
  const handlers: Record<string, EventHandler> = {};
  return {
    on(event: string, handler: EventHandler) {
      handlers[event] = handler;
    },
    handlers,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const COLLABORATION_CONTENT = '# Builder Collaboration Profile\n\nTest content here.';
const ORIGINAL_SYSTEM_PROMPT = 'You are a helpful assistant.';

async function runSessionStart(
  handlers: Record<string, EventHandler>,
): Promise<void> {
  await handlers['session_start']?.({}, null);
}

async function runBeforeAgentStart(
  handlers: Record<string, EventHandler>,
  systemPrompt = ORIGINAL_SYSTEM_PROMPT,
): Promise<{ systemPrompt?: string } | undefined> {
  return handlers['before_agent_start']?.({ systemPrompt }, null) as Promise<
    { systemPrompt?: string } | undefined
  >;
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('agentMemoryExtension', () => {
  let tmpDir: string;
  let memoryDir: string;
  let collaborationFilePath: string;

  before(async () => {
    tmpDir = join(tmpdir(), `agent-memory-test-${Date.now()}`);
    memoryDir = join(tmpDir, 'memory');
    collaborationFilePath = join(memoryDir, 'collaboration.md');
    await mkdir(memoryDir, { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('when collaboration.md does not exist', () => {
    it('silently does nothing on session_start (no error thrown)', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, {
        filePath: join(tmpDir, 'nonexistent', 'collaboration.md'),
      });

      // Must not throw
      await assert.doesNotReject(runSessionStart(mockPi.handlers));
    });

    it('returns undefined from before_agent_start (no systemPrompt change)', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, {
        filePath: join(tmpDir, 'nonexistent', 'collaboration.md'),
      });

      await runSessionStart(mockPi.handlers);
      const result = await runBeforeAgentStart(mockPi.handlers);

      assert.equal(result, undefined);
    });
  });

  describe('when collaboration.md exists', () => {
    before(async () => {
      await writeFile(collaborationFilePath, COLLABORATION_CONTENT, 'utf-8');
    });

    it('returns a systemPrompt that includes the collaboration profile header', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, { filePath: collaborationFilePath });

      await runSessionStart(mockPi.handlers);
      const result = await runBeforeAgentStart(mockPi.handlers);

      assert.ok(result, 'Expected a result object');
      assert.ok(
        result.systemPrompt?.includes('## Builder Collaboration Profile'),
        'systemPrompt should include the collaboration profile header',
      );
    });

    it('appends collaboration content after the header', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, { filePath: collaborationFilePath });

      await runSessionStart(mockPi.handlers);
      const result = await runBeforeAgentStart(mockPi.handlers);

      assert.ok(result?.systemPrompt?.includes(COLLABORATION_CONTENT));
    });

    it('preserves the original system prompt (appends, does not replace)', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, { filePath: collaborationFilePath });

      await runSessionStart(mockPi.handlers);
      const result = await runBeforeAgentStart(mockPi.handlers, ORIGINAL_SYSTEM_PROMPT);

      assert.ok(result?.systemPrompt?.startsWith(ORIGINAL_SYSTEM_PROMPT),
        'Original system prompt should be preserved at the start');
    });

    it('formats the injection as: original + newlines + header + content', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, { filePath: collaborationFilePath });

      await runSessionStart(mockPi.handlers);
      const result = await runBeforeAgentStart(mockPi.handlers, ORIGINAL_SYSTEM_PROMPT);

      const expected =
        ORIGINAL_SYSTEM_PROMPT +
        '\n\n## Builder Collaboration Profile\n\n' +
        COLLABORATION_CONTENT;
      assert.equal(result?.systemPrompt, expected);
    });
  });

  describe('multiple calls to before_agent_start', () => {
    it('consistently injects on every call (stateless per-turn behavior)', async () => {
      const mockPi = createMockPi();
      agentMemoryExtension(mockPi as never, { filePath: collaborationFilePath });

      await runSessionStart(mockPi.handlers);

      const result1 = await runBeforeAgentStart(mockPi.handlers, 'Turn 1 prompt');
      const result2 = await runBeforeAgentStart(mockPi.handlers, 'Turn 2 prompt');

      assert.ok(result1?.systemPrompt?.startsWith('Turn 1 prompt'));
      assert.ok(result2?.systemPrompt?.startsWith('Turn 2 prompt'));
      assert.ok(result1?.systemPrompt?.includes('## Builder Collaboration Profile'));
      assert.ok(result2?.systemPrompt?.includes('## Builder Collaboration Profile'));
    });
  });
});
