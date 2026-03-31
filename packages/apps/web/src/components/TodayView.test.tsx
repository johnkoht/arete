/**
 * TodayView component tests.
 *
 * Tests:
 * - Tasks section renders with overdue sorted first
 * - Suggestions section renders separately
 * - Suggestions skeleton while loading
 * - Tasks visible when suggestions fail
 * - Suggestions visible when tasks fail (with tasks error state)
 * - Set Today button updates due to today's date
 * - Schedule button opens date picker
 * - Punt button moves to anytime destination
 * - Toast confirms successful action
 * - Toast shows error on failed action
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TodayView } from './TodayView.js';
import { TooltipProvider } from './ui/tooltip.js';
import type { Task, SuggestedTask } from '@/api/types.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

// Mock useTasks hook
const mockUseTasks = vi.fn();

// Mock useTaskSuggestions hook
const mockUseTaskSuggestions = vi.fn();

// Mock useUpdateTask hook
const mockUpdateMutate = vi.fn();
const mockUseUpdateTask = vi.fn(() => ({
  mutate: mockUpdateMutate,
  isPending: false,
  isError: false,
  error: null,
}));

// Mock useCompleteTask hook
const mockCompleteMutate = vi.fn();
const mockUseCompleteTask = vi.fn(() => ({
  mutate: mockCompleteMutate,
  isPending: false,
  pendingTaskId: null as string | null,
}));

vi.mock('@/hooks/tasks.js', () => ({
  useTasks: () => mockUseTasks(),
  useTaskSuggestions: () => mockUseTaskSuggestions(),
  useUpdateTask: () => mockUseUpdateTask(),
  useCompleteTask: () => mockUseCompleteTask(),
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

function renderTodayView() {
  return render(<TodayView />, { wrapper: createWrapper() });
}

// ── Test Data ────────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

const TASK_DUE_TODAY: Task = {
  id: 'task-today-001',
  text: 'Task due today',
  destination: 'must',
  due: getToday(),
  area: null,
  project: null,
  person: null,
  from: null,
  completed: false,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const TASK_OVERDUE_1_DAY: Task = {
  id: 'task-overdue-1',
  text: 'Overdue 1 day',
  destination: 'must',
  due: getYesterday(),
  area: null,
  project: null,
  person: null,
  from: null,
  completed: false,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const TASK_OVERDUE_3_DAYS: Task = {
  id: 'task-overdue-3',
  text: 'Overdue 3 days',
  destination: 'must',
  due: getDaysAgo(3),
  area: null,
  project: null,
  person: null,
  from: null,
  completed: false,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const SUGGESTED_TASK_1: SuggestedTask = {
  id: 'suggested-001',
  text: 'Suggested task 1',
  destination: 'anytime',
  due: null,
  area: null,
  project: null,
  person: null,
  from: null,
  completed: false,
  source: { file: 'now/tasks.md', section: 'Tasks' },
  score: 85,
  breakdown: {
    dueDate: 20,
    commitment: 30,
    meetingRelevance: 15,
    weekPriority: 20,
  },
};

const SUGGESTED_TASK_2: SuggestedTask = {
  id: 'suggested-002',
  text: 'Suggested task 2',
  destination: 'someday',
  due: null,
  area: null,
  project: null,
  person: { slug: 'john-doe', name: 'John Doe' },
  from: null,
  completed: false,
  source: { file: 'now/tasks.md', section: 'Tasks' },
  score: 72,
  breakdown: {
    dueDate: 10,
    commitment: 25,
    meetingRelevance: 20,
    weekPriority: 17,
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TodayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: successful states with data
    mockUseTasks.mockReturnValue({
      data: { tasks: [TASK_DUE_TODAY], total: 1, offset: 0, limit: 50 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseTaskSuggestions.mockReturnValue({
      data: [SUGGESTED_TASK_1, SUGGESTED_TASK_2],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseUpdateTask.mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
      isError: false,
      error: null,
    });

    mockUseCompleteTask.mockReturnValue({
      mutate: mockCompleteMutate,
      isPending: false,
      pendingTaskId: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tasks section', () => {
    it('renders tasks section with "Tasks" heading', () => {
      renderTodayView();
      expect(screen.getByRole('heading', { name: /tasks/i })).toBeInTheDocument();
    });

    it('renders tasks due today', () => {
      renderTodayView();
      expect(screen.getByText('Task due today')).toBeInTheDocument();
    });

    it('renders overdue tasks sorted first by days overdue (desc)', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY, TASK_OVERDUE_1_DAY, TASK_OVERDUE_3_DAYS],
          total: 3,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();

      // Get all task texts in the Tasks section
      const tasksSection = screen.getByTestId('tasks-section');
      const taskTexts = within(tasksSection).getAllByTestId('task-text');
      const texts = taskTexts.map((el) => el.textContent);

      // Overdue tasks should come first, sorted by days overdue (most overdue first)
      expect(texts[0]).toBe('Overdue 3 days');
      expect(texts[1]).toBe('Overdue 1 day');
      expect(texts[2]).toBe('Task due today');
    });

    it('shows loading skeleton while tasks are loading', () => {
      mockUseTasks.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByTestId('tasks-loading')).toBeInTheDocument();
    });

    it('shows error state when tasks fail to load', () => {
      mockUseTasks.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText(/failed to load tasks/i)).toBeInTheDocument();
    });

    it('shows empty state when no tasks', () => {
      mockUseTasks.mockReturnValue({
        data: { tasks: [], total: 0, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText(/no tasks for today/i)).toBeInTheDocument();
    });
  });

  describe('suggestions section', () => {
    it('renders suggestions section with "Suggested" heading', () => {
      renderTodayView();
      expect(screen.getByRole('heading', { name: /suggested/i })).toBeInTheDocument();
    });

    it('renders suggested tasks', () => {
      renderTodayView();
      expect(screen.getByText('Suggested task 1')).toBeInTheDocument();
      expect(screen.getByText('Suggested task 2')).toBeInTheDocument();
    });

    it('shows skeleton while suggestions are loading', () => {
      mockUseTaskSuggestions.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByTestId('suggestions-loading')).toBeInTheDocument();
    });

    it('shows error state when suggestions fail to load', () => {
      mockUseTaskSuggestions.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('AI service unavailable'),
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText(/failed to load suggestions/i)).toBeInTheDocument();
    });

    it('shows empty state when no suggestions', () => {
      mockUseTaskSuggestions.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText(/no suggestions available/i)).toBeInTheDocument();
    });
  });

  describe('section independence (partial failure)', () => {
    it('shows tasks when suggestions fail', () => {
      mockUseTaskSuggestions.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('AI service unavailable'),
        refetch: vi.fn(),
      });

      renderTodayView();

      // Tasks should still be visible
      expect(screen.getByText('Task due today')).toBeInTheDocument();
      // Suggestions should show error
      expect(screen.getByText(/failed to load suggestions/i)).toBeInTheDocument();
    });

    it('shows suggestions when tasks fail (with tasks error state)', () => {
      mockUseTasks.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Backend unavailable'),
        refetch: vi.fn(),
      });

      renderTodayView();

      // Suggestions should still be visible
      expect(screen.getByText('Suggested task 1')).toBeInTheDocument();
      // Tasks should show error
      expect(screen.getByText(/failed to load tasks/i)).toBeInTheDocument();
    });
  });

  describe('suggestion action buttons', () => {
    it('renders Set Today button for each suggestion', () => {
      renderTodayView();
      const setTodayButtons = screen.getAllByRole('button', { name: /set today/i });
      expect(setTodayButtons).toHaveLength(2);
    });

    it('renders Schedule button for each suggestion', () => {
      renderTodayView();
      const scheduleButtons = screen.getAllByRole('button', { name: /schedule/i });
      expect(scheduleButtons).toHaveLength(2);
    });

    it('renders Punt button for each suggestion', () => {
      renderTodayView();
      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      expect(puntButtons).toHaveLength(2);
    });
  });

  describe('Set Today action', () => {
    it('updates task due date to today when clicked', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const setTodayButtons = screen.getAllByRole('button', { name: /set today/i });
      await user.click(setTodayButtons[0]);

      expect(mockUpdateMutate).toHaveBeenCalledWith(
        {
          id: 'suggested-001',
          updates: { due: getToday() },
        },
        expect.any(Object)
      );
    });

    it('shows success toast on successful Set Today', async () => {
      const user = userEvent.setup();

      // Mock successful mutation
      mockUpdateMutate.mockImplementation((_params, options) => {
        options?.onSuccess?.();
      });

      renderTodayView();

      const setTodayButtons = screen.getAllByRole('button', { name: /set today/i });
      await user.click(setTodayButtons[0]);

      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/set.*today/i));
    });

    it('shows error toast on failed Set Today', async () => {
      const user = userEvent.setup();

      // Mock failed mutation
      mockUpdateMutate.mockImplementation((_params, options) => {
        options?.onError?.(new Error('Update failed'));
      });

      renderTodayView();

      const setTodayButtons = screen.getAllByRole('button', { name: /set today/i });
      await user.click(setTodayButtons[0]);

      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed/i));
    });
  });

  describe('Schedule action', () => {
    it('opens date picker when Schedule button is clicked', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const scheduleButtons = screen.getAllByRole('button', { name: /schedule/i });
      await user.click(scheduleButtons[0]);

      // Date picker / calendar should be visible
      expect(screen.getByTestId('schedule-calendar')).toBeInTheDocument();
    });

    it('updates task due date when date is selected', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const scheduleButtons = screen.getAllByRole('button', { name: /schedule/i });
      await user.click(scheduleButtons[0]);

      // Click a date in the calendar (tomorrow's date button)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayButton = screen.getByRole('gridcell', { name: String(tomorrow.getDate()) });
      await user.click(dayButton);

      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'suggested-001',
          updates: expect.objectContaining({
            due: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Punt action', () => {
    it('moves task to anytime destination when clicked', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      await user.click(puntButtons[0]);

      expect(mockUpdateMutate).toHaveBeenCalledWith(
        {
          id: 'suggested-001',
          updates: { destination: 'anytime', due: null },
        },
        expect.any(Object)
      );
    });

    it('shows success toast on successful Punt', async () => {
      const user = userEvent.setup();

      mockUpdateMutate.mockImplementation((_params, options) => {
        options?.onSuccess?.();
      });

      renderTodayView();

      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      await user.click(puntButtons[0]);

      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/moved.*anytime/i));
    });

    it('shows error toast on failed Punt', async () => {
      const user = userEvent.setup();

      mockUpdateMutate.mockImplementation((_params, options) => {
        options?.onError?.(new Error('Update failed'));
      });

      renderTodayView();

      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      await user.click(puntButtons[0]);

      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed/i));
    });
  });

  describe('overdue badge', () => {
    it('shows overdue badge with days count for overdue tasks', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_OVERDUE_3_DAYS],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText(/3 days overdue/i)).toBeInTheDocument();
    });
  });
});
