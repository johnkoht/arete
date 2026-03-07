import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Search, FileText, User, Brain, FolderKanban, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useSearch } from "@/hooks/search.js";
import type { SearchResult, SearchResultType } from "@/api/types.js";

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterType = "all" | "meetings" | "people" | "memory" | "projects";

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: "All", value: "all" },
  { label: "Meetings", value: "meetings" },
  { label: "People", value: "people" },
  { label: "Memory", value: "memory" },
  { label: "Projects", value: "projects" },
];

// ── Type badge + icon ─────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  SearchResultType,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  meeting: {
    label: "Meeting",
    icon: FileText,
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-800",
  },
  person: {
    label: "Person",
    icon: User,
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-800",
  },
  decision: {
    label: "Decision",
    icon: Brain,
    className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 ring-indigo-200 dark:ring-indigo-800",
  },
  learning: {
    label: "Learning",
    icon: BookOpen,
    className: "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 ring-purple-200 dark:ring-purple-800",
  },
  project: {
    label: "Project",
    icon: FolderKanban,
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 ring-amber-200 dark:ring-amber-800",
  },
};

function TypeBadge({ type }: { type: SearchResultType }) {
  const config = TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.className}`}
    >
      <config.icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({ result }: { result: SearchResult }) {
  return (
    <Link
      to={result.url}
      className="flex items-start gap-3 rounded-lg border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors"
    >
      <div className="mt-0.5 flex-shrink-0">
        <TypeBadge type={result.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm leading-snug">{result.title}</p>
        {result.excerpt && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {result.excerpt}
          </p>
        )}
      </div>
      {result.date && (
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(result.date), { addSuffix: true })}
        </span>
      )}
    </Link>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function ResultSkeletons() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-16 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const initialQ = searchParams.get("q") ?? "";
  const initialType = (searchParams.get("type") as FilterType) ?? "all";

  const [q, setQ] = useState(initialQ);
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialType);

  const searchType = activeFilter === "all" ? undefined : activeFilter;
  const { data: results, isLoading, isFetching, error } = useSearch(q, searchType);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update URL as query changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (activeFilter !== "all") params.set("type", activeFilter);
    setSearchParams(params, { replace: true });
  }, [q, activeFilter, setSearchParams]);

  const hasQuery = q.trim().length >= 2;
  const showResults = hasQuery && !isLoading;
  const showSkeletons = hasQuery && isLoading;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Search"
        description="Find anything in your workspace"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="search"
              placeholder="Search meetings, people, decisions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-11 text-base"
            />
            {isFetching && hasQuery && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveFilter(tab.value)}
                className={`flex-shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeFilter === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Results */}
          {!hasQuery && (
            <EmptyState
              icon={Search}
              title="Start typing to search"
              description="Search across meetings, people, decisions, learnings, and projects."
              className="py-16"
            />
          )}

          {showSkeletons && <ResultSkeletons />}

          {showResults && error && (
            <p className="text-sm text-destructive py-8 text-center">
              Search failed. Please try again.
            </p>
          )}

          {showResults && !error && results.length === 0 && (
            <EmptyState
              icon={Search}
              title={`No results for "${q}"`}
              description="Try a different search term or remove the type filter."
              className="py-16"
            />
          )}

          {showResults && !error && results.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </p>
              {results.map((result, idx) => (
                <ResultRow key={`${result.type}-${result.slug}-${idx}`} result={result} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
