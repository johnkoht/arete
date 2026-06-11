# Intelligence Patterns (Shared)

These patterns are used by multiple Areté skills. When a skill says "use the get_meeting_context pattern" or "use the extract_decisions_learnings pattern", follow the steps below.

---

## Template Resolution

**Purpose**: Locate the correct template file for a skill, respecting user customization over skill defaults.

**Used by**: Any skill that loads a template before generating output (create-prd, prepare-meeting-agenda, discovery, competitive-analysis, construct-roadmap).

### Resolution — use the CLI, not manual path checking

Template resolution is handled by the CLI. Each skill's SKILL.md specifies the exact command. The general form is:

```
arete template resolve --skill {skill-id} --variant {variant}
```

Use the command output as the document structure. Do not add sections from elsewhere. The CLI checks the workspace override path first, falls back to the skill default — the agent does not make this decision.

**Workspace override path** (unified for all skills): `templates/outputs/{skill-id}/{variant}.md`
**Skill default path**: `.agents/skills/{skill-id}/templates/{variant}.md`

Where `{category}` matches the template group:

| Skill | Template type | Workspace override path | Variant(s) |
|-------|--------------|------------------------|------------|
| `create-prd` | PRD output | `templates/outputs/create-prd/` | `prd-simple`, `prd-regular`, `prd-full` |
| `create-prd` | Project README | `templates/projects/definition/` | `project` |
| `prepare-meeting-agenda` | Agenda | `templates/meeting-agendas/` | `customer`, `dev-team`, `leadership`, `one-on-one`, `other` |
| `discovery` | Project README | `templates/projects/discovery/` | `project` |
| `discovery` | Research inputs | `templates/inputs/` | `research-note`, `user-feedback` |
| `competitive-analysis` | Project README | `templates/projects/analysis/` | `project` |
| `construct-roadmap` | Project README | `templates/projects/roadmap/` | `project` |
| `construct-roadmap` | Roadmap output | `templates/outputs/construct-roadmap/` | `roadmap` |
| `week-plan` | Week file | `templates/plans/` | `week-priorities` |
| `quarter-plan` | Quarter file | `templates/plans/` | `quarter-goals` |

> **Template path convention**: User-tunable workflow skills use `templates/outputs/{skill-id}/` for workspace override paths. Older skills use descriptive paths (e.g. `templates/meeting-agendas/`, `templates/projects/`). Both conventions are supported. **New skills should use `templates/outputs/{skill-id}/`**.
>
> Integration ingest (krisp / fathom / notion / calendar / google-drive / gmail) is now handled by CLI verbs (`arete pull <integration>`), not skills; their output formats are owned by the integration code, not the templates system.

### How to customize a template

Drop a file at the workspace override path — no config, no reinstall:

```
# Custom PRD template
templates/outputs/create-prd/prd-simple.md

# Custom meeting agenda
templates/meeting-agendas/one-on-one.md

# Custom discovery project structure
templates/projects/discovery/project.md

# Custom week plan structure
templates/plans/week-priorities.md

# Custom roadmap output format
templates/outputs/construct-roadmap/roadmap.md
```

The skill will use your file automatically on its next run.

### For skills without multiple variants

Use `default.md` as the variant name:
```
templates/outputs/{skill-id}/default.md
```

---

## get_meeting_context

**Purpose**: Given a meeting (title and/or attendees), assemble full context: people, prior meetings, related projects, outstanding action items.

**Used by**: meeting-prep, prepare-meeting-agenda (for suggested agenda items; gather when meeting has specific purpose, named attendees, or relevant plan files—see skill step 4)

**Inputs**: Meeting title (optional), attendee names or slugs.

**Steps**:

1. **Resolve attendees** — Match names to people slugs (search `people/index.md` or `people/**/*.md` by name; or use slug directly). Optionally `qmd query "[attendee name] person"`.
2. **Read person files** — For each attendee: `people/{internal|customers|users}/{slug}.md`. Extract name, role, company, recent notes.
3. **Read person auto-memory** — For each resolved attendee, read enriched intelligence (stances, open items, relationship health) via `arete people show <slug> --memory`. Use these sections to populate stances, open items, and health in the prep brief.
4. **Search meetings** — Prefer scanning `resources/meetings/index.md` (table: Date | Title | Attendees | Recording | Topics). Match by Topics column or attendee names, then open the linked file(s). Alternatively list `resources/meetings/*.md` and filter by frontmatter `attendee_ids` or body/attendees; sort by date descending; take 1–3 most recent.
5. **Read projects** — Scan `projects/active/*/README.md` for `stakeholders` or body mentions of attendee names/slugs.
6. **Open Commitments**:
   - **Primary path**: Parse `## Action Items` section directly from recent meeting files for each attendee. Look for unchecked `- [ ]` items that mention the person (as owner or counterparty via `@owner-slug → @counterparty-slug` notation).
   - **Fallback**: Run `arete commitments list --person <slug>` when meetings lack structured sections (older meetings processed before the extraction workflow existed).
   - If both paths return empty, the person has no outstanding commitments.
7. **QMD (optional)** — `qmd query "decisions or learnings involving [attendee] or [company]"`, `qmd query "meetings or notes about [topic]"`. Incorporate into brief.

**Outputs**: Attendee details, recent meetings (1–3 with summary), related projects, outstanding action items, prep suggestions.

**Canonical source distinction**:
- For meeting-prep context (relationship brief): use `arete people show <slug> --memory` — includes commitments inline with full relationship context.
- For task-management view (week-plan, weekly-winddown): use `arete commitments list` — returns structured commitment data for review/resolution.
- Do NOT call both in the same step — they overlap on commitment data.

**Batch anti-degradation (prepare-meeting-agenda)**: When generating agendas for multiple meetings in one run, do NOT batch the context-gather across meetings and then mass-produce output. The confirmed failure (F3, 2026-06-08) is: the cheap section (Priorities) gets filled and the expensive qualitative synthesis (themed sections, Feedback/Growth, callbacks) gets skeletoned for every agenda in the batch. **Process each meeting end-to-end (scaffold → curate/frame → self-check) before starting the next.** Each agenda must independently match single-agenda depth. The quality bar does not drop because there are more meetings; do fewer agendas fully rather than more thinly. There is NO shared shortcut, no "same template for all," no "Priorities-only" batch output.

---

## get_area_context

**Purpose**: Given a meeting title OR area slug, retrieve the relevant area's context — recurring meeting mappings, current state, key decisions, and backlog. Use this to enrich meeting prep, route extracted intelligence, and maintain area-specific knowledge.

**Used by**: meeting-prep, process-meetings, week-plan, daily-winddown

**Inputs**: Meeting title (for auto-lookup) OR area slug (for direct access).

**Steps**:

1. **From meeting title** — Call `AreaParserService.getAreaForMeeting(meetingTitle)`:
   - Uses case-insensitive substring matching against `recurring_meetings[].title` in area files
   - Returns `AreaMatch | null`: `{ areaSlug: string; matchType: 'recurring' | 'inferred'; confidence: number }`
   - Returns `null` when no match (not `{ confidence: 0 }`)
   - For multiple matches, returns highest confidence (first match wins for equal confidence)

2. **Handle null result** — If no area matches:
   - For recurring meetings: prompt user to select or create area association
   - For one-off meetings: infer from attendees + content, confirm if confidence < 0.7
   - For skills that don't require area context: proceed without area enrichment

3. **From area slug** — Call `AreaParserService.getAreaContext(areaSlug)`:
   - Returns `AreaContext | null` with full parsed content
   - Includes: `slug`, `name`, `status`, `recurringMeetings[]`, `filePath`, and `sections`

4. **Inject sections** — Use relevant sections from `AreaContext.sections`:
   - `currentState` — Current status and key points about the area
   - `keyDecisions` — Date-prefixed decisions (e.g., "2026-03-01: Use REST API")
   - `backlog` — Future work items for this area
   - `activeGoals` — Goals with `area:` field pointing to this area
   - `activeWork` — Current projects and initiatives
   - `openCommitments` — Auto-filtered commitments by area

**Outputs**:

| Output | Type | Description |
|--------|------|-------------|
| `AreaMatch` | `{ areaSlug, matchType, confidence }` | Meeting-to-area lookup result |
| `AreaContext` | Full parsed area | All area frontmatter and sections |

**Example usage**:

```typescript
import { AreaParserService } from '@arete/core';

// In a skill or CLI command
const parser = new AreaParserService(storage, workspaceRoot);

// From meeting title (e.g., meeting-prep)
const match = await parser.getAreaForMeeting('CoverWhale Sync');
if (match) {
  // match: { areaSlug: 'glance-communications', matchType: 'recurring', confidence: 1.0 }
  const context = await parser.getAreaContext(match.areaSlug);
  // Inject context.sections.focus, context.sections.goal, etc.
}

// Direct by slug (e.g., when area is already known)
const context = await parser.getAreaContext('glance-communications');
if (context) {
  console.log(context.sections.focus); // "Cover Whale production launch..."
  console.log(context.sections.goal); // "- [Ship CoverWhale integration]..."
}
```

