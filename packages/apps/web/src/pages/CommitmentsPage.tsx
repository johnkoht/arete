import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckSquare, Check, Trash2, AlertCircle, Clock, CheckCircle2, ArrowUpDown, ChevronUp, ChevronDown, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { useCommitments, useMarkCommitmentDone } from "@/hooks/intelligence.js";
import type { DirectionFilter } from "@/hooks/intelligence.js";
import type { CommitmentItem } from "@/api/types.js";

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterType = "open" | "overdue" | "thisweek" | "all";
type SortBy = "person" | "age";
type SortOrder = "asc" | "desc";

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: "Open", value: "open" },
  { label: "Overdue", value: "overdue" },
  { label: "This Week", value: "thisweek" },
  { label: "All", value: "all" },
];

const DIRECTION_TABS: { label: string; value: DirectionFilter }[] = [
  { label: "Mine", value: "mine" },
  { label: "Theirs", value: "theirs" },
  { label: "All", value: "all" },
];

const EMPTY_STATES: Record<FilterType, { icon: React.ComponentType<{ className?: string }>; title: string; description: string }> = {
  open: {
    icon: CheckCircle2,
    title: "All caught up — no open commitments",
    description: "Process meetings to start tracking commitments.",
  },
  overdue: {
    icon: AlertCircle,
    title: "No overdue commitments. Great work!",
    description: "All your commitments are on track.",
  },
  thisweek: {
    icon: Clock,
    title: "No commitments due this week",
    description: "Nothing due in the next 7 days.",
  },
  all: {
    icon: CheckSquare,
    title: "No commitments tracked yet",
    description: "Process meetings to start tracking commitments.",
  },
};

// ── Direction badge ───────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
  const isIOwe = direction === "i_owe_them";
  return (
    <Badge
      variant="secondary"
      className={`text-xs font-normal flex-shrink-0 ${
        isIOwe
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          : "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400"
      }`}
    >
      {isIOwe ? "I owe them" : "They owe me"}
    </Badge>
  );
}

// ── Age badge ─────────────────────────────────────────────────────────────────

