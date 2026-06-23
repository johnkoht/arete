# Pre-Mortem: Weekly Working Memory

Risk analysis before executing `dev/work/plans/weekly-working-memory/plan.md` (Large, 7 steps; touches packages/core, packages/cli, packages/runtime/skills). Worked against the 11 canonical categories — only the ones that genuinely apply are listed.

---

### Risk 1: `suppresses` target doesn't match the scorer's identity → silent re-flag

**Category**: State Tracking / Integration (the review's devil's-advocate risk, made concrete)

**Problem**: A `framing-override` carries a `suppresses` target, and daily-plan must match it to a scored task to suppress the red flag. daily-plan's scorer ranks off `arete commitments list --json` items keyed by commitment id (e.g. `1ceb15cc`). If `week-memory add --suppresses` stores a free-text label ("Lindsay email") instead of that exact commitment id, matching is fuzzy and fails silently — the override exists, the read fires, but the flag still shows. This is harder to debug than a total miss because the data looks correct.

**Mitigation**: `suppresses` stores the **commitment id** as the primary key (same id space daily-plan already scores from via `arete commitments list --json`), with an optional free-text fallback. At capture time in week-plan, when the corrected item maps to a known commitment, resolve and store its id — don't store the prose. daily-plan matches on id first; on free-text only as best-effort. Per step 5 AC, daily-plan emits a one-line note on BOTH apply and unmatched, so a miss is visible in the output, not silent.

**Verification**: Scenario test in step 5 with a `suppresses` = real commitment id asserts the flag is suppressed AND the note is emitted; a second case with an unmatchable target asserts the "override unmatched" note appears (proving non-silence).

---

### Risk 2: `week-memory archive` reset wipes active entries mid-week

**Category**: State Tracking (correctness / data loss)

**Problem**: Step 4 has week-plan call `archive` "for any stale prior-week file before populating the new week," and step 7 has weekly-winddown call `archive` to reset. If `archive` unconditionally moves + empties the live file, a week-plan **re-run mid-week** (the skill supports re-runs) would archive and wipe the current week's still-active overrides — exactly the corrections we're trying to preserve.

