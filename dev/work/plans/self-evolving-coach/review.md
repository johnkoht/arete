---
title: "Self-evolving coach (guide mode) — engineering-lead review"
slug: self-evolving-coach-review
status: complete
verdict: NEEDS-REWORK
reviewer: engineering lead (plan-reviewer persona)
created: "2026-06-03"
artifacts_reviewed:
  - dev/work/plans/self-evolving-coach/plan.md
  - dev/work/plans/preference-model/plan.md
---

# Engineering-lead review — Self-evolving coach (guide mode)

Reviewed as the eng lead who would own this code. I verified every file:line
claim against the tree, traced the load-bearing signal path, and stress-tested
the design decisions the prompt flagged. Findings are categorized
**BLOCKER** (step does not work as written) / **CONCERN** (real risk) / **NIT**.

## Verdict

**NEEDS-REWORK.** The plan is well-written and the keystone observation is
real and valuable, but the central falsifiability claim — that the Phase 2/4
depth loop "survives on the automatic edit-delta signal alone" — is **false as
written**. The edit-delta signal and the depth-preference signal come from two
unrelated surfaces. As specified, the depth loop is driven *entirely* by the
unreliable agent-self-logging the plan claims is "supplementary, not
load-bearing." That inverts the plan's own risk assessment and undermines the
"falsifiable in 3 sessions" promise. Plus two undeclared infrastructure
dependencies (session-identity, log-reading in the boot loader) that are
costed at near-zero but aren't.

Must-fix list (ranked) is at the bottom.

---

## 1. File:line claim verification

| Plan claim | Status | Note |
|---|---|---|
| edit applied at `staged-items.ts:505` (`editsMap[item.id] ?? item.text`) | **CORRECT** | line 505 verbatim. |
| `staged_item_edits` deleted at `:576` | **CORRECT** | line 576 verbatim. |
| `onApproved` observer at `:587-620`, fires per item, wrapped in try/catch | **CORRECT** | try/catch at 614-621; fires per record. |
| `ApprovedItemRecord` at `:425` | **CORRECT** | interface at 425-434. |
| observer "receives only the final text" | **CORRECT** | record carries `text` (post-edit), `kind`, `confidence`, `id` — no original. |
| memory-log grammar: `event` is open `string`, `formatEvent:55`/`appendEvent:135` | **CORRECT** | `utils/memory-log.ts` — `event: string` (`:31`), `formatEvent` at 55, `appendEvent` at 135. Extensible as claimed. |
| `person-memory.ts:aggregateSignals:148`, `minMentions:179` | **CORRECT** line numbers | but see CONCERN-A — what's *there* is not what the plan says it models on. |
| `memory-summary-loader.ts:loadMemorySummary:27` | **CORRECT** | function at 27. |
| `generators/claude-md.ts:generateActiveTopics:53` | **CORRECT** | function at 53; empty-string-on-empty behavior confirmed (`:54-55`). |
| persona directive `claude-md.ts:170-172` | **CORRECT** | the "Agent profiles" working-pattern bullet, skill-bound via `profile:` frontmatter. |
| reuse `normalizeForJaccard`/`jaccardSimilarity` "from `meeting-extraction.ts`" | **IMPRECISE** | canonical home is `utils/similarity.ts:13,28` (re-exported by `meeting-extraction.ts:247`). Import from `utils/similarity.js` / `utils/index.js`, not the service. NIT, but a plan that prides itself on file-grounding should get this right. |
| "compute the delta BEFORE the `delete` at 576" | **UNNECESSARY** | `editsMap` is a *local const* (`:479`); the `delete` only mutates `data['staged_item_edits']`, not the local. The local survives to line 587. Same pattern already used for `confidenceMap` (snapshotted at `:483`, read at `:594`). The delta can be computed in the observer-build loop at 587-612 with no reordering. Harmless, but signals the author didn't fully trace the data flow. |
| onApproved wired in `meeting.ts` + `workspace.ts` | **CORRECT** | `meeting.ts:1549-1565`, `workspace.ts:697-698`. Both already append item-fate; adding coach-outcome is a clean extension. |

No claim is outright wrong; one is unnecessary and one is imprecise. The
file-grounding is otherwise solid.

---

## 2. BLOCKER — the depth loop cannot run on the edit-delta signal (the big one)

This is the plan's load-bearing claim (Risk bullet, `plan.md:104`):

> "the *edit-delta* outcome (step 1) is automatic and deterministic; the
> agent-logged engagement signal is supplementary, not load-bearing. The loop
> survives on the automatic signal alone."

**Trace the two signals:**

