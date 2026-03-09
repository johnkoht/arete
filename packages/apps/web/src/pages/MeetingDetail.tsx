import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Pencil,
  Info,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { MetadataPanel } from "@/components/MetadataPanel";
import { ReviewItemsSection, ApprovedItemsSection } from "@/components/ReviewItems";
import { ParsedItemsSection } from "@/components/ParsedItemsSection";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMeeting,
  useMeetings,
  useApproveItem,
  useSaveApprove,
  useProcessMeeting,
  useDeleteMeeting,
} from "@/hooks/meetings.js";
import type { ReviewItem, ApprovedItems } from "@/api/types.js";
import { BASE_URL } from "@/api/client.js";

export default function MeetingDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const safeSlug = slug ?? "";

  const { data: meeting, isLoading, error } = useMeeting(safeSlug);
  const { data: allMeetings = [] } = useMeetings();

  const approveItemMutation = useApproveItem(safeSlug);
  const saveApproveMutation = useSaveApprove(safeSlug);
  const processMutation = useProcessMeeting(safeSlug);
  const deleteMutation = useDeleteMeeting();

  // Local review items state — kept in sync with query data, plus optimistic updates
  // Items default to "approved" in local state — user skips bad items (frontend-only; backend still returns pending)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const prevReviewItemsRef = useRef<ReviewItem[]>([]);

  // Sync local state when query data changes (e.g. after approval)
  // Transform pending → approved on initialization (smart default: approve all, user skips bad ones)
  useEffect(() => {
    if (meeting?.reviewItems) {
      const transformedItems = meeting.reviewItems.map((item) =>
        item.status === "pending" ? { ...item, status: "approved" as const } : item
      );
      setReviewItems(transformedItems);
      prevReviewItemsRef.current = transformedItems;
    }
  }, [meeting?.reviewItems]);

  const [summary, setSummary] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Sync summary when query data loads
  useEffect(() => {
    if (meeting?.summary !== undefined) setSummary(meeting.summary);
  }, [meeting?.summary]);

  // Process stream state
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [streamOutput, setStreamOutput] = useState("");
  const [streamDone, setStreamDone] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Nav confirmation dialog
  const [navConfirmOpen, setNavConfirmOpen] = useState(false);
  const [pendingNavSlug, setPendingNavSlug] = useState<string | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/meetings"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Meetings
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <Skeleton className="h-6 w-48" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b px-6 py-3">
          <Link
            to="/meetings"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Meetings
          </Link>
        </div>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium text-destructive">
              {error instanceof Error ? error.message : "Meeting not found."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isProcessed = meeting.status === "processed";
  const isSynced = meeting.status === "synced";
  const isApproved = meeting.status === "approved";

  // Next triage meeting (from the meetings list, excluding current)
  const triageMeetings = allMeetings.filter(
    (m) => (m.status === "synced" || m.status === "processed") && m.slug !== safeSlug
  );
  const nextTriageMeeting = triageMeetings[0];
  const triageRemaining = triageMeetings.length;

  // "Unsaved" = some items reviewed but meeting not yet approved
  const hasReviewedItems = reviewItems.some((i) => i.status !== "pending");
  const hasPendingReview = isProcessed && hasReviewedItems;

  const reviewed = reviewItems.filter((i) => i.status !== "pending").length;

  // Per-item PATCH on status/text change (called by ReviewItemsSection via onItemsChange)
  const handleItemsChange = (newItems: ReviewItem[]) => {
    const prev = prevReviewItemsRef.current;
    for (const newItem of newItems) {
      const oldItem = prev.find((i) => i.id === newItem.id);
      if (!oldItem) continue;
      const statusChanged = oldItem.status !== newItem.status;
      const textChanged = oldItem.text !== newItem.text;
      if (statusChanged || textChanged) {
        approveItemMutation.mutate(
          {
            id: newItem.id,
            status: newItem.status,
            editedText: textChanged ? newItem.text : undefined,
          },
          {
            onError: (err) => {
              toast.error(
                `Failed to update item: ${err instanceof Error ? err.message : "Unknown error"}`
              );
            },
          }
        );
        break; // Only one item changes at a time in ReviewItemsSection
      }
    }
    prevReviewItemsRef.current = newItems;
    setReviewItems(newItems);
  };

  // Bulk approve: fire individual PATCHes per existing pattern
  const handleBulkApprove = (ids: string[]) => {
    for (const id of ids) {
      approveItemMutation.mutate(
        { id, status: "approved" },
        {
          onError: (err) => {
            toast.error(
              `Failed to approve item: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          },
        }
      );
    }
    // Update prevReviewItemsRef after bulk approve
    prevReviewItemsRef.current = reviewItems.map((item) =>
      ids.includes(item.id) ? { ...item, status: "approved" as const } : item
    );
  };

  const handleSaveApprove = () => {
    saveApproveMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Meeting approved and saved to memory");
      },
      onError: (err) => {
        toast.error(
          `Failed to approve: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      },
    });
  };

  // Navigate to next triage item (with confirmation if there's pending review)
  const handleNext = (targetSlug: string) => {
    if (hasPendingReview) {
      setPendingNavSlug(targetSlug);
      setNavConfirmOpen(true);
    } else {
      navigate(`/meetings/${targetSlug}`);
    }
  };

  // Process Meeting — start job, open SSE stream modal
  const handleProcessClick = () => {
    processMutation.mutate(undefined, {
      onSuccess: (data) => {
        setStreamOutput("");
        setStreamDone(false);
        setStreamError(false);
        setProcessModalOpen(true);

        // Open SSE stream
        const es = new EventSource(
          `${BASE_URL}/api/meetings/${safeSlug}/process-stream?jobId=${data.jobId}`
        );
        esRef.current = es;

        es.onmessage = (e: MessageEvent<string>) => {
          const payload = JSON.parse(e.data) as {
            text?: string;
            done?: boolean;
            status?: string;
          };
          if (payload.text) {
            setStreamOutput((prev) => prev + payload.text);
          }
          if (payload.done) {
            es.close();
            esRef.current = null;
            setStreamDone(true);
            if (payload.status === "error") {
              setStreamError(true);
              toast.error("Processing failed");
            } else {
              toast.success("Processing complete");
            }
          }
        };

        es.onerror = () => {
          es.close();
          esRef.current = null;
          setStreamDone(true);
          setStreamError(true);
          toast.error("Processing stream disconnected");
        };
      },
      onError: (err) => {
        toast.error(
          `Failed to start processing: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      },
    });
  };

  const handleProcessModalClose = (open: boolean) => {
    if (!open) {
      // Close SSE if still open
      esRef.current?.close();
      esRef.current = null;
      setProcessModalOpen(false);
      if (streamDone && !streamError) {
        // Invalidate queries to refetch meeting data after successful processing
        void queryClient.invalidateQueries({ queryKey: ["meeting", safeSlug] });
        void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      }
    }
  };

  const handleDeleteClick = () => {
    if (!confirm("Are you sure you want to delete this meeting?")) return;
    deleteMutation.mutate(safeSlug, {
      onSuccess: () => {
        toast.success("Meeting deleted");
        navigate("/meetings");
      },
      onError: (err) => {
        toast.error(`Failed to delete meeting: ${err instanceof Error ? err.message : "Unknown error"}`);
      },
    });
  };

  // Header badge
  const headerBadge = isApproved ? (
    <StatusBadge status="approved" size="sm" />
  ) : isProcessed ? (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-status-processed/10 text-status-processed">
      Needs Review
    </span>
  ) : isSynced ? (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      Needs Processing
    </span>
  ) : (
    <StatusBadge status="approved" size="sm" />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/meetings"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Meetings
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <h1 className="text-lg font-semibold">{meeting.title}</h1>
            {headerBadge}
          </div>
          {isProcessed && !isApproved && (
            <Button
              size="sm"
              onClick={handleSaveApprove}
              disabled={reviewed === 0 || saveApproveMutation.isPending}
            >
              {saveApproveMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save & Approve <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </>
              )}
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
            {isSynced && (
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

            {/* Save & Approve success toast — no banner needed, status badge is enough */}

            {/* Processed: Summary first, then Review Items */}
            {isProcessed && !saveApproveMutation.isSuccess && (
              <>
                <SummarySection
                  summary={summary}
                  setSummary={setSummary}
                  editingSummary={editingSummary}
                  setEditingSummary={setEditingSummary}
                  summaryOpen={summaryOpen}
                  setSummaryOpen={setSummaryOpen}
                  readOnly={false}
                />
                <ReviewItemsSection
                  items={reviewItems}
                  onItemsChange={handleItemsChange}
                  onSaveApprove={handleSaveApprove}
                  onBulkApprove={handleBulkApprove}
                />
              </>
            )}

            {/* Approved: show summary + approved items */}
            {isApproved && (
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
                <ParsedItemsSection
                  parsedSections={meeting.parsedSections}
                  onToggleActionItem={(index, completed) => {
                    // TODO: Implement toggle action item
                    console.log('Toggle action item', index, completed);
                    toast.info('Action item toggle not yet implemented');
                  }}
                />
              </>
            )}

            {/* Synced: raw content */}
            {isSynced && summary && (
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
                            <span className="font-semibold not-italic font-sans">
                              {boldMatch[1]}
                            </span>
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
              approved={isApproved || saveApproveMutation.isSuccess}
              onProcessClick={handleProcessClick}
              onReprocessClick={handleProcessClick}
              onDeleteClick={handleDeleteClick}
            />
          </div>
        </div>
      </div>

      {/* Process Stream Modal */}
      <Dialog open={processModalOpen} onOpenChange={handleProcessModalClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Processing meeting…
            </DialogTitle>
            <DialogDescription>
              Your AI assistant is extracting action items, decisions, and learnings.
            </DialogDescription>
          </DialogHeader>

          <div className="relative rounded-md border bg-muted/30 p-4 font-mono text-xs h-64 overflow-auto">
            {!streamOutput && !streamDone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Starting…
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words">{streamOutput}</pre>
            {streamDone && !streamError && (
              <div className="mt-2 flex items-center gap-1.5 text-status-approved text-xs font-sans">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </div>
            )}
            {streamError && (
              <div className="mt-2 flex items-center gap-1.5 text-destructive text-xs font-sans">
                <AlertCircle className="h-3.5 w-3.5" />
                Processing failed
              </div>
            )}
          </div>

          <DialogFooter>
            {streamDone ? (
              <DialogClose asChild>
                <Button size="sm">Close</Button>
              </DialogClose>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  esRef.current?.close();
                  esRef.current = null;
                  setProcessModalOpen(false);
                }}
              >
                Run in background
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Navigation confirmation dialog */}
      <Dialog open={navConfirmOpen} onOpenChange={setNavConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>
              You've reviewed some items but haven't saved yet. Your per-item actions are
              already recorded — clicking Save & Approve commits them to memory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNavConfirmOpen(false)}
            >
              Stay here
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setNavConfirmOpen(false);
                if (pendingNavSlug) navigate(`/meetings/${pendingNavSlug}`);
              }}
            >
              Continue anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

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
