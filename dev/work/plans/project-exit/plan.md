---
title: "/project-exit — bookend the project chat (save, link, resume) + statusline presence"
slug: project-exit
status: planned
size: large
tags: [projects, cli, skills, harness]
created: 2026-06-20T03:03:02.000Z
updated: 2026-06-20T04:06:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 7
---

# /project-exit — bookend the project chat (save, link, resume) + statusline presence

Status: PLAN — eng-lead review (10 CRs) + pre-mortem (3 CRITICAL, 8 HIGH, 4 MED) incorporated. Authored 2026-06-19; mitigations folded 2026-06-20. Build is split into Increment A (shippable MVP) + B (harness).
Depends on: `/project` (open) and `/update-project` skills (shipped, phase-12/14).
Related memory: [[project_projects_first_class]], [[feedback_cli_review_surface]], [[project_arete_v2_direction]] (winddown bloat is the antagonist), [[feedback_l3_memory]] (memory = computed views, not user-maintained).

## Why now

`/project <slug>` has become a daily, native-feeling "project chat." It opens read-only with a rich brief + "what's new since the README was last touched" (mtime delta). What's missing is the **bookend**: a clean way to end a working session so the next `/project open` picks up where you left off — durable decisions written back, work products saved and linked, and the in-flight thread captured.

Two adjacent gaps fall out of that:
1. No visible signal that a project is loaded in the current chat (today you check Obsidian to confirm the slug).
2. No way to enumerate projects without leaving the tool (Phase 2).

## Plan

Build sequence, **revised after the pre-mortem (`pre-mortem.md`, 3 CRITICAL folded).** Two increments with a real cut line: **Increment A (steps 1–4) = the shippable MVP** (marker verbs + sidecar + exit skill + list — pure CLI, degrades gracefully with no statusline/hook); **Increment B (steps 5–7) = harness wiring**, ships or reverts independently (M3). Phase/AC references point to the detailed sections below.

**Before step 1 — environment translation (H7).** This ship runs in a Claude Code session, not pi: map `/worktree create`→`EnterWorktree`/`ExitWorktree`, `@gitboss`/orchestrator dispatches → in-session review, and commit planning artifacts to the worktree/feature branch, NOT main. Hard pre-flight: assert CWD is under `.claude/worktrees/project-exit/` before any code write.

**Increment A — shippable MVP:**
1. **Marker verbs + main-root pin + scoped zero-write fix** — `arete project mark-open` / `mark-dirty` / `mark-clear` writing `<main-root>/.claude/active-project.json` via one shared **main-checkout-root helper** (C3, never the worktree root); scope the `snapshotTree` prune to exactly `active-project.json` + `.last-greeting`, NOT all of `.claude/` (M3 — `.claude/` holds worktree source trees). (P1-AC1, AC1b, AC2, AC3, AC10, AC11; CR-1, CR-3)
   - Acceptance: marker written from a worktree CWD lands at the main root and is read back by the main-checkout statusline; open stays write-free; update-project's read doesn't clobber; re-open overwrites + resets dirty; scoped prune still catches a stray non-`.claude/` workspace write.
2. **Resume sidecar (core helper + `.prev` backup + open surfacing)** — `readResumeSidecar(slug, paths)`; `arete project open` emits a `Resume:` block via the CLI JSON envelope (not `ProjectBrief`); single-deep `.prev` backup on write (H3). (P1-AC6, AC7; CR-6)
   - Acceptance: surfaced top-of-brief when present, absent → no block/no error, stays unindexed (regression guard), prior note recoverable via `.prev` + thinner-note flagged.
3. **`/project-exit` skill** — capture-sweep → proposals **with the 0 / 1–2 / 3+ friction budget (C2)** → cleanup → apply (**status line only when durable content; no hollow line, H4**; same-day blind-spot noted) → `mark-clear` → report. (P1-AC4, AC5, AC5b, AC8, AC9; CR-2, CR-7)
   - Acceptance: soak-verified discipline (no transcript dump, apply-exactly-approved, reject=byte-identical, recall oracle per H5); zero-proposal silent fast path; change-gated reindex.
