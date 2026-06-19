# Theme-render — winddown organized by project/area, not by meeting

Status: **v1 = COARSE, BUILD-READY** (revised 2026-06-18 from MORNING-REVIEW disposition; John
greenlit coarse-first + the recommended revisions). Successor to W4 (chef-holistic-reconcile).
Depends on: W4 single-pass + reconcile + the Step-2.0 chef topic-review (the assignment seed) shipped
on `feat/winddown-approval-doc`. Built on top of that branch (theme-render is a continuation of the
single-pass arc, not a separate feature — John is the sole user, living on the branch).

## Why now (the problem W4 left open)

The winddown extracts and renders **by meeting**. That fragments how you actually work and think:

1. **Supersession is fragile-by-construction (#22).** 6/18: morning Jamie decisions (single recipient,
   dynamic-only) were reversed by the afternoon Anthony spec-sync (multiple recipients, join table,
   renamed). Per-meeting extraction can't see it (the afternoon meeting's extraction never saw the
   morning's uncommitted staged items), and the cross-meeting reconcile narrated the pivot in the
   doc header but never propagated it to per-item supersede tags — one *superseded* morning decision
   was even pre-elevated `[x]` (stale-commit risk). You only need a fragile "detect supersession
   across meetings" pass *because* you extracted per-meeting.
2. **Cross-cutting meetings dump everything into one section.** A Lindsay 1:1 touching comms +
   status-letters + Glance-2 lands all three topics in one meeting block — you can't see "all
   status-letter decisions today" in one place. (v1 coarse accepts this; v2 decomposes it.)
3. **Slack/email/DMs aren't woven into the topic narrative** — they sit in a separate "threads that
   moved" table, disconnected from the decisions they bear on. (Deferred to v2.)
4. **The winddown's actual job is theme-shaped.** It (a) updates knowledge — which lives by
   project/area — and (b) surfaces decisions/commitments. Both are organized by theme, not by event.

This converges three existing threads: [[project_chef_holistic_reconcile]] ("one reconcile pass"),
[[project_supersession_gap]] ("winddown sees the arc"), and [[project_arete_v2_direction]] (Karpathy
wiki — knowledge by topic). Theme-render is the main line, not a detour.

## v1 SCOPE DECISION (the headline) — COARSE assignment

**v1 assigns the WHOLE MEETING to its dominant theme** (project-primary / area-fallback / misc),
reusing the *already-shipped* Step-2.0 / `writeMeetingTopicsToFile` meeting-level `topics:` surface —
**zero new assignment plumbing.** Then: cluster meetings by theme → within-theme chronological
reconcile → theme-grouped render.

This delivers the #22 supersession prize **immediately** with the least risk, because:
- the assignment surface already exists and is soaking (no new `staged_item_theme` map, no parser, no
  cleanup-filter wiring, no finding-#12 orphan trap);
- a cross-cutting meeting lands all its items on one theme — which is exactly what coarse assignment
  does anyway, so **no supersession payoff is lost** by deferring item-level split;
- it sidesteps the meeting-`topics:`-vs-per-item coexistence gap entirely (assignment == the meeting's
  dominant `topics:` entry, same object).

**Deferred to v2 (explicitly out of v1 scope):** item-level assignment (a meeting's items split
across themes), cross-cutting decomposition, the slack/email/jira weave, and weekly parity. See "v2
(deferred)" below. The "worst of both worlds" — item-level-without-decomposition (new plumbing, no
cross-cutting payoff) — is explicitly NOT built.

## Target flow (v1 coarse)

```
GATHER (unchanged)         pull meetings + slack + email + jira + calendar + commitments
EXTRACT (unchanged)        per-meeting, single-pass — faithful capture, meeting-scoped provenance
ASSIGN     (v1: COARSE)    chef assigns each MEETING to a project (primary) / area (fallback) / misc,
                             reusing the shipped Step-2.0 meeting `topics:` surface — no new plumbing
CLUSTER    (W1)            group all today's MEETINGS by assigned theme
RECONCILE  (W2)            per cluster, walk oldest→newest by meeting timestamp:
                             supersession (latest wins, mark earlier), moot (#21), dedup vs open
                             commitments (Rule 4, GLOBAL scope), fulfillment (Rule 1) — within a theme
RENDER     (W3)            per-theme sections; consolidated decisions/actions/learnings + the ARC +
                             superseded/ignored items shown w/ reasons + chef reasoning
STAGE/APPLY (reuse W4)     elevate the genuine keeps; checkbox-diff apply; meeting-scoped anchors
```

