# Holistic UI Audit - Part B

> Findings from cross-referencing actual workspace files against what the backend parses and the UI displays.
> Sources examined: `workspace.ts`, `routes/goals.ts`, `routes/people.ts`, and live files in `~/code/arete-reserv/`.

---

## Meeting Data Parsing Gaps

### 1. `recording` vs `recording_link` field mismatch — **Silent data loss**
**Impact: High** — Recordings are silently invisible for every meeting.

Backend reads `fm['recording_link']` only. But every actual meeting file uses `recording:` (no underscore, no `_link`):
- `2026-02-24-john-nate-1on1.md` → `recording:` (empty)
- `2026-02-26-dave-john-11-*.md` → `recording: "https://drive.google.com/..."`

The Google Drive recording link that exists in Dave's 1:1 will never appear in the UI. The metadata panel always says "No recording available" because `recording_link` never matches.

**Fix needed:** Backend should check both `recording` and `recording_link`, preferring whichever is non-empty.

---

### 2. `attendee_ids` not used for display — **Attendees panel always empty**
**Impact: High** — Every Krisp/manually-written meeting has no attendees shown.

Backend parses `attendees:` (array of `{ name, email }` objects) for display. But actual files all use `attendee_ids:` (array of person slugs, e.g. `[nate-fullerton]`) — not an `attendees` array. Files with only `attendee_ids` show zero attendees in both the meetings list (avatar stack) and the metadata panel.

Example — `2026-02-24-john-nate-1on1.md`:
```yaml
attendee_ids: [nate-fullerton]
# no attendees: field
```
→ Attendee avatar stack: empty. Metadata panel attendees section: empty.

**Fix needed:** Backend should resolve `attendee_ids` slugs to names by looking up `people/` files, then merge with any explicit `attendees` array.

---

### 3. `## Key Points` section — parsed for status but never shown
**Impact: Medium** — Structured meeting context is invisible.

`detectMeetingStatus()` reads Key Points to determine whether a meeting is "processed", but `getMeeting()` never extracts Key Points as a field. The `FullMeeting` type has no `keyPoints` field. In the detail view, Key Points only appear if the user opens the raw transcript/body collapse — not as a named, formatted section.

The Nate 1:1 has a rich `## Key Points` with nested `###` subsections (PM/Design Collaboration, Current Work, People Recommendations). None of it is surfaced as structured data.

**Fix needed:** Extract `keyPoints` (and subsections) from body, add to `FullMeeting`, render as a collapsible section in meeting detail above the transcript.

---

### 4. `## People Recommendations` section — not parsed at all
**Impact: Medium** — Cross-person insight is lost.

The Nate 1:1 has a `## People Recommendations` section with named sub-groups (Engineering, Shadow Suggestions) listing people with context. This is never extracted, indexed, or displayed. There's no way to see "Nate recommended I meet Doris Daniels" from the meeting UI.

**Fix needed:** Parse this section and either (a) surface it in meeting detail, or (b) link the recommended people to their person cards.

---

### 5. Duration type: backend returns string, frontend treats as number
**Impact: Low** (currently working due to normalization layer, but fragile)

`workspace.ts` defines `duration: string` in `MeetingSummary` and `extractDuration()` returns `""` or `"57 minutes"`. The `meetings.ts` API layer normalizes this to a number via `parseInt`. Works now, but if a meeting returns a non-parseable duration string (e.g. `"1 hour 15 min"`), the sort and display (`m.duration > 0`) will silently break.

---

### 6. Meeting search only covers title + attendee names
**Impact: Low-Medium**

`MeetingsIndex` search filters by `m.title` and `m.attendees[].name`. It doesn't search summary content, so searching "email templates" won't find a meeting about email templates unless that phrase is in the title.

---

### 7. Approved meeting action items: toggle is a no-op
**Impact: Medium**

In `MeetingDetail.tsx`, approved meetings show `ParsedItemsSection` with checkbox buttons for action items. The `onToggleActionItem` handler has a `// TODO: Implement toggle action item` comment and fires `toast.info('Action item toggle not yet implemented')`. The checkboxes render but do nothing.

---

### 8. Approved items from new staged flow vs old body format
**Impact: Low** — But can cause confusion.

For meetings approved via the staged flow, items live in `approved_items` frontmatter. `ParsedItemsSection` reads from `parsedSections` (body sections). If a meeting was approved via the new flow and the body sections were not written back (e.g., old-format meeting), `ParsedItemsSection` may show nothing even though `approvedItems` has data. The `ApprovedItemsSection` component exists in `ReviewItems.tsx` but is not rendered in the approved state.

