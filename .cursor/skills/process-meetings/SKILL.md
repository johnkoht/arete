---
name: process-meetings
description: Process meeting notes into people and memory. Use when the user wants to update people from meetings, extract decisions and learnings, or propagate meeting content.
---

# Process Meetings Skill

Read meeting files from `resources/meetings/`, create or update person files from attendees, write `attendee_ids` to meeting frontmatter, and extract decisions and learnings for user review and memory.

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

If absent, all attendees are classified as external (customers). Attendees whose email domain matches are placed in `people/internal/`; others go to `people/customers/`.

## Workflow

### 1. Gather Context

- Read `arete.yaml` or `~/.arete/config.yaml` for `internal_email_domain`. If absent, treat all attendees as external (customers).
- List meeting files in `resources/meetings/`:
  - Default: last 7 days (by filename `YYYY-MM-DD-*.md`)
  - Support arguments: `today` (only today), `"search term"` (filter by title/attendee), `--days-back=N` (last N days)

**Legacy meetings**: Handle meetings without YAML frontmatter (pre-enrichment). Parse:
- Title from first `#` heading
- Date from filename (`YYYY-MM-DD-title-slug.md`)
- Attendees from body (e.g. "**Attendees**: ..." or "Attendees: ..." line)

### 2. For Each Meeting

Parse frontmatter and body (title, date, attendees, company, decisions section, action items, summary).

**For each attendee** (from frontmatter `attendees` or body):

- Resolve slug using `slugifyPersonName(name)` (see `src/core/people.ts` or pattern: lowercase, replace spaces with hyphens, strip non-alphanumeric).
- Category: `people/internal/` if email domain matches `internal_email_domain`; else `people/customers/`.
- Create `people/<category>/<slug>.md` if missing. Frontmatter: `name`, `email`, `company` (from meeting if known).
- Update existing: append "Last met: YYYY-MM-DD" or add meeting to "Recent meetings" section if present.

### 3. Write attendee_ids to Meeting Frontmatter

After resolving people, add or update meeting file frontmatter with `attendee_ids: [slug1, slug2]`. For legacy files without frontmatter, prepend YAML frontmatter and preserve body.

### 4. Extract Decisions and Learnings

From "## Decisions Made" and "## Summary" / "## Key Points": propose candidate decisions and learnings. Present for inline review (approve / edit / skip) — same pattern as the sync skill's Synthesis Workflow.

**For approved items**:

- **Decisions** → Append to `memory/items/decisions.md`:
  ```markdown
  ### YYYY-MM-DD: [Decision Title]
  **Project**: [If applicable]
  **Context**: [What led to this decision]
  **Decision**: [What was decided]
  **Rationale**: [Why this choice]
  **Alternatives Considered**: [If known]
  **Status**: Active
  ```

- **Learnings** → Append to `memory/items/learnings.md`:
  ```markdown
  ### YYYY-MM-DD: [Learning Title]
  **Source**: [Meeting that surfaced this]
  **Insight**: [What was learned]
  **Implications**: [How this affects future work]
  **Applied To**: [Will be updated as used]
  ```

### 5. Summary

Report: meetings processed, people created/updated, decisions and learnings added.

## Arguments (Documented)

- `today` — process only today's meetings
- `"search term"` — filter meetings by title or attendee
- `--days-back=N` — process last N days (default 7)
- `--people-only` — skip decisions/learnings extraction
- `--no-people` — skip people propagation; only extract decisions/learnings

## Integration

- **People system**: `people/{internal|customers|users}/`, `arete people list`, `arete people index`
- **Sync skill**: Inline synthesis pattern for decisions/learnings (approve/edit/skip)
- **Meetings**: `resources/meetings/` with frontmatter (`attendee_ids`, `company`, `pillar`)
