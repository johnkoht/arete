import { Meeting } from "@/data/meetings";
import { StatusBadge } from "@/components/StatusBadge";
import { ExternalLink, Trash2, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface MetadataPanelProps {
  meeting: Meeting;
  isSynced?: boolean;
  approved?: boolean;
  onProcessClick?: () => void;
  nextTriageMeeting?: Meeting;
  triageRemaining?: number;
}

export function MetadataPanel({ meeting, isSynced, approved, onProcessClick, nextTriageMeeting, triageRemaining }: MetadataPanelProps) {
  return (
    <div className="rounded-md border bg-card p-5 shadow-sm space-y-5">
      {/* Approved success state */}
      {approved && (
        <div className="rounded-md border border-status-approved/30 bg-status-approved/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-status-approved font-medium text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Meeting approved
          </div>
          {nextTriageMeeting && (
            <Link
              to={`/meetings/${nextTriageMeeting.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Next in Triage ({triageRemaining} remaining)
            </Link>
          )}
        </div>
      )}

      {!approved && (
        <div>
          <StatusBadge status={meeting.status} size="md" />
        </div>
      )}

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium">
            {new Date(meeting.date).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-medium">{meeting.duration} minutes</span>
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

      <a
        href="#"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        View recording
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <div className="space-y-2 pt-2 border-t">
        {isSynced && !approved && (
          <Button variant="default" size="sm" className="w-full justify-start" onClick={onProcessClick}>
            <Sparkles className="mr-2 h-4 w-4" />
            Process Meeting
          </Button>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Meeting
        </Button>
      </div>
    </div>
  );
}
