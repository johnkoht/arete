---
name: update-project
description: Flow what changed since a project README was last touched BACK into the README — area meetings, refreshed wiki topics, new commitments — as itemized, source-quoted proposals John approves per item. The write-back counterpart of /project. Never auto-writes.
triggers:
  - update project
  - /update-project
  - update the project
  - sync the project
  - pull that into the project
  - bring the project up to date
  - refresh the project from my meetings
work_type: general
category: essential
primitives: []
intelligence:
  - context_injection
requires_briefing: false
---

# Update Project Skill

`/update-project <name>` scans what changed since the project README was last touched and proposes README edits on the daily-winddown "proposed" surface. John approves per item; you apply EXACTLY the approved items — nothing else. This is the write half of the `/project` read/write split (phase-12 pre-mortem R1) and an instance of the **propose-edits-back-to-source-doc** pattern — read [PATTERNS.md](../PATTERNS.md) § propose-edits-back-to-source-doc before running this flow.

**The worked example this skill exists for (June-fixation, observed live 2026-06-10):** a meeting transcript records the goal moving to EOY-2026; the project README still says end of June. The correct run proposes the goal-date correction; touch nothing else. Not a status rewrite, not a tidy-up of adjacent sections, not a reformat — the one sourced correction, as one approvable item.

## When to Use

- "/update-project task-management-v1"
- "update the project from my last call"
- "I just had a call about X with Y — pull that into the project" (conversational entry, step 1b)
- After `/project` showed a non-empty "What's new since last touched" and John wants it reconciled

## Workflow

### 1. Resolve and Scan (CLI is the data path)

```
arete project open "<name>" --json
```

Same resolution rules as `/project`: on `disambiguation: true`, show the candidates and ask — **never auto-load a tie**. On `archived: true`, stop — archived projects are frozen; suggest `finalize-project`'s retro if the user wants a trace.

The scan inputs are the returned brief + `whatsNew` (meetings, refreshed topics, new commitments since the README mtime). **No LLM in the data path** — judgment applies on top of the CLI output, never inside retrieval. Then READ each surfaced meeting file at its `whatsNew.meetings[].path` — the proposals must quote real source text, not the index line.

Also run the topics-cache preview (pure read):

```
arete project refresh-topics <slug> --json
```

**1b. Conversational entry** ("pull my call with Y into project X"): resolve the meeting first — `arete resolve "<reference>"` or the meeting index — present the resolved file to confirm it's the right one, then run the SAME pipeline below scoped to that one meeting plus the refresh-topics preview. One flow, two entry points; no parallel logic.

**Empty scan**: if `whatsNew` is empty, say exactly that with the date: "Nothing new since the README was last touched (<since> date). Note: the scan compares at day granularity — a meeting from that same day is invisible to it." Then stop (or, in conversational entry, proceed with the named meeting anyway — the user just told you it matters). Never pad an empty scan with speculative proposals.

### 2. Compose Proposals (typed menu — one item, one approvable unit)

Every proposal is ONE of these types, quoted with its source (which meeting/topic/commitment justified it):

| Type | Shape | Applied via |
|---|---|---|
| **Status update** | New dated entry under `## Status Updates` (or correction to a stale Status/Goal line — the June-fixation shape) | explicit README edit |
| **Decision / learning to log** | Standard memory-item entry | append to `.arete/memory/items/decisions.md` / `learnings.md` |
| **New open question** | Bullet under `## Key Questions` (or `## Open Questions`) | explicit README edit |
| **Meeting link** | Reference line linking the surfaced meeting where it's discussed | explicit README edit |
| **Topics-cache refresh** | The refresh-topics preview verbatim: computed set vs cached set + `changed` flag | `arete project refresh-topics <slug> --apply` (the ONLY way topics persist — R1) |
| **Commitment claim** | Claim a surfaced unclaimed commitment for this project | `arete commitments claim <id> --project <slug>` |

Rules:

