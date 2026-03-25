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
| `fathom` | Meeting output | `templates/outputs/fathom/` | `meeting` |
| `krisp` | Meeting output | `templates/outputs/krisp/` | `meeting` |

> **Template path convention**: Integration skills (fathom, krisp, calendar, notion) use `templates/outputs/{skill-id}/` for workspace override paths. Older skills use descriptive paths (e.g. `templates/meeting-agendas/`, `templates/projects/`). Both conventions are supported. **New skills should use `templates/outputs/{skill-id}/`**.

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

**Used by**: meeting-prep, daily-plan, prepare-meeting-agenda (for suggested agenda items; gather when meeting has specific purpose, named attendees, or relevant plan files—see skill step 4)

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
- For task-management view (week-review/week-plan): use `arete commitments list` — returns structured commitment data for review/resolution.
- Do NOT call both in the same step — they overlap on commitment data.

---

## get_area_context

**Purpose**: Given a meeting title OR area slug, retrieve the relevant area's context — recurring meeting mappings, current state, key decisions, and backlog. Use this to enrich meeting prep, route extracted intelligence, and maintain area-specific knowledge.

**Used by**: meeting-prep, process-meetings, daily-plan, week-plan

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
  // Inject context.sections.currentState, context.sections.keyDecisions, etc.
}

// Direct by slug (e.g., when area is already known)
const context = await parser.getAreaContext('glance-communications');
if (context) {
  console.log(context.sections.currentState); // "Partnership progressing well..."
  console.log(context.sections.keyDecisions); // "- 2026-03-01: Use REST API..."
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

## Current State
Partnership is progressing well. API integration complete.

## Key Decisions
- 2026-03-01: Use REST API instead of GraphQL
- 2026-02-15: Monthly partner reviews

## Backlog
- Add webhook support
- Performance optimization
```

**Integration with other patterns**:
- **meeting-prep**: Use `get_area_context` after attendee resolution to inject area-specific context
- **process-meetings**: Use `getAreaForMeeting()` to route extracted decisions to the correct area file
- **daily-plan**: Use for today's meetings to show area context in daily focus
- **week-plan**: Aggregate area states for weekly planning view

---

## extract_decisions_learnings

**Purpose**: Scan content for candidate decisions and learnings, present for inline review, write approved items to memory.

**Used by**: process-meetings, finalize-project

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

**Used by**: process-meetings, meeting-prep, prepare-meeting-agenda

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

**Used by**: fathom (process-meetings via fathom pull), krisp (process-meetings via krisp pull), process-meetings

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

**Used by**: process-meetings (before significance_analyst), meeting-prep (before relationship_intelligence), week-review (before significance_analyst)

**Inputs**: Topic string, list of relevant person slugs (optional).

**Steps**:

1. **Derive topic string** — Use meeting title + first 100 characters of summary or key points. For week-review, use the week's focus areas. Do not use raw filenames as topics.

2. **Gather strategy & goals** — Run `arete search "<topic>" --scope context`. Take the top 3 results, max 300 words each. If results are empty, note: `context_quality: sparse-strategy`.

3. **Gather existing memory** — Run `arete search "<topic>" --scope memory`. Take the top 5 results, max 200 words each. If results are empty, note: `context_quality: sparse-memory`.

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

## significance_analyst

**Purpose**: Context-aware judgment about what from this content actually matters given everything we know — the builder's strategy, goals, existing decisions, and relationship context. Replaces keyword scanning with reasoning.

**Used by**: process-meetings (Step 7 — extraction to workspace memory), week-review (weekly significance assessment)

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

**Used by**: meeting-prep (after get_meeting_context), people-intelligence

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

