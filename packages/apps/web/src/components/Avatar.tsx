import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md';
}

/**
 * Compute initials from a name.
 * - Two or more words: first letter of first word + first letter of last word
 * - Single word: first letter only
 * - Empty/whitespace: "?"
 *
 * Pattern matches api/meetings.ts:mapAttendee()
 */
function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')
      : (parts[0]?.[0] ?? '?');
  return initials.toUpperCase();
}

/**
 * Single-person avatar with initials, tooltip, and accessible label.
 *
 * Follows AvatarStack's div-based styling pattern for visual consistency.
 */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  const initials = computeInitials(name);
  const ariaLabel = name.trim() || 'Unknown';

  // Size classes: sm = 24px (h-6 w-6), md = 32px (h-8 w-8)
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-8 w-8 text-[10px]';

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-muted-foreground ${sizeClasses}`}
          aria-label={ariaLabel}
        >
          {initials}
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{ariaLabel}</TooltipContent>
    </Tooltip>
  );
}
