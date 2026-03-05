import type { MeetingStatus } from "@/api/types.js";

interface StatusBadgeProps {
  status: MeetingStatus;
  size?: "sm" | "md";
}

const config: Record<MeetingStatus, { dot: string; text: string; border: string; bg: string }> = {
  Synced: { dot: "bg-muted-foreground", text: "text-muted-foreground", border: "border-muted-foreground/20", bg: "bg-muted-foreground/10" },
  Processed: { dot: "bg-status-processed", text: "text-status-processed", border: "border-status-processed/20", bg: "bg-status-processed/10" },
  Approved: { dot: "bg-status-approved", text: "text-status-approved", border: "border-status-approved/20", bg: "bg-status-approved/10" },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium border ${c.bg} ${c.text} ${c.border} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}
