---
name: week-plan
description: Plan the week — agent does all gather + carryover work upfront, then engages twice (priorities confirm → plan draft) per the chef-orchestrator two-engage variant.
triggers:
  - weekly plan
  - plan my week
  - plan the week
  - week planning
  - set weekly priorities
  - prepare a weekly plan
  - prepare weekly plan
primitives:
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
  - area_context
  - memory_retrieval
---

# Week Plan — chef-orchestrator (two-engage variant)

This skill applies the four chef-orchestrator patterns from
`PATTERNS.md` with the **two-engage variant** of Pattern 1
(`do-all-work-then-engage`).

Pattern names applied here:

- Pattern 1 — `do-all-work-then-engage` (two-engage variant —
  priorities → plan draft).
- Pattern 2 — `curate-with-reason-labels` (every suggested
  priority and every staged task carries a reason).
- Pattern 3 — `propose-with-mcp-action` (action proposals at
  end of the plan-draft engage).
- Pattern 4 — `surface-deferred-as-sidecar` (pruning candidates
  the user accepts roll to the shared
  `now/archive/week-plan/deferred-week-YYYY-WNN.md` sidecar).

Two engages are warranted because:

- **The midway decision is the user's call** — weekly priorities are
  not something the agent can reasonably infer.
- **The work after that decision changes meaningfully** — the plan
  draft depends entirely on which priorities the user confirms.

Engagement points:

1. **Engage 1** — Priorities. Agent surfaces last week's carryovers,
   quarter goals, recent themes, and suggested top-3-to-5
   priorities. User confirms / edits.
2. **Engage 2** — Plan draft. Agent uses confirmed priorities + wiki
   + commitments + calendar to draft the full week plan. User
   approves / edits.

Patterns 2 (reason labels), 3 (action proposals), and 4 (sidecar)
apply at both engages where relevant.

**Read first** (if exists): `.arete/skills-local/week-plan.md`.

## When to Use

- "Plan the week" / "set weekly priorities"
- "What should I focus on this week?" / "Week planning"
- Best run Sunday evening or Monday morning. Friday 4pm+ rolls into
  next week automatically.

## Workflow — two-engage chef pattern

### Step 0 — Read APPEND, log start (if Phase 0 weekly event added)

```bash
arete skill resolve week-plan
cat .arete/skills-local/week-plan.md 2>/dev/null || echo "(no APPEND file)"
```

**Timing detection** (one-line heuristic):
- Friday 4pm+ or weekend → "Let's plan next week (Week of <next Monday>)"
- Otherwise → "Let's plan the rest of this week (Week of <this Monday>)"

This message can be a single line at the start of Engage 1; not a
separate engagement.

### Step 0.5 — Prerequisite check: weekly-winddown ran for this week

**Phase 8-followup-3 — planning-chain hygiene.** Before gathering for
the plan, check whether `/weekly-winddown` ran recently. A solid week
plan depends on a fresh weekly retrospective; without it, the plan
inherits stale context.

```bash
# Most recent weekly-winddown file (sorted by mtime; the filename
# carries the date the winddown was run).
recent_ww=$(ls -t now/archive/weekly-winddown/weekly-winddown-*.md 2>/dev/null | head -n 1)
```

**Detection logic** (agent applies):
- If no file exists at all → strong nudge (winddown never run)
- If file exists but its dated filename (`weekly-winddown-YYYY-MM-DD.md`)
  is **>8 days old** → nudge (likely no winddown for the most recent
  completed ISO week)
- If file dated within last 8 days → silent skip (winddown ran recently)

The 8-day window handles Mon-Sun planning robustly: it catches the
Fri/Sat/Sun of the most recent completed ISO week regardless of which
day this skill is invoked.

**Nudge format** (surface this BEFORE Engage 1, as a one-line prompt):

> Looks like `/weekly-winddown` didn't run for the most recent ISO
> week. A weekly retrospective sharpens the plan with what shipped,
> what slipped, and what to carry forward.
>
> - Run `/weekly-winddown` first (recommended), then come back with
>   `/week-plan`
> - Or type `skip` and I'll plan without a fresh winddown

The user types `skip` to proceed, or runs `/weekly-winddown` in the
SAME terminal/session (no need to exit) and re-invokes `/week-plan`.
The agent context persists across the chain.

