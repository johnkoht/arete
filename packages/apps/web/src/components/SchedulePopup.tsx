/**
 * SchedulePopup component - Quick date assignment popup.
 *
 * Features:
 * - Click schedule badge → shadcn Popover
 * - Options: Today / Tomorrow / Pick date / Anytime / Someday
 * - Date picker: shadcn Calendar
 * - On selection → useUpdateTask() with new due value
 * - Full keyboard accessibility
 *
 * @todo Implement component (currently a stub for test-first development)
 */

import { Button } from '@/components/ui/button.js';

interface SchedulePopupProps {
  taskId: string;
  currentDestination: 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';
  currentDue: string | null;
}

export function SchedulePopup({ taskId: _taskId, currentDestination, currentDue: _currentDue }: SchedulePopupProps) {
  // Stub implementation - to be replaced with full implementation
  return (
    <Button variant="secondary" size="sm" aria-label={`Schedule: ${currentDestination}`}>
      {currentDestination}
    </Button>
  );
}
