import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckSquare, Check, Trash2, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { useCommitments, useMarkCommitmentDone } from "@/hooks/intelligence.js";
import type { CommitmentItem } from "@/api/types.js";

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterType = "open" | "overdue" | "thisweek" | "all";

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: "Open", value: "open" },
  { label: "Overdue", value: "overdue" },
  { label: "This Week", value: "thisweek" },
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

// ── Commitment row ────────────────────────────────────────────────────────────

function CommitmentRow({ item }: { item: CommitmentItem }) {
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

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-opacity ${
        isSettled ? "opacity-40" : ""
      }`}
    >
      {/* Commitment text */}
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${isSettled ? "line-through text-muted-foreground" : ""}`}>
          {item.text}
        </p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {item.personSlug && (
            <Link
              to={`/people/${item.personSlug}`}
              className="text-xs text-primary hover:underline"
            >
              {item.personSlug.replace(/-/g, " ")}
            </Link>
          )}
          {item.date && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Direction */}
      <DirectionBadge direction={item.direction} />

      {/* Age */}
      <AgeBadge daysOpen={item.daysOpen} />

      {/* Actions */}
      {!isSettled && (
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
      )}

      {isResolved && (
        <Badge variant="secondary" className="text-xs flex-shrink-0 bg-emerald-50 text-emerald-700">
          Resolved
        </Badge>
      )}
      {isDropped && (
        <Badge variant="secondary" className="text-xs flex-shrink-0">
          Dropped
        </Badge>
      )}
    </div>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function CommitmentSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommitmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterType) ?? "open";
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);

  const { data: commitments, isLoading, error } = useCommitments(activeFilter);

  function selectFilter(f: FilterType) {
    setActiveFilter(f);
    setSearchParams(f !== "open" ? { filter: f } : {}, { replace: true });
  }

  const emptyState = EMPTY_STATES[activeFilter];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Commitments"
        description="Track what you've promised and what's owed to you"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Filter tabs */}
          <div className="flex items-center gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => selectFilter(tab.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeFilter === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {isLoading && <CommitmentSkeletons />}

          {!isLoading && error && (
            <p className="text-sm text-destructive py-8 text-center">
              Failed to load commitments. Please try again.
            </p>
          )}

          {!isLoading && !error && commitments.length === 0 && (
            <EmptyState
              icon={emptyState.icon}
              title={emptyState.title}
              description={emptyState.description}
              className="py-16"
            />
          )}

          {!isLoading && !error && commitments.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {commitments.length} commitment{commitments.length !== 1 ? "s" : ""}
              </p>
              {commitments.map((item) => (
                <CommitmentRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
