/**
 * MeetingDetail tests.
 *
 * Tests page rendering for different meeting statuses, ensuring the correct
 * components are rendered for each state (synced, processed, approved).
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/hooks/meetings.js', () => ({
  useMeeting: (slug: string) => mockUseMeeting(slug),
  useMeetings: () => mockUseMeetings(),
  useApproveItem: () => mockUseApproveItem(),
  useSaveApprove: () => mockUseSaveApprove(),
  useProcessMeeting: () => mockUseProcessMeeting(),
  useDeleteMeeting: () => mockUseDeleteMeeting(),
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
});
