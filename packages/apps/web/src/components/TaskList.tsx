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
 * - Schedule popup for quick date assignment
 */

import { useState, useCallback, type KeyboardEvent } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Badge } from '@/components/ui/badge.js';
import { Avatar } from '@/components/Avatar.js';
import { SchedulePopup } from '@/components/SchedulePopup.js';
import { useCompleteTask } from '@/hooks/tasks.js';
import type { Task } from '@/api/types.js';



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

        // Remove from set after animation completes (1.5s fade + buffer)
        setTimeout(() => {
          setFadingTasks((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        }, 3500);
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

        return (
          <div
            key={task.id}
            data-task-id={task.id}
            tabIndex={0}
            onKeyDown={(e) => handleKeyDown(e, task.id)}
            className={`
              flex items-center gap-3 p-3 border rounded-md
              transition-all duration-[3000ms] ease-out
              focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
              ${isFading ? 'opacity-50' : 'opacity-100'}
            `}
          >
            {/* Checkbox, Spinner, or Checkmark */}
            <div className="flex-shrink-0">
              {isTaskPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : isFading ? (
                <div 
                  data-testid="check-icon"
                  className="h-4 w-4 rounded border border-primary bg-primary flex items-center justify-center"
                >
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              ) : (
                <Checkbox
                  checked={false}
                  onCheckedChange={() => handleComplete(task.id)}
                  aria-label={`Complete task: ${task.text}`}
                />
              )}
            </div>

            {/* Task text */}
            <span 
              className={`flex-1 text-sm truncate transition-all duration-[3000ms] ${
                isFading ? 'line-through text-muted-foreground' : ''
              }`}
            >
              {task.text}
            </span>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
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

              {/* Commitment badge */}
              {task.from?.type === 'commitment' && (
                <Badge variant="outline" className="text-xs">
                  commitment
                </Badge>
              )}

              {/* Avatar (if person exists) */}
              {task.person && (
                <div className="flex-shrink-0">
                  <Avatar name={task.person.name} size="sm" />
                </div>
              )}

              {/* Schedule popup (replaces static badge) */}
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
  );
}
