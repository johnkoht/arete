---
title: "Weekly Working Memory — correction-captured interpretive overrides"
slug: weekly-working-memory
status: approved
size: large
tags: [winddown, planning, memory, plan-context]
created: "2026-06-21T12:00:00.000Z"
updated: "2026-06-22T12:00:00.000Z"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 7
---

# Weekly Working Memory — correction-captured interpretive overrides

## Goal
Give the week a small, durable store of *interpretive overrides* — the corrections, deprioritizations, and week-shape constraints that a fresh daily-plan agent would otherwise re-derive wrong — captured automatically from John's corrections and read back through `arete plan-context` so every daily skill honors them without re-explaining.

## Context

When week-plan refinement closes and the context window resets, the *reasoning* evaporates. The plan body (`now/week.md`) survives, but the interpretive overrides John supplied in conversation do not. Concretely, in the 6/22 week-plan: "Lindsay email is NOT overdue — it's a proactive Wednesday update," "analytics is in Josiah's court, fine to slip past PTO," "Liability PRD punts to my return." A fresh daily-plan agent reading only the vault re-derives the Lindsay item as overdue/manager-facing and flags it red every morning. The override is lost; the nag repeats.

Two failure modes to avoid, both raised by John:
1. **Approval treadmill** — he will not review/approve entries item-by-item.
2. **Junk drawer** — a free-form "log everything about the week" file goes write-only and stops being trusted (this is the v2 winddown-bloat antagonist).

**The core design move: capture on correction, not on importance.** Importance is subjective and is exactly how junk drawers form. Corrections are self-selecting — rare, high-signal, and John has already made them explicitly in conversation. The agent records "John told me my read was wrong, here's the corrected version and why" — which is selective by construction and costs zero extra approval.

**The capture rule (precise):** Capture a correction *only when it changes how the system should interpret or surface something going forward* — not when it merely edits the plan's text. The test: **"Would a fresh daily-plan agent, reading only the vault, re-derive this wrong tomorrow?"** "Lindsay email is overdue" → yes (daily-plan re-flags it) → capture. "Reword priority 3" → no (lives in week.md, dies with it) → do not capture.

**Entry types** (the only three things that qualify):
- `framing-override` — corrects the system's inference about an item (e.g. "not overdue — proactive Wed update"); carries a `suppresses` target so daily-plan knows what NOT to surface.
- `deprioritization` — punt/defer with a reason and an owner (e.g. "analytics → Josiah's court, OK past PTO").
- `week-constraint` — a fact that shapes the whole week's lens (e.g. "3-day pre-PTO sprint, OOO 6/25–30, Lindsay back 6/29 — leave nothing that stalls").

**Non-examples (do NOT capture):**
- "Reword priority 3" — a plan-text edit; lives in `week.md`, dies with it.
- "Call it 'Liability PRD', not 'liability doc'" — a terminology/vocabulary preference with no interpretive override. The "re-derivable wrong?" test *fails* here: a fresh agent reading `week.md` already sees the correct term, so there's nothing to suppress. This is the most likely over-capture drift path into `framing-override`, so it's named explicitly.

**The read-back contract is the whole game.** Writing the file is the easy 20%; the value is daily-plan/daily-winddown reliably conditioning on it. The enforcement path is NOT uniform across the three skills, and the plan must be honest about that (the review caught an earlier overclaim here):
- **daily-plan already calls `arete plan-context --day`** — so wiring `weekMemory` into that bundle gives it the overrides for free. This is the one skill where read-back is structural.
- **daily-winddown and weekly-winddown do NOT call `arete plan-context`** — they read `now/week.md` and `arete commitments list` directly. For these, we add one explicit gather call (`arete week-memory list --active --json`) to their gather phase. That is still a single, named CLI read — not "hope the author opens a file" — but it is a deliberate per-skill edit, not a free ride.

So the enforcement model is: **one bundle field (daily-plan) + two explicit gather calls (the two winddowns).** Pretending all three get it "for free" is the failure the review flagged.

**Silent-suppression failure is the subtle risk.** Even with read-back wired, a `framing-override` whose `suppresses` target doesn't resolve to what daily-plan's scorer calls the same item will fail *quietly* — the data is present, the read ran, but the red flag still fires. This is harder to diagnose than a total miss. The mitigation is that suppression must be *observable*: when daily-plan applies (or fails to apply) a `suppresses` target, it surfaces a one-line note ("suppressed overdue flag on 1ceb15cc per week-memory" / "week-memory override could not be matched to a task"), so a miss is visible rather than silent.

**Lifecycle:** week-scoped truths die with the week. Spun up fresh at week-plan, pruned by daily-winddown as entries resolve, archived at weekly-winddown, fresh one next week-plan.

## Plan

