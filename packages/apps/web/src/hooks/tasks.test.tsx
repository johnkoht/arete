/**
 * Tests for task hooks — useTasks, useTaskSuggestions, useUpdateTask, useCompleteTask.
 *
 * Covers:
 * - Query hooks with proper staleTime/gcTime
 * - Optimistic updates with rollback
 * - Debounce and pending-check patterns
 * - Ref pattern for stale closure prevention
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useTasks, useTaskSuggestions, useUpdateTask, useCompleteTask } from "@/hooks/tasks.js";
import type { TasksResponse, Task, SuggestedTask } from "@/api/types.js";

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
      { wrapper, initialProps: { filter: "today" as const } }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const initialCallCount = fetchMock.mock.calls.length;

    // Change filter
    rerender({ filter: "upcoming" as const });

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

    // Check cache was updated optimistically (before server response)
    await waitFor(() => {
      const cached = queryClient.getQueryData<TasksResponse>(["tasks", undefined, undefined]);
      expect(cached?.tasks[0]?.destination).toBe("could");
    });

    // Now resolve the server request
    resolveRequest!(mockResponse({ task: { ...MOCK_TASK, destination: "could" } }));
  });

  it("rolls back cache on server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500))
    );

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

    // Wait for error
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Cache should be rolled back to original value
    const cached = queryClient.getQueryData<TasksResponse>(["tasks", undefined, undefined]);
    expect(cached?.tasks[0]?.destination).toBe("must");
  });

  it("debounces rapid calls (100ms)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ task: { ...MOCK_TASK, destination: "anytime" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["tasks", undefined, undefined], MOCK_TASKS_RESPONSE);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    // Rapid calls within 100ms window
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "could" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "anytime" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Only the last call should have made it through
    const patchCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ destination: "anytime" }),
    });
  });

  it("ignores calls while mutation is pending", async () => {
    let resolveFirst: (value: Response) => void;
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValue(mockResponse({ task: { ...MOCK_TASK, destination: "should" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["tasks", undefined, undefined], MOCK_TASKS_RESPONSE);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    // First call
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });

    // Advance past debounce for first call
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Wait for isPending to be true
    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Second call while first is pending (should be ignored)
    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "could" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Resolve first request
    resolveFirst!(mockResponse({ task: { ...MOCK_TASK, destination: "should" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Only one PATCH call should have been made
    const patchCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(1);
  });

  it("handles multiple paginated cache entries", async () => {
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

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    act(() => {
      result.current.mutate({ id: "task-001", updates: { destination: "should" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Both cache entries should be updated optimistically
    await waitFor(() => {
      const cached1 = queryClient.getQueryData<TasksResponse>([
        "tasks",
        "today",
        { limit: 1, offset: 0 },
      ]);
      expect(cached1?.tasks[0]?.destination).toBe("should");
    });
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

  it("ignores duplicate calls while mutation is pending", async () => {
    let resolveFirst: (value: Response) => void;
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValue(mockResponse({ task: { ...MOCK_TASK, completed: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    // First call
    act(() => {
      result.current.mutate("task-001");
    });

    // Advance past debounce for first call
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Wait for isPending to be true
    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Second call while first is pending (should be ignored)
    act(() => {
      result.current.mutate("task-001");
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Resolve first request
    resolveFirst!(mockResponse({ task: { ...MOCK_TASK, completed: true } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Only one PATCH call should have been made
    const patchCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(1);
  });

  it("debounces rapid calls (100ms)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ task: { ...MOCK_TASK, completed: true } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    // Rapid calls within 100ms window
    act(() => {
      result.current.mutate("task-001");
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current.mutate("task-002");
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current.mutate("task-003");
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Only the last call should have made it through
    const patchCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.[0]).toContain("task-003");
  });
});
