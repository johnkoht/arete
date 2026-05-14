---
name: schedule-meeting
description: Schedule a meeting or block focus time — agent does all parsing + person-resolution + availability-finding upfront, then engages once with a curated slot proposal + create-and-followup action plan.
triggers:
  - schedule a meeting
  - book time with
  - set up a call
  - 1:1 with
  - find time with
  - book a meeting
  - block time
  - focus time
primitives:
  - User
work_type: operations
category: essential
intelligence:
  - entity_resolution
---

# Schedule Meeting — chef-orchestrator pattern

This skill is built on the four chef-orchestrator patterns from
`PATTERNS.md`. The agent parses the request, resolves the person,
finds mutual availability, and engages **once** with a curated slot
proposal + downstream action plan (Pattern 1:
`do-all-work-then-engage`).

Every proposed slot carries a reason label ("matches your preferred
1:1 time window", "fits before sender's standing 2pm block",
"first mutual availability") (Pattern 2:
`curate-with-reason-labels`). When ambiguous — multiple matching
people, no clear time preference, no availability in the requested
window — surface to `## Uncertain — your call` rather than
auto-defaulting.

Action proposals (`calendar.create_event`, `slack.send_dm` to
confirm to attendee, `meeting-prep` skill chain) appear at the end
with mode tags (Pattern 3: `propose-with-mcp-action`).

Pattern 4 (`surface-deferred-as-sidecar`) is **minimal here** —
schedule-meeting is a low-volume per-invocation skill, not a daily
batch. The curated-view persistence at
`now/archive/schedule-meeting/` IS the audit trail; no separate
sidecar file is generated.

This skill is **two-engage by design** for the meeting flow:
- **Engage 1**: agent surfaces parsed details + resolved person +
  candidate slots → user picks a slot
- **Engage 2** (optional): agent surfaces "meeting created, want
  meeting-prep or agenda?" → user picks follow-up actions

For the **block time** flow (no person), the agent does
`do-all-work-then-engage` in a single pass — block specs are usually
self-contained ("Block 2 hours for focus time tomorrow morning").

