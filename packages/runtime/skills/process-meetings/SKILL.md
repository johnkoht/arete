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

### 4. Generate Summary

Generate a concise 2-4 sentence summary of the meeting based on the transcript and any existing key points or highlights.

**Summary guidelines**:
- Focus on the main topics discussed and outcomes
- Mention key decisions made (if any)
- Note important action items or next steps
- Keep it scannable — someone should understand the meeting's value in 10 seconds

**Output**: Replace the `## Summary` section content in the meeting body. If the section contains placeholder text like "No summary available." or is empty, replace it entirely.

Example:
```markdown
## Summary

Discussed Q1 roadmap priorities with the product team. Agreed to prioritize enterprise tier features before SMB expansion. Key blocker identified: audit logging needs to ship first. Sarah will share updated timeline by Friday.
```

### 5. Extract Action Items, Decisions, and Learnings

Behavior depends on whether `--commit` is passed.

---

#### Extraction Path Decision

The primary extraction path uses the CLI command, which delegates to core's unified extraction logic:

1. **Try CLI extraction**: `arete meeting extract <file> --stage --json`
2. **If success** → staged sections written to meeting file, proceed to Step 6
3. **If error** (no AI configured) → agent fallback: extract inline using agent's LLM

**CLI errors clearly when AI is not configured**:
```json
{
  "success": false,
  "error": "No AI provider configured. Run `arete credentials configure` or set up via arete.yaml."
}
```

When this error occurs, the agent has LLM access (it's running in an AI context) and should perform extraction inline using the rules below.

---

#### Staged Output Mode (Default — no `--commit`)

Extract action items, decisions, and learnings from the meeting body and write them as staged sections directly into the meeting file. Do **not** write to `.arete/memory/items/`.

**CLI Path (preferred)**: Run `arete meeting extract <file> --stage` — handles extraction and formatting via core.

**Agent Fallback Path**: If CLI errors (no AI configured), extract inline following the rules below.

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

Read the meeting file and extract intelligence **directly** (you have LLM access):

**If meeting has linked agenda** (check frontmatter for `agenda: <path>`):
1. Read the agenda file
2. Extract unchecked items using the agenda utility
3. These will be merged into Action Items with `*(from agenda)*` suffix

**Extract these sections from the transcript:**

1. **Action Items** — Commitments with clear owner and deliverable
2. **Next Steps** — Non-commitment follow-ups (e.g., "reconvene Thursday")
3. **Decisions** — Key decisions made, with timestamps if available
4. **Learnings** — Insights worth remembering

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

Do **not** write staged sections to the meeting file in this mode.

**User Review (commit mode)**: Present each extracted section using the Approve / Edit / Skip pattern (see [PATTERNS.md](../PATTERNS.md) § extract_decisions_learnings for UX reference):

1. **Action Items** — Present list → Approve all / Edit / Skip
2. **Next Steps** — Present list → Approve all / Edit / Skip
3. **Decisions** — Present list → Approve all / Edit / Skip
4. **Learnings** — Present list → Approve all / Edit / Skip

**Save to Meeting File (commit mode)**: Update the meeting file with approved sections. Preserve the collapsed recorder notes structure. Action Items include both extracted items AND merged agenda items. Action item format (REQUIRED for parsing):

```
- [ ] {Description} (@{owner-slug} → @{counterparty-slug})
```

**Assemble Context Bundle**: Use the **context_bundle_assembly** pattern — see [PATTERNS.md](../PATTERNS.md) — to assemble the structured context bundle for the Significance Analyst.

**Topic derivation**: Combine the meeting title with the first 100 characters of the approved Summary from Step 4. Example: `"Product Review — Discussed API-first priorities and JWT auth decision for Q2..."`.

**Gather these context sections**:
1. **Strategy & goals** — `arete search "<topic>" --scope context` (top 3 results, max 300 words each)
2. **Existing memory** — `arete search "<topic>" --scope memory` (top 5 results, max 200 words each)
3. **People context** — For each attendee: stances, open items, and relationship health only (from `arete people show <slug> --memory`)

**Reuse rule**: If `arete people show <slug> --memory` was already run for attendees earlier in this skill run, reuse that output — do **not** re-run `arete people show`.

If 2 or more context sections return empty results, prepend a sparse-context warning:
> ⚠️ Sparse context — weight raw meeting content more heavily. Available context: [list non-empty sections].

**Extract Decisions and Learnings (to Memory)**: Use the **significance_analyst** pattern — see [PATTERNS.md](../PATTERNS.md) — with the context bundle as input. Identify what is significant enough to persist in workspace memory. Present ranked candidates for approval; write approved items to `.arete/memory/items/decisions.md` or `.arete/memory/items/learnings.md`. Never write to memory without user approval.

---

### 6. Refresh Person Memory Highlights

Use the **refresh_person_memory** pattern — see [PATTERNS.md](../PATTERNS.md). Refresh recurring asks/concerns for attendees so person files include quick-access memory highlights.

### 6.5. Refresh Person Intelligence Memory

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

### 7. Report

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

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — extract_decisions_learnings, refresh_person_memory, context_bundle_assembly, significance_analyst
- **Extraction**: `arete meeting extract <file> --stage` — primary extraction path (uses core via AIService)
- **People**: `people/{internal|customers|users}/`, `arete people list`, `arete people index`
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `status`, `processed_at`, `company`, `pillar`)
