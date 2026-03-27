# Plan: Meeting Workflow Reconciliation

**Created**: 2026-03-04
**Completed**: 2026-03-04
**Status**: Complete

## Problem

Agendas (`now/agendas/`) and meeting recordings (`resources/meetings/`) are disconnected. When `arete pull` creates a meeting doc, it doesn't know about the agenda. When `process-meetings` runs, it doesn't merge agenda items or structure the output with collapsed recorder notes.

## Solution

1. **Pull phase**: Link agenda to meeting via fuzzy match
2. **Process phase**: Merge agenda items, generate Areté intelligence, collapse recorder notes

---

## Step 1: Agenda Linking During Pull

**Files**: `packages/core/src/integrations/krisp/index.ts`, `packages/core/src/integrations/fathom/index.ts`, `packages/core/src/integrations/meetings.ts`

**Changes**:
- Add `findMatchingAgenda(storage, workspaceRoot, date, title)` utility in `meetings.ts`
  - Lists `now/agendas/` files
  - Filters by date prefix (YYYY-MM-DD)
  - Fuzzy matches title (normalize: lowercase, strip punctuation, compare)
  - Returns relative path if found, null otherwise
- Update `MeetingForSave` interface to include optional `agenda?: string`
- Update `saveMeetingFile` to write `agenda: <path>` in frontmatter when present
- Call `findMatchingAgenda` in Krisp and Fathom pull flows before saving

**AC**:
- `arete pull krisp` links agenda when date+title match
- Frontmatter includes `agenda: now/agendas/2026-03-04-weekly-sync.md`

---

## Step 2: Update Meeting Template for Recorder Notes Collapse

**Files**: `packages/core/src/integrations/meetings.ts`, `packages/core/src/integrations/krisp/index.ts`, `packages/core/src/integrations/fathom/index.ts`

**Changes**:
- Update `DEFAULT_TEMPLATE` to structure recorder outputs in a collapsed `<details>` block
- Add `{recorder_summary}`, `{recorder_key_points}` variables (separate from Areté-generated)
- Initial save (pre-processing) puts recorder outputs in collapsed section

**Template structure**:
```markdown
# {title}

**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Action Items
{action_items}

<details>
<summary>Recorder Notes</summary>

### Original Summary
{recorder_summary}

### Key Points
{recorder_key_points}

</details>

## Transcript
{transcript}
```

**AC**:
- Pulled meetings have recorder notes in collapsed `<details>` block
- Summary section is initially populated with recorder summary (replaced by Areté during processing)

---

## Step 3: Agenda Item Extraction Utility

**Files**: `packages/core/src/utils/agenda.ts` (new)

**Changes**:
- Create `parseAgendaItems(content: string): AgendaItem[]`
  - Extracts checkboxes (`- [ ]`, `- [x]`) from agenda markdown
  - Returns `{ text: string, checked: boolean, section?: string }`
- Create `getUncheckedAgendaItems(content: string): string[]`
  - Returns just the unchecked item texts

**AC**:
- Can parse agenda files and extract unchecked items for merge

---

## Step 4: Merge Agenda Items in process-meetings

**Files**: `packages/runtime/skills/process-meetings/SKILL.md`

**Changes**:
- In Step 4 (Extract Meeting Intelligence), add sub-step:
  - If meeting has `agenda` in frontmatter, read the agenda file
  - Extract unchecked items via utility
  - Merge into Action Items with `*(from agenda)*` suffix
- Update action item format section to show merged items

**AC**:
- `process-meetings` reads linked agenda
- Unchecked agenda items appear in Action Items section
- Items are marked with source: `*(from agenda)*`

---

## Step 5: Update process-meetings Output Structure

**Files**: `packages/runtime/skills/process-meetings/SKILL.md`

**Changes**:
- Update Step 6 (Save to Meeting File) to preserve the collapsed recorder notes structure
- Areté-generated Summary replaces the placeholder (not the collapsed recorder summary)
- Final structure matches the design:
  ```
  Summary (Areté)
  Action Items (Areté + agenda)
  Next Steps
  Decisions
  Learnings
  <details>Recorder Notes</details>
  Transcript
  ```

**AC**:
- Processed meetings have clean structure
- Recorder notes remain collapsed
- Areté intelligence is primary

---

## Step 6: Tests

**Files**: 
- `packages/core/test/integrations/meetings.test.ts` (extend)
- `packages/core/test/utils/agenda.test.ts` (new)

**Changes**:
- Test `findMatchingAgenda` with various title formats
- Test `parseAgendaItems` extraction
- Test `saveMeetingFile` with agenda linking
- Test template output with collapsed details

**AC**:
- All new functionality has test coverage

---

## Out of Scope

- Automatic completion of agenda items based on transcript (future enhancement)
- Bidirectional sync (updating agenda from meeting) 
- Multiple agenda matching (assumes 1:1 agenda per meeting)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Fuzzy match false positives | Require date exact match + high title similarity (>0.7) |
| Agenda file format variations | Normalize before matching; handle with/without frontmatter |
| Breaking existing meeting files | Only affects new pulls; no migration needed |

---

## Estimate

Medium (touches core integrations + skill + new utility)

---

## Design Context

### Confirmed Decisions

1. **Two-step flow**: `arete pull` then `arete process-meetings` (no `--process` flag)
2. **Agenda matching**: Date exact + title fuzzy match
3. **Agenda merge**: Auto-merge unchecked items into Action Items
4. **Recorder notes**: Collapsed in `<details>` block
5. **Notion sync**: Downstream of this - reads final `resources/meetings/` docs

### Meeting Doc Final Structure

```markdown
---
title: "Weekly Sync"
date: "2026-03-04"
source: "krisp"
agenda: "now/agendas/2026-03-04-weekly-sync.md"
attendee_ids: [john-smith, sarah-chen]
---

# Weekly Sync

## Summary
{Areté-generated}

## Action Items
- [ ] John to send API docs (@john-smith → @sarah-chen)
- [ ] Review Q2 roadmap *(from agenda)*

## Next Steps
- ...

## Decisions
- ...

## Learnings
- ...

<details>
<summary>Recorder Notes</summary>

### Original Summary
{detailed_summary from Krisp/Fathom}

### Key Points
{key_points from recorder}

</details>

## Transcript
{full transcript}
```
