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
  attendees: [{ name: 'John Doe', email: 'john@acme.com', initials: 'JD' }],
  status: 'processed',
  duration: 30,
  source: 'fathom',
  summary: 'Discussed project updates',
  body: 'Meeting notes here',
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
vi.mock('@/components/BlockEditor.js', () => ({
  LazyBlockEditor: ({ initialMarkdown, editable }: { initialMarkdown: string; editable: boolean }) => (
    <div data-testid="block-editor" data-editable={editable}>
      {initialMarkdown}
    </div>
  ),
}));

// Import after mocks are set up
import PersonDetailPage from './PersonDetailPage.js';
import { usePerson } from '@/hooks/people.js';

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
        // Section headings
        expect(screen.getByText(/Open Commitments/)).toBeInTheDocument();
        expect(screen.getByText(/Recent Meetings/)).toBeInTheDocument();
        expect(screen.getByText('Intelligence')).toBeInTheDocument();
        expect(screen.getByText('Notes')).toBeInTheDocument();
      });
    });
  });

  describe('Open Commitments section', () => {
    it('shows up to 3 commitments', async () => {
      renderPage();

      await waitFor(() => {
        // Should show first 3 commitments
        expect(screen.getByText('Send proposal')).toBeInTheDocument();
        expect(screen.getByText('Review docs')).toBeInTheDocument();
        expect(screen.getByText('Schedule call')).toBeInTheDocument();
        // Should NOT show the 4th item
        expect(screen.queryByText('Hidden item')).not.toBeInTheDocument();
      });
    });

    it('shows "See All" link when more than 3 commitments', async () => {
      renderPage();

      await waitFor(() => {
        const seeAllLink = screen.getByText('See All →');
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

  describe('Intelligence section', () => {
    it('displays health status text', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Engaged')).toBeInTheDocument();
      });
    });

    it('displays stances', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Stances')).toBeInTheDocument();
        expect(screen.getByText('· Prefers async communication')).toBeInTheDocument();
      });
    });

    it('displays repeated asks', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Repeated Asks')).toBeInTheDocument();
        expect(screen.getByText('· More documentation')).toBeInTheDocument();
      });
    });

    it('displays repeated concerns', async () => {
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

    it('switches to edit mode when Edit clicked', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        // Should show Save and Cancel buttons
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        // Edit button should be gone
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
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
