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

/**
 * Category badge styled to match StatusBadge pattern (dot + styled container).
 * Uses consistent color tokens for internal/customer/user categories.
 */
const categoryConfig: Record<PersonCategory, { dot: string; text: string; border: string; bg: string }> = {
  internal: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  customer: {
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  user: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-800",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
};

export function CategoryBadge({ category, size = "sm" }: { category: PersonCategory; size?: "sm" | "md" }) {
  const c = categoryConfig[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium border ${c.bg} ${c.text} ${c.border} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      <span className="capitalize">{category}</span>
    </span>
  );
}
