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

### 4. Extract Meeting Intelligence

Read the meeting file and extract intelligence **directly** (you have LLM access):

**If meeting has linked agenda** (check frontmatter for `agenda: <path>`):
1. Read the agenda file
2. Extract unchecked items using the agenda utility
3. These will be merged into Action Items with `*(from agenda)*` suffix

**Extract these sections from the transcript:**

1. **Summary** — 2-3 paragraph summary of the meeting
2. **Action Items** — Commitments with clear owner and deliverable
3. **Next Steps** — Non-commitment follow-ups (e.g., "reconvene Thursday")
4. **Decisions** — Key decisions made, with timestamps if available
5. **Learnings** — Insights worth remembering

**Action item extraction rules:**
- Must have a clear owner and specific deliverable
- Reject vague statements ("look into that thing")
- Reject descriptions of systems/architecture
- Keep under 150 characters
- Include timestamp reference if available (e.g., `{{12:34}}`)

**Agenda item merge rules:**
- Add unchecked agenda items to Action Items section
- Mark with `*(from agenda)*` suffix
- If no clear owner in agenda text, use generic format without @ mentions

**Example good action items:**
- "John to send API docs to Sarah by Friday"
- "Sarah to review the pricing proposal and provide feedback"
- "Review Q2 roadmap *(from agenda)*"

**Example bad (reject):**
- "Me: Yeah, I'll look into that thing we talked about..."
- "So the way the system works is you first click on..."

### 5. User Review (Extraction)

Present each extracted section for review using the Approve / Edit / Skip pattern (see [PATTERNS.md](../PATTERNS.md) § extract_decisions_learnings for UX reference):

1. **Summary** — Present → Approve / Edit / Skip
2. **Action Items** — Present list → Approve all / Edit / Skip
3. **Next Steps** — Present list → Approve all / Edit / Skip
4. **Decisions** — Present list → Approve all / Edit / Skip
5. **Learnings** — Present list → Approve all / Edit / Skip

### 6. Save to Meeting File

Update the meeting file with approved sections. Preserve the collapsed recorder notes structure:

```markdown
## Summary

{Areté-generated summary replaces the placeholder}

## Action Items

- [ ] John to send API docs to Sarah by Friday (@john-smith → @sarah-chen)
- [ ] Sarah to review the proposal (@sarah-chen → @john-smith)
- [ ] Review Q2 roadmap *(from agenda)*

## Next Steps

- Reconvene Thursday to finalize roadmap
- Sarah to loop in her tech lead async

## Decisions

- Approved Q2 roadmap scope focusing on API-first {{12:34}}
- Decided to prioritize Auto LOB for MVP {{06:06}}

## Learnings

- Policy integrations are a key differentiator for reducing adjuster errors
- Quick UX wins need to be weighed against upcoming AI changes

<details>
<summary>Recorder Notes</summary>

### Original Summary

{recorder summary preserved}

### Key Points

{key points from recorder}

</details>

## Transcript

{full transcript}
```

**Structure requirements:**
- Areté-generated Summary replaces the initial Summary placeholder
- Action Items include both extracted items AND merged agenda items
- Recorder notes remain collapsed in `<details>` block
- Areté intelligence (Summary, Action Items, Decisions, Learnings) is primary

**Action item format (REQUIRED for parsing)**:
```
- [ ] {Description} (@{owner-slug} → @{counterparty-slug})
```

- Use markdown checkbox `- [ ]`
- Include owner slug after `@`
- Use `→` (or `->`) to indicate direction
- Counterparty is optional: `- [ ] Check out Linear (@john-koht)` is valid

**Direction encoding**: `@owner → @counterparty` — the arrow points FROM the person who owes TO the person they owe. Example: `@john → @sarah` means John owes Sarah something.

### 7. Extract Decisions and Learnings (to Memory)

Use the **extract_decisions_learnings** pattern — see [PATTERNS.md](../PATTERNS.md). This step extracts decisions and learnings to **workspace memory** (`.arete/memory/items/`), complementing step 6 which saves to the **meeting file**. Scan "## Decisions Made" and "## Summary" / "## Key Points" for candidates; present for inline review (approve / edit / skip); write approved items to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md` per the formats in PATTERNS.md.

### 8. Refresh Person Memory Highlights

Use the **refresh_person_memory** pattern — see [PATTERNS.md](../PATTERNS.md). Refresh recurring asks/concerns for attendees so person files include quick-access memory highlights.

### 8.5. Refresh Person Intelligence Memory

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

### 9. Summary

Report: meetings processed, people created/updated, decisions and learnings added, person memory highlights refreshed.

Include per-attendee intelligence summary:

```
Sarah: 2 stances, 1 action item
Mike: 1 stance, 0 action items
```

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
