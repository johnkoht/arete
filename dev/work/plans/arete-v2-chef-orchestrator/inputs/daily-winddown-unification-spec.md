# Design Spec: Unified Daily Winddown (cross-source reconciliation)

> **For:** the Areté build agent / product team
> **From:** John Koht (end-user workspace `arete-reserv`), via design discussion
> **Date:** 2026-05-28
> **Status:** Design proposal — seeking build-agent feedback before implementation
> **Scope:** `daily-winddown`, `slack-digest`, `email-triage` skills + a new cross-source
> reconciliation step. Touches upstream skills — see Open Question #1.

---

## 1. The problem

Today's `daily-winddown` is a strong chef-orchestrator: it gathers **meetings +
commitments + week.md + agendas**, applies judgment, and engages once with a curated
view. But it reconciles each item only *against stored state* (week.md, commitments.json).

It does **not**:
- Pull Slack, email, Jira, or a forward calendar as part of the same flow.
- Reconcile the day's sources **against each other** and **against time-order**.

The result: meeting action items get staged that the user has already resolved through
*another channel earlier the same day*. The user then hand-skips them. The winddown is
noisier than the actual state of the world.

**Real example (workspace meeting `2026-05-28-john-nate-pre-runyon-checkin`).** Five
action items were staged; the user manually marked all five `skipped`. Three should have
been auto-skipped if the flow had cross-referenced Slack + calendar:

| Item | Text | Why it should auto-skip | Evidence |
|---|---|---|---|
| `ai_002` | "Confirm with Lindsay the pre-read package was sent to Runyon" | User DM'd Lindsay asking exactly that; she replied "yes" | **Slack** |
| `ai_003` | "Find a suitable staging claim for live walkthrough" | The Runyon call already happened | **Calendar (event passed)** |
| `ai_004` | "Meet with Nick and Anthony to review prototype" | A Friday meeting with them is already booked | **Calendar (event scheduled)** |

The user's framing: *"I want it to flow and work together — not just call 4–5 skills.
Synthesize my whole day and focus on the main takeaways. If I told someone I'd set up a
call and I created the invite, don't surface it as a task. If I said in Slack I want to
hop on a call, propose setting one up. If action items were resolved on a later call,
don't surface them."*

---

## 2. The core model: the day as a ledger of *loops*

The unit of work is not "a Slack digest" or "an email digest." It is a **loop**: an
intent, commitment, question, or decision, with:
- a **source** (meeting / slack / email / calendar / jira),
- a **counterparty** (person),
- a **timestamp**,
- a **state** (open / fulfilled / superseded).

Every source emits loops into **one ledger**. The new value — the "magic" — is a
**reconciliation pass** over that ledger that matches intents to fulfilling actions
across sources and across time, then collapses what's already closed.

---

## 3. Proposed flow

```
GATHER (parallel)   slack · calendar(today-created + next-30-day) · jira(watchlist)
                    · email · meetings · commitments · week.md
        │
EXTRACT             each source → normalized "loops" via shared, GATHER-ONLY extractors
                    (reuse slack-digest's significance_analyst, email-triage's classifier
                     — but do NOT trigger their own user engagement)
        │
RECONCILE (the gate, runs BEFORE staging)
                    unify identities (arete resolve) → order by time
                    → apply the 4 skip rules (below)
                    → CONSERVATIVE collapse: concrete evidence only; fuzzy → Uncertain
        ├── closed / superseded ──→ dropped from review, but TRACED in "Closed today"
        ├── survivors ────────────→ staged into the existing meeting-review UI
        └── fuzzy ─────────────────→ chat "Uncertain — your call" tier
        │
ENGAGE ONCE         meeting-review UI for staged survivors · chat for leftover + actions
        │
PERSIST             approved actions · wiki + memory + commitments · index
```

### The four skip rules (reconciler)

1. **Intent → fulfilling action elsewhere.** To-do "confirm with Lindsay" + a DM to
   Lindsay doing exactly that (bonus: detect her reply) → closed. (`ai_002`)
2. **Intent → already-scheduled event.** To-do "meet with Nick & Anthony" + a calendar
   invite with them already exists → closed; the event *is* the fulfillment. (`ai_004`)
3. **Action moot — its event already passed.** Prep item for an event that has now
   occurred → moot. (`ai_003`) *(event-relative staleness, not intent/fulfillment)*
4. **Item superseded by a later item.** A learning/decision from meeting 1 corrected or
   voided by meeting 2 → only the corrected version survives. *(Applies to ALL item
   types — tasks, commitments, decisions, AND learnings.)*

---

