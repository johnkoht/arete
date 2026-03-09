import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Star,
} from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { HealthDot, CategoryBadge, TrendIcon } from "@/components/people/PersonBadges.js";
import { usePeople, useToggleFavorite } from "@/hooks/people.js";
import { useToast } from "@/hooks/use-toast.js";
import type { PersonSummary, PersonCategory } from "@/api/types.js";

type CommitmentFilter = "overdue" | "thisweek" | null;
type CategoryTab = "favorites" | "all" | PersonCategory;

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
  const navigate = useNavigate();
  const { data, isLoading, error } = usePeople();
  const toggleFavorite = useToggleFavorite();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Read commitment filter from URL ?filter=overdue|thisweek
  const filterParam = searchParams.get("filter");
  const commitmentFilter: CommitmentFilter =
    filterParam === "overdue" || filterParam === "thisweek" ? filterParam : null;

  // Read category tab from URL ?category=favorites|internal|customer|user
  const categoryParam = searchParams.get("category");
  const activeCategory: CategoryTab =
    categoryParam === "favorites" || categoryParam === "internal" || categoryParam === "customer" || categoryParam === "user"
      ? categoryParam
      : "all";

  // When filter is "overdue" or "thisweek", default sort to openCommitments desc
  useEffect(() => {
    if (commitmentFilter) {
      setSortColumn("openCommitments");
      setSortDirection("desc");
    }
  }, [commitmentFilter]);

  const clearFilter = () => {
    // Preserve ?category= param when clearing the commitment filter
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("filter");
      return next;
    });
    setSortColumn("name");
    setSortDirection("asc");
  };

  const handleCategoryChange = (cat: CategoryTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cat === "all") {
        next.delete("category");
      } else {
        next.set("category", cat);
      }
      return next;
    });
  };

  const people = data?.people ?? [];

  // Search-filtered (with commitment filter), but NOT yet category-filtered.
  // Used for computing per-tab counts that reflect the current search query.
  const searchFiltered = useMemo(() => {
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

  // Dynamic tab counts — reflect current search query per category
  const tabCounts = useMemo(
    () => ({
      favorites: searchFiltered.filter((p) => p.favorite).length,
      all: searchFiltered.length,
      internal: searchFiltered.filter((p) => p.category === "internal").length,
      customer: searchFiltered.filter((p) => p.category === "customer").length,
      user: searchFiltered.filter((p) => p.category === "user").length,
    }),
    [searchFiltered]
  );

  // Category-filtered (shown in table)
  const filtered = useMemo(() => {
    if (activeCategory === "favorites") {
      return searchFiltered.filter((p) => p.favorite);
    }
    if (activeCategory === "all") return searchFiltered;
    return searchFiltered.filter((p) => p.category === activeCategory);
  }, [searchFiltered, activeCategory]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      // In "all" tab, sort favorites first
      if (activeCategory === "all") {
        const aFav = a.favorite ? 1 : 0;
        const bFav = b.favorite ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav; // favorites first
      }

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
  }, [filtered, sortColumn, sortDirection, activeCategory]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent, person: PersonSummary) => {
    e.stopPropagation(); // Prevent row click navigation
    toggleFavorite.mutate(
      { slug: person.slug, favorite: !person.favorite },
      {
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to update favorite status",
            variant: "destructive",
          });
        },
      }
    );
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

      {/* Category tabs */}
      <div className="px-6 pt-3 pb-0 border-b">
        <Tabs value={activeCategory} onValueChange={(v) => handleCategoryChange(v as CategoryTab)}>
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            {/* Favorites tab first with star icon */}
            <TabsTrigger
              value="favorites"
              className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none bg-transparent hover:text-foreground"
            >
              <Star className="h-3.5 w-3.5 mr-1 fill-amber-400 text-amber-400" />
              Favorites{" "}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({tabCounts.favorites})
              </span>
            </TabsTrigger>
            {(
              [
                { value: "all", label: "All" },
                { value: "internal", label: "Internal" },
                { value: "customer", label: "Customer" },
                { value: "user", label: "User" },
              ] as const
            ).map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none bg-transparent hover:text-foreground"
              >
                {label}{" "}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({tabCounts[value]})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

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
                <th className="w-10 px-3 py-3"></th>
                <th className="px-4 py-3">Name</th>
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
                  <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
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
                <th className="w-10 px-3 py-3"></th>
                <th className="px-4 py-3">
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
                  <td colSpan={7} className="px-6 py-8">
                    <EmptyState
                      icon={activeCategory === "favorites" ? Star : Users}
                      title={
                        activeCategory === "favorites"
                          ? "No favorites yet"
                          : search
                            ? "No people match your search"
                            : "No people found"
                      }
                      description={
                        activeCategory === "favorites"
                          ? "Click the star icon on any person to add them to your favorites."
                          : search
                            ? `No people match "${search}". Try a different name or clear the filter.`
                            : "Add people files to people/internal/, people/customers/, or people/users/."
                      }
                    />
                  </td>
                </tr>
              ) : (
                sorted.map((person: PersonSummary) => (
                  <tr
                    key={person.slug}
                    onClick={() => void navigate(`/people/${person.slug}`)}
                    className="border-b transition-colors hover:bg-accent/50 cursor-pointer"
                  >
                    <td className="px-3 py-3">
                      <button
                        onClick={(e) => handleToggleFavorite(e, person)}
                        className="p-1 rounded hover:bg-accent transition-colors"
                        aria-label={person.favorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star
                          className={`h-4 w-4 ${
                            person.favorite
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/50 hover:text-amber-400"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
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
    </div>
  );
}
