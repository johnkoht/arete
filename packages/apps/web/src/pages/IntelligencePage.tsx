import { useState } from "react";
import { Zap, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useSignalPatterns } from "@/hooks/intelligence.js";
import type { SignalPattern } from "@/api/types.js";

// ── Day filter ────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
] as const;

// ── Pattern card ──────────────────────────────────────────────────────────────

function PatternCard({ pattern }: { pattern: SignalPattern }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-snug">{pattern.topic}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pattern.mentions} mention{pattern.mentions !== 1 ? "s" : ""} across{" "}
              {pattern.people.length} {pattern.people.length !== 1 ? "people" : "person"}
            </p>
          </div>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {pattern.lastSeen
              ? formatDistanceToNow(new Date(pattern.lastSeen), { addSuffix: true })
              : "—"}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {pattern.people.map((slug) => (
            <Badge key={slug} variant="secondary" className="text-xs font-normal">
              <Users className="mr-1 h-3 w-3" />
              {slug}
            </Badge>
          ))}
        </div>

        {pattern.meetings.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {pattern.meetings.map((slug) => (
              <span
                key={slug}
                className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs bg-muted text-muted-foreground"
              >
                {slug}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const { data: patterns, isLoading } = useSignalPatterns(days);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Signal Intelligence"
        description={`Topics emerging across your network in the last ${days} days`}
        action={
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {DAY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={days === opt.value ? "default" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setDays(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : patterns.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No signal patterns detected yet"
              description="Patterns emerge as meetings are processed. Add meetings with multiple attendees to start detecting cross-person topics."
              className="py-16"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {patterns.map((pattern) => (
                <PatternCard key={pattern.topic} pattern={pattern} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
