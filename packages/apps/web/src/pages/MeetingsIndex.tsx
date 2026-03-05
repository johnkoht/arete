import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cloud, Loader2, Check, Search, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEETINGS, MeetingStatus } from "@/data/meetings";
import { StatusBadge } from "@/components/StatusBadge";
import { AvatarStack } from "@/components/AvatarStack";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow, format } from "date-fns";

type SyncState = "idle" | "syncing" | "synced";
type FilterTab = "All" | "Triage" | "Approved";

export default function MeetingsIndex() {
  const navigate = useNavigate();
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [search, setSearch] = useState("");

  const handleSync = () => {
    setSyncState("syncing");
    setTimeout(() => {
      setSyncState("synced");
      setTimeout(() => setSyncState("idle"), 3000);
    }, 2000);
  };

  const triageCount = MEETINGS.filter(
    (m) => m.status === "Synced" || m.status === "Processed"
  ).length;
  const approvedCount = MEETINGS.filter((m) => m.status === "Approved").length;

  const tabFiltered = useMemo(() => {
    if (activeTab === "Triage")
      return MEETINGS.filter((m) => m.status === "Synced" || m.status === "Processed");
    if (activeTab === "Approved")
      return MEETINGS.filter((m) => m.status === "Approved");
    return MEETINGS;
  }, [activeTab]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tabFiltered;
    const q = search.toLowerCase();
    return tabFiltered.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.attendees.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [tabFiltered, search]);

  const tabs: { label: FilterTab; count?: number }[] = [
    { label: "All" },
    { label: "Triage", count: triageCount },
    { label: "Approved", count: approvedCount },
  ];

  const actionButton = (m: typeof MEETINGS[0]) => {
    if (m.status === "Processed") {
      return (
        <Link to={`/meetings/${m.slug}`}>
          <Button variant="outline" size="sm" className="text-status-processed border-status-processed/30 hover:bg-status-processed/10">
            Review Meeting <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      );
    }
    if (m.status === "Synced") {
      return (
        <Link to={`/meetings/${m.slug}`}>
          <Button variant="outline" size="sm">
            Process Meeting <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
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
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Meetings</h1>
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
            disabled={syncState === "syncing"}
            className={syncState === "synced" ? "text-status-approved border-status-approved/30" : ""}
          >
            {syncState === "idle" && (
              <>
                <Cloud className="mr-1.5 h-4 w-4" />
                Sync Krisp
              </>
            )}
            {syncState === "syncing" && (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Syncing...
              </>
            )}
            {syncState === "synced" && (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Synced 3 meetings
              </>
            )}
          </Button>
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New Meeting
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b px-6 pt-2">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(tab.label)}
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
            {filtered.map((m) => (
              <tr
                key={m.slug}
                onClick={() => navigate(`/meetings/${m.slug}`)}
                className={`border-b transition-colors hover:bg-accent/50 cursor-pointer ${
                  m.status === "Processed" ? "border-l-2 border-l-status-processed bg-status-processed/5" : ""
                }`}
              >
                <td className="px-6 py-3">
                  <span className="font-medium text-foreground">
                    {m.title}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger className="cursor-default">
                      {formatDistanceToNow(new Date(m.date), { addSuffix: true })}
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {format(new Date(m.date), "MMMM d, yyyy 'at' h:mm a")}
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-4 py-3">
                  <AvatarStack attendees={m.attendees} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={m.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.duration} min</td>
                <td className="px-4 py-3 text-muted-foreground">{m.source}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {actionButton(m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
