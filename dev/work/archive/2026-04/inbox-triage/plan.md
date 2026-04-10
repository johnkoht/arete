---
title: "Inbox: Universal Content Ingest & Triage"
slug: inbox-triage
status: complete
size: medium
tags: [inbox, ingest, triage, skill, workspace]
created: "2026-04-06T00:00:00.000Z"
updated: "2026-04-06T00:00:00.000Z"
completed: "2026-04-06"
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 4
---

# Inbox: Universal Content Ingest & Triage

## Context

Arete ingests structured data from integrations (meetings, calendar, Fathom, Slack) but has no general-purpose path for "I found something interesting and want it in my workspace." Users currently have no friction-free way to dump a URL, article, PDF, screenshot, or raw note and have it end up in the right place.

Karpathy's LLM Knowledge Bases tweet (April 2026) describes exactly this pattern: raw data -> indexed directory -> LLM compiles and routes. Arete already has the compile/route infrastructure -- it just lacks the front door.

**Inspiration:** https://x.com/karpathy/status/2039805659525644595

### What exists today

- `templates/inputs/` -- integration transform templates (meeting-note, integration-meeting). Not user-facing. **Stays unchanged.**
- `resources/notes/` -- defined in workspace structure, mostly unused.
- `projects/{active}/inputs/` -- project-scoped research inputs. **Stays unchanged** (different lifecycle, project-scoped).
- `inputs/onboarding-dump/` -- referenced by `rapid-context-dump` and `getting-started` skills for initial context bootstrapping. **Not formally in workspace structure** (no entry in `BASE_WORKSPACE_DIRS`). **Replaced by `inbox/`.**

### Design decisions

1. **`inbox/` replaces top-level `inputs/`** -- The onboarding dump use case is a subset of inbox ("here's a bunch of stuff, process it into the right places"). `inbox/` is the permanent, universal version of that pattern. Skills that reference `inputs/onboarding-dump/` will be updated to use `inbox/`.

2. **Destination-first, not capture-first** -- What matters is that content lands in `inbox/` with reasonable structure. How it gets there is the user's choice: Obsidian web clipper, Chrome extensions, agent chat, manual file drop, or a lightweight CLI helper. The real intelligence is in triage, not capture.

3. **Interactive triage for ambiguity** -- When routing confidence is low, the skill presents items for user decision rather than guessing. Same approval gate pattern used in `execute-prd` and `people-intelligence`.

4. **Route from areas and projects, not just content type** -- Triage uses significance analysis grounded in the user's actual goals, active projects, and area context to make routing decisions.

---

## LLM Pattern References

The triage skill composes several established patterns. Implementers should read these before building:

| Pattern | Location | Relevance to triage |
|---------|----------|-------------------|
| `research_intake` | `PATTERNS.md:420` | Closest existing pattern -- processes bulk `inputs/` docs into analysis + synthesis. Triage generalizes this to the whole workspace. |
| `significance_analyst` | `PATTERNS.md:640` | Context-aware judgment about what matters given strategy/goals. Triage uses this to decide routing priority, not just content type. |
| `context_bundle_assembly` | `PATTERNS.md:524` | Assembles strategy + memory + people context before reasoning. Triage builds a bundle before making routing decisions. |
| Relevance rubric | `email-triage/SKILL.md:33` | Three-tier classification (High/Medium/Low) with explicit criteria. Triage adapts this for content importance. |
| Uncertainty-safe classification | `people-intelligence/SKILL.md` | Low-confidence candidates routed to `unknown_queue` with evidence. Triage uses same pattern: ambiguous items stay in inbox with a note. |
| Entity resolution | `process-meetings/SKILL.md` | Matches people, projects, areas from content. Triage reuses this for entity extraction. |
| `synthesize` | `synthesize/SKILL.md` | Extraction pattern: inventory inputs, extract facts/interpretations/questions, cross-analyze for patterns. |

---

## Critical Files

