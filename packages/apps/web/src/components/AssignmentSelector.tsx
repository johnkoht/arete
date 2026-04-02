/**
 * AssignmentSelector — Inline area/project assignment for task rows.
 *
 * Shows a subtle badge when assigned, or a "+" icon when not.
 * Click opens a popover with a searchable list of areas or projects.
 * Selecting updates the task via useUpdateTask.
 */

import { useState, useMemo, useRef, useEffect, useCallback, type MouseEvent } from 'react';
import { Check, FolderOpen, Briefcase, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Badge } from '@/components/ui/badge.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';

export type AssignmentOption = {
  slug: string;
  name: string;
};

type AssignmentSelectorProps = {
  /** 'area' or 'project' — determines icon and label */
  type: 'area' | 'project';
  /** Currently assigned slug, or null */
  current: string | null;
  /** Available options to choose from */
  options: AssignmentOption[];
  /** Called when user selects or clears an assignment */
  onAssign: (slug: string | null) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
};

export function AssignmentSelector({
  type,
  current,
  options,
  onAssign,
  disabled = false,
}: AssignmentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const Icon = type === 'area' ? FolderOpen : Briefcase;
  const label = type === 'area' ? 'Area' : 'Project';

  // Focus search input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Reset search when popover closes
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  const currentOption = options.find((o) => o.slug === current);

  const handleSelect = useCallback(
    (slug: string) => {
      onAssign(slug);
      setOpen(false);
    },
    [onAssign],
  );

  const handleClear = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onAssign(null);
      setOpen(false);
    },
    [onAssign],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {current && currentOption ? (
          <button
            type="button"
            aria-label={`Change ${label}: ${currentOption.name}`}
            className="group inline-flex items-center"
          >
            <Badge
              variant="outline"
              className="text-xs cursor-pointer hover:bg-accent gap-1"
            >
              <Icon className="h-3 w-3" />
              {currentOption.name}
              <X
                className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleClear}
              />
            </Badge>
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Assign ${label}`}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[220px] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder={`Search ${label.toLowerCase()}s...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-transparent border rounded-md outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Options list */}
        <div className="max-h-[200px] overflow-y-auto p-1">
          {/* Clear option */}
          {current && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
              onClick={() => {
                onAssign(null);
                setOpen(false);
              }}
            >
              <span className="flex-1 text-left text-muted-foreground italic">
                None
              </span>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No {label.toLowerCase()}s found
            </div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.slug}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent',
                  current === option.slug && 'bg-accent',
                )}
                onClick={() => handleSelect(option.slug)}
              >
                <span className="flex-1 text-left truncate">
                  {option.name}
                </span>
                {current === option.slug && <Check className="h-4 w-4" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
