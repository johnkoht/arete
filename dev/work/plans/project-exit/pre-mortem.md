# Pre-Mortem: /project-exit

Run 2026-06-20 as Phase 1.2 of the ship workflow, against `plan.md`. Three independent adversarial agents (adoption/UX, correctness/data-integrity, process/sequencing/scope), each assuming the feature shipped and failed. Findings deduped below; claims were verified against the real codebase where cited.

**Gate verdict: PAUSE — 3 CRITICAL risks.** Two of them (C1 dirty-flag, C3 worktree-root) are the kind that make the feature *look* shipped — green CI, passing soak — while being silently broken or unused for John, the only user. Recommend folding the cheap mitigations into `plan.md` before resuming the ship.

---

## CRITICAL

### Risk: C1 — The `dirty` flag silently under-reports, turning `/clear` into a data shredder
**Severity**: CRITICAL (flagged independently by both the UX and the correctness agents — strongest signal in this pre-mortem)
**Problem**: The entire anti-loss UX rests on the statusline `· unsaved` marker as the "passive substitute" for the impossible pre-clear prompt (design principle; P3-AC3). But `dirty` is LLM-maintained (OQ2; flow line 71) and the failure is *asymmetric and silent*: John's highest-value sessions are exploratory — he decides something verbally, the agent never writes a file, never flips `dirty`, statusline shows clean `▸ slug`, John trusts the green light and `/clear`s, SessionStart wipes the marker, the in-flight thinking is gone with zero warning. The plan's own after-the-fact notice only fires `if (wiped marker was dirty)` — so a false-clean produces *neither* a warning *nor* a notice. This is exactly the [[feedback_poc_vs_fair_test]] shape: a favorable signal that silently regresses. A status signal that is wrong *in the direction that costs you* is worse than no signal — the Phase 1a/3 premise collapses.
**Mitigation**: Break the loss-bearing path's dependence on the LLM bit. Add the cheap filesystem backstop the plan rejected as "too heavy" (line 71) without testing the cheap version: the statusline script AND the SessionStart-on-clear hook `stat()` the project dir + `.arete/sessions/<slug>.md` mtimes vs the marker's `opened_at`; if any file changed since open, treat as dirty. The bit can only ever *upgrade* clean→dirty, never the reverse. It's a stat-per-file on render, not a diff engine. Explicitly document the residual gap (verbal decision, zero artifact) as a known limit John must not rely on the marker for.
**Verification**: CI-test the mtime-vs-`opened_at` comparator as a pure function (filesystem-deterministic). Add P3-AC3b: write a file to a project dir WITHOUT calling `mark-dirty`, assert the statusline still renders `· unsaved` and the clear-hook emits the notice. Soak: log every "clean" exit/clear followed by a hand-edit or lost decision; one confirmed false-clean that cost data fails the gate.

### Risk: C2 — The exit flow has more friction than `/clear`, so John never pays the toll
**Severity**: CRITICAL
**Problem**: `/project-exit` is a 7-step flow handing John a multi-item approval surface (P1-AC5) plus a separate cleanup round (step 3) plus a sidecar to eyeball. `/update-project` already names this death mode: "proposes so much that approving is slower than hand-editing — kills the flow" (update-project SKILL.md:72). Exit is *strictly more* surface (it sweeps the whole conversation, not just `whatsNew`). The competing action — `/clear` — is one keystroke, zero approvals. For a tool used many times a day, a multi-proposal ceremony at every boundary loses to `/clear` on every session that wasn't "big," which is most of them. The plan sets no proposal ceiling and no fast path. Directly against [[feedback_cli_review_surface]] and [[project_arete_v2_direction]] ("winddown bloat is the antagonist").
**Mitigation**: Add a hard friction budget to the skill prose + AC: **0 durable proposals → silent fast path** (mark-clear + sidecar + status line, report in one line, NO approval prompt); **1–2 items → single inline yes/no**; **3+ → the full per-item surface**. Reserve ceremony for sessions that earned it.
**Verification**: Prose-pin (test D) asserts the 0 / 1–2 / 3+ tiering. Add P1-AC5b [soak]: record the proposal-count distribution and exit-completed vs abandoned-to-`/clear`; median proposal count >3, or an abandonment rate that doesn't beat the `/clear` baseline, fails.

