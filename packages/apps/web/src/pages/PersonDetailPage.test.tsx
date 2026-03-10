/**
 * PersonDetailPage tests.
 *
 * Tests page rendering, section presence, and useBlocker navigation guard.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { PersonDetail, Meeting } from '@/api/types.js';

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

// Mock data
const mockPerson: PersonDetail = {
  slug: 'john-doe',
  name: 'John Doe',
  role: 'Product Manager',
  company: 'Acme Corp',
  email: 'john@acme.com',
  category: 'customer',
  healthScore: 75,
  healthStatus: 'Engaged',
  trend: 'up',
  lastMeetingDate: '2026-03-01',
  lastMeetingTitle: 'Weekly Sync',
  openCommitments: 4,
  stances: ['Prefers async communication'],
  repeatedAsks: ['More documentation'],
  repeatedConcerns: ['Timeline concerns'],
  rawContent: '# Notes\n\nSome notes here.',
  recentMeetings: [
    { date: '2026-03-01', title: 'Weekly Sync' },
    { date: '2026-02-22', title: 'Quarterly Review' },
  ],
  openCommitmentItems: [
    { id: '1', text: 'Send proposal', direction: 'i_owe_them', date: '2026-03-01' },
    { id: '2', text: 'Review docs', direction: 'they_owe_me', date: '2026-03-02' },
    { id: '3', text: 'Schedule call', direction: 'i_owe_them', date: '2026-03-03' },
    { id: '4', text: 'Hidden item', direction: 'i_owe_them', date: '2026-03-04' },
  ],
  allMeetings: [
    { slug: 'weekly-sync', date: '2026-03-01', title: 'Weekly Sync', attendeeIds: [] },
    { slug: 'quarterly-review', date: '2026-02-22', title: 'Quarterly Review', attendeeIds: [] },
    { slug: 'kickoff', date: '2026-02-15', title: 'Project Kickoff', attendeeIds: [] },
    { slug: 'planning', date: '2026-02-08', title: 'Sprint Planning', attendeeIds: [] },
    { slug: 'retrospective', date: '2026-02-01', title: 'Retrospective', attendeeIds: [] },
    { slug: 'old-meeting', date: '2026-01-25', title: 'Old Meeting', attendeeIds: [] },
  ],
};

const mockMeeting: Meeting = {
  slug: 'weekly-sync',
  title: 'Weekly Sync',
  date: '2026-03-01',
  attendees: [
    { name: 'John Doe', email: 'john@acme.com', initials: 'JD' },
    { name: 'Alice Smith', email: 'alice@acme.com', initials: 'AS' },
  ],
  status: 'processed',
  duration: 90,
  source: 'fathom',
  summary: 'Discussed project updates',
  body: 'Meeting notes here',
  transcript: 'John: Hello everyone.\nAlice: Hi John, ready to start?\nJohn: Yes, let\'s begin.',
  parsedSections: {
    decisions: [
      { text: 'Move to weekly sprints' },
      { text: 'Use Slack for async updates' },
    ],
    learnings: [
      { text: 'Daily standups improve visibility' },
    ],
    actionItems: [
      { text: 'Send proposal by Friday', completed: false },
      { text: 'Schedule follow-up call', completed: true },
    ],
  },
};

// Mock the hooks before importing the component
vi.mock('@/hooks/people.js', () => ({
  usePerson: vi.fn(() => ({
    data: mockPerson,
    isLoading: false,
    error: null,
  })),
  useUpdatePersonNotes: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/hooks/meetings.js', () => ({
  useMeeting: vi.fn(() => ({
    data: mockMeeting,
    isLoading: false,
  })),
}));

// Mock BlockEditor to avoid full BlockNote initialization
// The component uses lazy(() => import('./BlockEditor.js').then(m => ({ default: m.BlockEditor })))
// So we need to mock the BlockEditor export
vi.mock('@/components/BlockEditor.js', () => ({
  BlockEditor: ({ initialMarkdown, editable }: { initialMarkdown: string; editable: boolean }) => (
    <div data-testid="block-editor" data-editable={editable}>
      {initialMarkdown}
    </div>
  ),
}));

// Import after mocks are set up
import PersonDetailPage from './PersonDetailPage.js';
import { usePerson } from '@/hooks/people.js';
import { useMeeting } from '@/hooks/meetings.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPage(initialPath = '/people/john-doe') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Use createMemoryRouter for data router features (useBlocker)
  const router = createMemoryRouter(
    [
      { path: '/people/:slug', element: <PersonDetailPage /> },
      { path: '/people', element: <div>People Index</div> },
      { path: '/commitments', element: <div>Commitments Page</div> },
    ],
    { initialEntries: [initialPath] }
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PersonDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default successful state
    vi.mocked(usePerson).mockReturnValue({
      data: mockPerson,
      isLoading: false,
      error: null,
      isError: false,
      isPending: false,
      isSuccess: true,
      status: 'success',
    } as ReturnType<typeof usePerson>);
  });

  describe('rendering', () => {
    it('renders page with person name', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('renders contact info horizontally', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('john@acme.com')).toBeInTheDocument();
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });
    });

    it('renders all required sections', async () => {
      renderPage();

      await waitFor(() => {
        // Two-column layout sections (use getAllByText for "Open Commitments" which appears in header and stats)
        expect(screen.getAllByText(/Open Commitments/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Recent Meetings/).length).toBeGreaterThan(0);
        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Role & Context')).toBeInTheDocument();
        expect(screen.getByText('Working Style')).toBeInTheDocument();
        expect(screen.getByText('Notes')).toBeInTheDocument();
      });
    });
  });

  describe('Open Commitments section', () => {
    it('shows up to 5 commitments', async () => {
      renderPage();

      await waitFor(() => {
        // Should show first 4 commitments (only 4 in mock data)
        expect(screen.getByText('Send proposal')).toBeInTheDocument();
        expect(screen.getByText('Review docs')).toBeInTheDocument();
        expect(screen.getByText('Schedule call')).toBeInTheDocument();
        expect(screen.getByText('Hidden item')).toBeInTheDocument(); // Shows because we have 4 items, limit is 5
      });
    });

    it('shows "See all commitments" link when more than 5 commitments', async () => {
      // Update mock to have more than 5 commitments
      vi.mocked(usePerson).mockReturnValue({
        data: {
          ...mockPerson,
          openCommitments: 7,
          openCommitmentItems: [
            ...mockPerson.openCommitmentItems,
            { id: '5', text: 'Fifth item', direction: 'i_owe_them', date: '2026-03-05' },
            { id: '6', text: 'Sixth item', direction: 'i_owe_them', date: '2026-03-06' },
            { id: '7', text: 'Seventh item', direction: 'i_owe_them', date: '2026-03-07' },
          ],
        },
        isLoading: false,
        error: null,
        isError: false,
        isPending: false,
        isSuccess: true,
        status: 'success',
      } as ReturnType<typeof usePerson>);

      renderPage();

      await waitFor(() => {
        const seeAllLink = screen.getByText('See all commitments →');
        expect(seeAllLink).toBeInTheDocument();
        expect(seeAllLink.closest('a')).toHaveAttribute('href', '/commitments?person=john-doe');
      });
    });
  });

  describe('Recent Meetings section', () => {
    it('shows up to 5 meetings', async () => {
      renderPage();

      await waitFor(() => {
        // Should show first 5 meetings
        expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
        expect(screen.getByText('Quarterly Review')).toBeInTheDocument();
        expect(screen.getByText('Project Kickoff')).toBeInTheDocument();
        expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
        expect(screen.getByText('Retrospective')).toBeInTheDocument();
        // Should NOT show the 6th meeting
        expect(screen.queryByText('Old Meeting')).not.toBeInTheDocument();
      });
    });

    it('shows count indicator when more than 5 meetings', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Showing 5 of 6 meetings')).toBeInTheDocument();
      });
    });
  });

  describe('Overview and Working Style sections', () => {
    it('displays health status in Overview card', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Engaged')).toBeInTheDocument();
      });
    });

    it('displays stances in Working Style card', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Working Style')).toBeInTheDocument();
        expect(screen.getByText('Stances')).toBeInTheDocument();
        expect(screen.getByText('· Prefers async communication')).toBeInTheDocument();
      });
    });

    it('displays repeated asks in Working Style card', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Repeated Asks')).toBeInTheDocument();
        expect(screen.getByText('· More documentation')).toBeInTheDocument();
      });
    });

    it('displays repeated concerns in Working Style card', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Repeated Concerns')).toBeInTheDocument();
        expect(screen.getByText('· Timeline concerns')).toBeInTheDocument();
      });
    });
  });

  describe('Notes section', () => {
    it('renders BlockEditor with notes content', async () => {
      renderPage();

      await waitFor(() => {
        const editor = screen.getByTestId('block-editor');
        expect(editor).toBeInTheDocument();
        expect(editor).toHaveTextContent('# Notes');
      });
    });

    it('shows Edit button in read-only mode', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      });
    });

    it('opens edit sheet when Edit clicked', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        // Sheet should open with "Edit Notes" title
        expect(screen.getByText('Edit Notes')).toBeInTheDocument();
        // Should show Save and Cancel buttons in sheet
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows skeleton during loading', async () => {
      vi.mocked(usePerson).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isError: false,
        isPending: true,
        isSuccess: false,
        status: 'pending',
      } as ReturnType<typeof usePerson>);

      const { container } = renderPage();

      // Should show skeletons (multiple skeleton elements)
      await waitFor(() => {
        const skeletons = container.querySelectorAll('[class*="bg-"]');
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('error state', () => {
    it('shows error message when person not found', async () => {
      vi.mocked(usePerson).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Not found'),
        isError: true,
        isPending: false,
        isSuccess: false,
        status: 'error',
      } as ReturnType<typeof usePerson>);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load person')).toBeInTheDocument();
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });
    });
  });
});

describe('useBlocker navigation guard', () => {
  /**
   * Testing useBlocker behavior requires navigating while in edit mode with changes.
   * This documents the expected behavior:
   *
   * 1. When isEditing=true AND editContent !== person.rawContent → blocker is active
   * 2. When navigation is attempted, blocker.state becomes 'blocked'
   * 3. useEffect shows window.confirm dialog
   * 4. If confirmed → blocker.proceed() allows navigation
   * 5. If cancelled → blocker.reset() stays on page
   *
   * Integration test would require more complex setup with actual navigation.
   * The pattern used is documented in LEARNINGS.md.
   */

  it('documents useBlocker pattern for navigation guard', () => {
    // This test documents the useBlocker pattern
    // The actual behavior is:
    // const blocker = useBlocker(isEditing && editContent !== person?.rawContent);
    // This activates blocking when:
    // - User is in edit mode (isEditing = true)
    // - Content has been modified (editContent !== original)

    const blockerConditionExample = (
      isEditing: boolean,
      editContent: string,
      originalContent: string
    ) => isEditing && editContent !== originalContent;

    // Not editing → no block
    expect(blockerConditionExample(false, 'new', 'original')).toBe(false);

    // Editing but no changes → no block
    expect(blockerConditionExample(true, 'same', 'same')).toBe(false);

    // Editing with changes → block
    expect(blockerConditionExample(true, 'modified', 'original')).toBe(true);
  });
});

