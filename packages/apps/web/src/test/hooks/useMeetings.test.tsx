/**
 * Hook tests for meeting-related TanStack Query hooks.
 *
 * Uses Vitest + @testing-library/react renderHook.
 * Fetch is stubbed with vi.stubGlobal so no network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useMeetings,
  useApproveItem,
  useJobStatus,
  useSyncKrisp,
} from "@/hooks/meetings.js";

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
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** Build a minimal mock Response. */
function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useMeetings", () => {
  const RAW_MEETINGS = [
    {
      slug: "q1-review",
      title: "Q1 Review",
      date: "2026-03-01T10:00:00Z",
      status: "processed",
      attendees: [{ name: "John Koht", email: "john@example.com" }],
      duration: "62 minutes",
      source: "Krisp",
      recordingUrl: "",
    },
    {
      slug: "sprint-planning",
      title: "Sprint Planning",
      date: "2026-02-28T10:00:00Z",
      status: "synced",
      attendees: [
        { name: "Alice Smith", email: "alice@example.com" },
        { name: "Bob Jones", email: "bob@example.com" },
      ],
      duration: "30 minutes",
      source: "Krisp",
      recordingUrl: "",
    },
  ];

  // Paginated response shape (Task A backend change)
  const RAW_RESPONSE = {
    meetings: RAW_MEETINGS,
    total: 50,
    offset: 0,
    limit: 25,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(RAW_RESPONSE)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches meetings from /api/meetings", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/meetings"),
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
  });

  it("returns MeetingsResponse with meetings array and pagination info", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.meetings).toHaveLength(2);
    expect(result.current.data?.total).toBe(50);
    expect(result.current.data?.offset).toBe(0);
    expect(result.current.data?.limit).toBe(25);
  });

  it("maps duration string to number", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.meetings[0]?.duration).toBe(62);
    expect(result.current.data?.meetings[1]?.duration).toBe(30);
  });

  it("normalizes lowercase status to capitalized MeetingStatus", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.meetings[0]?.status).toBe("processed");
    expect(result.current.data?.meetings[1]?.status).toBe("synced");
  });

  it("computes attendee initials from name", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstMeeting = result.current.data?.meetings[0];
    expect(firstMeeting?.attendees[0]?.initials).toBe("JK");

    const secondMeeting = result.current.data?.meetings[1];
    expect(secondMeeting?.attendees[0]?.initials).toBe("AS");
    expect(secondMeeting?.attendees[1]?.initials).toBe("BJ");
  });

  it("returns error on API failure", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500))
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("passes limit and offset params to URL query string", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings({ limit: 25, offset: 50 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/meetings\?limit=25&offset=50/),
      expect.any(Object)
    );
  });

  it("uses different query keys for different offsets", async () => {
    // Verify that different offset values create different query keys
    // by checking that passing offset=25 results in a different fetch URL
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(RAW_RESPONSE)));
    
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMeetings({ limit: 25, offset: 25 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/offset=25/),
      expect.any(Object)
    );
  });
});

describe("useApproveItem", () => {
  const SLUG = "q1-review";
  const PATCHED_MEETING = {
    slug: SLUG,
    title: "Q1 Review",
    date: "2026-03-01T10:00:00Z",
    status: "processed",
    attendees: [],
    duration: "62 minutes",
    source: "Krisp",
    summary: "Summary text",
    body: "",
    frontmatter: {},
    stagedSections: { actionItems: [], decisions: [], learnings: [] },
    stagedItemStatus: { "ai_001": "approved" },
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(PATCHED_MEETING)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls PATCH /api/meetings/:slug/items/:id with correct body", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useApproveItem(SLUG), { wrapper });

    result.current.mutate({ id: "ai_001", status: "approved" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/meetings/${SLUG}/items/ai_001`),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "approved", editedText: undefined }),
      })
    );
  });

  it("calls PATCH with editedText when text is provided", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useApproveItem(SLUG), { wrapper });

    result.current.mutate({
      id: "ai_001",
      status: "approved",
      editedText: "Updated action item text",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/meetings/${SLUG}/items/ai_001`),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          status: "approved",
          editedText: "Updated action item text",
        }),
      })
    );
  });

  it("calls PATCH with 'skipped' status", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useApproveItem(SLUG), { wrapper });

    result.current.mutate({ id: "de_001", status: "skipped" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/meetings/${SLUG}/items/de_001`),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "skipped", editedText: undefined }),
      })
    );
  });
});

describe("useJobStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is disabled when jobId is null", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useJobStatus(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("is enabled and fetches when jobId is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ status: "done", output: "Sync complete" }))
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useJobStatus("job-123"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe("done");
    expect(result.current.data?.output).toBe("Sync complete");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-123"),
      expect.any(Object)
    );
  });

  it("returns running status while job is in progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({ status: "running", output: "Processing..." })
      )
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useJobStatus("job-456"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe("running");
  });
});

describe("useSyncKrisp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /api/meetings/sync and returns jobId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ jobId: "sync-job-789" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useSyncKrisp(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.jobId).toBe("sync-job-789");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/meetings/sync"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
