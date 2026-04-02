/**
 * Tests for TasksPage — tab navigation, URL params, loading/error states, empty states.
 *
 * Uses Vitest + @testing-library/react + createMemoryRouter.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import TasksPage from "./TasksPage.js";
import type { TasksResponse } from "@/api/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage(initialPath = "/tasks") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/tasks", element: <TasksPage /> }],
    { initialEntries: [initialPath] }
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// ── Test Data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS_RESPONSE: TasksResponse = {
  tasks: [
    {
      id: "task-1",
      text: "Review design proposal",
      destination: "must",
      due: "2026-03-31",
      area: null,
      project: null,
      person: { slug: "jane-doe", name: "Jane Doe" },
      from: null,
      completed: false,
      source: { file: "now/week.md", section: "Tasks" },
    },
    {
      id: "task-2",
      text: "Send follow-up email",
      destination: "should",
      due: null,
      area: "sales",
      project: null,
      person: null,
      from: { type: "commitment", id: "c-1", text: "Send follow-up", priority: "medium", daysOpen: 3 },
      completed: false,
      source: { file: "now/week.md", section: "Tasks" },
    },
  ],
  total: 2,
  offset: 0,
  limit: 25,
};

const EMPTY_TASKS_RESPONSE: TasksResponse = {
  tasks: [],
  total: 0,
  offset: 0,
  limit: 25,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TasksPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("tab rendering", () => {
    it("renders all five tabs: Today, Upcoming, Anytime, Someday, Completed", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Today" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Upcoming" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Anytime" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Someday" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Completed" })).toBeInTheDocument();
      });
    });

    it("defaults to Today tab when no tab param", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks");

      await waitFor(() => {
        const todayTab = screen.getByRole("tab", { name: "Today" });
        expect(todayTab).toHaveAttribute("aria-selected", "true");
      });
    });

    it("selects correct tab from URL param ?tab=upcoming", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        const upcomingTab = screen.getByRole("tab", { name: "Upcoming" });
        expect(upcomingTab).toHaveAttribute("aria-selected", "true");
      });
    });

    it("selects correct tab from URL param ?tab=anytime", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=anytime");

      await waitFor(() => {
        const anytimeTab = screen.getByRole("tab", { name: "Anytime" });
        expect(anytimeTab).toHaveAttribute("aria-selected", "true");
      });
    });

    it("selects correct tab from URL param ?tab=someday", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=someday");

      await waitFor(() => {
        const somedayTab = screen.getByRole("tab", { name: "Someday" });
        expect(somedayTab).toHaveAttribute("aria-selected", "true");
      });
    });

    it("selects correct tab from URL param ?tab=completed", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=completed");

      await waitFor(() => {
        const completedTab = screen.getByRole("tab", { name: "Completed" });
        expect(completedTab).toHaveAttribute("aria-selected", "true");
      });
    });
  });

  describe("tab click updates URL", () => {
    it("clicking Upcoming tab updates URL to ?tab=upcoming", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Upcoming" })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("tab", { name: "Upcoming" }));

      await waitFor(() => {
        const upcomingTab = screen.getByRole("tab", { name: "Upcoming" });
        expect(upcomingTab).toHaveAttribute("aria-selected", "true");
      });

      // Verify fetch was called with upcoming filter
      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).toMatch(/filter=upcoming/);
      });
    });

    it("clicking Anytime tab updates URL", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Anytime" })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("tab", { name: "Anytime" }));

      await waitFor(() => {
        const anytimeTab = screen.getByRole("tab", { name: "Anytime" });
        expect(anytimeTab).toHaveAttribute("aria-selected", "true");
      });
    });

    it("clicking Someday tab updates URL", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Someday" })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("tab", { name: "Someday" }));

      await waitFor(() => {
        const somedayTab = screen.getByRole("tab", { name: "Someday" });
        expect(somedayTab).toHaveAttribute("aria-selected", "true");
      });
    });

    it("clicking Completed tab updates URL and fetches with filter=completed", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Completed" })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("tab", { name: "Completed" }));

      await waitFor(() => {
        const completedTab = screen.getByRole("tab", { name: "Completed" });
        expect(completedTab).toHaveAttribute("aria-selected", "true");
      });

      // Verify fetch was called with completed filter
      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).toMatch(/filter=completed/);
      });
    });
  });

  describe("Waiting On toggle", () => {
    it("renders Waiting On toggle (on tabs other than Today/Completed)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByRole("switch", { name: /waiting on/i })).toBeInTheDocument();
      });
    });

    it("toggle is off by default", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        const toggle = screen.getByRole("switch", { name: /waiting on/i });
        expect(toggle).toHaveAttribute("aria-checked", "false");
      });
    });

    it("toggle is on when ?waitingOn=true in URL", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=upcoming&waitingOn=true");

      await waitFor(() => {
        const toggle = screen.getByRole("switch", { name: /waiting on/i });
        expect(toggle).toHaveAttribute("aria-checked", "true");
      });
    });

    it("clicking toggle fetches with waitingOn=true", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByRole("switch", { name: /waiting on/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("switch", { name: /waiting on/i }));

      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).toMatch(/waitingOn=true/);
      });
    });

    it("toggle is hidden on Today tab", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks");

      await waitFor(() => {
        expect(screen.queryByRole("switch", { name: /waiting on/i })).not.toBeInTheDocument();
      });
    });

    it("toggle is hidden on Completed tab", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=completed");

      await waitFor(() => {
        expect(screen.queryByRole("switch", { name: /waiting on/i })).not.toBeInTheDocument();
      });
    });
  });

  describe("empty states", () => {
    // Note: Today tab uses TodayView which has its own empty state: "No tasks for today"
    it("shows 'No tasks for today' for Today tab (via TodayView)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_TASKS_RESPONSE)));

      renderPage("/tasks?tab=today");

      await waitFor(() => {
        expect(screen.getByText("No tasks for today")).toBeInTheDocument();
      });
    });

    it("shows 'No upcoming tasks scheduled' for Upcoming tab", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_TASKS_RESPONSE)));

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByText("No upcoming tasks scheduled")).toBeInTheDocument();
      });
    });

    it("shows 'No tasks in Anytime' for Anytime tab", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_TASKS_RESPONSE)));

      renderPage("/tasks?tab=anytime");

      await waitFor(() => {
        expect(screen.getByText("No tasks in Anytime")).toBeInTheDocument();
      });
    });

    it("shows 'No tasks in Someday' for Someday tab", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_TASKS_RESPONSE)));

      renderPage("/tasks?tab=someday");

      await waitFor(() => {
        expect(screen.getByText("No tasks in Someday")).toBeInTheDocument();
      });
    });

    it("shows 'No completed tasks' for Completed tab", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_TASKS_RESPONSE)));

      renderPage("/tasks?tab=completed");

      await waitFor(() => {
        expect(screen.getByText("No completed tasks")).toBeInTheDocument();
      });
    });

    it("empty states have role='status' for accessibility", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_TASKS_RESPONSE)));

      // Use upcoming tab to test TasksPage's empty state (Today uses TodayView)
      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        const emptyState = screen.getByRole("status");
        expect(emptyState).toBeInTheDocument();
        expect(emptyState).toHaveTextContent("No upcoming tasks scheduled");
      });
    });
  });

  describe("loading state", () => {
    it("shows skeleton while loading", () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));

      renderPage();

      // Should show skeletons while loading (Skeleton component uses animate-pulse)
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    // Note: Today tab uses TodayView with its own error handling
    // Use upcoming tab to test TasksPage's error state
    it("shows error message on API failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500))
      );

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByText(/failed to load tasks/i)).toBeInTheDocument();
      });
    });

    it("shows retry button on error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500))
      );

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
      });
    });

    it("clicking retry refetches data", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse({ error: "Server error" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
      });

      // Now mock success for retry
      fetchMock.mockResolvedValueOnce(mockResponse(MOCK_TASKS_RESPONSE));

      await user.click(screen.getByRole("button", { name: /retry/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("accessibility", () => {
    it("tabs have correct aria-selected states", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage("/tasks?tab=upcoming");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Anytime" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByRole("tab", { name: "Someday" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByRole("tab", { name: "Completed" })).toHaveAttribute("aria-selected", "false");
      });
    });

    it("TabsList has role=tablist", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE)));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("tablist")).toBeInTheDocument();
      });
    });
  });

  describe("API integration", () => {
    it("fetches tasks with correct filter parameter", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks?tab=today");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/filter=today/),
          expect.any(Object)
        );
      });
    });

    it("fetches tasks with waitingOn parameter when toggle is on", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_TASKS_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/tasks?tab=today&waitingOn=true");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/waitingOn=true/),
          expect.any(Object)
        );
      });
    });
  });
});
