---
title: Product Simplification Assessment
slug: product-simplification-assessment
status: draft
size: large
tags: [product, architecture, planning, tasks, commitments, meetings, intelligence]
created: 2026-04-02T20:00:00.000Z
updated: 2026-04-02T20:00:00.000Z
completed: null
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

### 1. The Deduplication Gap (Partially addressed by intelligence-improvements)

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

### 2. Tasks + Commitments Disconnect (Partially addressed by task-management-ui)

**Current state**: Commitments auto-created from meetings → `.arete/commitments.json`. Tasks are mostly manual → `week.md`/`tasks.md`. Connected via optional `@from(commitment:id)` tag.

**What task-management-ui covers**:
- Task scoring engine (due date + commitment linkage + meeting relevance)
- Commitment → task auto-creation (when `i_owe_them` commitment created)
- Task completion → auto-resolves linked commitment
- "Waiting On" filter for commitment-linked tasks

**What's still missing after task-management-ui**:
- Automatic promotion: when commitment becomes weekly priority, auto-create linked task
- Unified view: one place to see "all work I need to do" regardless of source
- Weekly reconciliation: "these commitments should become Must tasks this week"
- Bidirectional sync: resolving a commitment should also check/complete linked tasks

### 3. Loose Hierarchy (Areas → Goals → Projects → Tasks)

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

### 4. Meeting Review Bottleneck (Mostly addressed by intelligence-improvements + wire-reconciliation)

**What the two plans cover**: Reconciliation pass, relevance tiers (high/normal/low), cross-meeting dedup, completed task matching, QMD workspace search, `--reconcile` CLI flag.

**What's still missing**:
- UI improvements: global "Approve All Above X Confidence" button
- Meeting-level batch review (approve all items from one meeting at once)
- Confidence threshold tuning (current include threshold 0.5 may be too permissive)
- Auto-approve for light meetings (partially exists but importance not always inferred)

## Recommended Phases (Accounting for In-Flight Work)

### Phase 0: Land In-Flight Work
- Complete `intelligence-improvements` (reconciliation, context cards, relevance scoring)
- Complete `task-management-ui` (web UI, scoring, commitment linking)
- Complete `wire-meeting-reconciliation-into-cli` (--reconcile flag)
- **This is already the right work.** Land it, use it for a week, reassess.

### Phase 1: Close the Remaining Plumbing Gaps
After in-flight work lands:

1. **Add Jaccard dedup to `TaskService.addTask()`** — prevent duplicates at write time
2. **Pass week.md tasks to meeting extraction context** — so LLM sees existing tasks during extraction
3. **Planning skill dedup** — daily-plan checks for existing items before writing to week.md
4. **Commitment → task auto-promotion** — weekly priority selection auto-creates linked tasks
5. **Raise confidence include threshold** from 0.5 → 0.65

### Phase 2: Tighten the Hierarchy
Make relationships automatic instead of optional:

1. **Goals require area** — quarter-plan skill enforces area selection
2. **Projects link to goals** — general-project skill asks which goal on creation
3. **Tasks inherit scope** — auto-tag @area/@project from meeting/commitment context
4. **Week planning scopes by area** — "Which areas this week?" drives the planning flow
5. **Commitment inherits goal/area** — from linked project or meeting area

### Phase 3: Streamline Review UX
After reconciliation is proven:

1. **Global "Approve All" with confidence filter** in ReviewPage
2. **Meeting-level batch approval** — approve/skip entire meeting's items at once
3. **Smart auto-approve** — meetings where all items > 0.8 confidence auto-approve
4. **Review summary** — show what was auto-approved, what needs attention

### Phase 4: Consider Task/Commitment Unification (Longer Term)
Evaluate whether tasks and commitments should merge into a single "work item" entity:
- Text, due date, person, direction (from commitments)
- GTD bucket, scoring, area/project tags (from tasks)
- Source tracking (meeting, manual, commitment)
- One system of record instead of two

**Gate**: Only pursue this if Phase 1-2 don't resolve the disconnect.

## Key Principle

**Connect, don't simplify.** The concepts (areas, goals, projects, tasks, commitments) are all needed. The problem is they don't talk to each other. Making them share context is the path to making Arete feel effortless.

## Open Questions

1. After intelligence-improvements lands, how much does the meeting review time actually drop? (Target: 25-45 min → 5-10 min)
2. Does task-management-ui's commitment linking feel natural in practice?
3. Is the hierarchy tightening (Phase 2) worth the migration effort, or is auto-tagging sufficient?
4. Should we pursue task/commitment unification or keep them separate with better bridges?
