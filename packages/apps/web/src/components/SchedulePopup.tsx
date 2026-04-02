/**
 * SchedulePopup component - Quick date assignment popup.
 *
 * Features:
 * - Click schedule badge → shadcn Popover
 * - Options: Today / Tomorrow / Pick date / Anytime / Someday
 * - Date picker: shadcn Calendar
 * - On selection → useUpdateTask() with new due value
 * - Popup closes after selection; focus returns to trigger badge
 *
 * Accessibility:
 * - Escape closes popup
 * - Arrow Up/Down navigate options
 * - Enter selects highlighted option
 * - Focus trapped within popup
 * - role="listbox" on popup, role="option" on options
 */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import {
  CalendarDays,
  Sun,
  Sunrise,
  Clock,
  Archive,
  CalendarIcon,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Badge } from '@/components/ui/badge.js';
import { useUpdateTask } from '@/hooks/tasks.js';
import type { Task } from '@/api/types.js';

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduleOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  action: 'today' | 'tomorrow' | 'pick-date' | 'anytime' | 'someday';
};

interface SchedulePopupProps {
  taskId: string;
  currentDestination: Task['destination'];
  currentDue: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SCHEDULE_OPTIONS: ScheduleOption[] = [
  { id: 'today', label: 'Today', icon: Sun, action: 'today' },
  { id: 'tomorrow', label: 'Tomorrow', icon: Sunrise, action: 'tomorrow' },
  { id: 'pick-date', label: 'Pick date', icon: CalendarIcon, action: 'pick-date' },
  { id: 'anytime', label: 'Anytime', icon: Clock, action: 'anytime' },
  { id: 'someday', label: 'Someday', icon: Archive, action: 'someday' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): Date {
  const now = new Date();
  // Reset to start of day in local timezone
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getTomorrow(): Date {
  const today = getToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SchedulePopup({ taskId, currentDestination, currentDue: _currentDue }: SchedulePopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { mutate } = useUpdateTask();

  // Reset state when popover closes
  useEffect(() => {
    if (!isOpen) {
      setShowCalendar(false);
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Focus first option when listbox opens
  useEffect(() => {
    if (isOpen && !showCalendar && highlightedIndex === -1) {
      // Small delay to ensure popover is rendered
      const timer = setTimeout(() => {
        setHighlightedIndex(0);
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen, showCalendar, highlightedIndex]);

  // Keep highlighted option scrolled into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      // scrollIntoView may not be available in test environments (jsdom)
      optionRefs.current[highlightedIndex]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
    // Return focus to trigger
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  }, []);

  const handleSelect = useCallback((action: ScheduleOption['action']) => {
    switch (action) {
      case 'today':
        // Set due date AND move to must bucket to ensure task appears in Today view
        mutate({
          id: taskId,
          updates: { due: formatDate(getToday()), destination: 'must' },
        });
        closePopover();
        break;

      case 'tomorrow':
        // Set due date AND move to should bucket to ensure task appears in Upcoming view
        mutate({
          id: taskId,
          updates: { due: formatDate(getTomorrow()), destination: 'should' },
        });
        closePopover();
        break;

      case 'pick-date':
        setShowCalendar(true);
        break;

      case 'anytime':
        mutate({
          id: taskId,
          updates: { due: null, destination: 'anytime' },
        });
        closePopover();
        break;

      case 'someday':
        mutate({
          id: taskId,
          updates: { due: null, destination: 'someday' },
        });
        closePopover();
        break;
    }
  }, [taskId, mutate, closePopover]);

  const handleCalendarSelect = useCallback((date: Date | undefined) => {
    if (date) {
      const today = getToday();
      const tomorrow = getTomorrow();
      const dateStr = formatDate(date);
      const todayStr = formatDate(today);
      const tomorrowStr = formatDate(tomorrow);

      // Determine destination based on selected date:
      // - Today's date → must (appears in Today view)
      // - Tomorrow or later → should (appears in Upcoming view)
      let destination: 'must' | 'should' = 'should';
      if (dateStr === todayStr) {
        destination = 'must';
      }

      mutate({
        id: taskId,
        updates: { due: dateStr, destination },
      });
      closePopover();
    }
  }, [taskId, mutate, closePopover]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (showCalendar) {
      // Let calendar handle its own keys
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < SCHEDULE_OPTIONS.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : SCHEDULE_OPTIONS.length - 1
        );
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < SCHEDULE_OPTIONS.length) {
          handleSelect(SCHEDULE_OPTIONS[highlightedIndex].action);
        }
        break;

      case 'Home':
        e.preventDefault();
        setHighlightedIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setHighlightedIndex(SCHEDULE_OPTIONS.length - 1);
        break;
    }
  }, [showCalendar, highlightedIndex, handleSelect]);

  const handleOptionClick = useCallback((index: number) => {
    setHighlightedIndex(index);
    handleSelect(SCHEDULE_OPTIONS[index].action);
  }, [handleSelect]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Schedule: ${currentDestination}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="inline-flex"
        >
          <Badge variant="secondary" className="text-xs flex items-center gap-1 cursor-pointer hover:bg-secondary/80">
            <CalendarDays className="h-3 w-3" />
            {currentDestination}
          </Badge>
        </button>
      </PopoverTrigger>

      <PopoverContent 
        className="w-48 p-1"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        avoidCollisions={true}
        onKeyDown={handleKeyDown}
      >
        {showCalendar ? (
          <div data-testid="calendar">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={handleCalendarSelect}
              disabled={(date) => date < getToday()}
              initialFocus
            />
          </div>
        ) : (
          <div
            ref={listboxRef}
            role="listbox"
            aria-label="Schedule options"
            tabIndex={-1}
          >
            {SCHEDULE_OPTIONS.map((option, index) => {
              const Icon = option.icon;
              const isHighlighted = index === highlightedIndex;

              return (
                <div
                  key={option.id}
                  ref={(el) => { optionRefs.current[index] = el; }}
                  role="option"
                  aria-selected={isHighlighted}
                  data-highlighted={isHighlighted}
                  tabIndex={isHighlighted ? 0 : -1}
                  onClick={() => handleOptionClick(index)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer
                    ${isHighlighted 
                      ? 'bg-accent text-accent-foreground' 
                      : 'hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
