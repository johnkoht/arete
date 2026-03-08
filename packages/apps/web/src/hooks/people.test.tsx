/**
 * Tests for people hooks — especially useToggleFavorite with optimistic updates.
 *
 * Uses Vitest + @testing-library/react renderHook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { usePeople, useToggleFavorite } from "@/hooks/people.js";
import type { PeopleResponse } from "@/api/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
    queryClient,
  };
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Test Data ─────────────────────────────────────────────────────────────────

const MOCK_PEOPLE: PeopleResponse = {
  people: [
    {
      slug: "john-doe",
      name: "John Doe",
      role: "Engineer",
      company: "Acme",
      category: "internal",
      healthScore: 80,
      healthStatus: "Active",
      lastMeetingDate: "2026-03-01",
      lastMeetingTitle: "Weekly Sync",
      openCommitments: 2,
      trend: "up",
      favorite: false,
    },
    {
      slug: "jane-smith",
      name: "Jane Smith",
      role: "Designer",
      company: "Acme",
      category: "internal",
      healthScore: 70,
      healthStatus: "Active",
      lastMeetingDate: "2026-02-28",
      lastMeetingTitle: "Design Review",
      openCommitments: 1,
      trend: "flat",
      favorite: true,
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("usePeople", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_PEOPLE)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches people from /api/people", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePeople(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/people"),
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
  });

  it("returns people with favorite field", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePeople(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.people[0]?.favorite).toBe(false);
    expect(result.current.data?.people[1]?.favorite).toBe(true);
  });
});

describe("useToggleFavorite", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls PATCH /api/people/:slug with favorite body", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(mockResponse(MOCK_PEOPLE)) // Initial fetch
      .mockResolvedValueOnce(mockResponse({ success: true })) // PATCH
      .mockResolvedValueOnce(mockResponse(MOCK_PEOPLE)) // Refetch after mutation
    );

    const { wrapper, queryClient } = createWrapper();
    
    // Prime the cache
    queryClient.setQueryData(["people"], MOCK_PEOPLE);

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    act(() => {
      result.current.mutate({ slug: "john-doe", favorite: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify PATCH was called with correct URL and body
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/people/john-doe"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      })
    );
  });

  it("calls PATCH and succeeds on 200", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValue(mockResponse({ success: true }))
    );

    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    act(() => {
      result.current.mutate({ slug: "john-doe", favorite: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/people/john-doe"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      })
    );
  });

  it("handles mutation error gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve(mockResponse({ error: "Server error" }, 500));
        }
        return Promise.resolve(mockResponse(MOCK_PEOPLE));
      })
    );

    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    act(() => {
      result.current.mutate({ slug: "john-doe", favorite: true });
    });

    // Wait for error
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Error should be available
    expect(result.current.error).toBeDefined();
  });
});