| File | Role |
|------|------|
| `packages/core/src/workspace-structure.ts` | Add `inbox/` to workspace dirs, remove any `inputs/` top-level reference |
| `packages/runtime/skills/inbox-triage/SKILL.md` | **New** -- triage skill definition |
| `packages/runtime/skills/PATTERNS.md` | Add `inbox_triage` pattern + cross-reference with `research_intake` (document: research_intake is project-scoped, inbox_triage is workspace-scoped; triage may route TO a project's inputs/ where research_intake later processes) |
| `packages/core/src/search/qmd-setup.ts` | Ensure `inbox/` is indexed for search |
| `packages/runtime/skills/rapid-context-dump/SKILL.md` | Update `inputs/onboarding-dump/` -> `inbox/` |
| `packages/runtime/skills/getting-started/SKILL.md` | Update `inputs/onboarding-dump/` -> `inbox/` |
| `packages/core/src/utils/context-dump-quality.ts` | Update `inputs/onboarding-dump/` reference |
| `packages/cli/src/commands/inbox.ts` | **New** -- `arete inbox add` helper command |
| `packages/cli/src/index.ts` | Register `registerInboxCommand(program)` |
| `packages/cli/test/commands/inbox.test.ts` | **New** -- unit tests for inbox command |
| `AGENTS.md` | Add `arete inbox add` to `[CLI]` section |
| `dev/catalog/capabilities.json` | Add `inbox-cli` and `inbox-triage-skill` entries |

---

## Plan

### Step 1 -- Add `inbox/` to workspace structure and migrate from `inputs/`

**Before starting**: Read `packages/core/src/workspace-structure.ts` in full. Read how `arete install` and `arete update` create directories. Read `packages/core/src/search/qmd-setup.ts` to understand search indexing scope. Grep for all references to `inputs/onboarding-dump` across the codebase.

**Changes:**

- Add `'inbox'` to `BASE_WORKSPACE_DIRS` in `workspace-structure.ts`
- Add a default `inbox/README.md` to `DEFAULT_FILES`:
  ```markdown
  # Inbox

  Drop anything here for triage: articles, notes, PDFs, screenshots, research.

  Run `inbox-triage` to classify, route, and extract insights from inbox contents.

  Files can arrive from any source: web clippers, agent chat, manual drop, CLI.
  ```
- Add `inbox/` to QMD search scope (coordinated changes required across multiple files):
  - `packages/core/src/models/workspace.ts:49` -- add `'inbox'` to `QmdScope` type union
  - `packages/core/src/search/qmd-setup.ts:408` -- add `inbox: 'inbox'` to `SCOPE_PATHS`
  - `packages/core/src/search/qmd-setup.ts:422` -- add `'inbox'` to `ALL_SCOPES`
  - `packages/cli/src/commands/search.ts:56` -- add `'inbox'` to `VALID_SCOPES` (enables `--scope inbox`)
- Update `rapid-context-dump/SKILL.md`: replace `inputs/onboarding-dump/` with `inbox/` (folder reference and all prompt text)
- Update `getting-started/SKILL.md`: replace `inputs/onboarding-dump/` with `inbox/`
- Update `packages/core/src/utils/context-dump-quality.ts`: replace `inputs/onboarding-dump/` reference
- Update any test fixtures that reference `inputs/onboarding-dump/`

**AC:**
- `arete install` on a fresh workspace creates `inbox/` with `README.md`
- `arete update` on existing workspace adds `inbox/` if missing
- After `arete index`, `arete context --for "article about X"` searches inbox contents; `arete search "query" --scope inbox` returns results from inbox
- `rapid-context-dump` skill references `inbox/` not `inputs/onboarding-dump/`
- `getting-started` skill references `inbox/` not `inputs/onboarding-dump/`
- No remaining references to `inputs/onboarding-dump/` in codebase (verify with grep)
- `templates/inputs/` and project-level `inputs/` are **untouched**
- Typecheck passes, existing tests pass

**Verify:**
```bash
# Structure
arete install --dry-run | grep inbox

# Search indexing
arete context --for "test query" --inventory | grep inbox

# Migration completeness
grep -r "inputs/onboarding-dump" packages/ --include="*.ts" --include="*.md"
# Should return 0 results (excluding archive/dist)

# No regressions
npm run typecheck && npm test
```

---

### Step 2 -- Define inbox file contract and `arete inbox add` helper

**Before starting**: Read an existing simple CLI command to understand the command pattern. Read how `arete meeting add` works (similar: takes input, writes structured file). Read `templates/inputs/integration-meeting.md` for frontmatter patterns.

**Design principle**: The inbox is destination-first. Files can arrive from any source (Obsidian, Chrome extension, agent chat, manual drop). The file contract defines what triage expects; the CLI helper is a convenience, not the only path.

#### Inbox file contract

Any file in `inbox/` is a triage candidate. Supported formats:
- **Markdown** (`.md`): Parsed directly, frontmatter extracted if present
- **PDF** (`.pdf`): Agent reads and analyzes content using runtime PDF support
- **Images** (`.png`, `.jpg`, `.webp`): Agent describes content using vision, extracts text
- **Plain text** (`.txt`): Treated as markdown
- **Other**: Agent attempts to parse; flags as `needs-review` if unsupported

Triage handles files with or without frontmatter, but well-formed markdown files look like:

```yaml
---
title: "Article title or note name"
source: "https://example.com/article"    # URL, "clipboard", "manual", app name
clipped: 2026-04-06T12:00:00Z           # When it was captured
type: article                             # Optional hint: article, note, screenshot, pdf, research
status: unprocessed                       # unprocessed (default) | needs-review | triaged
tags: []                                  # Optional user tags
---

Content body in markdown...
```

**Required by triage**: None. Triage should handle raw files with no frontmatter (infers title from filename/content, sets status to unprocessed). Well-formed frontmatter just makes triage faster and more accurate.

#### `arete inbox add` command

Lightweight helper for CLI/agent use:

```bash
# Add from text (agent chat flow)
arete inbox add --title "Interesting insight" --source "agent-chat" --body "Content here..."

# Add from URL (fetch + convert to markdown)
arete inbox add --url "https://example.com/article"

# Add from file (copy into inbox with frontmatter)
arete inbox add --file ./path/to/document.pdf
```

**Implementation:**
- `--title` + `--body` + `--source`: Write markdown file to `inbox/{slug}.md` with frontmatter
- `--url`: Fetch page, extract title + body as markdown, write to `inbox/{slug}.md`. Use existing HTTP/markdown tooling if available; keep simple (no image downloading for v1)
- `--file`: Copy file to `inbox/`. If not markdown, also create a companion `{slug}.md` with frontmatter (source, type, status) so the file is discoverable by triage and searchable via QMD
- Slug derived from title or URL path
- Print confirmation with file path
- **CLI plumbing** (per CLI LEARNINGS.md):
  - Support `--json` flag -- output: `{ path, title, source, qmd }`)
  - Call `refreshQmdIndex()` after writing files (so new items are immediately searchable)
  - Include `--skip-qmd` option for testability
  - Use `displayQmdResult()` for QMD output in non-JSON mode
  - Register via `registerInboxCommand(program)` in `packages/cli/src/index.ts`
  - Follow `createServices(process.cwd())` -> `findRoot()` -> guard pattern

