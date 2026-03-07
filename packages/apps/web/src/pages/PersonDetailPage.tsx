/**
 * Full-page view for a single person — replaces the PersonDrawer fly-out.
 * Route: /people/:slug
 * 
 * V3-2: Restructured to single-column layout with:
 * - Contact info inline (email, company horizontal)
 * - Open Commitments (3 items max + "See All")
 * - Recent Meetings (5 items max)
 * - Intelligence with health status + stances/asks/concerns
 * - Notes with LazyBlockEditor
 * - Navigation guard via useBlocker
 */

import { useState, useEffect, Suspense } from "react";
import { useParams, Link, useBlocker } from "react-router-dom";
import { ArrowLeft, Mail, Building2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HealthDot, TrendIcon, CategoryBadge } from "@/components/people/PersonBadges.js";
import { LazyBlockEditor } from "@/components/BlockEditor.js";
import { usePerson, useUpdatePersonNotes } from "@/hooks/people.js";
import { useMeeting } from "@/hooks/meetings.js";

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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading || !meeting ? (
          <div className="space-y-4 pt-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="text-left">{meeting.title}</SheetTitle>
              {meeting.date && (
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(meeting.date), "MMMM d, yyyy")}
                </p>
              )}
            </SheetHeader>

            <div className="space-y-5">
              {meeting.summary && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Summary
                  </h3>
                  <p className="text-sm text-foreground leading-relaxed">{meeting.summary}</p>
                </div>
              )}

              {meeting.body && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Notes
                    </h3>
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
                      {meeting.body}
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <Link
                to={`/meetings/${slug}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
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

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PersonDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: person, isLoading, error } = usePerson(slug ?? "");
  const [meetingSlug, setMeetingSlug] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const { mutate: saveNotes, isPending: isSaving } = useUpdatePersonNotes(slug ?? '');

  // Navigation guard for unsaved changes
  const blocker = useBlocker(isEditing && editContent !== (person?.rawContent ?? ''));

  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);

  if (isLoading) {
    return (
      <div className="p-8 space-y-6 max-w-3xl mx-auto">
        {/* Back link skeleton */}
        <Skeleton className="h-4 w-24" />
        
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
        
        {/* Contact info skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        
        {/* Sections skeleton */}
        <Skeleton className="h-4 w-36" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        
        <Skeleton className="h-4 w-36" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-[100px] w-full" />
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-destructive font-medium">Failed to load person</p>
        <p className="text-xs text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "Person not found"}
        </p>
        <Link to="/people" className="mt-4 inline-flex text-sm text-primary hover:underline">
          ← Back to People
        </Link>
      </div>
    );
  }

  // Limit items for display
  const visibleCommitments = person.openCommitmentItems.slice(0, 3);
  const hasMoreCommitments = person.openCommitmentItems.length > 3;
  const visibleMeetings = person.allMeetings.slice(0, 5);
  const hasMoreMeetings = person.allMeetings.length > 5;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Back link */}
        <Link
          to="/people"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          People
        </Link>

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-semibold">{person.name}</h1>
            <HealthDot score={person.healthScore} />
            <CategoryBadge category={person.category} />
          </div>
          {(person.role || person.company) && (
            <p className="text-sm text-muted-foreground">
              {[person.role, person.company].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Contact info — horizontal layout */}
        <div className="flex items-center gap-4 flex-wrap text-sm">
          {person.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <a
                href={`mailto:${person.email}`}
                className="text-primary hover:underline"
              >
                {person.email}
              </a>
            </div>
          )}
          {person.company && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
              {person.company}
            </div>
          )}
          {!person.email && !person.company && (
            <p className="text-muted-foreground">No contact info.</p>
          )}
        </div>

        <Separator />

        {/* Open Commitments */}
        <div>
          <SectionHeading>
            Open Commitments ({person.openCommitments})
          </SectionHeading>
          {person.openCommitmentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open commitments.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {visibleCommitments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="text-muted-foreground text-xs mr-1.5">
                      {c.direction === "i_owe_them" ? "→ You owe" : "← They owe"}
                    </span>
                    {c.text}
                  </li>
                ))}
              </ul>
              {hasMoreCommitments && (
                <Link
                  to={`/commitments?person=${slug}`}
                  className="inline-block mt-2 text-sm text-primary hover:underline"
                >
                  See All →
                </Link>
              )}
            </>
          )}
        </div>

        <Separator />

        {/* Recent Meetings */}
        <div>
          <SectionHeading>
            Recent Meetings ({person.allMeetings.length})
          </SectionHeading>
          {person.allMeetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No meetings on record.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {visibleMeetings.map((m) => (
                  <li key={m.slug}>
                    <button
                      onClick={() => setMeetingSlug(m.slug)}
                      className="w-full flex items-start gap-3 text-left py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors group"
                    >
                      <span className="flex-shrink-0 text-xs text-muted-foreground pt-0.5 w-24">
                        {m.date}
                      </span>
                      <span className="min-w-0 text-sm text-foreground group-hover:text-primary truncate">
                        {m.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {hasMoreMeetings && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing 5 of {person.allMeetings.length} meetings
                </p>
              )}
            </>
          )}
        </div>

        <Separator />

        {/* Intelligence */}
        <div>
          <SectionHeading>Intelligence</SectionHeading>
          
          {/* Health status row */}
          <div className="flex items-center gap-3 mb-4">
            <HealthDot score={person.healthScore} />
            <TrendIcon trend={person.trend} />
            {person.healthStatus && (
              <span className="text-sm text-muted-foreground">{person.healthStatus}</span>
            )}
            {!person.healthStatus && person.healthScore === null && (
              <span className="text-sm text-muted-foreground">No health data</span>
            )}
          </div>

          {/* Stances, Asks, Concerns */}
          <div className="space-y-4">
            {person.stances.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Stances</p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1">Repeated Asks</p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Repeated Concerns
                </p>
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
              person.repeatedConcerns.length === 0 &&
              person.healthScore !== null && (
                <p className="text-sm text-muted-foreground">No additional intelligence.</p>
              )}
          </div>
        </div>

        <Separator />

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
            {!isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditContent(person.rawContent ?? '');
                  setIsEditing(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>

          {isEditing ? (
            <>
              <div className="min-h-[200px] border rounded-md p-3">
                <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
                  <LazyBlockEditor
                    key={`editing-${person.slug}`}
                    initialMarkdown={editContent}
                    onChange={setEditContent}
                    editable={true}
                  />
                </Suspense>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    saveNotes(editContent, {
                      onSuccess: () => {
                        toast.success('Notes saved');
                        setIsEditing(false);
                      },
                      onError: () => {
                        toast.error("Couldn't save notes");
                      },
                    });
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              <Suspense fallback={<Skeleton className="h-[100px] w-full" />}>
                <LazyBlockEditor
                  key={`readonly-${person.slug}-${person.rawContent}`}
                  initialMarkdown={person.rawContent ?? ''}
                  onChange={() => {}}
                  editable={false}
                />
              </Suspense>
            </div>
          )}
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
    </div>
  );
}
