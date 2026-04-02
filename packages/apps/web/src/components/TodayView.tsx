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
import { RefreshCw, Sun, CalendarIcon, Forward, Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Badge } from '@/components/ui/badge.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { Avatar } from '@/components/Avatar.js';
import { SchedulePopup } from '@/components/SchedulePopup.js';
import { useTasks, useCompletedTodayTasks, useTaskSuggestions, useUpdateTask, useCompleteTask } from '@/hooks/tasks.js';
import { useAreas } from '@/hooks/areas.js';
import { useProjects } from '@/hooks/projects.js';
import { AssignmentSelector } from '@/components/AssignmentSelector.js';
import type { Task, SuggestedTask, AreaSummary, ProjectSummary } from '@/api/types.js';

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
    data: completedData,
    isLoading: completedLoading,
  } = useCompletedTodayTasks();

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError,
    refetch: refetchSuggestions,
  } = useTaskSuggestions();

  const { data: areas = [] } = useAreas();
  const { data: projects = [] } = useProjects();

  const tasks = tasksData?.tasks ?? [];
  const sortedTasks = sortTasksForToday(tasks);
  const completedTasks = completedData?.tasks ?? [];

  return (
    <div className="space-y-8">
      {/* Tasks Section */}
      <TasksSection
        tasks={sortedTasks}
        isLoading={tasksLoading}
        error={tasksError}
        refetch={refetchTasks}
        areas={areas}
        projects={projects}
      />

      {/* Suggestions Section */}
      <SuggestionsSection
        suggestions={suggestions ?? []}
        isLoading={suggestionsLoading}
        error={suggestionsError}
        refetch={refetchSuggestions}
        areas={areas}
        projects={projects}
      />

      {/* Completed Section - only show when there are completed tasks */}
      {!completedLoading && completedTasks.length > 0 && (
        <CompletedSection tasks={completedTasks} />
      )}
    </div>
  );
}

// ── Tasks Section ────────────────────────────────────────────────────────────

interface TasksSectionProps {
  tasks: Task[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  areas: AreaSummary[];
  projects: ProjectSummary[];
}

function TasksSection({ tasks, isLoading, error, refetch, areas, projects }: TasksSectionProps) {
  const { mutate: completeMutate, isPending, pendingTaskId } = useCompleteTask();
  const { mutate: updateMutate } = useUpdateTask();
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());

