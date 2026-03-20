# Process Meeting Refactor — Notes

## Problem Statement

Meeting processing in Areté is currently monolithic — the `process-meetings` skill contains all logic as agent instructions. This makes it:
- Hard to compose (can't reuse pieces in other skills like daily-winddown)
- Hard to extend (users can't bring their own agenda source)
- Hard to test (logic lives in markdown, not code)

## Design Principle

**Hybrid composition**: Decompose where it helps, consolidate where context matters.

| Phase | Composition? | Rationale |
|-------|--------------|-----------|
| Context Assembly | ✅ Composable tools | Mostly deterministic, reusable, no/light AI |
| Intelligence Extraction | ❌ Single AI call | Interrelated outputs benefit from full context |
| State Updates | ✅ Composable tools | Independent writes, parallelizable |

---

## Primitives Catalog

### Phase 1: Context Assembly

#### `arete meeting context <file>` — **NEW**
Assembles full context bundle for a meeting.

**What it does:**
1. Reads meeting file (title, date, attendees, transcript)
2. Finds and reads linked agenda (if exists via frontmatter `agenda:` field)
3. Resolves attendees → pulls person profiles with memory highlights
4. Identifies related goal/project → pulls relevant context
5. Runs semantic search for related workspace context

**Input:** Meeting file path
**Output:** JSON context bundle

```json
{
  "meeting": { "title": "...", "date": "...", "transcript": "..." },
  "agenda": { "path": "...", "items": [...], "unchecked": [...] },
  "attendees": [
    { "slug": "jane-smith", "profile": "...", "stances": [...], "openItems": [...] }
  ],
  "entities": {
    "goal": { "slug": "q2-revenue", "context": "..." },
    "project": { "slug": "api-redesign", "context": "..." }
  },
  "relatedContext": [ /* search results */ ]
}
```

**Flags:**
- `--json` — output as JSON (required for piping)
- `--skip-agenda` — don't look for linked agenda
- `--skip-people` — don't resolve attendee context

---

#### Existing primitives (no changes needed):
- `arete resolve` — entity resolution
- `arete people show <slug> --memory` — person context
- `arete search` — semantic search
- `arete brief` — assemble context for a topic

---

### Phase 2: Intelligence Extraction

#### `arete meeting extract <file>` — **ENHANCE**
Extract all intelligence from meeting with context injection.

**What it does:**
1. Takes transcript + context bundle
2. Single LLM call that produces:
   - Summary/takeaways
   - Action items (with owner, direction, priority based on context)
   - Decisions
   - Learnings
   - Next steps
3. Validates/filters garbage (existing logic)
4. Returns structured intelligence JSON

**Input:** Meeting file + context bundle
**Output:** Intelligence JSON

```json
{
  "summary": "...",
  "takeaways": ["...", "..."],
  "actionItems": [
    { 
      "owner": "jane-smith", 
      "description": "...", 
      "direction": "i_owe_them",
      "priority": "high", 
      "priorityRationale": "Relates to Q2 goal",
      "counterpartySlug": "john-doe"
    }
  ],
  "decisions": ["..."],
  "learnings": ["..."],
  "nextSteps": ["..."]
}
```

**Enhancement needed:**
- Accept `--context <bundle.json>` or `--context -` (stdin)
- Use context for smarter extraction:
  - Priority ranking based on goals/projects
  - Better owner resolution (knows internal vs external)
  - Agenda item merging (unchecked → action items)
  - Dedup against existing commitments

**Flags:**
- `--context <file>` — context bundle (JSON file or `-` for stdin)
- `--json` — output as JSON
- `--stage` — write staged sections to meeting file (existing behavior)

---

### Phase 3: State Updates

#### `arete meeting apply <file>` — **NEW**
Write staged sections to meeting file (pre-approval).

**What it does:**
1. Writes staged sections to meeting file (summary, action items, decisions, learnings)
2. Updates meeting frontmatter (`status: processed`, `processed_at`)
3. Archives linked agenda (`status: processed` in agenda frontmatter)

**What it does NOT do (happens after approval):**
- Update person files — done via `people memory refresh`
- Create commitments — done via `people memory refresh`
- Write to memory — done via `meeting approve`

**Input:** Meeting file + intelligence JSON
**Output:** Summary of what was written

**Flags:**
- `--intelligence <file>` — intelligence JSON (or `-` for stdin)
- `--skip agenda` — don't archive linked agenda (e.g., no agenda exists)

---

#### Existing primitives (no changes needed):
- `arete meeting approve <slug>` — commit staged sections to memory
- `arete people memory refresh --person <slug>` — refresh person highlights + sync commitments
- `arete commitments list/resolve` — commitment management

---

### DEFERRED: Phase 4 Primitives (Post-V1)

The following are designed but deferred to post-V1:

#### `arete memory add` — **DEFERRED**
Source-agnostic write to memory. Useful for synthesis results, imports, manual entries.
See Future Work section for details.

#### `arete intelligence synthesize` — **DEFERRED**
Cross-meeting pattern detection. Useful for daily-winddown, weekly review.
See Future Work section for details.

---

## How `process-meetings` Skill Uses Primitives

The skill becomes thin orchestration over primitives:

```markdown
## Workflow

### 1. Gather Meetings
List meeting files: `arete meeting list --days-back 7` (or `--today`, `"search term"`)
Note: Meetings come from resources/meetings/, not directly from calendar.

### 2. For Each Meeting — Extract Intelligence

**Build context:**
arete meeting context <file> --json > context.json

**Extract intelligence:**
arete meeting extract <file> --context context.json --json > intelligence.json

**Or piped:**
arete meeting context <file> --json | arete meeting extract <file> --context - --stage

### 3. Write Staged Sections (pre-approval)
arete meeting apply <file> --intelligence intelligence.json

This handles ONLY:
- Writing staged sections to meeting file (## Staged Action Items, etc.)
- Updating meeting frontmatter (status: processed, processed_at)
- Archiving linked agenda (status: processed)

Does NOT touch people files or commitments — those happen after approval.

### 4. User Review (staged mode)
User reviews staged sections in `arete view` web app or CLI.
Approves / edits / skips items.

### 5. After Approval
arete meeting approve <slug>  # commits decisions/learnings to memory
arete people memory refresh --person <slug>  # updates person files + syncs commitments

### 6. Report
Report: meetings processed, items staged, agendas archived.
After approval: people updated, commitments synced.
```

---

## Composition Examples

### Simple: Process one meeting
```bash
arete meeting context meeting.md --json \
  | arete meeting extract meeting.md --context - --json \
  | arete meeting apply meeting.md
```

### No agenda (listening-only meeting)
```bash
arete meeting context meeting.md --skip-agenda --json \
  | arete meeting extract meeting.md --context - --json \
  | arete meeting apply meeting.md --skip agenda
```

### Custom source (Notion agenda → Areté)
```bash
# User's custom script outputs Areté context format
./my-notion-pull.sh "Weekly Sync" --json \
  | arete meeting extract meeting.md --context - --json \
  | arete meeting apply meeting.md
```

### Daily winddown pattern
```bash
# 1. Get today's meetings
meetings=$(arete meeting list --today --paths)

# 2. Extract each (parallel)
for m in $meetings; do
  (
    arete meeting context "$m" --json \
      | arete meeting extract "$m" --context - --json \
      > "extractions/$(basename $m .md).json"
  ) &
done
wait

# 3. Synthesize across all
arete intelligence synthesize --input extractions/*.json --json > today.json

# 4. Apply state updates for each meeting
for m in $meetings; do
  arete meeting apply "$m" --intelligence "extractions/$(basename $m .md).json"
done

# 5. Write cross-meeting learnings
arete memory add --from-json today.json --type learning --require-approval
```

---

## What's In Scope for V1

| Primitive | Status | Notes |
|-----------|--------|-------|
| `meeting context` | **NEW** | Assembles context bundle |
| `meeting extract` | **ENHANCE** | Add `--context` injection |
| `meeting apply` | **NEW** | Writes staged sections + archives agenda |

**Existing (no changes):**
- `meeting approve` — commits staged sections to memory
- `people memory refresh` — updates person files + syncs commitments
- `resolve`, `search`, `people show --memory` — context helpers

**Deferred to post-V1:**
- `memory add` — source-agnostic memory write
- `intelligence synthesize` — cross-meeting patterns

---

## Decisions (Resolved)

1. **Context bundle schema** — Finalized (see schema below). Use `arete brief` for related context.

2. **Brief query** — Use meeting title only (not attendees) to avoid noise. `arete brief --for "<meeting title>"`

3. **Goal/project inference** — Handled by brief service. No custom goal matching needed.

4. **Priority in extraction** — Focus on action item QUALITY over priority. Detect commitment language ("I'll get that today" vs. vague). Priority is secondary.

5. **Error handling** — Skip + warn. If person lookup fails, continue without that context. Agent can ask at end: "Jane Smith wasn't a tracked person, do you want to add them?"

6. **Agenda marker** — Dropped. No `*(from agenda)*` suffix needed.

7. **Web app** — Add Task 5 to update backend to use new primitives.

8. **Backward compatibility** — `meeting extract` without `--context` works exactly as before.

---

## Context Bundle Schema (Finalized)

```typescript
interface MeetingContextBundle {
  meeting: {
    path: string;           // "resources/meetings/2026-03-19-product-sync.md"
    title: string;          // "Product Sync"
    date: string;           // "2026-03-19"
    attendees: string[];    // ["jane.smith@acme.com", "john@company.com"]
    transcript: string;     // Full transcript text
  };
  
  agenda: {
    path: string;           // "now/agendas/2026-03-19-product-sync.md"
    items: AgendaItem[];    // All items with checked status
    unchecked: string[];    // Just unchecked item texts (for merging)
  } | null;                 // null if no agenda found
  
  attendees: Array<{
    slug: string;           // "jane-smith"
    email: string;          // "jane.smith@acme.com"
    name: string;           // "Jane Smith"
    category: string;       // "internal" | "customers" | "users"
    profile: string;        // Profile summary
    stances: string[];      // Key stances
    openItems: string[];    // Open items with this person
    recentMeetings: string[]; // Recent meeting titles
  }>;
  
  // Unknown attendees (no person file found)
  unknownAttendees: Array<{
    email: string;
    name: string;
  }>;
  
  // From arete brief --for "<meeting title>"
  relatedContext: {
    goals: Array<{ slug: string; title: string; summary: string }>;
    projects: Array<{ slug: string; title: string; summary: string }>;
    recentDecisions: string[];
    recentLearnings: string[];
  };
  
  // Warnings/diagnostics
  warnings: string[];       // ["No profile found for jane.smith@acme.com"]
}
```

---

## Out of Scope (Phase 1)

- Daily winddown skill (lives in user's project, not Areté)
- Notion/Asana/external integrations (users build these, we provide the primitive contracts)
- Web app changes (web app will use new primitives, but UI unchanged)

---

## Phase 2 (after Phase 1 ships)

These are designed and ready for Phase 2 discussion:

1. **`memory add` primitive** — Source-agnostic memory write for non-meeting sources (synthesis, import, manual).

2. **`intelligence synthesize` primitive** — Cross-meeting pattern detection for daily-winddown style workflows.

3. **`arete meeting process` convenience command** — Single command that chains primitives with sensible defaults.

---

## Future Work (longer term)

1. **Action item extraction improvement** — Analyze user's staged vs. approved action items to extract better prompt instructions. What patterns make items get approved? What gets skipped? Use this to improve extraction quality empirically.

2. **Brief service revisit** — Evaluate if `arete brief` output is actually helpful for meeting context. May need meeting-specific adjustments.
