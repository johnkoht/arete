---
title: Product Simplification Assessment
slug: product-simplification-assessment
status: complete
size: large
tags: [product, architecture, planning, tasks, commitments, meetings, intelligence, memory]
created: 2026-04-02T20:00:00.000Z
updated: 2026-04-05T00:00:00.000Z
completed: 2026-04-05T00:00:00.000Z
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Product Simplification Assessment

## Problem

Arete has the right concepts but they operate as isolated pipelines. The meeting processor, planning skills, task system, and commitment tracker each work well independently but don't share context with each other. The user is the integration layer — manually connecting "promise made in meeting" to "task for Thursday" to "Q1 goal progress."

Specific pain points (from daily use over 6 weeks):
1. **Daily/weekly plans produce redundant items** — skills don't deduplicate against each other
2. **Tasks and commitments are disconnected** — two systems tracking overlapping work
3. **Areas + projects + goals + tasks = cognitive overload** — relationships are optional and manually maintained
4. **Meeting approval takes 25-45 min** — volume of items, incomplete cross-meeting dedup
5. **Intelligence isn't accurate or relevant enough** — system doesn't cross-reference across meetings and planning artifacts
6. **Memory L3 layer is hollow** — summaries/ directory is empty, agent-observations has 1 entry in 6 weeks, area memory is manual not computed. The synthesis layer that should power context injection barely exists.

## In-Flight Work (Must Account For)

These plans are already building or approved and directly overlap:

| Plan | Status | What It Does |
|---|---|---|
| `intelligence-improvements` | building (25 steps) | Reconciliation pass, context cards, relevance scoring, QMD scope expansion |
| `task-management-ui` | building (23 steps) | Web UI for tasks, scoring engine, commitment-task linking |
| `wire-meeting-reconciliation-into-cli` | approved (4 steps) | `--reconcile` flag on `meeting extract` |

**Key insight**: The intelligence-improvements plan directly addresses the meeting review bottleneck (Phase 2: reconciliation pass). The task-management-ui plan introduces task scoring and commitment linking. These are the right work — the question is what's STILL missing after they land.

## Assessment: What's Working

### The Intelligence Loop Is Real
- 967 lines of learnings, 745 lines of decisions — genuine institutional memory
- 41 meeting files with high-quality Krisp extraction
- 4 active areas with accumulated domain knowledge
- Rich people profiles with relationship health and stances
- Weekly cadence (plan → daily plans → winddowns → review) produces real value

### The Architecture Is Sound
- Five product primitives (Problem, User, Solution, Market, Risk) give structure to context
- Semantic search (QMD) discovers conceptually relevant content
- Meeting-to-memory pipeline extracts real intelligence
- People intelligence tracks relationships, commitments, stances
- File-first workspace is transparent and portable

## Assessment: What Needs Fixing

### 1. Memory L3 Is Hollow

The three-layer memory architecture (L1 Resources → L2 Items → L3 Summaries) is well-designed but L3 barely exists in practice.

**What was designed**:
- `.arete/memory/summaries/collaboration.md` — synthesized from agent-observations
- `.arete/memory/summaries/sessions.md` — session continuity tracking
- Area memory (`areas/{slug}/memory.md`) — scoped context cards
- Person memory (AUTO_PERSON_MEMORY sections) — stances, health, open items

**What actually exists in arete-reserv after 6 weeks**:
- `summaries/` directory: **empty** — no collaboration.md, no sessions.md
- `agent-observations.md`: **1 entry** from Feb 25 (should have dozens by now)
- Area memory.md: **manually created** where it exists, not computed
- Person memory: **working** — auto-refreshed via `arete people memory refresh`

