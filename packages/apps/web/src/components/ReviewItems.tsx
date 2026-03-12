import { useState, useEffect, useCallback } from "react";
import type { ReviewItem, ItemStatus, ItemType, ApprovedItems } from "@/api/types.js";
import { Circle, CheckCircle2, XCircle, Check, X, Lightbulb, Bookmark, ListTodo, ChevronDown, CheckCheck, Folder, FileText, ArrowRight, ArrowLeft, User } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchableSelect, type SearchableSelectItem } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/hooks/projects.js";

const TYPE_LABELS: Record<ItemType, string> = {
  action: "Action Item",
  decision: "Decision",
  learning: "Learning",
};

/**
 * Render text with basic markdown (bold only).
 * Converts **text** to <strong>text</strong>.
 */
function renderMarkdownText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const boldRegex = /\*\*(.+?)\*\*/g;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the bold text
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

interface ItemCardProps {
  item: ReviewItem;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onTextChange: (id: string, text: string) => void;
  onProjectChange?: (id: string, projectSlug: string | null) => void;
  projects?: SearchableSelectItem[];
  readOnly?: boolean;
}

function ItemCard({ item, onStatusChange, onTextChange, onProjectChange, projects, readOnly }: ItemCardProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const typeLabel = TYPE_LABELS[item.type];
  const isAction = item.type === "action";

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
        {/* Badges row: source and owner info */}
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {/* "from your notes" badge for dedup items */}
          {item.source === "dedup" && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              <FileText className="mr-1 h-3 w-3" />
              from your notes
            </Badge>
          )}
          {/* Owner badge for action items with owner info */}
          {isAction && item.ownerSlug && (
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
          )}
        </div>
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
            {renderMarkdownText(item.text)}
          </p>
        )}
      </div>
      {/* Project picker for action items */}
      {!readOnly && isAction && projects && onProjectChange && (
        <div className="flex-shrink-0">
          <SearchableSelect
            items={projects}
            selected={item.projectSlug ?? null}
            onSelect={(id) => onProjectChange(item.id, id)}
            placeholder="Project"
            searchPlaceholder="Search projects..."
            allowClear
            muted={!item.projectSlug}
            className="h-7 text-xs w-[140px]"
          />
        </div>
      )}
      {!readOnly && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onStatusChange(item.id, item.status === "approved" ? "pending" : "approved")}
                aria-label={item.status === "approved" ? `Unapprove ${typeLabel}` : `Approve ${typeLabel}`}
                className={`rounded p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
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
                aria-label={item.status === "skipped" ? `Unskip ${typeLabel}` : `Skip ${typeLabel}`}
                className={`rounded p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
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

const STORAGE_KEY = "arete-review-collapsed";

interface ReviewItemsSectionProps {
  items: ReviewItem[];
  onItemsChange: (items: ReviewItem[]) => void;
  onSaveApprove?: () => void;
  /** Called when "Approve All" is clicked for a section. Receives the IDs that were approved. */
  onBulkApprove?: (ids: string[]) => void;
}

function getInitialOpenGroups(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const collapsed = JSON.parse(stored) as string[];
      return {
        "Action Items": !collapsed.includes("Action Items"),
        Decisions: !collapsed.includes("Decisions"),
        Learnings: !collapsed.includes("Learnings"),
      };
    }
  } catch {
    // ignore parse errors
  }
  return {
    "Action Items": true,
    Decisions: true,
    Learnings: true,
  };
}

