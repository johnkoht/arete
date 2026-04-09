import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Cloud, Loader2, Search, ArrowRight, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { AvatarStack } from "@/components/AvatarStack";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/PageHeader";
import { useMeetings, useSyncKrisp, useJobStatus, useProcessMeeting } from "@/hooks/meetings.js";
import { processMeeting } from "@/api/meetings.js";
import type { Meeting } from "@/api/types.js";
import { formatDistanceToNow, format } from "date-fns";

const PAGE_SIZE = 25;

type FilterTab = "All" | "Triage" | "Approved";
type SortColumn = "title" | "date" | "status" | "duration" | "source";
type SortDirection = "asc" | "desc";

export default function MeetingsIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [search, setSearch] = useState("");
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [processingSlug, setProcessingSlug] = useState<string | null>(null);

  // URL-based pagination state
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, error } = useMeetings({ limit: PAGE_SIZE, offset });
  const meetings = data?.meetings ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const syncMutation = useSyncKrisp();
  const jobStatus = useJobStatus(syncJobId);

  // Coordinate sync job: when job completes, invalidate meetings + toast
  useEffect(() => {
    if (!jobStatus.data) return;
    if (jobStatus.data.status === "done") {
      setSyncJobId(null);
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Sync complete");
    } else if (jobStatus.data.status === "error") {
      setSyncJobId(null);
      toast.error("Sync failed");
    }
  }, [jobStatus.data?.status, queryClient]);

  const isSyncing =
    syncMutation.isPending || !!(syncJobId && jobStatus.data?.status === "running");

  // Set page via URL params (preserves other params)
  const setPage = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage === 1) {
        next.delete("page");
      } else {
        next.set("page", String(newPage));
      }
      return next;
    });
  };

  // Reset page when tab changes
  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("page");
      return next;
    });
  };

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        setSyncJobId(data.jobId);
      },
      onError: (err) => {
        toast.error(`Failed to start sync: ${err instanceof Error ? err.message : "Unknown error"}`);
      },
    });
  };

  const handleProcess = async (slug: string) => {
    setProcessingSlug(slug);
    try {
      const result = await processMeeting(slug);
      // Navigate to meeting detail to show processing stream
      navigate(`/meetings/${slug}?jobId=${result.jobId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("AI not configured")) {
        toast.error("AI not configured. Please add your Anthropic API key in Settings.");
      } else {
        toast.error(`Failed to start processing: ${message}`);
      }
      setProcessingSlug(null);
    }
  };

  const triageCount = meetings.filter(
    (m) => m.status === "synced" || m.status === "processed"
  ).length;
  const approvedCount = meetings.filter((m) => m.status === "approved").length;

  const tabFiltered = useMemo(() => {
    if (activeTab === "Triage")
      return meetings.filter((m) => m.status === "synced" || m.status === "processed");
    if (activeTab === "Approved")
      return meetings.filter((m) => m.status === "approved");
    return meetings;
  }, [activeTab, meetings]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tabFiltered;
    const q = search.toLowerCase();
    return tabFiltered.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.attendees.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [tabFiltered, search]);

  const sorted = useMemo(() => {
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "duration":
          cmp = a.duration - b.duration;
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDirection === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const tabs: { label: FilterTab; count?: number }[] = [
    { label: "All" },
    { label: "Triage", count: triageCount },
    { label: "Approved", count: approvedCount },
  ];

  const actionButton = (m: Meeting) => {
    if (m.status === "processed") {
      return (
        <Link to={`/meetings/${m.slug}`}>
          <Button
            variant="outline"
            size="sm"
            className="text-status-processed border-status-processed/30 hover:bg-status-processed/10"
          >
            Review Meeting <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      );
    }
    if (m.status === "synced") {
      const isProcessing = processingSlug === m.slug;
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleProcess(m.slug)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Process Meeting <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      );
    }
    return (
      <Link to={`/meetings/${m.slug}`}>
        <Button variant="ghost" size="sm">
          View Meeting <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Meetings"
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 w-60"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Cloud className="mr-1.5 h-4 w-4" />
                  Sync Krisp
                </>
              )}
            </Button>
            <Button size="sm" disabled title="Coming soon">
              <Plus className="mr-1.5 h-4 w-4" />
              New Meeting
            </Button>
          </div>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-1 border-b px-6 pt-2">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => handleTabChange(tab.label)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.label
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({tab.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Error state */}
        {error && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load meetings</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && !error && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">Title</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Attendees</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-6 py-3">
                    <Skeleton className="h-4 w-48" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex -space-x-2">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <Skeleton key={j} className="h-7 w-7 rounded-full" />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-5 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-8 w-28 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Data table */}
        {!isLoading && !error && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="px-6 py-3">
                    <button onClick={() => handleSort("title")} className="inline-flex items-center hover:text-foreground">
                      Title <SortIcon column="title" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button onClick={() => handleSort("date")} className="inline-flex items-center hover:text-foreground">
                      Date <SortIcon column="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3">Attendees</th>
                  <th className="px-4 py-3">
                    <button onClick={() => handleSort("status")} className="inline-flex items-center hover:text-foreground">
                      Status <SortIcon column="status" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button onClick={() => handleSort("duration")} className="inline-flex items-center hover:text-foreground">
                      Duration <SortIcon column="duration" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button onClick={() => handleSort("source")} className="inline-flex items-center hover:text-foreground">
                      Source <SortIcon column="source" />
                    </button>
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      {search ? "No meetings match your search." : "No meetings yet. Sync Krisp to import."}
                    </td>
                  </tr>
                )}
                {sorted.map((m) => (
                  <tr
                    key={m.slug}
                    onClick={() => navigate(`/meetings/${m.slug}`)}
                    className={`border-b transition-colors hover:bg-accent/50 cursor-pointer ${
                      m.status === "processed"
                        ? "border-l-2 border-l-status-processed bg-status-processed/5"
                        : m.status === "skipped"
                        ? "opacity-60"
                        : ""
                    }`}
                  >
                    <td className="px-6 py-3">
                      <span className="font-medium text-foreground">{m.title}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger className="cursor-default">
                          {m.date ? formatDistanceToNow(new Date(m.date), { addSuffix: true }) : "—"}
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {m.date ? format(new Date(m.date), "MMMM d, yyyy 'at' h:mm a") : "Unknown date"}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="px-4 py-3">
                      <AvatarStack attendees={m.attendees} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.duration > 0 ? `${m.duration} min` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.source || "—"}</td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actionButton(m)}
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
