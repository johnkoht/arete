import type { Meeting } from "@/api/types.js";
import { StatusBadge } from "@/components/StatusBadge";
import { ExternalLink, Trash2, Sparkles, RefreshCw, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MetadataPanelProps {
  meeting: Meeting;
  isSynced?: boolean;
  approved?: boolean;
  onProcessClick?: () => void;
  onReprocessClick?: () => void;
  onDeleteClick?: () => void;
  onDismissClick?: () => void;
  onRestoreClick?: () => void;
}

export function MetadataPanel({ meeting, isSynced, approved, onProcessClick, onReprocessClick, onDeleteClick, onDismissClick, onRestoreClick }: MetadataPanelProps) {
  return (
    <div className="rounded-md border bg-card p-5 shadow-sm space-y-5">
      <div>
        <StatusBadge status={meeting.status} size="md" />
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium">
            {meeting.date && !isNaN(new Date(meeting.date).getTime())
              ? new Date(meeting.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-medium">
            {meeting.duration > 0 ? `${meeting.duration} minutes` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Source</span>
          <span className="font-medium">{meeting.source}</span>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Attendees
        </h4>
        <div className="space-y-2">
          {meeting.attendees.map((a) => (
            <div key={a.initials} className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {a.initials}
              </div>
              <span className="text-sm">
                {a.name}
                {a.initials === "JK" && (
                  <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Area
        </h4>
        <AreaDisplay area={meeting.area} suggestedArea={meeting.suggestedArea} />
      </div>

      {meeting.recordingUrl ? (
        <a
          href={meeting.recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View recording
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          No recording available
        </span>
      )}

      <div className="space-y-2 pt-2 border-t">
        {isSynced && !approved && (
          <Button variant="default" size="sm" className="w-full justify-start" onClick={onProcessClick}>
            <Sparkles className="mr-2 h-4 w-4" />
            Process Meeting
          </Button>
        )}
        {approved && (
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={onReprocessClick}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reprocess Meeting
          </Button>
        )}
        {meeting.status === "skipped" && onRestoreClick && (
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={onRestoreClick}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore to Review
          </Button>
        )}
        {meeting.status !== "approved" && meeting.status !== "skipped" && onDismissClick && (
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onDismissClick}>
            <XCircle className="mr-2 h-4 w-4" />
            Dismiss Meeting
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={onDeleteClick}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Meeting
        </Button>
      </div>
    </div>
  );
}

// ── Area display helper ─────────────────────────────────────────────────────

function AreaDisplay({ area, suggestedArea }: { area?: string; suggestedArea?: string }) {
  const areaName = area ?? suggestedArea;
  const isSuggested = !area && !!suggestedArea;

  if (!areaName) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }

  // Format slug to display name: "product-strategy" → "product-strategy"
  // We show the slug as-is since that's what the backend provides
  const displayName = areaName;

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`text-sm truncate max-w-[180px] ${isSuggested ? "text-muted-foreground" : "font-medium"}`}
            >
              {displayName}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{displayName}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {isSuggested && (
        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          suggested
        </span>
      )}
    </div>
  );
}