**Best-effort**: if the file-check fails (e.g., `now/archive/weekly-winddown/`
doesn't exist yet because winddown was never run), surface the nudge
and continue if user `skip`s. Never block the skill on this check.

### Step 1 — Gather (parallelize)

**Run in parallel** (one agent turn, concurrent tool calls):

```bash
# 1a. Quarter goals
cat goals/quarter.md
ls goals/2026-Q*.md 2>/dev/null  # individual goal files (post-migration)

# 1b. Areas
ls areas/

# 1c. Plan context — in-flight project state + active topics + goals + last
#     week's plan, in ONE pre-seeded, [source]-tagged bundle. This REPLACES the
#     old inert `ls projects/active/ + read each README` and `arete topic list`
#     steps: the bundle already carries, per active project, its status,
#     whatsNew (new meetings/commitments/topics since last touched),
#     selectedDocs[] (the relevant project document(s), traverse+selected — not
#     just the README), and openQuestions[] (the live questions you're
#     wrestling with). `lastWeek` carries prior now/week.md verbatim.
arete plan-context --week --json
#   Bundle shape (frozen contract):
#     { mode, projects[], topics[], goals[], lastWeek, generatedAt }
#     projects[] = { slug, status, whatsNew, selectedDocs[], openQuestions[],
#                    source, lowConfidence? }
#   Read the selectedDocs[] / openQuestions[] for any project you'll surface as
#   a priority — that is the detail/task-level substance week-plan slipped on
#   before. A `lowConfidence` flag means the doc was picked on recency, not a
#   strong topic match — verify before asserting.

# 1e. Scratchpad / carryovers
cat now/scratchpad.md 2>/dev/null

# 1f. Open commitments (full set)
arete commitments list --json

# 1g. Upcoming calendar (next 7 days)
arete pull calendar --days 7 --json 2>/dev/null

# 1h. Recent meeting summaries (last 7 days, for theme detection)
ls .arete/memory/summaries/meetings/2026-W* 2>/dev/null
# Or scan resources/meetings/<recent dates>.md frontmatter for
# importance + topics
```

> Note: `plan-context --week` already folds in last week's plan (`lastWeek`),
> active projects, and active topics — do NOT separately `cat now/week.md`,
> `ls projects/active/`, or `arete topic list`. If you need a specific
> project's full current state mid-plan, read it via the project-read service
> (`arete plan-context --project <slug>` / `arete project open <slug>`),
> never from memory or wiki — those lag in-flight work.

### Step 2 — Apply judgment for Engage 1 (priorities)

Decide what to surface as **suggested priorities** for the user to
confirm:

- **Carryovers from last week** — incomplete must/should from
  `now/week.md`. Reason: "carried from last week" or "stalled — N
  days, decision still owed."
- **Goal traction** — quarter goals where progress is overdue or
  where this week is the natural next step. Reason: "Q3 goal,
  milestone-week."
- **Theme momentum** — topics that compounded across last week's
  meetings. Reason: "3 meetings touched this last week."
- **High-importance commitments** — open `i_owe_them` commitments
  >7d to important counterparties. Reason: "open commitment to
  @person, 9d old."
- **Calendar pressure** — major meetings this week (customer / leadership)
  that need prep. Reason: "customer review on Wed."
- **In-flight project momentum / blockers** — from the `plan-context --week`
  bundle: a `status: blocked` project with open commitments, or an active
  project whose `whatsNew` shows movement (new meetings/commitments) or whose
  `openQuestions[]` name a decision now owed. Reason: "blocked on vendor SOW,
  3 open items" or "open question: Notion-vs-Jira source of truth — decide
  this week." Surface **stalled-but-important** projects (quiet `whatsNew`,
  status still active) with a concrete next task rather than dropping them.

Cap suggested priorities at **5 max** (3-5 sweet spot per the
"top-3-to-5 priorities" pattern). Items beyond that go to a
"Could surface" tier; user can pull back.

### Step 3 — Persist + Engage 1 (priorities conversation)

**Persist the curated priorities view to disk BEFORE engaging.** Write
the full Engage-1 output verbatim to `now/archive/week-plan/week-plan-YYYY-MM-DD.md`
(date is the planning date — typically Sunday or Monday). This is
the audit trail — without it the priorities-tier curated view is lost
when the conversation scrolls. AC10/AC11 soak evaluation needs it.

```bash
mkdir -p now/archive/week-plan
cat > "now/archive/week-plan/week-plan-$(date +%Y-%m-%d).md" <<'EOF'
{full Engage-1 priorities view}
EOF
```

Engage 2 (Step 5 below) appends a `## Engage 2 — Plan draft` divider
and the draft to the same file. Re-runs within the same day add a
`## Re-run at HH:MM` divider rather than overwriting earlier history.

