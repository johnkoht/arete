/**
 * TaskList component - Interactive task list with line items.
 *
 * Features:
 * - Task row with checkbox, optional Avatar, description, schedule badge
 * - Commitment badge when task originated from a commitment
 * - Checkbox click triggers complete mutation with spinner feedback
 * - Fade-out animation on successful completion
 * - Keyboard accessibility (Space/Enter to complete)
 * - Text truncation for long descriptions
 */

import { useState, useCallback, type KeyboardEvent } from 'react';
import {
  Inbox,
  AlertCircle,
  CalendarDays,
  Calendar,
  Clock,
  Archive,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Badge } from '@/components/ui/badge.js';
import { Avatar } from '@/components/Avatar.js';
import { useCompleteTask } from '@/hooks/tasks.js';
import type { Task } from '@/api/types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DESTINATION_ICONS: Record<Task['destination'], LucideIcon> = {
  inbox: Inbox,
  must: AlertCircle,
  should: CalendarDays,
  could: Calendar,
  anytime: Clock,
  someday: Archive,
} as const;

// ── Component ────────────────────────────────────────────────────────────────

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  const { mutate, isPending, pendingTaskId } = useCompleteTask();
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());

  const handleComplete = useCallback(
    (taskId: string) => {
      try {
        // Start the mutation
        mutate(taskId);

        // Mark task as fading (optimistic UI)
        setFadingTasks((prev) => new Set(prev).add(taskId));

        // Remove from set after animation completes
        setTimeout(() => {
          setFadingTasks((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        }, 300);
      } catch {
        toast.error('Failed to complete task');
      }
    },
    [mutate]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, taskId: string) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleComplete(taskId);
      }
    },
    [handleComplete]
  );

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const isTaskPending = isPending && pendingTaskId === task.id;
        const isFading = fadingTasks.has(task.id);
        const DestinationIcon = DESTINATION_ICONS[task.destination];

        return (
          <div
            key={task.id}
            data-task-id={task.id}
            tabIndex={0}
            onKeyDown={(e) => handleKeyDown(e, task.id)}
            className={`
              flex items-center gap-3 p-3 border rounded-md
              transition-opacity duration-300
              focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
              ${isFading ? 'opacity-0' : 'opacity-100'}
            `}
          >
            {/* Checkbox or Spinner */}
            <div className="flex-shrink-0">
              {isTaskPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Checkbox
                  checked={false}
                  onCheckedChange={() => handleComplete(task.id)}
                  aria-label={`Complete task: ${task.text}`}
                />
              )}
            </div>

            {/* Avatar (if person exists) */}
            {task.person && (
              <div className="flex-shrink-0">
                <Avatar name={task.person.name} size="sm" />
              </div>
            )}

            {/* Task text */}
            <span className="flex-1 text-sm truncate">{task.text}</span>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Commitment badge */}
              {task.from?.type === 'commitment' && (
                <Badge variant="outline" className="text-xs">
                  commitment
                </Badge>
              )}

              {/* Schedule badge with destination icon */}
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <DestinationIcon className="h-3 w-3" />
                {task.destination}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
