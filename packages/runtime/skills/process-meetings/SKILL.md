---
name: process-meetings
description: Process meeting notes into people and memory. Use when the user wants to update people from meetings, extract decisions and learnings, or propagate meeting content.
primitives:
  - User
  - Risk
work_type: operations
category: essential
intelligence:
  - entity_resolution
  - synthesis
  - memory_retrieval
  - area_context
integration:
  outputs:
    - type: resource
      path: "resources/meetings/{name}.md"
      index: true
---

# Process Meetings Skill

Read meeting files from `resources/meetings/`, extract intelligence using CLI primitives, and stage items for review. Uses the **get_area_context** pattern for mapping meetings to areas and routing extracted intelligence to area files.

**Default behavior (staged mode)**: Writes extracted action items, decisions, and learnings as staged sections directly into the meeting file for review. Does NOT write to memory until approved.

**With `--commit`**: Writes extracted items directly to `.arete/memory/items/` (legacy behavior). Use only for CLI-only workflows without the arete view web app.

> **Note for arete view users**: When the web app (arete view) triggers processing, staged mode is the default — the web app provides the review UI. Use `--commit` only when running process-meetings from the CLI without the web app.

## When to Use

- "Process my meetings"
- "Update people from meetings"
- "Extract decisions from my meetings"
- After syncing or saving new meetings
- "Propagate meeting content"

## Configuration

### Legacy fallback (still supported)

`internal_email_domain` can still be set in `arete.yaml` (workspace root) or `~/.arete/config.yaml`:

```yaml
internal_email_domain: "acme.com"
```

### Preferred path (People Intelligence)

Use People Intelligence digest for uncertainty-safe classification:

- Build attendee candidates from meeting files
- Run `arete people intelligence digest --input <path> --json`
- Respect `unknown_queue` for low-confidence candidates (do **not** force customer)

Optional policy file:
- `context/people-intelligence-policy.json`

## Arguments

- `--file <path>` — Path to meeting file (required)
- `--commit` — Write extracted items directly to memory (legacy behavior). Use only for CLI-only workflows without the arete view web app.
- `--json` — Output result as JSON (used by process-people endpoint)
- `today` — process only today's meetings
- `"search term"` — filter meetings by title or attendee
- `--days-back=N` — last N days (default 7)
- `--people-only` — skip decisions/learnings extraction
- `--no-people` — skip people propagation; only extract decisions/learnings
- `--no-person-memory` — skip person memory highlight refresh

## Workflow

### 1. Gather Meetings

List meeting files in `resources/meetings/`: default last 7 days (by filename `YYYY-MM-DD-*.md`).

Filtering options:
- `today` — only today's meetings
- `"search term"` — filter by title or attendee
- `--days-back=N` — last N days

**Legacy meetings** (no YAML frontmatter): Parse title from first `#` heading, date from filename, attendees from body ("**Attendees**: ..." or "Attendees: ...").

### 2. For Each Meeting — Build Context

Run the context primitive to assemble meeting context:

```bash
arete meeting context <file> --json
```

This assembles:
- Meeting metadata (title, date, attendees, transcript)
- Linked agenda (if exists via frontmatter `agenda:` field)
- Attendee profiles with stances, open items, relationship health
- Related workspace context (goals, projects, recent decisions)

**Output**: JSON context bundle with `meeting`, `agenda`, `attendees`, `unknownAttendees`, `relatedContext`, and `warnings` fields.

**Flags**:
- `--json` — output as JSON (required for piping)
- `--skip-agenda` — don't look for linked agenda
- `--skip-people` — don't resolve attendee context

### 2b. For Each Meeting — Map to Area

Use the **get_area_context** pattern (see [PATTERNS.md](../PATTERNS.md)) to identify which area this meeting belongs to:

1. **For recurring meetings** — Call `AreaParserService.getAreaForMeeting(meetingTitle)`:
   - Uses case-insensitive substring matching against `recurring_meetings[].title` in area files
   - Returns `AreaMatch | null`: `{ areaSlug: string; matchType: 'recurring'; confidence: 1.0 }`
   - Auto-map when match found — no user confirmation needed

2. **For one-off meetings** (no recurring match) — Infer from attendees + content:
   - Check if any attendees are associated with an area (via area file `attendees[]` or prior meeting history)
   - Analyze meeting title and content for area keywords
   - If match found with confidence ≥ 0.7: auto-map to area
   - If match found with confidence < 0.7: present to user for confirmation:
     ```
     This meeting appears related to [Area Name] (confidence: 0.X).
     Map to this area? [Y/n]
     ```
   - If no match: proceed without area association

