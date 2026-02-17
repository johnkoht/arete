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

**Internal vs external classification**: Add `internal_email_domain` to `arete.yaml` (workspace root) or `~/.arete/config.yaml`:

```yaml
internal_email_domain: "acme.com"
```

If absent, all attendees are classified as external (customers). Attendees whose email domain matches go to `people/internal/`; others to `people/customers/`.

## Workflow

### 1. Gather Context

- Read `arete.yaml` or `~/.arete/config.yaml` for `internal_email_domain`. If absent, treat all attendees as external (customers).
- List meeting files in `resources/meetings/`: default last 7 days (by filename `YYYY-MM-DD-*.md`). Support: `today`, `"search term"`, `--days-back=N`.

**Legacy meetings** (no YAML frontmatter): Parse title from first `#` heading, date from filename, attendees from body ("**Attendees**: ..." or "Attendees: ...").

### 2. For Each Meeting — People (Entity Resolution)

Parse frontmatter and body (title, date, attendees, company, summary).

**For each attendee** (from frontmatter `attendees` or body):

- Resolve slug: lowercase, replace spaces with hyphens, strip non-alphanumeric (see `src/core/people.ts` slugifyPersonName).
- Category: `people/internal/` if email domain matches `internal_email_domain`; else `people/customers/`.
- Create `people/<category>/<slug>.md` if missing (frontmatter: name, email, company).
- Update existing: append "Last met: YYYY-MM-DD" or add to "Recent meetings".

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