---

## Goals/Now Files Gaps

### 1. `now/week.md` is rich; only numbered priorities are parsed
**Impact: High** — The majority of the week file is ignored.

The actual `week.md` has this structure. Parsed vs ignored:

| Section | Parsed? | Displayed? |
|---|---|---|
| `**Theme**:` header line | ❌ | ❌ |
| `**Phase**:` header line | ❌ | ❌ |
| `## Outcomes for the Week` (narrative) | ❌ | ❌ |
| `## Key Tasks` → `### POP Email Go-Live` (flat task lists) | ❌ | ❌ |
| `### N. Title` numbered priorities | ✅ | ✅ |
| `## Key Questions to Answer This Week` | ❌ | ❌ |
| `## Scheduling Notes` | ❌ | ❌ |
| `## Carried from Week 2` (task list) | ❌ | ❌ |
| `## Daily Progress` | ❌ | ❌ |
| `## Linked Plans` | ❌ | ❌ |
| `## Commitments due this week` | ✅ | ✅ |

The `## Key Tasks` sections (which contain the actual to-do lists, e.g. "Squash remaining bugs", "Enable feature flag for POP team") are completely invisible. These are more actionable than the high-level numbered priorities.

The `**Theme**:` and `**Phase**:` lines at the top are ignored — they'd make a useful week header context.

---

### 2. `goals/quarter.md` project tables not parsed
**Impact: Medium**

Each goal in `quarter.md` has a `### Projects` table with Priority, Status, and Jira links:

```
| Email Templates Rollout | P0 | Active | [PLAT-8441](https://...) |
```

Backend only extracts the `### Key Outcomes` checkbox list. Project tables, statuses, and Jira links are swallowed into the `successCriteria` joined string or dropped entirely. The UI shows no project-level detail for any goal.

---

### 3. Quarter goals `**Status**:` and `**Notion**:` fields not parsed
**Impact: Low-Medium**

Each goal has `- **Status**: Active` and `- **Notion**: https://...`. These are not extracted. There's no way to see goal status or jump to the Notion source from the UI.

---

### 4. `goals/strategy.md` rendered as raw text dump
**Impact: Medium**

The strategy file has rich structure: Mission, AI Vision, Strategic Pillars, 2026 AI Priorities table, 2027+ Horizon. The backend returns the full raw `content` string. The UI renders it via `<pre className="whitespace-pre-wrap">` when expanded, or a 200-char stripped-markdown preview when collapsed. None of the structural sections (Mission, Pillars, AI Priorities table) are extracted or styled. The table in particular is unreadable in `<pre>` format.

---

### 5. No `**Week of**:` extraction from actual file format
**Impact: Low**

The backend looks for `**Week of**:` regex. The actual `week.md` uses `# Week 3: Mar 9–13, 2026` as the heading and no `**Week of**:` line. The `weekOf` field always returns empty, so the "Week of {weekOf}" subtitle never renders.

---

### 6. Week priority toggle writes `[x]` incorrectly
**Impact: Medium**

The PATCH `/api/goals/week/priority` handler appends `[x]` on its own line at the end of the section body:
```
sectionBody = sectionBody.trimEnd() + '\n[x]\n';
```
This produces malformed markdown (a bare `[x]` line, not a checkbox list item). It also doesn't update existing checkbox items in the section — it just appends. Re-reading after toggle will work (the `done` detection checks for `/\[x\]/i` anywhere in the body), but the file format degrades with each toggle.

---

### 7. Goals archive not accessible
**Impact: Low**

`goals/archive/` exists but there's no API endpoint or UI to view archived goals.

---

## People Files Gaps

### 1. `## Interaction Log` table is not parsed
**Impact: High** — Rich history is inaccessible from the UI.

Person files have a manually maintained `## Interaction Log` table:
```markdown
| Date | Type | Notes |
| 2026-03-04 | 1:1 | Glance MVP strategy... |
```

The backend strips the `AUTO_PERSON_MEMORY` block and the `## Recent Meetings` section from `rawContent`, but `## Interaction Log` remains in `rawContent` — meaning it shows up only in the bottom "Notes" markdown editor as raw content. It's not parsed, not displayed as a structured timeline, and not linked to meeting records (even though it contains links like `[Claim Portal Standup](../../resources/meetings/...)`.

The `allMeetings` list (from `attendee_ids` lookup) and the `## Interaction Log` are duplicate but inconsistent data — log has more detail but isn't used.