### Risk: C3 — The marker writes to the wrong root inside a worktree → feature silently dead for John
**Severity**: CRITICAL (new — surfaced by the process agent, verified against repo layout)
**Problem**: This repo keeps worktrees *inside* `.claude/` (confirmed: `.claude/worktrees/<slug>/`). The marker is written to `<workspace-root>/.claude/active-project.json` via `workspace.findRoot()`. The build — and much of John's daily work — runs from a worktree. `mark-open` run from a worktree resolves *its own* root and writes to `…/.claude/worktrees/<slug>/.claude/active-project.json`, while the statusline/SessionStart hook configured in the *main* checkout reads `…/arete/.claude/active-project.json`. Writer and reader resolve different roots → statusline shows nothing, greeting never sees a sidecar. The feature passes its [CI] verb tests (isolated temp dirs) and its [manual] check might happen to run in the main checkout — so it looks shipped and is silently dead exactly where John lives.
**Mitigation**: Pin the marker/sidecar root to the **main checkout root** (the common parent — NOT `git rev-parse --show-toplevel`, which returns the worktree) via one shared helper used by all three `mark-*` verbs + the statusline script + the SessionStart hook. Add an AC: a marker written from within `.claude/worktrees/<slug>/` must land at the main root, read back by the main-checkout statusline.
**Verification**: From a real worktree CWD, run `arete project mark-open bar`, then run the statusline script from the main checkout and assert it prints `▸ bar`. (Fails today.)

---

## HIGH

### Risk: H1 — Startup greeting fed by sparse/stale exit-written sidecars recommends the wrong project
**Severity**: HIGH
**Problem**: The greeting (3a, P3-AC2) sorts `.arete/sessions/*.md` by mtime and offers the top 2–3 — but sidecars are only written on a *clean* `/project-exit`, and C1/C2 establish John mostly `/clear`s. So sidecars are sparse and go stale: the greeting confidently says "pick up `glance-2-mvp`?" weeks after he moved on. A daily, unprompted first message that's wrong more than right gets reflexively dismissed — the once-a-day gate limits frequency, not wrongness.
**Mitigation**: Cross-reference sidecars against *actual recent project-dir activity* (the same README-mtime enumeration `project list` uses, Phase 2); surface a resume candidate only if it has both a sidecar AND recent activity, sorted by activity. No recently-active candidate → stay silent. Add one-tap dismissal that suppresses until the project's mtime changes.
**Verification**: Extend P3-AC2: feed a sidecar whose project dir is untouched for N days, assert no greeting. Soak: log every greeting + whether John acted; <50% actioned over the window → off by default.

### Risk: H2 — Three confusable "wrap up" commands; firing the wrong one archives a live project
**Severity**: HIGH
**Problem**: `/project-exit`, `/update-project`, `/finalize-project` share a "done/wrap up" intent surface. The plan's CR-5 mitigation only checks trigger-token *non-collision* (P2-AC4) — but the real failure is John's mental model: "I'm done with this for now" (exit), "bring it up to date" (update), "I'm done with this" (finalize) are near-indistinguishable, and consequences diverge sharply (finalize *archives the project*; exit writes a "we're done" resume note the plan says must NOT happen mid-flight). One wrong fire that archives a live project teaches him to avoid the whole family.
**Mitigation**: Make the routing AC two-directional: not just "tokens don't collide" but "ambiguous intent → confirm before any irreversible move." Require `/project-exit` and `/finalize-project` to state in one line what they're about to do + how it differs from the sibling, and confirm before the irreversible step (archive; marker-clear + resume-note).
**Verification**: P2-AC4 includes a deliberately-ambiguous utterance set ("I'm done here," "let's close this out," "wrap up"), each asserted to land on a confirmation. Soak: any run-then-immediately-undo, especially a wrong archive, fails the gate.