- **Edit-delta** (`staged-items.ts:commitApprovedItems`) fires when the user
  approves *staged meeting-extraction items* — action items, decisions,
  learnings (`ApprovedItemRecord.kind` is exactly that union, `:429`). It
  measures *was this extracted item's text correct*. Surface: the meeting
  review/approve flow.
- **Depth signal** (step 4, `plan.md:64`): "after a summary-level answer, the
  user asks to go deeper." Surface: live guide-mode *conversation*. It measures
  *was the coach's conversational verbosity welcome*.

These are **different surfaces with no causal link.** Editing a staged decision
from "ship Q3" to "ship Q3 pending legal" tells you nothing about whether John
wanted the coach to lead with more depth in chat. There is no path by which a
`coach-outcome` for the `depth` lens can carry `evidence=edit-delta` —
the edit-delta event doesn't reference a depth intervention and can't, because
the depth intervention happened in a conversation, not in a staged item.

**Therefore:** for the depth lens (Phases 2 and 9 — *the entire falsifiable
core*), the only available outcome evidence is `engagement` / `follow-through`
/ `explicit` — all of which require the **agent to self-log** via
`arete coach log outcome`. The plan's own risk table calls that unreliable and
explicitly demotes it to "supplementary." So the falsifiable core depends
entirely on the signal the plan says it doesn't depend on. **The risk
mitigation is circular.**

What the edit-delta signal *can* drive is a **correction-quality lens** (was
the extraction good — verbatim/tweaked/rewritten). That's real and valuable —
and it's exactly the preference-model overlap (see §6). But that is NOT the
depth lens, and the plan picks depth as the keystone precisely because it's the
one John cares about. The keystone is built on the weak signal.

**Required fix:** Either
- (a) **Re-pick the keystone** so the falsifiable Phase-2 lens is one the
  edit-delta *actually* drives (a correction/extraction-quality lens), and
  demote depth to a later phase honestly labeled "depends on agent
  self-logging"; OR
- (b) **Own that the depth loop is agent-self-logged** and add a real
  reliability story for it (e.g. a deterministic in-CLI capture — a
  `arete ask --deeper` affordance, or parsing a turn-marker the harness emits)
  instead of asserting it away. Right now Phase 9's "promotes after 3 sessions"
  has no reliable input.

This single issue is why the verdict is needs-rework rather than
approve-with-revisions: the plan's stated win condition is not wired to a
signal that exists.

---

## 3. BLOCKER — undeclared session-identity dependency

Steps 4, 5, and 7 all gate on **"≥3 distinct sessions"** and a **"session
counter in `.arete/`"** (`plan.md:64,70,78`). I grepped the tree: **there is no
session counter, session id, or session-boundary concept anywhere** in
`packages/core` or `packages/cli` (the only `session*` hits are Krisp auth
sessions and the unrelated `.review-session-*` view files). The preference-model
plan also assumed `.arete/activity/` session tracking — that doesn't exist
either.

"Distinct sessions" is the core of the promotion gate AND the anti-nag budget.
Building reliable session identity (when does a session start/end? who stamps
it? how does the boot loader know the count?) is real work that is **not in the
"Files touched" estimate** and not a step. A guide-mode "session" isn't even
well-defined — is it a Claude Code conversation? A day? The plan needs a step
that defines and persists session identity, or it must re-gate on something
that exists (event count, or calendar-day buckets derived from the log
timestamps, which `log.md` already has). The latter is cheaper and I'd
recommend it.

---

## 4. CONCERN-A — "modeled on aggregateSignals" oversells the reuse

The plan repeatedly frames coach-calibration as "modeled directly on
`person-memory.ts:aggregateSignals:148`" and "the identical shape" of the
existing closed loops (`plan.md:36,70`). I read `aggregateSignals`: it is a
**plain frequency counter** — `count += 1`, track `lastMentioned`, filter
`count >= minMentions`, sort. No EMA, no reward, no recency-weighting, no
asymmetric update, no cooldown, no trust gate. `getActiveTopics` is a
filter+sort with a 90-day recency cutoff (`active-topics.ts:47,83`) — also not
a weighting scheme.

The coach's "recency-weighted reward EMA (α≈0.3), asymmetric floor, cooldown,
trust counter, per-cell intensity ladder" (step 5) is a **substantially new
mechanism**, not a re-skin of an existing one. That's fine *if acknowledged* —
but "no new subsystem" (`plan.md:36`) is misleading. It IS a new subsystem
(`coach-calibration.ts`, NEW, the largest file at ~120 LOC). The reuse is the
*event grammar* and the *boot-injection plumbing*, not the aggregation logic.
Re-word the plan to claim only what it reuses.