**Area file format** (areas/{slug}.md):

```yaml
---
area: Glance Communications
status: active
recurring_meetings:
  - title: "CoverWhale Sync"
    attendees:
      - john-doe
      - jane-smith
    frequency: weekly
---

# Glance Communications

## Goal
- [Ship CoverWhale integration](../goals/2026-Q1-2-coverwhale.md) (Q1 2026)

## Focus
- **Cover Whale production launch** — Templates finalized, targeting go-live

## Horizon
- LEAP rollout (Phase 2)

## Projects

| Project | Status |
| ------- | ------ |
| [Comms Domain](../projects/active/glance-comms/README.md) | Active |

## Backlog
- Add webhook support
- Performance optimization

## Stakeholders

| Person | Role |
| ------ | ---- |
| Lindsay Gray | PM lead |
```

**Integration with other patterns**:
- **meeting-prep**: Use `get_area_context` after attendee resolution to inject area-specific context
- **process-meetings**: Use `getAreaForMeeting()` to route extracted decisions to the correct area file
- **daily-winddown**: Use for today's meetings to show area context in daily focus
- **week-plan**: Aggregate area states for weekly planning view

---

## extract_decisions_learnings

**Purpose**: Scan content for candidate decisions and learnings, present for inline review, write approved items to memory.

**Used by**: process-meetings, finalize-project, slack-digest

**When a context bundle is available** (assembled upstream by the calling skill via `context_bundle_assembly`), use the `significance_analyst` pattern for context-aware extraction. The analyst distinguishes genuine decisions from discussion, and genuine insights from passing comments, by reasoning about the builder's strategy, goals, and existing memory. **When no context bundle is available** (e.g., `finalize-project` which does not assemble a bundle), fall back to keyword scanning as described below.

**Steps (context bundle available)**:
Follow the `significance_analyst` pattern — see § significance_analyst below. The calling skill assembles the context bundle and passes it to the analyst. Do not follow the keyword-scanning steps below.

**Steps (keyword-scanning fallback — no context bundle)**:

1. **Scan for decisions** — Look for: "we decided", "going with", "the plan is", "consensus was".
2. **Scan for learnings** — Look for: user insights, process observations, market/competitive insights, surprises.
3. **Format candidates** — For each: title, source reference, context quote, suggested memory format.
4. **Present for review** — Show each candidate; user chooses Approve / Edit / Skip.
5. **Write approved items** — Append to `.arete/memory/items/decisions.md` or `.arete/memory/items/learnings.md` using the standard formats below.

**See also**: `significance_analyst`, `context_bundle_assembly`

**Decision format** (append to decisions.md):

```markdown
### YYYY-MM-DD: [Decision Title]
**Project**: [If applicable]
**Context**: [What led to this decision]
**Decision**: [What was decided]
**Rationale**: [Why this choice]
**Alternatives Considered**: [If known]
**Status**: Active
```

**Learning format** (append to learnings.md):

```markdown
### YYYY-MM-DD: [Learning Title]
**Source**: [What surfaced this]
**Insight**: [What was learned]
**Implications**: [How this affects future work]
**Applied To**: [Updated as used]
```

**Rule**: Never write to memory without user approval. Always present candidates for Approve / Edit / Skip first.

---

## refresh_person_memory

**Purpose**: Keep person profiles up to date with repeated asks/concerns from meeting notes and transcripts.

**Used by**: process-meetings, meeting-prep, prepare-meeting-agenda, slack-digest

**Steps**:

1. Ensure attendees are resolved to person files (`people/{internal|customers|users}/*.md`).
2. Scan recently processed meeting content for person-specific signals:
   - asks: "[Name] asked about/for..."
   - concerns: "[Name] is concerned about...", "[Name] pushed back on..."
3. Aggregate repeated mentions (default threshold: 2+ mentions) and keep source references.
4. Refresh each person file's auto-managed section (`## Memory Highlights (Auto)`).
5. Preserve manual notes; only replace the auto-managed section.

**Stale-aware (recommended for prep/planning)**:

```bash
arete people memory refresh --person jane-doe --if-stale-days 3
```

Use a short freshness window (3 days) for meeting prep/daily planning and a longer window (7 days) for week planning.

**CLI helper**:

```bash
arete people memory refresh
arete people memory refresh --person jane-doe
```

**Output**: Person profiles include fast-access highlights for recurring asks/concerns, with mention counts and recent sources.

---

## enrich_meeting_attendees

**Purpose**: Cross-reference calendar event data to fill in missing or incomplete attendee information in meeting files — e.g., email-only identifiers, first-name-only entries, or attendees with no displayable name.

**Used by**: process-meetings (entity-resolution step, after `arete pull krisp` or `arete pull fathom` populates meeting files with attendee metadata)

**Integration point**: Apply during **process-meetings step 2** (entity resolution) — before slug generation and person-file creation, so enriched names and emails feed into the slug and category logic.

### When to Enrich

Trigger this pattern for any attendee record that has:
- Email only (no display name): `alice@acme.com`
- First name only: `Alice` (no surname)
- Unknown/machine name: `user_8472`, `guest`, or a UUID
- Missing email (name only, no way to classify internal vs. external)

Skip enrichment if the attendee already has a full name **and** an email — entity resolution has enough signal to proceed.

### Steps

1. **Identify enrichment candidates** — While building the attendee candidate list (from meeting frontmatter or body), flag any record matching the "When to Enrich" conditions above. Collect: `name`, `email`, `source` (meeting file path), `meeting_time` (ISO timestamp from frontmatter).

2. **Pull calendar window** — Fetch calendar events covering a ±15-minute window around the meeting time:

   ```bash
   # Pull events as JSON for a specific date
   arete pull calendar --json --date YYYY-MM-DD

   # Or narrow to a time window
   arete pull calendar --json --start "YYYY-MM-DDTHH:MM" --end "YYYY-MM-DDTHH:MM"
   ```

   The `--json` flag returns structured event objects with `title`, `start`, `end`, `attendees[]` (each with `name` and `email`).

3. **Match calendar event to meeting** — For each enrichment candidate's meeting, find the best-matching calendar event using this priority order:

   | Signal | Match condition |
   |--------|----------------|
   | **Time overlap** | Event start/end overlaps the meeting time by ≥ 1 min (within ±15 min) |
   | **Title similarity** | Normalized event title matches normalized meeting title (≥ 80% token overlap) |
   | **Email domain** | At least one calendar attendee shares the same email domain as a known meeting attendee |

   If no event matches, skip enrichment for this meeting and note it in the summary.

4. **Enrich attendee records** — For each flagged attendee, find the matching calendar attendee:

   - **Email-only → full name**: Look up the email in the calendar event's attendee list; use the calendar `name` field.
   - **First-name-only → full name**: Fuzzy-match the first name against calendar attendee names; use the calendar record if confidence is high (only one candidate with that first name).
   - **Name-only → email**: Match the name to a calendar attendee; use the calendar `email` to classify internal vs. external.

   ```
   Before: { name: "Alice", email: null }
   Calendar: { name: "Alice Nguyen", email: "alice@acme.com" }
   After:  { name: "Alice Nguyen", email: "alice@acme.com", enriched_from: "calendar" }
   ```

5. **Merge enriched data** — Replace the original incomplete record with the enriched version. Preserve the original source reference (`enriched_from: "calendar"`) so downstream steps can distinguish enriched from raw data. Do **not** overwrite records that already have full information.

6. **Continue entity resolution** — Pass the enriched attendee list into the normal slug-generation and People Intelligence digest flow (process-meetings step 2). Enriched records behave identically to native records from this point forward.

### Example Workflow (skill author reference)

```
Meeting file: resources/meetings/2026-03-05-product-review.md
Frontmatter attendees: ["alice@acme.com", "Bob", "Charlie Smith"]

Step 1 — Candidates:
  - "alice@acme.com" → email-only (flag)
  - "Bob" → first-name-only (flag)
  - "Charlie Smith" → full name, no email (flag for email enrichment)

Step 2 — Pull calendar:
  arete pull calendar --json --date 2026-03-05
  → Event: "Product Review" 10:00–11:00
    Attendees: [
      { name: "Alice Nguyen", email: "alice@acme.com" },
      { name: "Bob Tanaka",   email: "bob@acme.com" },
      { name: "Charlie Smith",email: "charlie@partner.io" }
    ]

Step 3 — Match: time overlap + title similarity → high confidence

Step 4/5 — Enrich:
  - "alice@acme.com" → { name: "Alice Nguyen", email: "alice@acme.com" }
  - "Bob" → { name: "Bob Tanaka", email: "bob@acme.com" }
  - "Charlie Smith" → { name: "Charlie Smith", email: "charlie@partner.io" }

Step 6 — Entity resolution proceeds with full records
```

