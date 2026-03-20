# PRD: Meeting Processing Primitives (Phase 1)

## Problem Statement

Meeting processing in Areté is currently monolithic — the `process-meetings` skill contains all logic as agent instructions. This makes it:
- **Hard to compose**: Can't reuse pieces in other skills (like daily-winddown)
- **Hard to extend**: Users can't bring their own agenda source
- **Hard to test**: Logic lives in markdown, not code

## Success Criteria

1. Three new/enhanced CLI commands: `meeting context`, `meeting extract --context`, `meeting apply`
2. Commands are composable via JSON piping
3. Web app "Process" button works using new core services
4. Existing `meeting extract` behavior unchanged when `--context` not provided
5. All tests pass, no regressions

## Design Principle

**Hybrid composition**: Decompose where it helps, consolidate where context matters.

| Phase | Composition? | Rationale |
|-------|--------------|-----------|
| Context Assembly | ✅ Composable | Mostly deterministic, reusable |
| Intelligence Extraction | ❌ Single AI call | Interrelated outputs benefit from full context |
| State Updates | ✅ Composable | Independent writes, parallelizable |

---

## Tasks

### Task 1: `arete meeting context <file>` — Core Service + CLI

Create the context assembly primitive.

**Acceptance Criteria:**
- [ ] Core service: `packages/core/src/services/meeting-context.ts`
- [ ] Exports `buildMeetingContext(meetingPath, options)` function
- [ ] CLI command: `arete meeting context <file> --json`
- [ ] Reads meeting file: title, date, attendees, transcript
- [ ] Finds agenda: uses frontmatter `agenda:` if present, else fuzzy matches via `findMatchingAgenda`
- [ ] Resolves attendees: calls person resolution, collects profiles/stances/openItems
- [ ] Unknown attendees: collected in `unknownAttendees` array with email/name
- [ ] Related context: calls brief service with meeting title
- [ ] `--skip-agenda` flag skips agenda lookup
- [ ] `--skip-people` flag skips attendee resolution
- [ ] Warnings collected in `warnings` array
- [ ] Output matches `MeetingContextBundle` schema (see notes.md)
- [ ] Export from `@arete/core` index
- [ ] Unit tests for context assembly
- [ ] Integration test: meeting with agenda + known attendees → complete bundle

**Files to create/modify:**
- CREATE: `packages/core/src/services/meeting-context.ts`
- MODIFY: `packages/core/src/services/index.ts` (export)
- MODIFY: `packages/cli/src/commands/meeting.ts` (add context subcommand)
- CREATE: `packages/core/test/services/meeting-context.test.ts`

**Patterns to follow:**
- `packages/core/src/services/meeting-extraction.ts` (service structure)
- `packages/cli/src/commands/meeting.ts` (CLI command structure)

---

### Task 2: Enhance `arete meeting extract` with `--context`

Add context injection to existing extraction.

**Acceptance Criteria:**
- [ ] `--context <file>` flag accepted (JSON file path)
- [ ] `--context -` reads from stdin (for piping)
- [ ] Context incorporated into LLM prompt (attendee info, goals, agenda items)
- [ ] Unchecked agenda items merged into action items
- [ ] Owner slugs resolve using attendee context
- [ ] WITHOUT `--context` flag: behaves exactly as before (backward compatible)
- [ ] Add `context?: MeetingContextBundle` parameter to `buildMeetingExtractionPrompt`
- [ ] Explicit test: extract without --context produces identical output to current
- [ ] Unit tests for context-enhanced extraction
- [ ] Integration test: extraction with context produces richer output

**Files to modify:**
- MODIFY: `packages/core/src/services/meeting-extraction.ts`
- MODIFY: `packages/cli/src/commands/meeting.ts` (extract subcommand)
- MODIFY: `packages/core/test/services/meeting-extraction.test.ts`

---

### Task 3: `arete meeting apply <file>` — Core Service + CLI

Create the staged-section writer primitive.

**Acceptance Criteria:**
- [ ] Core service: `packages/core/src/services/meeting-apply.ts`
- [ ] Exports `applyMeetingIntelligence(meetingPath, intelligence, options)` function
- [ ] CLI command: `arete meeting apply <file> --intelligence <json>`
- [ ] `--intelligence -` reads from stdin
- [ ] Writes staged sections: `## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings`
- [ ] Updates meeting frontmatter: `status: processed`, `processed_at: <timestamp>`
- [ ] Archives linked agenda: `status: processed` in agenda frontmatter
- [ ] `--skip agenda` skips agenda archival
- [ ] `--clear` clears existing staged sections before writing (for reprocessing)
- [ ] Does NOT touch people files or commitments
- [ ] Idempotent: running twice produces same result
- [ ] Export from `@arete/core` index
- [ ] Unit tests for apply logic
- [ ] Integration test: full apply flow