### Risk: H3 — Resume sidecar overwrite destroys an unconsumed, richer prior note
**Severity**: HIGH
**Problem**: The sidecar is overwrite-only ("never appended → no rot", P1-AC6). But overwrite-only *unconditionally clobbers* the prior note. Loss sequence: Monday you exit with a rich 3-thread resume note; Tuesday you open, get pulled into a 5-min tangent, `/project-exit` to tidy up — the sweep runs on a near-empty session and writes a thin note, permanently overwriting Monday's. Worse, the greeting (H1) then surfaces the *degraded* note as freshest.
**Mitigation**: Non-destructive-on-thin: keep one single-deep backup (`<slug>.md` → `<slug>.md.prev` on each write — no rot, recoverable). If the new note has fewer open-thread bullets than the existing one, flag in the exit report ("thinner than prior — overwrite / merge / keep prior?").
**Verification**: Integration test: write a 5-bullet sidecar, run an exit that produces a 1-bullet note, assert the 5-bullet content is recoverable (`.prev`) and the report flagged the shrinkage.

### Risk: H4 — The default dated status line injects bloat AND masks a same-day whatsNew blind spot
**Severity**: HIGH
**Problem**: To "close the boundary honestly" (CR-7), every exit defaults to writing a dated `## Status Updates` line even on memory-only sessions (flow step 5; P1-AC9). Two costs: (1) **Bloat** — over months, Status Updates accumulates a line per *session* not per *substantive change* (the very thing design-principle #1 warns against, mechanized into the README). (2) **False reset** — `whatsNew` compares at *day* granularity (`brief-assemblers.ts:1687`); the status line resets mtime to today, so anything dated today-but-not-yet-reconciled (a 4pm meeting after a 2pm exit) silently drops from a same-day re-open's `whatsNew`.
**Mitigation**: Only auto-write the status line when the session actually produced durable content the README didn't otherwise capture; memory-only/no-op exits write NO hollow line (accept the open delta — the plan already calls this acceptable). Loudly document the same-day post-exit blind spot in the exit report (can't be fixed without sub-day granularity in `assembleProjectWhatsNew`).
**Verification**: Integration test across a date boundary: seed a meeting dated the same day as the status-line write, re-open same-day, assert it's surfaced or explicitly flagged-hidden — not silently absent. Prose-pin: memory-only exits emit no hollow status line.

### Risk: H5 — Soak too small/cooperative to catch capture-sweep omissions (silent recall failure)
**Severity**: HIGH
**Problem**: The capture sweep (P1-AC4) — the one thing deciding what in-flight thinking survives `/clear` — is `[soak]` only, "first 3 runs." An omission is *silent*: a soak run has no oracle for what *should* have been captured. The plan's signal ("anything John hand-edits = a missed proposal") only catches misses John notices; a dropped decision he doesn't re-derive is lost and uncounted — the [[feedback_poc_vs_fair_test]] pattern again. Three runs on John's own cooperative, well-structured sessions is a favorable benchmark, not a fair test of the adversarial case (long, messy, multi-topic).
**Mitigation**: Build an explicit recall oracle into the soak: John (or a second agent pass) lists what the session decided/explored *before* seeing the sweep output, then diff vs captured set — measure recall directly, record false-negatives. Require ≥1 long multi-topic session. Gate ship on a stated recall bar, not "3 runs looked fine."
**Verification**: Soak log shows decided-items vs captured-items diff per run with a miss count; ≥1 long/multi-topic session included; ship gate cites the recall number.

### Risk: H6 — The rollback claim is false: harness config lands in gitignored, untracked files
**Severity**: HIGH
**Problem**: Rollback says "statusline script + SessionStart hook are settings/script changes — revertable independently." But there's no `.claude/settings.json` today and **`.claude/` is entirely gitignored**. The wiring lands in untracked files; `git revert` is a no-op. If the SessionStart hook (which wipes the marker every startup/clear) misbehaves, the documented rollback does nothing — John hand-edits untracked config he may not remember creating. The 7-step order also ships the only genuinely-irreversible, marker-wiping harness change *last and least-tested* (`[manual]`).
**Mitigation**: Decide where harness config lives before building; if it's gitignored, state honestly that it's not git-revertable and add an explicit "Harness teardown" subsection with literal removal steps (or track settings under a non-ignored path). Reorder so the marker-wiping hook is gated behind a verified statusline.
**Verification**: Dry-run the rollback: apply the build, execute exactly the Rollback steps, confirm the statusline segment + greeting are gone. If any step needs hand-editing an untracked file, rewrite the rollback claim.

