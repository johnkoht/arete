import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Trash2, AlertCircle, Clock, CheckCircle2, ArrowUpDown, ChevronUp, ChevronDown, X, ArrowRight, ArrowLeft, type LucideIcon, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

const EMPTY_STATES: Record<FilterType, { icon: LucideIcon; title: string; description: string }> = {
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
    icon: CheckCircle2,
    title: "No commitments tracked yet",
    description: "Process meetings to start tracking commitments.",
  },
};

// ── Direction icon with tooltip ───────────────────────────────────────────────

function DirectionIcon({ direction }: { direction: string }) {
  const isIOwe = direction === "i_owe_them";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded ${
            isIOwe
              ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
              : "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400"
          }`}>
            {isIOwe ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isIOwe ? "I owe them" : "They owe me"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

// ── Completion button (left side) ─────────────────────────────────────────────

function CompletionAction({ item }: { item: CommitmentItem }) {
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

  const isResolved = item.status === "resolved";
  const isDropped = item.status === "dropped";
  const isSettled = isResolved || isDropped;

  if (isSettled) {
    if (isResolved) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleMarkDone}
            disabled={isPending}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-muted-foreground/30 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
          >
            <span className="sr-only">Mark done</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Mark as done</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Delete action (right side) ────────────────────────────────────────────────

function DeleteAction({ item }: { item: CommitmentItem }) {
  const { mutate, isPending } = useMarkCommitmentDone();

  function handleDrop() {
    mutate(
      { id: item.id, status: "dropped" },
      {
        onSuccess: () => toast.success("Commitment dropped"),
        onError: () => toast.error("Failed to update commitment"),
      },
    );
  }

  const isSettled = item.status === "resolved" || item.status === "dropped";

  if (isSettled) {
    return (
      <Badge variant="secondary" className="text-xs flex-shrink-0">
        {item.status === "resolved" ? "Resolved" : "Dropped"}
      </Badge>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Direction subnav — underlined tabs style */}
      <div className="px-6 pt-3 pb-0 border-b">
        <Tabs value={activeDirection} onValueChange={(v) => selectDirection(v as DirectionFilter)}>
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            {DIRECTION_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none bg-transparent hover:text-foreground"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-2 border-b">
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
      </div>

      {/* Person filter chip */}
      {personParam && (
        <div className="px-6 py-2 border-b bg-muted/30">
          <PersonFilterChip personSlug={personParam} onClear={clearPersonFilter} />
        </div>
      )}

      <div className="flex-1 overflow-auto">

        {/* Content */}
        {isLoading && (
          <div className="px-6 py-4">
            <CommitmentSkeletons />
          </div>
        )}

        {!isLoading && error && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load commitments</p>
            <p className="text-xs text-muted-foreground mt-1">Please try again.</p>
          </div>
        )}

        {!isLoading && !error && sortedCommitments.length === 0 && (
          <div className="px-6">
            <EmptyState
              icon={emptyState.icon}
              title={emptyState.title}
              description={emptyState.description}
              className="py-16"
            />
          </div>
        )}

        {!isLoading && !error && sortedCommitments.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="w-12 px-4 py-3"></th>
                <th className="px-4 py-3">
                  <SortableHeader
                    label="Person"
                    sortKey="person"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3">Commitment</th>
                <th className="w-16 px-4 py-3 text-center">Dir</th>
                <th className="w-16 px-4 py-3">
                  <SortableHeader
                    label="Age"
                    sortKey="age"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                </th>
                <th className="w-24 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedCommitments.map((item) => {
                const isSettled = item.status === "resolved" || item.status === "dropped";
                // Check for source field (may be added in future API updates)
                const source = (item as unknown as { source?: string }).source;
                return (
                  <tr key={item.id} className={`border-b transition-colors hover:bg-accent/50 ${isSettled ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <CompletionAction item={item} />
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className={`text-sm leading-snug ${isSettled ? "line-through text-muted-foreground" : ""}`}>
                          {item.text}
                        </p>
                        <div className="flex items-center gap-2">
                          {item.date && (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                            </span>
                          )}
                          {source && (
                            <Link
                              to={`/meetings/${source}`}
                              className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Source
                            </Link>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <DirectionIcon direction={item.direction} />
                    </td>
                    <td className="px-4 py-3">
                      <AgeBadge daysOpen={item.daysOpen} />
                    </td>
                    <td className="px-4 py-3">
                      <DeleteAction item={item} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
