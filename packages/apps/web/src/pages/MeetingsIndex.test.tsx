/**
 * Tests for MeetingsIndex pagination behavior.
 *
 * Note: These tests focus on URL-based pagination state and API calls.
 * Full component rendering tests are complex due to multiple dependencies
 * (TooltipProvider, QueryClient, Router) - focus on core behavior here.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import MeetingsIndex from "./MeetingsIndex.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage(initialPath = "/meetings") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/meetings", element: <MeetingsIndex /> }],
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

function createRawMeeting(index: number) {
  return {
    slug: `meeting-${index}`,
    title: `Meeting ${index}`,
    date: "2026-03-01T10:00:00Z",
    status: "processed",
    attendees: [{ name: "John Doe", email: "john@example.com" }],
    duration: "30 minutes",
    source: "Krisp",
    recordingUrl: "",
  };
}

const SMALL_RESPONSE = {
  meetings: [createRawMeeting(1)],
  total: 1,
  offset: 0,
  limit: 25,
};

const PAGE_1_RESPONSE = {
  meetings: Array.from({ length: 25 }, (_, i) => createRawMeeting(i + 1)),
  total: 40,
  offset: 0,
  limit: 25,
};

const PAGE_2_RESPONSE = {
  meetings: Array.from({ length: 15 }, (_, i) => createRawMeeting(i + 26)),
  total: 40,
  offset: 25,
  limit: 25,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MeetingsIndex", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("API pagination", () => {
    it("fetches with default pagination params (offset=0, limit=25)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(SMALL_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      renderPage();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/\/api\/meetings\?limit=25&offset=0/),
          expect.any(Object)
        );
      });
    });

    it("reads page from URL and fetches with corresponding offset", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(PAGE_2_RESPONSE));
      vi.stubGlobal("fetch", fetchMock);

      // Start on page 2
      renderPage("/meetings?page=2");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/offset=25/),
          expect.any(Object)
        );
      });
    });

    it("page 3 fetches with offset=50", async () => {
      const page3Response = {
        meetings: Array.from({ length: 10 }, (_, i) => createRawMeeting(i + 51)),
        total: 60,
        offset: 50,
        limit: 25,
      };
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(page3Response));
      vi.stubGlobal("fetch", fetchMock);

      renderPage("/meetings?page=3");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/offset=50/),
          expect.any(Object)
        );
      });
    });
  });

  describe("tab filtering", () => {
    it("renders filter tabs", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(SMALL_RESPONSE)));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Triage/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Approved/i })).toBeInTheDocument();
      });
    });

    it("clicking tab changes active state", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(SMALL_RESPONSE)));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
      });

      // Click Triage tab
      await user.click(screen.getByRole("button", { name: /Triage/i }));

      // Verify Triage is now active (has border-primary class)
      await waitFor(() => {
        const triageTab = screen.getByRole("button", { name: /Triage/i });
        expect(triageTab.className).toContain("border-primary");
      });
    });
  });

  describe("loading state", () => {
    it("shows loading skeleton while fetching", () => {
      // Return a promise that never resolves to keep loading state
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => new Promise(() => {}))
      );

      renderPage();

      // Should show skeleton elements (these have animate-pulse class)
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });
});
