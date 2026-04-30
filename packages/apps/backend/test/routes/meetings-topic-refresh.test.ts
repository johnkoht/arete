/**
 * Real route-level test for the backend approve → topic-refresh path.
 *
 * The existing `meetings.test.ts` builds a hand-rolled Hono app and mocks
 * `workspaceService.approveMeeting`, never exercising the real
 * `routes/meetings.ts` file. The Hook 2 (topic-wiki-memory) integration
 * block at `routes/meetings.ts:230-257` was therefore structurally dark —
 * no test would catch a runtime regression there. (Code-review finding 2,
 * `dev/work/plans/slack-digest-topic-wiki/code-review.md`.)
 *
 * This test mounts the actual `createMeetingsRouter`, scaffolds a real
 * workspace, and seeds the `getOrCreateServices` cache with a real
 * AreteServices object whose `topicMemory.refreshAllFromSources` and
 * `ai` are stubbed for assertion. It proves the topic-ingest block:
 *   1. is reachable from the route,
 *   2. fires when the approved meeting frontmatter declares `topics:`,
 *   3. invokes `refreshAllFromSources` with the meeting's slugs.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createMeetingsRouter } from '../../src/routes/meetings.js';
import { getOrCreateServices } from '../../src/services/agent.js';

async function createTestWorkspace(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arete-route-topic-'));
  await fs.mkdir(path.join(tmpDir, 'resources', 'meetings'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.arete', 'memory', 'items'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.arete', 'memory', 'topics'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'people', 'internal'), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, 'arete.yaml'),
    'version: 1\nqmd_collection: test-arete\n',
    'utf8',
  );
  return tmpDir;
}

/**
 * Write a minimal processed meeting file with `topics:` set but no
 * approved staged items — keeps `approveMeeting` light (no commitments,
 * no task creation, no person-memory refresh) so the test focuses on
 * the topic-ingest block at routes/meetings.ts:230-257.
 */
async function writeProcessedMeetingWithTopics(
  workspaceRoot: string,
  slug: string,
  topics: string[],
): Promise<void> {
  const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
  const content = `---
title: "Topic Test Meeting"
date: "2026-04-29"
status: processed
attendees: []
attendee_ids: []
topics:
${topics.map((t) => `  - ${t}`).join('\n')}
staged_item_status: {}
staged_item_source: {}
staged_item_confidence: {}
---

## Summary

Test meeting for topic-refresh route coverage.
`;
  await fs.writeFile(meetingPath, content, 'utf8');
}

describe('routes/meetings.ts approve → topic-refresh integration', () => {
  let workspaceRoot: string;
  let prevNoLLM: string | undefined;

  beforeEach(async () => {
    workspaceRoot = await createTestWorkspace();
    prevNoLLM = process.env.ARETE_NO_LLM;
    delete process.env.ARETE_NO_LLM; // ensure the topic-ingest branch is reachable
  });

  afterEach(async () => {
    if (prevNoLLM === undefined) delete process.env.ARETE_NO_LLM;
    else process.env.ARETE_NO_LLM = prevNoLLM;
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('invokes services.topicMemory.refreshAllFromSources with meeting topics on approve', async () => {
    const slug = '2026-04-29-topic-route-test';
    const topics = ['cover-whale-templates', 'reservation-pricing'];
    await writeProcessedMeetingWithTopics(workspaceRoot, slug, topics);

    // Pre-warm the services cache and stub the seams the route depends on.
    // Once cached, getOrCreateServices(workspaceRoot) returns the same
    // object reference — so mutations here are visible to the route.
    const services = await getOrCreateServices(workspaceRoot);

    // The route only checks isConfigured() before entering the topic-ingest
    // block. Override to true; ai.call is never reached because we stub
    // refreshAllFromSources below (which is the only consumer of the
    // topicCallLLM the route constructs).
    services.ai.isConfigured = () => true;

    const refreshCalls: Array<{ slugs?: string[]; sourcePath?: string; lockLabel?: string }> = [];
    const originalRefresh = services.topicMemory.refreshAllFromSources.bind(services.topicMemory);
    services.topicMemory.refreshAllFromSources = async (_paths, options) => {
      refreshCalls.push({
        slugs: options.slugs,
        sourcePath: options.sourcePath,
        lockLabel: options.lockLabel,
      });
      return { topics: [], totalIntegrated: 0, totalFallback: 0, totalSkipped: 0 };
    };

    try {
      const app = createMeetingsRouter(workspaceRoot);
      const res = await app.request(`/${slug}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 200, 'approve route returns 200');
      const body = (await res.json()) as { slug?: string };
      assert.strictEqual(body.slug, slug, 'response body echoes the meeting slug');

      assert.strictEqual(refreshCalls.length, 1, 'refreshAllFromSources called exactly once');
      assert.deepStrictEqual(
        refreshCalls[0].slugs,
        topics,
        'refreshAllFromSources called with the meeting frontmatter topics',
      );
      assert.strictEqual(
        refreshCalls[0].lockLabel,
        'web approve (topic ingest)',
        'route passes the expected lock label',
      );
    } finally {
      services.topicMemory.refreshAllFromSources = originalRefresh;
    }
  });
});