### Outputs

- Attendee candidate list with incomplete records replaced by enriched versions
- Each enriched record carries `enriched_from: "calendar"` for auditability
- Unmatched candidates are passed through unchanged; a note is included in the step 2 summary (e.g., "1 attendee could not be enriched — no matching calendar event")

---

## light_pre_mortem

**Purpose**: Quick risk identification before committing to a decision (PRD, quarter plan, roadmap). Takes 5 minutes; surfaces 2-3 risks with mitigations.

**Used by**: create-prd, quarter-plan, construct-roadmap

**Steps**:

1. **Frame the scenario** — "If [this decision/plan/PRD] failed 6 months from now, what would have caused it?"
2. **Surface 2-3 risks** — Ask the user to identify specific failure causes (not vague "bad execution")
3. **Define one mitigation per risk** — Concrete action to reduce likelihood or impact
4. **Document** (optional) — Add risks/mitigations to the deliverable (PRD, quarter file, roadmap)

**Outputs**: 2-3 risk-mitigation pairs; optional inclusion in deliverable.

**Note**: For higher-stakes decisions (PRD execution, large refactors), use the full pre-mortem template at `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md` with 8 risk categories.

---

## research_intake

**Purpose**: Process bulk documents in a project's `inputs/` folder into structured analyses and synthesis.

**Used by**: discovery, general-project

**When to trigger**: When bulk files are detected in `inputs/`, **suggest** the pattern — do not auto-apply:
> "I see several files in inputs/. Would you like me to process them using the research_intake pattern?"

Wait for user confirmation before proceeding.

**Steps**:

