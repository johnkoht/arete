import { useState } from "react";
import { ReviewItem, ItemStatus, ItemType } from "@/data/meetings";
import { Circle, CheckCircle2, XCircle, Check, X, Lightbulb, Bookmark, ListTodo, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TYPE_LABELS: Record<ItemType, string> = {
  action: "Action Item",
  decision: "Decision",
  learning: "Learning",
};

interface ItemCardProps {
  item: ReviewItem;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onTextChange: (id: string, text: string) => void;
  readOnly?: boolean;
}

function ItemCard({ item, onStatusChange, onTextChange, readOnly }: ItemCardProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const typeLabel = TYPE_LABELS[item.type];

  const statusIcon = () => {
    if (item.status === "approved") return <CheckCircle2 className="h-5 w-5 text-status-approved flex-shrink-0" />;
    if (item.status === "skipped") return <XCircle className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />;
    return <Circle className="h-5 w-5 text-muted-foreground/30 flex-shrink-0" />;
  };

  const borderClass =
    item.status === "approved" ? "border-l-2 border-l-status-approved" :
    item.status === "skipped" ? "border-l-2 border-l-muted" : "";

  return (
    <div
      className={`flex items-start gap-3 rounded-md border bg-card p-3 shadow-sm ${borderClass} ${
        item.status === "skipped" ? "opacity-50" : ""
      }`}
    >
      {statusIcon()}
      <div className="flex-1 min-w-0">
        {editing && !readOnly ? (
          <input
            className="w-full bg-transparent text-sm outline-none border-b border-primary/30 pb-0.5"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              setEditing(false);
              onTextChange(item.id, text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                onTextChange(item.id, text);
              }
            }}
            autoFocus
          />
        ) : (
          <p
            className={`text-sm cursor-text ${
              item.status === "skipped" ? "line-through text-muted-foreground" :
              item.status === "approved" ? "text-muted-foreground" : ""
            }`}
            onClick={() => !readOnly && setEditing(true)}
          >
            {item.text}
          </p>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onStatusChange(item.id, item.status === "approved" ? "pending" : "approved")}
                className={`rounded p-1 transition-colors ${
                  item.status === "approved"
                    ? "text-status-approved bg-status-approved/10"
                    : "text-muted-foreground hover:text-status-approved hover:bg-status-approved/10"
                }`}
              >
                <Check className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Approve {typeLabel}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onStatusChange(item.id, item.status === "skipped" ? "pending" : "skipped")}
                className={`rounded p-1 transition-colors ${
                  item.status === "skipped"
                    ? "text-muted-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Skip {typeLabel}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

interface ReviewItemsSectionProps {
  items: ReviewItem[];
  onItemsChange: (items: ReviewItem[]) => void;
  onSaveApprove?: () => void;
}

export function ReviewItemsSection({ items, onItemsChange, onSaveApprove }: ReviewItemsSectionProps) {
  const actions = items.filter((i) => i.type === "action");
  const decisions = items.filter((i) => i.type === "decision");
  const learnings = items.filter((i) => i.type === "learning");

  const reviewed = items.filter((i) => i.status !== "pending").length;
  const approved = items.filter((i) => i.status === "approved").length;
  const skipped = items.filter((i) => i.status === "skipped").length;

  const handleStatusChange = (id: string, status: ItemStatus) => {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, status } : i)));
  };

  const handleTextChange = (id: string, text: string) => {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  };

  const groups = [
    { label: "Action Items", icon: ListTodo, items: actions },
    { label: "Decisions", icon: Bookmark, items: decisions },
    { label: "Learnings", icon: Lightbulb, items: learnings },
  ];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Action Items": true,
    Decisions: true,
    Learnings: true,
  });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold">Review Items</h2>
        <span className="text-xs text-muted-foreground">
          {reviewed} of {items.length} reviewed
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Approve or skip each item. Save when done to commit to memory.
      </p>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <button
              onClick={() =>
                setOpenGroups((g) => ({ ...g, [group.label]: !g[group.label] }))
              }
              className="mb-2 flex w-full items-center gap-2 text-sm font-medium text-foreground"
            >
              <group.icon className="h-4 w-4 text-muted-foreground" />
              {group.label}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {group.items.length}
              </span>
              <ChevronDown
                className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${
                  openGroups[group.label] ? "" : "-rotate-90"
                }`}
              />
            </button>
            {openGroups[group.label] && (
              <div className="space-y-2">
                {group.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onStatusChange={handleStatusChange}
                    onTextChange={handleTextChange}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 mt-6 flex items-center justify-between rounded-md border bg-card p-3 shadow-sm">
        <span className="text-xs text-muted-foreground">
          {reviewed} of {items.length} reviewed · {approved} approved · {skipped} skipped
        </span>
        <button
          disabled={reviewed === 0}
          onClick={onSaveApprove}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save & Approve →
        </button>
      </div>
    </div>
  );
}

interface ApprovedItemsProps {
  items: ReviewItem[];
}

export function ApprovedItemsSection({ items }: ApprovedItemsProps) {
  const actions = items.filter((i) => i.type === "action");
  const decisions = items.filter((i) => i.type === "decision");
  const learnings = items.filter((i) => i.type === "learning");

  const groups = [
    { label: "Action Items", icon: ListTodo, items: actions },
    { label: "Decisions", icon: Bookmark, items: decisions },
    { label: "Learnings", icon: Lightbulb, items: learnings },
  ];

  return (
    <div className="space-y-5">
      {groups.map((group) =>
        group.items.length > 0 ? (
          <div key={group.label}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <group.icon className="h-4 w-4 text-muted-foreground" />
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-md border bg-card p-3 shadow-sm"
                >
                  <CheckCircle2 className="h-5 w-5 text-status-approved flex-shrink-0" />
                  <p className="text-sm">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
