/**
 * Full-page view for a single person — two-column layout.
 * Route: /people/:slug
 * 
 * V3-3: Two-column layout with:
 * - Header: back link, name, category badge
 * - Left column: Open Commitments (3-5 rows), Recent Meetings (5 rows), Notes
 * - Right column: Overview card, Role & Context, Working Style
 */

import { useState, Suspense, lazy } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Mail, Building2, Briefcase, ChevronDown, ChevronRight, Clock, Users, ArrowRight, ArrowLeftIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageHeader } from "@/components/PageHeader";
import { HealthDot, TrendIcon, CategoryBadge } from "@/components/people/PersonBadges.js";
import { usePerson, useUpdatePersonNotes } from "@/hooks/people.js";

// Lazy load BlockEditor to avoid bundle size impact
const LazyBlockEditor = lazy(() =>
  import("@/components/BlockEditor.js").then((m) => ({ default: m.BlockEditor }))
);
import { useMeeting } from "@/hooks/meetings.js";
import type { ParsedItem } from "@/api/types.js";

// ── Collapsible Section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  items,
  defaultOpen = false,
}: {
  title: string;
  items: ParsedItem[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Hide section if no items
  if (items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors w-full">
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {title} ({items.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <ul className="space-y-1.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-foreground">
              {item.completed !== undefined && (
                <span className={item.completed ? "line-through text-muted-foreground" : ""}>
                  {item.text}
                </span>
              )}
              {item.completed === undefined && item.text}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Meeting Sheet ─────────────────────────────────────────────────────────────

function MeetingSheet({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: meeting, isLoading } = useMeeting(open ? slug : "");
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Guard parsedSections with ?? operator
  const parsedSections = meeting?.parsedSections ?? {
    actionItems: [],
    decisions: [],
    learnings: [],
  };

  // Format duration as "X min" or "X hr Y min"
  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
        {isLoading || !meeting ? (
          <div className="space-y-4 pt-4" data-testid="meeting-sheet-loading">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="text-left" data-testid="meeting-sheet-title">
                {meeting.title}
              </SheetTitle>
              {meeting.date && (
                <p className="text-sm text-muted-foreground" data-testid="meeting-sheet-date">
                  {format(parseISO(meeting.date), "MMMM d, yyyy")}
                </p>
              )}
            </SheetHeader>

            <div className="space-y-5">
              {/* Metadata: attendees + duration */}
              <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                {meeting.attendees.length > 0 && (
                  <div className="flex items-center gap-1.5" data-testid="meeting-sheet-attendees">
                    <Users className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{meeting.attendees.map(a => a.name).join(", ")}</span>
                  </div>
                )}
                {formatDuration(meeting.duration) && (
                  <div className="flex items-center gap-1.5" data-testid="meeting-sheet-duration">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{formatDuration(meeting.duration)}</span>
                  </div>
                )}
              </div>

              {meeting.summary && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Summary
                  </h3>
                  <p className="text-sm text-foreground leading-relaxed" data-testid="meeting-sheet-summary">
                    {meeting.summary}
                  </p>
                </div>
              )}

              {/* Parsed items: decisions, learnings, actions */}
              {(parsedSections.decisions.length > 0 ||
                parsedSections.learnings.length > 0 ||
                parsedSections.actionItems.length > 0) && (
                <>
                  <Separator />
                  <div className="space-y-3" data-testid="meeting-sheet-parsed-items">
                    <CollapsibleSection
                      title="Decisions"
                      items={parsedSections.decisions}
                    />
                    <CollapsibleSection
                      title="Learnings"
                      items={parsedSections.learnings}
                    />
                    <CollapsibleSection
                      title="Actions"
                      items={parsedSections.actionItems}
                    />
                  </div>
                </>
              )}

              {/* Transcript */}
              {meeting.transcript && (
                <>
                  <Separator />
                  <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                    <CollapsibleTrigger
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="meeting-sheet-transcript-toggle"
                    >
                      {transcriptOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {transcriptOpen ? "Hide Transcript" : "Show Transcript"}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div
                        className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground font-mono p-3 bg-muted/50 rounded-md"
                        data-testid="meeting-sheet-transcript"
                      >
                        {meeting.transcript}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}

              <Separator />
              <Link
                to={`/meetings/${slug}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                data-testid="meeting-sheet-full-link"
              >
                Open full meeting →
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Edit Notes Sheet ──────────────────────────────────────────────────────────

function EditNotesSheet({
  open,
  onClose,
  initialContent,
  slug,
}: {
  open: boolean;
  onClose: () => void;
  initialContent: string;
  slug: string;
}) {
  const [editContent, setEditContent] = useState(initialContent);
  const { mutate: saveNotes, isPending: isSaving } = useUpdatePersonNotes(slug);

  // Reset content when sheet opens with new content
  useState(() => {
    setEditContent(initialContent);
  });

  function handleSave() {
    saveNotes(editContent, {
      onSuccess: () => {
        toast.success("Notes saved");
        onClose();
      },
      onError: () => {
        toast.error("Couldn't save notes");
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
        <SheetHeader className="pb-4">
          <SheetTitle>Edit Notes</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          <div className="min-h-[400px] border rounded-md p-3">
            <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
              <LazyBlockEditor
                key={`editing-${slug}-${open}`}
                initialMarkdown={initialContent}
                onChange={setEditContent}
                editable={true}
              />
            </Suspense>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

// ── Direction indicator ───────────────────────────────────────────────────────

function DirectionIndicator({ direction }: { direction: string }) {
  const isIOwe = direction === "i_owe_them";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${
      isIOwe ? "text-amber-600" : "text-sky-600"
    }`}>
      {isIOwe ? <ArrowRight className="h-3 w-3" /> : <ArrowLeftIcon className="h-3 w-3" />}
      {isIOwe ? "You owe" : "They owe"}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PersonDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: person, isLoading, error } = usePerson(slug ?? "");
  const [meetingSlug, setMeetingSlug] = useState<string | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header skeleton */}
        <div className="border-b px-6 py-4">
          <Skeleton className="h-4 w-24 mb-4" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
        </div>
        
        {/* Two column skeleton */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-[200px] w-full rounded-lg" />
              <Skeleton className="h-[150px] w-full rounded-lg" />
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-[120px] w-full rounded-lg" />
              <Skeleton className="h-[100px] w-full rounded-lg" />
              <Skeleton className="h-[150px] w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Person Not Found"
          action={
            <Link
              to="/people"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to People
            </Link>
          }
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-destructive font-medium">Failed to load person</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Person not found"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Limit items for display
  const visibleCommitments = person.openCommitmentItems.slice(0, 5);
  const hasMoreCommitments = person.openCommitmentItems.length > 5;
  const visibleMeetings = person.allMeetings.slice(0, 5);
  const hasMoreMeetings = person.allMeetings.length > 5;

  return (
    <div className="flex flex-col h-full">
      {/* Header with back link, name, category badge */}
      <div className="border-b px-6 py-4">
        <Link
          to="/people"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          People
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold leading-none tracking-tight">{person.name}</h1>
          <CategoryBadge category={person.category} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditingNotes(true)}
          >
            Edit
          </Button>
        </div>
        {(person.role || person.company) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {[person.role, person.company].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Commitments, Meetings, Notes */}
          <div className="lg:col-span-2 space-y-6">
            {/* Open Commitments */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  Open Commitments
                  <span className="text-xs text-muted-foreground font-normal">
                    {person.openCommitments} total
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {person.openCommitmentItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open commitments.</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {visibleCommitments.map((c) => (
                        <div key={c.id} className="flex items-start gap-3 text-sm">
                          <DirectionIndicator direction={c.direction} />
                          <span className="flex-1 text-foreground">{c.text}</span>
                        </div>
                      ))}
                    </div>
                    {hasMoreCommitments && (
                      <Link
                        to={`/commitments?person=${slug}`}
                        className="inline-block mt-4 text-sm text-primary hover:underline"
                      >
                        See all commitments →
                      </Link>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Recent Meetings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  Recent Meetings
                  <span className="text-xs text-muted-foreground font-normal">
                    {person.allMeetings.length} total
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {person.allMeetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No meetings on record.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      {visibleMeetings.map((m) => (
                        <button
                          key={m.slug}
                          onClick={() => setMeetingSlug(m.slug)}
                          className="w-full flex items-start gap-3 text-left py-2 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors group"
                        >
                          <span className="flex-shrink-0 text-xs text-muted-foreground pt-0.5 w-20 tabular-nums">
                            {m.date}
                          </span>
                          <span className="min-w-0 text-sm text-foreground group-hover:text-primary truncate">
                            {m.title}
                          </span>
                        </button>
                      ))}
                    </div>
                    {hasMoreMeetings && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Showing 5 of {person.allMeetings.length} meetings
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {!person.rawContent ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <div className="text-sm">
                    <Suspense fallback={<Skeleton className="h-[100px] w-full" />}>
                      <LazyBlockEditor
                        key={`readonly-${person.slug}-${person.rawContent}`}
                        initialMarkdown={person.rawContent ?? ""}
                        onChange={() => {}}
                        editable={false}
                      />
                    </Suspense>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Overview, Role & Context, Working Style */}
          <div className="space-y-6">
            {/* Overview Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Health status row */}
                <div className="flex items-center gap-3">
                  <HealthDot score={person.healthScore} />
                  <TrendIcon trend={person.trend} />
                  {person.healthStatus && (
                    <span className="text-sm text-muted-foreground">{person.healthStatus}</span>
                  )}
                  {!person.healthStatus && person.healthScore === null && (
                    <span className="text-sm text-muted-foreground">No health data</span>
                  )}
                </div>
                
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-semibold">{person.openCommitments}</p>
                    <p className="text-xs text-muted-foreground">Open Commitments</p>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-semibold">{person.allMeetings.length}</p>
                    <p className="text-xs text-muted-foreground">Meetings</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Role & Context */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Role & Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {person.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a
                      href={`mailto:${person.email}`}
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {person.email}
                    </a>
                  </div>
                )}
                {person.role && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{person.role}</span>
                  </div>
                )}
                {person.company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{person.company}</span>
                  </div>
                )}
                {!person.email && !person.role && !person.company && (
                  <p className="text-sm text-muted-foreground">No contact info.</p>
                )}
              </CardContent>
            </Card>

            {/* Working Style */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Working Style</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {person.stances.length > 0 && (
                  <div>
                    <SectionHeading>Stances</SectionHeading>
                    <ul className="space-y-1">
                      {person.stances.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {person.repeatedAsks.length > 0 && (
                  <div>
                    <SectionHeading>Repeated Asks</SectionHeading>
                    <ul className="space-y-1">
                      {person.repeatedAsks.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {person.repeatedConcerns.length > 0 && (
                  <div>
                    <SectionHeading>Repeated Concerns</SectionHeading>
                    <ul className="space-y-1">
                      {person.repeatedConcerns.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {person.stances.length === 0 &&
                  person.repeatedAsks.length === 0 &&
                  person.repeatedConcerns.length === 0 && (
                    <p className="text-sm text-muted-foreground">No working style data yet.</p>
                  )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Meeting detail Sheet */}
      {meetingSlug && (
        <MeetingSheet
          slug={meetingSlug}
          open={!!meetingSlug}
          onClose={() => setMeetingSlug(null)}
        />
      )}

      {/* Edit Notes Sheet */}
      <EditNotesSheet
        open={isEditingNotes}
        onClose={() => setIsEditingNotes(false)}
        initialContent={person?.rawContent ?? ""}
        slug={slug ?? ""}
      />
    </div>
  );
}