export function ReviewItemsSection({ items, onItemsChange, onSaveApprove, onBulkApprove }: ReviewItemsSectionProps) {
  const actions = items.filter((i) => i.type === "action");
  const decisions = items.filter((i) => i.type === "decision");
  const learnings = items.filter((i) => i.type === "learning");

  const reviewed = items.filter((i) => i.status !== "pending").length;
  const approved = items.filter((i) => i.status === "approved").length;
  const skipped = items.filter((i) => i.status === "skipped").length;

  // Load projects for action item project picker
  const { data: projectsData } = useProjects();
  const projectItems: SearchableSelectItem[] = (projectsData ?? []).map((p) => ({
    id: p.slug,
    label: p.name,
    icon: <Folder className="h-3.5 w-3.5 text-muted-foreground" />,
  }));

  const handleStatusChange = useCallback((id: string, status: ItemStatus) => {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, status } : i)));
  }, [items, onItemsChange]);

  const handleTextChange = useCallback((id: string, text: string) => {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  }, [items, onItemsChange]);

  const handleProjectChange = useCallback((id: string, projectSlug: string | null) => {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, projectSlug: projectSlug ?? undefined } : i)));
  }, [items, onItemsChange]);

  const groups = [
    { label: "Action Items", icon: ListTodo, items: actions },
    { label: "Decisions", icon: Bookmark, items: decisions },
    { label: "Learnings", icon: Lightbulb, items: learnings },
  ];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(getInitialOpenGroups);

  // Persist collapse state to localStorage
  useEffect(() => {
    const collapsed = Object.entries(openGroups)
      .filter(([, isOpen]) => !isOpen)
      .map(([label]) => label);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      // ignore write errors
    }
  }, [openGroups]);

  const handleApproveAll = useCallback((sectionItems: ReviewItem[]) => {
    // Get items that need to be approved (not already approved)
    const itemsToApprove = sectionItems.filter((i) => i.status !== "approved");
    if (itemsToApprove.length === 0) return;

    // Update all items in the section to approved
    const idsToApprove = new Set(itemsToApprove.map((i) => i.id));
    const newItems = items.map((i) =>
      idsToApprove.has(i.id) ? { ...i, status: "approved" as ItemStatus } : i
    );
    onItemsChange(newItems);

    // Notify parent (for PATCH calls)
    if (onBulkApprove) {
      onBulkApprove(itemsToApprove.map((i) => i.id));
    }
  }, [items, onItemsChange, onBulkApprove]);

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
        {groups.map((group) => {
          const unapprovedCount = group.items.filter((i) => i.status !== "approved").length;
          return (
            <div key={group.label}>
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={() =>
                    setOpenGroups((g) => ({ ...g, [group.label]: !g[group.label] }))
                  }
                  aria-expanded={openGroups[group.label]}
                  aria-label={`${openGroups[group.label] ? "Collapse" : "Expand"} ${group.label}`}
                  className="flex flex-1 items-center gap-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
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
                {group.items.length > 0 && unapprovedCount > 0 && (
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleApproveAll(group.items)}
                        aria-label={`Approve all ${group.label}`}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-status-approved/10 hover:text-status-approved focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Approve All
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Approve all {unapprovedCount} unapproved {group.label.toLowerCase()}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              {openGroups[group.label] && (
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onStatusChange={handleStatusChange}
                      onTextChange={handleTextChange}
                      onProjectChange={handleProjectChange}
                      projects={projectItems}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
  approvedItems?: ApprovedItems;
}

export function ApprovedItemsSection({ approvedItems }: ApprovedItemsProps) {
  const actions = approvedItems?.actionItems ?? [];
  const decisions = approvedItems?.decisions ?? [];
  const learnings = approvedItems?.learnings ?? [];

  const groups = [
    { label: "Action Items", icon: ListTodo, items: actions },
    { label: "Decisions", icon: Bookmark, items: decisions },
    { label: "Learnings", icon: Lightbulb, items: learnings },
  ];

  const hasItems = actions.length > 0 || decisions.length > 0 || learnings.length > 0;

  if (!hasItems) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No items were approved for this meeting.
      </div>
    );
  }

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
              {group.items.map((text, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-md border bg-card p-3 shadow-sm"
                >
                  <CheckCircle2 className="h-5 w-5 text-status-approved flex-shrink-0" />
                  <p className="text-sm">{renderMarkdownText(text)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