**Files to create/modify:**
- CREATE: `packages/core/src/services/meeting-apply.ts`
- MODIFY: `packages/core/src/services/index.ts` (export)
- MODIFY: `packages/cli/src/commands/meeting.ts` (add apply subcommand)
- CREATE: `packages/core/test/services/meeting-apply.test.ts`

---

### Task 4: Update `process-meetings` skill

Rewrite skill to use new primitives.

**Acceptance Criteria:**
- [ ] Skill references: `meeting context`, `meeting extract`, `meeting apply`
- [ ] Flow: context → extract → apply → (user review) → approve → refresh
- [ ] Unknown attendees listed at end with offer to add (conversational)
- [ ] Existing process-meetings behavior preserved from user perspective
- [ ] Manual test: process a real meeting using the updated skill

**Files to modify:**
- MODIFY: `packages/runtime/skills/process-meetings/SKILL.md`

---

### Task 5: Update web app backend

Refactor backend to use new core services (NOT shell to CLI).

**Acceptance Criteria:**
- [ ] Import `buildMeetingContext`, `extractMeetingIntelligence`, `applyMeetingIntelligence` from `@arete/core`
- [ ] `runProcessingSession` uses new core services
- [ ] `clearApproved: true` calls `clearApprovedSections` before apply
- [ ] Existing web app behavior unchanged from user perspective
- [ ] Response shapes unchanged (meeting file is the contract)
- [ ] Integration test: web app process flow works end-to-end

**Files to modify:**
- MODIFY: `packages/apps/backend/src/services/agent.ts`
- MODIFY: `packages/apps/backend/test/services/agent.test.ts` (if exists)

---

## Dependencies

```
Task 1 (context) ─────┐
                      ├──► Task 4 (skill)
Task 2 (extract) ─────┤
                      ├──► Task 5 (web app)
Task 3 (apply) ───────┘
```

- Tasks 1, 2, 3 can be built in parallel (define shared types first)
- Tasks 4 and 5 depend on Tasks 1, 2, 3

---

## Pre-Mortem Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Parallel tasks without shared schema | Task 1 defines `MeetingContextBundle` type first; Tasks 2-3 import it |
| Breaking existing extract callers | Explicit backward compatibility test in Task 2 |
| Scope creep | Out-of-scope list enforced; no Phase 2 features |
| Web app integration | Backend uses core services directly, not CLI |
| Reimplementing existing logic | Reuse `findMatchingAgenda`, `parseAgendaItems` |

---

## Out of Scope

- `memory add` primitive (Phase 2)
- `intelligence synthesize` primitive (Phase 2)
- `arete meeting process` convenience command (Phase 2)
- Web app UI changes
- External agenda links (Notion, etc.)
- Daily winddown skill (user's project, not Areté)

---

## Testing Requirements

```bash
# Must pass after each task
npm run typecheck
npm test

# After Task 5
Manual E2E: arete view → select meeting → click Process → verify staged sections
```

---

## Context Bundle Schema

```typescript
interface MeetingContextBundle {
  meeting: {
    path: string;
    title: string;
    date: string;
    attendees: string[];
    transcript: string;
  };
  agenda: {
    path: string;
    items: AgendaItem[];
    unchecked: string[];
  } | null;
  attendees: Array<{
    slug: string;
    email: string;
    name: string;
    category: string;
    profile: string;
    stances: string[];
    openItems: string[];
    recentMeetings: string[];
  }>;
  unknownAttendees: Array<{
    email: string;
    name: string;
  }>;
  relatedContext: {
    goals: Array<{ slug: string; title: string; summary: string }>;
    projects: Array<{ slug: string; title: string; summary: string }>;
    recentDecisions: string[];
    recentLearnings: string[];
  };
  warnings: string[];
}

interface AgendaItem {
  text: string;
  checked: boolean;
  section?: string;
}
```

---

## References

- Notes: `dev/work/plans/process-meeting-refactor/notes.md`
- Pre-mortem: `dev/work/plans/process-meeting-refactor/pre-mortem.md`
- Review: `dev/work/plans/process-meeting-refactor/review.md`
