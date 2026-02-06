/**
 * Tests for src/integrations/fathom/ (client, save, config).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FathomClient, loadFathomApiKey } from '../../src/integrations/fathom/client.js';
import { FATHOM_API_BASE } from '../../src/integrations/fathom/config.js';
import {
  meetingFromListItem,
  meetingFilename,
  getTemplatePath,
  renderMeetingTemplate,
} from '../../src/integrations/fathom/save.js';
import type { FathomMeeting } from '../../src/integrations/fathom/types.js';

describe('Fathom config', () => {
  it('uses External API v1 base URL', () => {
    assert.equal(FATHOM_API_BASE, 'https://api.fathom.ai/external/v1');
  });
});

describe('loadFathomApiKey', () => {
  it('returns null when workspaceRoot is null', () => {
    assert.equal(loadFathomApiKey(null), null);
  });

  it('returns API key from FATHOM_API_KEY when set', () => {
    const orig = process.env.FATHOM_API_KEY;
    process.env.FATHOM_API_KEY = 'test-key-123';
    try {
      assert.equal(loadFathomApiKey(null), 'test-key-123');
    } finally {
      if (orig !== undefined) process.env.FATHOM_API_KEY = orig;
      else delete process.env.FATHOM_API_KEY;
    }
  });
});

describe('FathomClient', () => {
  it('throws when API key is empty', () => {
    assert.throws(
      () => new FathomClient(''),
      /Fathom API key is required/
    );
  });

  it('listMeetings calls /meetings with created_after and created_before', async () => {
    const client = new FathomClient('test-key');
    const fetchCalls: { url: string; headers: Record<string, string> }[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: typeof url === 'string' ? url : url.toString(),
        headers: (init?.headers as Record<string, string>) ?? {},
      });
      return new Response(
        JSON.stringify({ items: [], next_cursor: null, limit: 10 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
    try {
      await client.listMeetings({
        startDate: '2026-01-29',
        endDate: '2026-02-05',
      });
      assert.equal(fetchCalls.length, 1);
      const u = new URL(fetchCalls[0].url);
      assert.equal(u.pathname, '/external/v1/meetings');
      assert.equal(u.searchParams.get('created_after'), '2026-01-29T00:00:00Z');
      assert.equal(u.searchParams.get('created_before'), '2026-02-05T23:59:59Z');
      assert.equal(fetchCalls[0].headers['X-Api-Key'], 'test-key');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});

describe('meetingFromListItem', () => {
  it('converts list item to MeetingForSave', () => {
    const item: FathomMeeting = {
      title: 'Standup',
      recording_id: 42,
      url: 'https://fathom.video/x',
      share_url: 'https://fathom.video/share/x',
      created_at: '2026-02-05T17:00:00Z',
      scheduled_start_time: '2026-02-05T16:00:00Z',
      scheduled_end_time: '2026-02-05T16:30:00Z',
      recording_start_time: '2026-02-05T16:01:00Z',
      recording_end_time: '2026-02-05T16:31:00Z',
      calendar_invitees_domains_type: 'one_or_more_external',
      transcript_language: 'en',
      calendar_invitees: [],
      recorded_by: { name: 'Alice', email: 'a@x.com', email_domain: 'x.com' },
      default_summary: { markdown_formatted: '## Summary\nDone.' },
      transcript: [
        { speaker: { display_name: 'Alice' }, text: 'Hi', timestamp: '00:00:01' },
      ],
      action_items: [{ description: 'Follow up', user_generated: false, completed: false, recording_timestamp: '00:05:00', recording_playback_url: 'https://x', assignee: {} }],
    };
    const forSave = meetingFromListItem(item);
    assert.equal(forSave.title, 'Standup');
    assert.equal(forSave.recording_id, 42);
    assert.equal(forSave.date, '2026-02-05');
    assert.equal(forSave.summary, '## Summary\nDone.');
    assert.ok(forSave.transcript.includes('Alice'));
    assert.ok(forSave.transcript.includes('Hi'));
    assert.deepEqual(forSave.action_items, ['Follow up']);
  });
});

describe('meetingFilename', () => {
  it('produces date-title-slug.md', () => {
    const name = meetingFilename({
      title: 'Product Review',
      date: '2026-02-05',
      recording_id: 1,
      duration_minutes: 30,
      summary: '',
      transcript: '',
      action_items: [],
      highlights: [],
      attendees: [],
      url: '',
    });
    assert.equal(name, '2026-02-05-product-review.md');
  });
});

describe('renderMeetingTemplate', () => {
  it('replaces template variables', () => {
    const templatePath = getTemplatePath(null);
    const content = renderMeetingTemplate(
      {
        title: 'Test Meeting',
        date: '2026-02-05',
        recording_id: 99,
        duration_minutes: 15,
        summary: 'Summary here.',
        transcript: 'Transcript here.',
        action_items: ['Do thing'],
        highlights: [],
        attendees: [],
        url: 'https://fathom.video/x',
      },
      templatePath
    );
    assert.ok(content.includes('Test Meeting'));
    assert.ok(content.includes('2026-02-05'));
    assert.ok(content.includes('Summary here.'));
    assert.ok(content.includes('Transcript here.'));
    assert.ok(content.includes('Do thing'));
  });
});
