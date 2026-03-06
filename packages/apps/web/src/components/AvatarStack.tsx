import type { Attendee } from "@/api/types.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AvatarStackProps {
  attendees: Attendee[];
  max?: number;
}

export function AvatarStack({ attendees, max = 3 }: AvatarStackProps) {
  const visible = attendees.slice(0, max);
  const overflow = attendees.length - max;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((a) => (
        <Tooltip key={a.initials} delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
              {a.initials}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">{a.name}</TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
              +{overflow}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {attendees.slice(max).map((a) => a.name).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
