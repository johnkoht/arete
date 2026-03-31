/**
 * TodayView component - Today tab with tasks and AI suggestions.
 *
 * Features:
 * - Top section: "Tasks" — due today + overdue (sorted: overdue first by days desc)
 * - Bottom section: "Suggested" — from /api/tasks/suggested
 * - Sections load independently (suggestions can fail without breaking tasks)
 * - Suggestions show skeleton while loading
 * - Action buttons on suggestions: Set Today / Schedule / Punt
 * - Toast confirms each action
 * - Partial failure handling: show error state for failed section, keep other section working
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Sun, CalendarIcon, Forward } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Badge } from '@/components/ui/badge.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Avatar } from '@/components/Avatar.js';
import { useTasks, useTaskSuggestions, useUpdateTask, useCompleteTask } from '@/hooks/tasks.js';
import type { Task, SuggestedTask } from '@/api/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getTodayString(): string {
  return formatDate(getToday());
}

/**
 * Calculate days overdue (positive = overdue, 0 = today, negative = future)
 */
function getDaysOverdue(due: string): number {
  const today = getToday();
  const dueDate = new Date(due);
  const diffTime = today.getTime() - dueDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Sort tasks: overdue first (by days overdue desc), then due today
 */
function sortTasksForToday(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aDaysOverdue = a.due ? getDaysOverdue(a.due) : 0;
    const bDaysOverdue = b.due ? getDaysOverdue(b.due) : 0;

    // Both overdue: most overdue first
    if (aDaysOverdue > 0 && bDaysOverdue > 0) {
      return bDaysOverdue - aDaysOverdue;
    }
    // Only a is overdue: a first
    if (aDaysOverdue > 0) return -1;
    // Only b is overdue: b first
    if (bDaysOverdue > 0) return 1;
    // Neither overdue: maintain order
    return 0;
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function TodayView() {
  const {
    data: tasksData,
    isLoading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useTasks('today');

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError,
    refetch: refetchSuggestions,
  } = useTaskSuggestions();

  const tasks = tasksData?.tasks ?? [];
  const sortedTasks = sortTasksForToday(tasks);

  return (
    <div className="space-y-8">
      {/* Tasks Section */}
      <TasksSection
        tasks={sortedTasks}
        isLoading={tasksLoading}
        error={tasksError}
        refetch={refetchTasks}
      />

      {/* Suggestions Section */}
      <SuggestionsSection
        suggestions={suggestions ?? []}
        isLoading={suggestionsLoading}
        error={suggestionsError}
        refetch={refetchSuggestions}
      />
    </div>
  );
}

// ── Tasks Section ────────────────────────────────────────────────────────────

interface TasksSectionProps {
  tasks: Task[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function TasksSection({ tasks, isLoading, error, refetch }: TasksSectionProps) {
  const { mutate: completeMutate, isPending, pendingTaskId } = useCompleteTask();

  const handleComplete = useCallback(
    (taskId: string) => {
      completeMutate(taskId);
    },
    [completeMutate]
  );

  return (
    <section data-testid="tasks-section">
      <h2 className="text-lg font-semibold mb-4">Tasks</h2>

      {/* Loading state */}
      {isLoading && (
        <div data-testid="tasks-loading" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-md">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="py-8 text-center">
          <p className="text-sm text-destructive font-medium">Failed to load tasks</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && tasks.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No tasks for today
        </div>
      )}

      {/* Task list */}
      {!isLoading && !error && tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task) => {
            const daysOverdue = task.due ? getDaysOverdue(task.due) : 0;
            const isTaskPending = isPending && pendingTaskId === task.id;

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 border rounded-md"
              >
                {/* Checkbox placeholder - could add completion later */}
                <div className="flex-shrink-0 h-4 w-4 rounded border border-muted-foreground/50" />

                {/* Avatar */}
                {task.person && (
                  <div className="flex-shrink-0">
                    <Avatar name={task.person.name} size="sm" />
                  </div>
                )}

                {/* Task text */}
                <span data-testid="task-text" className="flex-1 text-sm truncate">
                  {task.text}
                </span>

                {/* Overdue badge */}
                {daysOverdue > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Suggestions Section ──────────────────────────────────────────────────────

interface SuggestionsSectionProps {
  suggestions: SuggestedTask[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function SuggestionsSection({
  suggestions,
  isLoading,
  error,
  refetch,
}: SuggestionsSectionProps) {
  return (
    <section data-testid="suggestions-section">
      <h2 className="text-lg font-semibold mb-4">Suggested</h2>

      {/* Loading state */}
      {isLoading && (
        <div data-testid="suggestions-loading" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-md">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="py-8 text-center">
          <p className="text-sm text-destructive font-medium">
            Failed to load suggestions
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && suggestions.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No suggestions available
        </div>
      )}

      {/* Suggestions list */}
      {!isLoading && !error && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <SuggestionRow key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Suggestion Row ───────────────────────────────────────────────────────────

interface SuggestionRowProps {
  suggestion: SuggestedTask;
}

function SuggestionRow({ suggestion }: SuggestionRowProps) {
  const { mutate } = useUpdateTask();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Set Today action
  const handleSetToday = useCallback(() => {
    mutate(
      {
        id: suggestion.id,
        updates: { due: getTodayString() },
      },
      {
        onSuccess: () => {
          toast.success('Task set for today');
        },
        onError: () => {
          toast.error('Failed to update task');
        },
      }
    );
  }, [suggestion.id, mutate]);

  // Schedule action (date selected from calendar)
  const handleSchedule = useCallback(
    (date: Date | undefined) => {
      if (!date) return;

      mutate(
        {
          id: suggestion.id,
          updates: { due: formatDate(date) },
        },
        {
          onSuccess: () => {
            toast.success('Task scheduled');
            setCalendarOpen(false);
          },
          onError: () => {
            toast.error('Failed to schedule task');
          },
        }
      );
    },
    [suggestion.id, mutate]
  );

  // Punt action
  const handlePunt = useCallback(() => {
    mutate(
      {
        id: suggestion.id,
        updates: { destination: 'anytime', due: null },
      },
      {
        onSuccess: () => {
          toast.success('Moved to Anytime');
        },
        onError: () => {
          toast.error('Failed to move task');
        },
      }
    );
  }, [suggestion.id, mutate]);

  return (
    <div className="flex items-center gap-3 p-3 border rounded-md">
      {/* Avatar */}
      {suggestion.person && (
        <div className="flex-shrink-0">
          <Avatar name={suggestion.person.name} size="sm" />
        </div>
      )}

      {/* Task text */}
      <span data-testid="suggestion-text" className="flex-1 text-sm truncate">
        {suggestion.text}
      </span>

      {/* Score badge */}
      <Badge variant="secondary" className="text-xs">
        {suggestion.score}
      </Badge>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Set Today */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSetToday}
          aria-label="Set Today"
        >
          <Sun className="h-4 w-4 mr-1" />
          Set Today
        </Button>

        {/* Schedule */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Schedule">
              <CalendarIcon className="h-4 w-4 mr-1" />
              Schedule
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div data-testid="schedule-calendar">
              <Calendar
                mode="single"
                selected={undefined}
                onSelect={handleSchedule}
                disabled={(date) => date < getToday()}
                initialFocus
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Punt */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePunt}
          aria-label="Punt"
        >
          <Forward className="h-4 w-4 mr-1" />
          Punt
        </Button>
      </div>
    </div>
  );
}
