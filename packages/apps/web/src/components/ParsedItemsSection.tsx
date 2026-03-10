/**
 * ParsedItemsSection — renders action items, decisions, and learnings
 * parsed from meeting body. Action items have toggleable checkboxes.
 */

import type { ReactNode } from "react";
import { CheckCircle2, Circle, Lightbulb, FileText } from "lucide-react";
import type { ParsedSections } from "@/api/types.js";

/**
 * Render text with basic markdown (bold and italic).
 * Converts **text** to <strong> and _text_ to <em>.
 */
function renderMarkdownText(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let key = 0;

  // Process bold (**text**) only - italic underscore patterns conflict with snake_case
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Bold match
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

interface ParsedItemsSectionProps {
  parsedSections?: ParsedSections;
  onToggleActionItem?: (index: number, completed: boolean) => void;
}

export function ParsedItemsSection({ parsedSections, onToggleActionItem }: ParsedItemsSectionProps) {
  if (!parsedSections) return null;

  const { actionItems, decisions, learnings } = parsedSections;
  const hasContent = actionItems.length > 0 || decisions.length > 0 || learnings.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-6">
      {/* Action Items */}
      {actionItems.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-status-approved" />
            Action Items
            <span className="text-xs text-muted-foreground">
              ({actionItems.filter(i => i.completed).length}/{actionItems.length} complete)
            </span>
          </h3>
          <div className="space-y-2">
            {actionItems.map((item, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                  item.completed
                    ? "border-status-approved/20 bg-status-approved/5"
                    : "border-border bg-card hover:bg-accent/50"
                }`}
              >
                <button
                  onClick={() => onToggleActionItem?.(index, !item.completed)}
                  className="mt-0.5 flex-shrink-0"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-status-approved" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                  )}
                </button>
                <span
                  className={`text-sm ${
                    item.completed ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {renderMarkdownText(item.text)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-blue-500" />
            Decisions
          </h3>
          <div className="space-y-2">
            {decisions.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-md border border-blue-500/20 bg-blue-500/5 p-3"
              >
                <FileText className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                <span className="text-sm">{renderMarkdownText(item.text)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learnings */}
      {learnings.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            Learnings
          </h3>
          <div className="space-y-2">
            {learnings.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3"
              >
                <Lightbulb className="h-4 w-4 mt-0.5 text-yellow-500 flex-shrink-0" />
                <span className="text-sm">{renderMarkdownText(item.text)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
