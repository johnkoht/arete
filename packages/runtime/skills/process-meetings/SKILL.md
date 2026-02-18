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
---

# Process Meetings Skill

Read meeting files from `resources/meetings/`, create or update person files from attendees (entity resolution), write `attendee_ids` to meeting frontmatter, and extract decisions and learnings for user review and memory using the **extract_decisions_learnings** pattern.

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

### 4. Extract Decisions and Learnings

Use the **extract_decisions_learnings** pattern — see [PATTERNS.md](../PATTERNS.md). Scan "## Decisions Made" and "## Summary" / "## Key Points" for candidates; present for inline review (approve / edit / skip); write approved items to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md` per the formats in PATTERNS.md.

### 5. Refresh Person Memory Highlights

Use the **refresh_person_memory** pattern — see [PATTERNS.md](../PATTERNS.md). Refresh recurring asks/concerns for attendees so person files include quick-access memory highlights.

### 6. Summary

Report: meetings processed, people created/updated, decisions and learnings added, person memory highlights refreshed.

## Arguments (Documented)

- `today` — process only today's meetings
- `"search term"` — filter meetings by title or attendee
- `--days-back=N` — last N days (default 7)
- `--people-only` — skip decisions/learnings extraction
- `--no-people` — skip people propagation; only extract decisions/learnings
- `--no-person-memory` — skip person memory highlight refresh

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — extract_decisions_learnings, refresh_person_memory
- **People**: `people/{internal|customers|users}/`, `arete people list`, `arete people index`
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `company`, `pillar`)