## 5. CONCERN-B — the bandit/EMA is over-engineered for this setting

Single user, sparse signal (interventions are "rare," `plan.md:110`), and the
plan itself says `push` is trust-gated and one `dismissed` floors a cell. With
those constraints, the EMA buys almost nothing: at α=0.3 and a handful of
events per cell, the EMA is dominated by the last 2-3 observations anyway, which
is indistinguishable from a simple counter rule. The whole policy reduces to:

> Default `nudge`. Promote to `push` after N welcomed across distinct sessions
> AND trust-gate met. Any `dismissed` → floor + cooldown.

That's a **counter + a cooldown timestamp per cell** — no EMA, no α, no
"reward" abstraction. It's deterministic, trivially testable, and matches
`aggregateSignals`' actual style. The "contextual bandit" framing imports
vocabulary (arms, reward, exploration) that the design doesn't actually use —
there's no exploration policy, and "intensity" is an ordered ladder, not
independent arms. **Recommend: cut the EMA, ship the counter rule.** If a real
multi-cell tradeoff emerges later, add weighting then. This also shrinks the
riskiest NEW file and makes Phase 9 falsification cleaner (fewer free
parameters to blame when it doesn't flip).

## 6. CONCERN-C — in-session vs cross-session adaptation is conflated

The Goal sells a *real-time* loop: "push at some intensity → observe the user's
actual response → lean in if welcomed, fall back if resisted" (`plan.md:21`).
But the only durable behavior change is the boot-context block, which is
**regenerated by `arete index` and read at session start** (`generateActiveTopics`
is a CLAUDE.md render; CLAUDE.md is boot context). So:

- "fall back if resisted" **within the same turn** depends entirely on the
  agent reading its own just-logged outcome and changing behavior live — there
  is no mechanism for that beyond the agent's own context window. The CLI log
  write does not feed back into the running session.
- The calibration block only changes John's *next* session.

The plan half-acknowledges this (the anti-nag per-session push cap is the only
in-session governor), but the Goal's framing promises in-session
responsiveness the architecture doesn't deliver. **Make the gap explicit:** the
loop is **cross-session** (boot block changes session N+1); the only
in-session control is the prompt-level governor. Phase 9's acceptance ("coach
leads with depth *without being asked*") is a cross-session, next-boot
assertion — fine, but state it that way.

## 7. CONCERN-D — boot loader can't read the log as costed

`loadMemorySummary` (`memory-summary-loader.ts:27`) takes a `TopicMemoryService`
and returns `{ activeTopics }` — full stop. It has **no storage handle and no
access to `log.md`.** Step 6 wants to populate `coachCalibration` "from
`aggregateInterventions` over `.arete/memory/log.md`." That means threading a
new dependency (a storage adapter or a log-reader) into the loader and every
call site that constructs it. The plan costs this at "~15 LOC" combined with
the `MemorySummary` field change. The field is 15 LOC; the dependency-threading
+ reading + parsing the whole log at boot is more, and touches the loader's
call sites. Not a blocker, but the estimate is light and the dependency isn't
named.

## 8. CONCERN-E — concurrency is fine for the log, NOT for a counter

I verified append atomicity: `FileStorageAdapter.append` uses `fs.appendFile`
(POSIX `O_APPEND`), and `MemoryLogService.append` prefers it
(`memory-log.ts:147-150`, `file.ts:60-64`, comment at `adapter.ts:30-37`).
Lines are short. So **parallel winddowns appending `coach-intervention` /
`coach-outcome` to `log.md` will not interleave or corrupt** — good, the plan's
"reuse the log" instinct is concurrency-safe for free.

**BUT** the proposed **session counter** (step 7) is a separate
read-increment-write on a counter file, which is **not** append-atomic and
**will race** under parallel processes — the exact "parallel winddown" case the
prompt asked about. This is another reason to derive "distinct sessions" from
log timestamps (append-only, race-free) rather than a mutable counter. Folds
into the §3 fix.

---

## 9. Preference-model overlap — concrete recommendation (the prompt deferred this to me)

Both plans spec automatic correction capture from the edit delta
(`preference-model` Phase 2; this plan Phase 1). preference-model is older
(2026-02-20), thinner, `status: idea`, 0 steps, and assumes infra that doesn't
exist (`.arete/activity/` session tracking, a file-watcher). Its genuinely
distinct ideas are: (a) a human-readable `collaboration.md` profile, (b)
skills *reading* that profile at brief-time, (c) periodic synthesis prompts.

**Recommendation: SPLIT, with this plan taking the substrate.**

- **Move into this plan (supersede in preference-model):** correction capture
  via the edit delta (preference-model Phase 2 → this plan Phase 1 — *they are
  the same mechanism; do not build both*). This plan's grammar-based event is
  the better implementation than preference-model's free-text
  `corrections/YYYY-MM-DD.md`.
- **Keep in preference-model (as the "passive apply" half), explicitly
  downstream of this plan's Phase 1:** the `collaboration.md` synthesis, the
  skill-brief integration ("apply concise format per your preference"), and the
  synthesis prompts. These are an *output-style* application path that this
  coach plan does not cover (this plan only changes the guide-mode *stance*, not
  PRD length / section structure / diagram inclusion).
- **Action items:** Add a line to preference-model's frontmatter/intro:
  "Correction capture superseded by self-evolving-coach Phase 1; this plan
  resumes at synthesis + skill application, consuming coach-outcome events." Add
  a line to this plan's Phase 1 acceptance: the `coach-outcome` edit-delta event
  is the capture substrate preference-model's synthesis will read.

Net: one capture mechanism (here), two consumers (coach stance here;
output-style there). Do **not** merge wholesale — the output-style application
is a real, separable lane.

Note this also reinforces §2: the *edit-delta* naturally serves a
**correction/output-quality** lens (the preference-model use case), which is
further evidence that depth is the wrong keystone for the automatic signal.

---

## 10. Sequencing / scope

- **Phase 1 as first ship: correct and well-chosen.** "Stop destroying the
  correction signal + emit an event" is a clean, low-risk, independently
  valuable change with a real unit test, and it's the substrate everything else
  (and preference-model) needs. Ship it even if the rest is reworked. One
  tweak: its acceptance should assert the event is the *correction-quality*
  signal, not pre-commit to the depth framing.
- **Phase 2 is mis-anchored** (see §2). As written it picks the one lens the
  Phase-1 signal can't drive. Re-anchor Phase 2 to a correction/extraction
  lens, or honestly mark it agent-self-logged + add the reliability mechanism.
- **Phase 3 before a working Phase 2 is premature.** Generalizing to N cells
  and building the EMA read-model only makes sense once one cell demonstrably
  flips. Keep the Phase 9 gate *between* a working single cell and Phase 3.
  Currently Phase 3 (step 5) is where the EMA lives but Phase 2 (step 4)
  already needs an aggregator ("a minimal `arete coach calibration --json` may
  compute just this one cell") — that's the EMA leaking into Phase 2. Pick one:
  build the counter rule in Phase 2, generalize in Phase 3.
- **"Out of scope: lens auto-drafting" — correct, keep it cut.** Agreed with
  the plan's own "likely candidate to cut entirely." With one user and rare
  interventions a bifurcation detector is a noise amplifier. Good call.
- **Add to scope (cheaply):** a definition of "session" (or replacement of the
  session gate with a timestamp-bucket), since three steps depend on it.

---

## Must-fix list (ranked)

1. **[BLOCKER] Fix the keystone signal mismatch (§2).** Re-anchor the
   falsifiable Phase-2 lens to one the edit-delta actually drives, OR own that
   depth is agent-self-logged and add a reliable in-CLI capture. The current
   "survives on the automatic signal alone" claim is false for the depth lens.
2. **[BLOCKER] Define/persist session identity, or re-gate on log timestamps
   (§3, §8).** Three steps depend on "distinct sessions" + a counter that
   doesn't exist and would race. Derive day-buckets from `log.md` instead.
3. **[CONCERN] Cut the EMA/bandit; ship a counter+cooldown rule (§5).**
   Over-engineered for single-user sparse signal; shrinks the riskiest new file
   and de-noises the Phase 9 falsification.
4. **[CONCERN] Resolve preference-model as SPLIT (§9):** capture here, synthesis
   + output-style application there; one capture mechanism only. Annotate both
   plans before building Phase 1.
5. **[CONCERN] Re-cost and name the boot-loader log dependency (§7)** and the
   `MemorySummary` threading; "~15 LOC" is light.
6. **[CONCERN] State the cross-session vs in-session gap (§6)** in the Goal so
   Phase 9's acceptance is honestly a next-boot assertion.
7. **[NIT] Fix the Jaccard import source** (`utils/similarity.ts`, not
   `meeting-extraction.ts`) and drop the unnecessary "before line 576"
   reordering — `editsMap` is a surviving local (§1).
8. **[NIT] Re-word "modeled on aggregateSignals / no new subsystem" (§4)** to
   claim only the grammar + boot-plumbing reuse.

Ship Phase 1 now (with the corrected acceptance framing). Rework Phases 2-3
against items 1-3 before building them. Phase 4 (person lens) inherits the same
§2 problem and should wait.
