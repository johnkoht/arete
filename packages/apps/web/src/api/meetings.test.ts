/**
 * API layer mapping tests for meetings.
 *
 * Tests the wire-to-frontend type mapping for area fields,
 * using fetchMeeting which calls mapFullMeeting internally.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchMeeting, fetchAreaSuggestion } from './meetings.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createRawFullMeeting(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'test-meeting',
    title: 'Test Meeting',
    date: '2026-04-01',
    status: 'processed',
    attendees: [{ name: 'Jane Doe', email: 'jane@example.com' }],
    duration: '30 minutes',
    source: 'fathom',
    recordingUrl: '',
    summary: 'A test meeting',
    body: '## Notes\nSome notes',
    transcript: 'Hello world',
    frontmatter: {},
    stagedSections: { actionItems: [], decisions: [], learnings: [] },
    stagedItemStatus: {},
    stagedItemEdits: {},
    approvedItems: { actionItems: [], decisions: [], learnings: [] },
    parsedSections: { actionItems: [], decisions: [], learnings: [] },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('fetchMeeting area mapping', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps area field from wire to frontend', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(createRawFullMeeting({ area: 'product-strategy' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const meeting = await fetchMeeting('test-meeting');
    expect(meeting.area).toBe('product-strategy');
    expect(meeting.suggestedArea).toBeUndefined();
  });

  it('maps suggestedArea.areaSlug to frontend suggestedArea string', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          createRawFullMeeting({
            suggestedArea: { areaSlug: 'engineering', confidence: 0.85 },
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const meeting = await fetchMeeting('test-meeting');
    expect(meeting.suggestedArea).toBe('engineering');
    expect(meeting.area).toBeUndefined();
  });

  it('maps null suggestedArea to undefined', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(createRawFullMeeting({ suggestedArea: null })),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const meeting = await fetchMeeting('test-meeting');
    expect(meeting.suggestedArea).toBeUndefined();
  });

  it('maps both area and suggestedArea when present', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          createRawFullMeeting({
            area: 'design',
            suggestedArea: { areaSlug: 'engineering', confidence: 0.6 },
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const meeting = await fetchMeeting('test-meeting');
    expect(meeting.area).toBe('design');
    expect(meeting.suggestedArea).toBe('engineering');
  });

  it('handles missing area fields gracefully', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(createRawFullMeeting()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const meeting = await fetchMeeting('test-meeting');
    expect(meeting.area).toBeUndefined();
    expect(meeting.suggestedArea).toBeUndefined();
  });
});

describe('fetchAreaSuggestion', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns suggestion and areas from backend', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: { areaSlug: 'growth', confidence: 0.85 },
          areas: ['design', 'growth', 'platform'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await fetchAreaSuggestion('test-meeting');
    expect(result.suggestion).toEqual({ areaSlug: 'growth', confidence: 0.85 });
    expect(result.areas).toEqual(['design', 'growth', 'platform']);
  });

  it('returns null suggestion when no match', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ suggestion: null, areas: ['design', 'growth'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await fetchAreaSuggestion('test-meeting');
    expect(result.suggestion).toBeNull();
    expect(result.areas).toEqual(['design', 'growth']);
  });

  it('handles empty areas list', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ suggestion: null, areas: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await fetchAreaSuggestion('test-meeting');
    expect(result.suggestion).toBeNull();
    expect(result.areas).toEqual([]);
  });
});
