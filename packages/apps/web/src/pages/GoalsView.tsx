import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Target,
  Calendar,
  CheckSquare,
  CheckCircle2,
  Circle,
  BookOpen,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useStrategy, useQuarterGoals, useWeekGoals, useToggleWeekPriority } from "@/hooks/goals.js";
import { useCommitmentsSummary } from "@/hooks/dashboard.js";
import type { QuarterOutcome, WeekPriority } from "@/api/types.js";

// ── Strategy section ──────────────────────────────────────────────────────────

/**
 * Strip markdown syntax for a plain-text preview.
 * Removes ## headings, **bold**, *italic*, - list bullets, extra whitespace.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")   // headings
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1")    // italic
    .replace(/^[-*]\s+/gm, "")      // list bullets
    .replace(/\n{2,}/g, " ")        // collapse blank lines
    .replace(/\s+/g, " ")           // collapse whitespace
    .trim();
}

function StrategySection() {
  const { data, isLoading } = useStrategy();
  // Collapsed by default — shows preview; true = expanded (full content)
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 mt-2" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.found) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            icon={BookOpen}
            title="No strategy file found"
            description="Add goals/strategy.md to your workspace."
            className="py-4"
          />
        </CardContent>
      </Card>
    );
  }

  const PREVIEW_CHARS = 200;
  const plainText = stripMarkdown(data.content);
  const previewText =
    plainText.length > PREVIEW_CHARS
      ? plainText.slice(0, PREVIEW_CHARS) + "…"
      : plainText;
  const hasMore = plainText.length > PREVIEW_CHARS;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between text-left"
        >
          <CardTitle className="text-base">Strategy</CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              expanded ? "" : "-rotate-90"
            }`}
          />
        </button>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        {expanded ? (
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans leading-relaxed">
            {data.content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {previewText}
            {hasMore && (
              <button
                onClick={() => setExpanded(true)}
                className="ml-1 text-xs text-primary hover:underline"
              >
                Show more
              </button>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Quarter goals ─────────────────────────────────────────────────────────────

function OutcomeCard({ outcome }: { outcome: QuarterOutcome }) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="font-medium text-sm leading-snug">{outcome.title}</p>
          </div>
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {outcome.id}
          </Badge>
        </div>

        {outcome.successCriteria && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Success criteria</p>
            <p className="text-xs text-foreground">{outcome.successCriteria}</p>
          </div>
        )}

        {outcome.orgAlignment && (
          <p className="text-xs text-muted-foreground">{outcome.orgAlignment}</p>
        )}
      </CardContent>
    </Card>
  );
}

function QuarterGoalsSection() {
  const { data, isLoading } = useQuarterGoals();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data?.found || data.outcomes.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No quarter goals found"
        description="Add goals/quarter.md with ## Outcome N: sections."
        className="py-6"
      />
    );
  }

  return (
    <div>
      {data.quarter && (
        <p className="mb-3 text-xs text-muted-foreground">Quarter: {data.quarter}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.outcomes.map((o) => (
          <OutcomeCard key={o.id} outcome={o} />
        ))}
      </div>
    </div>
  );
}

// ── Weekly priorities ─────────────────────────────────────────────────────────

function PriorityItem({
  priority,
  onToggle,
  isPending,
}: {
  priority: WeekPriority;
  onToggle: (priority: WeekPriority, done: boolean) => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex-shrink-0 mt-0.5">
        <Checkbox
          checked={priority.done}
          disabled={isPending}
          onCheckedChange={(checked) => onToggle(priority, !!checked)}
          aria-label={`Mark "${priority.title}" as ${priority.done ? "not done" : "done"}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${priority.done ? "line-through text-muted-foreground" : ""}`}>
          {priority.title}
        </p>
        {priority.successCriteria && (
          <p className="text-xs text-muted-foreground mt-0.5">{priority.successCriteria}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {priority.advancesGoal && (
            <span className="text-xs text-primary/80">→ {priority.advancesGoal}</span>
          )}
          {priority.effort && (
            <Badge variant="secondary" className="text-xs h-4 px-1.5">{priority.effort}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function WeekPrioritiesSection() {
  const { data, isLoading } = useWeekGoals();
  const { mutate: togglePriority, isPending } = useToggleWeekPriority();

  function handleToggle(priority: WeekPriority, newDone: boolean) {
    togglePriority({ index: priority.index, done: newDone });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!data?.found) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="No week file found"
        description="Add now/week.md to your workspace."
        className="py-6"
      />
    );
  }

  return (
    <div>
      {data.weekOf && (
        <p className="mb-3 text-xs text-muted-foreground">Week of {data.weekOf}</p>
      )}

      {data.priorities.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No priorities this week"
          description="Add ### N. Title sections to now/week.md."
          className="py-4"
        />
      ) : (
        <div className="divide-y">
          {data.priorities.map((p) => (
            <PriorityItem key={p.index} priority={p} onToggle={handleToggle} isPending={isPending} />
          ))}
        </div>
      )}

      {data.commitments.length > 0 && (
        <div className="mt-4">
          <Separator className="mb-3" />
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Commitments due this week
          </p>
          <ul className="space-y-1.5">
            {data.commitments.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {c.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <span className={c.done ? "line-through text-muted-foreground" : ""}>
                  {c.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Open commitments by person ────────────────────────────────────────────────

function OpenCommitmentsSection() {
  const { data, isLoading } = useCommitmentsSummary();

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!data || data.open === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No open commitments"
        description="All caught up!"
        className="py-4"
      />
    );
  }

  return (
    <div className="flex gap-6">
      <div className="text-center">
        <p className="text-3xl font-bold tabular-nums">{data.open}</p>
        <p className="text-xs text-muted-foreground">Open</p>
      </div>
      {data.dueThisWeek > 0 && (
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-amber-600">{data.dueThisWeek}</p>
          <p className="text-xs text-muted-foreground">Due This Week</p>
        </div>
      )}
      {data.overdue > 0 && (
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-red-600">{data.overdue}</p>
          <p className="text-xs text-muted-foreground">Overdue</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoalsView() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Goals Alignment"
        description="Strategy → Quarter → Week → Commitments"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Strategy */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <BookOpen className="h-3.5 w-3.5" />
              Strategy
            </h2>
            <StrategySection />
          </section>

          {/* Quarter goals */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Target className="h-3.5 w-3.5" />
              Quarter Goals
            </h2>
            <QuarterGoalsSection />
          </section>

          {/* Two column: Weekly priorities + commitments */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <section className="lg:col-span-3">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <CheckSquare className="h-3.5 w-3.5" />
                This Week's Priorities
              </h2>
              <Card>
                <CardContent className="p-4">
                  <WeekPrioritiesSection />
                </CardContent>
              </Card>
            </section>

            <section className="lg:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <Calendar className="h-3.5 w-3.5" />
                Commitments
              </h2>
              <Card>
                <CardContent className="p-4">
                  <OpenCommitmentsSection />
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
