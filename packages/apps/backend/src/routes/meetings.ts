/**
 * Meeting routes — all /api/meetings endpoints.
 */

import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import * as workspaceService from '../services/workspace.js';
import * as jobsService from '../services/jobs.js';

// Per-slug write queue — prevents concurrent write races
const writeQueue = new Map<string, Promise<void>>();

async function withSlugLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prior = writeQueue.get(slug) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  writeQueue.set(slug, next);
  await prior;
  try {
    return await fn();
  } finally {
    resolve();
  }
}

export function createMeetingsRouter(workspaceRoot: string): Hono {
  const app = new Hono();

  // GET /api/meetings — list all meeting summaries
  app.get('/', async (c) => {
    try {
      const meetings = await workspaceService.listMeetings(workspaceRoot);
      return c.json(meetings);
    } catch (err) {
      console.error('[meetings] listMeetings error:', err);
      return c.json({ error: 'Failed to list meetings' }, 500);
    }
  });

  // POST /api/meetings/sync — shell out to `arete pull krisp`, returns 202 + jobId
  app.post('/sync', async (c) => {
    const jobId = jobsService.createJob('sync');

    // Fire and forget
    setImmediate(() => {
      const child = spawn('arete', ['pull', 'krisp'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          jobsService.appendEvent(jobId, line);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          jobsService.appendEvent(jobId, line);
        }
      });

      child.on('close', (code) => {
        jobsService.setJobStatus(jobId, code === 0 ? 'done' : 'error');
      });

      child.on('error', (err) => {
        jobsService.appendEvent(jobId, `Error: ${err.message}`);
        jobsService.setJobStatus(jobId, 'error');
      });
    });

    return c.json({ jobId }, 202);
  });

  // GET /api/meetings/:slug — full meeting with staged items
  app.get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    try {
      const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
      if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
      return c.json(meeting);
    } catch (err) {
      console.error('[meetings] getMeeting error:', err);
      return c.json({ error: 'Failed to get meeting' }, 500);
    }
  });

  // DELETE /api/meetings/:slug — delete meeting file + refresh QMD index
  app.delete('/:slug', async (c) => {
    const slug = c.req.param('slug');
    try {
      await withSlugLock(slug, () =>
        workspaceService.deleteMeeting(workspaceRoot, slug)
      );
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ENOENT') || message.includes('no such file')) {
        return c.json({ error: 'Meeting not found' }, 404);
      }
      console.error('[meetings] deleteMeeting error:', err);
      return c.json({ error: 'Failed to delete meeting' }, 500);
    }
  });

  // PUT /api/meetings/:slug — update title/summary
  app.put('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const body = await c.req.json<{ title?: string; summary?: string }>();
    try {
      await withSlugLock(slug, () =>
        workspaceService.updateMeeting(workspaceRoot, slug, body)
      );
      const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
      if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
      return c.json(meeting);
    } catch (err) {
      console.error('[meetings] updateMeeting error:', err);
      return c.json({ error: 'Failed to update meeting' }, 500);
    }
  });

  // PATCH /api/meetings/:slug/items/:id — update staged item status/edits
  app.patch('/:slug/items/:id', async (c) => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const body = await c.req.json<{
      status: 'approved' | 'skipped' | 'pending';
      editedText?: string;
    }>();
    try {
      await withSlugLock(slug, () =>
        workspaceService.updateItemStatus(workspaceRoot, slug, id, {
          status: body.status,
          editedText: body.editedText,
        })
      );
      const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
      if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
      return c.json(meeting);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return c.json({ error: 'Meeting not found' }, 404);
      }
      console.error('[meetings] updateItemStatus error:', err);
      return c.json({ error: 'Failed to update item' }, 500);
    }
  });

  // POST /api/meetings/:slug/approve — commit approved items
  app.post('/:slug/approve', async (c) => {
    const slug = c.req.param('slug');
    try {
      const meeting = await withSlugLock(slug, () =>
        workspaceService.approveMeeting(workspaceRoot, slug)
      );
      return c.json(meeting);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return c.json({ error: 'Meeting not found' }, 404);
      }
      console.error('[meetings] approveMeeting error:', err);
      return c.json({ error: 'Failed to approve meeting' }, 500);
    }
  });

  // POST /api/meetings/:slug/process-people — run arete meeting process --file <path> --json
  app.post('/:slug/process-people', async (c) => {
    const slug = c.req.param('slug');
    // The file path is relative to the workspace meetings dir
    const filePath = `${workspaceRoot}/resources/meetings/${slug}.md`;

    return new Promise<Response>((resolveResp) => {
      const chunks: string[] = [];
      const errChunks: string[] = [];

      const child = spawn(
        'arete',
        ['meeting', 'process', '--file', filePath, '--json'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );

      child.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errChunks.push(chunk.toString());
      });

      child.on('close', (code) => {
        if (code !== 0) {
          resolveResp(
            c.json(
              { error: 'process-people failed', detail: errChunks.join('') },
              500
            )
          );
          return;
        }
        try {
          const result = JSON.parse(chunks.join('')) as unknown;
          resolveResp(c.json(result));
        } catch {
          resolveResp(
            c.json({ error: 'Invalid JSON from process-people' }, 500)
          );
        }
      });

      child.on('error', (err) => {
        resolveResp(
          c.json({ error: 'Failed to spawn process-people', detail: err.message }, 500)
        );
      });
    });
  });

  // POST /api/meetings/:slug/process — stub (Task 4 implements real logic)
  app.post('/:slug/process', async (c) => {
    const jobId = jobsService.createJob('process');
    // TODO: Task 4 — createProcessingSession and streamProcessingEvents
    return c.json({ jobId }, 202);
  });

  // GET /api/meetings/:slug/process-stream — SSE stub (Task 4 implements real streaming)
  app.get('/:slug/process-stream', (c) => {
    return new Response('data: {}\n\n', {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  });

  return app;
}
