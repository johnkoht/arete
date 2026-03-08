/**
 * Tests for CommitmentsPage — direction filter, person filter, and sorting.
 *
 * Uses Vitest + @testing-library/react + createMemoryRouter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import CommitmentsPage from "./CommitmentsPage.js";
import type { CommitmentsListResponse } from "@/api/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage(initialPath = "/commitments") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  
  const router = createMemoryRouter(
    [{ path: "/commitments", element: <CommitmentsPage /> }],
    { initialEntries: [initialPath] }
  );
  
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

// ── Test Data ─────────────────────────────────────────────────────────────────

const MOCK_COMMITMENTS: CommitmentsListResponse = {
  commitments: [
    {
      id: "c-1",
      text: "Send proposal to client",
      personSlug: "jane-doe",
      direction: "i_owe_them",
      date: "2026-03-01",
      daysOpen: 5,
      status: "open",
    },
    {
      id: "c-2",
      text: "Review contract terms",
      personSlug: "bob-smith",
      direction: "they_owe_me",
      date: "2026-02-20",
      daysOpen: 14,
      status: "open",
    },
    {
      id: "c-3",
      text: "Schedule follow-up",
      personSlug: "alice-jones",
      direction: "i_owe_them",
      date: "2026-02-15",
      daysOpen: 19,
      status: "open",
    },
  ],
};

const EMPTY_COMMITMENTS: CommitmentsListResponse = {
  commitments: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CommitmentsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("rendering", () => {
    it("shows loading skeleton initially", () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
      
      renderPage();
      
      // Should show skeletons while loading
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows empty state when no commitments", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(EMPTY_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
      });
    });

    it("renders commitments in a table", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      expect(screen.getByText("Send proposal to client")).toBeInTheDocument();
      expect(screen.getByText("Review contract terms")).toBeInTheDocument();
      expect(screen.getByText("Schedule follow-up")).toBeInTheDocument();
    });

    it("shows direction badges", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getAllByText("I owe them")).toHaveLength(2);
        expect(screen.getByText("They owe me")).toBeInTheDocument();
      });
    });

    it("shows age badges with correct colors", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByText("5d")).toBeInTheDocument();
        expect(screen.getByText("14d")).toBeInTheDocument();
        expect(screen.getByText("19d")).toBeInTheDocument();
      });
    });
  });

  describe("direction filter", () => {
    it("renders direction tabs: Mine, Theirs, All", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Mine" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Theirs" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
      });
    });

    it("clicking Mine tab refetches with direction=mine", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      // Click "Mine" tab
      await user.click(screen.getByRole("button", { name: "Mine" }));
      
      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).toMatch(/direction=mine/);
      });
    });

    it("clicking Theirs tab refetches with direction=theirs", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      // Click "Theirs" tab
      await user.click(screen.getByRole("button", { name: "Theirs" }));
      
      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).toMatch(/direction=theirs/);
      });
    });
  });

  describe("person filter", () => {
    it("shows person filter chip when ?person= is in URL", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage("/commitments?person=jane-doe");
      
      await waitFor(() => {
        expect(screen.getByText("Filtered by:")).toBeInTheDocument();
        expect(screen.getByText("jane doe")).toBeInTheDocument();
      });
    });

    it("fetches with person param from URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage("/commitments?person=bob-smith");
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/person=bob-smith/),
        expect.any(Object)
      );
    });

    it("clears person filter when X is clicked", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage("/commitments?person=jane-doe");
      
      await waitFor(() => {
        expect(screen.getByText("Filtered by:")).toBeInTheDocument();
      });
      
      // Click the X to clear filter
      await user.click(screen.getByLabelText("Clear person filter"));
      
      await waitFor(() => {
        expect(screen.queryByText("Filtered by:")).not.toBeInTheDocument();
      });
    });
  });

  describe("sorting", () => {
    it("renders sortable column headers for Person and Age", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      // Find sortable headers
      const personHeader = screen.getByRole("button", { name: /Person/i });
      const ageHeader = screen.getByRole("button", { name: /Age/i });
      
      expect(personHeader).toBeInTheDocument();
      expect(ageHeader).toBeInTheDocument();
    });

    it("sorts by person when Person header is clicked", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      // Click Person header to sort
      await user.click(screen.getByRole("button", { name: /Person/i }));
      
      // Verify order changed (alice-jones should be first alphabetically)
      const rows = screen.getAllByRole("row").slice(1); // skip header
      const firstRowText = rows[0]?.textContent ?? "";
      expect(firstRowText).toMatch(/alice jones/i);
    });

    it("sorts by age when Age header is clicked", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      // Click Age header to sort ascending (lowest age first)
      await user.click(screen.getByRole("button", { name: /Age/i }));
      
      // Verify order: 5d first
      const rows = screen.getAllByRole("row").slice(1); // skip header
      const firstRowText = rows[0]?.textContent ?? "";
      expect(firstRowText).toMatch(/5d/);
    });

    it("toggles sort order when clicking the same header twice", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS)));
      
      renderPage();
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      // Click Age header twice to sort descending
      await user.click(screen.getByRole("button", { name: /Age/i }));
      await user.click(screen.getByRole("button", { name: /Age/i }));
      
      // Verify order: 19d first (highest age)
      const rows = screen.getAllByRole("row").slice(1); // skip header
      const firstRowText = rows[0]?.textContent ?? "";
      expect(firstRowText).toMatch(/19d/);
    });
  });

  describe("URL state", () => {
    it("reads direction from URL param", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage("/commitments?direction=mine");
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/direction=mine/),
        expect.any(Object)
      );
    });

    it("reads filter from URL param", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage("/commitments?filter=overdue");
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/filter=overdue/),
        expect.any(Object)
      );
    });

    it("combines filter, direction, and person from URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(MOCK_COMMITMENTS));
      vi.stubGlobal("fetch", fetchMock);
      
      renderPage("/commitments?direction=mine&filter=open&person=anita-law");
      
      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
      });
      
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toMatch(/direction=mine/);
      expect(url).toMatch(/filter=open/);
      expect(url).toMatch(/person=anita-law/);
    });
  });
});
