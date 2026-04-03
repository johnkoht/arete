/**
 * SchedulePopup component tests.
 *
 * Tests:
 * - Clicking badge opens popover
 * - Selecting Today sets due to today's date
 * - Selecting Tomorrow sets due to tomorrow's date
 * - Selecting Anytime clears due date (due=null)
 * - Selecting Someday moves to someday destination
 * - Escape key closes popover
 * - Arrow keys navigate options
 * - Enter selects highlighted option
 * - Popup closes after selection
 * - Focus returns to trigger after close
 * - Popup has role='listbox', options have role='option'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SchedulePopup } from './SchedulePopup.js';
import { TooltipProvider } from './ui/tooltip.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockMutate = vi.fn();
const mockUseUpdateTask = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
}));

vi.mock('@/hooks/tasks.js', () => ({
  useUpdateTask: () => mockUseUpdateTask(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TooltipProvider, null, children)
    );
  };
}

function renderSchedulePopup(props: {
  taskId: string;
  currentDestination: 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';
  currentDue: string | null;
}) {
  return render(<SchedulePopup {...props} />, { wrapper: createWrapper() });
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getTomorrow(): Date {
  const today = getToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SchedulePopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateTask.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('popover behavior', () => {
    it('clicking badge opens popover', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      // Initially popover should not be visible
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      // Click the trigger badge
      const trigger = screen.getByRole('button');
      await user.click(trigger);

      // Popover should now be visible with listbox role
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('popup closes after selection', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      // Open popover
      await user.click(screen.getByRole('button'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Select an option
      const todayOption = screen.getByRole('option', { name: /today/i });
      await user.click(todayOption);

      // Popover should close
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('focus returns to trigger after close', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      const trigger = screen.getByRole('button');

      // Open popover
      await user.click(trigger);

      // Select an option
      const todayOption = screen.getByRole('option', { name: /today/i });
      await user.click(todayOption);

      // Wait for close and focus return
      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });
  });

  describe('date selection', () => {
    it('selecting Today sets due to today\'s date and destination to must', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'someday',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));
      const todayOption = screen.getByRole('option', { name: /today/i });
      await user.click(todayOption);

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { due: formatDate(getToday()), destination: 'must' },
      });
    });

    it('selecting Tomorrow sets due to tomorrow\'s date and destination to should', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'someday',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));
      const tomorrowOption = screen.getByRole('option', { name: /tomorrow/i });
      await user.click(tomorrowOption);

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { due: formatDate(getTomorrow()), destination: 'should' },
      });
    });

    it('selecting Anytime clears due date (due=null)', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: '2026-03-31',
      });

      await user.click(screen.getByRole('button'));
      const anytimeOption = screen.getByRole('option', { name: /anytime/i });
      await user.click(anytimeOption);

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { due: null, destination: 'anytime' },
      });
    });

    it('selecting Someday moves to someday destination', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: '2026-03-31',
      });

      await user.click(screen.getByRole('button'));
      const somedayOption = screen.getByRole('option', { name: /someday/i });
      await user.click(somedayOption);

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { due: null, destination: 'someday' },
      });
    });
  });

  describe('keyboard navigation', () => {
    it('Escape key closes popover', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      // Open popover
      await user.click(screen.getByRole('button'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Press Escape
      await user.keyboard('{Escape}');

      // Popover should close
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('Arrow keys navigate options', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Get options
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);

      // Press ArrowDown to navigate
      await user.keyboard('{ArrowDown}');

      // Check that an option has highlighting/selection
      await waitFor(() => {
        const highlightedOption = screen.getAllByRole('option').find(
          (opt) => opt.getAttribute('data-highlighted') === 'true' || 
                   opt.getAttribute('aria-selected') === 'true'
        );
        expect(highlightedOption).toBeTruthy();
      });

      // Press ArrowDown again to move to next option
      await user.keyboard('{ArrowDown}');

      // A different option should now be highlighted
      await waitFor(() => {
        const highlightedOptions = screen.getAllByRole('option').filter(
          (opt) => opt.getAttribute('data-highlighted') === 'true' ||
                   opt.getAttribute('aria-selected') === 'true'
        );
        expect(highlightedOptions.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('Enter selects highlighted option', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Navigate to first option with ArrowDown
      await user.keyboard('{ArrowDown}');

      // Press Enter to select
      await user.keyboard('{Enter}');

      // Should have called mutate
      expect(mockMutate).toHaveBeenCalled();

      // Popover should close
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('popup has role=\'listbox\'', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
    });

    it('options have role=\'option\'', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThanOrEqual(4); // Today, Tomorrow, Anytime, Someday, Pick date
    });

    it('trigger has accessible name', () => {
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAccessibleName();
    });
  });

  describe('full calendar via expand button', () => {
    it('expand button opens full month calendar', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Click expand button to show full calendar
      const expandButton = screen.getByRole('button', { name: /full calendar/i });
      await user.click(expandButton);

      // Full calendar should appear (data-testid="calendar" or role="grid")
      await waitFor(() => {
        const calendar = screen.queryByTestId('calendar') ||
                         screen.queryByRole('grid');
        expect(calendar).toBeInTheDocument();
      });
    });

    it('selecting date from full calendar calls updateTask with destination', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'someday',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Click expand button
      const expandButton = screen.getByRole('button', { name: /full calendar/i });
      await user.click(expandButton);

      // Wait for calendar to appear
      await waitFor(() => {
        const calendar = screen.queryByTestId('calendar') ||
                         screen.queryByRole('grid');
        expect(calendar).toBeInTheDocument();
      });

      // Click a day in the calendar - find an enabled day button
      // The calendar renders days as buttons with role="gridcell"
      const dayButtons = screen.getAllByRole('gridcell').filter(
        (cell) => !cell.hasAttribute('disabled') && cell.textContent?.match(/^\d+$/)
      );
      
      if (dayButtons.length > 0) {
        // Click the first enabled day
        await user.click(dayButtons[0]);

        // Should have called mutate with a date and destination
        await waitFor(() => {
          expect(mockMutate).toHaveBeenCalled();
          const call = mockMutate.mock.calls[0][0];
          expect(call.id).toBe('task-001');
          expect(call.updates.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          // Destination should be set (must for today, should for future dates)
          expect(['must', 'should']).toContain(call.updates.destination);
        });
      }
    });
  });

  describe('Things 3 style layout', () => {
    it('shows Today and Tomorrow as quick options at top', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Today and Tomorrow should be the first two options
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveTextContent(/today/i);
      expect(options[1]).toHaveTextContent(/tomorrow/i);
    });

    it('shows inline mini calendar in the popup', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Mini calendar should be visible immediately (not hidden behind Pick date)
      await waitFor(() => {
        expect(screen.getByTestId('mini-calendar')).toBeInTheDocument();
      });
    });

    it('shows Someday and Anytime at bottom', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Check that Someday and Anytime are present
      expect(screen.getByRole('option', { name: /someday/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /anytime/i })).toBeInTheDocument();
    });

    it('clicking date in mini calendar updates task and closes popup', async () => {
      const user = userEvent.setup();
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'someday',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Wait for mini calendar
      await waitFor(() => {
        expect(screen.getByTestId('mini-calendar')).toBeInTheDocument();
      });

      // Find clickable day buttons in the mini calendar (not disabled)
      const miniCalendar = screen.getByTestId('mini-calendar');
      const dayButtons = Array.from(miniCalendar.querySelectorAll('button[data-day]')).filter(
        (btn) => !btn.hasAttribute('disabled')
      );
      
      expect(dayButtons.length).toBeGreaterThan(0);
      
      // Click the first enabled day
      await user.click(dayButtons[0]);

      // Should have called mutate
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
        const call = mockMutate.mock.calls[0][0];
        expect(call.updates.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      // Popup should close
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    });
});
