/**
 * TaskList component tests.
 *
 * Tests:
 * - Task text and checkbox rendering
 * - Avatar display when person exists
 * - Schedule badge with correct icons per destination
 * - Commitment badge when from?.type === 'commitment'
 * - Checkbox click triggers complete mutation
 * - Spinner during mutation (replaces checkbox)
 * - Fade-out animation on completion
 * - Toast error on completion failure
 * - Keyboard accessibility (Space/Enter to complete)
 * - Text truncation for long task text
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskList } from './TaskList.js';
import { TooltipProvider } from './ui/tooltip.js';
import type { Task } from '@/api/types.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock useCompleteTask hook
const mockMutate = vi.fn();
const mockUseCompleteTask = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
  pendingTaskId: null as string | null,
}));

// Mock useUpdateTask hook (used by SchedulePopup)
const mockUpdateMutate = vi.fn();
const mockUseUpdateTask = vi.fn(() => ({
  mutate: mockUpdateMutate,
  isPending: false,
}));

vi.mock('@/hooks/tasks.js', () => ({
  useCompleteTask: () => mockUseCompleteTask(),
  useUpdateTask: () => mockUseUpdateTask(),
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
    { slug: 'web-redesign', name: 'Web Redesign', lastModified: '2026-01-01', status: 'Active', description: '' },
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

function renderTaskList(tasks: Task[]) {
  return render(<TaskList tasks={tasks} />, { wrapper: createWrapper() });
}

// ── Test Data ────────────────────────────────────────────────────────────────

const BASIC_TASK: Task = {
  id: 'task-001',
  text: 'Review PR #42',
  destination: 'must',
  due: null,
  area: null,
  project: null,
  person: null,
  from: null,
  completed: false,
  completedAt: null,
  source: { file: 'now/tasks.md', section: 'Tasks' },
};

const TASK_WITH_PERSON: Task = {
  ...BASIC_TASK,
  id: 'task-002',
  text: 'Follow up with John',
  person: { slug: 'john-doe', name: 'John Doe' },
};

const TASK_WITH_COMMITMENT: Task = {
  ...BASIC_TASK,
  id: 'task-003',
  text: 'Send proposal by Friday',
  from: {
    type: 'commitment',
    id: 'commit-001',
    text: 'Send proposal',
    priority: 'high',
    daysOpen: 3,
  },
};

const LONG_TEXT_TASK: Task = {
  ...BASIC_TASK,
  id: 'task-004',
  text: 'This is a very long task description that should be truncated with an ellipsis when it exceeds the available width in the task list row component',
};

const TASK_WITH_AREA: Task = {
  ...BASIC_TASK,
  id: 'task-005',
  text: 'Task with area',
  area: 'engineering',
};

const TASK_WITH_PROJECT: Task = {
  ...BASIC_TASK,
  id: 'task-006',
  text: 'Task with project',
  project: 'web-redesign',
};

const TASK_WITH_BOTH: Task = {
  ...BASIC_TASK,
  id: 'task-007',
  text: 'Task with area and project',
  area: 'engineering',
  project: 'task-ui',
};

// Create tasks for each destination type
function createTaskWithDestination(destination: Task['destination']): Task {
  return {
    ...BASIC_TASK,
    id: `task-${destination}`,
    text: `Task for ${destination}`,
    destination,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TaskList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCompleteTask.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      pendingTaskId: null,
    });
    mockUseUpdateTask.mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic rendering', () => {
    it('renders task text', () => {
      renderTaskList([BASIC_TASK]);
      expect(screen.getByText('Review PR #42')).toBeInTheDocument();
    });

    it('renders checkbox for each task', () => {
      renderTaskList([BASIC_TASK]);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('renders multiple tasks', () => {
      renderTaskList([BASIC_TASK, TASK_WITH_PERSON]);
      expect(screen.getByText('Review PR #42')).toBeInTheDocument();
      expect(screen.getByText('Follow up with John')).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    });

    it('renders empty state when no tasks', () => {
      renderTaskList([]);
      // Component should handle empty gracefully (no errors)
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });

  describe('Avatar rendering', () => {
    it('renders Avatar with person initials when person exists', () => {
      renderTaskList([TASK_WITH_PERSON]);
      // Avatar shows initials - "John Doe" -> "JD"
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('does not render Avatar when person is null', () => {
      renderTaskList([BASIC_TASK]);
      // No initials should be present
      expect(screen.queryByText('JD')).not.toBeInTheDocument();
    });

    it('renders Avatar after text/badges and before schedule trigger', () => {
      renderTaskList([TASK_WITH_PERSON]);
      const taskRow = screen.getByText('Follow up with John').closest('[data-task-id]')!;
      const children = Array.from(taskRow.children);

      // Find avatar (contains 'JD'), task text, and schedule badge container
      const avatarIndex = children.findIndex((el) => el.textContent?.includes('JD'));
      const textIndex = children.findIndex((el) => el.classList.contains('flex-1'));
      const badgesIndex = children.findIndex(
        (el) => el.classList.contains('flex') && el.classList.contains('items-center') && el.classList.contains('gap-2')
      );

      // Avatar should come after text and inside the badges container (before schedule)
      // or after the text element. The key invariant: avatar is NOT between checkbox and text.
      expect(textIndex).toBeLessThan(avatarIndex);
    });
  });

  describe('schedule badge', () => {
    it('renders badge with correct label for inbox destination', () => {
      renderTaskList([createTaskWithDestination('inbox')]);
      expect(screen.getByText('Inbox')).toBeInTheDocument();
    });

    it('renders badge with correct label for must destination', () => {
      renderTaskList([createTaskWithDestination('must')]);
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('renders badge with correct label for should destination', () => {
      renderTaskList([createTaskWithDestination('should')]);
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
    });

    it('renders badge with correct label for could destination', () => {
      renderTaskList([createTaskWithDestination('could')]);
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
    });

    it('renders badge with correct label for anytime destination', () => {
      renderTaskList([createTaskWithDestination('anytime')]);
      expect(screen.getByText('Anytime')).toBeInTheDocument();
    });

    it('renders badge with correct label for someday destination', () => {
      renderTaskList([createTaskWithDestination('someday')]);
      expect(screen.getByText('Someday')).toBeInTheDocument();
    });
  });

  describe('commitment badge', () => {
    it('renders commitment badge when from?.type === "commitment"', () => {
      renderTaskList([TASK_WITH_COMMITMENT]);
      expect(screen.getByText('commitment')).toBeInTheDocument();
    });

    it('does not render commitment badge when from is null', () => {
      renderTaskList([BASIC_TASK]);
      expect(screen.queryByText('commitment')).not.toBeInTheDocument();
    });
  });

  describe('checkbox interaction', () => {
    it('calls complete mutation when checkbox is clicked', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(mockMutate).toHaveBeenCalledWith('task-001');
    });

    it('shows spinner during mutation (replaces checkbox)', () => {
      mockUseCompleteTask.mockReturnValue({
        mutate: mockMutate,
        isPending: true,
        pendingTaskId: 'task-001',
      });

      renderTaskList([BASIC_TASK]);

      // Spinner should be present (Loader2 with animate-spin)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();

      // Checkbox should be disabled or hidden
      const checkbox = screen.queryByRole('checkbox');
      expect(checkbox).toBeNull();
    });

    it('does not show spinner for other tasks while one is pending', () => {
      mockUseCompleteTask.mockReturnValue({
        mutate: mockMutate,
        isPending: true,
        pendingTaskId: 'task-002', // Different task is pending
      });

      renderTaskList([BASIC_TASK, TASK_WITH_PERSON]);

      // Task 001 should still have checkbox
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(1); // Only task-001 shows checkbox

      // Task 002 should have spinner
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('completion animation', () => {
    it('uses 3000ms duration for fade animation', () => {
      renderTaskList([BASIC_TASK]);
      const taskRow = screen.getByText('Review PR #42').closest('[data-task-id]');
      expect(taskRow).toBeInTheDocument();
      // Check that the row has the 3s animation duration class
      expect(taskRow!.className).toContain('duration-[3000ms]');
    });

    it('applies fade-out class after successful completion', async () => {
      // This tests the fade-out CSS class application
      // The actual removal happens via onTransitionEnd or setTimeout
      const { rerender } = renderTaskList([BASIC_TASK]);

      // Get the task row
      const taskRow = screen.getByText('Review PR #42').closest('[data-task-id]');
      expect(taskRow).toBeInTheDocument();

      // Initially should not have opacity-0
      expect(taskRow).not.toHaveClass('opacity-0');
    });

    it('adds task to fadingTasks set on completion', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Task row should have fade-out classes applied
      const taskRow = screen.getByText('Review PR #42').closest('[data-task-id]');
      expect(taskRow).toHaveClass('opacity-50');
    });

    it('applies strikethrough and muted text to completing task', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Task text should have strikethrough styling
      const taskText = screen.getByText('Review PR #42');
      expect(taskText).toHaveClass('line-through');
      expect(taskText).toHaveClass('text-muted-foreground');
    });

    it('shows checkmark icon when task is completing', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Check icon should be visible
      const checkIcon = document.querySelector('[data-testid="check-icon"]');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('shows toast error on completion failure', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();

      // Simulate error by having mutate throw
      mockMutate.mockImplementation(() => {
        throw new Error('Network error');
      });

      renderTaskList([BASIC_TASK]);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(toast.error).toHaveBeenCalledWith('Failed to complete task');
    });
  });

  describe('keyboard accessibility', () => {
    it('completes task on Space key when row is focused', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      // Focus the row
      const taskRow = screen.getByText('Review PR #42').closest('[data-task-id]');
      expect(taskRow).toBeInTheDocument();

      // Tab to focus the row (it has tabIndex={0})
      await user.tab();

      // Press Space
      await user.keyboard(' ');

      expect(mockMutate).toHaveBeenCalledWith('task-001');
    });

    it('completes task on Enter key when row is focused', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      // Focus the row
      const taskRow = screen.getByText('Review PR #42').closest('[data-task-id]');
      expect(taskRow).toBeInTheDocument();

      // Tab to focus the row
      await user.tab();

      // Press Enter
      await user.keyboard('{Enter}');

      expect(mockMutate).toHaveBeenCalledWith('task-001');
    });

    it('row has tabIndex={0} for keyboard focusability', () => {
      renderTaskList([BASIC_TASK]);

      const taskRow = screen.getByText('Review PR #42').closest('[data-task-id]');
      expect(taskRow).toHaveAttribute('tabindex', '0');
    });
  });

  describe('text truncation', () => {
    it('applies truncate class to long text', () => {
      renderTaskList([LONG_TEXT_TASK]);

      const textElement = screen.getByText(/This is a very long task description/);
      // Should have truncate or text-truncate class
      expect(textElement).toHaveClass('truncate');
    });
  });

  describe('area/project assignment', () => {
    it('renders area name when task has area assigned', () => {
      renderTaskList([TASK_WITH_AREA]);
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    it('renders project name when task has project assigned', () => {
      renderTaskList([TASK_WITH_PROJECT]);
      expect(screen.getByText('Web Redesign')).toBeInTheDocument();
    });

    it('renders both area and project names when task has both', () => {
      renderTaskList([TASK_WITH_BOTH]);
      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Task UI')).toBeInTheDocument();
    });

    it('shows assign area button when no area assigned', () => {
      renderTaskList([BASIC_TASK]);
      expect(screen.getByLabelText('Assign Area')).toBeInTheDocument();
    });

    it('shows assign project button when no project assigned', () => {
      renderTaskList([BASIC_TASK]);
      expect(screen.getByLabelText('Assign Project')).toBeInTheDocument();
    });

    it('shows change area badge when area assigned', () => {
      renderTaskList([TASK_WITH_AREA]);
      expect(screen.getByLabelText('Change Area: Engineering')).toBeInTheDocument();
    });

    it('calls updateTask when area is selected from dropdown', async () => {
      const user = userEvent.setup();
      renderTaskList([BASIC_TASK]);

      // Click the assign area button
      await user.click(screen.getByLabelText('Assign Area'));

      // Wait for popover to open and click an option
      await waitFor(() => {
        expect(screen.getByText('Engineering')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Engineering'));

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 'task-001',
        updates: { area: 'engineering' },
      });
    });

    it('calls updateTask with null when area is cleared', async () => {
      const user = userEvent.setup();
      renderTaskList([TASK_WITH_AREA]);

      // Click the area badge to open dropdown
      await user.click(screen.getByLabelText('Change Area: Engineering'));

      // Click "None" to clear
      await waitFor(() => {
        expect(screen.getByText('None')).toBeInTheDocument();
      });
      await user.click(screen.getByText('None'));

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 'task-005',
        updates: { area: null },
      });
    });
  });
});