```markdown
## Week Plan — {Week of YYYY-MM-DD}

{1 sentence framing — "Last week you wrapped X; the calendar this
week is Y; here's what I think you should focus on."}

## Suggested priorities (pick 3-5)

1. **Ship Cover Whale launch** — Q3 milestone-week, 4 stalled
   commitments tie here (Pattern 2: reason)
2. **Push Q3 churn pushback to Lauren** — carried from last week,
   customer-touching
3. **Resolve LEAP UK onboarding decision** — Wed customer review,
   needs prep

## Could surface

4. Anthony auto-attachments comms — long-running thread
5. Glance metrics ping to Lindsay — uncertain, possibly resolved

## Uncertain — your call

- [ ] Q3 OKR retrospective scheduling — 2 mentions in week, no clear owner. Make a priority or defer?

## Carryovers worth knowing

- Stale must from last week: "Send Rippling rollout plan" — 11d, drop?
- Calendar this week: 3 customer meetings (Tue, Wed, Thu)

## Quarter goals snapshot

| Goal | Status | This week's contribution |
|---|---|---|
| Glance 2.0 launch | active | Cover Whale launch is the milestone |
| LEAP rollout | active | UK onboarding decision Wed |

What's your call? Confirm 3-5 priorities (numbers from suggested + could),
edit text, or substitute. I'll draft the plan once we agree.
```

Wait for user response. Acceptable shapes:
- `1, 2, 3` → take suggested 1, 2, 3 as priorities
- `1, 2, 4 — replace 4 text with "Anthony comms — finalize Wed"` →
  same with edits
- `1, 2, my own: "Reset MA1 onboarding flow"` → free-form additions
- Free-form pushback / question → engage normally; loop until
  priorities are agreed

#### Step 3.5 — Week-memory capture pass (after Engage 1)

After the user confirms / edits priorities (and BEFORE priorities are written), scan each confirmation/edit against the **Capture Rule** (see `## Capture Rule` below). For every correction that passes the "would a fresh daily-plan agent re-derive this wrong tomorrow?" test, record it as a week-memory entry — capture on *correction*, not on importance. The three qualifying types are `framing-override`, `deprioritization`, and `week-constraint`; plain plan-text edits and vocabulary/terminology preferences do NOT qualify.

**De-dup before adding.** Read the active entries first, then add only what is genuinely new:

```bash
arete week-memory list --json
# For each qualifying correction (NOT already present as an identical type+statement):
arete week-memory add \
  --type framing-override \
  --statement "Lindsay email is NOT overdue — it's a proactive Wednesday update" \
  --why "John: it's a proactive Wed update, not a manager-facing overdue item" \
  --suppresses "<lindsay-commitment-id-or-free-text 'Lindsay email'>" \
  --json
```

An entry with an identical `type`+`statement` is a no-op — the core handles the de-dup — but check the list first so you don't even propose a redundant `add`. Use `--suppresses` only on `framing-override` entries (the target daily-plan should NOT surface). This pass is silent: do NOT engage the user per-entry here; the recap at Engage 2 is the single glance.

### Step 4 — Apply judgment for Engage 2 (draft the plan)

With confirmed priorities, build the full week plan:

- **Tasks per priority** — derived from open commitments tied to
  priority + carryovers + calendar prep + **the project's
  `selectedDocs[]` / `openQuestions[]` from the `plan-context` bundle**
  (the concrete next step often lives in the doc, not the commitment
  list). Each task with reason label. For a priority backed by a project,
  pull its `openQuestions[]` into specific tasks ("decide X", "draft Y")
  rather than a vague "work on project Z".
- **Tasks beyond priorities** — fold into Should / Could tiers
  rather than Must.
- **Daily allocation** — light scaffold based on calendar (Tue/Wed
  customer-heavy; Thu/Fri reflective work).
- **Meetings to prep** — flag customer / 1:1 / leadership meetings
  for `meeting-prep` skill.

### Step 5 — Persist + Engage 2 (plan draft)

**Append the plan draft to `now/archive/week-plan/week-plan-YYYY-MM-DD.md` BEFORE
engaging.** Use a `## Engage 2 — Plan draft` divider to separate from
the priorities view written at Step 3.

```bash
cat >> "now/archive/week-plan/week-plan-$(date +%Y-%m-%d).md" <<'EOF'

## Engage 2 — Plan draft

{full Engage-2 plan draft view}
EOF
```

