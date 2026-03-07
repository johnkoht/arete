import type { MeetingStatus } from "@/api/types.js";

interface StatusBadgeProps {
  status: MeetingStatus | string;
  size?: "sm" | "md";
}

const config: Record<string, { dot: string; text: string; border: string; bg: string }> = {
  synced: { dot: "bg-muted-foreground", text: "text-muted-foreground", border: "border-muted-foreground/20", bg: "bg-muted-foreground/10" },
  processed: { dot: "bg-status-processed", text: "text-status-processed", border: "border-status-processed/20", bg: "bg-status-processed/10" },
  approved: { dot: "bg-status-approved", text: "text-status-approved", border: "border-status-approved/20", bg: "bg-status-approved/10" },
};

const defaultConfig = { dot: "bg-muted-foreground", text: "text-muted-foreground", border: "border-muted-foreground/20", bg: "bg-muted-foreground/10" };

/** Capitalize first letter for display */
function displayStatus(status: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const normalizedStatus = (status ?? "").toLowerCase();
  const c = config[normalizedStatus] ?? defaultConfig;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium border ${c.bg} ${c.text} ${c.border} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {displayStatus(status)}
    </span>
  );
}
