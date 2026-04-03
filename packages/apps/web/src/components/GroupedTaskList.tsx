/**
 * GroupedTaskList — renders tasks grouped by date sections.
 *
 * Used by the Upcoming tab to show tasks organized by day/week/month:
 * - Individual days for the next 7 days (Tomorrow, Saturday, Sunday, ...)
 * - Weekly groups for the rest of the current month
 * - Monthly groups beyond that
 *
 * Each group has a date header and a list of tasks using TaskList.
 */

import { useMemo } from 'react';
import { TaskList } from '@/components/TaskList.js';
import type { Task } from '@/api/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLocalToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Create a human-friendly label for a date group.
 */
function dateLabel(dateStr: string, today: Date): string {
  const date = new Date(dateStr + 'T00:00:00');
  const todayKey = formatDateKey(today);
  const tomorrowDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);

  if (dateStr === todayKey) return 'Today';
  if (dateStr === tomorrowKey) return 'Tomorrow';

  // Within next 7 days: show day name + date
  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  }

  // Otherwise: just the date
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Group key for a task's due date.
 * - Next 7 days: individual dates (YYYY-MM-DD)
 * - Same month beyond 7 days: "Apr 10–30" style week ranges
 * - Future months: month name (e.g., "May 2026")
 */
function groupKey(due: string | null, today: Date): string {
  if (!due) return 'no-date';

  const date = new Date(due + 'T00:00:00');
  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Next 7 days: individual dates
  if (diffDays <= 7) {
    return due;
  }

  // Same month: group by week
  if (date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
    // Week starting Monday
    const dayOfWeek = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `week-${formatDateKey(monday)}`;
  }

  // Future month
  return `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function groupLabel(key: string, today: Date): string {
  // Individual date
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return dateLabel(key, today);
  }

  // Week group
  if (key.startsWith('week-')) {
    const mondayStr = key.replace('week-', '');
    const monday = new Date(mondayStr + 'T00:00:00');
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()}–${sunday.getDate()}`;
  }

  // Month group
  if (key.startsWith('month-')) {
    const parts = key.replace('month-', '').split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const label = MONTH_NAMES[month];
    return year === today.getFullYear() ? label : `${label} ${year}`;
  }

  return 'Unscheduled';
}

interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

// ── Component ────────────────────────────────────────────────────────────────

interface GroupedTaskListProps {
  tasks: Task[];
}

export function GroupedTaskList({ tasks }: GroupedTaskListProps) {
  const groups = useMemo(() => {
    const today = getLocalToday();
    const groupMap = new Map<string, Task[]>();

    for (const task of tasks) {
      const key = groupKey(task.due, today);
      const existing = groupMap.get(key) ?? [];
      existing.push(task);
      groupMap.set(key, existing);
    }

    // Convert to array and sort by key
    const result: TaskGroup[] = [];
    for (const [key, groupTasks] of groupMap) {
      result.push({
        key,
        label: groupLabel(key, today),
        tasks: groupTasks,
      });
    }

    // Sort groups chronologically
    result.sort((a, b) => a.key.localeCompare(b.key));

    return result;
  }, [tasks]);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            {group.label}
          </h3>
          <TaskList tasks={group.tasks} />
        </div>
      ))}
    </div>
  );
}