Daily runs this over today (+7-day context). Weekly parity is v2.

## Decisions

- **D1 — Hybrid: extraction stays per-meeting; a theme layer is added on top.** The transcript is the
  right *capture* unit (clean provenance, faithful extraction). The *review/output* unit becomes the
  project/area. Don't lose per-meeting capture; reorganize the view.
- **D2 — Clustering key: project-primary, area-fallback, then `misc` (John, 2026-06-18).** Each
  meeting is assigned to (1) an active project (`projects/active/*`) if it clearly belongs, else (2)
  an area (`areas/*.md`), else (3) a `## Uncategorized` bucket.
- **D3 — Assignment is CHEF SEMANTIC, MEETING-level in v1 (item-level deferred to v2).** The lexical
  `detectTopicsLexical` is title-blind, generic-word-biased, closed-vocab (it mis-tagged "Status
  Letter"). The chef reads each meeting (title + attendees + its items) and assigns it to a
  project/area from the active list — the Step-2.0 topic-review just shipped IS this surface. The
  lexical detector survives only as a weak *hint* the chef may consult, never the decider. **v1 is
  meeting-level** (one theme per meeting); item-level split is v2.
- **D4 — Anchors stay MEETING-scoped (`id@meeting-slug`); the render re-GROUPS them by theme.** The
  key de-risker, verified (both reviews, 2026-06-18): **the apply half is free** —
  `parseWinddownDoc`/`buildApplyPlan`/`executeWinddownApply` diff purely by anchor and derive commit
  grouping from `meetingSlug` *inside the anchor*, with zero dependence on doc order/heading/grouping
  (`winddown-apply.ts:156-217,282-336,502-522`). So a theme-grouped doc apply-diffs identically; no
  re-keying, no apply rewrite, flip-the-flag rollback holds. **But the render half is a real rewrite,
  NOT a thin regroup:** `ChecklistView.meetings: ChecklistMeeting[]` is meeting-keyed and
  `renderStagedBlock`/`renderMeeting` emit `## <meeting>` headers; theme mode needs a NEW
  theme-grouped view type (`ThemeView { themes: ThemeGroup[] }`) + render fn + re-homed
  FYI/Your-call/tier-sort logic (those splits are computed per-ChecklistMeeting today). **New render
  AC: the theme render emits BYTE-IDENTICAL anchor lines (`<!-- de_001@meeting-slug -->`) so apply
  stays unchanged** — AC6 tests the anchor bytes, not just "apply works". (Considered theme-scoped
  anchors; rejected — rebuilds the tested apply path for no provenance gain.) Invariant: the baseline
  and edited doc must be the SAME grouping (B-3 guard + B-4 cp both operate on the theme-grouped
  render); add a cross-mode baseline-grouping invariant test.
- **D5 — Within-theme chronological reconcile is where supersession/moot live.** Order a theme's
  meetings by timestamp. Meeting `date:` carries a full datetime on the live MCP path — **verified
  75/75 recent meetings** (e.g. `2026-06-18T11:00:00.000Z`); slack carries epoch. Defensive fallback:
  the codebase also has date-only importers (`krisp/save.ts:67` etc.), so if a meeting ever lacks a
  time, fall back to staging order — never assume. Walk oldest→newest: a later decision that revises
  an earlier one → mark the earlier `superseded` (skip-with-reason "superseded by [later], 15:00
  spec-sync"), keep it visible in the arc **carrying its anchor** (so a wrongly-superseded item is
  re-elevatable via apply rescue), never commit it, never pre-elevate it. Moot (#21) runs here too,
  theme-scoped. **Supersession becomes "read in order, latest wins" — not a separate fragile pass.**
  NOTE (pre-mortem R10): **Rule-4 open-commitment dedup stays GLOBAL (all open commitments, per the
  CHR contract), NOT theme-scoped** — only supersession/moot are theme-scoped, else a cross-theme
  duplicate commitment escapes. Reconcile with #20 before W2 freezes.
- **D6 — Render = per-theme sections.** Each project/area heading carries: consolidated
  decisions / action items / learnings (the live, post-supersession set, elevated per W4's
  conservative default), the ARC (superseded/changed items shown with the flip visible, inline at the
  item — NOT a trailing block), ignored items with reasons, and a short chef reasoning line. The
  checklist/elevate/apply surface rides on top unchanged. See MOCK.md for the concrete layout (it is
  the golden fixture's expected output).
- **D7 — `## Uncategorized` is a STRUCTURAL default, not a judgment outcome.** The render iterates the
  FULL staged-item set and routes any item whose meeting has no/invalid theme assignment to
  Uncategorized. Silent loss is impossible by construction (mirrors how apply surfaces unknown anchors
  as warnings, never drops). Emergent-workstream gets a chef nudge ("looks like a new workstream: X —
  create a project?"), suppressed if it recurs unactioned (don't re-nag daily). Never auto-create
  projects/areas (user owns the spine).
- **D8 — Proposed-only, mark-don't-skip, all W4 approval machinery preserved.** The engine computes
  and proposes; the chef organizes; the user approves via the same elevate/checkbox-diff/apply flow.
  Superseded/ignored items are marked + visible, never silently dropped.
- **D9 — Out of scope (v1):** item-level assignment + cross-cutting decomposition (v2); slack/email/
  jira weave (v2); weekly (v2, same engine different horizon); auto-creating projects/areas; the #20
  open-commitment-mechanization (separate, composes here); re-architecting extraction (stays
  per-meeting); **cross-day supersession** (today's item reversing a memory item from last week) —
  explicitly punted to avoid scope creep.

## Work items (v1)

- **W1 — Meeting→theme coarse assignment + clustering.** Use the shipped Step-2.0 chef topic-review:
  the chef's per-meeting `topics:` (project-primary/area-fallback) IS the assignment. Cluster today's
  meetings by their dominant theme. Any meeting with no valid theme → `## Uncategorized`. No new
  write surface — reuses `meeting topics` / `writeMeetingTopicsToFile`. Chef logs assignments in
  `## Notes`; user can override via the existing `meeting topics` verb.
- **W2 — Within-theme chronological reconcile engine.** Per cluster: timestamp-order the meetings;
  supersession (latest wins, mark earlier), moot (#21, reuse Rule 3b), Rule-4 open-commitment dedup
  (GLOBAL scope), fulfillment (Rule 1). Reuses the existing `reconcile nominate` mechanical leg for
  same-text dedup; the supersession/arc logic is chef judgment over the chronologically-ordered
  cluster (semantic, not Jaccard). Writes superseded-status + arc metadata.
- **W3 — Theme-grouped render.** New `ThemeView` data model + render fn: group meeting-anchored items
  under project/area headings, chronological within, with the arc inline + ignored + reasoning.
  **Anchors byte-identical + apply unchanged (D4).** `winddown_render: theme` flag (default still
  `checklist`); prose/checklist modes preserved for rollback.
- **W6 — Shadow soak + golden replay.** Run theme-render in shadow alongside checklist for ≥5 days;
  the 6/18 status-letter day is the canonical golden fixture (3-session supersession arc + the moot
  case). Deletion of per-meeting render gated on the soak report. Soak alarm: degenerate distribution
  (>70% one theme or >40% Uncategorized → flag — catches "silently reverted to per-meeting
  narration").

(W4 decomposition + W5 slack-weave/weekly from the original plan are now the **v2 (deferred)**
section below.)

## Acceptance criteria

- **AC1 — Supersession by construction (the #22 fixture):** replaying 6/18, the morning single-
  recipient / dynamic-only decisions render under the status-letter theme as **superseded** by the
  afternoon multiple-recipients / join-table decisions; the arc is visible inline; **no superseded
  item is pre-elevated `[x]`**; the afternoon (latest) version is the one elevated.
- **AC2 — Moot still fires (#21):** the "hold afternoon session" action is moot-skipped within the
  theme.
- **AC3 — Count conservation (the single most important AC):** every staged item appears in **exactly
  one** section (a theme or `## Uncategorized`); none lost, none duplicated. The render iterates the
  full staged set; unassigned → Uncategorized structurally.
- **AC4 — Assignment accuracy:** ≥90% of meetings land on-label vs a hand-labeled key for 6/18, **0
  items lost** (count-conservation holds even when assignment is wrong — a mis-assigned item is
  visible in the wrong section, never dropped). Status-letter meetings land under
  `status-letter-automation` (the thing the lexical detector missed).
- **AC5 — False-supersession guard:** a fixture where a later item refines a *different facet* of the
  same theme → BOTH survive, neither marked superseded (the silent-loss twin of AC1). Superseded
  items stay `[ ]`-with-reason **carrying their anchors** so a wrongly-superseded item is
  re-elevatable via the apply rescue path.
- **AC6 — Apply unchanged + anchors byte-identical:** the W4 checkbox-diff/elevate/baseline/apply path
  works identically on a theme-grouped doc; the theme render emits anchor lines byte-for-byte
  identical to checklist mode (asserted on bytes); B-2 commitment-rot invariant + B-3 guard hold.
- **AC7 — No-regression rollback:** `winddown_render: checklist` (and `prose`) still produce the W4
  behavior byte-for-byte; theme mode is flag-gated. Cross-mode baseline-grouping invariant test.
- **AC8 — Latency ≤ +20% wall-clock vs checklist** (inherit the CHR budget; the per-theme passes
  replace, not add to, the per-meeting reconcile work).

## Testing strategy

- **Layer 1 (unit):** the deterministic bits — clustering meetings by assigned theme, timestamp
  ordering, the theme-grouping render (given an assignment + items → correct grouped doc with
  byte-identical anchors), the Uncategorized routing + count-conservation. Reuse `reconcile nominate`
  unit tests.
- **Layer 2 (golden replay):** the 6/18 status-letter day, hand-labeled (meetings → themes, the
  supersession arc, the moot case). Scores AC1–AC5. Expected output = MOCK.md. This is the regression
  harness for the chef-judgment layers (assignment + supersession) — judgment can't be unit-tested, so
  the worked-example replay is the gate, same pattern as CHR.
- **Layer 3 (shadow soak, W6):** theme-render in shadow vs checklist for ≥5 days; assignment
  corrections per day (how often you override the chef's theme assignment), supersession catches,
  mis-assignment/lost-item rate (hand-audited), latency, degenerate-distribution alarm. Deletion
  gated on the report.

## Sequencing
W1 (coarse assignment + cluster) → W2 (within-theme reconcile) → W3 (theme render, shadow via W6) →
Layer-2 golden replay against MOCK.md → W6 soak ≥5 days → gate → delete per-meeting render last.
No hard dependency on a main-merge (sole user, building on the branch).

## v2 (deferred)
- **Item-level theme assignment** — a new `staged_item_theme` map (frontmatter + parser +
  cleanup-filter wiring per the finding-#12 orphan trap + verb + renderer read). B-2-sized surface;
  only worth it once coarse proves the architecture.
- **Cross-cutting decomposition** — a meeting's items distributed across N theme sections, none lost,
  none duplicated, provenance preserved. The hard half; pairs with item-level.
- **Slack/email/jira weave (old D7)** — cluster the ledger's slack/email/jira rows into themes so a
  project section shows meetings AND evidence in one narrative (replaces the "threads that moved"
  table).
- **Weekly parity (old W5)** — same engine, week horizon ([[project_winddown_shared_engine]]).
- **#20 open-commitment mechanization** — load commitments into `loadReconciliationContext`; composes
  into W2's Rule-4 leg.

## Skeptical view (seeds the pre-mortem)

- *"Clustering will mis-assign and lose items."* — Count-conservation (D7/AC3) makes loss impossible
  by construction; the Step-2.0 soak gives real data on chef assignment reliability; transparency +
  user override is the safety valve. Mis-assignment is the #1 risk — Layer-3 measures it by
  hand-audit, not trust. Coarse (meeting-level) is materially lower-risk than item-level.
- *"This is a big-bang render rewrite."* — The render IS a real rewrite (D4, honest), but anchors +
  apply are unchanged, theme mode is flag-gated, checklist stays default until the soak report.
- *"Per-theme LLM passes blow the latency budget."* — They replace the per-meeting reconcile, not add
  to it; AC8 caps it at +20%; cluster-then-judge scales with theme count, not meeting count.
- *"Chef assignment is judgment — it'll drift."* — Same answer as CHR: mechanical bits are tested;
  assignment is regression-tested by the golden replay with the 6/18 worked example; every assignment
  is logged + overridable.

## Rollback
Shadow mode IS the rollback until the last step: `winddown_render` stays `checklist` by default; flip
to `theme` per-run. Anchors/apply/frontmatter contracts are unchanged (D4), so no data migration in
either direction. Per-meeting render deleted only after a clean soak; revert = flip the flag.

## Relationship to other plans
- W4 / chef-holistic-reconcile — hard dependency (extraction tiers, reconcile engine, elevate/apply,
  Step-2.0 assignment seed). Theme-render is its successor; built on the same branch.
- [[project_supersession_gap]] — D5/AC1 implement "winddown sees the arc" structurally.
- [[project_arete_v2_direction]] — knowledge-by-topic is the v2 wiki spine; theme-render is the
  winddown half of it.
- #20 (open-commitment mechanization) — composes into W2's Rule-4 leg (v2).
- Weekly parity ([[project_winddown_shared_engine]]) — v2, same engine different horizon.