---

### 2. Auto-memory `## Open Items` not parsed
**Impact: High** — Commitments panel misses most real items.

The `AUTO_PERSON_MEMORY` block has:
```markdown
### Open Items (I owe them)
- Nate to add John to any upcoming user interviews (from: 2026-02-24-john-nate-1on1.md)
### Open Items (They owe me)
- ...
```

`parseAutoMemoryBlock()` does NOT parse these sections. It only extracts: `lastMeetingDate`, `meetingsLast30d`, `meetingsLast90d`, `healthStatus`, `stances`, `repeatedAsks`, `repeatedConcerns`.

Open commitments in the UI come exclusively from `.arete/commitments.json`. Many items in the auto-memory open items lists are likely NOT in `commitments.json` (they're different systems). Result: the "Open Commitments" panel on person detail may show 0 items even when the auto-memory block lists 10+ open loops.

Example: Nate's auto-memory block shows 10 open items. `commitments.json` entries for `nate-fullerton` need to be checked — but the divergence is structural.

---

### 3. `## Role & Context` and `## Key Notes` indistinguishable from personal notes
**Impact: Medium**

Person files have a clear structure:
```markdown
## Role & Context
(auto/imported context)

## Key Notes
(relationship notes)
```

Backend strips auto-memory and recent meetings, but everything else (Role & Context, Key Notes, Interaction Log) goes into `rawContent` and is shown in a single notes editor. There's no distinction between "imported facts about this person" and "your personal notes." Editing notes could inadvertently overwrite auto-generated sections.

---

### 4. `people/index.md` not rendered
**Impact: Low**

`people/index.md` exists (visible in `ls`) but `scanPeopleDir()` explicitly skips it (`entry === 'index.md'`). If it contains a relationship map or directory overview, it's invisible.

---

### 5. Health score is a rough heuristic with no signal display
**Impact: Medium**

`healthScore` is computed from meeting frequency alone (4+ in 30d → 90, 2–3 → 70, 1 → 50, none → decay). There's no way for a user to see why a score is what it is. The `trend` field (up/flat/down) is computed but the `PersonSummary` list doesn't display trend arrows in `PeopleIndex.tsx`. Neither does `PersonDetailPage` show trend.

---

### 6. `created` frontmatter field ignored
**Impact: Low**

Person files have `created: 2026-02-22`. Not parsed, not shown. Would be useful as "Added to network on" context.

---

### 7. People in `users/` subfolder use wrong category label
**Impact: Low**

`scanPeopleDir()` maps `category: 'user'` to `dirName = 'users'`. Files in `people/users/` (like `steve-adjuster.md`, `yolonda-smith.md`, `doris-daniels.md`) get `category: 'user'`. The `CategoryBadge` component likely renders "user" but these are claim adjusters/end-users, not internal teammates. This may display incorrectly depending on the badge labels.

---

## CRUD Gaps

### Meetings
| Operation | Status |
|---|---|
| Create meeting | ❌ Button disabled ("Coming soon") |
| Edit meeting title | ❌ No UI (backend PATCH supports `title` but no edit affordance) |
| Edit meeting summary | ✅ Pencil icon, auto-saves |
| Toggle action item complete | ❌ Renders but is a no-op (`// TODO`) |
| Reprocess (already approved) | ✅ Available via metadata panel |
| Delete meeting | ✅ |

### Goals / Week
| Operation | Status |
|---|---|
| Toggle week priority done | ✅ (but writes malformed `[x]` line) |
| Edit week priority text | ❌ |
| Add new week priority | ❌ |
| Edit quarter goal | ❌ |
| Edit strategy | ❌ Read-only |

### People
| Operation | Status |
|---|---|
| Create person | ❌ No UI |
| Delete person | ❌ No UI |
| Edit person notes | ✅ (PATCH `/notes` endpoint, markdown editor) |
| Edit frontmatter (name, role, company, email) | ❌ |
| Mark commitment resolved | ❌ (only via CLI/file edit) |
| Refresh person memory | ❌ No UI trigger |

---

## Summary: Highest-Impact Fixes

1. **`recording` field alias** → recordings are silently invisible (1 line fix)
2. **`attendee_ids` → display names** → attendees column/panel always empty (needs people lookup)
3. **`## Key Tasks` in week.md** → the actual to-do list is never shown
4. **Open Items from auto-memory** → commitments panel misses most items
5. **Action item toggle no-op** → checkbox UI exists but does nothing
6. **Quarter goal project tables** → project-level detail (status, Jira) never shown
