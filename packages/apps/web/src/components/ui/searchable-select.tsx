/**
 * SearchableSelect — A dropdown with search filtering.
 * Reusable for project picker, person selector, meeting picker, etc.
 */

import * as React from "react";
import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";

export type SearchableSelectItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

export type SearchableSelectProps = {
  items: SearchableSelectItem[];
  selected?: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  /** Visual style for inherited/default values */
  muted?: boolean;
};

export function SearchableSelect({
  items,
  selected,
  onSelect,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  allowClear = true,
  disabled = false,
  className,
  muted = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Reset search when popover closes
  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, search]);

  const selectedItem = items.find((item) => item.id === selected);

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            muted && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedItem ? (
              <>
                {selectedItem.icon}
                {selectedItem.label}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <span className="flex items-center gap-1 ml-2">
            {allowClear && selected && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <div className="p-2 border-b" onKeyDown={handleKeyDown}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-transparent border rounded-md outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-[200px] overflow-y-auto p-1">
          {allowClear && (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent",
                !selected && "bg-accent"
              )}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              <span className="flex-1 text-left text-muted-foreground italic">
                None
              </span>
              {!selected && <Check className="h-4 w-4" />}
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent",
                  selected === item.id && "bg-accent"
                )}
                onClick={() => handleSelect(item.id)}
              >
                {item.icon}
                <span className="flex-1 text-left truncate">{item.label}</span>
                {selected === item.id && <Check className="h-4 w-4" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