### Risk: H7 — Pi-native ship workflow stalls in Claude Code or commits planning artifacts to main
**Severity**: HIGH
**Problem**: `.pi/skills/ship/SKILL.md` dispatches `subagent({agent:"orchestrator"})` / `@gitboss`, runs `/worktree create`, loads `execute-prd` — none exist as Claude Code primitives here. Followed literally for a `size: large` plan, Phase 3.1 and the 4.2/5.6 dispatches no-op or error, and the build may fall back to the main repo (the Worktree Guard only checks `git-dir == ".git"`). Phase 2.3 also commits planning artifacts **to main** before any worktree exists — contaminating the protected branch, and for this plan leaving main carrying a PRD for a feature maybe never built.
**Mitigation**: Translate the workflow to this environment before building: replace `/worktree create` with EnterWorktree/ExitWorktree, drop or map the orchestrator/gitboss dispatches to in-session review, and decide where planning artifacts get committed (worktree or planning branch, NOT main). Add a hard pre-flight asserting the session is under `.claude/worktrees/` before any code write.
**Verification**: Confirm the build runs from `.claude/worktrees/project-exit/` (not the main checkout with a `.git` dir) before step 1; confirm `git log main` shows no project-exit planning commits unless that's the deliberate, approved choice.

### Risk: H8 — Collision with the planned pi→Claude-Code skills port (orphaned verbs / double hook)
**Severity**: HIGH
**Problem**: A separate, not-yet-written plan will port pi skills into Claude Code commands/skills — directly in this feature's blast radius. Three months out the port may (a) regenerate `/project-exit` from pi source and clobber the hand-built one, (b) add its own SessionStart hook that stomps the marker-wipe / double-greets, or (c) leave `mark-open`/`mark-dirty`/`mark-clear` orphaned because the ported prose doesn't know to call them. The marker is the shared contract across verbs + statusline + hook, now plus a fourth uncoordinated workstream.
**Mitigation**: Add a "Port coordination" note registering the marker schema (`.claude/active-project.json`), the three `mark-*` verbs, and the SessionStart hook contract as the *canonical interface the port must consume, not regenerate*. Land the marker/verb/sidecar layer (steps 1–2, pure CLI) first; treat skill + hook (steps 3,5,6) as "owned by the port if it ships." Exactly one SessionStart hook owner.
**Verification**: When the port plan is written, grep it for `active-project.json`, `mark-open`, `SessionStart`, `/project-exit`; confirm it references rather than redefines. Assert exactly one SessionStart hook entry after both ship.

---

## MEDIUM

### Risk: M1 — The optional Stop nudge reintroduces the fatigue the plan rejected, on an unreliable signal
**Severity**: MEDIUM
**Problem**: 3b's "build only if the statusline proves insufficient" will plausibly fire (because C1 makes the statusline insufficient *by signal unreliability*, not under-build), and the only hook (`Stop`) fires right after the agent responds — the wrong moment — driven by the same broken `dirty` bit. The metronome correctly rejected, smuggled back under a one-shot cap.
**Mitigation**: Do NOT build 3b unless C1's reliability fix shipped AND soak still shows John missing unsaved work. If built, gate on elapsed-since-last-*write* (not since-open) so it fires on genuine session-end shape; make it trivially silenceable.
**Verification**: Build-diary decision recorded that C1 fix shipped + soak still showed misses before 3b starts. If built, P3-AC4 asserts the elapsed-since-last-write gate + once-per-session flag.

