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
integration:
  outputs:
    - type: resource
      path: "resources/meetings/{name}.md"
      index: true
---

# Process Meetings Skill

Read meeting files from `resources/meetings/`, create or update person files from attendees (entity resolution), write `attendee_ids` to meeting frontmatter, and extract action items, decisions, and learnings.

**Default behavior (staged mode)**: Writes extracted action items, decisions, and learnings as staged sections directly into the meeting file for review. Does NOT write to memory.

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

### 1. Gather Context

- List meeting files in `resources/meetings/`: default last 7 days (by filename `YYYY-MM-DD-*.md`). Support: `today`, `"search term"`, `--days-back=N`.
- Build attendee candidate JSON from selected meeting(s): name/email/text/source.
- Run People Intelligence digest:
  - `arete people intelligence digest --input inputs/people-candidates.json --json`
  - Optionally use `--feature-extraction-tuning` and `--feature-enrichment`.
- Use legacy `internal_email_domain` only as a fallback signal (not as forced default).

**Legacy meetings** (no YAML frontmatter): Parse title from first `#` heading, date from filename, attendees from body ("**Attendees**: ..." or "Attendees: ...").

### 2. For Each Meeting — People (Entity Resolution)

Parse frontmatter and body (title, date, attendees, company, summary).

**For each attendee** (from frontmatter `attendees` or body):

- Resolve slug: lowercase, replace spaces with hyphens, strip non-alphanumeric.
- Use People Intelligence digest recommendation as primary category decision:
  - `internal` → `people/internal/`
  - `customers` → `people/customers/`
  - `users` → `people/users/`
  - `unknown_queue` → do not auto-file as customer; ask user to confirm or defer
- Create `people/<category>/<slug>.md` only for confirmed categories.
- For `unknown_queue`, present a review batch (name, confidence, rationale, evidence).
- Update existing people: append "Last met: YYYY-MM-DD" or add to "Recent meetings".

### 3. Write attendee_ids to Meeting Frontmatter

After resolving people, add or update meeting frontmatter with `attendee_ids: [slug1, slug2]`. For legacy files, prepend YAML frontmatter and preserve body.

### 4. Extract Action Items, Decisions, and Learnings

Behavior depends on whether `--commit` is passed.

---

#### Staged Output Mode (Default — no `--commit`)

Extract action items, decisions, and learnings from the meeting body and write them as staged sections directly into the meeting file. Do **not** write to `.arete/memory/items/`.

**What to extract**:

- **Action items** (`ai_NNN`): Scan for `- [ ]` checkboxes, phrases like "will follow up", "action:", "next steps:", "will send", "to do:", items explicitly assigned to a person. These become `ai_NNN` items.
- **Decisions** (`de_NNN`): Choices made during the meeting that affect direction, priority, or scope. "We decided...", "The team agreed...", "Priority is X." These become `de_NNN` items.
- **Learnings** (`le_NNN`): Insights, realizations, and new understanding gained. "We learned...", "Turns out...", "Key insight:". These become `le_NNN` items.

**ID format**: Sequential within the meeting, zero-padded to 3 digits. Count each type independently: action items start at `ai_001`, decisions start at `de_001`, learnings start at `le_001`.

**Output format** (append to meeting file — the parser requires this exact format):

```
## Staged Action Items
- ai_001: Follow up with Sarah on the pricing model
- ai_002: Share Q1 roadmap with stakeholders by Friday

## Staged Decisions
- de_001: Prioritize enterprise tier before SMB in Q1

## Staged Learnings
- le_001: Enterprise customers care more about audit logs than anticipated
```

Section headers must be exactly:
- `## Staged Action Items`
- `## Staged Decisions`
- `## Staged Learnings`

Omit a section entirely if no items were extracted for that type (do not write an empty section).

**Frontmatter updates** (write to the meeting file's frontmatter after staged sections are written):

```yaml
status: processed
processed_at: "2026-03-04T18:30:00Z"
```

---

#### Commit Mode (`--commit`)

Use the **extract_decisions_learnings** pattern — see [PATTERNS.md](../PATTERNS.md). Scan "## Decisions Made" and "## Summary" / "## Key Points" for candidates; present for inline review (approve / edit / skip); write approved items to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md` per the formats in PATTERNS.md.

Do **not** write staged sections to the meeting file in this mode.

---

### 5. Refresh Person Memory Highlights

Use the **refresh_person_memory** pattern — see [PATTERNS.md](../PATTERNS.md). Refresh recurring asks/concerns for attendees so person files include quick-access memory highlights.

### 5.5. Refresh Person Intelligence Memory

**Ordering dependency** — this step MUST run after steps 2–3 complete:
1. Create/update person files (step 2)
2. Write `attendee_ids` to meeting frontmatter (step 3)
3. **Then** refresh person intelligence memory

For each attendee processed, refresh their auto-memory (stances, open items, relationship health):

```bash
arete people memory refresh --person <slug>
```

This updates the enriched intelligence sections that meeting-prep and other skills consume via `arete people show <slug> --memory`.

**CommitmentsService producer path**: `arete people memory refresh` is also the path that syncs extracted commitments (action items) to CommitmentsService. Running this command after processing meetings ensures that any commitments found in meeting notes are available via `arete commitments list`. This is the canonical producer path — CommitmentsService is populated through `process-meetings` → `arete people memory refresh --person <slug>`.

### 6. Summary

Report: meetings processed, people created/updated, staged sections written (or decisions/learnings committed to memory in `--commit` mode), person memory highlights refreshed.

Include per-attendee intelligence summary:

```
Sarah: 2 stances, 1 action item
Mike: 1 stance, 0 action items
```

In staged mode, also report counts:

```
Staged: 3 action items (ai_001–ai_003), 1 decision (de_001), 2 learnings (le_001–le_002)
```

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — extract_decisions_learnings, refresh_person_memory
- **People**: `people/{internal|customers|users}/`, `arete people list`, `arete people index`
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `status`, `processed_at`, `company`, `pillar`)
