/**
 * Shared badge/indicator components for the People Intelligence feature.
 * Extracted from PeopleIndex so PersonDetailPage can reuse them.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PersonSummary, PersonCategory } from "@/api/types.js";

// ── Health indicator ──────────────────────────────────────────────────────────

export function HealthDot({ score }: { score: number | null }) {
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

// ── Trend icon ────────────────────────────────────────────────────────────────

export function TrendIcon({ trend }: { trend: PersonSummary["trend"] }) {
  if (!trend) return <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />;
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

// ── Category badge ────────────────────────────────────────────────────────────

export function CategoryBadge({ category }: { category: PersonCategory }) {
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