```markdown
## Week Plan — Week of {Monday YYYY-MM-DD}

### Priorities (confirmed)
1. Ship Cover Whale launch
2. Push Q3 churn pushback to Lauren
3. Resolve LEAP UK onboarding decision

### Must complete
- [ ] Send compliance sign-off to CW team — priority 1; @from(commitment:cw_signoff)
- [ ] Draft churn pushback message for Lauren — priority 2; due Wed
- [ ] Prep for LEAP UK Wed call — priority 3; review existing onboarding doc

### Should complete
- [ ] Anthony auto-attachments rollout test — could-priority 4; if Tim ready
- [ ] Update Glance 2.0 stakes Notion — week-summary maintenance

### Could complete
- [ ] Q3 OKR retrospective scheduling — uncertain item, only if time

### Daily scaffold
- Mon: kick off CW launch; review LEAP UK onboarding doc
- Tue: focus block (CW launch); customer meeting prep
- Wed: LEAP UK call; Lauren pushback delivery
- Thu: 1:1 cadence (Lindsay, Anthony); roadmap slack
- Fri: weekly winddown + retro

### Meetings to prep this week
- Wed 10am — LEAP UK customer review (run meeting-prep)
- Thu 11am — Lindsay 1:1 (run meeting-prep)
- Thu 3pm — Anthony 1:1 (run meeting-prep)

### Carryovers from last week (deferred)
- 4 stale items pruned — see ./deferred-week-2026-WNN.md
  (≥4 deferred items always write a sidecar per Pattern 4; ≤3 surface
  inline without a file)

## Proposed actions

[1] arete.commitments_create text="Send Rippling rollout plan to Lindsay" target_person=lindsay due=2026-05-23
[2] (draft) jira.create_ticket project=GLANCE type=Task summary="LEAP UK onboarding plan" labels=[uk,leap]
[3] arete.inbox_add source=manual "Q3 OKR retrospective — book a slot if not already"

What's your call? Approve to write to `now/week.md`, or edit specific tasks.
```

Wait for user response.

#### Step 5.5 — Second capture pass + "Holding for the week" recap (after Engage 2)

(a) **Second capture pass.** Scan the draft refinements the user made during Engage 2 against the **Capture Rule** (same test, same three types, same de-dup-against-`list --json` discipline as Step 3.5). A refinement that changes how the system should interpret/surface something → `arete week-memory add`; a plain text edit → skip.

(b) **"Holding for the week" recap.** After the second pass, surface a 3–5 bullet recap of everything captured this session (across both passes). This is a **glance, NOT a per-item approval gate** — John reviews it in one shot and corrects in one shot if something looks off; do not prompt to approve each entry. Render from the live store:

```bash
arete week-memory list --active --json
```

```markdown
## Holding for the week

- [framing-override] Lindsay email is NOT overdue — proactive Wed update (suppresses the Lindsay commitment)
- [deprioritization] Analytics is in Josiah's court — fine to slip past PTO
- [deprioritization] Liability PRD punts to my return from PTO
- [week-constraint] 3-day pre-PTO sprint; OOO 6/25–30; Lindsay back 6/29 — leave nothing that stalls

These are the interpretive overrides daily-plan / daily-winddown will honor this week. Looks right, or correct any?
```

If John corrects an entry here, `arete week-memory resolve <id>` the wrong one and `add` the corrected one (one shot — not a loop).

### Step 6 — Write the plan + execute approved actions

After approval, archive any stale prior-week overrides BEFORE populating the new week, then write the plan:

```bash
# Archive a stale prior-week week-memory file before the new week
# begins. Week-stamped + idempotent: a same-week re-run is a safe
# no-op (it only archives + resets when the live file belongs to a
# prior week). Belt-and-suspenders with weekly-winddown's archive.
arete week-memory archive

# Write plan to now/week.md (preserves any user-edited
# template structure; uses templates/plans/week-priorities.md if
# customized)
# Run approved actions.
# Re-index.
arete index
```

## Sidecar conventions

- File: `now/archive/week-plan/deferred-week-YYYY-WNN.md` (same convention as
  weekly-winddown — they share the file when run consecutively;
  weekly-winddown writes first, week-plan reads + augments).
- Pruning candidates from week-plan that the user accepts get
  appended to that sidecar, not a separate file.

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `calendar.create_event` | executable | Schedule meetings derived from priorities |
| `slack.send_dm` / `slack.send_channel` | executable | "Send pushback to @person", "post weekly focus" |
| `jira.create_ticket` | draft-only | Themes warranting tracked work |
| `notion.update_page` | executable | "Update Glance 2.0 stakes doc" type updates |
| `arete.commitments_create` / `_resolve` | executable | New commitments, resolve completed ones |
| `arete.inbox_add` | executable | "Capture this for triage" type captures |

