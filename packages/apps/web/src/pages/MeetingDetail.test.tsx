/**
 * MeetingDetail tests.
 *
 * Tests page rendering for different meeting statuses, ensuring the correct
 * components are rendered for each state (synced, processed, approved).
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Meeting } from '@/api/types.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';

// ── Mock setup ───────────────────────────────────────────────────────────────

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Mock data ────────────────────────────────────────────────────────────────

const baseMeeting: Meeting = {
  slug: 'weekly-sync',
  title: 'Weekly Sync',
  date: '2026-03-01',
  attendees: [
    { name: 'John Doe', email: 'john@acme.com', initials: 'JD' },
    { name: 'Alice Smith', email: 'alice@acme.com', initials: 'AS' },
  ],
  status: 'synced',
  duration: 60,
  source: 'fathom',
  summary: 'Discussed project updates and next steps.',
  body: 'Meeting notes here',
  transcript: 'John: Hello everyone.\nAlice: Hi John!',
};

const processedMeeting: Meeting = {
  ...baseMeeting,
  status: 'processed',
  reviewItems: [
    { id: 'action-1', type: 'action', text: 'Send follow-up email', status: 'pending' },
    { id: 'decision-1', type: 'decision', text: 'Go with vendor A', status: 'pending' },
    { id: 'learning-1', type: 'learning', text: 'Team prefers async', status: 'pending' },
  ],
};

const approvedMeeting: Meeting = {
  ...baseMeeting,
  status: 'approved',
  approvedItems: {
    actionItems: ['Send follow-up email by Friday', 'Schedule next sync'],
    decisions: ['Go with vendor A for Q2'],
    learnings: ['Team prefers async communication'],
  },
  // parsedSections is intentionally different to verify we're NOT using it
  parsedSections: {
    actionItems: [{ text: '{{03:33}} WRONG - this is from parsedSections', completed: false }],
    decisions: [{ text: 'WRONG - this is from parsedSections' }],
    learnings: [{ text: 'WRONG - this is from parsedSections' }],
  },
};

// ── Hook mocks ───────────────────────────────────────────────────────────────

const mockUseMeeting = vi.fn();
const mockUseMeetings = vi.fn(() => ({ data: [], isLoading: false }));
const mockUseApproveItem = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseSaveApprove = vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false }));
const mockUseProcessMeeting = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseDeleteMeeting = vi.fn(() => ({ mutate: vi.fn(), isPending: false }));
const mockUseAreaSuggestion = vi.fn(() => ({
  data: { suggestion: { areaSlug: 'growth', confidence: 0.8 }, areas: ['growth', 'platform', 'retention'] },
  isLoading: false,
  error: null,
}));

vi.mock('@/hooks/meetings.js', () => ({
  useMeeting: (slug: string) => mockUseMeeting(slug),
  useMeetings: () => mockUseMeetings(),
  useApproveItem: () => mockUseApproveItem(),
  useSaveApprove: () => mockUseSaveApprove(),
  useProcessMeeting: () => mockUseProcessMeeting(),
  useDeleteMeeting: () => mockUseDeleteMeeting(),
  useAreaSuggestion: () => mockUseAreaSuggestion(),
}));

// Import after mocks are set up
import MeetingDetail from './MeetingDetail.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPage(initialPath = '/meetings/weekly-sync') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const router = createMemoryRouter(
    [
      { path: '/meetings/:slug', element: <MeetingDetail /> },
      { path: '/meetings', element: <div>Meetings Index</div> },
    ],
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MeetingDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset area suggestion mock — clearAllMocks removes return values
    mockUseAreaSuggestion.mockReturnValue({
      data: { suggestion: { areaSlug: 'growth', confidence: 0.8 }, areas: ['growth', 'platform', 'retention'] },
      isLoading: false,
      error: null,
    });
  });

  describe('approved status rendering', () => {
    beforeEach(() => {
      mockUseMeeting.mockReturnValue({
        data: approvedMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('renders ApprovedItemsSection when status is approved', async () => {
      renderPage();

      await waitFor(() => {
        // Should show approved items from meeting.approvedItems
        expect(screen.getByText('Send follow-up email by Friday')).toBeInTheDocument();
        expect(screen.getByText('Schedule next sync')).toBeInTheDocument();
        expect(screen.getByText('Go with vendor A for Q2')).toBeInTheDocument();
        expect(screen.getByText('Team prefers async communication')).toBeInTheDocument();
      });
    });

    it('does NOT render ParsedItemsSection content when approved', async () => {
      renderPage();

      await waitFor(() => {
        // Should NOT show content from parsedSections (which has wrong data)
        expect(screen.queryByText(/WRONG - this is from parsedSections/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\{\{03:33\}\}/)).not.toBeInTheDocument();
      });
    });

    it('renders approved status badge', async () => {
      renderPage();

      await waitFor(() => {
        // StatusBadge renders "Approved" text (appears in header and metadata panel)
        const approvedBadges = screen.getAllByText('Approved');
        expect(approvedBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders summary section in read-only mode', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Summary')).toBeInTheDocument();
        expect(screen.getByText('Discussed project updates and next steps.')).toBeInTheDocument();
      });
    });

    it('renders all three approved item sections', async () => {
      renderPage();

      await waitFor(() => {
        // Section headers from ApprovedItemsSection
        expect(screen.getByText('Action Items')).toBeInTheDocument();
        expect(screen.getByText('Decisions')).toBeInTheDocument();
        expect(screen.getByText('Learnings')).toBeInTheDocument();
      });
    });

    it('shows check icons for approved items', async () => {
      renderPage();

      await waitFor(() => {
        // ApprovedItemsSection renders CheckCircle2 icons for each item
        // There are 4 approved items total (2 actions + 1 decision + 1 learning)
        const checkIcons = document.querySelectorAll('.text-status-approved');
        expect(checkIcons.length).toBeGreaterThanOrEqual(4);
      });
    });
  });

  describe('processed status rendering', () => {
    beforeEach(() => {
      mockUseMeeting.mockReturnValue({
        data: processedMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('renders ReviewItemsSection when status is processed', async () => {
      renderPage();

      await waitFor(() => {
        // ReviewItemsSection shows "Review Items" header
        expect(screen.getByText('Review Items')).toBeInTheDocument();
        // And item text from reviewItems
        expect(screen.getByText('Send follow-up email')).toBeInTheDocument();
        expect(screen.getByText('Go with vendor A')).toBeInTheDocument();
        expect(screen.getByText('Team prefers async')).toBeInTheDocument();
      });
    });

    it('renders "Needs Review" badge when processed', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Needs Review')).toBeInTheDocument();
      });
    });

    it('shows Save & Approve button when processed', async () => {
      renderPage();

      await waitFor(() => {
        // Header button
        const saveButton = screen.getAllByRole('button', { name: /save & approve/i })[0];
        expect(saveButton).toBeInTheDocument();
      });
    });
  });

  describe('synced status rendering', () => {
    beforeEach(() => {
      mockUseMeeting.mockReturnValue({
        data: baseMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('renders "Ready to process" banner when synced', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ready to process')).toBeInTheDocument();
      });
    });

    it('renders "Needs Processing" badge when synced', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Needs Processing')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows skeleton during loading', async () => {
      mockUseMeeting.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      const { container } = renderPage();

      await waitFor(() => {
        // Should show skeleton elements
        const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('error state', () => {
    it('shows error message when meeting fails to load', async () => {
      mockUseMeeting.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('process meeting dialog with area selection', () => {
    beforeEach(() => {
      mockUseMeeting.mockReturnValue({
        data: baseMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('shows Process Meeting dialog when Process button is clicked', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ready to process')).toBeInTheDocument();
      });

      // Click Process Meeting button in MetadataPanel
      const processButton = screen.getByRole('button', { name: /process meeting/i });
      await user.click(processButton);

      await waitFor(() => {
        // Dialog title appears (along with button text) — use heading role
        expect(screen.getByRole('heading', { name: 'Process Meeting' })).toBeInTheDocument();
        expect(screen.getByText(/analyze the transcript/i)).toBeInTheDocument();
      });
    });

    it('shows area dropdown with areas from suggestion hook', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ready to process')).toBeInTheDocument();
      });

      const processButton = screen.getByRole('button', { name: /process meeting/i });
      await user.click(processButton);

      await waitFor(() => {
        // Area label present in dialog
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Area')).toBeInTheDocument();
        expect(within(dialog).getByText(/product area to provide richer context/i)).toBeInTheDocument();
      });
    });

    it('shows loading spinner when areas are loading', async () => {
      mockUseAreaSuggestion.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ready to process')).toBeInTheDocument();
      });

      const processButton = screen.getByRole('button', { name: /process meeting/i });
      await user.click(processButton);

      await waitFor(() => {
        expect(screen.getByText('Loading areas…')).toBeInTheDocument();
      });
    });

    it('calls processMutation with area when Process is clicked', async () => {
      const mutate = vi.fn((_opts?: unknown, _callbacks?: unknown) => {});
      mockUseProcessMeeting.mockReturnValue({ mutate, isPending: false });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ready to process')).toBeInTheDocument();
      });

      const processButton = screen.getByRole('button', { name: /process meeting/i });
      await user.click(processButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Process Meeting' })).toBeInTheDocument();
      });

      // Click the "Process" button in the dialog (has Sparkles icon prefix)
      const dialog = screen.getByRole('dialog');
      const dialogProcessButton = within(dialog).getByRole('button', { name: /process/i });
      await user.click(dialogProcessButton);

      expect(mutate).toHaveBeenCalled();
      const callArgs = mutate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.area).toBe('growth'); // Pre-filled from suggestion
    });

    it('sends undefined area when None is selected', async () => {
      mockUseAreaSuggestion.mockReturnValue({
        data: { suggestion: null, areas: ['growth', 'platform'] },
        isLoading: false,
        error: null,
      });
      const mutate = vi.fn((_opts?: unknown, _callbacks?: unknown) => {});
      mockUseProcessMeeting.mockReturnValue({ mutate, isPending: false });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ready to process')).toBeInTheDocument();
      });

      const processButton = screen.getByRole('button', { name: /process meeting/i });
      await user.click(processButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Process Meeting' })).toBeInTheDocument();
      });

      // No suggestion, so default should be None → area undefined
      const dialog = screen.getByRole('dialog');
      const dialogProcessButton = within(dialog).getByRole('button', { name: /process/i });
      await user.click(dialogProcessButton);

      // No suggestion → default is __none__ → area should be omitted
      expect(mutate).toHaveBeenCalled();
      const callArgs = mutate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.area).toBeUndefined();
    });
  });

  describe('reprocess dialog area selection', () => {
    beforeEach(() => {
      // Use approved meeting (Reprocess button only visible for approved meetings)
      mockUseMeeting.mockReturnValue({
        data: approvedMeeting,
        isLoading: false,
        error: null,
      });
    });

    it('shows area dropdown in reprocess dialog', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reprocess meeting/i })).toBeInTheDocument();
      });

      const reprocessButton = screen.getByRole('button', { name: /reprocess meeting/i });
      await user.click(reprocessButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Reprocess Meeting' })).toBeInTheDocument();
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Area')).toBeInTheDocument();
      });
    });

    it('calls processMutation with area on reprocess', async () => {
      const mutate = vi.fn((_opts?: unknown, _callbacks?: unknown) => {});
      mockUseProcessMeeting.mockReturnValue({ mutate, isPending: false });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reprocess meeting/i })).toBeInTheDocument();
      });

      const reprocessButton = screen.getByRole('button', { name: /reprocess meeting/i });
      await user.click(reprocessButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Reprocess Meeting' })).toBeInTheDocument();
      });

      // Click Reprocess in dialog
      const dialog = screen.getByRole('dialog');
      const dialogReprocessButton = within(dialog).getByRole('button', { name: /reprocess/i });
      await user.click(dialogReprocessButton);

      expect(mutate).toHaveBeenCalled();
      const callArgs = mutate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.area).toBe('growth'); // Pre-filled from suggestion
    });
  });
});
