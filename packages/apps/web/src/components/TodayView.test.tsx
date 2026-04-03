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

// Mock sonner toast - use vi.hoisted to allow mock access at module level
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

// Mock task hooks - use vi.hoisted
const {
  mockUseTasks,
  mockUseCompletedTodayTasks,
  mockUseTaskSuggestions,
  mockUpdateMutate,
  mockUseUpdateTask,
  mockCompleteMutate,
  mockUseCompleteTask,
} = vi.hoisted(() => ({
  mockUseTasks: vi.fn(),
  mockUseCompletedTodayTasks: vi.fn(),
  mockUseTaskSuggestions: vi.fn(),
  mockUpdateMutate: vi.fn(),
  mockUseUpdateTask: vi.fn(),
  mockCompleteMutate: vi.fn(),
  mockUseCompleteTask: vi.fn(),
}));

vi.mock('@/hooks/tasks.js', () => ({
  useTasks: () => mockUseTasks(),
  useCompletedTodayTasks: () => mockUseCompletedTodayTasks(),
  useTaskSuggestions: () => mockUseTaskSuggestions(),
  useUpdateTask: () => mockUseUpdateTask(),
  useCompleteTask: () => mockUseCompleteTask(),
}));

// Mock useAreas and useProjects hooks
vi.mock('@/hooks/areas.js', () => ({
  useAreas: () => ({ data: [
    { slug: 'engineering', name: 'Engineering' },
    { slug: 'sales', name: 'Sales' },
  ], isLoading: false }),
}));