  const handleComplete = useCallback(
    (taskId: string) => {
      completeMutate(taskId);
      
      // Mark task as fading (optimistic UI)
      setFadingTasks((prev) => new Set(prev).add(taskId));

      // Remove from set after animation completes (1.5s fade + buffer)
      setTimeout(() => {
        setFadingTasks((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }, 3500);
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
            const isFading = fadingTasks.has(task.id);

            return (
              <div
                key={task.id}
                data-task-id={task.id}
                className={`
                  flex items-center gap-3 p-3 border rounded-md 
                  transition-all duration-[3000ms] ease-out
                  ${isFading ? 'opacity-50' : isTaskPending ? 'opacity-75' : 'opacity-100'}
                `}
              >
                {/* Checkbox, Spinner indicator, or Checkmark */}
                {isFading ? (
                  <div 
                    data-testid="check-icon"
                    className="flex-shrink-0 h-4 w-4 rounded border border-primary bg-primary flex items-center justify-center"
                  >
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                ) : (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={task.completed}
                    aria-label={`Complete task: ${task.text}`}
                    disabled={isTaskPending}
                    onClick={() => handleComplete(task.id)}
                    className="flex-shrink-0 h-4 w-4 rounded border border-muted-foreground/50 hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )}

                {/* Task text */}
                <span 
                  data-testid="task-text" 
                  className={`flex-1 text-sm truncate transition-all duration-[3000ms] ${
                    isFading ? 'line-through text-muted-foreground' : ''
                  }`}
                >
                  {task.text}
                </span>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Area selector */}
                  <AssignmentSelector
                    type="area"
                    current={task.area}
                    options={areas}
                    onAssign={(slug) =>
                      updateMutate({ id: task.id, updates: { area: slug } })
                    }
                  />

                  {/* Project selector */}
                  <AssignmentSelector
                    type="project"
                    current={task.project}
                    options={projects.map((p) => ({ slug: p.slug, name: p.name }))}
                    onAssign={(slug) =>
                      updateMutate({ id: task.id, updates: { project: slug } })
                    }
                  />

                  {/* Overdue badge */}
                  {daysOverdue > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue
                    </Badge>
                  )}

                  {/* Avatar (if person exists) */}
                  {task.person && (
                    <div className="flex-shrink-0">
                      <Avatar name={task.person.name} size="sm" />
                    </div>
                  )}

                  {/* Schedule popup for rescheduling */}
                  <SchedulePopup
                    taskId={task.id}
                    currentDestination={task.destination}
                    currentDue={task.due}
                  />
                </div>
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
  areas: AreaSummary[];
  projects: ProjectSummary[];
}

function SuggestionsSection({
  suggestions,
  isLoading,
  error,
  refetch,
  areas,
  projects,
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
            <SuggestionRow key={suggestion.id} suggestion={suggestion} areas={areas} projects={projects} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Suggestion Row ───────────────────────────────────────────────────────────

interface SuggestionRowProps {
  suggestion: SuggestedTask;
  areas: AreaSummary[];
  projects: ProjectSummary[];
}

function SuggestionRow({ suggestion, areas, projects }: SuggestionRowProps) {
  const { mutate, isError } = useUpdateTask();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Set Today action - moves to must bucket to ensure it appears in Today view
  const handleSetToday = useCallback(() => {
    mutate({
      id: suggestion.id,
      updates: { due: getTodayString(), destination: 'must' },
    });
    toast.success('Task set for today');
  }, [suggestion.id, mutate]);

  // Schedule action (date selected from calendar)
  const handleSchedule = useCallback(
    (date: Date | undefined) => {
      if (!date) return;

      const today = getToday();
      const dateStr = formatDate(date);
      const todayStr = formatDate(today);

      // Determine destination based on selected date:
      // - Today's date → must (appears in Today view)
      // - Tomorrow or later → should (appears in Upcoming view)
      const destination = dateStr === todayStr ? 'must' : 'should';

      mutate({
        id: suggestion.id,
        updates: { due: dateStr, destination },
      });
      toast.success('Task scheduled');
      setCalendarOpen(false);
    },
    [suggestion.id, mutate]
  );

  // Punt action
  const handlePunt = useCallback(() => {
    mutate({
      id: suggestion.id,
      updates: { destination: 'anytime', due: null },
    });
    toast.success('Moved to Anytime');
  }, [suggestion.id, mutate]);

  return (
    <div className="flex items-center gap-3 p-3 border rounded-md">
      {/* Task text */}
      <span data-testid="suggestion-text" className="flex-1 text-sm truncate">
        {suggestion.text}
      </span>

      {/* Area selector */}
      <AssignmentSelector
        type="area"
        current={suggestion.area}
        options={areas}
        onAssign={(slug) =>
          mutate({ id: suggestion.id, updates: { area: slug } })
        }
      />

      {/* Project selector */}
      <AssignmentSelector
        type="project"
        current={suggestion.project}
        options={projects.map((p) => ({ slug: p.slug, name: p.name }))}
        onAssign={(slug) =>
          mutate({ id: suggestion.id, updates: { project: slug } })
        }
      />

      {/* Score badge */}
      <Badge variant="secondary" className="text-xs">
        {suggestion.score}
      </Badge>

      {/* Avatar (if person exists) */}
      {suggestion.person && (
        <div className="flex-shrink-0">
          <Avatar name={suggestion.person.name} size="sm" />
        </div>
      )}

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
          <PopoverContent 
            className="w-auto p-0" 
            align="start"
            side="bottom"
            sideOffset={4}
            collisionPadding={8}
            avoidCollisions={true}
          >
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

// ── Completed Section ────────────────────────────────────────────────────────

interface CompletedSectionProps {
  tasks: Task[];
}

function CompletedSection({ tasks }: CompletedSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section data-testid="completed-section">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight 
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} 
          />
          Completed ({tasks.length})
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                data-task-id={task.id}
                className="flex items-center gap-3 p-3 border rounded-md opacity-75"
              >
                {/* Checkmark icon */}
                <div 
                  className="flex-shrink-0 h-4 w-4 rounded border border-primary bg-primary flex items-center justify-center"
                >
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>

                {/* Task text with strikethrough */}
                <span className="flex-1 text-sm truncate line-through text-muted-foreground">
                  {task.text}
                </span>

                {/* Area badge */}
                {task.area && (
                  <Badge variant="outline" className="text-xs">
                    {task.area}
                  </Badge>
                )}

                {/* Project badge */}
                {task.project && (
                  <Badge variant="outline" className="text-xs">
                    {task.project}
                  </Badge>
                )}

                {/* Avatar (if person exists) */}
                {task.person && (
                  <div className="flex-shrink-0">
                    <Avatar name={task.person.name} size="sm" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