- **Source attribution on every item** — quote the line(s) from the meeting/topic that justify the edit, with the file path.
- **Backfill provenance hint**: if a source meeting's frontmatter has `area_set_by: backfill`, tag the item `(area set by backfill — verify this meeting actually belongs here)`. Machine-inferred provenance must not borrow the authority of source-quoting.
- **Don't pad.** If only one thing changed, propose one item. The dead-zone failure modes are "proposes nothing real" and "proposes so much that approving is slower than hand-editing" — both kill the flow.
- When unsure whether something rises to a proposal, use a short `## Uncertain — your call` tier (winddown pattern) rather than guessing in either direction.

### 3. Present (the winddown "proposed" surface)

```markdown
## Proposed updates — <project> (since <date>)

[1] STATUS — Goal date: "end of June 2026" → "EOY 2026"
    Source: resources/meetings/2026-06-09-glance-weekly.md — "we agreed the
    realistic target is end of year, not June"
    Edit: ## Status Updates new entry + correct the Goal line

[2] CLAIM — commitment 9f3b1c8e "Send Anthony the task spec" → claim for this project
    Source: whatsNew.commitments (unclaimed, area glance-2-mvp)
    Action: arete commitments claim 9f3b1c8e --project task-management-v1

[3] TOPICS — cache refresh: [snapsheet-task-replacement, task-queue-cleanup] (was: empty; changed: true)
    Source: arete project refresh-topics preview
    Action: arete project refresh-topics task-management-v1 --apply
```

John responds per item (`1, 3`, `skip 2`, `1 with <edit>`, `all`, `none`). Everything is proposed; nothing is auto-applied.

### 4. Apply (exactly the approved set)

- Apply ONLY approved items, each via its listed mechanism. Approved README edits are made surgically — touch only the lines the item names.
- Topics persistence happens ONLY through `arete project refresh-topics <slug> --apply` (the verb is change-gated: same slug set → zero writes). **Never hand-edit `topics:`/`topics_refreshed:` frontmatter** — that pair is system-owned (the ownership comment in the README says so).
- **Rejecting everything leaves the README byte-identical.** No "while I was in there" fixes, no reformatting, no frontmatter tidying.
- After applying README edits, run `arete index` once (the refresh-topics verb indexes its own writes).

### 5. Report

One line per applied item + anything skipped. For the soak window (first 3 runs, MC3): also record items-proposed vs items-approved counts and anything John then edited by hand — that hand-edit is a missed proposal and the soak's most valuable signal.

### 6. Usage log (soak instrumentation)

After the report, if `usage_log` is `true` in `arete.yaml`, apply the **Usage Logging** pattern (PATTERNS.md § Usage Logging): append one objective entry to `dev/soak/update-project.md`. Otherwise do nothing. Record the model tier, items-proposed vs items-approved, and anything hand-edited (the missed-proposal signal).

## Boundaries

- **Never write without an approved item.** Opening, scanning, and proposing are all pure reads (the CLI surfaces are tested write-free; this skill adds no write of its own before approval).
- **Touch nothing else** — the worked example is the rule: propose the goal-date correction; touch nothing else.
- The proactive/ambient version of this flow (firing unprompted) is explicitly out of scope — invocation is by John, via this skill only.

## Verification honesty

CI enforces write-safety on the VERB paths (refresh-topics zero-write/counting tests; the june-fixation substrate test proves the contradiction reaches this skill's context with zero scan writes). The apply/reject discipline of THIS prose — apply exactly the approved set, reject-leaves-untouched — is LLM-mediated: prose-pinned by the skill tests, behavior-verified in the 3-run soak, not CI-proven. Treat that as a reason for care, not a loophole.

## Rollback

Skill prose only — `git revert` of the commit that added this file removes the flow. The verbs it calls (`arete project refresh-topics`, `arete commitments claim`) are independent CLI surfaces with their own rollback paths. Applied README edits are ordinary git-tracked changes in the workspace, reviewable per diff.