vi.mock('@/hooks/projects.js', () => ({
  useProjects: () => ({ data: [
    { slug: 'task-ui', name: 'Task UI', lastModified: '2026-01-01', status: 'Active', description: '' },
  ], isLoading: false }),
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

/**
 * Get today's date string, matching the component's getTodayString() logic.
 * Uses local date reset to midnight, then converted to ISO string.
 */
function getToday(): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.toISOString().split('T')[0];
}

function getYesterday(): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  today.setDate(today.getDate() - 1);
  return today.toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  today.setDate(today.getDate() - days);
  return today.toISOString().split('T')[0];
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
  completedAt: null,
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
  completedAt: null,
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
  completedAt: null,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const TASK_WITH_AREA: Task = {
  id: 'task-with-area',
  text: 'Task with area tag',
  destination: 'must',
  due: getToday(),
  area: 'engineering',
  project: null,
  person: null,
  from: null,
  completed: false,
  completedAt: null,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const TASK_WITH_PROJECT: Task = {
  id: 'task-with-project',
  text: 'Task with project tag',
  destination: 'must',
  due: getToday(),
  area: null,
  project: 'task-ui',
  person: null,
  from: null,
  completed: false,
  completedAt: null,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const TASK_WITH_BOTH_TAGS: Task = {
  id: 'task-with-both',
  text: 'Task with both tags',
  destination: 'must',
  due: getToday(),
  area: 'engineering',
  project: 'task-ui',
  person: null,
  from: null,
  completed: false,
  completedAt: null,
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
  completedAt: null,
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
  completedAt: null,
  source: { file: 'now/tasks.md', section: 'Tasks' },
  score: 72,
  breakdown: {
    dueDate: 10,
    commitment: 25,
    meetingRelevance: 20,
    weekPriority: 17,
  },
};

const COMPLETED_TASK_1: Task = {
  id: 'completed-001',
  text: 'Completed task 1',
  destination: 'must',
  due: getToday(),
  area: null,
  project: null,
  person: null,
  from: null,
  completed: true,
  completedAt: '2026-04-02',
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const COMPLETED_TASK_2: Task = {
  id: 'completed-002',
  text: 'Completed task 2',
  destination: 'must',
  due: getToday(),
  area: 'engineering',
  project: null,
  person: null,
  from: null,
  completed: true,
  completedAt: '2026-04-02',
  source: { file: 'now/tasks.md', section: 'Tasks' },
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

    // Default: no completed tasks today
    mockUseCompletedTodayTasks.mockReturnValue({
      data: { tasks: [], total: 0, offset: 0, limit: 50 },
      isLoading: false,
      error: null,
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
      expect(screen.getByText('Suggested')).toBeInTheDocument();
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

    it('renders schedule popup for each suggestion', () => {
      renderTodayView();
      // SchedulePopup renders a badge trigger with the destination label
      const suggestionsSection = screen.getByTestId('suggestions-section');
      const scheduleBadges = within(suggestionsSection).getAllByLabelText(/schedule:/i);
      expect(scheduleBadges).toHaveLength(2);
    });

    it('renders Punt button for each suggestion', () => {
      renderTodayView();
      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      expect(puntButtons).toHaveLength(2);
    });
  });

  describe('Set Today action', () => {
    it('updates task due date to today and sets destination to must', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const setTodayButtons = screen.getAllByRole('button', { name: /set today/i });
      await user.click(setTodayButtons[0]);

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 'suggested-001',
        updates: { due: getToday(), destination: 'must' },
      });
    });

    it('shows success toast on successful Set Today', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const setTodayButtons = screen.getAllByRole('button', { name: /set today/i });
      await user.click(setTodayButtons[0]);

      // Toast is called directly after mutate (not via callback)
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/set.*today/i));
    });
  });

  describe('Schedule action', () => {
    it('opens schedule popup when schedule badge is clicked', async () => {
      const user = userEvent.setup();
      renderTodayView();

      // SchedulePopup renders a badge trigger
      const suggestionsSection = screen.getByTestId('suggestions-section');
      const scheduleBadges = within(suggestionsSection).getAllByLabelText(/schedule:/i);
      await user.click(scheduleBadges[0]);

      // Schedule popup options should be visible
      expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    });

    it('schedules task when option is selected from popup', async () => {
      const user = userEvent.setup();
      renderTodayView();

      // Open schedule popup
      const suggestionsSection = screen.getByTestId('suggestions-section');
      const scheduleBadges = within(suggestionsSection).getAllByLabelText(/schedule:/i);
      await user.click(scheduleBadges[0]);

      // Click Tomorrow
      await user.click(screen.getByText('Tomorrow'));

      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'suggested-001',
          updates: expect.objectContaining({
            due: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            destination: expect.stringMatching(/^(must|should)$/),
          }),
        })
      );
    });
  });

  describe('Punt action', () => {
    it('moves task to anytime destination when clicked', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      await user.click(puntButtons[0]);

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 'suggested-001',
        updates: { destination: 'anytime', due: null },
      });
    });

    it('shows success toast on successful Punt', async () => {
      const user = userEvent.setup();
      renderTodayView();

      const puntButtons = screen.getAllByRole('button', { name: /punt/i });
      await user.click(puntButtons[0]);

      // Toast is called directly after mutate (not via callback)
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/moved.*anytime/i));
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

  describe('schedule trigger for today items', () => {
    it('renders schedule popup trigger for each task', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      
      // SchedulePopup shows badge with schedule trigger
      const tasksSection = screen.getByTestId('tasks-section');
      const scheduleBadge = within(tasksSection).getByLabelText(/schedule:/i);
      expect(scheduleBadge).toBeInTheDocument();
    });

    it('opens schedule popup when clicked', async () => {
      const user = userEvent.setup();
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      
      // Click the schedule badge trigger
      const tasksSection = screen.getByTestId('tasks-section');
      const scheduleBadge = within(tasksSection).getByLabelText(/schedule:/i);
      await user.click(scheduleBadge);
      
      // Popup should show schedule options (use role="option" to target popup items)
      expect(screen.getByRole('option', { name: /tomorrow/i })).toBeInTheDocument();
    });

    it('updates task when reschedule option is selected', async () => {
      const user = userEvent.setup();
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      
      // Click the schedule badge trigger
      const tasksSection = screen.getByTestId('tasks-section');
      const scheduleBadge = within(tasksSection).getByLabelText(/schedule:/i);
      await user.click(scheduleBadge);
      
      // Click "Anytime" option in the popup
      const anytimeOption = screen.getByRole('option', { name: /anytime/i });
      await user.click(anytimeOption);
      
      // Should call update mutation
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 'task-today-001',
        updates: { due: null, destination: 'anytime' },
      });
    });
  });

  describe('area/project tags', () => {
    it('renders area badge when task has area', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_WITH_AREA],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    it('renders project badge when task has project', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_WITH_PROJECT],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText('Task UI')).toBeInTheDocument();
    });

    it('renders both area and project badges when task has both', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_WITH_BOTH_TAGS],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Task UI')).toBeInTheDocument();
    });

    it('does not render area/project badges when both are null', () => {
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      // Area and project badges should not be present
      expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
      expect(screen.queryByText('Task UI')).not.toBeInTheDocument();
    });
  });

  describe('avatar position', () => {
    it('renders Avatar after text and before schedule in TasksSection', () => {
      const TASK_WITH_PERSON: Task = {
        ...TASK_DUE_TODAY,
        id: 'task-person',
        text: 'Task with person',
        person: { slug: 'jane-doe', name: 'Jane Doe' },
      };
      mockUseTasks.mockReturnValue({
        data: { tasks: [TASK_WITH_PERSON], total: 1, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      const tasksSection = screen.getByTestId('tasks-section');
      const taskRow = within(tasksSection).getByText('Task with person').closest('[data-task-id]')!;
      const children = Array.from(taskRow.children);

      const textIndex = children.findIndex((el) => el.classList.contains('flex-1'));
      const avatarIndex = children.findIndex((el) => el.textContent?.includes('JD'));

      // Avatar should be after text, not between checkbox and text
      expect(textIndex).toBeLessThan(avatarIndex);
    });

    it('renders Avatar after text in SuggestionRow', () => {
      renderTodayView();
      // SUGGESTED_TASK_2 has person: John Doe
      const suggestionsSection = screen.getByTestId('suggestions-section');
      const suggestionRow = within(suggestionsSection).getByText('Suggested task 2').closest('.flex')!;
      const children = Array.from(suggestionRow.children);

      const textIndex = children.findIndex((el) => el.classList.contains('flex-1'));
      const avatarIndex = children.findIndex((el) => el.textContent?.includes('JD'));

      expect(textIndex).toBeLessThan(avatarIndex);
    });

    it('renders Avatar after text in CompletedSection', async () => {
      const user = userEvent.setup();
      const COMPLETED_WITH_PERSON: Task = {
        ...COMPLETED_TASK_1,
        id: 'completed-person',
        text: 'Completed with person',
        person: { slug: 'jane-doe', name: 'Jane Doe' },
      };
      mockUseCompletedTodayTasks.mockReturnValue({
        data: { tasks: [COMPLETED_WITH_PERSON], total: 1, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
      });

      renderTodayView();
      const trigger = screen.getByText(/completed \(1\)/i);
      await user.click(trigger);

      const completedSection = screen.getByTestId('completed-section');
      const taskRow = within(completedSection).getByText('Completed with person').closest('[data-task-id]')!;
      const children = Array.from(taskRow.children);

      const textIndex = children.findIndex((el) => el.classList.contains('flex-1'));
      const avatarIndex = children.findIndex((el) => el.textContent?.includes('JD'));

      expect(textIndex).toBeLessThan(avatarIndex);
    });
  });

  describe('completion animation', () => {
    it('uses 8000ms duration for fade animation', () => {
      mockUseTasks.mockReturnValue({
        data: { tasks: [TASK_DUE_TODAY], total: 1, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      const taskRow = document.querySelector('[data-task-id="task-today-001"]');
      expect(taskRow).toBeInTheDocument();
      expect(taskRow!.className).toContain('duration-[8000ms]');
    });

    it('shows checkmark icon when completing task', async () => {
      const user = userEvent.setup();
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      
      // Get the checkbox button within tasks section
      const tasksSection = screen.getByTestId('tasks-section');
      const checkbox = within(tasksSection).getByRole('checkbox');
      await user.click(checkbox);
      
      // Check icon should appear
      const checkIcon = document.querySelector('[data-testid="check-icon"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('applies strikethrough to task text when completing', async () => {
      const user = userEvent.setup();
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      
      // Get the checkbox button within tasks section
      const tasksSection = screen.getByTestId('tasks-section');
      const checkbox = within(tasksSection).getByRole('checkbox');
      await user.click(checkbox);
      
      // Task text should have strikethrough
      const taskText = screen.getByText('Task due today');
      expect(taskText).toHaveClass('line-through');
      expect(taskText).toHaveClass('text-muted-foreground');
    });

    it('applies fade-out opacity to task row when completing', async () => {
      const user = userEvent.setup();
      mockUseTasks.mockReturnValue({
        data: {
          tasks: [TASK_DUE_TODAY],
          total: 1,
          offset: 0,
          limit: 50,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderTodayView();
      
      // Get the checkbox button within tasks section
      const tasksSection = screen.getByTestId('tasks-section');
      const checkbox = within(tasksSection).getByRole('checkbox');
      await user.click(checkbox);
      
      // Task row should have reduced opacity
      const taskRow = document.querySelector('[data-task-id="task-today-001"]');
      expect(taskRow).toHaveClass('opacity-50');
    });
  });

  describe('completed section', () => {
    it('shows "Completed (N)" section when there are completed tasks today', () => {
      mockUseCompletedTodayTasks.mockReturnValue({
        data: { tasks: [COMPLETED_TASK_1, COMPLETED_TASK_2], total: 2, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
      });

      renderTodayView();
      expect(screen.getByText(/completed \(2\)/i)).toBeInTheDocument();
    });

    it('hides completed section when there are no completed tasks', () => {
      mockUseCompletedTodayTasks.mockReturnValue({
        data: { tasks: [], total: 0, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
      });

      renderTodayView();
      expect(screen.queryByText(/completed \(/i)).not.toBeInTheDocument();
    });

    it('section is collapsed by default', () => {
      mockUseCompletedTodayTasks.mockReturnValue({
        data: { tasks: [COMPLETED_TASK_1], total: 1, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
      });

      renderTodayView();
      // The completed task text should not be visible when collapsed
      expect(screen.queryByText('Completed task 1')).not.toBeInTheDocument();
    });

    it('clicking expands to show completed tasks', async () => {
      const user = userEvent.setup();
      mockUseCompletedTodayTasks.mockReturnValue({
        data: { tasks: [COMPLETED_TASK_1, COMPLETED_TASK_2], total: 2, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
      });

      renderTodayView();
      
      // Click on the collapsible trigger
      const trigger = screen.getByText(/completed \(2\)/i);
      await user.click(trigger);
      
      // Completed tasks should now be visible
      expect(screen.getByText('Completed task 1')).toBeInTheDocument();
      expect(screen.getByText('Completed task 2')).toBeInTheDocument();
    });

    it('completed tasks show strikethrough styling', async () => {
      const user = userEvent.setup();
      mockUseCompletedTodayTasks.mockReturnValue({
        data: { tasks: [COMPLETED_TASK_1], total: 1, offset: 0, limit: 50 },
        isLoading: false,
        error: null,
      });

      renderTodayView();
      
      // Expand the section
      const trigger = screen.getByText(/completed \(1\)/i);
      await user.click(trigger);
      
      // Completed task should have strikethrough
      const taskText = screen.getByText('Completed task 1');
      expect(taskText).toHaveClass('line-through');
    });
  });
});
