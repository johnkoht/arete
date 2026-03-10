import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Clock,
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  Brain,
  TrendingUp,
  ArrowRight,
  Calendar,
  Zap,
  Activity,
} from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import {
  useCalendarToday,
  useCommitmentsSummary,
  useProjects,
  useRecentMemory,
} from "@/hooks/dashboard.js";
import { useMeetings } from "@/hooks/meetings.js";
import { useSignalPatterns, useActivity } from "@/hooks/intelligence.js";
import type { MemoryItem, ActivityItem } from "@/api/types.js";

// ── Today's Meetings ─────────────────────────────────────────────────────────

function TodaysMeetings() {
  const { data, isLoading } = useCalendarToday();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <EmptyState
        icon={Calendar}
        title="Calendar not connected"
        description="Connect your calendar with `arete pull calendar` to see today's meetings here."
        className="py-8"
      />
    );
  }

  if (!data.events.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No meetings today"
        description="A clear day to think deeply."
        className="py-8"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.events.map((event, idx) => {
        const startTime = event.start
          ? format(parseISO(event.start), "h:mm a")
          : "—";
        const endTime = event.end
          ? format(parseISO(event.end), "h:mm a")
          : "";

        return (
          <div
            key={event.id ?? idx}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {startTime}{endTime ? ` – ${endTime}` : ""}
                {event.attendees?.length > 0 && (
                  <span className="ml-2">· {event.attendees.length} attendees</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent Meetings ───────────────────────────────────────────────────────────

function RecentMeetings() {
  const { data, isLoading, error } = useMeetings();
  const meetings = data?.meetings ?? [];

  const recent = [...meetings]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load meetings.</p>
    );
  }

  if (recent.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No meetings yet"
        description="Sync Krisp to import your meetings."
        className="py-6"
      />
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {recent.map((m) => (
        <Link
          key={m.slug}
          to={`/meetings/${m.slug}`}
          className="flex items-center justify-between py-2.5 text-sm hover:opacity-80 transition-opacity"
        >
          <div className="min-w-0 flex-1">
            <span className="truncate font-medium">{m.title}</span>
          </div>
          <div className="ml-4 flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {m.date
                ? formatDistanceToNow(new Date(m.date), { addSuffix: true })
                : "—"}
            </span>
            <StatusBadge status={m.status} size="sm" />
          </div>
        </Link>
      ))}
      {meetings.length > 5 && (
        <Link
          to="/meetings"
          className="flex items-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all {meetings.length} meetings <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ── Commitment Pulse ──────────────────────────────────────────────────────────

type PulseCardProps = {
  label: string;
  count: number | undefined;
  color: "green" | "yellow" | "red";
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  onClick?: () => void;
};

function PulseCard({ label, count, color, icon: Icon, loading, onClick }: PulseCardProps) {
  const colorMap = {
    green: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    yellow: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    red: "text-red-600 bg-red-50 dark:bg-red-950/30",
  };

  return (
    <Card
      className={`flex-1 ${onClick ? "cursor-pointer hover:border-primary/40 transition-colors" : ""}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">{count ?? 0}</p>
          )}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CommitmentPulse() {
  const { data, isLoading } = useCommitmentsSummary();
  const navigate = useNavigate();

  return (
    <div className="flex gap-3">
      <PulseCard
        label="Open"
        count={data?.open}
        color="green"
        icon={CheckCircle2}
        loading={isLoading}
      />
      <PulseCard
        label="Due This Week"
        count={data?.dueThisWeek}
        color="yellow"
        icon={Clock}
        loading={isLoading}
        onClick={() => navigate("/commitments?filter=thisweek")}
      />
      <PulseCard
        label="Overdue"
        count={data?.overdue}
        color="red"
        icon={AlertCircle}
        loading={isLoading}
        onClick={() => navigate("/commitments?filter=overdue")}
      />
    </div>
  );
}

// ── Active Projects ───────────────────────────────────────────────────────────

function ActiveProjects() {
  const { data, isLoading } = useProjects();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const projects = data?.projects ?? [];

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No active projects"
        description="Projects in projects/active/ will appear here."
        className="py-6"
      />
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {projects.map((p) => (
        <div key={p.slug} className="flex items-center justify-between py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.name}</p>
            {p.description && (
              <p className="truncate text-xs text-muted-foreground">{p.description}</p>
            )}
          </div>
          <div className="ml-4 flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(p.lastModified), { addSuffix: true })}
            </span>
            <Badge variant="secondary" className="text-xs">{p.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Recent Memory ─────────────────────────────────────────────────────────────

function MemoryTypeBadge({ type }: { type: MemoryItem["type"] }) {
  return type === "decision" ? (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 ring-1 ring-inset ring-blue-200 dark:ring-blue-800">
      Decision
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 ring-1 ring-inset ring-purple-200 dark:ring-purple-800">
      Learning
    </span>
  );
}

function RecentMemory() {
  const { data, isLoading } = useRecentMemory(5);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="No memory items yet"
        description="Process meetings to start building institutional memory."
        className="py-6"
      />
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3 py-2.5">
          <div className="mt-0.5 flex-shrink-0">
            <MemoryTypeBadge type={item.type} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug line-clamp-2">{item.title}</p>
          </div>
          <span className="ml-2 flex-shrink-0 text-xs text-muted-foreground">
            {item.date
              ? formatDistanceToNow(new Date(item.date), { addSuffix: true })
              : "—"}
          </span>
        </div>
      ))}
      <Link
        to="/memory"
        className="flex items-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        View all memory <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ── Signal Patterns ───────────────────────────────────────────────────────────

function SignalPatternsPreview() {
  const { data: patterns, isLoading } = useSignalPatterns(30);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const top3 = patterns.slice(0, 3);

  if (top3.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title="No signal patterns detected yet"
        description="Patterns emerge as meetings are processed."
        className="py-6"
      />
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {top3.map((pattern) => (
        <div key={pattern.topic} className="flex items-center justify-between py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{pattern.topic}</p>
            <p className="text-xs text-muted-foreground">
              {pattern.mentions} mentions across {pattern.people.length} people
            </p>
          </div>
          <span className="ml-4 flex-shrink-0 text-xs text-muted-foreground">
            {pattern.lastSeen
              ? formatDistanceToNow(new Date(pattern.lastSeen), { addSuffix: true })
              : "—"}
          </span>
        </div>
      ))}
      <Link
        to="/intelligence"
        className="flex items-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        View all patterns <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function ActivityIcon({ type }: { type: string }) {
  if (type === 'meeting:processed') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex-shrink-0">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted flex-shrink-0">
      <Activity className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function RecentActivity() {
  const { data: events, isLoading } = useActivity(5);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No recent activity"
        description="Activity appears as meetings are processed with `arete view` running."
        className="py-6"
      />
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {events.map((event: ActivityItem) => (
        <div key={event.id} className="flex items-center gap-3 py-2.5">
          <ActivityIcon type={event.type} />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug truncate">{event.title}</p>
            {event.detail && event.detail !== event.title && (
              <p className="text-xs text-muted-foreground truncate">{event.detail}</p>
            )}
          </div>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        description="Your product intelligence overview"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Commitment Pulse — full width */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <TrendingUp className="h-3.5 w-3.5" />
              Commitment Pulse
            </h2>
            <CommitmentPulse />
          </section>

          {/* Two column: Today's Meetings + Active Projects */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <CalendarDays className="h-3.5 w-3.5" />
                Today's Meetings
              </h2>
              <Card>
                <CardContent className="p-4">
                  <TodaysMeetings />
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <FolderKanban className="h-3.5 w-3.5" />
                Active Projects
              </h2>
              <Card>
                <CardContent className="p-4">
                  <ActiveProjects />
                </CardContent>
              </Card>
            </section>
          </div>

          {/* Two column: Recent Meetings + Recent Memory */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" />
                Recent Meetings
              </h2>
              <Card>
                <CardContent className="p-4">
                  <RecentMeetings />
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <Brain className="h-3.5 w-3.5" />
                Recent Memory
              </h2>
              <Card>
                <CardContent className="p-4">
                  <RecentMemory />
                </CardContent>
              </Card>
            </section>
          </div>

          {/* Signal Patterns — full width */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Zap className="h-3.5 w-3.5" />
              Signal Patterns
            </h2>
            <Card>
              <CardContent className="p-4">
                <SignalPatternsPreview />
              </CardContent>
            </Card>
          </section>

          {/* Recent Activity — full width */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Activity className="h-3.5 w-3.5" />
              Recent Activity
            </h2>
            <Card>
              <CardContent className="p-4">
                <RecentActivity />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