**Read first** (if exists):
`.arete/skills-local/schedule-meeting.md`. This is the user's
per-skill APPEND: preferred meeting durations, default block-time
ranges, communication style for invites, which people should auto-
get a pre-meeting Slack DM ("hey, calendar invite incoming for
Wed"), preferred Slack channels for FYI'ing about new meetings.
Treat its content as opinion-defining context.

## When to Use

- "Schedule a meeting with Sarah"
- "Book time with John tomorrow"
- "1:1 with Alex next week"
- "Find time with the design team"
- "Set up a call with Jane for 30 minutes"
- "Block 2 hours for focus time"
- "Book focus time tomorrow morning"

## Workflow — chef-orchestrator pattern

**Gather → judge → engage twice (meeting flow) or once (block
flow).** Do not engage between gather and judge.

### Step 0 — Read APPEND

```bash
arete skill resolve schedule-meeting
cat .arete/skills-local/schedule-meeting.md 2>/dev/null || echo "(no APPEND file)"
```

The APPEND file (if present) provides default duration, preferred
windows, default invitation messages, FYI channels.

### Step 1 — Parse + Gather

Extract from the user's request, then run parallel gathers:

| Element | Default | Examples |
|---------|---------|----------|
| **Person** | None (block time if missing) | "Sarah", "John Smith", "sarah@example.com" |
| **Time preference** | Today + 2 days | "today", "tomorrow", "next week", "Monday" |
| **Duration** | 30 minutes (or APPEND default) | "30-min sync", "hour-long", "2 hours" |
| **Meeting type** | Inferred | "1:1", "sync", "call", "meeting" |

**Time preference mapping**:
- No time preference → today + 2 days (3 days total)
- "today" → today only (1 day)
- "tomorrow" → tomorrow only (1 day)
- "next week" → Monday through Friday of next week (5 days)

**Duration extraction**: "30-min" / "30 minute" → 30; "hour" /
"hour-long" / "1 hour" → 60; "90 minutes" / "1.5 hours" → 90;
"2 hours" → 120.

**Detect block time**: no person mentioned + "focus", "deep work",
"heads down", "block time" → block-time flow.

**Parallel gather (if person specified)**:

```bash
# 1a. Resolve person
arete resolve "<person>" --type person --json

# 1b. Pull recent meetings with that person (for context-aware proposals)
ls resources/meetings/ | tail -20

# 1c. Read APPEND-defined preferences (already loaded in Step 0)

# 1d. Pull calendar window for the time preference
arete pull calendar --days <N> --json

# 1e. (After 1a returns) find mutual availability
arete availability find --with <email> --days <N> --duration <D> --limit 3 --json
```

### Step 2 — Apply judgment

**Resolve person** (from 1a):
- Single match → proceed with that email
- Multiple matches → surface to Uncertain ("multiple Sarahs found")
- No match → surface to Uncertain ("not in contacts; provide
  email?")

**Score slots** (from 1e, if person flow):
- Mark slots that match APPEND-defined preferred windows
- Mark slots that fit between user's existing calendar (from 1d)
- Note any "back-to-back" risks (slot immediately after another
  meeting)

**Block-time flow**: validate the time spec; if ambiguous (no
specific time mentioned), surface to Uncertain.

### Step 3 — Compose curated view (Engage 1)

#### Meeting flow output

```markdown
## Schedule — Resolved

**With**: Sarah Chen (sarah@example.com) — last met 12d ago
**Time window**: tomorrow + 2 days (Wed–Fri)
**Duration**: 30 min
**Type**: 1:1

## Candidate slots (your pick)

| # | When | Why |
|---|------|-----|
| 1 | Wed Feb 26 · 2:00 PM CT | matches your preferred 1:1 window (APPEND) |
| 2 | Thu Feb 27 · 10:00 AM CT | fits before Sarah's standing 11am block |
| 3 | Thu Feb 27 · 1:00 PM CT | first mutual availability post-lunch |

## Uncertain — your call

- [ ] No slot matches your preference (1:1s before noon). **Take #1 (2pm CT), or extend the window to next week?**

## Proposed actions (after you pick a slot)

[1] calendar.create_event title="1:1 with Sarah" attendees=[sarah@example.com] when=<picked> duration=30m
[2] slack.send_dm to @sarah: "Calendar invite for our 1:1 incoming — see you <picked>"  (APPEND-gated)
[3] meeting-prep skill (chained) — prep context for the new meeting

Which slot? (e.g., "1" or "1 with description=Glance review")
```

#### Block-time flow output (single engage)

```markdown
## Block — Ready to create

**Title**: Focus Time
**When**: tomorrow · 9:00 AM CT
**Duration**: 2 hours

## Proposed action

[1] calendar.create_event title="Focus Time" when="2026-02-27T09:00" duration=120m

Approve? ("yes" / "edit when=...")
```

**Reason-label rules** (Pattern 2): ≤12 words, in "Why" column.
Skill-specific:
- **Preferred-window match** — `matches your preferred <type> window (APPEND)`
- **Sender-window fit** — `fits before sender's standing <block>`
- **First-available** — `first mutual availability post-<time>`
- **No-match** — `outside your preferred window; explicit override needed`

**Uncertain-tier rule (Phase 3.5 C2 convention)** — surface to
Uncertain when ambiguous. Three explicit defer-category examples:

- **"needs verification"** — multiple people match the name; agent
  isn't sure which the user meant.
- **"interesting future"** — slot exists but outside the user's
  preferred window; agent asks before booking.
- **"covered elsewhere"** — request might overlap an existing
  recurring meeting (e.g., "1:1 with Sarah" when there's already a
  weekly 1:1); agent asks before adding.

### Step 4 — Persist curated view + engage user (Engage 1)

Write the full Step-3 output verbatim to
`now/archive/schedule-meeting/schedule-meeting-{slug}.md` where
`{slug}` is the person slug + ISO date (or "focus-time-<date>" for
block flow).

```bash
mkdir -p now/archive/schedule-meeting
cat > "now/archive/schedule-meeting/schedule-meeting-{slug}-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-3 curated view, including all sections}
EOF
```

After persisting, send the curated view as a single message. Wait
for user response.

Acceptable responses:
- `1` / `2` / `3` → pick that slot
- `1 with description="..."` → edit and execute
- `none` / `cancel` → drop
- `extend to next week` → re-run availability with broader window

If invalid response (e.g., "tomorrow at 2pm but on Sarah's calendar
not mine"), re-prompt up to 2 times then offer to start over.

### Step 5 — Create event + Engage 2 (follow-up)

Execute the create:

```bash
arete calendar create --title "<title>" --with <email> \
  --start "<ISO time>" --duration <minutes> --json
```

Then surface the follow-up engage:

```markdown
✅ Booked: 1:1 with Sarah
   📅 Wed, Feb 26 · 2:00 PM CT (30 min)
   📧 Invite sent to sarah@example.com
   🔗 <calendar link>

## Proposed follow-ups

[1] meeting-prep — build context + agenda for the new meeting
[2] slack.send_dm to @sarah: "Calendar invite for our 1:1 is in your inbox — see you Wed"  (APPEND-gated)
[3] (draft) jira.create_ticket project=GLANCE type=Meeting summary="1:1 prep notes — Sarah Chen Feb 26"

Want any of these? (e.g., "1" or "1, 2")
```

If the user picks meeting-prep, hand off to the meeting-prep skill
with the new meeting context.

### Step 6 — Execute approved follow-ups

After approval (and only after), execute the chosen actions:
- `meeting-prep` → invoke the skill with the new meeting context
- `slack.send_dm` → MCP call with the prepared message
- Draft-only verbs → format and confirm acknowledgment; do not
  execute

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `calendar.create_event` | executable | After user picks a slot (or for block-time) |
| `slack.send_dm` | executable | APPEND-gated FYI to attendee about incoming invite |
| `meeting-prep` (skill chain) | n/a | User wants prep context for the newly booked meeting |
| `jira.create_ticket` | draft-only | Meeting-prep wants a ticket for the agenda |

User extends or restricts via `.arete/skills-local/schedule-meeting.md`.

## Examples

### Example 1: Simple meeting

**User**: "1:1 with Sarah tomorrow"

**Agent**: parses → resolves → finds availability → composes
Step-3 curated view → engages once with 2-3 candidate slots +
reason labels + proposed `calendar.create_event` action.

**User**: "1"

**Agent**: creates event → engages once with confirm + proposed
follow-ups (meeting-prep / FYI DM / draft ticket).

### Example 2: Block time

**User**: "Block 2 hours for focus time tomorrow morning"

**Agent**: parses → no person → block flow → engages once with
proposed `calendar.create_event` action.

**User**: "yes"

**Agent**: creates the event. Done.

### Example 3: Ambiguous person

**User**: "Schedule with Sarah"

**Agent**: parses → resolves (multiple matches) → composes
Step-3 with the Uncertain tier surfacing: "Sarah Chen or Sarah
Miller?" → engages once with disambiguation.

## Error Handling

| Scenario | Response |
|----------|----------|
| Person not found | Surface to Uncertain — ask for email |
| No availability | Curated view notes "no mutual availability in <window>"; offer to extend |
| Calendar not configured | "Calendar not configured. Run: arete integration configure google-calendar" |
| API error during create | Show error, offer to retry; do not silently abandon the booking |
| Invalid slot selection | Re-prompt twice, then offer to start over |

## Files this skill touches

- **Reads**: `arete resolve`, `arete pull calendar`,
  `arete availability find`, `resources/meetings/` (recent context),
  `people/<slug>.md` (for stance/preferences).
- **Writes (after user approval)**: calendar event via
  `arete calendar create`,
  `now/archive/schedule-meeting/schedule-meeting-{slug}-YYYY-MM-DD.md`
  (curated-view persistence), optional MCP actions per user.
- **APPEND**: `.arete/skills-local/schedule-meeting.md`.

## References

- **Patterns**: [PATTERNS.md](../PATTERNS.md) — chef-orchestrator
  patterns 1–4. The week-plan-style two-engage variant of Pattern 1
  is documented in PATTERNS.md.
- **CLI**: `arete resolve`, `arete pull calendar`,
  `arete availability find`, `arete calendar create`.
- **Related skills**: [meeting-prep](../meeting-prep/SKILL.md)
  (chain after create), [week-plan](../week-plan/SKILL.md)
  (longer-horizon planning where this skill's outputs land).

## Rollback

```bash
git log --oneline -- packages/runtime/skills/schedule-meeting/
git revert <commit-hash>
```

MC5 sunset applies — no `SKILL.legacy.md` ships.
