---
title: Fix Extraction Intelligence Dedup Pipeline
slug: fix-extraction-dedup-pipeline
status: approved
has_pre_mortem: true
has_review: true
created: 2026-04-09
---

# Fix: Extraction Intelligence Dedup Pipeline

## Context

The extraction intelligence feature (two-layer dedup for meetings) was merged but never activates in production. Three interconnected bugs prevent any dedup from firing:

1. **`loadRecentMeetingBatch` reads a phantom format** — looks for `frontmatter.staged_items` (never written), so cross-meeting dedup always gets empty data
2. **Backend file watcher auto-processes meetings** — preempts the winddown skill, processes each meeting in isolation with no batch context
3. **Winddown skill uses wrong extraction path** — runs `extract` + `apply` instead of `extract --stage --reconcile`, bypassing all 3 dedup layers

Result: every staged item comes through as `source: ai` with zero dedup, zero reconciliation.

---

## Changes

### 1. Fix `extractIntelligenceFromFrontmatter` to parse real formats

**File**: `packages/core/src/services/meeting-reconciliation.ts`

Change signature from `(frontmatter)` to `(frontmatter, body)`. Replace the `staged_items` array lookup with:

- **Format A (staged/processed)**: Call `parseStagedSections(body)` to get items. Enrich action items with `staged_item_owner` from frontmatter.
- **Format B (approved)**: Fall back to `frontmatter.approved_items` (`{ actionItems: string[], decisions: string[], learnings: string[] }`). Parse owner notation from action item strings (`"text (@owner → @counterparty)"`).
- Return `null` if both yield nothing.

Update `loadRecentMeetingBatch` (line 899): destructure `body` from `parseFrontmatter(content)`, pass to updated function.

**Reuse**: `parseStagedSections` from `packages/core/src/integrations/staged-items.ts:127`

### 2. Update tests for `loadRecentMeetingBatch`

**File**: `packages/core/test/services/load-recent-meeting-batch.test.ts`

Replace fixtures that use phantom `staged_items` array with realistic content:
- Body with `## Staged Action Items / Decisions / Learnings` sections
- Frontmatter with `staged_item_owner` maps
- Approved meetings with `approved_items` in frontmatter
- Edge cases: empty sections, mixed formats in same batch

### 3. Backend watcher: notify instead of auto-process

**File**: `packages/apps/backend/src/index.ts` (lines 47-74)

Replace the `onNew` callback body. Remove `runProcessingSession` + job creation + activity write. Replace with:

```typescript
broadcastSseEvent('meeting:synced', { slug, detectedAt: new Date().toISOString() });
```

Processing only happens via:
- UI button: `POST /api/meetings/:slug/process` (already exists)
- Winddown skill: `arete meeting extract --stage --reconcile`

### 4. Web frontend: handle `meeting:synced` events

**File**: `packages/apps/web/src/hooks/useProcessingEvents.ts`

Add listener for `meeting:synced` alongside existing `meeting:processed`:
- Invalidate `['meetings']` query (so new synced meetings appear in list)
- Show toast: "New meeting synced: {slug}"

**File**: `packages/apps/web/src/pages/Dashboard.tsx` (ActivityIcon)

Add icon case for `meeting:synced` type.

### 5. Fix winddown skill to use `--stage --reconcile`

**File**: `packages/runtime/skills/daily-winddown/SKILL.md` (lines 417-428)

Replace Steps 3+4 in the Per-Meeting Subagent Prompt:

```
### Step 3: Extract & Stage Intelligence
Run: arete meeting extract {meeting_file_path} --context /tmp/context.json --stage --reconcile --skip-qmd --json
```

Remove Step 4 (`arete meeting apply`). The `--stage` flag writes staged sections + metadata directly. The `--reconcile` flag enables cross-meeting dedup and batch LLM review.

---

## Sequencing

1. Change 1 (core fix) — everything depends on this
2. Change 2 (tests) — validates Change 1
3. Changes 3+4 (backend + frontend) — independent, can parallel with 5
4. Change 5 (skill) — independent

## Verification

1. `npm run typecheck && npm test` — full suite passes
2. Manual: create two meeting files with overlapping decisions, run `arete meeting extract` with `--stage --reconcile` on each, verify dedup fires
3. Manual: start backend, run `arete pull krisp`, verify SSE emits `meeting:synced` (not auto-processed)
4. Manual: run winddown, confirm subagent uses `--stage --reconcile`

## Risks

- **Frontend may need "Process" button**: If UI relied on auto-processing to show staged items, users will need to click process manually. The `POST /api/meetings/:slug/process` endpoint already exists.
- **SKILL.md is a prompt**: Behavioral, not deterministic. Validate by running the actual winddown.
- **`parseStagedSections` operates on body text**: If users edited staged items, the reconciler sees the edited version. This is correct behavior.
