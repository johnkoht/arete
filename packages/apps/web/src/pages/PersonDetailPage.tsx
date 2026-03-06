/**
 * Full-page view for a single person — replaces the PersonDrawer fly-out.
 * Route: /people/:slug
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Mail, Building2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HealthDot, CategoryBadge } from "@/components/people/PersonBadges.js";
import { MarkdownEditor } from "@/components/MarkdownEditor.js";
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

  if (isLoading) {
    return (
      <div className="p-8 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-2 gap-8 mt-6">
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
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

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
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

        <Separator />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* LEFT: Contact + Intelligence */}
          <div className="space-y-6">
            {/* Contact */}
            <div>
              <SectionHeading>Contact</SectionHeading>
              <div className="space-y-1.5">
                {person.email && (
                  <div className="flex items-center gap-2 text-sm">
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
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                    {person.company}
                  </div>
                )}
                {!person.email && !person.company && (
                  <p className="text-sm text-muted-foreground">No contact info.</p>
                )}
              </div>
            </div>

            {/* Intelligence */}
            <div>
              <SectionHeading>Intelligence</SectionHeading>
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
                  person.repeatedConcerns.length === 0 && (
                    <p className="text-sm text-muted-foreground">No intelligence yet.</p>
                  )}
              </div>
            </div>
          </div>

          {/* RIGHT: Meeting History + Open Commitments + Notes */}
          <div className="space-y-6">
            {/* Meeting History */}
            <div>
              <SectionHeading>
                Meeting History ({person.allMeetings.length})
              </SectionHeading>
              {person.allMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meetings on record.</p>
              ) : (
                <ul className="space-y-1">
                  {person.allMeetings.map((m) => (
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
              )}
            </div>

            {/* Open Commitments */}
            <div>
              <SectionHeading>
                Open Commitments ({person.openCommitments})
              </SectionHeading>
              {person.openCommitmentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open commitments.</p>
              ) : (
                <ul className="space-y-2">
                  {person.openCommitmentItems.map((c) => (
                    <li key={c.id} className="text-sm">
                      <span className="text-muted-foreground text-xs mr-1.5">
                        {c.direction === "i_owe_them" ? "→ You owe" : "← They owe"}
                      </span>
                      {c.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
                  <MarkdownEditor
                    initialValue={editContent}
                    onChange={setEditContent}
                    placeholder="Add notes about this person..."
                    className="min-h-[200px] border rounded-md p-3"
                  />
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
                <MarkdownEditor
                  initialValue={person.rawContent ?? ''}
                  onChange={() => {}}
                  readOnly
                  className="text-sm text-muted-foreground"
                />
              )}
            </div>
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
    </div>
  );
}