function AgeBadge({ daysOpen }: { daysOpen: number }) {
  const color =
    daysOpen < 7
      ? "text-emerald-600"
      : daysOpen <= 14
        ? "text-amber-600"
        : "text-red-600";

  return (
    <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${color}`}>
      {daysOpen}d
    </span>
  );
}

// ── Action buttons ────────────────────────────────────────────────────────────

function CommitmentActions({ item }: { item: CommitmentItem }) {
  const { mutate, isPending } = useMarkCommitmentDone();

  function handleMarkDone() {
    mutate(
      { id: item.id, status: "resolved" },
      {
        onSuccess: () => toast.success("Commitment resolved ✓"),
        onError: () => toast.error("Failed to update commitment"),
      },
    );
  }

  function handleDrop() {
    mutate(
      { id: item.id, status: "dropped" },
      {
        onSuccess: () => toast.success("Commitment dropped"),
        onError: () => toast.error("Failed to update commitment"),
      },
    );
  }

  const isResolved = item.status === "resolved";
  const isDropped = item.status === "dropped";
  const isSettled = isResolved || isDropped;

  if (isSettled) {
    if (isResolved) {
      return (
        <Badge variant="secondary" className="text-xs flex-shrink-0 bg-emerald-50 text-emerald-700">
          Resolved
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs flex-shrink-0">
        Dropped
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs gap-1"
        onClick={handleMarkDone}
        disabled={isPending}
      >
        <Check className="h-3 w-3" />
        Done
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={isPending}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop this commitment?</AlertDialogTitle>
            <AlertDialogDescription>
              It won't show up again. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDrop}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Drop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sortable column header ────────────────────────────────────────────────────

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string;
  sortKey: SortBy;
  currentSort: SortBy | null;
  currentOrder: SortOrder;
  onSort: (key: SortBy) => void;
}) {
  const isActive = currentSort === sortKey;
  
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {isActive ? (
        currentOrder === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function CommitmentSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Person filter chip ────────────────────────────────────────────────────────

function PersonFilterChip({ 
  personSlug, 
  onClear 
}: { 
  personSlug: string; 
  onClear: () => void; 
}) {
  const displayName = personSlug.replace(/-/g, " ");
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
      <span>Filtered by:</span>
      <span className="font-medium">{displayName}</span>
      <button
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Clear person filter"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommitmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Read URL params
  const initialFilter = (searchParams.get("filter") as FilterType) ?? "open";
  const initialDirection = (searchParams.get("direction") as DirectionFilter) ?? "all";
  const personParam = searchParams.get("person") ?? undefined;
  
  // Local state
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);
  const [activeDirection, setActiveDirection] = useState<DirectionFilter>(initialDirection);
  const [sortBy, setSortBy] = useState<SortBy | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const { data: commitments, isLoading, error } = useCommitments({
    filter: activeFilter,
    direction: activeDirection,
    person: personParam,
  });

  // Update URL params (functional setter to preserve other params)
  function updateSearchParams(updates: Record<string, string | undefined>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || (key === "filter" && value === "open") || (key === "direction" && value === "all")) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    }, { replace: true });
  }

  function selectFilter(f: FilterType) {
    setActiveFilter(f);
    updateSearchParams({ filter: f !== "open" ? f : undefined });
  }

  function selectDirection(d: DirectionFilter) {
    setActiveDirection(d);
    updateSearchParams({ direction: d !== "all" ? d : undefined });
  }

  function clearPersonFilter() {
    updateSearchParams({ person: undefined });
  }

  function handleSort(key: SortBy) {
    if (sortBy === key) {
      // Toggle order
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  }

  // Sort commitments
  const sortedCommitments = useMemo(() => {
    if (!sortBy || !commitments.length) return commitments;

    return [...commitments].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "person") {
        cmp = (a.personSlug ?? "").localeCompare(b.personSlug ?? "");
      } else if (sortBy === "age") {
        cmp = a.daysOpen - b.daysOpen;
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }, [commitments, sortBy, sortOrder]);

  const emptyState = EMPTY_STATES[activeFilter];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Commitments"
        description="Track what you've promised and what's owed to you"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Direction subnav */}
          <div className="flex items-center gap-1 border-b pb-3">
            {DIRECTION_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => selectDirection(tab.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeDirection === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => selectFilter(tab.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeFilter === tab.value
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Person filter chip */}
          {personParam && (
            <PersonFilterChip personSlug={personParam} onClear={clearPersonFilter} />
          )}

          {/* Content */}
          {isLoading && <CommitmentSkeletons />}

          {!isLoading && error && (
            <p className="text-sm text-destructive py-8 text-center">
              Failed to load commitments. Please try again.
            </p>
          )}

          {!isLoading && !error && sortedCommitments.length === 0 && (
            <EmptyState
              icon={emptyState.icon}
              title={emptyState.title}
              description={emptyState.description}
              className="py-16"
            />
          )}

          {!isLoading && !error && sortedCommitments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {sortedCommitments.length} commitment{sortedCommitments.length !== 1 ? "s" : ""}
              </p>
              
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">
                        <SortableHeader
                          label="Person"
                          sortKey="person"
                          currentSort={sortBy}
                          currentOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>Commitment</TableHead>
                      <TableHead className="w-[110px]">Direction</TableHead>
                      <TableHead className="w-[80px]">
                        <SortableHeader
                          label="Age"
                          sortKey="age"
                          currentSort={sortBy}
                          currentOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCommitments.map((item) => {
                      const isSettled = item.status === "resolved" || item.status === "dropped";
                      return (
                        <TableRow key={item.id} className={isSettled ? "opacity-50" : ""}>
                          <TableCell>
                            {item.personSlug ? (
                              <Link
                                to={`/people/${item.personSlug}`}
                                className="text-sm text-primary hover:underline font-medium"
                              >
                                {item.personSlug.replace(/-/g, " ")}
                              </Link>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className={`text-sm leading-snug ${isSettled ? "line-through text-muted-foreground" : ""}`}>
                                {item.text}
                              </p>
                              {item.date && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <DirectionBadge direction={item.direction} />
                          </TableCell>
                          <TableCell>
                            <AgeBadge daysOpen={item.daysOpen} />
                          </TableCell>
                          <TableCell className="text-right">
                            <CommitmentActions item={item} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