**AC:**
- `arete inbox add --title "Test" --body "Content"` creates `inbox/test.md` with correct frontmatter
- `arete inbox add --url "https://example.com"` fetches and creates `inbox/{slug}.md` with extracted title, source URL, and markdown content
- `arete inbox add --file ./doc.pdf` copies file to `inbox/` with companion `.md`
- Files without frontmatter in `inbox/` are still valid (triage handles them)
- Command appears in `arete --help` and `arete inbox --help`
- `--json` output returns `{ path, title, source, qmd }` on success; JSON error on failure
- `refreshQmdIndex()` called after write -- new items are immediately searchable
- `--skip-qmd` suppresses indexing for testability
- Command registered in `packages/cli/src/index.ts`
- Unit tests in `packages/cli/test/commands/inbox.test.ts` cover: `--title/--body` happy path, `--url` fetch + write, `--file` copy + companion .md creation, slug generation from title/URL, error when run outside workspace, `--json` output format
- Typecheck passes, tests pass

**Verify:**
```bash
# Basic add
arete inbox add --title "Test note" --body "This is a test" --source "manual"
cat workspace/inbox/test-note.md  # Check frontmatter + content

# JSON mode
arete inbox add --title "JSON test" --body "Content" --json
# Should return { path, title, source, qmd }

# URL add
arete inbox add --url "https://example.com"
ls workspace/inbox/  # Should contain new file

# File add
arete inbox add --file ./test.pdf
ls workspace/inbox/  # Should contain test.pdf + test-pdf.md (companion)

# Typecheck + tests
npm run typecheck && npm test
```