**Mitigation**: `archive` is week-stamped and idempotent: it reads the live file's ISO week, and only archives+resets when that week ≠ the current ISO week. A same-week re-run is a no-op. weekly-winddown's end-of-week call is the one legitimate archive (week is ending). Reuse the existing week/date utility for ISO-week computation (don't hand-roll; avoids timezone drift — same class as prior Areté date bugs).

**Verification**: Unit test — `archive` on a file stamped with the current week is a no-op (file untouched); on a file stamped with a prior week, it moves to `now/archive/week-plan/week-memory-YYYY-WNN.md` and resets. Test crosses a week boundary via injected date, not wall clock.

---

### Risk 3: Frozen `PlanContextBundle` change breaks existing consumers / snapshot

**Category**: Integration / Dependencies

**Problem**: `PlanContextBundle` is a frozen contract with an existing snapshot test. Adding `weekMemory` can break the snapshot or any consumer that does exhaustive shape checks. Worse, the service-location decision (read via `deps.storage` inside `assemblePlanContext` vs. a new `WeekMemoryService` wired through `factory.ts`) is left open in the plan — if two tasks pick differently, the field gets populated inconsistently.

**Mitigation**: Lock the service-location decision **before any code** (step 3 requires this): default to reading `now/week-memory.md` via the existing `deps.storage` adapter inside `assemblePlanContext` (no new service needed for the read path; the CLI in step 2 owns writes). Make the field additive — always present, defaulting to `[]` when the file is absent. Extend the existing plan-context snapshot test rather than replacing it.

**Verification**: `arete plan-context --week --json` with no `now/week-memory.md` returns `weekMemory: []` and the rest of the bundle is byte-identical to the prior snapshot. `npm run typecheck && npm test` green across the full suite, not just new tests.

---

### Risk 4: CLI primitive reimplements instead of mirroring `commitments.ts`

**Category**: Reuse / Duplication

**Problem**: `arete week-memory` (add/list/resolve/archive) overlaps heavily with the verified `arete commitments` pattern (`packages/cli/src/commands/commitments.ts` — same `list`/`resolve`/`create` shape, id generation, `--json` output, storage helpers). A fresh agent could hand-roll id generation, markdown parsing, and JSON formatting instead of reusing the established helpers — drift and bugs.

**Mitigation**: Task prompt explicitly: "Before writing, read `packages/cli/src/commands/commitments.ts` and mirror its store-helper, id-generation, and `--json` output structure. Do not invent a new id scheme or parser." All file I/O through `StorageAdapter` (Core PROFILE: services never import `fs`).

**Verification**: Diff review confirms `week-memory.ts` reuses the same storage/id helpers as `commitments.ts`; no new `fs` import; id format matches the commitments convention.

---

### Risk 5: SKILL.md injection breaks the chef-orchestrator flow

**Category**: Context Gaps

**Problem**: daily-winddown/SKILL.md is ~1127 lines with a phased chef-orchestrator flow (gather → reconcile Rules 1–5 → judgment → compose → persist). Injecting a `week-memory` gather call and a `resolve` step into the wrong phase — or mis-numbering a substep — could break reconciliation or the curated-view composition. The executing agent has limited context on these long skills.

**Mitigation**: The plan already names exact injection points (week-plan Steps 3+5, daily-plan Step 3, the winddowns' Step 1 gather + reconcile). Task prompt requires reading the surrounding steps (the full gather phase and the reconcile rules) before editing, and adding the `week-memory` read as a *new* gather substep rather than modifying existing reconcile rules. Keep retirements in a dedicated `## Week memory updates` view line — don't fold into existing sections.

**Verification**: Post-edit, re-read each amended skill's phase to confirm step numbering is consistent and existing reconcile rules are untouched; the new calls appear as additive substeps.

---

### Risk 6: runtime/skills source-of-truth + multi-IDE propagation missed

**Category**: Multi-IDE Consistency / Build Scripts

**Problem**: The SKILL.md edits live in `packages/runtime/skills/`. If installed workspaces (Cursor/Claude) consume built/copied skill assets rather than these sources directly, editing the source without running the propagation/build step means the change never reaches a real workspace — including John's own install where this gets soak-tested.

**Mitigation**: Before editing, confirm whether `packages/runtime/skills/` is the canonical source and what build/sync step propagates it (per AGENTS.md `definition_of_done`: runtime changes + `arete update` / build:agents). Run that step as part of the work and note it. The new template (`now/week-memory.md`) must also land in the onboarding template set so fresh installs get it.

**Verification**: After build/sync, confirm an installed workspace (or `arete update` dry-run) reflects the new skill text and the new template; capabilities/onboarding include `week-memory.md`.

---

### Risk 7: Skill-layer behavior has no automated test → silent regression (PoC-vs-fair-test trap)

**Category**: Test Patterns

**Problem**: Steps 4–7 are SKILL.md prose. "Replay the 6/22 transcript" is a manual soak, not a repeatable unit test. The capture rule firing correctly (4 entries, zero vocab-edits) and suppression actually changing daily-plan output are the highest-risk behaviors and have no automated guard. This is exactly the failure pattern in John's memory: a favorable one-off demo masking a production-path regression.

**Mitigation**: Be explicit that steps 2–3 (CLI + service) are unit-tested and steps 4–7 are **soak-gated, not unit-tested** — and gate the soak on the *real* path: run the amended week-plan against a live/fixture workspace and confirm exactly the 4 entries captured; run daily-plan the next day and confirm the Lindsay flag is suppressed with the note. Disclose the soak loudly in the wrap; treat a silent capture/suppression miss as a bug, not noise.

**Verification**: A written soak checklist in the wrap with observed results (entries captured, suppression note present/absent); no "looks fine" hand-wave.

---

### Risk 8: Doc/catalog surfaces forgotten

**Category**: Documentation

**Problem**: A new CLI command + a service contract change require updates beyond code: `dev/catalog/capabilities.json`, the AGENTS.md CLI command list, user-facing GUIDE.md, `packages/runtime/UPDATES.md`, and CHANGELOG. Easy to skip and fail `definition_of_done`.

**Mitigation**: Wrap checklist enumerates the surfaces: capabilities.json entry for `week-memory`; AGENTS.md `[CLI]` line; GUIDE.md (user-facing — the feature is for PMs); UPDATES.md + CHANGELOG; version bump per judgment, routed through gitboss (never silent push to main).

**Verification**: Each surface diffed in the wrap; `arete` help/catalog lists `week-memory`.

---

### Risk 9: CLI-primitive decision still open → building step 2 pre-commits the fork

**Category**: Scope Creep

**Problem**: The plan flags the CLI primitive (steps 2–3) vs. pure-markdown as an open decision for John. Starting the build commits to the primitive. If John later prefers markdown-only, steps 2, 6, 7 change materially (resolve-by-id becomes hand-edits).

**Mitigation**: Confirm the CLI-primitive decision with John **before** step 2 (it's the first build action). Recommendation stands: keep the primitive — `resolve`-by-id is what makes the retire loop reliable. If John defers, stop and re-plan steps 2/6/7 rather than improvise.

**Verification**: Explicit go/no-go on the CLI primitive captured before execution begins.

---

## Summary

Total risks identified: **9**
Categories covered: State Tracking, Integration, Dependencies, Reuse/Duplication, Context Gaps, Multi-IDE Consistency, Build Scripts, Test Patterns, Documentation, Scope Creep

Highest-stakes (design before coding, not just verify after):
- **Risk 1** — `suppresses` must key on commitment id, or suppression fails silently.
- **Risk 2** — `archive` must be week-stamped/idempotent, or a mid-week re-run destroys active overrides.
- **Risk 3** — lock the service-location decision before code; additive field + extended snapshot.

**Ready to proceed with these mitigations?**