1. **Define the store + schema + capture rule** — Create `now/week-memory.md` with a strict, agent-managed schema: a list of typed entries, each with `id`, `type` (`framing-override` | `deprioritization` | `week-constraint`), `statement` (what's true), `why` (John's correction, verbatim-ish), optional `suppresses` (the commitment id and/or free-text "what not to surface" target), `status` (`active` | `resolved`), and `created`. Add an onboarding template alongside `templates/weekly-plan.md`. Write the capture rule (the "re-derivable wrong?" test + the three types + the explicit non-examples, incl. the vocabulary-preference one) into a shared spec at `packages/runtime/skills/_shared/week-memory-capture.md` (or equivalent), referenced via a `## Capture Rule` link from week-plan, daily-plan, and daily-winddown SKILL.md. This file is agent-written and agent-pruned — explicitly NOT the sacred user-owned `## Notes` section and NOT a new section inside `week.md` (honors the week-plan LEARNINGS "Notes is sacred" invariant).
   - Acceptance: `now/week-memory.md` template exists; each entry carries `id`, `type`, `statement`, `why`, `status`, `created`; the 6/22 example renders as exactly 4 distinct-typed entries (Lindsay=`framing-override` w/ `suppresses`, analytics=`deprioritization`, Liability=`deprioritization`, week-shape=`week-constraint`); the capture-rule spec exists and is linked by `## Capture Rule` in the three SKILL.md files.

2. **Add `arete week-memory` CLI primitive** — Structured read/write so the skills don't hand-edit the same markdown and drift: `week-memory add --type --statement --why [--suppresses]`, `week-memory list [--active|--json]`, `week-memory resolve <id>`, `week-memory archive` (move current file to `now/archive/week-plan/week-memory-YYYY-WNN.md` and reset). Backed by `now/week-memory.md`. Mirrors the verified `arete commitments` pattern (`packages/cli/src/commands/commitments.ts` — same `list`/`resolve`/`create` shape). All file I/O through `StorageAdapter` (never `fs` directly, per Core PROFILE).
   - Acceptance: unit tests at `packages/cli/test/commands/week-memory.test.ts` cover — `add` writes an entry and returns its `id`; `list --json` returns it; `list --active` excludes resolved; `resolve <id>` flips status to `resolved` without deleting (retire, not erase); `archive` moves the file to the dated path and resets the live file to empty; `list --json` on an empty/absent file returns `[]` not an error. `npm run typecheck && npm test` green.

3. **Wire read-back: bundle field (daily-plan) + decide service location** — Extend the frozen `PlanContextBundle` in `packages/core/src/services/plan-context.ts` with `weekMemory: WeekMemoryEntry[]` (service-side composition, per the confirmed no-CLI-body-parsing invariant at plan-context.ts L16). `--day` returns `active` entries scoped to today's areas PLUS all `week-constraint` entries (constraints are always relevant); `--week` returns all `active` entries; resolved entries always excluded. **Service-location decision (state before build):** read `now/week-memory.md` inside `assemblePlanContext` via the existing `deps.storage` adapter if no class-level state is needed; if a `WeekMemoryService` class is introduced to back the CLI (step 2), wire it through `factory.ts` + the `AreteServices` type at `createServices()` time (not lazily) and pass it into `AssemblePlanContextDeps`. Pick one and record it here before execution. NOTE: this field only auto-reaches **daily-plan** — the two winddowns get their read via steps 6 and 7, not this bundle.
   - Acceptance: `arete plan-context --day --json` with an active `framing-override` for today's area includes it and includes all `week-constraint` entries; `--week --json` includes all active entries; resolved excluded. The existing plan-context snapshot test is extended: with no `now/week-memory.md`, `weekMemory` is present as `[]` and the rest of the bundle is byte-identical to the prior snapshot (proves additive, non-breaking). `factory.ts`/deps wiring choice documented in this step. `npm run typecheck && npm test` green.

4. **week-plan: capture during refinement + end-of-plan recap** — Add the capture hook to `week-plan/SKILL.md` at two named points: (a) **after Step 3 (Engage 1) user-response processing**, before priorities are written — scan each confirmation/edit against the capture rule and call `arete week-memory add` for qualifiers; (b) **after Step 5 (Engage 2)** — same scan over the draft refinements, then surface a 3–5 bullet "Holding for the week" recap of what was captured (a glance, not an approval gate; John corrects in one shot). week-plan also calls `arete week-memory archive` for any stale prior-week file before populating the new week (belt-and-suspenders with step 7). De-dup: skill checks `week-memory list --json` before `add`; an entry with identical `type`+`statement` is a no-op.
   - Acceptance: replaying the 6/22 transcript through the amended Steps 3+5 captures exactly the 4 qualifying entries and zero plain text-edits/vocabulary corrections; the "Holding for the week" recap appears once, at the end of Engage 2; running the skill twice in-week produces no duplicate entries (identical `type`+`statement` is a no-op).