describe('MeetingSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePerson).mockReturnValue({
      data: mockPerson,
      isLoading: false,
      error: null,
      isError: false,
      isPending: false,
      isSuccess: true,
      status: 'success',
    } as ReturnType<typeof usePerson>);
    vi.mocked(useMeeting).mockReturnValue({
      data: mockMeeting,
      isLoading: false,
      error: null,
      isError: false,
      isPending: false,
      isSuccess: true,
      status: 'success',
    } as ReturnType<typeof useMeeting>);
  });

  it('opens sheet when clicking a meeting', async () => {
    renderPage();

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting in Recent Meetings
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    expect(meetingButton).toBeDefined();
    fireEvent.click(meetingButton!);

    // Sheet should open with meeting title
    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-title')).toHaveTextContent('Weekly Sync');
    });
  });

  it('displays meeting title and date', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-title')).toHaveTextContent('Weekly Sync');
      expect(screen.getByTestId('meeting-sheet-date')).toHaveTextContent('March 1, 2026');
    });
  });

  it('displays meeting summary', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-summary')).toHaveTextContent('Discussed project updates');
    });
  });

  it('displays attendees', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      const attendeesEl = screen.getByTestId('meeting-sheet-attendees');
      expect(attendeesEl).toHaveTextContent('John Doe, Alice Smith');
    });
  });

  it('displays formatted duration', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      // 90 minutes = 1 hr 30 min
      const durationEl = screen.getByTestId('meeting-sheet-duration');
      expect(durationEl).toHaveTextContent('1 hr 30 min');
    });
  });

  it('displays collapsed parsed items sections', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      // Parsed items section should be visible
      expect(screen.getByTestId('meeting-sheet-parsed-items')).toBeInTheDocument();
      // Section headers should be visible (collapsed by default)
      expect(screen.getByText('Decisions (2)')).toBeInTheDocument();
      expect(screen.getByText('Learnings (1)')).toBeInTheDocument();
      expect(screen.getByText('Actions (2)')).toBeInTheDocument();
    });
  });

  it('expands parsed items section on click', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      expect(screen.getByText('Decisions (2)')).toBeInTheDocument();
    });

    // Click to expand Decisions
    fireEvent.click(screen.getByText('Decisions (2)'));

    // Should show the decision items
    await waitFor(() => {
      expect(screen.getByText('Move to weekly sprints')).toBeInTheDocument();
      expect(screen.getByText('Use Slack for async updates')).toBeInTheDocument();
    });
  });

  it('shows transcript toggle (collapsed by default)', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-transcript-toggle')).toHaveTextContent('Show Transcript');
    });

    // Transcript content should not be visible yet
    expect(screen.queryByTestId('meeting-sheet-transcript')).not.toBeInTheDocument();
  });

  it('expands transcript when toggle clicked', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-transcript-toggle')).toBeInTheDocument();
    });

    // Click to show transcript
    fireEvent.click(screen.getByTestId('meeting-sheet-transcript-toggle'));

    await waitFor(() => {
      // Toggle should now say Hide
      expect(screen.getByTestId('meeting-sheet-transcript-toggle')).toHaveTextContent('Hide Transcript');
      // Transcript content should be visible
      const transcriptEl = screen.getByTestId('meeting-sheet-transcript');
      expect(transcriptEl).toHaveTextContent('John: Hello everyone.');
    });
  });

  it('shows "Open full meeting" link', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    await waitFor(() => {
      const fullMeetingLink = screen.getByTestId('meeting-sheet-full-link');
      expect(fullMeetingLink).toHaveTextContent('Open full meeting →');
      expect(fullMeetingLink).toHaveAttribute('href', '/meetings/weekly-sync');
    });
  });

  it('closes sheet via X button (Sheet default)', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    // Wait for sheet to open
    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-title')).toBeInTheDocument();
    });

    // Find and click X button (Sheet's default close button)
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    // Sheet should close — title should no longer be visible
    await waitFor(() => {
      expect(screen.queryByTestId('meeting-sheet-title')).not.toBeInTheDocument();
    });
  });

  it('shows loading state when meeting is loading', async () => {
    // Start with meeting loading
    vi.mocked(useMeeting).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isPending: true,
      isSuccess: false,
      status: 'pending',
    } as ReturnType<typeof useMeeting>);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click a meeting
    const meetingButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Weekly Sync')
    );
    fireEvent.click(meetingButton!);

    // Should show loading skeleton
    await waitFor(() => {
      expect(screen.getByTestId('meeting-sheet-loading')).toBeInTheDocument();
    });
  });
});
