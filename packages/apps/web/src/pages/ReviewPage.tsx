import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  ListTodo,
  Brain,
  Lightbulb,
  Handshake,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
  LayoutDashboard,
  Pencil,
  Zap,
  ChevronRight,
  User,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { usePendingReview, useCompleteReview, useAutoApprovePreview } from "@/hooks/review.js";
import { useAreas } from "@/hooks/areas.js";
import { updateMeeting } from "@/api/meetings.js";
import type {
  TaskDestination,
  WorkspaceTask,
  StagedMemoryItem,
  ReviewCommitment,
  AutoApproveQualifyingMeeting,
} from "@/api/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemDecision = "pending" | "approved" | "skipped";

type TaskDecision = {
  status: ItemDecision;
  destination: TaskDestination;
};

type MemoryDecision = {
  status: ItemDecision;
};

type ReviewSummary = {
  approved: number;
  skipped: number;
  pending: number;
  autoApprovedMeetings: AutoApproveQualifyingMeeting[];
};

/** Composite key to avoid ID collisions across meetings */
function itemKey(item: StagedMemoryItem): string {
  return `${item.meetingSlug}::${item.id}`;
}

type MeetingGroupData = {
  title: string;
  slug: string;
  area?: string;
  actionItems: StagedMemoryItem[];
  decisions: StagedMemoryItem[];
  learnings: StagedMemoryItem[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DESTINATION_OPTIONS: { value: TaskDestination; label: string }[] = [
  { value: "must", label: "Must" },
  { value: "should", label: "Should" },
  { value: "could", label: "Could" },
  { value: "anytime", label: "Anytime" },
  { value: "someday", label: "Someday" },
];

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

// ── Skeleton components ───────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-32" />
          {[1, 2].map((j) => (
            <Skeleton key={j} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Task item component ───────────────────────────────────────────────────────

function TaskItem({
  task,
  decision,
  onDecisionChange,
}: {
  task: WorkspaceTask;
  decision: TaskDecision;
  onDecisionChange: (decision: TaskDecision) => void;
}) {
  const isApproved = decision.status === "approved";
  const isSkipped = decision.status === "skipped";

  return (
    <div
      className={`group rounded-lg border bg-card p-4 transition-all ${
        isApproved
          ? "border-emerald-200 dark:border-emerald-900/50"
          : isSkipped
            ? "border-muted bg-muted/30 opacity-60"
            : "hover:border-primary/30"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm leading-relaxed ${
              isSkipped ? "text-muted-foreground line-through" : ""
            }`}
          >
            {task.text}
          </p>
          {task.metadata.person && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Link
                to={`/people/${task.metadata.person}`}
                className="text-primary hover:underline"
              >
                {task.metadata.person.replace(/-/g, " ")}
              </Link>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Destination selector */}
          <Select
            value={decision.destination}
            onValueChange={(value: TaskDestination) =>
              onDecisionChange({ ...decision, destination: value })
            }
            disabled={isSkipped}
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESTINATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Approve/Skip buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={isApproved ? "default" : "outline"}
              size="sm"
              aria-label={isApproved ? "Remove task approval" : "Approve task"}
              className={`h-8 px-2 ${
                isApproved
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30"
              }`}
              onClick={() =>
                onDecisionChange({
                  ...decision,
                  status: isApproved ? "pending" : "approved",
                })
              }
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant={isSkipped ? "default" : "outline"}
              size="sm"
              aria-label={isSkipped ? "Remove task skip" : "Skip task"}
              className={`h-8 px-2 ${
                isSkipped
                  ? "bg-muted-foreground hover:bg-muted-foreground/90 text-background"
                  : "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              }`}
              onClick={() =>
                onDecisionChange({
                  ...decision,
                  status: isSkipped ? "pending" : "skipped",
                })
              }
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Memory item component (decisions/learnings) ───────────────────────────────

function MemoryItem({
  item,
  decision,
  onDecisionChange,
  editedText,
  isEditing,
  onEditStart,
  onEditSave,
  onEditChange,
}: {
  item: StagedMemoryItem;
  decision: MemoryDecision;
  onDecisionChange: (decision: MemoryDecision) => void;
  editedText: string | undefined;
  isEditing: boolean;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditChange: (text: string) => void;
}) {
  const isApproved = decision.status === "approved";
  const isSkipped = decision.status === "skipped";
  const displayText = editedText ?? item.text;

  return (
    <div
      className={`group rounded-lg border bg-card p-4 transition-all ${
        isApproved
          ? "border-emerald-200 dark:border-emerald-900/50"
          : isSkipped
            ? "border-muted bg-muted/30 opacity-60"
            : "hover:border-primary/30"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex gap-2">
              <Input
                value={displayText}
                onChange={(e) => onEditChange(e.target.value)}
                className="h-8 text-sm"
                aria-label="Edit item text"
                ref={(el) => el?.focus({ preventScroll: true })}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
                onClick={onEditSave}
              >
                Save
              </Button>
            </div>
          ) : (
            <p
              className={`text-sm leading-relaxed ${
                isSkipped ? "text-muted-foreground line-through" : ""
              }`}
            >
              {displayText}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to={`/meetings/${item.meetingSlug}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {item.meetingTitle}
            </Link>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(item.meetingDate), { addSuffix: true })}</span>
            {item.confidence !== undefined && (
              <>
                <span>•</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {Math.round(item.confidence * 100)}%
                </Badge>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Edit item"
              className="h-8 px-2 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 dark:hover:bg-blue-950/30"
              onClick={onEditStart}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant={isApproved ? "default" : "outline"}
            size="sm"
            aria-label={isApproved ? "Remove item approval" : "Approve item"}
            className={`h-8 px-2 ${
              isApproved
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30"
            }`}
            onClick={() =>
              onDecisionChange({ status: isApproved ? "pending" : "approved" })
            }
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant={isSkipped ? "default" : "outline"}
            size="sm"
            aria-label={isSkipped ? "Remove item skip" : "Skip item"}
            className={`h-8 px-2 ${
              isSkipped
                ? "bg-muted-foreground hover:bg-muted-foreground/90 text-background"
                : "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
            }`}
            onClick={() =>
              onDecisionChange({ status: isSkipped ? "pending" : "skipped" })
            }
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Meeting area selector ────────────────────────────────────────────────────

function MeetingAreaSelector({
  meetingSlug,
  currentArea,
}: {
  meetingSlug: string;
  currentArea?: string;
}) {
  const { data: areas } = useAreas();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (area: string) => updateMeeting(meetingSlug, { area }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["review"] });
      toast.success("Area updated");
    },
    onError: (err) => {
      toast.error(`Failed to update area: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  if (!areas || areas.length === 0) return null;

  return (
    <Select
      value={currentArea ?? ""}
      onValueChange={(value) => mutation.mutate(value)}
    >
      <SelectTrigger className="h-6 w-auto min-w-[8rem] max-w-[16rem] text-[10px]">
        <SelectValue placeholder="Area..." />
      </SelectTrigger>
      <SelectContent>
        {areas.map((area) => (
          <SelectItem key={area.slug} value={area.slug}>
            {area.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Meeting section (grouped by meeting with sub-sections) ───────────────────

function MemoryItemWithOwner({
  item,
  decision,
  onDecisionChange,
  editedText,
  isEditing,
  onEditStart,
  onEditSave,
  onEditChange,
}: {
  item: StagedMemoryItem;
  decision: MemoryDecision;
  onDecisionChange: (decision: MemoryDecision) => void;
  editedText: string | undefined;
  isEditing: boolean;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditChange: (text: string) => void;
}) {
  return (
    <div className="space-y-1">
      <MemoryItem
        item={item}
        decision={decision}
        onDecisionChange={onDecisionChange}
        editedText={editedText}
        isEditing={isEditing}
        onEditStart={onEditStart}
        onEditSave={onEditSave}
        onEditChange={onEditChange}
      />
      {item.ownerSlug && (
        <div className="pl-4">
          <Badge variant="secondary" className="text-xs font-normal">
            <User className="mr-1 h-3 w-3" />
            @{item.ownerSlug}
            {item.direction === "i_owe_them" ? (
              <ArrowRight className="mx-0.5 h-3 w-3" />
            ) : item.direction === "they_owe_me" ? (
              <ArrowLeft className="mx-0.5 h-3 w-3" />
            ) : null}
            {item.counterpartySlug && <span>@{item.counterpartySlug}</span>}
          </Badge>
        </div>
      )}
    </div>
  );
}

function MeetingSection({
  meeting,
  memoryDecisions,
  editedItems,
  editingId,
  onDecisionChange,
  onEditStart,
  onEditSave,
  onEditChange,
  onApproveAll,
  onSkipAll,
}: {
  meeting: MeetingGroupData;
  memoryDecisions: Record<string, MemoryDecision>;
  editedItems: Map<string, string>;
  editingId: string | null;
  onDecisionChange: (id: string, decision: MemoryDecision) => void;
  onEditStart: (id: string) => void;
  onEditSave: () => void;
  onEditChange: (id: string, text: string) => void;
  onApproveAll: () => void;
  onSkipAll: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const allItems = [...meeting.actionItems, ...meeting.decisions, ...meeting.learnings];
  const pendingCount = allItems.filter(
    (item) => (memoryDecisions[itemKey(item)]?.status ?? "pending") === "pending"
  ).length;

  const subSections: { key: string; label: string; icon: typeof ListTodo; items: StagedMemoryItem[] }[] = [
    { key: "action_items", label: "Action Items", icon: ListTodo, items: meeting.actionItems },
    { key: "decisions", label: "Decisions", icon: Lightbulb, items: meeting.decisions },
    { key: "learnings", label: "Learnings", icon: Brain, items: meeting.learnings },
  ].filter((s) => s.items.length > 0);

  return (
    <section className="space-y-3">
      {/* Meeting header */}
      <div className="flex items-center justify-between py-2 border-b border-muted-foreground/20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 hover:text-primary"
            aria-label={isExpanded ? "Collapse section" : "Expand section"}
          >
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>
          <Link
            to={`/meetings/${meeting.slug}`}
            className="text-sm font-medium hover:text-primary hover:underline"
          >
            {meeting.title}
          </Link>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {allItems.length}
          </Badge>
          <MeetingAreaSelector meetingSlug={meeting.slug} currentArea={meeting.area} />
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              onClick={onApproveAll}
              aria-label={`Approve all items from ${meeting.title}`}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approve Meeting
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-muted-foreground hover:bg-muted/50"
              onClick={onSkipAll}
              aria-label={`Skip all items from ${meeting.title}`}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Skip Meeting
            </Button>
          </div>
        )}
      </div>
      {/* Sub-sections by type */}
      {isExpanded && (
        <div className="space-y-4 pl-4">
          {subSections.map(({ key, label, icon: Icon, items }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span className="font-medium">{label}</span>
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {items.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {items.map((item) =>
                  item.type === "action_item" ? (
                    <MemoryItemWithOwner
                      key={itemKey(item)}
                      item={item}
                      decision={memoryDecisions[itemKey(item)] ?? { status: "pending" }}
                      onDecisionChange={(d) => onDecisionChange(itemKey(item), d)}
                      editedText={editedItems.get(itemKey(item))}
                      isEditing={editingId === itemKey(item)}
                      onEditStart={() => onEditStart(itemKey(item))}
                      onEditSave={onEditSave}
                      onEditChange={(text) => onEditChange(itemKey(item), text)}
                    />
                  ) : (
                    <MemoryItem
                      key={itemKey(item)}
                      item={item}
                      decision={memoryDecisions[itemKey(item)] ?? { status: "pending" }}
                      onDecisionChange={(d) => onDecisionChange(itemKey(item), d)}
                      editedText={editedItems.get(itemKey(item))}
                      isEditing={editingId === itemKey(item)}
                      onEditStart={() => onEditStart(itemKey(item))}
                      onEditSave={onEditSave}
                      onEditChange={(text) => onEditChange(itemKey(item), text)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Commitment item component (read-only) ─────────────────────────────────────

function CommitmentItem({ commitment }: { commitment: ReviewCommitment }) {
  const isIOwe = commitment.direction === "i_owe_them";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded flex-shrink-0 ${
            isIOwe
              ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
              : "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400"
          }`}
        >
          {isIOwe ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowLeft className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed">{commitment.text}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to={`/people/${commitment.personSlug}`}
              className="text-primary hover:underline"
            >
              {commitment.personName}
            </Link>
            <span>•</span>
            <span>{isIOwe ? "I owe them" : "They owe me"}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(commitment.date), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section header with bulk actions ──────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
  pendingCount,
  onApproveAll,
  onSkipAll,
  showActions = true,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  pendingCount: number;
  onApproveAll?: () => void;
  onSkipAll?: () => void;
  showActions?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>
      {showActions && pendingCount > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onApproveAll}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approve All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onSkipAll}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Skip All
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Global confidence-based approve control (Task 1) ──────────────────────────

function GlobalApproveControl({
  threshold,
  onThresholdChange,
  qualifyingCount,
  onApproveAll,
}: {
  threshold: number;
  onThresholdChange: (t: number) => void;
  qualifyingCount: number;
  onApproveAll: () => void;
}) {
  const [inputValue, setInputValue] = useState(String(Math.round(threshold * 100)));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onThresholdChange(parsed / 100);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <Zap className="h-4 w-4 text-amber-500" />
      <span className="text-muted-foreground text-xs">Confidence threshold:</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min="0"
          max="100"
          value={inputValue}
          onChange={handleInputChange}
          className="h-7 w-16 text-xs text-center"
          aria-label="Confidence threshold percentage"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
        onClick={onApproveAll}
        disabled={qualifyingCount === 0}
        aria-label={`Approve all items with confidence at least ${Math.round(threshold * 100)}%`}
      >
        <Zap className="h-3 w-3 mr-1" />
        Approve High Confidence
        {qualifyingCount > 0 && (
          <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {qualifyingCount}
          </Badge>
        )}
      </Button>
    </div>
  );
}

// ── Auto-approve banner (Task 3) ──────────────────────────────────────────────

function AutoApproveBanner({
  meetings,
  totalItems,
  onAutoApprove,
}: {
  meetings: AutoApproveQualifyingMeeting[];
  totalItems: number;
  onAutoApprove: () => void;
}) {
  if (meetings.length === 0) return null;

  return (
    <div className="rounded-lg border border-orange-300 bg-orange-500/10 p-4 dark:border-orange-500/50 dark:bg-orange-500/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-200">
              {totalItems} items from {meetings.length} meeting{meetings.length !== 1 ? "s" : ""} can be auto-approved
            </span>
          </div>
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
            All items in these meetings have ≥80% confidence:
          </p>
          <div className="flex flex-wrap gap-1">
            {meetings.map((m) => (
              <Badge
                key={m.slug}
                variant="secondary"
                className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
              >
                {m.title} ({m.itemCount})
              </Badge>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white flex-shrink-0"
          onClick={onAutoApprove}
          aria-label="Auto-approve high confidence meetings"
        >
          Auto-approve these
        </Button>
      </div>
    </div>
  );
}

// ── Review summary (Task 4) ───────────────────────────────────────────────────

function ReviewSummaryView({
  summary,
  onDone,
}: {
  summary: ReviewSummary;
  onDone: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Review Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Counts */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-center">
                <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
                  {summary.approved}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Approved</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <div className="text-2xl font-semibold text-muted-foreground">
                  {summary.skipped}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Skipped</div>
              </div>
              {summary.pending > 0 && (
                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center">
                  <div className="text-2xl font-semibold text-amber-700 dark:text-amber-400">
                    {summary.pending}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Not decided</div>
                </div>
              )}
            </div>

            {/* Auto-approved meetings */}
            {summary.autoApprovedMeetings.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Auto-approved meetings
                </div>
                <div className="space-y-1">
                  {summary.autoApprovedMeetings.map((m) => (
                    <div
                      key={m.slug}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs"
                    >
                      <Link
                        to={`/meetings/${m.slug}`}
                        className="text-primary hover:underline"
                      >
                        {m.title}
                      </Link>
                      <span className="text-muted-foreground">{m.itemCount} items</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  These items were auto-approved because all had ≥80% confidence.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 pt-2">
              <Link to="/">
                <Button variant="outline" size="sm">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Button size="sm" onClick={onDone}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Start Another Review
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function ReviewPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session") ?? `web-${Date.now()}`;

  const { data, isLoading, error } = usePendingReview();
  const completeMutation = useCompleteReview();

  // Confidence threshold for bulk-approve (Task 1)
  const [confidenceThreshold, setConfidenceThreshold] = useState(DEFAULT_CONFIDENCE_THRESHOLD);

  // Auto-approve preview (Task 3) — enabled only when we have items
  const { data: autoApproveData } = useAutoApprovePreview(
    confidenceThreshold,
    !isLoading && !error && ((data?.actionItems.length ?? 0) + (data?.decisions.length ?? 0) + (data?.learnings.length ?? 0)) > 0
  );

  // Auto-approve state: which meetings the user chose to auto-approve
  const [autoApprovedMeetings, setAutoApprovedMeetings] = useState<AutoApproveQualifyingMeeting[]>([]);

  // Review summary (Task 4) — shown after completion
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);

  // Track decisions for tasks
  const [taskDecisions, setTaskDecisions] = useState<Record<string, TaskDecision>>({});
  // Track decisions for memory items (decisions + learnings)
  const [memoryDecisions, setMemoryDecisions] = useState<Record<string, MemoryDecision>>({});
  // Track edited text for memory items
  const [editedItems, setEditedItems] = useState<Map<string, string>>(new Map());
  // Track which item is currently being edited
  const [editingId, setEditingId] = useState<string | null>(null);

  // Ref to avoid stale closures in callbacks
  const taskDecisionsRef = useRef(taskDecisions);
  const memoryDecisionsRef = useRef(memoryDecisions);
  const editedItemsRef = useRef(editedItems);
  useEffect(() => {
    taskDecisionsRef.current = taskDecisions;
  }, [taskDecisions]);
  useEffect(() => {
    memoryDecisionsRef.current = memoryDecisions;
  }, [memoryDecisions]);
  useEffect(() => {
    editedItemsRef.current = editedItems;
  }, [editedItems]);

  // Initialize decisions when data loads
  useEffect(() => {
    if (!data) return;

    setTaskDecisions((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const task of data.tasks) {
        if (!updated[task.id]) {
          updated[task.id] = { status: "pending", destination: "must" };
          changed = true;
        }
      }
      return changed ? updated : prev;
    });

    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const item of [...data.actionItems, ...data.decisions, ...data.learnings]) {
        if (!updated[itemKey(item)]) {
          updated[itemKey(item)] = { status: "pending" };
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [data]);

  // Callback helpers
  const handleTaskDecisionChange = useCallback((id: string, decision: TaskDecision) => {
    setTaskDecisions((prev) => ({ ...prev, [id]: decision }));
  }, []);

  const handleMemoryDecisionChange = useCallback((id: string, decision: MemoryDecision) => {
    setMemoryDecisions((prev) => ({ ...prev, [id]: decision }));
  }, []);

  // Edit handlers for memory items
  const handleEditStart = useCallback((id: string) => {
    setEditingId(id);
  }, []);

  const handleEditSave = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleEditChange = useCallback((id: string, text: string) => {
    setEditedItems((prev) => new Map(prev).set(id, text));
  }, []);

  // Bulk actions for tasks
  const handleApproveAllTasks = useCallback(() => {
    if (!data) return;
    setTaskDecisions((prev) => {
      const updated = { ...prev };
      for (const task of data.tasks) {
        if (updated[task.id]?.status === "pending") {
          updated[task.id] = { ...updated[task.id], status: "approved" };
        }
      }
      return updated;
    });
  }, [data]);

  const handleSkipAllTasks = useCallback(() => {
    if (!data) return;
    setTaskDecisions((prev) => {
      const updated = { ...prev };
      for (const task of data.tasks) {
        if (updated[task.id]?.status === "pending") {
          updated[task.id] = { ...updated[task.id], status: "skipped" };
        }
      }
      return updated;
    });
  }, [data]);

  // Bulk actions for all memory items (action items + decisions + learnings)
  const handleApproveAllMemory = useCallback(() => {
    if (!data) return;
    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      for (const item of [...data.actionItems, ...data.decisions, ...data.learnings]) {
        if (updated[itemKey(item)]?.status === "pending") {
          updated[itemKey(item)] = { status: "approved" };
        }
      }
      return updated;
    });
  }, [data]);

  const handleSkipAllMemory = useCallback(() => {
    if (!data) return;
    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      for (const item of [...data.actionItems, ...data.decisions, ...data.learnings]) {
        if (updated[itemKey(item)]?.status === "pending") {
          updated[itemKey(item)] = { status: "skipped" };
        }
      }
      return updated;
    });
  }, [data]);

  // Meeting-level batch approval helpers (Task 2)
  const handleApproveMeeting = useCallback((meetingSlug: string, items: StagedMemoryItem[]) => {
    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      for (const item of items) {
        if (item.meetingSlug === meetingSlug && (updated[itemKey(item)]?.status ?? "pending") === "pending") {
          updated[itemKey(item)] = { status: "approved" };
        }
      }
      return updated;
    });
  }, []);

  const handleSkipMeeting = useCallback((meetingSlug: string, items: StagedMemoryItem[]) => {
    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      for (const item of items) {
        if (item.meetingSlug === meetingSlug && (updated[itemKey(item)]?.status ?? "pending") === "pending") {
          updated[itemKey(item)] = { status: "skipped" };
        }
      }
      return updated;
    });
  }, []);

  // Global confidence-based approve
  const handleApproveHighConfidence = useCallback(() => {
    if (!data) return;
    const allMemoryItems = [...data.actionItems, ...data.decisions, ...data.learnings];
    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      for (const item of allMemoryItems) {
        if (
          (updated[itemKey(item)]?.status ?? "pending") === "pending" &&
          item.confidence !== undefined &&
          item.confidence >= confidenceThreshold
        ) {
          updated[itemKey(item)] = { status: "approved" };
        }
      }
      return updated;
    });
  }, [data, confidenceThreshold]);

  // Count items qualifying for high-confidence approve
  const highConfidenceCount = useMemo(() => {
    if (!data) return 0;
    return [...data.actionItems, ...data.decisions, ...data.learnings].filter(
      (item) =>
        (memoryDecisions[itemKey(item)]?.status ?? "pending") === "pending" &&
        item.confidence !== undefined &&
        item.confidence >= confidenceThreshold
    ).length;
  }, [data, memoryDecisions, confidenceThreshold]);

  // Auto-approve handler — marks all items from qualifying meetings as approved
  const handleAutoApprove = useCallback(() => {
    if (!autoApproveData || !data) return;
    const qualifyingSlugs = new Set(autoApproveData.meetings.map((m) => m.slug));
    setMemoryDecisions((prev) => {
      const updated = { ...prev };
      for (const item of [...data.actionItems, ...data.decisions, ...data.learnings]) {
        if (qualifyingSlugs.has(item.meetingSlug) && (updated[itemKey(item)]?.status ?? "pending") === "pending") {
          updated[itemKey(item)] = { status: "approved" };
        }
      }
      return updated;
    });
    setAutoApprovedMeetings(autoApproveData.meetings);
  }, [autoApproveData, data]);

  // Calculate pending counts
  const pendingTaskCount = useMemo(() => {
    if (!data) return 0;
    return data.tasks.filter((t) => taskDecisions[t.id]?.status === "pending").length;
  }, [data, taskDecisions]);

  const pendingMemoryCount = useMemo(() => {
    if (!data) return 0;
    return [...data.actionItems, ...data.decisions, ...data.learnings].filter(
      (item) => memoryDecisions[itemKey(item)]?.status === "pending"
    ).length;
  }, [data, memoryDecisions]);

  const totalPending = pendingTaskCount + pendingMemoryCount;

  // Group all memory items by meeting
  const itemsByMeeting = useMemo(() => {
    if (!data) return new Map<string, MeetingGroupData>();
    const map = new Map<string, MeetingGroupData>();

    const ensureMeeting = (item: StagedMemoryItem) => {
      let group = map.get(item.meetingSlug);
      if (!group) {
        group = {
          title: item.meetingTitle,
          slug: item.meetingSlug,
          area: item.meetingArea,
          actionItems: [],
          decisions: [],
          learnings: [],
        };
        map.set(item.meetingSlug, group);
      }
      return group;
    };

    for (const item of data.actionItems) ensureMeeting(item).actionItems.push(item);
    for (const item of data.decisions) ensureMeeting(item).decisions.push(item);
    for (const item of data.learnings) ensureMeeting(item).learnings.push(item);

    return map;
  }, [data]);

  // Collect approved/skipped IDs
  const collectResults = useCallback(() => {
    const approved: string[] = [];
    const skipped: string[] = [];

    for (const [id, decision] of Object.entries(taskDecisionsRef.current)) {
      if (decision.status === "approved") {
        approved.push(`task:${id}:${decision.destination}`);
      } else if (decision.status === "skipped") {
        skipped.push(`task:${id}`);
      }
    }

    for (const [compositeKey, decision] of Object.entries(memoryDecisionsRef.current)) {
      const id = compositeKey.includes('::') ? compositeKey.split('::')[1] : compositeKey;
      if (decision.status === "approved") {
        const editedText = editedItemsRef.current.get(compositeKey);
        if (editedText !== undefined) {
          approved.push(`memory:${id}:${encodeURIComponent(editedText)}`);
        } else {
          approved.push(`memory:${id}`);
        }
      } else if (decision.status === "skipped") {
        skipped.push(`memory:${id}`);
      }
    }

    return { approved, skipped };
  }, []);

  // Handle done reviewing (Task 4: capture summary)
  const handleDoneReviewing = useCallback(() => {
    const { approved, skipped } = collectResults();

    // Calculate summary counts before mutation
    const totalItems = (data?.tasks.length ?? 0) + (data?.actionItems.length ?? 0) + (data?.decisions.length ?? 0) + (data?.learnings.length ?? 0);
    const approvedCount = approved.length;
    const skippedCount = skipped.length;
    const pendingCount = totalItems - approvedCount - skippedCount;

    completeMutation.mutate(
      { sessionId, approved, skipped },
      {
        onSuccess: () => {
          // Show review summary instead of toast
          setReviewSummary({
            approved: approvedCount,
            skipped: skippedCount,
            pending: pendingCount,
            autoApprovedMeetings,
          });
        },
        onError: (err) => {
          toast.error(
            `Failed to complete review: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        },
      }
    );
  }, [collectResults, completeMutation, sessionId, data, autoApprovedMeetings]);

  // Reset review (go back to fresh state after completion)
  const handleResetReview = useCallback(() => {
    setReviewSummary(null);
    setAutoApprovedMeetings([]);
    setTaskDecisions({});
    setMemoryDecisions({});
    setEditedItems(new Map());
  }, []);

  // Calculate total items
  const totalItems = data
    ? data.tasks.length + data.actionItems.length + data.decisions.length + data.learnings.length
    : 0;
  const hasItems = totalItems > 0;
  const hasCommitments = (data?.commitments.length ?? 0) > 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Review" />
        <ReviewSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Review" />
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-destructive font-medium">Failed to load review items</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!hasItems && !hasCommitments && !reviewSummary) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Review" />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={CheckCircle2}
            title="All caught up!"
            description="No pending items to review. Process some meetings to get started."
            action={
              <Link to="/">
                <Button variant="outline" size="sm">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // Review summary state (Task 4) — shown after completion
  if (reviewSummary) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Review Complete" />
        <ReviewSummaryView
          summary={reviewSummary}
          onDone={handleResetReview}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Review Pending Items"
        action={
          <Button
            onClick={handleDoneReviewing}
            disabled={completeMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {completeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Completing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Done Reviewing
                {totalPending > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                    {totalPending} pending
                  </Badge>
                )}
              </>
            )}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-8 max-w-4xl mx-auto">
          {/* Global confidence controls */}
          {data && (data.actionItems.length > 0 || data.decisions.length > 0 || data.learnings.length > 0) && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <GlobalApproveControl
                threshold={confidenceThreshold}
                onThresholdChange={setConfidenceThreshold}
                qualifyingCount={highConfidenceCount}
                onApproveAll={handleApproveHighConfidence}
              />
            </div>
          )}

          {/* Auto-approve banner (Task 3) */}
          {autoApproveData && autoApproveData.meetings.length > 0 && autoApprovedMeetings.length === 0 && (
            <AutoApproveBanner
              meetings={autoApproveData.meetings}
              totalItems={autoApproveData.totalItems}
              onAutoApprove={handleAutoApprove}
            />
          )}

          {/* Tasks Section */}
          {data && data.tasks.length > 0 && (
            <section>
              <SectionHeader
                icon={ListTodo}
                title="Tasks to Create"
                count={data.tasks.length}
                pendingCount={pendingTaskCount}
                onApproveAll={handleApproveAllTasks}
                onSkipAll={handleSkipAllTasks}
              />
              <div className="space-y-2">
                {data.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    decision={
                      taskDecisions[task.id] ?? { status: "pending", destination: "must" }
                    }
                    onDecisionChange={(d) => handleTaskDecisionChange(task.id, d)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Meeting Sections — grouped by meeting, sub-grouped by type */}
          {data && itemsByMeeting.size > 0 && (
            <div className="space-y-6">
              <SectionHeader
                icon={Brain}
                title="Meeting Items"
                count={data.actionItems.length + data.decisions.length + data.learnings.length}
                pendingCount={pendingMemoryCount}
                onApproveAll={handleApproveAllMemory}
                onSkipAll={handleSkipAllMemory}
              />
              {Array.from(itemsByMeeting.values()).map((meeting) => {
                const allItems = [...meeting.actionItems, ...meeting.decisions, ...meeting.learnings];
                return (
                  <MeetingSection
                    key={meeting.slug}
                    meeting={meeting}
                    memoryDecisions={memoryDecisions}
                    editedItems={editedItems}
                    editingId={editingId}
                    onDecisionChange={handleMemoryDecisionChange}
                    onEditStart={handleEditStart}
                    onEditSave={handleEditSave}
                    onEditChange={handleEditChange}
                    onApproveAll={() => handleApproveMeeting(meeting.slug, allItems)}
                    onSkipAll={() => handleSkipMeeting(meeting.slug, allItems)}
                  />
                );
              })}
            </div>
          )}

          {/* Commitments Section (read-only) */}
          {data && data.commitments.length > 0 && (
            <section>
              <SectionHeader
                icon={Handshake}
                title="Open Commitments"
                count={data.commitments.length}
                pendingCount={0}
                showActions={false}
              />
              <p className="text-xs text-muted-foreground mb-3">
                These are your current open commitments. Manage them on the{" "}
                <Link to="/commitments" className="text-primary hover:underline">
                  Commitments page
                </Link>
                .
              </p>
              <div className="space-y-2">
                {data.commitments.map((commitment) => (
                  <CommitmentItem key={commitment.id} commitment={commitment} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
