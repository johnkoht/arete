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
import { render, screen, waitFor, act } from '@testing-library/react';
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

// Mock date for consistent testing
const MOCK_TODAY = new Date('2026-03-31T12:00:00.000Z');
const MOCK_TOMORROW = new Date('2026-04-01T12:00:00.000Z');

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SchedulePopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_TODAY);
    mockUseUpdateTask.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('popover behavior', () => {
    it('clicking badge opens popover', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
    it('selecting Today sets due to today\'s date', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));
      const todayOption = screen.getByRole('option', { name: /today/i });
      await user.click(todayOption);

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { due: formatDate(MOCK_TODAY) },
      });
    });

    it('selecting Tomorrow sets due to tomorrow\'s date', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));
      const tomorrowOption = screen.getByRole('option', { name: /tomorrow/i });
      await user.click(tomorrowOption);

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { due: formatDate(MOCK_TOMORROW) },
      });
    });

    it('selecting Anytime clears due date (due=null)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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

      // First option should be highlighted (aria-selected)
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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

  describe('calendar date picker', () => {
    it('Pick date option opens calendar', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Click Pick date option
      const pickDateOption = screen.getByRole('option', { name: /pick date/i });
      await user.click(pickDateOption);

      // Calendar should appear
      await waitFor(() => {
        // Calendar uses role="grid" for the day grid
        const calendar = document.querySelector('[data-testid="calendar"]') ||
                         screen.queryByRole('grid');
        expect(calendar).toBeInTheDocument();
      });
    });

    it('selecting date from calendar calls updateTask', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSchedulePopup({
        taskId: 'task-001',
        currentDestination: 'must',
        currentDue: null,
      });

      await user.click(screen.getByRole('button'));

      // Click Pick date option
      const pickDateOption = screen.getByRole('option', { name: /pick date/i });
      await user.click(pickDateOption);

      // Wait for calendar to appear
      await waitFor(() => {
        const calendar = document.querySelector('[data-testid="calendar"]') ||
                         screen.queryByRole('grid');
        expect(calendar).toBeInTheDocument();
      });

      // Click a day in the calendar (click "15" which should be visible)
      const dayButton = screen.getByRole('gridcell', { name: /15/i });
      if (dayButton) {
        await user.click(dayButton);

        // Should have called mutate with the selected date
        await waitFor(() => {
          expect(mockMutate).toHaveBeenCalled();
        });
      }
    });
  });
});
