/**
 * Tests for intelligence hooks — useCommitments with filters.
 *
 * Uses Vitest + @testing-library/react renderHook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useCommitments } from "@/hooks/intelligence.js";
import type { CommitmentsListResponse } from "@/api/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
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

const MOCK_COMMITMENTS: CommitmentsListResponse = {
  commitments: [
    {
      id: "c-1",
      text: "Send proposal",
      personSlug: "jane-doe",
      direction: "i_owe_them",
      date: "2026-03-01",
      daysOpen: 5,
      status: "open",
    },
    {
      id: "c-2",
      text: "Review contract",
      personSlug: "bob-smith",
      direction: "they_owe_me",
      date: "2026-02-28",
      daysOpen: 7,
      status: "open",
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCommitments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches commitments from /api/commitments", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommitments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/commitments"),
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result.current.data).toHaveLength(2);
  });

  it("includes filter param in request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCommitments({ filter: "overdue" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/filter=overdue/),
      expect.any(Object)
    );
  });

  it("includes direction param in request for mine", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCommitments({ direction: "mine" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/direction=mine/),
      expect.any(Object)
    );
  });

  it("includes direction param in request for theirs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCommitments({ direction: "theirs" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/direction=theirs/),
      expect.any(Object)
    );
  });

  it("does not include direction param when direction is all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCommitments({ direction: "all" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith(
      expect.not.stringMatching(/direction=/),
      expect.any(Object)
    );
  });

  it("includes person param in request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCommitments({ person: "jane-doe" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/person=jane-doe/),
      expect.any(Object)
    );
  });

  it("combines filter, direction, and person params", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCommitments({ filter: "open", direction: "mine", person: "bob-smith" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toMatch(/filter=open/);
    expect(url).toMatch(/direction=mine/);
    expect(url).toMatch(/person=bob-smith/);
  });

  it("uses different query keys for different params", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
    
    const { wrapper, queryClient } = createWrapper();
    
    // Render with one set of params
    const { result: result1 } = renderHook(
      () => useCommitments({ filter: "open", direction: "mine" }),
      { wrapper }
    );
    await waitFor(() => expect(result1.current.isLoading).toBe(false));

    // Render with different params
    const { result: result2 } = renderHook(
      () => useCommitments({ filter: "overdue", direction: "theirs" }),
      { wrapper }
    );
    await waitFor(() => expect(result2.current.isLoading).toBe(false));

    // Both should have made separate requests (different query keys)
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty array on error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500)));
    
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommitments(), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    // data should fall back to empty array
    expect(result.current.data).toEqual([]);
  });
});
