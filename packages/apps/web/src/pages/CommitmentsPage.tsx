import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckSquare, Check, Trash2, AlertCircle, Clock, CheckCircle2, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, ArrowRight, ArrowLeft, RefreshCw, type LucideIcon, ExternalLink } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { useCommitments, useMarkCommitmentDone, useReconcileCommitments } from "@/hooks/intelligence.js";
import type { DirectionFilter, PriorityFilter, ReconciliationCandidate } from "@/hooks/intelligence.js";
import type { CommitmentItem, PriorityLevel } from "@/api/types.js";

const PAGE_SIZE = 25;

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterType = "open" | "overdue" | "thisweek" | "all";
type SortBy = "person" | "age" | "priority";
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

const PRIORITY_TABS: { label: string; value: PriorityFilter }[] = [
  { label: "All", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
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

// ── Priority badge ────────────────────────────────────────────────────────────

function PriorityBadge({ level, score }: { level: PriorityLevel; score: number }) {
  const colorClass =
    level === "high"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
      : level === "medium"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400";

  const label = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <Badge
      variant="secondary"
      className={`text-xs font-medium flex-shrink-0 ${colorClass}`}
      title={`Priority score: ${score}`}
    >
      {label}
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

// ── Reconcile modal ───────────────────────────────────────────────────────────

function ReconcileModal({
  open,
  onOpenChange,
  candidates,
  onConfirm,
  onDismiss,
  isConfirming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: ReconciliationCandidate[];
  onConfirm: (commitmentId: string) => void;
  onDismiss: (commitmentId: string) => void;
  isConfirming: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reconcile Commitments</DialogTitle>
          <DialogDescription>
            Found potential matches from recent meetings. Review and confirm to mark as resolved.
          </DialogDescription>
        </DialogHeader>
        
        {candidates.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No matching completions found in recent meetings.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-3 py-2">
            {candidates.map((candidate) => (
              <div
                key={candidate.commitmentId}
                className="border rounded-lg p-4 space-y-3 bg-card"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-snug">{candidate.commitmentText}</p>
                  <p className="text-xs text-muted-foreground">
                    {candidate.personName}
                  </p>
                </div>
                
                <div className="flex items-start gap-2 text-xs">
                  <Badge variant="secondary" className="flex-shrink-0">
                    {Math.round(candidate.confidence * 100)}% match
                  </Badge>
                  <div className="text-muted-foreground">
                    <span className="font-medium">From:</span>{" "}
                    <Link 
                      to={`/meetings/${candidate.sourceMeeting}`}
                      className="text-primary hover:underline"
                      onClick={() => onOpenChange(false)}
                    >
                      {candidate.sourceMeeting}
                    </Link>
                  </div>
                </div>
                
                <div className="bg-muted/50 rounded p-2 text-xs text-muted-foreground">
                  <span className="font-medium">Matched text:</span> "{candidate.matchedText}"
                </div>
                
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => onConfirm(candidate.commitmentId)}
                    disabled={isConfirming}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Confirm Resolved
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => onDismiss(candidate.commitmentId)}
                    disabled={isConfirming}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommitmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Read URL params
  const initialFilter = (searchParams.get("filter") as FilterType) ?? "open";
  const initialDirection = (searchParams.get("direction") as DirectionFilter) ?? "all";
  const initialPriority = (searchParams.get("priority") as PriorityFilter) ?? "all";
  const personParam = searchParams.get("person") ?? undefined;
  
  // URL-based pagination state
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const offset = (page - 1) * PAGE_SIZE;
  
  // Local state
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);
  const [activeDirection, setActiveDirection] = useState<DirectionFilter>(initialDirection);
  const [activePriority, setActivePriority] = useState<PriorityFilter>(initialPriority);
  const [sortBy, setSortBy] = useState<SortBy | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  
  // Reconcile modal state
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [reconcileCandidates, setReconcileCandidates] = useState<ReconciliationCandidate[]>([]);

  const { data: commitments, total: totalItems, isLoading, error } = useCommitments({
    filter: activeFilter,
    direction: activeDirection,
    person: personParam,
    priority: activePriority,
    limit: PAGE_SIZE,
    offset,
  });
  
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Reconcile and mark done mutations
  const reconcileMutation = useReconcileCommitments();
  const markDoneMutation = useMarkCommitmentDone();

  // Check if there are open commitments (for showing reconcile button)
  const hasOpenCommitments = commitments.some((c) => c.status === "open");

  function handleReconcileClick() {
    reconcileMutation.mutate(undefined, {
      onSuccess: (data) => {
        setReconcileCandidates(data.candidates);
        setReconcileModalOpen(true);
        if (data.candidates.length === 0) {
          toast.info("No matching completions found in recent meetings");
        }
      },
      onError: () => {
        toast.error("Failed to scan for completions");
      },
    });
  }

  function handleConfirmReconcile(commitmentId: string) {
    markDoneMutation.mutate(
      { id: commitmentId, status: "resolved" },
      {
        onSuccess: () => {
          // Remove from candidates list
          setReconcileCandidates((prev) =>
            prev.filter((c) => c.commitmentId !== commitmentId)
          );
          toast.success("Commitment resolved ✓");
        },
        onError: () => {
          toast.error("Failed to resolve commitment");
        },
      }
    );
  }

  function handleDismissReconcile(commitmentId: string) {
    // Just remove from candidates (don't mark as resolved)
    setReconcileCandidates((prev) =>
      prev.filter((c) => c.commitmentId !== commitmentId)
    );
  }

  // Update URL params (functional setter to preserve other params)
  function updateSearchParams(updates: Record<string, string | undefined>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || (key === "filter" && value === "open") || (key === "direction" && value === "all") || (key === "priority" && value === "all")) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    }, { replace: true });
  }

  // Set page via URL params (preserves other params)
  function setPage(newPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage === 1) {
        next.delete("page");
      } else {
        next.set("page", String(newPage));
      }
      return next;
    }, { replace: true });
  }

  function selectFilter(f: FilterType) {
    setActiveFilter(f);
    // Reset page when filter changes
    updateSearchParams({ filter: f !== "open" ? f : undefined, page: undefined });
  }

  function selectDirection(d: DirectionFilter) {
    setActiveDirection(d);
    // Reset page when direction changes
    updateSearchParams({ direction: d !== "all" ? d : undefined, page: undefined });
  }

  function selectPriority(p: PriorityFilter) {
    setActivePriority(p);
    // Reset page when priority changes
    updateSearchParams({ priority: p !== "all" ? p : undefined, page: undefined });
  }

  function clearPersonFilter() {
    // Reset page when person filter changes
    updateSearchParams({ person: undefined, page: undefined });
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

  // Sort commitments — backend already sorts by priority desc, but allow local re-sorting
  const sortedCommitments = useMemo(() => {
    // If no local sort is selected, use backend's default (priority desc)
    if (!sortBy || !commitments.length) return commitments;

    return [...commitments].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "person") {
        cmp = (a.personSlug ?? "").localeCompare(b.personSlug ?? "");
      } else if (sortBy === "age") {
        cmp = a.daysOpen - b.daysOpen;
      } else if (sortBy === "priority") {
        cmp = a.priority - b.priority;
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
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-1">
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
          {hasOpenCommitments && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconcileClick}
              disabled={reconcileMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reconcileMutation.isPending ? "animate-spin" : ""}`} />
              Reconcile
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-2 border-b">
        <div className="flex items-center gap-4">
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
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Priority:</span>
            {PRIORITY_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => selectPriority(tab.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  activePriority === tab.value
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
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
          <>
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
                      label="Priority"
                      sortKey="priority"
                      currentSort={sortBy}
                      currentOrder={sortOrder}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3">
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
                        <PriorityBadge level={item.priorityLevel} score={item.priority} />
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, totalItems)} of {totalItems}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={!hasPrevPage}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={!hasNextPage}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Reconcile modal */}
      <ReconcileModal
        open={reconcileModalOpen}
        onOpenChange={setReconcileModalOpen}
        candidates={reconcileCandidates}
        onConfirm={handleConfirmReconcile}
        onDismiss={handleDismissReconcile}
        isConfirming={markDoneMutation.isPending}
      />
    </div>
  );
}
