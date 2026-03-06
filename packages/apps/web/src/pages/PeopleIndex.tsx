import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { usePeople, usePerson } from "@/hooks/people.js";
import type { PersonSummary, PersonCategory } from "@/api/types.js";

type CommitmentFilter = "overdue" | "thisweek" | null;

// ── Health indicator ──────────────────────────────────────────────────────────

function HealthDot({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted" title="No data" />;
  }
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 40
      ? "bg-amber-500"
      : "bg-red-500";
  const label =
    score >= 70 ? "Good" : score >= 40 ? "Fair" : "At risk";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
      title={`${label} (${score})`}
    />
  );
}

function TrendIcon({ trend }: { trend: PersonSummary["trend"] }) {
  if (!trend) return <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />;
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function CategoryBadge({ category }: { category: PersonCategory }) {
  const map: Record<PersonCategory, string> = {
    internal: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-800",
    customer: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-800",
    user: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${map[category]}`}
    >
      {category}
    </span>
  );
}

// ── Person detail drawer ──────────────────────────────────────────────────────

function PersonDrawer({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: person, isLoading } = usePerson(open ? slug : "");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {isLoading || !person ? (
          <div className="space-y-4 pt-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="text-left">{person.name}</SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge category={person.category} />
                {person.role && (
                  <span className="text-sm text-muted-foreground">{person.role}</span>
                )}
                {person.company && (
                  <span className="text-sm text-muted-foreground">· {person.company}</span>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-5">
              {/* Relationship health */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Relationship Health
                </h3>
                <div className="flex items-center gap-2">
                  <HealthDot score={person.healthScore} />
                  <span className="text-sm">
                    {person.healthStatus ?? (person.healthScore === null ? "No data" : "Active")}
                  </span>
                  {person.healthScore !== null && (
                    <span className="text-xs text-muted-foreground">({person.healthScore}/100)</span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Recent meetings */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Meetings
                </h3>
                {person.recentMeetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No meetings on record.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {person.recentMeetings.map((m) => (
                      <li key={`${m.date}-${m.title}`} className="flex items-start gap-2 text-sm">
                        <span className="flex-shrink-0 text-xs text-muted-foreground pt-0.5 w-24">
                          {m.date}
                        </span>
                        <span className="min-w-0 truncate">{m.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Separator />

              {/* Open commitments */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Open Commitments ({person.openCommitments})
                </h3>
                {person.openCommitmentItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open commitments.</p>
                ) : (
                  <ul className="space-y-2">
                    {person.openCommitmentItems.map((c) => (
                      <li key={c.id} className="text-sm">
                        <span className="text-muted-foreground text-xs mr-1.5">
                          {c.direction === "i_owe_them" ? "→ You owe" : "← They owe"}
                        </span>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Stances */}
              {person.stances.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Stances
                    </h3>
                    <ul className="space-y-1">
                      {person.stances.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Repeated asks */}
              {person.repeatedAsks.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Repeated Asks
                    </h3>
                    <ul className="space-y-1">
                      {person.repeatedAsks.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortColumn = "name" | "category" | "lastMeeting" | "openCommitments" | "health";
type SortDirection = "asc" | "desc";

function SortIcon({
  column,
  active,
  direction,
}: {
  column: SortColumn;
  active: SortColumn;
  direction: SortDirection;
}) {
  if (column !== active) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
  return direction === "asc" ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  );
}

// ── Filter badge ──────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<NonNullable<CommitmentFilter>, string> = {
  overdue: "People with overdue commitments",
  thisweek: "People with commitments due this week",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PeopleIndex() {
  const { data, isLoading, error } = usePeople();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Read commitment filter from URL ?filter=overdue|thisweek
  const filterParam = searchParams.get("filter");
  const commitmentFilter: CommitmentFilter =
    filterParam === "overdue" || filterParam === "thisweek" ? filterParam : null;

  // When filter is "overdue" or "thisweek", default sort to openCommitments desc
  useEffect(() => {
    if (commitmentFilter) {
      setSortColumn("openCommitments");
      setSortDirection("desc");
    }
  }, [commitmentFilter]);

  const clearFilter = () => {
    setSearchParams({});
    setSortColumn("name");
    setSortDirection("asc");
  };

  const people = data?.people ?? [];

  const filtered = useMemo(() => {
    let result = people;

    // Apply commitment filter
    if (commitmentFilter === "overdue" || commitmentFilter === "thisweek") {
      result = result.filter((p) => p.openCommitments > 0);
    }

    // Apply search
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.company.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q)
    );
  }, [people, search, commitmentFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "lastMeeting":
          cmp = (a.lastMeetingDate ?? "").localeCompare(b.lastMeetingDate ?? "");
          break;
        case "openCommitments":
          cmp = a.openCommitments - b.openCommitments;
          break;
        case "health":
          cmp = (a.healthScore ?? -1) - (b.healthScore ?? -1);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="People Intelligence"
        description="Relationship health and engagement across your network"
        action={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-56"
            />
          </div>
        }
      />

      {/* Filter badge */}
      {commitmentFilter && (
        <div className="px-6 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing: {FILTER_LABELS[commitmentFilter]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={clearFilter}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {error && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load people</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {isLoading && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Last Meeting</th>
                <th className="px-4 py-3">Open</th>
                <th className="px-4 py-3">Trend</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-6 py-3"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-2.5 w-2.5 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isLoading && !error && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">
                  <button
                    onClick={() => handleSort("name")}
                    className="inline-flex items-center hover:text-foreground"
                  >
                    Name <SortIcon column="name" active={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    onClick={() => handleSort("category")}
                    className="inline-flex items-center hover:text-foreground"
                  >
                    Category <SortIcon column="category" active={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    onClick={() => handleSort("health")}
                    className="inline-flex items-center hover:text-foreground"
                  >
                    Health <SortIcon column="health" active={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    onClick={() => handleSort("lastMeeting")}
                    className="inline-flex items-center hover:text-foreground"
                  >
                    Last Meeting <SortIcon column="lastMeeting" active={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    onClick={() => handleSort("openCommitments")}
                    className="inline-flex items-center hover:text-foreground"
                  >
                    Open <SortIcon column="openCommitments" active={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3">Trend</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8">
                    <EmptyState
                      icon={Users}
                      title={search ? "No people match your search" : "No people found"}
                      description={
                        search
                          ? "Try a different search term."
                          : "Add people files to people/internal/, people/customers/, or people/users/."
                      }
                    />
                  </td>
                </tr>
              ) : (
                sorted.map((person) => (
                  <tr
                    key={person.slug}
                    onClick={() => setSelectedSlug(person.slug)}
                    className="border-b transition-colors hover:bg-accent/50 cursor-pointer"
                  >
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-medium text-foreground">{person.name}</p>
                        {(person.role || person.company) && (
                          <p className="text-xs text-muted-foreground">
                            {[person.role, person.company].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={person.category} />
                    </td>
                    <td className="px-4 py-3">
                      <HealthDot score={person.healthScore} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {person.lastMeetingDate
                        ? formatDistanceToNow(new Date(person.lastMeetingDate), {
                            addSuffix: true,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-medium tabular-nums ${
                          person.openCommitments > 0
                            ? "text-amber-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {person.openCommitments}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TrendIcon trend={person.trend} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedSlug && (
        <PersonDrawer
          slug={selectedSlug}
          open={!!selectedSlug}
          onClose={() => setSelectedSlug(null)}
        />
      )}
    </div>
  );
}