1. **Scan inputs/** — List new/unprocessed files in `inputs/`. Note file types and count.

2. **Analyze each document** — For each input file, create `working/analysis-[slug].md` using this template:

   ```markdown
   ## Summary
   2-3 sentences. What is this document about?

   ## Key Points
   - [Point 1]
   - [Point 2]
   - [Point 3]
   (5-7 bullet points max — if you have more, prioritize the most important)

   ## Questions/Concerns
   - What's unclear or needs follow-up?

   ## Relevance to Project
   How does this connect to the project goal?
   ```

   **Conciseness rule**: Keep each analysis tight. If you're writing paragraphs instead of bullets, you're being too verbose.

3. **Synthesize themes** — After all individual analyses are complete, create `working/synthesis-[topic].md`:
   - Identify patterns and themes across documents
   - Note contradictions or tensions
   - Surface actionable insights
   - **Limit**: Focus on themes, not exhaustive summary. If you're writing more than 10 paragraphs, cut to the most important points.

4. **Update project README** — Add key findings to the project README under a "Key Findings" or "Research Summary" section.

5. **Index for searchability** — Follow the [skill_integration](#skill_integration) pattern. If `index: true` is set in the skill's integration profile, Areté handles this automatically after saving. For skills without an integration profile, indexing is not required by this pattern.

6. **Cleanup (optional)** — After synthesis is complete and you're confident in the output, consider archiving or deleting individual analysis files. The synthesis is the primary deliverable; individual analyses are scaffolding.

**Outputs**: 
- Individual analysis files: `working/analysis-*.md` (one per input document)
- Synthesis file: `working/synthesis-[topic].md`
- Updated project README with key findings
- Indexed content (searchable via `arete context`)

**Conciseness guidance**:
- Individual analyses: 5-7 bullet points max in Key Points; Summary is 2-3 sentences, not paragraphs
- Synthesis: Max 10 paragraphs; focus on actionable themes, not exhaustive coverage
- Overall: The synthesis is the primary deliverable. User's time > completeness.

**See also**: `inbox_triage` — workspace-scoped triage that may route items TO a project's `inputs/`, where `research_intake` then processes them.

---

## inbox_triage

**Purpose**: Classify, route, and extract insights from items in the workspace `inbox/` directory. Generalizes `research_intake` from project-scoped to workspace-scoped: triage decides WHERE content goes, then project-scoped patterns like `research_intake` process it further.

**Used by**: inbox-triage

**Relationship to research_intake**: These patterns are sequential, not competing:
- `inbox_triage`: Workspace-scoped. Processes top-level `inbox/`. Routes items to any workspace destination (projects, areas, resources, memory).
- `research_intake`: Project-scoped. Processes `inputs/` within a specific project. Output stays in project `working/`.
- Triage may route TO a project's `inputs/`, where `research_intake` later processes.

**Steps**:

1. **Scan inbox/** — List all files in `inbox/` (excluding README.md). Separate into unprocessed and needs-review items.

2. **Assemble context bundle** — Follow `context_bundle_assembly`. Include strategy, goals, active areas, active projects, existing memory, and people slugs. Assembled once, reused for all items.

3. **Analyze each item** — For each unprocessed item:
   - Read content (handle `.md`/`.txt` directly; `.pdf` best-effort; images via vision; other binary flagged as needs-review)
   - Classify content type (article, research, conversation, person-intel, note, decision, reference, image, unsupported)
   - Extract entities by matching against workspace people, projects, areas, goals
   - Apply `significance_analyst` judgment: cite specific bundle content that grounds the routing decision

4. **Decide routing** — Assign destination and confidence. High confidence (>= 0.8): project inputs, area reference, or specific resource folder. Medium (0.6-0.8): general resources. Low (< 0.6): stays in inbox with `status: needs-review`.

5. **Present triage plan** — Table with item, type, destination, confidence, and grounded "Why" column. Memory updates listed separately. User must approve before any files move.

6. **Execute routing** — Move files, update frontmatter (`status: triaged`, `triaged_to`, `triaged_date`), apply approved memory updates, run `arete index`.

**Outputs**: Routed files in their new locations with triage metadata. Updated memory items if approved.

**See also**: `research_intake` — project-scoped input processing. `significance_analyst` — the reasoning pattern used for routing decisions. `context_bundle_assembly` — how the context bundle is built.

---

## skill_integration

**Purpose**: Declare how a skill's outputs integrate with the Areté workspace — where to save, whether to index, what context to update.

**Used by**: All skills that produce persistent output (projects, resources, context files).

### How It Works

Skills declare an `integration` block in SKILL.md frontmatter (native skills) or `.arete-meta.yaml` (community skills). At install and update time, Areté reads this profile and generates a `## Areté Integration` section in the SKILL.md using sentinel markers (`<!-- ARETE_INTEGRATION_START/END -->`).

The generated section tells the agent:
- Where to save output (workspace-relative path pattern)
- Whether to run `arete index` after saving
- What context files to update
- How to resolve templates (`arete template resolve --skill {id} --variant {name}`)

### Schema

```yaml
integration:
  outputs:
    - type: project | resource | context | none
      path: "projects/active/{name}/"    # {name} filled by agent
      template: variant-name             # for arete template resolve
      index: true                        # trigger arete index
  context_updates:
    - context/competitive-landscape.md
```

### For community skills

Community skills use `.arete-meta.yaml` for integration configuration. See [_integration-guide.md](./_integration-guide.md) for full setup instructions and examples.

### Customization

Users can edit `.arete-meta.yaml` to change output location, template, or indexing behavior. Changes take effect on next `arete update` (which regenerates the integration section).

---

## context_bundle_assembly

**Purpose**: Assemble the structured context bundle that expert agent patterns consume. Standardizes how skills gather strategy, memory, and people context before shifting into expert reasoning mode.

**Used by**: process-meetings (before significance_analyst), meeting-prep (before relationship_intelligence), weekly-winddown (before significance_analyst), slack-digest (before significance_analyst)

**Inputs**: Topic string, list of relevant person slugs (optional).

**Steps**:

1. **Derive topic string** — Use meeting title + first 100 characters of summary or key points. For weekly-winddown, use the week's focus areas. Do not use raw filenames as topics.

2. **Gather strategy & goals** — Run `arete search "<topic>" --scope context`. Take the top 3 results, max 300 words each. If results are empty, note: `context_quality: sparse-strategy`.

3. **Gather existing memory** (split across atomic L2 items + synthesized topic pages — both fit inside the ~1000 word memory budget):
   - **Atomic items** (~600 words budget): `arete search "<topic>" --scope memory --limit 3`. Top 3 results, ~200 words each. These are dated decisions/learnings from `.arete/memory/items/`.
   - **Synthesized topic pages** (~400 words budget): `arete topic find "<topic>" --limit 1 --budget 400 --json`. Top 1 topic page with budget-truncated `bodyForContext`. Provides narrative synthesis that atomic items don't.
   - If both return empty, note: `context_quality: sparse-memory`.
   - **JSON contract**: `arete topic find` returns `{ results, searchBackend }`. A `searchBackend: 'none'` means no search provider configured — surface that as a degraded-capability warning rather than treating it as "no relevant topics."

4. **Gather people context** (when person slugs are available) — For each person: `arete people show <slug> --memory`. Extract ONLY: stances, open items, and relationship health sections. Skip full profile body. Max ~200 words per person. **If you've already run `get_meeting_context` upstream, reuse its people context — do not re-run `arete people show`.** For attendees still in `unknown_queue` (unresolved from process-meetings Step 2), skip person context and add to the bundle header: "Unresolved attendees (no person context): [names]".

5. **Completeness check** — Count sections with 0 results. If 2+ sections are empty, prepend bundle header with: `⚠️ Sparse context — weight raw content more heavily. Available context: [list non-empty sections].`

6. **Compile bundle** — Assemble with section headers and approximate word counts:
   ```
   ## Context Bundle (~N words total)
   ### Strategy & Goals (~X words) — [sparse if empty]
   ### Existing Memory (~Y words) — [sparse if empty]
   ### People Context (~Z words) — [sparse if empty / skipped]
   ```

**Token budget limits**:
- Strategy/goals: max 3 files × 300 words = 900 words
- Memory: max 5 results × 200 words = 1,000 words
- Person context: stances + items + health only, ~200 words per person
- Total bundle (excluding raw content): target ~2,500 words max

**Priority trim order** (when bundle exceeds limits):
1. Drop full person profile body (keep stances/items/health only)
2. Drop older or lower-score memory items
3. Drop lower-relevance context files
4. Never truncate raw content — that's the primary signal

**Outputs**: Compiled context bundle with section headers, word counts, and completeness signal.

**See also**: `get_meeting_context` — when both apply, `context_bundle_assembly` consumes `get_meeting_context` outputs for the people context section. Do not run both independently.

---

## topic_page_retrieval

**Purpose**: Retrieve the most relevant topic pages (L3 wiki — `.arete/memory/topics/*.md`) for a given query, with budget-aware section truncation, so skills can inject encyclopedic context without blowing the memory word budget in `context_bundle_assembly`.

**Used by**: meeting-prep (attendee topic context), create-prd (prior decisions on the feature area), week-plan (ongoing topic threads), process-meetings (related topic lookups).

**Relationship to `contextual_memory_search`**: `contextual_memory_search` returns atomic L2 items (decisions, learnings). This pattern returns synthesized topic-page narratives — complementary, not a replacement. Use both when relevant.

**Inputs**:
- `query` — natural language search string (meeting title, priority phrase, topic slug)
- `area` (optional) — area slug to prefer; matching topics get a +0.1 rank boost
- `limit` (default 3) — top-k topics to return
- `budget` (default 1000 words) — word cap on `bodyForContext` per topic

**Source types feeding the topic pages**: topic pages compound from
multiple source classes — `meeting` (`resources/meetings/*.md`) and
`slack-digest` (`resources/notes/{date}-slack-digest.md`). Both flow
through the same `discoverTopicSources` → `integrateSource` pipeline,
so a `topic_page_retrieval` consumer never has to branch on source
type; `bodyForContext` and `frontmatter.sources_integrated` already
reflect the unified narrative.

### Mechanism — use the CLI, not manual path walking

```bash
arete topic find "<query>" [--area <slug>] [--limit N] [--budget N] --json
```

Internal flow:

1. `SearchProvider.semanticSearch(query, { paths: ['.arete/memory/topics/'], limit: k*3 })` — broader candidate set for re-ranking. Falls back to token search automatically when qmd is not configured.
2. Re-rank each candidate by:
   - `qmd score × 0.6` (base relevance)
   - `+0.2` if `last_refreshed` within 30 days
   - `+0.1` if within 90 days
   - `+0.1` if frontmatter `area` matches `options.area`
3. Deterministic slug-asc tiebreak for equal scores (stable output).
4. Take top-k.

**Budget & truncation** (per topic page, applied in priority order until budget exhausted):

1. **Current state** (always included — highest-signal section)
2. **Open questions**
3. **Scope and behavior**
4. **Why/background**
5. **Known gaps**
6. **Relationships**
7. **Rollout/timeline**

Skipped entirely (low information density for skill context): `Source trail`, `Change log`.

**Output shape** (from `--json`):

```json
{
  "success": true,
  "query": "cover whale templates",
  "results": [
    {
      "slug": "cover-whale-templates",
      "frontmatter": { "topic_slug": "...", "status": "active", "area": "...", ... },
      "bodyForContext": "## Current state\n\n...\n\n## Open questions\n\n...",
      "score": 0.87
    },
    ...
  ]
}
```

Skills consuming the JSON should prefer `bodyForContext` (already truncated to budget) over re-parsing the topic page.

**Empty results**: `{ results: [] }` with `success: true`. Skills should note "No directly relevant topic pages for <query>" and proceed rather than fail.

**See also**: `context_bundle_assembly` — consumes `topic_page_retrieval` output as a memory-section augmentation. `contextual_memory_search` — atomic L2 item retrieval, complementary.

---

## contextual_memory_search

**Purpose**: Lightweight memory retrieval for planning skills based on user-confirmed context. Unlike `context_bundle_assembly` which gathers comprehensive context, this pattern searches memory for decisions and learnings based on topics the user has already confirmed (priorities, meeting titles, attendees). Use this when you need targeted memory context without full bundle assembly.

**Used by**: week-plan, daily-winddown, meeting-prep

**Relationship to `context_bundle_assembly`**: This is a lightweight alternative for planning skills that need memory context without full bundle assembly. Use `contextual_memory_search` when you need targeted memory search based on user-confirmed items. Use `context_bundle_assembly` for comprehensive intelligence analysis requiring strategy, memory, and people context together.

**Inputs**: 
- User-confirmed priorities (from conversation)
- Meeting titles (from calendar or user input)
- Attendee names (from meeting resolution)
- Goal keywords (from quarter/week goals)

**Steps**:

1. **Gather search terms from confirmed context** — Extract keywords from:
   - User's stated priorities (their exact wording, not paraphrased)
   - Confirmed meeting titles (QBRs, customer calls, key 1:1s)
   - Key attendee names (resolved to person slugs)
   - Related goal keywords (from goals/quarter.md)

2. **Run targeted memory searches** — Cover both atomic L2 items and
   synthesized L3 topic pages. For each search term:
   ```bash
   # Atomic: dated decisions and learnings
   arete search "<term>" --scope memory --limit 2

   # Synthesized: topic-page narrative (1 per key term, tight budget)
   arete topic find "<term>" --limit 1 --budget 250 --json
   ```
   Use `--limit 2` per atomic term to keep results focused. Cap total atomic
   results at 5 items. Topic-page narratives appear inline as 1–2 sentence
   paraphrases (don't dump full `bodyForContext` into the user's view —
   reference `[[topic-slug]]` for the full page).

   When `arete topic find` returns `searchBackend: 'none'`, topic
   retrieval is unavailable — note in output, don't crash.

3. **Filter for relevance** — Not every result is worth surfacing. Keep only items that:
   - Directly inform the current planning context
   - Are recent (within last 30 days) OR highly relevant to confirmed priorities
   - Would change how the user approaches the task

4. **Handle empty results** — If memory search returns no relevant results:
   - Do NOT ask "Does this change anything?" (awkward UX)
   - Instead, note briefly: "No directly relevant past decisions found for [topic]."
   - Proceed without delay

5. **Surface findings concisely** — Present 3-5 items max, each as 1-2 sentences:
   ```
   "A few things from memory that might be relevant:
   - **Decision** [2026-03-15]: CoverWhale requires legal sign-off before compliance
   - **Learning** [2026-03-10]: UK stakeholders prefer async review for roadmap drafts"
   ```

6. **Offer to adjust** — After surfacing (only if results found):
   - "Anything here that changes your priorities?" (for week-plan)
   - Or surface inline with meeting context (for daily-winddown, meeting-prep)

**Outputs**: 
- 3-5 relevant memory items, or "no relevant results" note
- Items surfaced conversationally, not as raw data dump

**Example exchange**:

```
User: "I need to focus on CoverWhale compliance and finalize the UK roadmap this week."

Agent: [runs searches]
arete search "CoverWhale compliance" --scope memory --limit 2
arete search "UK roadmap" --scope memory --limit 2

Agent: "A few things from memory:
- **Decision** [Mar 15]: CoverWhale requires legal sign-off before compliance submission
- **Learning** [Mar 10]: UK stakeholders prefer async review for roadmap drafts
- **Decision** [Mar 12]: UK roadmap should prioritize enterprise features

Anything here that changes how you want to frame these priorities?"
```

**See also**: `context_bundle_assembly` — for comprehensive context gathering requiring strategy, memory, and people together. `get_meeting_context` — for full meeting preparation including attendee context and action items.

---

## significance_analyst

**Purpose**: Context-aware judgment about what from this content actually matters given everything we know — the builder's strategy, goals, existing decisions, and relationship context. Replaces keyword scanning with reasoning.

**Used by**: process-meetings (Step 7 — extraction to workspace memory), weekly-winddown (weekly significance assessment), slack-digest (Phase 2c — conversation extraction)

**Inputs**:
- Context bundle (assembled via `context_bundle_assembly`)
- Raw content (meeting transcript, weekly accomplishments, document)
- Judgment mandate (what kind of intelligence: extract decisions, assess significance, identify patterns)

**Steps**:

1. **Internalize the context bundle** — Read strategy/goals, existing decisions/learnings, and person stances. Understand what the builder is working toward and what's already been captured.

2. **Read raw content with context in mind** — Don't just scan for keywords. Read the content knowing what matters to the builder's strategy. A casual mention of a competitor pivot might be more significant than a formal "we decided" statement.

3. **Apply judgment** — For each potential candidate (decision, learning, insight, commitment):
   - Is this genuinely significant, or just discussion/description/explanation?
   - Does this connect to a current goal or strategy?
   - Does this contradict or reinforce an existing decision?
   - Would the builder want to remember this in 3 months?

4. **Grounding directive** — For each kept candidate, **cite the specific goal, prior decision, or person stance from the context bundle** that makes it significant. Example: "Significant because it contradicts the 2026-02-15 decision to prioritize API-first." If you cannot cite specific bundle content, downgrade the candidate's ranking.

5. **Rank and present** — Return candidates ranked by significance, each with:
   - The candidate (decision/learning/insight)
   - WHY it matters (citing specific bundle content)
   - Confidence level (high/medium/low)

**Outputs**: Ranked candidates with reasoning and bundle citations.

**Sparse-context behavior**: When the context bundle is sparse (⚠️ signal present), weight the raw content more heavily. Extraction still works but reasoning will be less context-aware. Note in output: "Limited context available — significance assessment based primarily on content analysis."

**See also**: `extract_decisions_learnings` — when a skill uses that pattern with a context bundle available, it delegates here instead of keyword scanning. `context_bundle_assembly` — assembles the bundle this pattern consumes.

### Worked Example

**Abbreviated input bundle**:
```
## Context Bundle (~800 words)
### Strategy & Goals
- Goal: Launch API-first product by Q2 2026
- Decision (2026-02-15): Prioritize API over UI for MVP
### Existing Memory
- Learning: Quick UX wins need to be weighed against upcoming AI changes
### People Context
- Sarah Chen: Stance — "API docs are our biggest gap" (strong, 3 mentions)
```

**Raw content excerpt**:
> "...so the way our auth system works is you first configure the OAuth provider, then the middleware validates tokens. We decided to use JWTs instead of sessions for the API. Sarah mentioned again that the API docs are really lacking — she said customers are building their own unofficial guides..."

**❌ Without context reasoning** (keyword scan):
```
1. Decision: "We decided to use JWTs instead of sessions for the API"
2. Decision: "configure the OAuth provider, then the middleware validates tokens"
3. Learning: "customers are building their own unofficial guides"
```
Problem: #2 is a description of how things work, not a decision. #3 is pulled out of context.

**✅ With context reasoning** (significance analyst):
```
1. Decision: "Use JWTs instead of sessions for the API" — HIGH significance
   Why: Directly supports Goal "Launch API-first product by Q2 2026" — JWT
   is an architectural choice for the API layer being prioritized.

2. Learning: "Customers are building their own unofficial API guides" — HIGH
   Why: Reinforces Sarah Chen's stance that "API documentation is our biggest
   gap" (3 mentions). Customer behavior validates the documentation concern.
   Contradicts implicit assumption that current docs are sufficient.

Rejected: "OAuth provider configuration" — this is a description of existing
architecture, not a new decision or actionable insight.
```

---

## relationship_intelligence

**Purpose**: Context-aware judgment about what changed in a relationship and what should be tracked — assesses relationship health evolution, new stances, and generates prep recommendations based on trajectory.

**Used by**: meeting-prep (after get_meeting_context). The `arete people intelligence digest` CLI applies the analogous classification logic for batch people-mention triage.

**Inputs**:
- Context bundle (with person profiles from `context_bundle_assembly` or reused from `get_meeting_context`)
- Meeting content or interaction content
- Person profiles with known stances, open items, relationship health

**Steps**:

1. **Review known relationship state** — Read person profiles from the context bundle. Note: current stances (and their strength), open items, relationship health score, last interaction date.

2. **Compare against new content** — Read the meeting/interaction content and identify:
   - **New stances**: Positions not previously recorded, or existing stances that strengthened/weakened
   - **Resolved items**: Previously open items that are now addressed
   - **Health signals**: Positive (enthusiasm, commitment, proactive offers) or negative (pushback, frustration, disengagement, ghosting)
   - **Sentiment shifts**: Changes in tone or engagement level compared to known baseline

3. **Assess trajectory** — Based on the comparison:
   - Is the relationship strengthening, stable, or weakening?
   - Are there unresolved concerns accumulating?
   - Is there a pattern (e.g., consistently raising the same issue)?

4. **Generate prep recommendations** — For meeting-prep:
   - Topics to address proactively (unresolved concerns, weakening stances)
   - Wins to acknowledge (resolved items, positive developments)
   - Questions to ask (areas where you lack current information)
   - Approach suggestions (direct vs. exploratory based on relationship state)

5. **Return intelligence insights** — Structured output for the calling skill.

**Outputs**: Relationship insights with evidence and actionable prep recommendations.

### Worked Example

**Person profile from bundle**:
```
Sarah Chen — Engineering Lead at Acme
Stances: "API docs are our biggest gap" (strong, 3 mentions),
         "Prefer async communication" (moderate)
Open items: Waiting for architecture doc from us (2 weeks overdue)
Health: 7/10 — stable but architecture doc delay is a risk
```

**New meeting content excerpt**:
> "Sarah seemed frustrated about the architecture doc — she said her team has been blocked for two weeks waiting on it. She also mentioned they've started building a workaround using the old REST endpoints. On a positive note, she was excited about the new webhook system."

**❌ Without relationship context**:
```
- Sarah is frustrated about architecture doc
- Her team is using old REST endpoints
- She likes the webhook system
```
Generic observations with no trajectory or actionable insight.

**✅ With relationship intelligence**:
```
Relationship Assessment: WEAKENING (7/10 → 6/10 est.)
Evidence:
- Architecture doc is 2 weeks overdue (open item confirmed, escalating)
- Team building workarounds = loss of confidence in our timeline
- "Frustrated" signals health decline from "stable"

Positive Signal:
- Webhook excitement = genuine technical interest (potential to rebuild goodwill)

Prep Recommendations:
1. LEAD WITH: Architecture doc status — have a concrete delivery date
2. ACKNOWLEDGE: The delay impact ("I know your team has been blocked...")
3. LEVERAGE: Webhook excitement — use as bridge to rebuild engagement
4. ASK: "What other areas is your team working around?" (uncover hidden friction)
```

**See also**: `context_bundle_assembly` — assembles the bundle this pattern consumes. `get_meeting_context` — when meeting-prep runs both, `context_bundle_assembly` reuses `get_meeting_context` outputs. `meeting-prep` — primary skill consumer.

---

# Chef-Orchestrator Patterns (Areté v2 Phase 2)

These four patterns define how the agent behaves when running a "chef-orchestrator" skill: it does all primitive work upfront, applies judgment using wiki + memory + user-specific guidance, and engages the user **once** at the end with a curated, reason-labeled view.

The patterns are **prescriptive on envelope, guidance on content** — the structure of how the agent presents output is fixed; the content the agent fills in is per-skill judgment.

Used by: `daily-winddown`, `weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`. Other skills may adopt as they're rewritten in Phase 4.

---

## do-all-work-then-engage

**Purpose**: Replace step-by-step engagement gates with one upfront work pass + one curated engagement at the end. Eliminates the "10 cooks" feeling where the agent runs primitive A, asks user, runs primitive B, asks user, etc.

**Used by**: All five chef-orchestrator skills. `week-plan` uses a **two-engage variant** (see below).

### Envelope (prescriptive)

The agent runs the following steps in order. **Do not engage the user between steps 1–5.** Engagement happens only at step 6.

1. **List primitive calls** — enumerate every CLI invocation, MCP query, and file read needed for this run. Include both reads (today's calendar, recent meetings, open commitments) and writes (none expected at this stage — writes are user-approved at engage time).
2. **Run primitives** — execute them. Parallelize where independent (e.g., calendar pull and inbox read are independent). Sequence where dependent (e.g., `meeting context` depends on the meeting list).
3. **Read APPEND file** — `.arete/skills-local/<skill-slug>.md` if it exists. This is John's per-skill guidance. Treat its content as opinion-defining context for this skill.
4. **Apply judgment** — using the gathered output + APPEND content + wiki context (summaries, entity pages, topic pages), decide what to surface, what to defer, and what to propose as actions. Use Patterns 2 (reason labels), 3 (action proposals), and 4 (sidecar) to compose the output.
5. **Compose curated view** — single message to the user. Sections per the skill's output template. Never a flat firehose.
6. **Engage user once** — present the curated view. Wait for response. Only then proceed to writes / executions.

### When to use

- Daily-winddown, weekly-winddown, process-meetings, meeting-prep — all run this pattern verbatim.
- Week-plan uses the **two-engage variant** (below) because the user owns priorities upstream of the plan draft.

### Two-engage variant (week-plan only)

Some skills require an explicit user decision midway. Week-plan is the canonical case: the agent surfaces last week's carryovers + suggested priorities, the user confirms/edits the priorities, then the agent drafts the week plan against the confirmed list.

Two engages are legitimate when both of these hold:

- The midway decision is **the user's call** (e.g., priorities), not something the agent can reasonably infer.
- The work after the midway decision **changes meaningfully** based on the user's input.

If both don't hold, default to one-engage.

For two-engage skills:

- **Engage 1**: agent does all upfront work (pull last week's carryovers, scan unfinished items, gather candidate priorities) and surfaces a curated proposal. User confirms/edits.
- **Engage 2**: agent does all draft work (build the plan against confirmed priorities + wiki + commitments) and surfaces a curated draft. User approves/edits.

Do not insert additional engages. If the agent is tempted to ask a third question, the answer is "make a default choice and surface it as part of the curated view."

### What counts as "all work"

"All work" means every primitive call needed to compose the curated view. It does **not** include writes that require user approval (committing decisions to memory, scheduling calendar events, sending Slack DMs). Those are step 6+ post-engage.

If a primitive fails mid-gather:

- **Continue with partial state** when the failure is in a non-load-bearing primitive (e.g., topic find returned `searchBackend: 'none'` — note in output, proceed).
- **Abort and engage early** when the failure is in a load-bearing primitive (e.g., today's meetings list cannot be retrieved — surface the error to the user and stop).

The skill prose specifies which primitives are load-bearing vs not. When in doubt, continue and note the gap in the curated view.

### Content (per-skill)

Each skill's SKILL.md specifies:

- **Which primitives** it runs in step 2 (read commands and parallelism notes).
- **APPEND key** — `.arete/skills-local/<skill-slug>.md` (slug matches skill directory name).
- **What judgment looks like** for this skill (e.g., "importance-rank, dedup against state, conflict-with-priorities").
- **Output shape** — the section headers and quotas of the curated view.

---

## curate-with-reason-labels

**Purpose**: Every staged item carries a "why this surfaced" label. Every deferred item carries a "why this was deferred" label. When the agent is unsure whether to stage or defer, it asks — explicitly, briefly — rather than guessing.

**Used by**: All five chef-orchestrator skills.

### Envelope (prescriptive)

- **Every staged item** includes a one-line reason label. ≤12 words. Format: `— <reason>` appended to the item line.
  - Examples:
    - `Send API spec to Anthony — open commitment to Anthony, 9d old`
    - `Push back on Q3 churn — matches week focus #2 (Glance launch)`
    - `Schedule Lauren 1:1 — 3 mentions in last 5 days, no recent sync`
- **Every deferred item** includes a one-line reason label. ≤12 words. Format: `— <reason>` appended to the item line.
  - Examples:
    - `Slack reaction reminder — low importance + no decision`
    - `Standup follow-up — matches dismissal pattern (routine standup)`
    - `Vendor email reply — confidence 0.4, below threshold`
- **When uncertain**, surface to a `## Uncertain — your call` mini-tier. Brief yes/no proposal per item:
  ```
  ## Uncertain — your call
  - [ ] Glance metrics ping to Lindsay — 14d old, possibly resolved by today's standup. **Stage or skip?**
  - [ ] Email follow-up to Sara — matches dismissal pattern but customer-touching. **Stage or skip?**
  ```
- **Don't guess.** If a reasonable person could disagree, ask. Better to surface a 3-item Uncertain tier than to silently auto-defer something John wanted to see.

### Reason taxonomy (standard set — extend per-skill)

Reason labels should pull from a standard taxonomy where possible. This makes the language consistent across skills and gives John a stable mental model.

| Category | Example reasons |
|---|---|
| **Importance match** | "matches week focus #N", "high-importance meeting", "active topic" |
| **Time pressure** | "due today", "9d old commitment", "scheduled tomorrow" |
| **Relationship** | "open with @person", "no recent 1:1", "customer-touching" |
| **Volume / repetition** | "3 mentions in last 5 days", "topic compounding" |
| **Dismissal pattern** | "matches dismissal pattern (routine standup)", "user has skipped 5×" |
| **Confidence** | "below confidence 0.6", "low extraction confidence" |
| **Importance gate** | "low importance + no decision", "frontmatter.importance=light" |
| **Status** | "already resolved", "duplicate of staged item N" |

The taxonomy is not a closed set. New categories emerge as the chef encounters new situations. Per-skill SKILL.md adds skill-specific reasons (e.g., meeting-prep: "1:1 prep", "agenda has unresolved item").

### Where the label appears

Inline with the item, after a single em-dash separator:

```
- [ ] <action> — <reason>
- <decision> — <reason>
- <learning> — <reason>
```

Not in a separate column, not in a footnote. The reason is the third part of the bullet, after the type prefix and item text.

### Content (per-skill)

Each skill's SKILL.md specifies the reason labels relevant to that skill's domain. E.g., daily-winddown surfaces commitments and meeting outputs; meeting-prep surfaces relationship signals and prior-meeting threads.

---

## propose-with-mcp-action

**Purpose**: When a committed action or surfaced item maps to a known verb (Slack DM, calendar event, Notion update, Jira ticket, Areté CLI command), the agent proposes the action with full parameters and **awaits user approval before executing**. The agent never auto-executes, even for "simple" actions. User approval is required for every action, every time.

**Used by**: All five chef-orchestrator skills (where action proposals make sense).

### Envelope (prescriptive)

At the end of the curated view, after all staged/deferred/uncertain items, include a `## Proposed actions` section if any actions are warranted. Format: inline numbered list, one action per line, with verb name + parameters.

```
## Proposed actions

[1] slack.send_dm to @anthony: "Following up on auto-attachments — saw your PR comment, want to align Wed?"
[2] calendar.create_event "Lauren / John 1:1" attendees=[lauren] when=Wed-10am-CT duration=30m
[3] arete.inbox_add source=manual "Q3 churn assumption pushback for Lauren"
[4] (draft) jira.create_ticket project=INGEST type=Task summary="Default Attachments rollout test" description="Ready for testing per Tim..." labels=[glance,defaults]
```

User responds with action numbers to execute, edit, or skip:

- `1` → execute action 1
- `1, 3` → execute actions 1 and 3
- `1 with target=@jamie` → edit and execute action 1
- `2 when=Thu-10am` → edit action 2's `when` parameter and execute
- `skip 1` or `skip` → drop the action(s)
- `all` → execute every executable; for draft-only, confirm acknowledgment
- (no response in 30s) → treat as skip; do not execute

### Modes — `executable` vs `draft-only`

Two execution modes. The propose envelope is identical; the only difference is whether the agent can run the action via an MCP/CLI on approval.

- **`executable`** — agent can run the action on approval. The action line has no mode tag; it's the default.
- **`draft-only`** — agent formats the action as the user would create it externally (e.g., open Jira and create the ticket). The action line is prefixed with `(draft)`. On approval, the agent confirms acknowledgment but does not execute.

Draft-only exists because not every verb has a wired MCP. Jira is the canonical example today (no Jira MCP in John's stack). Drafts let the agent draft the ticket content while the user retains the execute step.

### Action verb taxonomy (Phase 2 default — user extends via APPEND)

| Source | Verb | Mode | Parameters |
|---|---|---|---|
| Slack MCP | `slack.send_dm` | executable | target_user, message |
| Slack MCP | `slack.send_channel` | executable | channel, message |
| GWS Calendar MCP / `arete calendar create` | `calendar.create_event` | executable | title, attendees, start, duration, agenda? |
| GWS Calendar MCP | `calendar.suggest_time` | executable | attendees, duration, window |
| Notion MCP | `notion.update_page` | executable | page_id_or_title, content |
| Notion MCP | `notion.create_page` | executable | parent, title, content |
| Jira (no MCP today) | `jira.create_ticket` | draft-only | project, type, summary, description, assignee?, labels?, parent_epic? |
| Jira | `jira.update_ticket` | draft-only | ticket_id, fields |
| Jira | `jira.transition_ticket` | draft-only | ticket_id, to_state |
| Areté CLI | `arete.inbox_add` | executable | source, content |
| Areté CLI | `arete.commitments_create` | executable | text, target_person, due? |
| Areté CLI | `arete.commitments_resolve` | executable | id, resolution |

The chef reads the user's APPEND file to learn:

1. **Which MCPs are wired** — only propose verbs the user has connected.
2. **Which draft-only verbs the user wants drafts for** — Jira is opt-in per project.
3. **User-specific context** — project keys, default labels, naming conventions.

The chef proposes only verbs the user listed in their APPEND file or that are obviously wired (e.g., `arete.*` verbs always available in an Areté workspace).

### Never auto-execute

This is the rule, not a guideline. Even for "obviously safe" actions:

- `slack.send_dm` to a known recipient with a clearly-drafted message — **propose, don't auto-send.**
- `arete.inbox_add` for a captured note — **propose, don't auto-add.**

The trust gap is calibrated by user approvals; auto-execution shortcuts that calibration. Phase 2 ships conservative; Phase 4+ may revisit per-verb defaults based on observed acceptance rates.

### Content (per-skill)

Each skill's SKILL.md specifies which verbs the skill might propose and the contextual phrasing for each. E.g., daily-winddown proposes `arete.commitments_resolve` for completed tasks; meeting-prep proposes `slack.send_dm` for pre-meeting follow-ups.

---

## surface-deferred-as-sidecar

**Purpose**: Auto-deferred items don't bloat the primary view. They roll up to a count + a sidecar file the user can spot-check. When the user pulls an item back from the sidecar, the agent records it as a `deferral_disagreement` event for the chef to learn from.

**Used by**: All five chef-orchestrator skills.

### Envelope (prescriptive)

In the primary curated view, deferred items appear as a single line:

```
12 items deferred — see ./deferred-2026-05-15.md
```

The sidecar file is written to **workspace root** (not `.arete/memory/` — these are user-facing review surfaces, not durable memory):

- Daily skills: `./deferred-<YYYY-MM-DD>.md`
- Weekly skills: `./deferred-week-<YYYY-WNN>.md` (ISO week number)
- Per-meeting skills: `./deferred-<meeting-slug>.md`

Sidecar contents: full deferred list with reason labels, grouped by category (importance / dismissal / confidence / etc.). Same `— <reason>` format as Pattern 2.

```markdown
# Deferred items — 2026-05-15

12 items auto-deferred during daily-winddown. Pull back any you want surfaced
by adding `[[pull-back]]` after the item; the next winddown will re-surface it
and log a deferral_disagreement event.

## Low importance / no decision (5)
- Routine standup notes — low importance + no decision
- Weekly review FYI — low importance + already covered in summary
- ...

## Matches dismissal pattern (4)
- Anthony PR comment — matches dismissal pattern (routine code review ping)
- ...

## Below confidence threshold (3)
- Possible action item from rambling discussion — confidence 0.4, below threshold
- ...
```

### Pull-back mechanism

When the user manually re-surfaces a deferred item (by editing the sidecar to mark it `[[pull-back]]` or by mentioning it in the next winddown), the chef:

1. Re-stages the item in the next run.
2. Appends a `deferral_disagreement` event to `.arete/memory/item-fates.jsonl` (Phase 0 substrate). Event shape:
   ```json
   {
     "ts": "2026-05-16T09:42:00Z",
     "kind": "deferral_disagreement",
     "skill": "daily-winddown",
     "item_id": "<id>",
     "item_text": "<verbatim>",
     "deferred_reason": "<original reason label>",
     "source_sidecar": "./deferred-2026-05-15.md"
   }
   ```
3. Surfaces the disagreement count weekly: "Deferral disagreements this week: N. Pattern: <observed cluster, if any>." This is the disagreement-as-signal feedback loop.

### When to use the sidecar vs primary view

- **Sidecar**: items the chef is confident the user does not want surfaced. Default behavior is "skip"; sidecar exists for spot-checking.
- **Primary view**: items the chef is confident should surface. Reason label says why.
- **`## Uncertain — your call` (Pattern 2)**: items the chef is unsure about. Quick yes/no inline in the primary view; never goes to sidecar.

If the deferred count is small (≤3 items) and the chef has high confidence in deferral, the sidecar may be omitted entirely — surface the count inline without writing a file:

```
3 items auto-deferred (low importance / dismissal pattern; no sidecar needed)
```

### Content (per-skill)

Each skill's SKILL.md specifies:

- **Sidecar naming convention** for that skill (`deferred-<date>.md`, `deferred-week-<weeknum>.md`, etc.).
- **What gets included** — categories of deferral relevant to the skill's domain.
- **Pull-back surface** — how the user re-surfaces (sidecar edit, next-run mention, or both).

---

## Chef-orchestrator pattern interplay

The four patterns compose. A typical chef-skill output looks like:

```
[do-all-work-then-engage]: agent has gathered, judged, and curated.

## What I think you should do today (staged)
- [ ] Send API spec to Anthony — open commitment, 9d old   [Pattern 2: reason label]
- [ ] Push back on Q3 churn — matches week focus #2

## Uncertain — your call                                    [Pattern 2: uncertain tier]
- [ ] Glance metrics ping to Lindsay — possibly resolved by standup. Stage or skip?

## Pruning candidates                                       [skill-specific tier]
- Stale Notion doc from March

12 items deferred — see ./deferred-2026-05-15.md            [Pattern 4: sidecar reference]

## Proposed actions                                         [Pattern 3: action proposals]
[1] slack.send_dm to @anthony: "..."
[2] arete.commitments_resolve id=cmt_abc resolution="sent"
[3] (draft) jira.create_ticket project=INGEST summary="..."

What's your call?                                            [Pattern 1: engage user once]
```

This is what "chef-orchestrator" looks like in practice: the agent has done the work, applied judgment, surfaced reasoning, and asked for one decision. The user reviews exceptions and proposals, not a flat firehose.

---

## gather-only composition

**Purpose**: Let an orchestrating chef-pattern skill (e.g., a unified
daily-winddown that composes slack-digest + email-triage + meeting +
calendar outputs into one curated view) invoke a sub-skill in a
"gather-only" sub-mode. The sub-skill runs its gather + judge steps
and returns structured output WITHOUT proceeding to the engage step
or writing user-facing artifacts. The orchestrator collects gather-only
output from one or more sub-skills, composes the cross-source view, and
engages the user **once** at the end (per Pattern 1).

**Used by**: chef-pattern skills that another orchestrator will
reasonably compose. Phase 7a documents the pattern for `slack-digest`
and `email-triage`; Phase 8's unified daily-winddown reconciler is the
named consumer. Other chef skills may adopt gather-only mode as
orchestrator needs surface.

### When to offer gather-only mode

Offer gather-only mode when:

- The skill's gather + judge steps produce structured intelligence
  ("loops" — open threads, decisions, commitments) that an orchestrator
  could reasonably compose with other sources.
- The skill's engagement step is independently useful (so the standalone
  invocation path still ships value), but its outputs would be more
  useful composed than presented in isolation as a separate engagement.
- The user's experience improves when the orchestrator engages **once**
  with the cross-source view rather than running the sub-skill
  standalone and engaging separately.

Do **not** offer gather-only mode when:

- The skill is a pure judgment/synthesis pass (no structured output
  another skill could consume).
- The skill's engagement step is the deliverable (e.g., `meeting-prep`
  produces a prep brief for the user, not loops for another skill).

### Invocation convention

Gather-only mode is an **agent-level instruction string**, NOT a CLI
flag. Chef-pattern skills are SKILL.md prose, not CLI commands —
invocation happens via the orchestrator's prompt to the sub-agent.

The canonical invocation marker is `[gather-only]` at the top of the
invocation prompt. The orchestrator includes a sentence like:

> "Run the slack-digest skill in `[gather-only]` mode. Return the
> structured loop output described in slack-digest SKILL.md's
> 'Gather-only mode' section. Do NOT engage the user, write
> `resources/notes/`, or propose actions — those run only when invoked
> standalone."

The sub-agent reads the SKILL.md gather-only mode section to learn
which steps to skip.

### JSON output shape conventions

A gather-only skill returns an array of "loops" — observable
intelligence units that the orchestrator can reconcile and stage.
The canonical shape is:

```json
{
  "skill": "slack-digest",
  "mode": "gather-only",
  "loops": [
    {
      "source": "slack",
      "source_ref": "channel-id/thread-ts",
      "counterparty": "anthony-avina",
      "timestamp": "2026-05-27T14:32:00Z",
      "text": "Anthony asked if the API spec is ready — second ping this week.",
      "evidence_pointer": "slack://team/C0123ABC/p1716822720000",
      "kind": "open-thread",
      "confidence": 0.82
    }
  ]
}
```

Required per-loop fields:

| Field | Type | Description |
|---|---|---|
| `source` | string | The skill / channel the loop came from (`slack`, `email`, `calendar`, `meeting`). |
| `source_ref` | string | Stable reference to the underlying primitive (channel id, thread id, message id). |
| `counterparty` | string \| null | Person slug if resolved; null if unresolved. |
| `timestamp` | ISO 8601 | When the loop's underlying signal happened. |
| `text` | string | One-sentence description of the loop, in the skill's own words. |
| `evidence_pointer` | string | A URI-like pointer the orchestrator can surface to the user as "see source". |
| `kind` | string | Skill-specific category (`open-thread`, `commitment`, `decision`, `incoming-ask`, etc.). |

Optional fields the orchestrator may use:

- `confidence` — 0.0-1.0 score from the sub-skill's `significance_analyst`.
- `area` — area slug if the loop maps to a known area.
- `topics` — topic slugs (biased toward active list).
- `dedup_key` — a stable key the orchestrator can use to dedup across sources.

### How orchestrators consume

1. Invoke sub-skill with `[gather-only]` marker.
2. Parse returned JSON (permissive parser — ignore unknown fields,
   error only on missing required fields).
3. Validate the shape: is the response JSON? Does it match the loop
   shape? If a sub-skill returned a curated view in chat instead of
   structured output, log a contract violation and continue with
   whatever structured signal can be salvaged.
4. Merge loops from multiple sources by `counterparty` + `dedup_key`
   (or `text` similarity if no key).
5. Compose into the orchestrator's curated view per Pattern 1
   (`do-all-work-then-engage`). Use Pattern 2 reason labels referencing
   the sub-skill source (`— slack thread, 3 days idle`).
6. Engage user **once** with the composed view.

### Contract (skill author's responsibility)

A skill in gather-only mode SHOULD NOT:

- Write to `resources/notes/`, `.arete/memory/`, or any user-facing
  artifact location.
- Propose actions in the curated chat view (no `## Proposed actions`
  section — the orchestrator composes its own).
- Engage the user (no curated view in chat — the orchestrator engages,
  not the sub-skill).
- Run `arete commitments create/resolve`, `arete topic refresh`, or
  any write-CLI verb.

A skill in gather-only mode SHOULD:

- Run its gather steps (CLI/MCP pulls, search queries).
- Run its judge steps (`significance_analyst`, dedup-against-existing).
- Return structured loop JSON to the orchestrator.
- Be permissive about partial state — if a primitive fails, return
  loops from the primitives that succeeded plus a `partial: true` flag.

### Explicit limitation — best-effort prose contract

This pattern is **enforced only by the sub-agent following its
SKILL.md instructions**. There is no code-level gate. A sub-agent that
violates the contract (writes `resources/notes/`, engages user instead
of returning JSON, runs write-CLI verbs) is not blocked by the harness.

The chef pattern fundamentally relies on agents following prose
contracts (Pattern 1 `do-all-work-then-engage` has the same shape —
the harness doesn't enforce "no engagement between gather and engage";
the agent does). Adding code enforcement only for gather-only mode
would be a mismatched layer.

**Implication for orchestrators**: validate sub-skill output
structurally (is the response JSON? does it match the loop shape?).
Surface a warning if the sub-skill engaged the user or returned
non-JSON. Side-effects (e.g., disk writes during gather-only) are
not detectable from the orchestrator and are accepted as residual
risk. Orchestrators MUST NOT depend on the contract for correctness —
treat sub-skill output as advisory, validate before staging, and
gracefully degrade when structure is wrong.

### Calendar pull semantics (for orchestrator consumers)

The `arete pull calendar` CLI is not a chef skill (it's a CLI
primitive, not a SKILL.md), but Phase 8 reconciler consumes it the
same way it consumes gather-only output from slack-digest /
email-triage. For reconciler consumers:

- `arete pull calendar --today --json` returns all events on the
  user's calendar today, regardless of organizer. Events organized by
  others where the user is an attendee ARE returned (the Google
  Calendar `events.list` endpoint defaults include all visible events).
- `arete pull calendar --json` (no `--today`) returns events from now
  through the next 7 days. Phase 7a added the `--days N` flag to
  parameterize the forward window for reconciler use; default remains
  7 days.
- Declined events ARE included (Google Calendar API does not filter
  declined by default). If the reconciler wants to exclude declined,
  it must filter by `attendee.responseStatus === 'declined'` itself —
  the JSON output does not include `responseStatus` today; this is a
  known gap (see Phase 7a build-report AC6).
- Each event includes `organizer.self` (boolean) so the reconciler
  can distinguish user-organized from invited events without
  additional context.

For reconciler skip rules: "calendar event matching {attendees:
X+Y, status: scheduled, start: today-or-future} exists" is computable
from the existing `arete pull calendar --days N --json` output. No
additional CLI work needed beyond the `--days` honoring shipped in
Phase 7a.

### Content (per-skill)

Each skill that supports gather-only mode adds a `## Gather-only mode`
section to its SKILL.md specifying:

- The invocation marker (per the canonical convention above).
- Which steps run in gather-only mode and which DON'T (especially:
  no write-back to `resources/notes/`, no engagement, no proposed
  actions).
- The JSON output shape this skill emits (an array of loops; example
  block included so the orchestrator can pin against drift).
- The contract: which side-effects the skill MUST skip in gather-only
  mode.

**See also**: `do-all-work-then-engage` (Pattern 1) — the standalone
invocation path. Gather-only mode is an alternate entry point that
returns structured output instead of engaging.


---

## propose-edits-back-to-source-doc

**Purpose**: Flow outcomes BACK into a source-of-truth document (a project README, staged memory items, a wiki page) through an itemized, approval-gated proposal — never through silent writes. This is the write-back counterpart of `do-all-work-then-engage`: the agent does all scan/judgment work upfront, then proposes concrete edits to the document and applies EXACTLY what the user approves.

**Used by / named instances**:

- **daily-winddown** — proposes collapses/stages to the staged-items surface (`## Closed today (proposed)`, `## Stage for approval`).
- **/update-project** — proposes README edits from the "what's new since last touched" scan (Phase 14; the June-fixation case is the canonical worked example).
- **published-doc-sync** (future) — will propose wiki-page supersessions when published docs contradict recorded decisions.

