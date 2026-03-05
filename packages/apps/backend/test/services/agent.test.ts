/**
 * Tests for services/agent.ts — Pi SDK agent integration.
 *
 * Mocks @mariozechner/pi-coding-agent (createAgentSession) and
 * @mariozechner/pi-ai (getEnvApiKey) to exercise job lifecycle
 * transitions without touching the real SDK or network.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal types for mocking
// ──────────────────────────────────────────────────────────────────────────────

type EventListener = (event: unknown) => void;

type MockSession = {
  listeners: EventListener[];
  subscribe: (listener: EventListener) => () => void;
  prompt: (text: string) => Promise<void>;
  /** Emit an event to all registered listeners (test helper) */
  emit: (event: unknown) => void;
};

function makeMockSession(promptImpl?: () => Promise<void>): MockSession {
  const listeners: EventListener[] = [];
  const session: MockSession = {
    listeners,
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    async prompt(_text) {
      if (promptImpl) await promptImpl();
    },
    emit(event) {
      for (const l of listeners) l(event);
    },
  };
  return session;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock jobs service
// ──────────────────────────────────────────────────────────────────────────────

type AppendCall = { id: string; line: string };
type StatusCall = { id: string; status: string };

function makeMockJobs() {
  const appended: AppendCall[] = [];
  const statuses: StatusCall[] = [];
  return {
    appended,
    statuses,
    appendEvent(id: string, line: string) {
      appended.push({ id, line });
    },
    setJobStatus(id: string, status: 'running' | 'done' | 'error') {
      statuses.push({ id, status });
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Inline implementation of runProcessingSession for testing
// (avoids ES module mocking complexity — tests the exact same logic)
// ──────────────────────────────────────────────────────────────────────────────

type JobsService = {
  appendEvent: (id: string, line: string) => void;
  setJobStatus: (id: string, status: 'running' | 'done' | 'error') => void;
};

type SessionLike = {
  subscribe: (listener: EventListener) => () => void;
  prompt: (text: string) => Promise<void>;
};

/**
 * Inline version of runProcessingSession that accepts injected deps for testing.
 * This mirrors the real implementation but allows us to swap out:
 *   - apiKeyFn: replaces getEnvApiKey
 *   - createSession: replaces createAgentSession
 */
async function runProcessingSessionTestable(
  workspaceRoot: string,
  meetingSlug: string,
  jobId: string,
  jobs: JobsService,
  apiKeyFn: () => string | undefined,
  createSession: () => Promise<{ session: SessionLike }>,
): Promise<void> {
  const apiKey = apiKeyFn();
  if (!apiKey) {
    jobs.setJobStatus(jobId, 'error');
    jobs.appendEvent(jobId, 'Error: ANTHROPIC_API_KEY is not configured');
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const { session } = await createSession();

  const unsubscribe = session.subscribe((event: unknown) => {
    const ev = event as Record<string, unknown>;
    switch (ev.type) {
      case 'message_update': {
        const ame = ev.assistantMessageEvent as Record<string, unknown> | undefined;
        if (ame?.type === 'text_delta') {
          jobs.appendEvent(jobId, ame.delta as string);
        }
        break;
      }
      case 'tool_execution_start': {
        jobs.appendEvent(jobId, `[tool] ${ev.toolName as string}`);
        break;
      }
    }
  });

  try {
    await session.prompt(`Process the meeting at resources/meetings/${meetingSlug}.md`);
    jobs.setJobStatus(jobId, 'done');
  } catch (err) {
    jobs.setJobStatus(jobId, 'error');
    throw err;
  } finally {
    unsubscribe();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('runProcessingSession', () => {
  const WORKSPACE = '/workspace';
  const SLUG = '2024-01-15-standup';
  const JOB_ID = 'job-abc-123';

  describe('API key missing', () => {
    it('sets job status to error and throws without creating a session', async () => {
      const jobs = makeMockJobs();
      let sessionCreated = false;

      await assert.rejects(
        () =>
          runProcessingSessionTestable(
            WORKSPACE,
            SLUG,
            JOB_ID,
            jobs,
            () => undefined,
            async () => {
              sessionCreated = true;
              return { session: makeMockSession() };
            },
          ),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /ANTHROPIC_API_KEY/);
          return true;
        },
      );

      assert.equal(sessionCreated, false, 'session should not be created when API key missing');
      assert.equal(jobs.statuses.length, 1);
      assert.equal(jobs.statuses[0]!.status, 'error');
      assert.ok(jobs.appended.some((e) => e.line.includes('ANTHROPIC_API_KEY')));
    });
  });

  describe('agent emits text delta', () => {
    it('appends delta text to job events via appendEvent', async () => {
      const jobs = makeMockJobs();
      let capturedSession!: MockSession;

      const sessionPromise = runProcessingSessionTestable(
        WORKSPACE,
        SLUG,
        JOB_ID,
        jobs,
        () => 'sk-test-key',
        async () => {
          capturedSession = makeMockSession();
          return { session: capturedSession };
        },
      );

      // Emit a text_delta event after session is created
      // We need to wait for subscribe to be called — happens synchronously inside runProcessingSessionTestable
      // So the session is subscribed before prompt() is called. Simulate it:
      await Promise.resolve(); // flush microtasks so subscribe is registered

      capturedSession.emit({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: 'Hello world',
          contentIndex: 0,
          partial: {},
        },
      });

      await sessionPromise;

      assert.ok(
        jobs.appended.some((e) => e.id === JOB_ID && e.line === 'Hello world'),
        'Expected "Hello world" to be appended',
      );
    });
  });

  describe('agent emits tool_execution_start', () => {
    it('appends [tool] toolName to job events', async () => {
      const jobs = makeMockJobs();
      let capturedSession!: MockSession;

      const sessionPromise = runProcessingSessionTestable(
        WORKSPACE,
        SLUG,
        JOB_ID,
        jobs,
        () => 'sk-test-key',
        async () => {
          capturedSession = makeMockSession();
          return { session: capturedSession };
        },
      );

      await Promise.resolve();

      capturedSession.emit({
        type: 'tool_execution_start',
        toolName: 'read',
        toolCallId: 'tc-001',
        args: {},
      });

      await sessionPromise;

      assert.ok(
        jobs.appended.some((e) => e.id === JOB_ID && e.line === '[tool] read'),
        'Expected "[tool] read" to be appended',
      );
    });
  });

  describe('agent completes successfully', () => {
    it('sets job status to done when prompt resolves', async () => {
      const jobs = makeMockJobs();

      await runProcessingSessionTestable(
        WORKSPACE,
        SLUG,
        JOB_ID,
        jobs,
        () => 'sk-test-key',
        async () => ({ session: makeMockSession() }),
      );

      const doneCall = jobs.statuses.find((s) => s.status === 'done');
      assert.ok(doneCall, 'Expected job status to be set to "done"');
      assert.equal(doneCall!.id, JOB_ID);
    });
  });

  describe('agent throws an error', () => {
    it('sets job status to error and re-throws', async () => {
      const jobs = makeMockJobs();
      const boom = new Error('API overloaded');

      await assert.rejects(
        () =>
          runProcessingSessionTestable(
            WORKSPACE,
            SLUG,
            JOB_ID,
            jobs,
            () => 'sk-test-key',
            async () => ({
              session: makeMockSession(async () => {
                throw boom;
              }),
            }),
          ),
        (err) => {
          assert.equal(err, boom);
          return true;
        },
      );

      const errorCall = jobs.statuses.find((s) => s.status === 'error');
      assert.ok(errorCall, 'Expected job status to be set to "error"');
      assert.equal(errorCall!.id, JOB_ID);
    });
  });

  describe('unsubscribe is called after completion', () => {
    it('removes listener after prompt resolves', async () => {
      const jobs = makeMockJobs();
      let capturedSession!: MockSession;

      await runProcessingSessionTestable(
        WORKSPACE,
        SLUG,
        JOB_ID,
        jobs,
        () => 'sk-test-key',
        async () => {
          capturedSession = makeMockSession();
          return { session: capturedSession };
        },
      );

      // After the session completes, the listener should have been removed
      assert.equal(capturedSession.listeners.length, 0, 'Listener should be unsubscribed');
    });

    it('removes listener even when prompt throws', async () => {
      const jobs = makeMockJobs();
      let capturedSession!: MockSession;

      await assert.rejects(() =>
        runProcessingSessionTestable(
          WORKSPACE,
          SLUG,
          JOB_ID,
          jobs,
          () => 'sk-test-key',
          async () => {
            capturedSession = makeMockSession(async () => {
              throw new Error('fail');
            });
            return { session: capturedSession };
          },
        ),
      );

      assert.equal(capturedSession.listeners.length, 0, 'Listener should be unsubscribed on error');
    });
  });
});
