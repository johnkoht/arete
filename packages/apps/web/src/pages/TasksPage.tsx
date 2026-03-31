/**
 * TasksPage - Main tasks view with tab navigation.
 *
 * Features:
 * - Four tabs: Today, Upcoming, Anytime, Someday
 * - Today tab uses TodayView with tasks + AI suggestions
 * - Tab state synced to URL param ?tab=
 * - Waiting On filter toggle synced to URL param ?waitingOn=true
 * - Empty states per tab with role='status' for accessibility
 * - Loading skeleton and error state with retry
 */

import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { TaskList } from "@/components/TaskList.js";
import { TodayView } from "@/components/TodayView.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { useTasks } from "@/hooks/tasks.js";
import type { TasksFilter } from "@/api/types.js";

// ── Constants ────────────────────────────────────────────────────────────────

const TAB_VALUES = ["today", "upcoming", "anytime", "someday"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const TAB_LABELS: Record<TabValue, string> = {
  today: "Today",
  upcoming: "Upcoming",
  anytime: "Anytime",
  someday: "Someday",
};

const EMPTY_MESSAGES: Record<TabValue, string> = {
  today: "No tasks due today",
  upcoming: "No upcoming tasks scheduled",
  anytime: "No tasks in Anytime",
  someday: "No tasks in Someday",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidTab(value: string | null): value is TabValue {
  return value !== null && TAB_VALUES.includes(value as TabValue);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL params
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : "today";
  const waitingOn = searchParams.get("waitingOn") === "true";

  // Fetch tasks with current filter (for non-Today tabs)
  // Today tab uses TodayView which has its own data fetching
  const filter: TasksFilter = activeTab === "today" ? "upcoming" : activeTab;
  const { data, isLoading, error, refetch } = useTasks(filter, { waitingOn });

  // Tab change handler
  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "today") {
        next.delete("tab");
      } else {
        next.set("tab", value);
      }
      return next;
    });
  };

  // Waiting On toggle handler
  const handleWaitingOnChange = (checked: boolean) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (checked) {
        next.set("waitingOn", "true");
      } else {
        next.delete("waitingOn");
      }
      return next;
    });
  };

  const tasks = data?.tasks ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Tasks" />

      <div className="flex-1 overflow-auto px-6 py-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* Tab list with Waiting On toggle */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <TabsList>
              {TAB_VALUES.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Waiting On toggle (hidden on Today tab since it has its own view) */}
            {activeTab !== "today" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="waiting-on-toggle"
                  checked={waitingOn}
                  onCheckedChange={handleWaitingOnChange}
                  aria-label="Waiting On"
                />
                <label
                  htmlFor="waiting-on-toggle"
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  Waiting On
                </label>
              </div>
            )}
          </div>

          {/* Today tab content - uses TodayView with suggestions */}
          <TabsContent value="today">
            <TodayView />
          </TabsContent>

          {/* Other tab content panels */}
          {TAB_VALUES.filter((tab) => tab !== "today").map((tab) => (
            <TabsContent key={tab} value={tab}>
              {/* Loading state */}
              {isLoading && <LoadingSkeleton />}

              {/* Error state */}
              {error && !isLoading && (
                <div className="py-8 text-center">
                  <p className="text-sm text-destructive font-medium">
                    Failed to load tasks
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {error instanceof Error ? error.message : "Unknown error"}
                  </p>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                    >
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !error && tasks.length === 0 && (
                <div
                  role="status"
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {EMPTY_MESSAGES[tab]}
                </div>
              )}

              {/* Task list */}
              {!isLoading && !error && tasks.length > 0 && (
                <TaskList tasks={tasks} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border rounded-md">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
