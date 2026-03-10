import { useState, useMemo } from "react";
import { Search, Brain, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useMemory } from "@/hooks/memory.js";
import type { MemoryItem, MemoryItemType } from "@/api/types.js";

const PAGE_SIZE = 25;

// ── Type tabs ─────────────────────────────────────────────────────────────────

type FilterTab = "all" | MemoryItemType;

const TABS: Array<{ label: string; value: FilterTab }> = [
  { label: "All", value: "all" },
  { label: "Decisions", value: "decision" },
  { label: "Learnings", value: "learning" },
];

// ── Memory item card ──────────────────────────────────────────────────────────

function MemoryTypeBadge({ type }: { type: MemoryItemType }) {
  return type === "decision" ? (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 ring-1 ring-inset ring-blue-200 dark:ring-blue-800 flex-shrink-0">
      Decision
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 ring-1 ring-inset ring-purple-200 dark:ring-purple-800 flex-shrink-0">
      Learning
    </span>
  );
}

function MemoryCard({ item }: { item: MemoryItem }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <MemoryTypeBadge type={item.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{item.title}</p>
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {item.date
                ? formatDistanceToNow(new Date(item.date), { addSuffix: true })
                : "—"}
            </span>
          </div>

          {item.content && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
              {item.content}
            </div>
          )}

          {item.source && (
            <p className="mt-2 text-xs text-muted-foreground/70">
              Source: {item.source}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MemoryFeed() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useMemory({
    type: activeTab,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Reset page when tab changes
  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setPage(0);
  };

  // Client-side search filter on loaded data
  const filtered = useMemo(() => {
    if (!search.trim()) return data?.items ?? [];
    const q = search.toLowerCase();
    return (data?.items ?? []).filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  // Tab counts are approximate (from current page) - total is accurate for 'all'
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  // Tab counts - we show total for "all", but for filtered tabs we'd need separate API calls
  // For now, just show the counts from the current fetched data as a simplification
  const tabCounts: Record<FilterTab, number | undefined> = {
    all: totalItems,
    decision: undefined, // Would need separate count endpoint
    learning: undefined, // Would need separate count endpoint
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Memory"
        description="Decisions and learnings from your work"
        action={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search memory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-56"
            />
          </div>
        }
      />

      {/* Type filter tabs */}
      <div className="flex gap-1 border-b px-6 pt-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tabCounts[tab.value] !== undefined && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({tabCounts[tab.value]})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Error */}
        {error && (
          <div className="text-center py-8">
            <p className="text-sm text-destructive font-medium">Failed to load memory</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 max-w-3xl">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon={Brain}
            title={
              search
                ? "No items match your search"
                : data?.total === 0
                ? "No decisions or learnings captured yet"
                : "No items in this category"
            }
            description={
              search
                ? "Try different search terms."
                : data?.total === 0
                ? "Process your meetings with `arete view` to start building memory."
                : undefined
            }
            className="mt-8"
          />
        )}

        {/* Feed */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="space-y-3 max-w-3xl">
            {filtered.map((item) => (
              <MemoryCard key={item.id} item={item} />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t mt-6">
                <p className="text-sm text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalItems)} of {totalItems}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={!hasPrevPage}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasNextPage}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
