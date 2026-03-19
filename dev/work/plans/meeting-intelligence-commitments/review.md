# Review: Phase 3 Agenda Lifecycle

**Date**: 2026-03-19
**Reviewers**: PM + Eng Lead (parallel reviews)

---

## Review Synthesis

### Major Scope Change

**Original scope (7 tasks)**:
1. Daily-plan offers agenda creation
2. Link agendas to meetings
3. Move agendas after processing
4. Add goalSlug to Commitment type
5. Link commitments to goals during extraction
6. Define transcript merge format
7. Implement transcript merge in process-meetings

**Refined scope (2 tasks)**:
1. Daily-plan offers agenda creation
2. Archive agendas after processing (via frontmatter, not move)

### What Was Cut and Why

| Task | Reason |
|------|--------|
| Task 2 | Already implemented via `findMatchingAgenda()` |
| Task 3 → Task 2 | Simplified: frontmatter-only archive, no file movement |
| Tasks 4-5 | Deferred: commitments + goals need clearer strategy |
| Tasks 6-7 | Deferred: transcript merging is power user feature |

### Key Design Decisions

1. **Frontmatter-only archive**: Don't move agenda files. Add `status: processed` and `processed_at` to frontmatter. This avoids:
   - Rollback complexity
   - Broken links
   - File system operations in skill markdown

2. **Smart filtering for agenda offers**: Only offer for "prep-worthy" meetings (QBR, customer, leadership, etc.). Avoids UX noise.

3. **Existence check**: Don't offer to create if agenda already exists. Prevents duplicates and conflicts.

4. **Graceful handling**: If agenda file is missing when processing, log and continue. Users may manually delete agendas.

---

## Approval Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Scope | ✅ Approved | 2 tasks, skill-only changes |
| Risk mitigations | ✅ Approved | All 5 risks addressed |
| Dependencies | ✅ Met | Phase 2 complete, findMatchingAgenda exists |
| Test coverage | ✅ N/A | Skill markdown files, no code tests |

---

## Recommended Next Steps

1. **Execute Phase 3** (2 tasks) — agenda lifecycle completion
2. **Plan Phase 4** after Phase 3 ships — commitments + goals + transcripts
3. **Validate** — manual testing of agenda workflow end-to-end

---

## Phase 4 Backlog (Deferred)

For future planning:

### 4A: Commitments + Goals
- Add `goalSlug?: string` to Commitment type
- Heuristic-only goal linking (no LLM)
- Manual override via web UI

### 4B: Transcript Merging
- Define merge format for multiple sources
- Implement `mergeTranscripts()` utility
- Add `transcript_sources` frontmatter

### 4C: Agenda Display Filtering
- `arete agendas list --include-processed` flag
- Web UI filtering for processed/active agendas
