# Process Meeting Phase 2 — Planning Notes

## Problem Statement (Refined)

When processing meetings in bulk (daily winddown), redundant items get extracted:
- Same commitment mentioned in 3 meetings (team at 10am, boss at 11am, user at 2pm) → 3 action items
- Same learning captured across a week → appears multiple times
- Large meetings extract everyone's commitments, not just yours

**Root cause:** Extraction has no awareness of:
1. Existing commitments (historical dedup)
2. Other meetings in the same batch (same-day dedup)
3. Whether you're a participant vs observer in the meeting

## Key Insight

This is NOT about "synthesis" (finding themes) — it's about **intelligent deduplication** and **owner-scoped extraction**.

---

## Current Architecture Gap

```
meeting context → meeting extract → meeting apply
```

**What's in context today:**
- ✅ Attendees with openItems from person files
- ✅ Related goals/projects
- ✅ Recent decisions/learnings from memory
- ❌ Full commitments list
- ❌ Other meetings being processed in same batch

**Extraction behavior:**
- Extracts ALL action items, tags `direction: i_owe_them | they_owe_me`
- Does NOT filter to only items involving workspace owner
- Large meeting = lots of irrelevant Alice→Bob commitments

---

## Proposed Solution

### 1. Owner-Scoped Extraction (filter at extraction time)

**Prompt change:**
> "Extract action items where the workspace owner is either the owner OR counterparty. Skip commitments between other attendees."

**Post-extraction filter (safety net):**
Keep only items where `ownerSlug === workspaceOwner || counterpartySlug === workspaceOwner`

**`--full` flag** for when you DO want everything (rare).

**Benefit:** Large meetings automatically filtered. No config needed.

### 2. Historical Dedup (existing commitments in context)

Pass existing commitments to extraction prompt:
```
These commitments already exist — do not extract duplicates:
- [jane-smith] Send Q2 report (2026-03-15)
- [bob-jones] Review PR #123 (2026-03-18)
```

LLM naturally avoids re-extracting "I'll send Jane the Q2 report" if it's already there.

### 3. Batch-Aware Consolidation (new primitive)

For same-day batch processing where extraction runs before apply:

```bash
# Extract all meetings
for m in $meetings; do
  arete meeting extract "$m" --context ... --json > "extractions/$m.json"
done

# Consolidate across batch + historical
arete intelligence consolidate \
  --extractions extractions/*.json \
  --against-commitments \
  --json > consolidated/

# Apply consolidated results
for m in $meetings; do
  arete meeting apply "$m" --intelligence "consolidated/$m.json"
done
```

---

## Plan (3 Tasks)

### Task 1: Owner-Scoped Extraction
- Change extraction prompt to focus on workspace owner's commitments
- Add post-extraction filter as safety net
- Add `--full` flag to bypass filter when needed
- Update tests

**Files:**
- `packages/core/src/services/meeting-extraction.ts`
- `packages/core/test/services/meeting-extraction.test.ts`

### Task 2: Historical Dedup via Context
- Enhance `meeting context` to include existing commitments
- Load from `commitments.json`
- Pass to extraction prompt
- Update context bundle type

**Files:**
- `packages/core/src/services/meeting-context.ts`
- `packages/core/src/services/meeting-extraction.ts` (prompt enhancement)

### Task 3: Batch-Aware Consolidate Primitive
- New core service: `intelligence-consolidate.ts`
- Input: multiple extraction JSONs + workspace path
- Compare extractions against each other (Jaccard or LLM)
- Compare against existing commitments/memory
- Mark/filter duplicates
- Output: cleaned extractions per meeting
- CLI: `arete intelligence consolidate`

**Files:**
- CREATE: `packages/core/src/services/intelligence-consolidate.ts`
- CREATE: `packages/cli/src/commands/intelligence.ts`
- CREATE: `packages/core/test/services/intelligence-consolidate.test.ts`

---

## Size Estimate

| Task | Effort |
|------|--------|
| 1. Owner-scoped extraction | ~0.5 day |
| 2. Historical dedup in context | ~0.5 day |
| 3. Consolidate primitive | ~1 day |
| **Total** | **~2 days** |

**Size: Small (3 tasks)**

---

## Out of Scope

- `arete meeting process` convenience command (deferred)
- `arete memory add` CLI (deferred — not needed for dedup)
- Theme synthesis (different feature)
- Web UI for consolidation
- Meeting type configuration (solved by owner-scope filter)

---

## Open Questions

1. **Consolidate vs context injection**: Should batch dedup happen via consolidate primitive, or should we enhance context to include "other meetings in this batch"? (Consolidate is cleaner, keeps extraction pure)

2. **LLM vs heuristic for cross-meeting dedup**: Jaccard similarity is fast but may miss semantic dupes ("send report" vs "get the Q2 numbers to Jane"). LLM is more accurate but slower/costlier.

3. **What happens to duplicates?**: Filter entirely, or mark as "already captured in [meeting X]" for user awareness?

---

## Related Work (Completed in Phase 1)

- `arete meeting context` — assembles context bundle
- `arete meeting extract --context` — context-enhanced extraction
- `arete meeting apply` — writes staged sections
- Goals refactor, agenda lifecycle, goal linking on commitments
- Backend unified to use core extraction service

---

## References

- Phase 1 notes: `dev/work/archive/process-meeting-refactor/notes.md`
- Existing dedup: `packages/core/src/utils/dedup.ts`, `packages/core/src/services/commitments.ts`
- Extraction prompt: `packages/core/src/services/meeting-extraction.ts`
