---
name: project-exit
description: Bookend a project work session — save the work product (not a transcript), write back durable decisions via the same approved surface as /update-project, drop a short "where you left off" resume note, and clear the loaded-project marker. The closing counterpart of /project. Never auto-applies.
triggers:
  - /project-exit
  - exit project
  - exit this project
  - wrap up this session
  - save and exit
  - pick this up later
  - done for now
  - close out this chat
work_type: general
category: essential
primitives: []
intelligence:
  - context_injection
requires_briefing: false
---

# Project Exit Skill

`/project-exit [<slug>]` ends a working session on an active project: it sweeps the
conversation for work that isn't on disk yet, proposes the durable write-backs on the same
per-item approved surface as `/update-project`, writes a small "where you left off" resume
note, and clears the loaded-project marker. The closing bookend to `/project` (open).

**Not `/update-project`** — that is a *mid-session* reconcile you run while you keep working;
it must NOT clear the marker or write a resume note. **Not `/finalize-project`** — that ends a
project's *lifecycle* (archive). This skill ends a *session* on a still-active project. If the
intent is ambiguous ("I'm done here", "let's close this out", "wrap up"), say in one line what
you're about to do and how it differs from the sibling, and confirm before any irreversible
step.

Slug optional: default to the loaded project (the `arete project mark-open` marker's slug). If
no marker and no slug, ask which project.

## When to Use

- "/project-exit", "wrap up this session", "save and exit", "I'll pick this up later"
- After a working session in `/project <slug>` context, before you `/clear`.

## Workflow

### 1. Capture sweep — work product, NEVER a transcript

Review the conversation for things **decided, explored, or drafted** that are not yet on disk.

- If it's a **work product** (a draft, spec, analysis, decision memo the chat produced),
  ensure it's written to the project dir under `projects/active/<slug>/`, sanely named, in the
  right place. If you already wrote it earlier, just confirm it's there and well-placed.
- If it's a **decision / learning / open question / commitment**, it becomes a proposal in
  step 2.
- **Never author a summary *about* the conversation.** The README status update + the resume
  note (step 4) already cover "what changed" and "where we left off." If you're writing prose
  describing the session rather than saving an artifact from it, stop — that's the bloat trap.
- After writing any durable file to the project dir, run `arete project mark-dirty` so the
  loaded-project marker reflects unsaved→saved state honestly.

### 2. Durable proposals — same surface + verbs as /update-project, with a friction budget

Compose proposals using the SAME typed menu and apply mechanisms as `/update-project` (read
`update-project/SKILL.md` § Compose Proposals — status update, decision/learning → memory,
open question, **artifact link** for a new file, commitment claim/create, topics refresh). Each
item is source-attributed ("in this chat you decided X"). Apply ONLY approved items, surgically.

**Friction budget (this is what keeps the flow alive — do not skip it):**

| Durable proposals | Surface |
|---|---|
| **0** | Silent fast path — NO approval prompt. Just do step 4 (resume note) + step 5 (clear marker), report in one line, then step 7 (usage log, if enabled). |
| **1–2** | A single inline yes/no, not the full winddown menu. |
| **3+** | The full per-item approved surface. |

Ceremony is reserved for sessions that earned it. A heavyweight prompt on a low-churn session
loses to `/clear` every time — and then the feature is dead.

### 3. Cleanup proposals (only if the session left scratch)

Surface scratch / half-draft files the session created and *propose* consolidation or removal.
Never auto-delete — look first, surface it, let the user decide.

### 4. Resume note (where you left off)

Write a small, bounded note via `arete project` (the CLI keeps a single-deep `.prev` backup):
`.arete/sessions/<slug>.md` with just:

- **Open threads** — what's unresolved (the in-flight thinking that isn't a decision yet).
- **Next step** — the one thing to pick up first.
- **Pointers** — files/links to re-open.

Keep it short. It is the in-flight scratchpad, not a log. If the CLI reports the new note is
*thinner* than the prior one, surface that ("this resume note is thinner than the last —
overwrite / merge / keep prior?") rather than silently clobbering richer context.

### 5. Apply + close the boundary

- Apply the approved set via the same verbs/edits `/update-project` uses. Run `arete index`
  once at the tail ONLY if a durable workspace write occurred.
- **No hollow status line.** Write the dated `## Status Updates` line ONLY when the session
  produced durable content the README didn't otherwise capture. A memory-only / no-op exit
  writes no status line (accept the open delta — don't pollute the README to force an mtime
  reset).
- **Same-day note:** if you wrote durable README content, tell the user that `arete project
  open`'s "what's new" compares at day granularity — anything dated *today* after this exit
  won't surface until tomorrow.
- Clear the marker: `arete project mark-clear`.

### 6. Report

One line each: what was saved, what was linked, which commitments, where the resume note lives,
and that the marker is cleared.

### 7. Post-report instrumentation

After you report — including the one-line silent fast-path report — if `usage_log` is `true` in `arete.yaml`, apply the **Usage Logging** pattern (PATTERNS.md § Usage Logging): append one objective entry to `dev/soak/project-exit.md`. Otherwise do nothing. This step runs on both the full flow and the fast path; record the model tier, what was captured/written-back, and whether the fast path was taken.

## Boundaries

- **Capture the work product, never a record of the conversation.** This is the load-bearing
  rule (anti-bloat). See [[project_arete_v2_direction]].
- **Never write without an approved item** (except the resume note + marker clear, which are
  this skill's own non-destructive bookkeeping).
- **Confirm before any irreversible move** when intent is ambiguous vs `/update-project` /
  `/finalize-project`.
- The proactive/ambient version (firing unprompted) is out of scope — invoked by the user only.

## Verification honesty

The CLI verbs this skill calls (`mark-open`/`mark-dirty`/`mark-clear`, `list`, the resume
sidecar read/write with `.prev`) are CI-proven. The skill's *judgment* — what to capture, what
to propose, when to take the fast path — is prose-pinned + soak-verified, NOT CI-proven (same
posture as `/update-project`). Treat that as a reason for care, not a loophole. The capture
sweep's recall (did it catch a real decision?) is the highest-value soak signal — a decision it
drops is silent loss.

## Rollback

Skill prose only — `git revert` of the commit that added this file removes the flow. The CLI
verbs it calls are independent surfaces with their own rollback.