### Risk: M2 — The whole feature is ceremony John never feels the need for
**Severity**: MEDIUM
**Problem**: [[project_knowledge_accrual]] (verified 2026-06-16) already establishes `/project` open *pulls today's approved info*, and `whatsNew` already answers "what changed." The genuinely-new value is the resume sidecar + the marker — both shown fragile above. If the sidecar is reconstructable from the README in 10 seconds and the marker can't be trusted, exit is a ritual producing marginal artifacts; John (builder AND only user) quietly stops running it.
**Mitigation**: Before building, write the single concrete moment this must win (e.g. "Monday open of `glance-2-mvp`, the resume note saves the 5-min re-orient"). Define one adoption metric — exit-completed vs `/clear` ratio over the soak — with a kill threshold (e.g. <30% after 2 weeks → cut Phase 3, keep only the marker). Ship Phase 1 marker + sidecar first; instrument whether John reads the resume block on next open before building 2/3.
**Verification**: The "moment it must win" + the exit-vs-clear kill threshold are written in the plan before build. Soak records the ratio + resume-block reads; below threshold triggers the documented scope cut, not doubling down.

### Risk: M3 — Blanket `.claude/` prune blinds the zero-write guard; no clean MVP cut line
**Severity**: MEDIUM
**Problem**: (1) P1-AC2 prunes `.claude/` from `snapshotTree` so the marker doesn't trip zero-write asserts — but `.claude/` holds entire worktree source trees, so a blanket prune blinds the helper to a huge surface; a future stray write under `.claude/` passes silently. (2) Dependencies cross phase boundaries (statusline needs the marker; greeting needs the sidecar; the default status line couples exit-apply to the whatsNew day-granularity quirk), so there's no clean MVP where Phase 1 ships and 2/3 are truly optional.
**Mitigation**: Scope the prune to exactly `active-project.json` (+ `.last-greeting`), not the whole dir; assert the prune still catches a stray workspace write. Define an explicit MVP cut: steps 1–3 (marker verbs + sidecar + exit skill) as the shippable unit; statusline (5) + SessionStart (6) a separate increment that can ship/revert independently.
**Verification**: Test that a junk file written under the workspace (not `.claude/`) during a "read-only" op still fails `snapshotTree`. Confirm `/project-exit` works end-to-end with statusline/hook NOT yet built (graceful absence) — proving the cut line is real.

### Risk: M4 — `[manual]`-only ACs are verified once, on the wrong environment
**Severity**: MEDIUM
**Problem**: P3-AC3 (statusline render) + the harness-firing half of P3-AC1 are `[manual]` — checked by hand once, in whatever ad-hoc env the builder is in. Combined with C3 (worktree path) and H6 (untracked config), that one check likely runs where the marker path is broken or in a non-representative checkout, and rots with zero CI signal.
**Mitigation**: Convert most of the manual surface to a scripted check: the statusline script takes a marker path and prints a string — unit-test it end-to-end (feed a marker file, assert stdout), leaving only "Claude Code actually invokes it" as truly manual. Write Testing-strategy F as a literal copy-pasteable command sequence run from BOTH a worktree and the main checkout, recording the env.
**Verification**: Unit test feeds a temp `active-project.json` to the statusline script, asserts `▸ slug` / `▸ slug · unsaved` / empty. Build diary's manual section shows exact commands + CWD.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 3 (C1 dirty-flag silent loss, C2 exit friction > /clear, C3 worktree-root mismatch) |
| HIGH | 8 |
| MEDIUM | 4 |

Categories covered: Success Metrics, Stakeholder Alignment, Scope Boundaries, Decision Quality, Progress/State Tracking, Cross-system Dependencies, External Dependencies (port + harness).

**The unifying pattern (flag hardest):** every loss-bearing path rests on an LLM-maintained bit (`dirty`, capture recall) verified only by a small cooperative soak — the same favorable-benchmark-then-silent-regression shape John got burned by once ([[feedback_poc_vs_fair_test]]). The cheapest high-leverage fixes are all filesystem-deterministic: the mtime backstop for `dirty` (C1), the friction fast-path (C2), pinning the marker root to the main checkout (C3), scoping the snapshotTree prune (M3).

**Ship-gate recommendation:** PAUSE. Fold the C1/C2/C3 + H3/H4/H6/H7/H8 mitigations into `plan.md` (most are cheap and several tighten existing ACs), then resume the ship from Phase 1.3.