## Reason taxonomy (skill-specific extensions)

- **Carryover** — `carried from last week, stalled Nd`
- **Goal traction** — `Q3 milestone-week`
- **Customer pressure** — `customer review on Wed`
- **Theme momentum** — `3 meetings touched this last week`

## Uncertain-tier judgment (when in doubt, surface)

Week-plan's "Could surface" tier is the natural home for ambiguous
priority candidates. Bias toward surfacing — the user can pull back
in the priorities engage if it's not worth the slot.

**Category-level rule — these defer reasons are LOW-confidence
auto-defers; surface to Uncertain (or "Could surface") instead unless
the chef can articulate a specific, confident defer reason** (already
a confirmed priority; explicitly out of scope per APPEND; carryover
that user already declined last week):

- **"needs verification"** — a claim about ownership, status, or
  scope that the user might want to confirm before committing the
  week. Don't auto-defer; surface as "Verify before locking in or
  skip?"
- **"interesting future"** — a forward-looking idea that may or may
  not earn a slot this week. Don't auto-defer; surface as "Make a
  priority, hold for later, or skip?"
- **"covered elsewhere"** — chef thinks the item is already covered
  by an existing priority or open commitment — but the overlap is
  fuzzy. Don't auto-defer; surface with the cover-by reference for
  the user to confirm.

## Invoking daily-plan at full fidelity (WS-4)

When week-plan triggers `daily-plan` (e.g. to scaffold today within the weekly
flow), daily-plan **runs its complete step sequence — do NOT corner-cut.** The
week-plan context you've already gathered is passed in to *supplement*, never to
*replace*, daily-plan's required steps. Specifically, even when invoked from
week-plan, daily-plan MUST still:

- Run **per-meeting** `arete search "<term>" --scope memory --limit 2` for each
  prep-worthy meeting (daily-plan Step 4.5 / contextual_memory_search) — the
  week-level bundle does NOT substitute for per-meeting memory recall.
- Run **per-meeting** `arete plan-context --day` / agenda offers (daily-plan
  Step 5) for each meeting — week-plan's `--week` bundle is broader and is not a
  substitute for the day-scoped, per-meeting prep.
- Run **@due tagging** (daily-plan Step 3.6) for the confirmed focus tasks.

Rationale: a passed-in week bundle tempts the agent to skip the day's
per-meeting recall and agenda offers, which is the exact fidelity loss WS-4
fixes. Reused context is an INPUT, not a license to skip steps. (See
daily-plan/SKILL.md Steps 3, 3.6, 4.5, 5.)

## Capture Rule

Week-memory capture (Steps 3.5 + 5.5) follows the shared spec at [`../_shared/week-memory-capture.md`](../_shared/week-memory-capture.md): capture a correction ONLY when a fresh daily-plan agent reading only the vault would re-derive it wrong tomorrow; the only qualifying types are `framing-override`, `deprioritization`, and `week-constraint`; plain plan-text edits and vocabulary/terminology preferences do NOT qualify.

## References

- **PATTERNS.md** — chef-orchestrator patterns (two-engage variant
  documented in Pattern 1).
- **APPEND** — `.arete/skills-local/week-plan.md`.
- **Templates** — `templates/plans/week-priorities.md` (user-editable
  via `arete template resolve`).
- **CLI primitives** — `arete commitments list`, `arete topic list
  --active --slugs --json`, `arete pull calendar --days 7 --json`.
- **Local files** — `now/week.md`, `goals/quarter.md`,
  `now/scratchpad.md`, `projects/active/*/README.md`, `areas/*.md`.
- **Sidecar** — `now/archive/week-plan/deferred-week-YYYY-WNN.md` (shared with
  weekly-winddown).
- **Related skills**: `weekly-winddown` (produces "stage for next
  week" inputs that this skill consumes), `daily-plan` (daily-level
  tactical follow-up), `meeting-prep`.

## Rollback

If this rewrite degrades week-plan quality, revert the Phase 2
week-plan rewrite commit (per-skill commit; surgical revert):

```bash
git log --oneline packages/runtime/skills/week-plan/SKILL.md
git revert <phase-2 week-plan rewrite commit>
```

The user fork can also be restored from a `.fork-base/` snapshot if the
user has run `arete skill fork week-plan`.