5. **daily-plan: consume + act on overrides (observably)** — Amend `daily-plan/SKILL.md` Step 3 (which already calls `arete plan-context --day`) to read `weekMemory` from the bundle and: (a) suppress surfacing for any item matched by a `suppresses` target (e.g. does NOT flag the Lindsay commitment overdue), emitting a one-line note recording the suppression; (b) when a `suppresses` target can't be matched to a scored task, emit a one-line "override unmatched" note rather than failing silently; (c) apply `week-constraint` entries as the framing lens for the day's recommendations. Scoring/threading otherwise unchanged. Suppression is best-effort and NEVER hides a genuine future `@due` deadline (honors the existing `@due` invariant — downgrade visibility, don't drop).
   - Acceptance: scenario test — with `weekMemory: [Lindsay framing-override w/ matching suppresses]`, daily-plan does not present that commitment as overdue/red and emits the suppression note; with a `suppresses` target that matches nothing, it emits the "unmatched" note (no silent pass); the pre-PTO `week-constraint` visibly frames the day; with `weekMemory: []`, output matches current behavior.

6. **daily-winddown: explicit gather + retire spent entries + capture** — Add to `daily-winddown/SKILL.md` Step 1 (gather) an explicit `arete week-memory list --active --json` call (this skill does NOT consume plan-context). In Step 2/3 reconciliation: when an entry's condition is met (e.g. Lindsay email sent Wed), call `arete week-memory resolve <id>`; if John corrects an inference during winddown, `add` it (same rule). Surface resolutions in the curated view under a `## Week memory updates` line (with the retirement reason) so John sees what was retired — never a silent mutation.
   - Acceptance: with an active entry whose underlying item closes during the day, daily-winddown calls `resolve` and that entry is absent from the next day's `arete week-memory list --active` (and thus next-day daily-plan); a correction surfaced during winddown is captured; retired entries appear under `## Week memory updates` in the persisted curated view with their reason.

7. **weekly-winddown: explicit gather + archive + reset** — Add to `weekly-winddown/SKILL.md` Step 1 (gather) an explicit `arete week-memory list --active --json` call. At Step 4 persist, call `arete week-memory archive` so the week's overrides file to `now/archive/week-plan/week-memory-YYYY-WNN.md` and the live file resets empty. Surface any still-`active` entries in the weekly review as "carried interpretive context" so genuinely cross-week truths are re-stated by next week-plan rather than auto-copied or silently dropped (the archive reset is unconditional; carrying forward requires explicit re-statement).
   - Acceptance: after weekly-winddown, `now/week-memory.md` is empty and the prior week's file exists at the dated archive path; any still-active entries are listed in the weekly curated view under "carried interpretive context"; the next week-plan starts from an empty live file.

## Risks
- **Read-back is only structural for daily-plan; the two winddowns rely on an added gather call** (the core risk — same class as the topic-refresh reliability gap; the review caught the original "all three get it free" overclaim). Mitigation: daily-plan via the `plan-context` bundle field (step 3); daily-winddown/weekly-winddown via an explicit, named `arete week-memory list --active --json` gather step (steps 6, 7) — a single CLI read, not "open a file and hope." Acceptance tests assert each read path fires.
- **Silent suppression failure** (the devil's-advocate risk): a `framing-override` is captured and read, but its `suppresses` target doesn't resolve to the scored task, so the red flag still fires with no error. Mitigation: suppression is observable — daily-plan emits a one-line note on both apply and unmatched (step 5 AC), so a miss is visible, not silent. Best-effort matching never hides a genuine `@due` deadline.
- **Capture rule over-fires and recreates the junk drawer.** Mitigation: the "re-derivable wrong?" test + explicit non-examples (plain text edits) in the spec; the end-of-plan recap (step 4) is the cheap human backstop — if it shows noise, John sees it immediately and the rule gets tightened.
- **CLI primitive is scope creep vs. John's lean instinct.** Decision point: steps 2–3 add a primitive + contract change. Alternative is a pure managed-markdown file parsed by the plan-context service (no new CLI verb). Recommendation: keep the primitive — structured `resolve`-by-id is what makes the retire loop (step 6) reliable and prevents three skills drifting on freeform edits. Flag for John's call before build.
- **`suppresses` targeting is brittle** (matching an override to a commitment id / inference). Mitigation: start with commitment-id and free-text "what not to surface" targets; daily-plan does best-effort suppression and, when unsure, downgrades rather than hides (never silently drops a real deadline — honors the existing @due invariant).
- **Stale active entries accumulate across weeks** if weekly-winddown's "carry" surfacing becomes a rubber-stamp. Mitigation: archive resets the live file unconditionally; carrying forward requires an explicit re-statement next week-plan, not auto-copy.

## Out of Scope
- The long-lived "chief-of-staff" chat (Idea 1). Once the file is the source of truth, an always-open chat is optional sugar layered on top — not built here.
- Cross-week synthesis / trend memory. These are week-scoped truths that die with the week by design.
- A web/UI surface for week-memory. CLI + markdown only; UI is a later skin on the same model.
- Auto-capturing project-level decisions or anything that belongs in durable institutional memory (`.arete/memory/`) — this store is explicitly ephemeral working context.
- Changing daily-plan's scoring model or daily-winddown's reconciliation rules beyond the override-suppression and retire hooks.