## 4. Decisions locked (with rationale)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | **Collapse aggressiveness** | **Conservative.** Silent-collapse only on *concrete* evidence (real invite/message/ticket; matching counterparty + topic + same-or-later timestamp). Fuzzy → Uncertain tier. | The dangerous failure is silently burying a real obligation. Mirrors the skill's existing "when in doubt, surface to Uncertain." |
| D2 | **Closed-loop visibility** | A **"Closed today"** narrative section traces source→fulfillment (*"You promised Anthony X, sent via Slack ✓"*). | Collapse must never be a black box; also gives a sense of accomplishment, not just backlog. On-vision for Areté. |
| D3 | **Orchestration** | **Shared extractors, one engagement.** `slack-digest` / `email-triage` gain a gather-only mode and feed the ledger. Standalone skills still work for just-Slack / just-email. | User explicitly rejected "5 separate digests." "Engage once" must move *up* to the orchestrator. |
| D4 | **Where reconciliation sits** | **Before staging.** The meeting-review UI should only ever show *survivors*. Closed/superseded items never reach it; fuzzy items go to chat. | User: *"things shouldn't make it to the UI if concretely resolved or changed. Anything left can be handled in chat."* Cleaner than a post-hoc cleanup pass. |
| D5 | **UI scope** | The existing **meeting-staging review surface** stays the approval UI for survivors. Slack/email/Jira are primarily *evidence sources* + their open loops handled in chat. | Matches how the user already reviews/approves. |
| D6 | **Closure rule** | **"You acted = done"** by default, with agent **judgment on the nature of the ask.** Fire-and-forget closes on send; a blocking question closes on send but may drop a light "waiting on \<person\>" only if an answer is needed to unblock. Detect the actual reply when present (then close cleanly, no follow-up). | The to-do is the user's, not the counterparty's. But blocking asks shouldn't silently drop. |
| D7 | **Reconciler implementation** | **Agent judgment in-context** (no new CLI primitive initially). Persist only *open survivors* to commitments. Harden into a CLI later if it proves out. | Lighter to ship; the matching is inherently judgment-heavy. |
| D8 | **Runtime** | **Always full.** No light/full toggle. | User runs winddown when he has time; prefers completeness over speed. |
| D9 | **Calendar pull is two queries** | (a) events **created/modified today** (fulfillment evidence for rule 2); (b) **next 30 days** (tomorrow/preview). | Different temporal scopes; both cheap. |

---

## 5. Open questions for the build agent

### Q1 — Upstream vs. local fork (architectural; most important)
This design modifies **three upstream skills** (`daily-winddown`, `slack-digest`,
`email-triage`) and adds a reconciliation step. In this workspace, `.arete/skills/*/SKILL.md`
is upstream-managed and **overwritten on `arete update`** — only the per-skill APPEND
files (`.arete/skills-local/*.md`) and forks (`arete skill fork` + `.fork-base/`) survive.

**So this should be built upstream in the Areté product, not as a local fork.** Questions:
- Is "gather-only mode" for `slack-digest` / `email-triage` a general capability worth
  adding to the chef-orchestrator pattern (a documented sub-mode where a skill extracts +
  returns structured loops *without* engaging)? Other orchestrators would benefit.
- Should the reconciler be a new shared primitive (e.g., `arete reconcile`) or stay
  agent-judgment per D7? If a primitive, it's reusable by weekly-winddown too.
- How do we keep the extraction logic DRY so the standalone skills and the orchestrator
  don't drift?

### Q2 — Where should the Jira watchlist live? (the user raised this directly)
The user wants Jira pulled for **only the epics/initiatives he cares about**. Today there
is **no structured store** — epic keys (`PLAT-11014` inbound emails, `PLAT-10025`
signatures, `PLAT-7240`) live as *prose* in `memory/topics/` and project READMEs.

There **is** an `areas/` directory whose files carry frontmatter that's currently nearly
empty. Proposal to evaluate:
- Add a structured field (e.g., `jira_epics: [PLAT-11014, PLAT-10025]`) to **area** and/or
  **project README** frontmatter, and have winddown read the union across active
  areas/projects.
- Alternative: a single watchlist in the winddown APPEND file.
- Which is the right home, and should `arete` expose a helper to resolve "my active epics"
  from frontmatter?

### Q3 — Cross-source identity resolution
Same person appears as a Slack handle, an email address, a meeting attendee, and a Jira
assignee. Rule 1/2 matching depends on unifying these (e.g., "promised in meeting,
fulfilled in Slack"). `arete resolve` exists — is it sufficient, or does the reconciler
need an identity-unification helper across these channels?

---

## 6. Risks

- **Silent drop (primary).** The engine decides a loop closed and buries a real
  obligation. Mitigated by D1 (concrete evidence only) + D2 (everything collapsed is
  traced in "Closed today").
- **Hallucinated matches.** Agent infers an invite/message fulfills an intent when it
  doesn't. Mitigated by conservative thresholds + fuzzy→Uncertain.
- **Volume / runtime.** Heavy Slack + email days produce large ledgers. Significance-gate
  *before* reconciliation (don't reconcile noise). D8 accepts longer runs.
- **Logic drift** between standalone skills and the orchestrator's extraction (see Q1).

---

## 7. What "done" looks like

On the `2026-05-28-john-nate-pre-runyon-checkin` example, the winddown would:
- **Auto-skip** `ai_002`, `ai_003`, `ai_004` (with each shown in "Closed today" with its
  evidence trace) — none reaching the staging UI.
- Stage only the genuinely-open survivors (`ai_001` screenshots, `ai_005` analytics skill)
  for review.
- If `ai_004` had had *no* Friday invite, propose `calendar.create_event` instead of
  staging a vague "meet with Nick & Anthony" to-do.
