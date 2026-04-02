/**
 * SchedulePopup component - Things 3 inspired "When?" dropdown.
 *
 * Features:
 * - Click schedule badge → shadcn Popover
 * - Top: Today / Tomorrow quick options
 * - Middle: Inline 3-week mini calendar
 * - Expand button (">") for full month view
 * - Bottom: Someday / Anytime options
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
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useUpdateTask } from '@/hooks/tasks.js';
import type { Task } from '@/api/types.js';

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduleOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  action: 'today' | 'tomorrow' | 'anytime' | 'someday';
};

interface SchedulePopupProps {
  taskId: string;
  currentDestination: Task['destination'];
  currentDue: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

// Top quick options (Today, Tomorrow)
const TOP_OPTIONS: ScheduleOption[] = [
  { id: 'today', label: 'Today', icon: Sun, action: 'today' },
  { id: 'tomorrow', label: 'Tomorrow', icon: Sunrise, action: 'tomorrow' },
];

// Bottom options (Someday, Anytime)
const BOTTOM_OPTIONS: ScheduleOption[] = [
  { id: 'someday', label: 'Someday', icon: Archive, action: 'someday' },
  { id: 'anytime', label: 'Anytime', icon: Clock, action: 'anytime' },
];

// All options for keyboard navigation
const ALL_OPTIONS = [...TOP_OPTIONS, ...BOTTOM_OPTIONS];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getTomorrow(): Date {
  const today = getToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Generate 3 weeks of days starting from today's week (Sunday start).
 * Returns array of arrays (weeks), each containing 7 days.
 */
function getThreeWeeksDays(): Date[][] {
  const today = getToday();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Go to Sunday

  const weeks: Date[][] = [];
  for (let w = 0; w < 3; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + (w * 7) + d);
      week.push(date);
    }
    weeks.push(week);
  }
  return weeks;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function isPastDay(date: Date): boolean {
  const today = getToday();
  return date < today;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SchedulePopup({ taskId, currentDestination, currentDue: _currentDue }: SchedulePopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { mutate } = useUpdateTask();

  // Reset state when popover closes
  useEffect(() => {
    if (!isOpen) {
      setShowFullCalendar(false);
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Focus first option when listbox opens
  useEffect(() => {
    if (isOpen && !showFullCalendar && highlightedIndex === -1) {
      const timer = setTimeout(() => {
        setHighlightedIndex(0);
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen, showFullCalendar, highlightedIndex]);

  // Keep highlighted option scrolled into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  }, []);

  const handleSelect = useCallback((action: ScheduleOption['action']) => {
    switch (action) {
      case 'today':
        mutate({
          id: taskId,
          updates: { due: formatDate(getToday()), destination: 'must' },
        });
        closePopover();
        break;

      case 'tomorrow':
        mutate({
          id: taskId,
          updates: { due: formatDate(getTomorrow()), destination: 'should' },
        });
        closePopover();
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

  const handleDateSelect = useCallback((date: Date) => {
    const today = getToday();
    const dateStr = formatDate(date);
    const todayStr = formatDate(today);

    // Determine destination based on selected date
    const destination = dateStr === todayStr ? 'must' : 'should';

    mutate({
      id: taskId,
      updates: { due: dateStr, destination },
    });
    closePopover();
  }, [taskId, mutate, closePopover]);

  const handleFullCalendarSelect = useCallback((date: Date | undefined) => {
    if (date) {
      handleDateSelect(date);
    }
  }, [handleDateSelect]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (showFullCalendar) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < ALL_OPTIONS.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : ALL_OPTIONS.length - 1
        );
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < ALL_OPTIONS.length) {
          handleSelect(ALL_OPTIONS[highlightedIndex].action);
        }
        break;

      case 'Home':
        e.preventDefault();
        setHighlightedIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setHighlightedIndex(ALL_OPTIONS.length - 1);
        break;
    }
  }, [showFullCalendar, highlightedIndex, handleSelect]);

  const handleOptionClick = useCallback((action: ScheduleOption['action']) => {
    handleSelect(action);
  }, [handleSelect]);

  const threeWeeks = getThreeWeeksDays();
  const today = getToday();

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
        className="w-64 p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        avoidCollisions={true}
        onKeyDown={handleKeyDown}
      >
        {showFullCalendar ? (
          <div data-testid="calendar" className="p-1">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={handleFullCalendarSelect}
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
            {/* Top Quick Options: Today / Tomorrow */}
            <div className="p-1 border-b">
              {TOP_OPTIONS.map((option, index) => {
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
                    onClick={() => handleOptionClick(option.action)}
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

            {/* Mini Calendar (3 weeks) */}
            <div data-testid="mini-calendar" className="p-2 border-b">
              {/* Day names header */}
              <div className="grid grid-cols-7 gap-0 mb-1">
                {DAY_NAMES.map((day) => (
                  <div
                    key={day}
                    className="text-[10px] text-muted-foreground text-center font-medium"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 3 weeks of days */}
              {threeWeeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-0">
                  {week.map((date) => {
                    const isToday = isSameDay(date, today);
                    const isPast = isPastDay(date);
                    const dayNum = date.getDate();

                    return (
                      <button
                        key={formatDate(date)}
                        type="button"
                        data-day={formatDate(date)}
                        disabled={isPast}
                        onClick={() => !isPast && handleDateSelect(date)}
                        className={`
                          h-7 w-7 text-xs rounded-sm flex items-center justify-center
                          ${isPast 
                            ? 'text-muted-foreground/50 cursor-not-allowed' 
                            : 'hover:bg-accent hover:text-accent-foreground cursor-pointer'
                          }
                          ${isToday ? 'bg-primary text-primary-foreground font-semibold' : ''}
                        `}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Expand button for full calendar */}
              <div className="flex justify-end mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullCalendar(true)}
                  aria-label="Full calendar"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Bottom Options: Someday / Anytime */}
            <div className="p-1">
              {BOTTOM_OPTIONS.map((option, idx) => {
                const Icon = option.icon;
                const index = TOP_OPTIONS.length + idx; // Offset for keyboard navigation
                const isHighlighted = index === highlightedIndex;

                return (
                  <div
                    key={option.id}
                    ref={(el) => { optionRefs.current[index] = el; }}
                    role="option"
                    aria-selected={isHighlighted}
                    data-highlighted={isHighlighted}
                    tabIndex={isHighlighted ? 0 : -1}
                    onClick={() => handleOptionClick(option.action)}
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
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