4. **`arete project list` + `/project` no-arg picker + routing confirm** — list verb (sorted by README mtime) + numbered-pick prose; triggers disjoint from update/finalize AND ambiguous intent → confirm-before-irreversible (H2). (P2-AC1–AC4; CR-5)
   - Acceptance: list output/JSON/sort/empty/not-in-workspace; never auto-opens; ambiguous "wrap up/close out/done" utterances land on a confirmation, never a silent archive.

**Increment B — harness wiring (separate, independently revertable):**
5. **Statusline script** — reads the marker via the main-root helper, renders clean/dirty/absent, with the **mtime backstop for dirty (C1)**. Unit-test the script end-to-end (feed a marker path, assert stdout — M4). (P3-AC3, AC3b; CR-8)
6. **SessionStart greeting hook** — startup-only, once/day; surfaces a resume candidate only if it has a sidecar AND recent project-dir activity (H1); also runs the clear-time mtime backstop + stale-marker wipe. Honest **teardown** documented since `.claude/` is gitignored / not `git revert`-able (H6). (P3-AC1, AC2)
7. **(Optional) single Stop nudge** — build ONLY if C1 shipped and soak still shows missed work (M1); one-shot, gated on elapsed-since-last-*write*. Metronome NOT built. (P3-AC4)

**Coordination (H8):** register the marker schema, the three `mark-*` verbs, and the SessionStart hook contract as the canonical interface the future pi→Claude-Code **port must consume, not regenerate**; exactly one SessionStart hook owner.

**Adoption gate (M2):** the moment this must win — "Monday open of a project, the resume note saves the 5-min re-orient." Track exit-completed vs `/clear` ratio over the soak; <30% after 2 weeks → cut Increment B, keep only the marker.

## Design principles (the guardrails)

- **Save the work product, never a record of the conversation.** Drafts, specs, analyses, decision memos the chat *produced* are durable and get saved + linked. A narrative summary *about* the chat is the bloat trap — the README status update + the resume sidecar already cover "what changed" and "where we left off." If exit is authoring prose *about* the session rather than curating artifacts *from* it, that's the smell.
- **Reuse the verbs + the convention, not a shared code path (CR-2).** There is no `applyProposals()` engine in core to import — `/update-project`'s "machinery" is *skill prose* that orchestrates independent, already-CI'd CLI verbs (`project refresh-topics --apply`, `commitments claim`, surgical README edits by the agent, appends to `.arete/memory/items/*`). So `/project-exit` **re-authors the same per-item approved-surface prose and calls the same verbs with the same apply-exactly-approved discipline** — it does not (cannot) `import` a write path. Honest reuse = shared verbs + restated convention. Genuinely new code: capture-sweep (prose), resume sidecar (helper + verb), statusline marker (verbs + hook).
- **exit ≠ update-project.** `/update-project` is also a *mid-session* verb (reconcile a call, keep working). It must NOT clear the marker or write a "we're done" resume note. Those two moves are exit-specific — which is why this is a separate command, `/project-exit`.
- **Not `finalize-project` (CR-5).** `finalize-project` ends a project's *lifecycle* (review outputs → commit to context → archive). `/project-exit` ends a working *session* on a still-active project. Three project-write-ish skills now share a "wrap up / done" trigger surface — keep `/project-exit`'s triggers disjoint from finalize's (`finalize project`, `complete this project`, `archive`) and update's, and add a routing-sweep AC (P2-AC4) so "exit / wrap up this session" lands on the right verb.
- **The README mtime is the session boundary.** Writing durable items resets the mtime, so the next open's "what's new" correctly starts from here. Resume note = in-flight; mtime = "all acknowledged up to now."
- **No interactive interception of `/clear`.** Structurally impossible (no pre-clear hook; hooks are non-interactive; context is gone by the time `SessionStart(source:clear)` fires). The statusline marker is the *passive* substitute for the prompt, not a guarantee.

---

## Phase 1 — `/project-exit` + statusline presence

### 1a. Statusline marker

