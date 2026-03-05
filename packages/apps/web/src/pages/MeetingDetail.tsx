import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Pencil, Info, Copy, CheckCircle2, ArrowRight } from "lucide-react";
import { getMeetingBySlug, ReviewItem, MEETINGS } from "@/data/meetings";
import { MetadataPanel } from "@/components/MetadataPanel";
import { ReviewItemsSection, ApprovedItemsSection } from "@/components/ReviewItems";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function MeetingDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const meeting = getMeetingBySlug(slug || "");

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(meeting?.reviewItems || []);
  const [summary, setSummary] = useState(meeting?.summary || "");
  const [editingSummary, setEditingSummary] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);

  if (!meeting) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Meeting not found.</p>
      </div>
    );
  }

  const isProcessed = meeting.status === "Processed";
  const isSynced = meeting.status === "Synced";
  const isApprovedStatus = meeting.status === "Approved";
  const isApproved = isApprovedStatus || approved;

  const triageMeetings = MEETINGS.filter(
    (m) => (m.status === "Synced" || m.status === "Processed") && m.slug !== slug
  );
  const nextTriageMeeting = triageMeetings[0];
  const triageRemaining = triageMeetings.length;

  const filePath = `resources/meetings/${meeting.slug}.md`;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveApprove = () => {
    setApproved(true);
  };

  const reviewed = reviewItems.filter((i) => i.status !== "pending").length;

  // Header badge
  const headerBadge = approved ? (
    <StatusBadge status="Approved" size="sm" />
  ) : isProcessed ? (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-status-processed/10 text-status-processed">
      Needs Review
    </span>
  ) : isSynced ? (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      Needs Processing
    </span>
  ) : (
    <StatusBadge status="Approved" size="sm" />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Meetings
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <h1 className="text-lg font-semibold">{meeting.title}</h1>
            {headerBadge}
          </div>
          {isProcessed && !approved && (
            <Button
              size="sm"
              onClick={handleSaveApprove}
              disabled={reviewed === 0}
            >
              Save & Approve <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Two column layout */}
      <div className="flex-1 overflow-auto">
        <div className="flex gap-6 p-6">
          {/* Left column */}
          <div className="flex-1 min-w-0 space-y-6" style={{ maxWidth: "65%" }}>
            {/* Synced state banner */}
            {isSynced && !approved && (
              <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-4">
                <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Ready to process</p>
                  <p className="mt-1 text-muted-foreground">
                    Once processed by your AI assistant, you'll review and approve extracted
                    decisions, learnings, and action items here.
                  </p>
                </div>
              </div>
            )}

            {/* Approved success state */}
            {approved && (
              <div className="rounded-md border border-status-approved/30 bg-status-approved/10 p-4">
                <div className="flex items-center gap-2 text-status-approved font-medium text-sm">
                  <CheckCircle2 className="h-5 w-5" />
                  Meeting approved
                </div>
                {nextTriageMeeting && (
                  <Link
                    to={`/meetings/${nextTriageMeeting.slug}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Next in Triage ({triageRemaining} remaining)
                  </Link>
                )}
              </div>
            )}

            {/* Processed: Summary first, then Review Items */}
            {isProcessed && !approved && (
              <>
                {/* Summary */}
                <SummarySection
                  summary={summary}
                  setSummary={setSummary}
                  editingSummary={editingSummary}
                  setEditingSummary={setEditingSummary}
                  summaryOpen={summaryOpen}
                  setSummaryOpen={setSummaryOpen}
                  readOnly={false}
                />

                {/* Review Items */}
                <ReviewItemsSection
                  items={reviewItems}
                  onItemsChange={setReviewItems}
                  onSaveApprove={handleSaveApprove}
                />
              </>
            )}

            {/* Approved: Summary first, then items */}
            {(isApproved || approved) && !isProcessed && (
              <>
                <SummarySection
                  summary={summary}
                  setSummary={setSummary}
                  editingSummary={editingSummary}
                  setEditingSummary={setEditingSummary}
                  summaryOpen={summaryOpen}
                  setSummaryOpen={setSummaryOpen}
                  readOnly={true}
                />
                {meeting.reviewItems && <ApprovedItemsSection items={meeting.reviewItems} />}
              </>
            )}
            {approved && isProcessed && (
              <>
                <SummarySection
                  summary={summary}
                  setSummary={setSummary}
                  editingSummary={editingSummary}
                  setEditingSummary={setEditingSummary}
                  summaryOpen={summaryOpen}
                  setSummaryOpen={setSummaryOpen}
                  readOnly={true}
                />
                <ApprovedItemsSection items={reviewItems} />
              </>
            )}

            {/* Synced raw content */}
            {isSynced && meeting.keyPoints && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Key Points</h3>
                <ul className="space-y-1 text-sm list-disc list-inside text-muted-foreground">
                  {meeting.keyPoints.map((kp, i) => (
                    <li key={i}>{kp}</li>
                  ))}
                </ul>
              </div>
            )}

            {isSynced && meeting.rawActionItems && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Action Items</h3>
                <div className="space-y-1.5">
                  {meeting.rawActionItems.map((ai, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="rounded border-border" />
                      {ai}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Summary for synced state only (approved handled above) */}
            {isSynced && !approved && (
              <SummarySection
                summary={summary}
                setSummary={setSummary}
                editingSummary={editingSummary}
                setEditingSummary={setEditingSummary}
                summaryOpen={summaryOpen}
                setSummaryOpen={setSummaryOpen}
                readOnly={false}
              />
            )}

            {/* Transcript */}
            {meeting.transcript && (
              <div>
                <button
                  onClick={() => setTranscriptOpen(!transcriptOpen)}
                  className="mb-2 flex w-full items-center gap-2 text-sm font-medium"
                >
                  Transcript
                  <ChevronDown
                    className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${
                      transcriptOpen ? "" : "-rotate-90"
                    }`}
                  />
                </button>
                {transcriptOpen && (
                  <div className="rounded-md border bg-muted/30 p-4 text-sm leading-7 font-mono whitespace-pre-wrap">
                    {meeting.transcript.split("\n").map((line, i) => {
                      const boldMatch = line.match(/^\*\*(.+?)\*\*(.*)$/);
                      if (boldMatch) {
                        return (
                          <div key={i}>
                            <span className="font-semibold not-italic font-sans">{boldMatch[1]}</span>
                            <span className="text-muted-foreground">{boldMatch[2]}</span>
                          </div>
                        );
                      }
                      return <div key={i}>{line || "\u00A0"}</div>;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="w-[35%] flex-shrink-0">
            <MetadataPanel
              meeting={meeting}
              isSynced={isSynced}
              approved={approved}
              onProcessClick={() => setProcessDialogOpen(true)}
              nextTriageMeeting={nextTriageMeeting}
              triageRemaining={triageRemaining}
            />
          </div>
        </div>
      </div>

      {/* Process Meeting Dialog */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Process this meeting</DialogTitle>
            <DialogDescription>
              Open your AI assistant and ask it to process this meeting. The meeting file is ready at:
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 font-mono text-sm">
            {filePath}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={handleCopyPath}>
              {copied ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4 text-status-approved" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy file path
                </>
              )}
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Got it</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Extracted summary section component
function SummarySection({
  summary,
  setSummary,
  editingSummary,
  setEditingSummary,
  summaryOpen,
  setSummaryOpen,
  readOnly,
}: {
  summary: string;
  setSummary: (s: string) => void;
  editingSummary: boolean;
  setEditingSummary: (b: boolean) => void;
  summaryOpen: boolean;
  setSummaryOpen: (b: boolean) => void;
  readOnly: boolean;
}) {
  return (
    <div>
      <button
        onClick={() => setSummaryOpen(!summaryOpen)}
        className="mb-2 flex w-full items-center gap-2 text-sm font-medium"
      >
        Summary
        {!readOnly && (
          <Pencil
            className="h-3.5 w-3.5 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setEditingSummary(true);
              setSummaryOpen(true);
            }}
          />
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${
            summaryOpen ? "" : "-rotate-90"
          }`}
        />
      </button>
      {summaryOpen && (
        <>
          {editingSummary && !readOnly ? (
            <textarea
              className="w-full rounded-md border bg-background p-3 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() => setEditingSummary(false)}
              autoFocus
            />
          ) : (
            <p
              className="text-sm leading-relaxed text-muted-foreground cursor-text"
              onClick={() => !readOnly && setEditingSummary(true)}
            >
              {summary}
            </p>
          )}
        </>
      )}
    </div>
  );
}