---

### Step 3 -- `inbox-triage` skill

**Before starting**: Read the following in full:
- `packages/runtime/skills/PATTERNS.md` -- especially `research_intake` (line 420), `significance_analyst` (line 640), `context_bundle_assembly` (line 524)
- `packages/runtime/skills/email-triage/SKILL.md` -- relevance rubric structure
- `packages/runtime/skills/people-intelligence/SKILL.md` -- uncertainty-safe classification
- `packages/runtime/skills/process-meetings/SKILL.md` -- entity resolution + area routing
- `packages/runtime/skills/synthesize/SKILL.md` -- extraction + synthesis pattern
- Workspace structure to understand all valid routing destinations

This is the core value of the feature. The skill composes multiple established patterns into a general-purpose content router grounded in the user's actual goals, projects, and areas.

**Important**: All cross-references in the SKILL.md must use relative paths (per skills LEARNINGS.md 2026-02-25). Use `../PATTERNS.md § significance_analyst`, never absolute build paths like `packages/runtime/skills/PATTERNS.md`. Skills are copied to user workspaces at `.agents/skills/` where absolute paths don't exist.

**Implementation layering** (from pre-mortem Risk 4 -- build MVP first, then enhance):
- **MVP**: Scan inbox, classify content type, extract entities via keyword/name matching, propose routing destinations, present approval table, move files. Verify end-to-end before adding enhancements.
- **Enhancement A**: Add context bundle assembly + significance analyst for grounded routing decisions (Phases 2 + 4 significance assessment).
- **Enhancement B**: Add memory update proposals (Phase 4 memory section + Phase 5 memory writes).
- Each layer should be independently testable. MVP must work before enhancements are added.

#### Skill definition: `inbox-triage/SKILL.md`

**Triggers**: "triage my inbox", "process inbox", "what's in my inbox", "inbox triage"

#### Workflow

##### Phase 1 -- Scan and inventory

1. List all files in `inbox/` (excluding README.md)
2. Separate into:
   - `unprocessed`: files with `status: unprocessed`, no status field, or no frontmatter
   - `needs-review`: files previously flagged for user decision
3. Report inventory: "Found N unprocessed items and M items needing review."
4. If `needs-review` items exist, present them first for user decision before processing new items.

##### Phase 2 -- Assemble context bundle

Before analyzing any content, build a context bundle (following `context_bundle_assembly` pattern):

1. **Strategy & goals** -- `arete context --for "inbox triage"` scoped to `goals/` and `context/` (top 3 results, max 300 words each)
2. **Active areas** -- List all areas with status: active, including their goals and focus sections
3. **Active projects** -- List all active projects with their descriptions and current status
4. **Existing memory** -- `arete memory search "recent decisions"` (top 5, max 200 words each)
5. **People context** -- List of known people slugs for entity matching