A small harness-state file under `<workspace-root>/.claude/active-project.json` (NOT workspace content):
```json
{ "slug": "glance-2-mvp", "name": "Glance 2 MVP", "opened_at": "2026-06-19T14:02:00Z", "dirty": false }
```

- **Written by a dedicated write verb, NOT by `open` (CR-3).** `arete project open` is contractually `READ-ONLY: ... Never writes.` (`project.ts:316`), AND `/update-project` uses `project open` as its pure-read data path (`update-project/SKILL.md:38`) — so writing the marker *inside* `open` would both break the advertised contract and make every mid-session reconcile re-stamp the marker. Fix: add a separate, clearly write-capable verb **`arete project mark-open <slug>`** that the `/project` (open) skill calls *after* the read. `open` itself stays untouched; `/update-project` never calls `mark-open`. (Rejected alt: a `--no-marker` flag on `open` + re-wording its contract — muddier.)
- **`dirty` flag — LLM bit + filesystem backstop (C1, was OQ2).** The agent sets `dirty:true` via `mark-dirty` when it writes durable content — but the loss-bearing path must NOT depend on that bit alone (that's how `/clear` silently shreds in-flight work). So the statusline script AND the SessionStart-on-clear hook also `stat()` the project dir + `.arete/sessions/<slug>.md` mtimes vs the marker's `opened_at`, and treat "any file changed since open" as dirty. The bit can only ever *upgrade* clean→dirty, never the reverse. (Reverses the earlier "too heavy" dismissal — it's a stat-per-file on render, not a diff engine.) **Residual gap, documented:** a purely verbal decision with zero artifact still won't flip dirty — John must not rely on the marker for that case.
- **Marker/sidecar root = the MAIN checkout, never the worktree (C3).** Worktrees live under `.claude/worktrees/<slug>/`, so `workspace.findRoot()` / `git rev-parse --show-toplevel` from inside a worktree resolves the wrong root — the marker would be written where the main-checkout statusline/hook can't read it (feature looks shipped, silently dead for John). All three `mark-*` verbs + the statusline script + the SessionStart hook resolve the marker path through ONE shared helper pinned to the main-checkout root (the common parent of `.claude/worktrees/`).
- **Statusline script** reads `<main-root>/.claude/active-project.json` **directly** (CR-8 — no `workspace.project_dir` key; resolve via the shared main-root helper from C3) and renders:
  - clean: `▸ glance-2-mvp`
  - dirty: `▸ glance-2-mvp · unsaved`
  - absent: nothing.
- **Cleared by `/project-exit`** on a clean exit, via a CLI verb **`arete project mark-clear`** (the clear is CLI-side so it's testable — see P1-AC3). None of `mark-open`/`mark-dirty`/`mark-clear` touch the qmd index (they don't write workspace content); only the exit *apply* tail reindexes (CR-9). All three route every exit path through `--json` cleanly (CR-10).
- **SessionStart hook** (`source: "clear" | "startup"`) wipes any stale marker so a fresh session never inherits a previous project's marker. Optional add-on: if the wiped marker was `dirty`, inject a one-line `systemMessage` ("you cleared with unsaved work in <slug>; its resume note may be stale") — an after-the-fact notice, not a save (the context is already gone).

### 1b. `/project-exit <slug?>` flow

Slug optional — defaults to the marker's slug if a project is loaded.

1. **Capture sweep.** Review the conversation for things *decided, explored, or drafted* that are not yet on disk. For each: if it's a work product (draft/spec/analysis/memo), ensure it's written to the project dir, sanely named, in the right place — this is the "ensure the agent remembers to document it" step John asked for. If it's a decision/learning/open-question, it becomes a proposal in step 2. Nothing here is a transcript dump.
2. **Durable proposals (same surface + verbs as `/update-project`, CR-2) — with a friction budget (C2).** Present the same per-item approved surface — re-authored in this skill's prose, calling the same CLI verbs: status update, decision/learning → memory, new open question, **artifact link** (new file → README pointer), **commitment claim/create**, topics refresh. Source attribution per item. Don't pad. **Friction budget:** 0 durable proposals → silent fast path (mark-clear + sidecar, one-line report, NO approval prompt); 1–2 items → a single inline yes/no; 3+ → the full per-item surface. Ceremony only for sessions that earned it — otherwise `/clear` wins and the feature dies.
3. **Cleanup proposals.** Surface scratch/half-draft files the session created and *propose* consolidation/removal — never auto-delete (look before overwriting; surface, let John decide).
4. **Resume sidecar.** Write a small bounded note (open threads, next step, pointers) to `.arete/sessions/<slug>.md`. Keep a single-deep backup on each write (`<slug>.md` → `<slug>.md.prev`) so an overwrite is recoverable (H3 — no rot). If the new note has fewer open-thread bullets than the existing one, flag it in the exit report ("thinner than prior — overwrite / merge / keep prior?"). Location: OQ1.
5. **Apply** exactly the approved set, surgically, via the same verbs/edits `/update-project` uses. Run the change-gated reindex once at the tail (only if a durable workspace write occurred). **No hollow status line (H4, revises CR-7):** write the dated `## Status Updates` line ONLY when the session produced durable content the README didn't otherwise capture — a memory-only/no-op exit writes NO line and accepts the open delta window (avoids README bloat). The exit report loudly notes the **same-day blind spot**: `whatsNew` compares at day granularity (`brief-assemblers.ts:1687`), so anything dated *today* after this exit won't surface until tomorrow.
6. **Clear the marker** via `arete project mark-clear` (CR-3).
7. **Report:** what was saved, what was linked, which commitments, where the resume note lives.

### What's genuinely new vs reused

Honest accounting (CR-2): there is no shared apply *function* — "reused" below means the same already-CI'd CLI verbs + the same prose convention, re-authored in this skill.

| Component | New / reused |
|---|---|
| CLI verbs: `refresh-topics --apply`, `commitments claim`, memory-item appends, README edits | **Reused verbs** (independently CI'd) |
| Per-item approved-surface *convention* + apply-exactly-approved discipline | **Restated prose** (not shared code) |
| Capture-sweep (conversation → on-disk artifacts) | **New** (skill prose) |
| Artifact-link proposal type | New (small generalization of meeting-link prose) |
| Resume sidecar reader helper (core) + write (exit verb) | **New** |
| Marker verbs `mark-open` / `mark-dirty` / `mark-clear` + statusline script + SessionStart hook | **New** (CLI verbs + harness wiring) |

---

## Phase 2 — `/project` with no slug lists projects

Goal: type `/project` (no arg) and pick from a list instead of checking Obsidian for the slug.

**Feasible — the enumeration already exists.** `EntityService` / `project-area.ts` (`listProjectsForBackfill`) already walk `projects/active/*` and annotate slug + area + status. Phase 2 just surfaces it.

- **Add `arete project list`** (active projects: slug, display name, area, status, last-touched date), markdown + `--json`. Thin wrapper over the existing enumeration (`listProjectsForBackfill` yields slug/name/area/status; **last-touched = README mtime** is the sort key — verified present). Build call: extend `listProjectsForBackfill` vs. a small fresh enumerator — decide at build time; either way it's read-only (counting-adapter zero-write).
- **`/project` skill, no-arg path:** run `arete project list`, present a numbered list, John picks a number or name → re-run `open <slug>`. This mirrors the existing disambiguation UX (already a "show candidates, never auto-pick" flow), so it's consistent, not a new interaction model.
- **Picker note:** Claude Code can't render a native selectable widget; the realistic "picker" is the agent printing a numbered list and John typing the choice. `AskUserQuestion` is the wrong tool here (caps at ~4 options); a numbered list scales to N projects. Sort by last-touched so the active ones are at top.
- Stretch: `/project` with a partial/fuzzy arg already disambiguates; no-arg is just "list all."

---

## Phase 3 — proactive presence (startup greeting; nudge as a fallback)

Harness facts (verified 2026-06-19, claude-code-guide): `SessionStart` hooks inject `additionalContext` and the agent **does** emit an unprompted first message from it. There is **no timer/interval hook** and **no hook fires on idle** — turn-boundary events (`Stop`) are the only approximation, and they fire right after the agent responds (i.e. when you're *not* idle).

### 3a. Startup greeting — BUILD (gated)

A `SessionStart` hook that offers to resume recent project work.

- **Gate 1: `source == "startup"` only.** Skip `clear` / `resume` / `compact` — no greeting after every clear or compaction.
- **Gate 2: once per day.** Throttle via a timestamp file (e.g. `.arete/sessions/.last-greeting`); if already greeted today, stay silent. A greeting seen 8×/day is one you stop reading.
- **Content:** read the `.arete/sessions/<slug>.md` sidecars, sort by mtime, surface the top 2–3: *"Morning, John — pick up `glance-2-mvp` or `status-letter` where you left off? (`/project <slug>`)"* The resume sidecars from Phase 1 are the data source, so **3a depends on Phase 1.**
- **Deferred for now:** the "after 8am with no daily plan → offer to run it" check. Overlaps with existing morning/winddown flows; revisit once those are mapped so this doesn't double-nudge.

### 3b. In-session reminder — metronome REJECTED; single smart nudge OPTIONAL (exploratory)

- **Metronome (reminder every 10–15 min): rejected.** No idle hook exists, so it could only fire on `Stop` (right after a response — the wrong moment), and the statusline (`▸ slug · unsaved`) already carries the same signal passively and continuously. A recurring chat injection is strictly noisier for the same information and trains tune-out.
- **Single smart nudge: optional, build only if the statusline proves insufficient.** A `Stop` hook that injects ONE gentle line, gated on: `dirty == true` AND >N minutes since open AND not already nudged this session (session-scoped flag file). At most once per session, only when there's real unsaved work. Respects the turn boundary; not a recurring reminder.

## Acceptance criteria

Labelled per phase. **[CI]** = unit/integration-provable; **[soak]** = LLM-mediated, prose-pinned + behavior-verified over the soak window (per `/update-project`'s verification-honesty ethos); **[manual]** = harness behavior (statusline/hooks) not reachable by the test runner.

### Phase 1 — `/project-exit` + statusline marker

- **P1-AC1 [CI] — marker written by `mark-open`, not `open` (CR-3).** `arete project mark-open <slug>` writes `<root>/.claude/active-project.json` = `{slug, name, opened_at, dirty:false}`. `arete project open` itself stays write-free. The disambiguation/archived shapes (the skill never reaches `mark-open` on those) leave no marker. `--json` complete on every exit path (CR-10).
- **P1-AC1b [CI] — marker root is the MAIN checkout, not the worktree (C3).** `mark-open` run from a CWD under `.claude/worktrees/<slug>/` writes to the **main-checkout** `.claude/active-project.json` (resolved via one shared main-root helper), and the main-checkout statusline reads it back. Pin to the common parent of `.claude/worktrees/`, never `git rev-parse --show-toplevel`.
- **P1-AC2 [CI] — the zero-write test must be UPDATED, and the prune SCOPED (CR-1 + M3).** As written, `snapshotTree` in `project.test.ts:231-243` walks the **entire** root incl. `.claude/`, so a marker file *would* trip `after.size === before.size` (line 271). Required: prune **exactly `active-project.json` + `.last-greeting`** (NOT all of `.claude/` — it holds worktree source trees; a blanket prune blinds the guard) before the equality assert, AND a positive assertion that `mark-open` creates the marker, AND a guard that a stray non-`.claude/` workspace write still trips `snapshotTree`. The test needs a code change.
- **P1-AC3 [CI] — marker cleared on clean exit.** `arete project mark-clear` removes the marker; `/project-exit` calls it as its last step. CLI-side so it's testable; `--json` complete.
- **P1-AC4 [soak] — capture sweep.** Exit reviews the conversation for decisions/explorations/drafts not yet on disk; work products are written to the project dir (sane name, right location); decisions/questions/commitments become proposals. **No transcript/summary doc is authored.**
- **P1-AC5 [soak] — durable proposals use update-project's surface+verbs (CR-2).** Exit presents the same per-item approved surface (status, decision→memory, open question, artifact-link, commitment claim/create, topics refresh) by re-authoring the prose and calling the same verbs; applies ONLY approved items; **rejecting everything leaves the workspace byte-identical** (the verbs' own reject-is-noop behavior). Prose-pinned that it shares the *convention*, not a shared apply fn.
- **P1-AC5b [soak] — friction budget + recall oracle (C2 + H5).** Exit gates the surface by proposal count: 0 → silent fast path (no approval prompt); 1–2 → single inline yes/no; 3+ → full per-item surface. Soak records the proposal-count distribution and exit-completed vs abandoned-to-`/clear`. The capture-sweep recall is measured against an explicit oracle (decided-items listed before seeing the sweep output, diffed), with ≥1 long multi-topic session in the window; ship gate cites a recall number, not "3 runs looked fine."
- **P1-AC6 [CI] — resume sidecar write + `.prev` backup + exclusion guard (CR-4 + H3).** Exit writes `.arete/sessions/<slug>.md` (bounded: open threads + next step + pointers), keeping a single-deep `.prev` backup so an overwrite is recoverable; if the new note is thinner (fewer open-thread bullets) than the prior, flag it in the exit report. It is *already* excluded from qmd (pruned dot-dir; no `sessions` scope in `QmdScope` — `qmd-setup.ts:408`); the unindexed assertion is a **regression guard**.
- **P1-AC7 [CI] — open surfaces resume; NO `ProjectBrief` change (CR-6).** When the sidecar exists, `arete project open <slug>` emits a top-of-brief `Resume:` block. The `resume` value goes in the **CLI's inline JSON envelope** (`project.ts:398-417`, alongside `whatsNew`), NOT on the `ProjectBrief` type. Core adds only a `readResumeSidecar(slug, paths) → string | undefined` helper; `assembleBriefForProject` is untouched. Absent sidecar → no block, no error.
- **P1-AC8 [CI] — change-gated reindex at tail.** Exit's *apply* runs `refreshQmdIndex()` once, only when a durable workspace write occurred. Zero durable writes → no index call. `--skip-qmd` + `loadConfig()` present on the apply verb (LEARNINGS:31-35); the `mark-*` verbs never index (CR-9).
- **P1-AC9 [CI] — mtime cap, with its precondition + negative case (CR-7).** *When the approved set includes a README edit*, README mtime resets and an immediate `arete project open <slug>` returns empty `whatsNew`. **Negative case:** an exit that writes only memory items / claims a commitment (no README edit) does NOT reset the window. Because `whatsNew` filters at *day* granularity (`brief-assemblers.ts:1680`), a same-day re-open shows empty regardless — so the test must distinguish a true reset from the day-granularity artifact (assert across a date boundary, or assert the README mtime moved). **No hollow status line (H4):** exit writes the dated line ONLY when the session produced durable content; memory-only/no-op exits write nothing and accept the open delta (avoids README bloat). The exit report loudly notes the same-day blind spot (anything dated today after exit won't surface until tomorrow).
- **P1-AC10 [CI] — `/update-project`'s read does NOT clobber the marker (CR-3).** Running `arete project open` (which `/update-project` calls) neither creates nor refreshes `opened_at`/`dirty`. Only `mark-open`/`mark-dirty` mutate the marker.
- **P1-AC11 [CI] — re-open overwrites, dirty resets (missing-AC).** `mark-open B` after `mark-open A` replaces the marker wholesale with B and resets `dirty:false` (no merge, no stale A).

### Phase 2 — `/project` no-arg → project list

- **P2-AC1 [CI] — `arete project list`.** Returns active projects with `{slug, name, area, status, lastTouched}`, markdown + `--json`, **sorted by lastTouched desc**. Read-only (snapshotTree byte-identical; counting-adapter zero-write). `workspace.findRoot()` guard present; `--json` complete on every exit path (incl. empty + not-in-workspace).
- **P2-AC2 [soak] — `/project` no-arg path.** With no slug, the skill runs `project list`, presents a **numbered** list, and **never auto-opens**; user picks → re-run `open <slug>`. Mirrors the existing disambiguation "show candidates, never auto-pick" UX.
- **P2-AC3 [CI] — empty/edge.** Zero active projects → friendly "no active projects" line (and `{projects: []}` in JSON), not a crash.
- **P2-AC4 [soak] — routing disjointness + confirm-before-irreversible (CR-5 + H2).** A routing sweep confirms "exit / wrap up this session" → `/project-exit`, "bring the project up to date" → `/update-project`, "complete / archive this project" → `/finalize-project` (token sets don't collide). AND deliberately-ambiguous utterances ("I'm done here," "let's close this out," "wrap up") must land on a one-line "here's what I'm about to do (vs the sibling) — confirm?" before any irreversible move (archive; marker-clear + resume-note) — never a silent action.

### Phase 3 — proactive presence

- **P3-AC1 [CI on the script] — greeting gate.** The SessionStart hook script injects a greeting **only** when `source == "startup"` AND no greeting was already emitted today (timestamp file). All other `source` values, or a same-day repeat, → empty stdout. The script's gate logic is unit-testable (feed JSON on stdin, assert stdout); the harness *firing* is **[manual]**.
- **P3-AC2 [soak] — greeting content.** Greeting reads `.arete/sessions/*.md`, surfaces the top 2–3 by mtime, offers `/project <slug>`. No sidecars present → no greeting (nothing to resume).
- **P3-AC3 [manual] — statusline render.** Marker present+clean → `▸ <slug>`; present+dirty → `▸ <slug> · unsaved`; absent → no segment. Unit-test the script end-to-end where possible (feed a marker path, assert stdout — M4); only "Claude Code actually invokes it" is truly manual.
- **P3-AC3b [CI] — dirty mtime backstop (C1).** A pure comparator (project-dir + sidecar mtimes vs `opened_at`) renders `· unsaved` when any project file changed since open, independent of the LLM `dirty` bit. CI-test it as a deterministic function; soak-test that a file written WITHOUT `mark-dirty` still shows `· unsaved` and the clear-hook emits the notice.
- **P3-AC4 [CI on the script, optional] — single nudge.** *If built:* the Stop hook injects one line only when `dirty == true` AND > N min since `opened_at` AND not already nudged this session (session flag file); at most once per session. The metronome is **not** built.

## Testing strategy

Layered by where the truth lives — the load-bearing split is **CLI/core verbs are CI-proven; skill discipline is soak-verified; harness wiring is manual.** This mirrors how `/update-project` and the chef-orchestrator phases were gated (CI on verbs, soak on the LLM-mediated prose).

- **A. Core unit** (`packages/core`, node:test): sidecar read/write helpers (overwrite semantics, bounded shape, missing-file → undefined); marker read/write/clear helpers; project enumeration for `list` (reuse/extend `listProjectsForBackfill`); `assembleBriefForProject` resume-block assembly (present/absent). Zero-write reads asserted with the **counting StorageAdapter** subclass.
- **B. CLI behavior** (`packages/cli/test/commands`, `runCli` subprocess + temp workspaces, `ARETE_SEARCH_FALLBACK=1`, `--skip-qmd`): marker written on `project open` (assert file under `.claude/`, NOT in the workspace `snapshotTree`); open's existing zero-write tests stay green (P1-AC2); `project list` output/JSON/sort/empty/not-in-workspace; resume block surfaced when sidecar present; sidecar excluded from index inputs.
- **C. Integration** (`packages/cli/test/integration`, `snapshotTree` before/after): the exit **verb path** end-to-end — seed a project + on-disk artifacts, run the exit apply with an approved set, assert (a) only approved items applied, (b) reject-set → byte-identical workspace, (c) mtime reset → empty `whatsNew` on immediate re-open (P1-AC9), (d) change-gated reindex fired once / not at all. Model on `june-fixation.integration.test.ts`.
- **D. Skill prose-pin** (skill tests): assert `/project-exit/SKILL.md` and the `/project` no-arg prose contain the load-bearing rules — capture-sweep, **invokes the same update-project verbs with apply-exactly-approved discipline (shared convention, not a shared code path — CR-2)**, **no transcript/summary doc**, exit-only `mark-clear` + sidecar-write, numbered list / never-auto-open, and triggers disjoint from finalize/update (CR-5). Mirrors `update-project`'s skill tests.
- **E. Soak** (LLM-mediated, first 3 runs — the `/update-project` MC3 pattern): capture-sweep recall (did it catch genuinely-undocumented decisions without inventing?), proposal discipline (no padding, no over-proposing), `dirty`-flip fidelity, no-transcript-dump adherence, greeting relevance. **Record proposed-vs-approved counts + anything John then hand-edits** (a hand-edit = a missed proposal, the soak's highest-value signal).
- **F. Manual / harness** (cannot be CI'd — documented checklist in the build diary): statusline segment renders clean/dirty/absent; SessionStart greeting fires once/day, startup-only, and the agent emits it unprompted; SessionStart wipes a stale marker on `clear`/`startup`; optional Stop nudge fires at most once. The hook **scripts'** internal logic is unit-tested (A/P3-AC1); only the harness firing is manual.

**Honesty line (carry into the build):** the verbs (`project list`, marker write/clear, sidecar read/write, reindex gating, mtime cap) are CI-proven; the exit skill's *judgment* (what to capture, what to propose, when to flip dirty) is prose-pinned + soak-verified, **not** CI-proven — same posture `/update-project` ships with. Don't claim CI coverage for the LLM-mediated half.

## Open questions — RESOLVED 2026-06-19

- **OQ1 — Resume sidecar location → `.arete/sessions/<slug>.md`.** Outside the project dir so it can't pollute the brief body or the mtime-delta semantics. Must be excluded from the qmd index. `arete project open` surfaces a top-of-brief "Resume:" block from it.
- **OQ2 — `dirty` flag fidelity → LLM bit + filesystem backstop (SUPERSEDED by pre-mortem C1).** Originally "ship LLM-maintained, accept the under-report risk." The pre-mortem rated silent under-report CRITICAL (it turns `/clear` into a data shredder), so the resolution now adds a cheap mtime backstop (P3-AC3b): the bit can only upgrade clean→dirty. Residual gap (verbal decision, no artifact) documented, not relied on.
- **OQ3 — `SessionEnd`-on-`/clear` auto-snapshot backstop → SKIP.** Transcript-bloat by another name; most clears aren't worth saving.
- **OQ4 — Marker write mechanism → dedicated `mark-open` verb, NOT a write inside `open` (revised per CR-3).** Originally resolved to "write inside `arete project open`," but review found that breaks `open`'s advertised `Never writes` contract AND causes `/update-project` (which calls `open`) to re-stamp the marker mid-session. Resolution: `arete project mark-open` / `mark-dirty` / `mark-clear` verbs, called by the skills at the right moments; `open` stays read-only. The zero-write test still needs the `.claude/` prune from CR-1 (P1-AC2).

## Rollback

- **Increment A** is independently revertable from B: skills (`/project-exit`, `/project` no-arg) are prose-only (`git revert`); `project list` + `mark-open`/`mark-dirty`/`mark-clear` are git-tracked CLI surfaces; `open` is left untouched.
- The `snapshotTree` scoped prune (CR-1/M3) is a test-helper change, isolated to test code.
- **Harness teardown is NOT `git revert`-able (H6).** `.claude/` is gitignored, so the statusline script + the `.claude/settings.json` SessionStart hook land in **untracked** files — `git revert` is a no-op on them. Teardown is explicit: remove the `statusLine` and `hooks.SessionStart` blocks from `.claude/settings.json` and delete the statusline script. Because the SessionStart hook actively *wipes the marker*, gate it behind a verified statusline and document this removal step in the build diary. (Increment A degrades gracefully without B: no marker read = no statusline segment, no greeting.)
- Resume sidecars (and their `.prev`) and applied README edits are ordinary files, reviewable per diff.
