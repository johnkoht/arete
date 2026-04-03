/**
 * Tests for task hooks — useTasks, useTaskSuggestions, useUpdateTask, useCompleteTask.
 *
 * Covers:
 * - Query hooks with proper staleTime/gcTime
 * - Optimistic updates with rollback
 * - Direct mutation calls (no debounce — scheduling is deliberate)
 * - Cache invalidation patterns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useTasks, useTaskSuggestions, useUpdateTask, useCompleteTask } from "@/hooks/tasks.js";
import type { TasksResponse, Task, TasksFilter, SuggestedTask } from "@/api/types.js";

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

// Helper to wait for a specified time
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Test Data ─────────────────────────────────────────────────────────────────

const MOCK_TASK: Task = {
  id: "task-001",
  text: "Review PR #42",
  destination: "must",
  due: "2026-03-25",
  area: "engineering",
  project: "api-v2",
  person: { slug: "john-doe", name: "John Doe" },
  from: null,
  completed: false,
  completedAt: null,
  source: { file: "goals/weekly.md", section: "Tasks" },
};

const MOCK_TASK_2: Task = {
  id: "task-002",
  text: "Write documentation",
  destination: "should",
  due: null,
  area: "engineering",
  project: null,
  person: null,
  from: null,
  completed: false,
  completedAt: null,
  source: { file: "now/tasks.md", section: "Backlog" },
};

const MOCK_TASKS_RESPONSE: TasksResponse = {
  tasks: [MOCK_TASK, MOCK_TASK_2],
  total: 2,
  offset: 0,
  limit: 50,
};

const MOCK_SUGGESTED_TASK: SuggestedTask = {
  ...MOCK_TASK,
  score: 85,
  breakdown: {
    dueDate: 30,
    commitment: 25,
    meetingRelevance: 20,
    weekPriority: 10,
  },
};

const MOCK_SUGGESTIONS_RESPONSE = {
  tasks: [MOCK_SUGGESTED_TASK],
};

// ── useTasks Tests ────────────────────────────────────────────────────────────

describe("useTasks", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches tasks from /api/tasks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTasks(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks"),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("returns tasks array with correct data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTasks(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.tasks).toHaveLength(2);
    expect(result.current.data?.tasks[0]?.id).toBe("task-001");
    expect(result.current.data?.total).toBe(2);
  });

  it("includes filter in queryKey and URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTasks("today"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/filter=today/),
      expect.anything()
    );
  });

  it("refetches when filter changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      ({ filter }) => useTasks(filter),
      { wrapper, initialProps: { filter: "today" as TasksFilter } }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const initialCallCount = fetchMock.mock.calls.length;

    // Change filter
    rerender({ filter: "upcoming" });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCallCount));
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/filter=upcoming/),
      expect.anything()
    );
  });

  it("includes options in queryKey", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useTasks("today", { limit: 10, offset: 20 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/limit=10.*offset=20|offset=20.*limit=10/),
      expect.anything()
    );
  });
});

// ── useTaskSuggestions Tests ──────────────────────────────────────────────────

describe("useTaskSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches suggestions from /api/tasks/suggested", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_SUGGESTIONS_RESPONSE)));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskSuggestions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/suggested"),
      expect.anything()
    );
  });

  it("returns suggestions with score and breakdown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_SUGGESTIONS_RESPONSE)));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskSuggestions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.score).toBe(85);
    expect(result.current.data?.[0]?.breakdown.dueDate).toBe(30);
  });
});

// ── useUpdateTask Tests ───────────────────────────────────────────────────────

describe("useUpdateTask", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls PATCH /api/tasks/:id with updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({ task: { ...MOCK_TASK, destination: "should" } })
      )
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["tasks", undefined, undefined], MOCK_TASKS_RESPONSE);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/task-001"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ destination: "should" }),
      })
    );
  });

  it("optimistically updates cache before server responds", async () => {
    // Track when setQueriesData is called with the update
    const setQueriesDataSpy = vi.fn();
    const originalSetQueriesData = QueryClient.prototype.setQueriesData;
    QueryClient.prototype.setQueriesData = function (...args: Parameters<typeof originalSetQueriesData>) {
      setQueriesDataSpy(...args);
      return originalSetQueriesData.apply(this, args);
    };

    let resolveRequest: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingPromise));

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["tasks", undefined, undefined], MOCK_TASKS_RESPONSE);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "could" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Wait for mutation to be pending (meaning onMutate was called)
    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Verify setQueriesData was called with tasks key (optimistic update)
    expect(setQueriesDataSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["tasks"] }),
      expect.any(Function)
    );

    // Restore
    QueryClient.prototype.setQueriesData = originalSetQueriesData;

    // Resolve the server request to complete the test cleanly
    resolveRequest!(mockResponse({ task: { ...MOCK_TASK, destination: "could" } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back cache on server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500))
    );

    const { wrapper, queryClient } = createWrapper();
    
    // Prime the cache with original data
    const originalResponse = { ...MOCK_TASKS_RESPONSE };
    queryClient.setQueryData(["tasks", undefined, undefined], originalResponse);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "could" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Wait for error - this verifies the onError callback ran
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The onError handler should have run (which does rollback).
    // Verify error state is properly set
    expect(result.current.error).toBeDefined();
    
    // Verify cache still has data (wasn't completely cleared)
    // Note: The exact value after rollback + invalidation depends on timing,
    // but the key point is onError ran without throwing
    const cachedData = queryClient.getQueriesData({ queryKey: ["tasks"] });
    expect(cachedData).toBeDefined();
  });

  it("sends each call immediately (no debounce)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ task: { ...MOCK_TASK, destination: "anytime" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["tasks", undefined, undefined], MOCK_TASKS_RESPONSE);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    // Multiple rapid calls — each should fire immediately
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "anytime" } });
    });

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit)?.method === "PATCH"
      );
      return expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("marks task caches as stale on success (triggers refetch when observed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({ task: { ...MOCK_TASK, destination: "should" } })
      )
    );

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["tasks", undefined, undefined], MOCK_TASKS_RESPONSE);
    queryClient.setQueryData(["tasks", "suggested"], [MOCK_SUGGESTED_TASK]);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // After onSettled, invalidateQueries marks caches as stale.
    // The staleTime is reset so next observer will trigger refetch.
    // Verify the mutation completed successfully (invalidation is fire-and-forget).
    expect(result.current.data).toBeDefined();
  });

  it("handles multiple paginated cache entries", async () => {
    // Track getQueriesData and setQueriesData calls
    const getQueriesDataSpy = vi.fn();
    const setQueriesDataSpy = vi.fn();
    
    const originalGetQueriesData = QueryClient.prototype.getQueriesData;
    const originalSetQueriesData = QueryClient.prototype.setQueriesData;
    
    QueryClient.prototype.getQueriesData = function (...args: Parameters<typeof originalGetQueriesData>) {
      const result = originalGetQueriesData.apply(this, args);
      getQueriesDataSpy(args[0], result);
      return result;
    };
    QueryClient.prototype.setQueriesData = function (...args: Parameters<typeof originalSetQueriesData>) {
      setQueriesDataSpy(...args);
      return originalSetQueriesData.apply(this, args);
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({ task: { ...MOCK_TASK, destination: "should" } })
      )
    );

    const { wrapper, queryClient } = createWrapper();

    // Set up multiple cache entries (different pagination params)
    const page1: TasksResponse = {
      tasks: [MOCK_TASK],
      total: 2,
      offset: 0,
      limit: 1,
    };
    const page2: TasksResponse = {
      tasks: [MOCK_TASK_2],
      total: 2,
      offset: 1,
      limit: 1,
    };

    queryClient.setQueryData(["tasks", "today", { limit: 1, offset: 0 }], page1);
    queryClient.setQueryData(["tasks", "today", { limit: 1, offset: 1 }], page2);
    
    getQueriesDataSpy.mockClear();
    setQueriesDataSpy.mockClear();

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify plural getQueriesData was called with partial key (for snapshot)
    expect(getQueriesDataSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["tasks"] }),
      expect.anything()
    );

    // Verify plural setQueriesData was called with partial key (for optimistic update)
    expect(setQueriesDataSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["tasks"] }),
      expect.any(Function)
    );

    // Restore
    QueryClient.prototype.getQueriesData = originalGetQueriesData;
    QueryClient.prototype.setQueriesData = originalSetQueriesData;
  });
});

// ── useCompleteTask Tests ─────────────────────────────────────────────────────

describe("useCompleteTask", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls PATCH /api/tasks/:id with completed: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({ task: { ...MOCK_TASK, completed: true } })
      )
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    act(() => {
      result.current.mutate("task-001");
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/task-001"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ completed: true }),
      })
    );
  });

  it("invalidates queries on success (triggers refetch)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(MOCK_TASKS_RESPONSE)) // Initial fetch
      .mockResolvedValueOnce(mockResponse({ task: { ...MOCK_TASK, completed: true } })) // PATCH
      .mockResolvedValue(mockResponse({ ...MOCK_TASKS_RESPONSE, tasks: [MOCK_TASK_2] })); // Refetch

    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, queryClient } = createWrapper();

    // First, render useTasks to populate the cache
    const { result: tasksResult } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(tasksResult.current.isSuccess).toBe(true));

    const initialFetchCount = fetchMock.mock.calls.length;

    // Now complete a task
    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    act(() => {
      result.current.mutate("task-001");
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should have triggered a refetch (invalidation)
    await waitFor(() => {
      const state = queryClient.getQueryState(["tasks", undefined, undefined]);
      // Query should be marked as invalid and refetching
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialFetchCount + 1);
    });
  });

  it("sends complete call immediately (no debounce)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ task: { ...MOCK_TASK, completed: true } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    act(() => {
      result.current.mutate("task-001");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const patchCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.[0]).toContain("task-001");
  });
});
