/**
 * Tests for the Areas API client.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BASE_URL } from './client.js';
import { fetchAreas } from './areas.js';

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchAreas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches areas from /api/areas', async () => {
    const response = {
      areas: [
        { slug: 'engineering', name: 'Engineering' },
        { slug: 'sales', name: 'Sales' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchAreas();

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/areas`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ slug: 'engineering', name: 'Engineering' });
    expect(result[1]).toEqual({ slug: 'sales', name: 'Sales' });
  });

  it('returns empty array when no areas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ areas: [] })));

    const result = await fetchAreas();
    expect(result).toEqual([]);
  });

  it('throws on server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Internal error' }, 500)),
    );

    await expect(fetchAreas()).rejects.toThrow();
  });
});
