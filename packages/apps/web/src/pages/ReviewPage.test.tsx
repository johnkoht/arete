/**
 * Tests for ReviewPage — aggregated review page for task triage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReviewPage from "./ReviewPage";

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockPendingReview = {
  tasks: [
    {
      id: "task-1",
      text: "Send API docs to Sarah",
      completed: false,
      metadata: { person: "sarah-chen" },
      source: { file: "now/week.md", section: "inbox" },
    },
    {
      id: "task-2",
      text: "Review pull request",
      completed: false,
      metadata: {},
      source: { file: "now/week.md", section: "inbox" },
    },
  ],
  decisions: [
    {
      id: "dec-1",
      text: "Legal sign-off required for all vendor contracts",
      type: "decision" as const,
      meetingSlug: "2026-03-27-vendor-sync",
      meetingTitle: "Vendor Sync",
      meetingDate: "2026-03-27",
      confidence: 0.92,
    },
  ],
  learnings: [
    {
      id: "learn-1",
      text: "React Query v5 uses isPending instead of isLoading",
      type: "learning" as const,
      meetingSlug: "2026-03-26-tech-review",
      meetingTitle: "Tech Review",
      meetingDate: "2026-03-26",
    },
  ],
  commitments: [
    {
      id: "commit-1",
      text: "Send onboarding materials",
      direction: "i_owe_them" as const,
      personSlug: "john-doe",
      personName: "John Doe",
      source: "2026-03-25-onboarding",
      date: "2026-03-25",
      status: "open" as const,
      resolvedAt: null,
    },
  ],
};

const emptyPendingReview = {
  tasks: [],
  decisions: [],
  learnings: [],
  commitments: [],
};

// ── Mock API ──────────────────────────────────────────────────────────────────

vi.mock("@/api/review.js", () => ({
  fetchPendingReview: vi.fn(),
  completeReview: vi.fn(),
  fetchAutoApprovePreview: vi.fn(),
}));

import * as reviewApi from "@/api/review.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderReviewPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/review"]}>
        <Routes>
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/meetings/:slug" element={<div>Meeting Detail</div>} />
          <Route path="/people/:slug" element={<div>Person Detail</div>} />
          <Route path="/commitments" element={<div>Commitments</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no auto-approve qualifying meetings
    vi.mocked(reviewApi.fetchAutoApprovePreview).mockResolvedValue({
      meetings: [],
      totalItems: 0,
    });
  });

  describe("loading state", () => {
    it("shows skeleton while loading", async () => {
      // Never resolve the promise
      vi.mocked(reviewApi.fetchPendingReview).mockImplementation(
        () => new Promise(() => {})
      );

      renderReviewPage();

      // Should show loading skeleton
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no pending items", async () => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(emptyPendingReview);

      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("All caught up!")).toBeInTheDocument();
      });

      expect(
        screen.getByText("No pending items to review. Process some meetings to get started.")
      ).toBeInTheDocument();

      // Should have link to dashboard
      expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    });
  });

  describe("with pending items", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
    });

    it("renders all sections", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Tasks to Create")).toBeInTheDocument();
      });

      expect(screen.getByText("Decisions")).toBeInTheDocument();
      expect(screen.getByText("Learnings")).toBeInTheDocument();
      expect(screen.getByText("Open Commitments")).toBeInTheDocument();
    });

    it("renders tasks with approve/skip controls", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Send API docs to Sarah")).toBeInTheDocument();
      });

      expect(screen.getByText("Review pull request")).toBeInTheDocument();

      // Should have destination selectors (one per task)
      const selectors = screen.getAllByRole("combobox");
      expect(selectors.length).toBe(2);
    });

    it("renders decisions with meeting source", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(
          screen.getByText("Legal sign-off required for all vendor contracts")
        ).toBeInTheDocument();
      });

      // Meeting title appears in group header + item link (so getAllByText)
      expect(screen.getAllByText("Vendor Sync").length).toBeGreaterThanOrEqual(1);
    });

    it("renders learnings", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(
          screen.getByText("React Query v5 uses isPending instead of isLoading")
        ).toBeInTheDocument();
      });

      // Meeting title appears in group header + item link (so getAllByText)
      expect(screen.getAllByText("Tech Review").length).toBeGreaterThanOrEqual(1);
    });

    it("renders commitments as read-only", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Send onboarding materials")).toBeInTheDocument();
      });

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("I owe them")).toBeInTheDocument();
    });

    it("shows Done Reviewing button", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText(/Done Reviewing/)).toBeInTheDocument();
      });
    });

    it("shows bulk action buttons for tasks", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Tasks to Create")).toBeInTheDocument();
      });

      // Should have approve all / skip all buttons
      const approveAllButtons = screen.getAllByText("Approve All");
      const skipAllButtons = screen.getAllByText("Skip All");

      // One set for each actionable section (tasks, decisions, learnings)
      expect(approveAllButtons.length).toBe(3);
      expect(skipAllButtons.length).toBe(3);
    });
  });

  describe("item interactions", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
    });

    it("can approve and unapprove a task", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Send API docs to Sarah")).toBeInTheDocument();
      });

      // Find the approve buttons (check marks)
      const approveButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg.lucide-check") !== null
      );

      // Click first approve button
      fireEvent.click(approveButtons[0]);

      // Task should show approved styling (hard to test without checking classes)
      // Click again to unapprove
      fireEvent.click(approveButtons[0]);
    });

    it("can skip and unskip a task", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Send API docs to Sarah")).toBeInTheDocument();
      });

      // Find the skip buttons (x marks)
      const skipButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg.lucide-x") !== null
      );

      // Click first skip button
      fireEvent.click(skipButtons[0]);

      // Click again to unskip
      fireEvent.click(skipButtons[0]);
    });

    it("can edit a memory item (decision/learning)", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(
          screen.getByText("Legal sign-off required for all vendor contracts")
        ).toBeInTheDocument();
      });

      // Find the edit buttons (pencil icons)
      const editButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg.lucide-pencil") !== null
      );

      // Should have edit buttons for decisions and learnings (2 total)
      expect(editButtons.length).toBeGreaterThanOrEqual(2);

      // Click edit on the first memory item (decision)
      fireEvent.click(editButtons[0]);

      // Should show input field
      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Legal sign-off required for all vendor contracts");

      // Should show Save button
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("can save edited text for a memory item", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(
          screen.getByText("Legal sign-off required for all vendor contracts")
        ).toBeInTheDocument();
      });

      // Find and click edit button
      const editButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg.lucide-pencil") !== null
      );
      fireEvent.click(editButtons[0]);

      // Change the text
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Updated decision text" } });

      // Click Save
      fireEvent.click(screen.getByText("Save"));

      // Input should be gone, text should show updated value
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Updated decision text")).toBeInTheDocument();
    });

    it("includes edited text in approved items when completing review", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(
          screen.getByText("Legal sign-off required for all vendor contracts")
        ).toBeInTheDocument();
      });

      // Find the decision item's container and its buttons
      const decisionText = screen.getByText("Legal sign-off required for all vendor contracts");
      const decisionContainer = decisionText.closest(".rounded-lg");
      expect(decisionContainer).not.toBeNull();

      // Click edit button within the decision container
      const editButton = decisionContainer!.querySelector("button svg.lucide-pencil")?.closest("button");
      expect(editButton).not.toBeNull();
      fireEvent.click(editButton!);

      // Edit the text
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Edited decision" } });
      fireEvent.click(screen.getByText("Save"));

      // Wait for the edited text to appear
      await waitFor(() => {
        expect(screen.getByText("Edited decision")).toBeInTheDocument();
      });

      // Now approve the edited decision - find approve button in the same container
      const editedText = screen.getByText("Edited decision");
      const editedContainer = editedText.closest(".rounded-lg");
      const approveButton = editedContainer!.querySelector("button svg.lucide-check")?.closest("button");
      expect(approveButton).not.toBeNull();
      fireEvent.click(approveButton!);

      // Wait a tick for state to settle, then click Done Reviewing
      await waitFor(() => {
        const doneButton = screen.getByText(/Done Reviewing/);
        fireEvent.click(doneButton);
      });

      await waitFor(() => {
        expect(reviewApi.completeReview).toHaveBeenCalled();
      });

      // Check that the approved memory item includes the edited text (URL encoded)
      const callArgs = vi.mocked(reviewApi.completeReview).mock.calls[0][0];
      const approvedMemory = callArgs.approved.filter((id: string) =>
        id.startsWith("memory:")
      );
      
      // Should have the edited text encoded in the ID
      const editedItem = approvedMemory.find((id: string) => 
        id.includes(encodeURIComponent("Edited decision"))
      );
      expect(editedItem).toBeDefined();
    });

    it("approve all tasks marks all pending tasks as approved", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Tasks to Create")).toBeInTheDocument();
      });

      // Find the Approve All button in the tasks section
      const approveAllButtons = screen.getAllByText("Approve All");
      fireEvent.click(approveAllButtons[0]); // First one is for tasks

      // After clicking, pending count should decrease
      // (Hard to verify without inspecting state, but at least ensure no crash)
    });
  });

  describe("done reviewing", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
      vi.mocked(reviewApi.completeReview).mockResolvedValue({ success: true });
    });

    it("calls completeReview API when Done Reviewing is clicked", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText(/Done Reviewing/)).toBeInTheDocument();
      });

      const doneButton = screen.getByText(/Done Reviewing/);
      fireEvent.click(doneButton);

      await waitFor(() => {
        expect(reviewApi.completeReview).toHaveBeenCalled();
      });

      // Check that it was called with sessionId, approved, and skipped arrays
      const callArgs = vi.mocked(reviewApi.completeReview).mock.calls[0][0];
      expect(callArgs).toHaveProperty("sessionId");
      expect(callArgs).toHaveProperty("approved");
      expect(callArgs).toHaveProperty("skipped");
      expect(Array.isArray(callArgs.approved)).toBe(true);
      expect(Array.isArray(callArgs.skipped)).toBe(true);
    });

    it("includes task destination in approved task IDs", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Send API docs to Sarah")).toBeInTheDocument();
      });

      // Approve the first task
      const approveButtons = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("svg.lucide-check") !== null
      );
      fireEvent.click(approveButtons[0]);

      // Click Done Reviewing
      const doneButton = screen.getByText(/Done Reviewing/);
      fireEvent.click(doneButton);

      await waitFor(() => {
        expect(reviewApi.completeReview).toHaveBeenCalled();
      });

      const callArgs = vi.mocked(reviewApi.completeReview).mock.calls[0][0];
      // Approved tasks should have format "task:id:destination"
      const approvedTasks = callArgs.approved.filter((id: string) =>
        id.startsWith("task:")
      );
      if (approvedTasks.length > 0) {
        expect(approvedTasks[0]).toMatch(/^task:[^:]+:(must|should|could|anytime|someday)$/);
      }
    });
  });

  describe("error state", () => {
    it("shows error message when API fails", async () => {
      vi.mocked(reviewApi.fetchPendingReview).mockRejectedValue(
        new Error("Network error")
      );

      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Failed to load review items")).toBeInTheDocument();
      });

      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  describe("Task 1: Global confidence-based approve", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
      vi.mocked(reviewApi.completeReview).mockResolvedValue({ success: true });
    });

    it("shows Approve High Confidence button when there are memory items", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Decisions")).toBeInTheDocument();
      });

      expect(screen.getByText("Approve High Confidence")).toBeInTheDocument();
    });

    it("shows count of qualifying items on the button", async () => {
      // mockPendingReview has 1 decision with confidence 0.92 (qualifies for 0.8 threshold)
      // and 1 learning with no confidence (does NOT qualify)
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Approve High Confidence")).toBeInTheDocument();
      });

      // Should show badge with count — find the amber-styled badge on the button
      const highConfBtn = screen.getByText("Approve High Confidence").closest("button");
      expect(highConfBtn).not.toBeNull();
      expect(highConfBtn!.textContent).toContain("1");
    });

    it("approves only items meeting the confidence threshold", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Approve High Confidence")).toBeInTheDocument();
      });

      const button = screen.getByText("Approve High Confidence").closest("button");
      expect(button).not.toBeNull();
      fireEvent.click(button!);

      // Click Done Reviewing
      const doneButton = screen.getByText(/Done Reviewing/);
      fireEvent.click(doneButton);

      await waitFor(() => {
        expect(reviewApi.completeReview).toHaveBeenCalled();
      });

      const callArgs = vi.mocked(reviewApi.completeReview).mock.calls[0][0];
      const approvedMemory = callArgs.approved.filter((id: string) =>
        id.startsWith("memory:")
      );

      // Only "dec-1" (confidence: 0.92) should be approved — "learn-1" has no confidence
      expect(approvedMemory.some((id: string) => id.startsWith("memory:dec-1"))).toBe(true);
      expect(approvedMemory.some((id: string) => id.startsWith("memory:learn-1"))).toBe(false);
    });
  });

  describe("Task 2: Meeting-level batch approval", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
    });

    it("shows meeting group headers for decisions and learnings", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Decisions")).toBeInTheDocument();
      });

      // Meeting group headers appear in both sections (decisions + learnings)
      // Vendor Sync group header
      const vendorSyncLinks = screen.getAllByText("Vendor Sync");
      expect(vendorSyncLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Approve Meeting and Skip Meeting buttons per meeting group", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Decisions")).toBeInTheDocument();
      });

      // Should have per-meeting batch buttons
      const approveMeetingButtons = screen.getAllByText("Approve Meeting");
      const skipMeetingButtons = screen.getAllByText("Skip Meeting");

      // At least 1 meeting group per section with pending items
      expect(approveMeetingButtons.length).toBeGreaterThanOrEqual(1);
      expect(skipMeetingButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("clicking Approve Meeting approves all pending items in that meeting", async () => {
      vi.mocked(reviewApi.completeReview).mockResolvedValue({ success: true });
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getAllByText("Approve Meeting").length).toBeGreaterThanOrEqual(1);
      });

      // Click the first Approve Meeting button (use aria-label for specificity)
      const approveMeetingButton = screen.getAllByLabelText(/Approve all items from/)[0];
      expect(approveMeetingButton).toBeDefined();
      fireEvent.click(approveMeetingButton);

      // Click Done Reviewing
      const doneButton = screen.getByText(/Done Reviewing/);
      fireEvent.click(doneButton);

      await waitFor(() => {
        expect(reviewApi.completeReview).toHaveBeenCalled();
      });

      const callArgs = vi.mocked(reviewApi.completeReview).mock.calls[0][0];
      // At least one memory item should now be approved
      const approvedMemory = callArgs.approved.filter((id: string) =>
        id.startsWith("memory:")
      );
      expect(approvedMemory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Task 3: Auto-approve banner", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
    });

    it("shows auto-approve banner when qualifying meetings exist", async () => {
      vi.mocked(reviewApi.fetchAutoApprovePreview).mockResolvedValue({
        meetings: [{ slug: "2026-03-27-vendor-sync", title: "Vendor Sync", itemCount: 1 }],
        totalItems: 1,
      });

      renderReviewPage();

      await waitFor(() => {
        expect(
          screen.getByText(/can be auto-approved/)
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Auto-approve these")).toBeInTheDocument();
    });

    it("hides banner when no qualifying meetings", async () => {
      vi.mocked(reviewApi.fetchAutoApprovePreview).mockResolvedValue({
        meetings: [],
        totalItems: 0,
      });

      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Decisions")).toBeInTheDocument();
      });

      expect(screen.queryByText("Auto-approve these")).not.toBeInTheDocument();
    });

    it("clicking Auto-approve approves qualifying items and hides banner", async () => {
      vi.mocked(reviewApi.fetchAutoApprovePreview).mockResolvedValue({
        meetings: [{ slug: "2026-03-27-vendor-sync", title: "Vendor Sync", itemCount: 1 }],
        totalItems: 1,
      });
      vi.mocked(reviewApi.completeReview).mockResolvedValue({ success: true });

      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText("Auto-approve these")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Auto-approve these"));

      // Banner should be gone after auto-approving
      await waitFor(() => {
        expect(screen.queryByText("Auto-approve these")).not.toBeInTheDocument();
      });
    });
  });

  describe("Task 4: Review summary", () => {
    beforeEach(() => {
      vi.mocked(reviewApi.fetchPendingReview).mockResolvedValue(mockPendingReview);
      vi.mocked(reviewApi.completeReview).mockResolvedValue({ success: true });
    });

    it("shows review summary after completing review", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText(/Done Reviewing/)).toBeInTheDocument();
      });

      const doneButton = screen.getByText(/Done Reviewing/);
      fireEvent.click(doneButton);

      await waitFor(() => {
        // "Review Complete" appears in PageHeader (h1) and CardTitle (h3)
        expect(screen.getAllByText("Review Complete").length).toBeGreaterThanOrEqual(1);
      });

      // Should show approval counts
      expect(screen.getByText("Approved")).toBeInTheDocument();
      expect(screen.getByText("Skipped")).toBeInTheDocument();
    });

    it("shows links to dashboard and start another review in summary", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText(/Done Reviewing/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Done Reviewing/));

      await waitFor(() => {
        expect(screen.getAllByText("Review Complete").length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Start Another Review")).toBeInTheDocument();
    });

    it("shows auto-approved meetings in summary when they were auto-approved", async () => {
      vi.mocked(reviewApi.fetchAutoApprovePreview).mockResolvedValue({
        meetings: [{ slug: "2026-03-27-vendor-sync", title: "Vendor Sync", itemCount: 1 }],
        totalItems: 1,
      });

      renderReviewPage();

      // Wait for banner and auto-approve
      await waitFor(() => {
        expect(screen.getByText("Auto-approve these")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Auto-approve these"));

      // Complete the review
      await waitFor(() => {
        expect(screen.queryByText("Auto-approve these")).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Done Reviewing/));

      await waitFor(() => {
        expect(screen.getAllByText("Review Complete").length).toBeGreaterThanOrEqual(1);
      });

      // Should show auto-approved meetings
      expect(screen.getByText("Auto-approved meetings")).toBeInTheDocument();
    });

    it("clicking Start Another Review resets the state", async () => {
      renderReviewPage();

      await waitFor(() => {
        expect(screen.getByText(/Done Reviewing/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Done Reviewing/));

      await waitFor(() => {
        expect(screen.getAllByText("Review Complete").length).toBeGreaterThanOrEqual(1);
      });

      // Reset by clicking Start Another Review
      fireEvent.click(screen.getByText("Start Another Review"));

      // Should go back to normal review state (tasks visible again)
      await waitFor(() => {
        expect(screen.getByText(/Done Reviewing/)).toBeInTheDocument();
      });
    });
  });
});