**Root causes**:
1. **Agent-observations rule is passive** — relies on the agent noticing triggers (user edits, corrections, patterns). In practice, the agent doesn't do this reliably.
2. **No L3 synthesis is automated** — collaboration.md requires manual agent action after 5+ observations accumulate. With only 1 observation, synthesis never triggers.
3. **Area memory is user-curated** — the intelligence-improvements plan adds parsing but not auto-generation.
4. **No skill writes to summaries/** — weekly-winddown, week-review, and daily-winddown all write to week.md, not to L3.
5. **Person memory is the only working L3** — because it has an explicit automated command (`arete people memory refresh`).

**Why this matters**: L3 is supposed to be the primary context injection layer. When a skill needs to understand "what's happening in Glance Communications?", it should pull the area's L3 summary — keywords, active people, open work, recent decisions — not re-search L1/L2 from scratch. Without L3, every skill does its own ad-hoc context gathering, leading to inconsistency and missed connections.

### 2. The Deduplication Gap (Partially addressed by intelligence-improvements)

**Root cause**: `TaskService.addTask()` has zero dedup checking — unconditionally inserts. Meeting extraction doesn't see week.md tasks. Cross-meeting dedup has stubs (`recentCommittedItems: []`, `completedTasks: []`).

**What intelligence-improvements covers**:
- Phase 2 reconciliation pass with Jaccard dedup within batch
- QMD vsearch for matching against prior workspace
- Completed task matching
- Recent memory matching
- Relevance scoring with annotations

**What's still missing after intelligence-improvements**:
- `addTask()` dedup at write time (TaskService level)
- Week.md tasks in the extraction context bundle (so LLM sees existing tasks)
- Planning skill dedup (daily-plan vs. week-plan writing to same file)

### 3. Tasks + Commitments Disconnect (Partially addressed by task-management-ui)

**Current state**: Commitments auto-created from meetings → `.arete/commitments.json`. Tasks are mostly manual → `week.md`/`tasks.md`. Connected via optional `@from(commitment:id)` tag.

**What task-management-ui covers** (landing soon):
- Task scoring engine (due date + commitment linkage + meeting relevance)
- Web UI with Today/Upcoming/Anytime/Someday/Completed views
- Task completion → auto-resolves linked commitment
- "Waiting On" filter for commitment-linked tasks
- Tasks read/write directly to week.md and tasks.md (shared with agents)

**What works end-to-end**:
- Tasks ↔ week.md ↔ agents: completing a task in UI changes `- [ ]` to `- [x]`, agents see it
- Week planning pulls from tasks: reads tasks.md Anytime section, open commitments, carry-overs

**What's partial** (3-step pipeline, not direct):
- Meeting → staged items → user approves → commitments created → week-plan creates tasks with `@from(commitment:id)`. Works, but requires the weekly planning step to close the loop. Not automatic.

**What's still missing after task-management-ui** (3 gaps):

| Gap | Problem | Fix | Effort |
|---|---|---|---|
| **Meeting → Task (direct)** | Approving staged items creates commitments but NOT tasks until next weekly plan | After approving staged items, auto-create tasks in tasks.md Inbox with `@from(commitment:id)` | Medium |
| **Daily plan ↔ Today view** | `## Today` section in week.md is free-form prose agents write. Task UI Today view shows `### Must complete` + `@due(today)`. They don't see each other. | Either parse `## Today` into Today view, or have daily-plan skill write to `### Must complete` instead of prose | Medium |
| **Real-time awareness** | Completing a task in UI doesn't notify agents or other views until file re-read | SSE events when files change → web UI auto-refreshes | Low (SSE already exists in backend) |

### 4. Loose Hierarchy (Areas → Goals → Projects → Tasks)

**Current state**: All relationships are optional. Goals can link to areas but don't have to. Projects don't formally link to goals. Tasks tag areas/projects but it's not enforced.

```
What user expects:          What actually exists:

Goals (quarterly)           GOALS ──(optional)──> AREAS
  └─ Areas                     ↑                    ↑
    └─ Projects             (reference)          (metadata)
      └─ Tasks              PROJECTS             TASKS ──> COMMITMENTS
                            (independent)        (independent)
```

**Not addressed by any in-flight plan.** This is the structural gap.

**Proposed approach** (tighten, don't remove):
- Goals require an area (every quarterly goal belongs to a persistent domain)
- Projects link to goals (on creation, ask which goal it advances)
- Tasks inherit scope from context (auto-tag @area and @project from meeting/commitment)
- Week planning scopes by area: "Which areas this week?" → goals → projects → tasks

### 5. Meeting Review Bottleneck (Mostly addressed by intelligence-improvements + wire-reconciliation)

**What the two plans cover**: Reconciliation pass, relevance tiers (high/normal/low), cross-meeting dedup, completed task matching, QMD workspace search, `--reconcile` CLI flag.

**What's still missing**:
- UI improvements: global "Approve All Above X Confidence" button
- Meeting-level batch review (approve all items from one meeting at once)
- Confidence threshold tuning (current include threshold 0.5 may be too permissive)
- Auto-approve for light meetings (partially exists but importance not always inferred)

### 6. Weekly Winddown — Source vs. Custom

The weekly-winddown skill already exists in source (`packages/runtime/skills/weekly-winddown/SKILL.md`) with full 7-phase subagent orchestration. The user has custom overrides (`overrides: [daily-winddown, weekly-winddown]` in arete.yaml).

**Action needed**: Diff the custom overrides against source versions. Identify what's different — likely the custom versions have workflow refinements from 6 weeks of daily use. Bring those improvements back to source. This is a small, targeted task, not a full plan.

---

## Recommended Phases (Accounting for In-Flight Work)

### Phase 0: Land In-Flight Work
- Complete `intelligence-improvements` (reconciliation, context cards, relevance scoring)
- Complete `task-management-ui` (web UI, scoring, commitment linking)
- Complete `wire-meeting-reconciliation-into-cli` (--reconcile flag)
- **This is already the right work.** Land it, use it for a week, reassess.

### Phase 0.5: Task Integration Gaps (Subplan: task-integration-gaps)

Close the gaps identified during task-management-ui development. These are the "last mile" connections that make the task system feel complete.

1. **Meeting → Task direct path** — after user approves staged items in web UI or CLI, auto-create tasks in `now/tasks.md` Inbox section with `@from(commitment:id)` and `@from(meeting:date)` metadata. No more waiting for weekly planning to close the loop.
   - Trigger: `commitApprovedItems()` in review flow
   - Creates: Inbox task per approved action item where direction = `i_owe_them`
   - Dedup: Check if task with same commitment link already exists (Jaccard + @from match)

2. **Daily plan ↔ Today view alignment** — daily-plan skill tags today's priorities with `@due(YYYY-MM-DD)` in Must/Should sections (canonical source), then generates `## Today` as a read-only snapshot that references those tasks. Task UI Today view = `@due(today)` items. `## Today` = human-readable daily narrative (focus, meetings, priorities pointing back to task numbers). Both read from the same data.
   - **Decision**: Option B confirmed — `## Today` stays as generated snapshot, tasks with `@due` are canonical
   - Daily-plan skill changes: (a) add `@due(today)` to selected Must/Should items, (b) write `## Today` with focus + meetings + "Priorities (from tasks)" referencing the tagged items
   - Daily-winddown: clears `@due` tags from previous day's items (or let them age naturally)

3. **SSE file-change events** — wire file watchers for `now/week.md` and `now/tasks.md` to emit SSE events when tasks change. Web UI auto-refreshes task views.
   - Backend SSE infrastructure already exists
   - Need: file watcher → SSE event → React Query invalidation

### Phase 1: Memory L3 Revamp (Subplan: memory-l3-revamp)

The highest-leverage improvement. A working L3 layer improves everything downstream — meeting processing gets better context, planning skills get scoped intelligence, dedup gets better signals.

**Principles**:
- L3 artifacts are **computed views, not user-maintained files**
- L3 is **automated and hidden** — constantly updated by the system as it learns
- L3 is **searchable** — included in QMD indexing
- Person memory refresh is the **model to follow** — it works because it's automated

**L3 storage**: All computed memory lives in `.arete/memory/` (hidden, system-managed):
- `.arete/memory/areas/{slug}.md` — area context cards
- `.arete/memory/summaries/collaboration.md` — working profile
- `.arete/memory/summaries/sessions.md` — session tracking
- Person memory stays embedded in person files (AUTO_PERSON_MEMORY) — it's small and benefits from co-location

**Subplan steps**:

1. **Auto-generated area memory** — compute `.arete/memory/areas/{slug}.md` from:
   - Keywords: extracted from area decisions + meeting titles + commitments
   - Active people: from area-mapped meetings in last 30 days
   - Open work: open commitments and tasks tagged to this area
   - Recently completed: resolved commitments from last 30 days
   - Recent decisions: already flows from meeting approval
   - Run automatically after meeting processing and during winddowns

2. **Decision compaction** — after a quarter, compact old L2 decisions into area L3 summaries. "15 decisions about email templates in Q1" becomes a paragraph, not 15 entries diluting search.

3. **Automated collaboration.md synthesis** — instead of waiting for 5+ observations that never come, derive collaboration profile from:
   - Agent-observations (when they exist)
   - Patterns in how user edits/approves meeting items (what they skip, what they change)
   - Planning patterns (what gets carried over, what gets done)
   - Run during weekly-winddown as a synthesis step

4. **Session tracking** — wire sessions.md into skill start/end hooks so it's automatically maintained, not manually written by the agent

5. **Make L3 searchable** — add area memory and summaries to QMD indexing:
   - `arete search --scope memory` → L2 items + L3 summaries
   - Area memory indexed alongside area files

6. **L3 freshness signals** — track `last_refreshed` in L3 files. `arete status` shows stale L3. Skills check before running: "Area memory for glance-comms is stale — refreshing first."

7. **`arete memory refresh` command** — unified refresh that regenerates all L3:
   - Refreshes all `.arete/memory/areas/{slug}.md` files
   - Refreshes all person memory (AUTO_PERSON_MEMORY)
   - Refreshes `.arete/memory/summaries/collaboration.md` (if observations exist)
   - Wired into weekly-winddown as final step
   - Reports: "Updated 3 area memories, 7 person memories"

### Phase 2: Close the Remaining Plumbing Gaps

After in-flight work lands AND L3 is working:

1. **Add Jaccard dedup to `TaskService.addTask()`** — prevent duplicates at write time
2. **Pass week.md tasks + area L3 to meeting extraction context** — LLM sees existing tasks AND area context during extraction (this is where L3 pays off)
3. **Planning skill dedup** — daily-plan checks for existing items before writing to week.md
4. **Commitment → task auto-promotion** — weekly priority selection auto-creates linked tasks
5. **Raise confidence include threshold** from 0.5 → 0.65

### Phase 3: Tighten the Hierarchy

Make relationships automatic instead of optional:

1. **Goals require area** — quarter-plan skill enforces area selection
2. **Projects link to goals** — general-project skill asks which goal on creation
3. **Tasks inherit scope** — auto-tag @area/@project from meeting/commitment context
4. **Week planning scopes by area** — "Which areas this week?" drives the planning flow
5. **Commitment inherits goal/area** — from linked project or meeting area

### Phase 4: Streamline Review UX

After reconciliation is proven:

1. **Global "Approve All" with confidence filter** in ReviewPage
2. **Meeting-level batch approval** — approve/skip entire meeting's items at once
3. **Smart auto-approve** — meetings where all items > 0.8 confidence auto-approve
4. **Review summary** — show what was auto-approved, what needs attention

### Phase 5: Consider Task/Commitment Unification (Longer Term)

Evaluate whether tasks and commitments should merge into a single "work item" entity:
- Text, due date, person, direction (from commitments)
- GTD bucket, scoring, area/project tags (from tasks)
- Source tracking (meeting, manual, commitment)
- One system of record instead of two

**Gate**: Only pursue this if Phase 2-3 don't resolve the disconnect.

### Smaller Task: Weekly Winddown Source Sync

Diff custom winddown overrides in arete-reserv against source versions. Identify refinements from daily use. Bring improvements back to source. Not a full plan — a focused PR.

---

## Key Principles

1. **Connect, don't simplify.** The concepts (areas, goals, projects, tasks, commitments) are all needed. The problem is they don't talk to each other.

2. **L3 is the integration layer.** When L3 summaries are computed, fresh, and searchable, every skill gets better context automatically. This is the highest-leverage investment.

3. **Automate and hide.** L3 should be invisible to the user — constantly updated by the system, injected as context when needed. The user sees better results, not more files to maintain.

4. **Person memory refresh is the model.** It works because it's automated, scoped to an entity, and has a CLI command. Area memory, collaboration profile, and session tracking should follow the same pattern.

## Open Questions

1. After intelligence-improvements lands, how much does the meeting review time actually drop? (Target: 25-45 min → 5-10 min)
2. Does task-management-ui's commitment linking feel natural in practice?
3. Is the hierarchy tightening (Phase 3) worth the migration effort, or is auto-tagging sufficient?
4. Should we pursue task/commitment unification or keep them separate with better bridges?
5. What's different in the custom winddown overrides vs. source? What should come back?
6. Should decision compaction happen quarterly (batch) or continuously (rolling 90-day window)?
7. Should agent-observations be rethought entirely? Current passive approach doesn't work. Options: (a) make it event-driven (hook into meeting approval diffs), (b) derive observations from behavioral patterns instead of relying on agent initiative, (c) merge into collaboration.md directly.