This bundle is assembled once and reused for all items in the batch.

##### Phase 3 -- Analyze each item

For each unprocessed item, apply the `significance_analyst` pattern:

1. **Read content** -- Parse the file, extract any existing frontmatter
2. **Classify content type** (supports markdown, PDF, images, and other files the agent runtime can parse):
   - article / blog post
   - research paper / report (including PDFs)
   - meeting note / conversation
   - person-specific intel
   - raw note / thought
   - decision / announcement
   - reference material
   - screenshot / image (use vision capabilities to describe content, extract text)
   - unsupported binary (flag as `needs-review` if agent can't parse)

3. **Extract entities** -- Match against workspace data:
   - **People**: Match names/emails against `people/` directory
   - **Projects**: Match topics/keywords against active projects
   - **Areas**: Match themes against area definitions and recurring meetings
   - **Goals**: Match content against active goals

4. **Assess significance** -- Using the context bundle, determine:
   - Is this actionable or reference material?
   - Does it connect to a current goal, project, or area?
   - Does it contain decisions, learnings, or observations worth capturing in memory?
   - Does it contradict or reinforce existing decisions?
   - **Grounding directive**: Cite specific bundle content that makes the routing decision. If you cannot cite specific context, routing confidence drops.

5. **Decide routing destination** with confidence level:

   | Destination | When to route here | Example |
   |------------|-------------------|---------|
   | `projects/active/{slug}/inputs/` | Content clearly maps to an active project | Research article matching a discovery project |
   | `areas/{slug}/` (as reference note) | Content relates to an area but no specific project | Industry trend relevant to a responsibility area |
   | `resources/notes/` | General reference material, no clear project/area match | Interesting article, useful but not urgent |
   | `resources/conversations/` | Conversation captures, interview notes | Slack thread, email exchange |
   | `people/{slug}/` | Person-specific intel (profile info, preferences, background) | LinkedIn profile, bio, contact info |
   | `.arete/memory/items/` | Contains decisions, learnings, or observations to append | Key insight that should be in institutional memory |
   | `inbox/` (stays) | Confidence < 0.6 or ambiguous routing | Interesting but unclear where it belongs |

6. **Generate summary** -- 2-3 sentence summary of the content and why it's being routed where it is.

##### Phase 4 -- Present triage plan and get confirmation

**Do not move files automatically.** Present the triage plan as a table:

```markdown
## Inbox Triage Plan

| # | Item | Type | Route to | Confidence | Why |
|---|------|------|----------|------------|-----|
| 1 | competitive-analysis.md | article | projects/active/market-research/inputs/ | high | Matches active market-research project; cites Q2 competitive analysis goal |
| 2 | interesting-thread.md | conversation | resources/conversations/ | medium | Slack thread with customer feedback; no clear project match |
| 3 | random-thought.md | note | inbox/ (stays) | low | Unclear routing -- needs your input |

### Items needing your input:
- **random-thought.md**: Could be relevant to [area-x] or [project-y]. Where should this go?

### Memory updates:
- **competitive-analysis.md** contains a decision: "Competitor X pivoted to API-first" -- append to `.arete/memory/items/learnings.md`? (Significant because it relates to our own API-first goal)

Approve all? [Y] Apply all  [N] Skip all  [1,2] Select items  [E] Edit routing
```

**Approval gate rules:**
- High confidence items (>= 0.8): Presented for approval but recommended to apply
- Medium confidence (0.6-0.8): Presented with reasoning, user decides
- Low confidence (< 0.6): Stays in inbox, user prompted for routing decision
- Memory updates: Always require explicit approval

##### Phase 5 -- Execute approved routing

For each approved item:

1. **Move file** to destination directory
2. **Update frontmatter**: Set `status: triaged`, add `triaged_to: <destination>`, add `triaged_date: <ISO date>`
3. **Update context** -- If approved for memory update, append to the appropriate memory items file
4. **Index** -- Run `arete index` if new files were added to searchable directories

##### Phase 6 -- Report

```markdown
## Triage Complete

Processed: 3 items
- Routed: 2 items
- Kept in inbox: 1 item (needs review)
- Memory updates: 1 decision added to learnings

Inbox remaining: 1 unprocessed item
```

**AC:**
- Skill appears in `arete skill list` with correct triggers
- Dropping 3+ different content types into `inbox/` and running triage produces correct classification for each
- Non-markdown files (PDFs, images) are analyzed using agent runtime capabilities and classified/routed like any other content
- Unsupported binary files flagged as `needs-review` rather than silently skipped
- Triage plan table includes a "Why" column citing specific workspace entities (project names, area names, goal text) -- not just content type classification
- Items routed to project `inputs/` when a clear project match exists
- Items routed to area directories when area context matches
- Ambiguous items stay in inbox with `status: needs-review` and an explanatory note
- User sees triage plan before any files are moved (approval gate)
- Memory updates (decisions, learnings) require explicit approval
- Moved files have updated frontmatter with triage metadata
- `arete context --for` finds content in new locations after triage

**Verify:**
```bash
# Setup: create test inbox items
echo "---\ntitle: API comparison\nstatus: unprocessed\n---\nCompetitor X launched..." > workspace/inbox/api-comparison.md
echo "---\ntitle: John's notes\nstatus: unprocessed\n---\nFrom 1:1 with Sarah..." > workspace/inbox/john-notes.md
echo "Random thought about product direction" > workspace/inbox/random.md  # No frontmatter

# Run triage (interactive -- verify approval gate appears)
# Verify each item classified and routed correctly
# Verify ambiguous items stayed in inbox
# Verify frontmatter updated on moved files
# Verify memory updates only applied after approval

# Search verification
arete context --for "API comparison"  # Should find in new location

# Regression
npm run typecheck
```

---

### Step 4 -- Integration with existing workflows

**Before starting**: Read how `arete status` reports workspace health. Read how `arete pull` works. Read `arete skill list` output format.

**Changes:**

- **`arete status`**: Add inbox item count to status output:
  ```
  Inbox: 3 unprocessed, 1 needs review
  ```
  **Implementation**: In `packages/cli/src/commands/status.ts`, after `services.workspace.getStatus()`, read `inbox/` directory via `services.storage.list(inboxPath)`. For each `.md` file, parse frontmatter and extract `status` field. Count by status value (files with no frontmatter or no status field count as `unprocessed`). Add to both formatted and `--json` output. If directory is empty or doesn't exist, omit the line (or show "Inbox: empty").

- **`arete skill list`**: Verify `inbox-triage` appears with correct description and triggers

- **`arete pull` integration**: **Manual-only for v1.** Add a note to `arete pull` output when inbox has unprocessed items:
  ```
  Tip: You have 3 unprocessed items in inbox/. Run inbox-triage to process them.
  ```
  Do NOT auto-run triage after pull. Triage requires user approval and should be intentional.
  **Implementation**: In `packages/cli/src/commands/pull.ts`, add an inbox check after all pull operations complete (in the shared pull flow, not per-subcommand). Reuse the same inbox counting logic from status. For `--json` output, include `inbox: { unprocessed: N }` in the response. For formatted output, use `info()` formatter. Only show when count > 0.

- **Inbox-aware skills (fast-follow, not v1 blocker)**: After core triage ships, add inbox awareness to planning skills:
  - `daily-plan`: Check inbox count at start. If items exist: "You have N unprocessed items in inbox -- want me to triage before planning?"
  - `week-plan`: Same check. If items have been sitting 3+ days (check `clipped` date or file mtime), add a "Triage inbox" chore to `now/tasks.md`.
  - Pattern: skills ask, user decides. Never auto-triage.
  - Keep changes minimal and non-blocking -- one line check at skill start, not woven into core workflow.

- **Onboarding flow update**: Update `getting-started` skill to mention inbox as the permanent capture location (not just onboarding):
  ```
  Drop files into inbox/ -- this is your universal capture folder.
  Run inbox-triage anytime to classify and route content to the right place.
  ```

- **AGENTS.md**: Add `arete inbox add` to the `[CLI]` section with options and description.

- **`dev/catalog/capabilities.json`**: Add entries for:
  - `inbox-cli` — the `arete inbox add` command
  - `inbox-triage-skill` — the inbox-triage skill

**AC:**
- `arete status` shows inbox count with breakdown by status (0 items: omit or "empty"; N items: "N unprocessed, M needs review")
- `arete status --json` includes `inbox: { unprocessed: N, needsReview: M }` in output
- `inbox-triage` appears in `arete skill list`
- `arete pull` shows inbox tip when unprocessed items exist; omits when empty
- `arete pull --json` includes `inbox: { unprocessed: N }` in output
- `arete pull` does NOT auto-run triage
- AGENTS.md `[CLI]` section includes `arete inbox add` with options
- `dev/catalog/capabilities.json` has entries for `inbox-cli` and `inbox-triage-skill`
- Unit tests: `arete status` with 0/1/N inbox items shows correct count; `arete pull` shows/hides tip correctly
- (Fast-follow) `daily-plan` checks inbox count and offers triage if items exist
- (Fast-follow) `week-plan` checks inbox staleness and adds triage chore to tasks if items are 3+ days old
- `getting-started` references `inbox/` as permanent capture, not just onboarding
- Typecheck passes, tests pass

**Verify:**
```bash
# Status with items
arete status | grep -i inbox  # Should show count

# Status without items (empty inbox)
# Should show "Inbox: empty" or omit the line

# Skill listing
arete skill list | grep inbox-triage

# Pull tip (with items in inbox)
arete pull 2>&1 | grep -i inbox  # Should show tip

# Typecheck + tests
npm run typecheck && npm test
```

---

## Resolved Questions

1. **Image handling in `arete inbox add --url`**: Skip for v1. Revisit if users report broken content.

2. **Bulk triage UX**: Full table for v1. Iterate based on usage if 10+ item batches become common.

3. **Triage frequency**: Manual-only, but inbox-aware. Other skills that interact with the user should surface inbox state opportunistically:
   - `daily-plan` / `week-plan`: "You have 5 unprocessed items in inbox -- want me to triage before planning?"
   - `arete status`: Shows count (Step 4)
   - `arete pull`: Shows tip (Step 4)
   - If inbox items go stale (e.g., 3+ days unprocessed), `week-plan` can add a "triage inbox" chore to `now/tasks.md`
   - This is a v1 awareness pattern, not auto-execution. Skills ask, user decides.

4. **Non-markdown files**: **In scope for v1.** LLM agents can already parse PDFs, images, and other file types when presented in context (users do this daily in Claude/Cursor). The triage skill should:
   - For PDFs: Read and analyze content directly (the agent runtime supports this)
   - For images/screenshots: Describe content using vision capabilities, extract any text
   - For other binary files: Analyze if agent runtime supports the format, otherwise flag as `status: needs-review`
   - **Graceful degradation tiers** (from pre-mortem Risk 2):
     - Tier 1 (guaranteed): `.md`, `.txt` -- direct content reading
     - Tier 2 (best-effort): `.pdf` -- attempt to read; if agent can't parse, create companion `.md` stub
     - Tier 3 (environment-dependent): images -- attempt vision; if unavailable, create stub noting "image file, manual review needed"
   - The skill must never fail on an unsupported file -- always produce a `needs-review` stub

5. **Companion .md for binary files**: When triage processes a non-markdown file, it creates a `{filename}.md` companion with frontmatter + extracted content summary. The original binary stays alongside it. Rationale: `.md` files are searchable via QMD, parseable by all skills, and follow existing workspace conventions. When the file is routed, both the binary and its companion `.md` move together.

## Open Questions

None remaining. All questions resolved.