### Envelope (prescriptive)

1. **Scan deterministically, propose judgmentally.** The data path is CLI/primitive output (e.g., `arete project open --json`); the LLM's judgment composes proposals ON TOP of it and never replaces the scan.
2. **Itemized typed proposals.** Each proposed edit is ONE item from a small typed menu the skill defines (e.g., status update, decision/learning to log, open question, meeting link, cache refresh, commitment claim). One item = one approvable unit. No omnibus "apply all my changes" items.
3. **Source attribution on every item.** Each item quotes the source that justifies it (which meeting, topic page, or commitment) so the user can audit the claim before approving. When the source's own provenance is machine-inferred (e.g., a meeting whose `area_set_by: backfill`), the item carries a visible verify hint — attribution must not lend false authority.
4. **Per-item approval; apply exactly the approved set.** The user approves/edits/skips per item (the daily-winddown `## Proposed updates` interaction). The agent applies precisely the approved items — nothing more, even when it is confident about the rest.
5. **Reject-leaves-untouched.** Rejecting every item leaves the target document byte-identical. There is no "while I was in there" tidying.
6. **Change-gated persistence (R2 corollary).** Any machine-owned cache the flow maintains (e.g., `topics:` frontmatter) is written ONLY when its content actually changes — same value set → zero write calls, no freshness-stamp churn in git. Enforce this in tested code (a CLI verb with a counting-adapter test), not in prose.

### Verification honesty

The apply/reject discipline on the SKILL path is LLM-mediated and not CI-provable; pin it in prose tests, enforce write-safety in the tested verbs the skill calls, and verify the live behavior in a named soak. Say which is which in the skill's own prose.

### Content (per-skill)

Each adopting skill's SKILL.md specifies: the typed proposal menu, the scan command(s), the approval surface format, the persistence verb(s) it is allowed to call after approval, and a named worked example of "propose the correction; touch nothing else."

**See also**: `do-all-work-then-engage` (the engagement envelope), `propose-with-mcp-action` (action proposals — sibling pattern for verbs rather than document edits), `extract_decisions_learnings` (the never-write-without-approval rule this pattern generalizes).