3. **Store area association** — When area is determined:
   - Add `area: <slug>` to meeting frontmatter (or context bundle)
   - This will be used for:
     - Routing decisions to area's Key Decisions section
     - Tagging commitments with area

**Example**: Meeting "CoverWhale Sync" → matches `areas/glance-communications.md` → area = "glance-communications"

### 3. For Each Meeting — Extract Intelligence

Pipe the context bundle into extraction:

```bash
arete meeting context <file> --json | arete meeting extract <file> --context - --json
```

Or as separate steps:

```bash
arete meeting context <file> --json > /tmp/context.json
arete meeting extract <file> --context /tmp/context.json --json
```

**What gets extracted**:
- **Summary** — 2-4 sentence overview of the meeting
- **Action Items** — Commitments with owner and deliverable (tagged with area when meeting is mapped)
- **Decisions** — Key choices made during the meeting (routed to area file on approval)
- **Learnings** — Insights worth remembering
- **Next Steps** — Non-commitment follow-ups

The extract command uses the context bundle for smarter extraction:
- Priority ranking based on goals/projects
- Better owner resolution (knows internal vs external)
- Agenda item merging (unchecked items become action items)
- Dedup against existing commitments (scoped by area first when area is available)
- Area tagging for commitments when meeting has area association

**Flags**:
- `--context <file>` — context bundle JSON (use `-` for stdin)
- `--json` — output as JSON
- `--stage` — write staged sections directly to meeting file

### 4. For Each Meeting — Apply Intelligence

Write the extracted intelligence to the meeting file:

```bash
arete meeting context <file> --json \
  | arete meeting extract <file> --context - --json \
  | arete meeting apply <file> --intelligence -
```

**What gets written**:
- Staged sections in meeting body (`## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings`)
- Meeting frontmatter updates (`status: processed`, `processed_at`)
- Linked agenda archived (`status: processed` in agenda frontmatter)

**What does NOT happen yet**:
- No updates to person files (happens after approval)
- No commitments synced (happens after approval)
- No memory writes (happens after approval)

**Flags**:
- `--intelligence <file>` — intelligence JSON (use `-` for stdin)
- `--skip-agenda` — don't archive linked agenda
- `--clear` — clear existing staged sections before writing

### 5. User Review

User reviews staged sections in one of two ways:

**Option A: Web App (recommended)**

```bash
arete view
```

The web app provides a review UI where users can:
- See all staged items across meetings
- Approve / edit / skip individual items
- Batch approve meetings

**Option B: CLI Review**

User opens the meeting file directly and reviews the `## Staged Action Items`, `## Staged Decisions`, and `## Staged Learnings` sections.

### 6. After Approval — Commit to Memory

When user approves items (via web app or CLI):

```bash
arete meeting approve <slug>
```

This commits approved decisions and learnings to `.arete/memory/items/`.

**Area-based decision routing**: When the meeting has an area association (from Step 2b):

1. **Write to area file** — For each approved decision, append to the area's `## Key Decisions` section:
   ```markdown
   - YYYY-MM-DD: [Decision description]
   ```
   Where `YYYY-MM-DD` is the meeting date and the description is a concise summary.

2. **Also write to memory** — Decisions are still written to `.arete/memory/items/decisions.md` for global search. The area file entry provides quick access when prepping for related meetings.

3. **Example**: After approving a decision from "CoverWhale Sync":
   - Append to `areas/glance-communications.md` under `## Key Decisions`:
     ```markdown
     - 2026-03-25: Use REST API instead of GraphQL for partner integration
     ```
   - Also write full decision format to `.arete/memory/items/decisions.md`

**Commitment area tagging**: When syncing commitments (Step 7), the area field is preserved:
- Commitments extracted from area-mapped meetings include `area: <slug>`
- Enables `arete commitments list --area <slug>` filtering
- Dedup checks scope to area first for better conflict resolution

### 7. Refresh Person Memory

For each attendee processed:

```bash
arete people memory refresh --person <slug>
```

This updates:
- Person file with enriched intelligence (stances, open items, relationship health)
- Commitments service with extracted action items

**Ordering dependency**: This step MUST run after meeting approval completes. The `people memory refresh` command is the canonical path for syncing commitments — running it after processing ensures action items from meetings are available via `arete commitments list`.

### 8. Archive Linked Agendas

The `arete meeting apply` command automatically archives linked agendas:

1. Checks meeting frontmatter for `agenda: <path>` field
2. If agenda exists, updates its frontmatter: `status: processed`, `processed_at: YYYY-MM-DD`
3. Agenda stays in `now/agendas/` — no file movement

If the agenda file doesn't exist or is already processed, it logs a warning and continues.

### 9. Report Results

Report: meetings processed, items staged, area associations, and status.

**Example output**:

```
Processed 2 meetings:
- 2026-03-19-product-sync.md: 3 action items, 1 decision, 2 learnings → area: glance-communications
- 2026-03-19-customer-call.md: 2 action items, 0 decisions, 1 learning → area: (none)

Per-attendee summary:
- Sarah: 2 stances, 1 action item
- Mike: 1 stance, 0 action items

Staged: 5 action items (ai_001–ai_005), 1 decision (de_001), 3 learnings (le_001–le_003)
Archived 1 agenda
```

After approval, report memory updates:

```
Approved: 1 decision, 2 learnings committed to memory
Decision routed to: areas/glance-communications.md (Key Decisions)
Refreshed person memory: sarah-smith, mike-jones
Commitments tagged: 3 with area "glance-communications"
```

### 10. Handle Unknown Attendees

After processing completes, check if any attendees couldn't be resolved.

The context bundle includes an `unknownAttendees` array:

```json
{
  "unknownAttendees": [
    { "email": "jane.doe@external.com", "name": "Jane Doe" },
    { "email": "bob@vendor.co", "name": "Bob Smith" }
  ]
}
```

**If unknown attendees exist**, offer to add them conversationally:

```
I found 2 attendees that aren't tracked yet:

1. Jane Doe (jane.doe@external.com)
2. Bob Smith (bob@vendor.co)

Would you like me to add any of them? I can create person files in:
- people/customers/ — for customer contacts
- people/users/ — for user community members
- people/internal/ — for team members

Just tell me which category for each, or "skip" to ignore.
```

**Do not auto-file unknown attendees** — always ask the user to confirm the category. This prevents incorrectly categorizing people based on assumptions.

---

## Complete Pipeline Example

For processing a single meeting with full pipeline:

```bash
# 1. Build context
arete meeting context resources/meetings/2026-03-19-product-sync.md --json > /tmp/context.json

# 2. Extract intelligence with context
arete meeting extract resources/meetings/2026-03-19-product-sync.md \
  --context /tmp/context.json --json > /tmp/intelligence.json

# 3. Apply to meeting file (writes staged sections + archives agenda)
arete meeting apply resources/meetings/2026-03-19-product-sync.md \
  --intelligence /tmp/intelligence.json

# 4. User reviews in web app
arete view

# 5. After approval — commit to memory
arete meeting approve 2026-03-19-product-sync

# 6. Refresh person memory for attendees
arete people memory refresh --person sarah-smith
arete people memory refresh --person mike-jones
```

Or as a single piped command (steps 1-3):

```bash
arete meeting context <file> --json \
  | arete meeting extract <file> --context - --json \
  | arete meeting apply <file> --intelligence -
```

---

## Legacy Mode (`--commit`)

When `--commit` is passed, skip staged mode and write directly to memory.

**Workflow differences**:
1. Extract intelligence as normal (steps 2-3)
2. Skip staged sections — write directly to meeting file
3. Present each extracted section for user approval using Approve / Edit / Skip pattern
4. Write approved items directly to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md`
5. Refresh person memory immediately

Use `--commit` only when:
- Running from CLI without web app
- Immediate memory write is needed
- User prefers inline approval over staged review

---

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_area_context, extract_decisions_learnings, refresh_person_memory, context_bundle_assembly, significance_analyst
- **CLI Primitives**:
  - `arete meeting context <file> --json` — assemble context bundle
  - `arete meeting extract <file> --context - --json` — extract intelligence
  - `arete meeting apply <file> --intelligence -` — write staged sections
  - `arete meeting approve <slug>` — commit to memory
  - `arete people memory refresh --person <slug>` — refresh person highlights
  - `arete commitments list --area <slug>` — filter commitments by area
- **People**: `people/{internal|customers|users}/`, `arete people list`, `arete people index`
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `status`, `processed_at`, `company`, `pillar`, `area`)
- **Areas**: `areas/*.md` (recurring meeting mappings, Key Decisions section for decision routing)
- **Related**: meeting-prep, daily-plan (both use get_area_context for area enrichment)
