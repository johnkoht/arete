## Review: Weekly Working Memory — correction-captured interpretive overrides

**Type**: Plan
**Audience**: User (end-user functionality for PMs using Areté)
**Review Path**: Full
**Complexity**: Large (7 steps, 5+ files)
**Recommended Track**: full — /ship + project orchestration

---

### Concerns

#### 1. Read-back gap: plan-context.ts is a thin shell that doesn't call assemblePlanContext via the service

The plan's core bet is that wiring `weekMemory` into `arete plan-context` (Step 3) enforces the read-back contract for all three downstream skills. This is the right architectural instinct, but the enforcement chain has a real gap.

`packages/cli/src/commands/plan-context.ts` (L75–79) calls `services.intelligence.assemblePlanContext(mode, paths, opts)`. The plan says to add `weekMemory: WeekMemoryEntry[]` to `PlanContextBundle` inside `packages/core/src/services/plan-context.ts`. That is correct and additive (no breaking change). However, both daily-plan/SKILL.md and weekly-winddown/SKILL.md do NOT currently call `arete plan-context` at all. Daily-plan calls it (Step 3: `arete plan-context --day --json`), but neither weekly-winddown nor daily-winddown invokes plan-context — they read `now/week.md` and `arete commitments list` directly. So the "read-back is enforced because skills consume plan-context" claim is:

- **True for daily-plan** (it already calls `arete plan-context --day` in Step 3).
- **False for daily-winddown** (Step 1c reads `now/week.md` directly; plan-context is never called).
- **False for weekly-winddown** (Step 1c reads `now/week.md`, `goals/quarter.md`, `now/scratchpad.md` directly; plan-context is never called).

Steps 5 and 6 ask daily-plan and daily-winddown to act on `weekMemory`, but daily-winddown doesn't consume the plan-context bundle. The plan must add an explicit read step to daily-winddown and weekly-winddown SKILL.md files, or the enforcement claim collapses to "hope the skill authors remember." That contradicts the plan's own stated enforcement strategy.

- **Suggestion**: Step 3 AC must specify which skills currently call `arete plan-context` and which require a new gather step added to their SKILL.md. Steps 5 and 6 should include an explicit "add `arete plan-context --day` (or `--week`) call to gather" if the skill doesn't already have one.

---

#### 2. Step 4 "capture during Engage 1→2" is an invented step not present in week-plan/SKILL.md

The plan asserts that during "the Engage 1→2 flow, when John's confirmation/edit meets the capture rule, the agent calls `week-memory add` silently." Reviewing the actual week-plan/SKILL.md:

- **Engage 1** (Step 3): Agent surfaces priorities, user confirms. There is no step that scans user corrections against a "re-derivable wrong?" test. The skill waits for user confirmation of suggested priorities; it does not instrument that confirmation for interpretive overrides.
- **Engage 2** (Step 5): Agent drafts the plan based on confirmed priorities. No correction-capture hook exists here either.
- **Step 6**: Writes the plan to `now/week.md` and executes approved actions.

The correction-capture hook the plan describes is entirely absent from week-plan/SKILL.md. Step 4 of the plan is not a "modification to an existing step" — it's a new behavioral layer that requires adding capture logic to Steps 3 and 5 of week-plan/SKILL.md. The plan's AC for Step 4 ("running week-plan against the 6/22 transcript captures exactly the 4 qualifying entries") cannot be verified against the current skill, because the capture logic doesn't exist yet.

The plan acknowledges this requires "writing the capture rule into a shared spec the skills reference" (Step 1), but doesn't concretely say which step in week-plan/SKILL.md gets amended with the capture hook. The executing agent will have to guess.

- **Suggestion**: Step 4 must specify the exact injection point in week-plan/SKILL.md (e.g., "After Engage 1 response handling in Step 3, add: for each correction that meets the capture rule, call `arete week-memory add`"). Without this, the step is underspecified.

---

#### 3. Separate-file + CLI-primitive is justified by retire-by-id, but the capture rule's subjectivity risk is understated

The plan correctly defends the separate-file + CLI-primitive choice: retire-by-id requires structured access that makes a pure managed-markdown approach brittle. The justification holds.

However, the capture rule — "Would a fresh daily-plan agent, reading only the vault, re-derive this wrong tomorrow?" — is precise as a test, but applying it autonomously at capture-time is still agent-judgment-dependent. The three entry types (framing-override, deprioritization, week-constraint) are good discriminators. The non-examples ("Reword priority 3") are good. The missing non-example is: a commitment re-wording where John says "let's call this 'Liability PRD' not 'liability doc'" — that's a plan-text edit that DOES live in week.md and should NOT be captured. Without a "plan-text edits that also carry factual corrections" non-example, over-capture into framing-override is the plausible drift path.

The plan does identify the end-of-plan recap (step 4) as the backstop — this is the right call. But the soak should specifically watch for "framing-overrides that are really text-preference corrections."

- **Suggestion**: Add one more explicit non-example to the capture rule spec: "John corrects terminology ('Liability PRD' not 'liability doc') without providing an interpretive override → NOT captured, lives in week.md." The "re-derivable wrong?" test alone doesn't cleanly exclude vocabulary preferences that don't change the system's inference.

---

#### 4. Step 3 service change: `assemblePlanContext` is called via `services.intelligence.assemblePlanContext` but the plan-context source is in `services/plan-context.ts`, not IntelligenceService

The plan says to "extend the frozen bundle (service-side composition, per the no-CLI-body-parsing invariant)." The no-CLI-body-parsing invariant is real and confirmed (plan-context.ts L16: "this command performs ZERO body parsing"). The correct change location is `assemblePlanContext` in `packages/core/src/services/plan-context.ts` — the `PlanContextBundle` interface and the function itself.

However, `assemblePlanContext` in plan-context.ts takes `AssemblePlanContextDeps` as its dependency injection container (L258). Adding `weekMemory` read requires a storage read of `now/week-memory.md`. The deps struct already has `storage: StorageAdapter` available (L136). Reading the file there is the right pattern.

The plan doesn't specify: does the new `WeekMemoryService` (or a free function, per the pattern for things without class-level state) get added to `AssemblePlanContextDeps`? Or does `assemblePlanContext` read the file directly via the existing `storage` dep? The CORE PROFILE says "Services never import `fs` directly — all file I/O through `StorageAdapter`." The storage dep is already present in deps. But if a `WeekMemoryService` is introduced (to back the CLI), it needs to be added to `AreteServices` via `factory.ts` and wired there.

This is also the `createServices()` async invariant: the new service must be fully constructed at factory call time, not lazily. The plan is silent on factory.ts wiring.

- **Suggestion**: Step 3 AC must explicitly state: (a) `WeekMemoryService` (or a free function) is added to `factory.ts` + `AreteServices`, (b) `AssemblePlanContextDeps` gains a `weekMemory` (or `storage`-only path) dep, (c) `packages/cli/src/commands/plan-context.ts` destructures and passes it. Without this, an executing agent will make inconsistent choices about where the service lives.

---

#### 5. Test coverage is largely absent from ACs — CLI commands and contract changes lack explicit test expectations

The plan adds:
1. A new CLI command (`arete week-memory`) with 4 subcommands
2. A contract change to `PlanContextBundle` (additive field)
3. Behavioral changes to 4 skills

The plan's ACs address behavior but not test artifacts:

- Step 2 AC: "each subcommand round-trips against a fixture workspace" — this implies tests but doesn't say where they live, what the test file is named, or whether it's unit vs integration.
- Step 3 AC: "existing plan-context consumers unaffected (additive field)" — no test expectation stated; the snapshot test for plan-context bundle shape exists but isn't referenced.
- Steps 5, 6, 7: No test expectations at all.

Per the CORE PROFILE's Pre-Edit Checklist, new services require `npm run typecheck` + `npm test`. Per the CLI LEARNINGS, test coverage spans both `packages/cli/test/commands/` and `packages/cli/test/integration/` (both must be audited for qmd-wiring). The plan has zero test ACs for the skill behavioral changes, which are the highest-risk outputs.

- **Suggestion**: Each step that modifies code should have an explicit test expectation. At minimum: Step 2 should name the test file and assert fixture round-trip at `packages/cli/test/commands/week-memory.test.ts`; Step 3 should reference the existing plan-context snapshot test and assert the additive field doesn't break it; Steps 5–7 (skill changes) should call out an integration-level scenario (not a unit test, but a stated scenario) that confirms suppression fires correctly.

---

#### 6. Steps 5–7 (skill changes) list desired behaviors without specifying SKILL.md edit points

Steps 5, 6, and 7 describe what should happen in daily-plan, daily-winddown, and weekly-winddown respectively. None of them specify:
- Which step number in the skill's workflow gets a new substep
- What the new text looks like
- Whether a new gather command (`arete week-memory list --active --json`) is added to the gather phase

For example, Step 6 says "daily-winddown marks entries `resolved` when their condition is met." But daily-winddown/SKILL.md has no step that reads `week-memory.md` or calls `arete week-memory` at all. The executing agent must figure out where to inject this into the 1000+ line SKILL.md. For a Large plan, this is too much execution-time discretion.

- **Suggestion**: Steps 5–7 should each have an "Injection point" sub-item: "Add the following after daily-winddown Step X.Y: ..." with the exact instruction text (even in abbreviated form). Without this, the SKILL.md edits will be inconsistent across executions.

---

### AC Validation Issues

| Task | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| Step 1 | "capture rule spec is written and linked from the skills that use it" | "linked from the skills" is vague — which skills, which line? | "capture rule spec is written to `packages/runtime/skills/weekly-working-memory-spec.md` (or equivalent) and referenced via a `## Capture Rule` link in week-plan, daily-plan, daily-winddown SKILL.md files" |
| Step 1 | "the 6/22 example renders cleanly as 4 entries" | "renders cleanly" has no verification criteria | "each entry has `id`, `type`, `statement`, `why`, `status: active`, `created`; all four entries are distinct types as specified" |
| Step 2 | "each subcommand round-trips against a fixture workspace" | doesn't specify what test file, no error-case coverage | "unit tests at `packages/cli/test/commands/week-memory.test.ts` cover: `add` writes entry, `list --json` returns it, `resolve` flips status to resolved without deleting, `archive` moves file and resets" |
| Step 3 | "contract change documented" | vague | "a comment in `PlanContextBundle` (or in AGENTS.md) records the `weekMemory` field, its type, and when it's populated" |
| Step 3 | "existing plan-context consumers unaffected (additive field)" | no verification method specified | "snapshot test for `arete plan-context --week --json` with no `now/week-memory.md` returns the same bundle minus the new field (or field is present as empty array)" |
| Step 4 | "re-running week-plan in-week does not duplicate entries" | "does not duplicate" has no mechanism stated | "if an entry with identical `statement` and `type` already exists, `arete week-memory add` is a no-op (or the skill checks before calling add)" |
| Step 5 | "with no entries, daily-plan behaves exactly as today" | no test specified | "daily-plan unit scenario: with `weekMemory: []` in bundle, output is byte-identical to current behavior (or verified via a named test)" |
| Step 6 | "retirements appear in the winddown curated view" | "appear in the winddown curated view" — which section? | "retired entries appear in a `## Week memory updates` or `## Notes` line in the daily-winddown curated view with the retirement reason" |

---

### Test Coverage Gaps

- **Step 2 (CLI command)**: No test file named, no error-path coverage for `archive` atomicity (what happens if the move succeeds but the reset fails?), no test for `list --json` stability under empty file.
- **Step 3 (service contract change)**: No mention of adding `weekMemory` to the existing plan-context snapshot test. The CLI LEARNINGS.md says to audit BOTH unit and integration tests for commands that touch data.
- **Step 4 (week-plan skill capture)**: "Running against the 6/22 transcript" is a manual soak scenario, not a repeatable test. No fixture or test file named.
- **Steps 5–7 (skill behavioral changes)**: Zero test expectations. The plan's own Risk section calls out "Read-back ignored despite wiring" as the core risk — but there's no proposed test that would catch suppression failing silently.
- **`factory.ts` wiring**: No mention of testing that `WeekMemoryService` (if introduced as a class) is correctly wired in `createServices()`.

---

### Strengths

1. **The capture-on-correction design principle is architecturally sound.** "Corrections are self-selecting" is an excellent framing that avoids the approval treadmill and junk-drawer failure modes John identified. This is the kind of lean-toward-simplicity thinking that the v2 direction calls for.

2. **Service-side composition via plan-context is the right enforcement architecture.** Pushing `weekMemory` into the bundle rather than asking three SKILL.md files to independently remember to call a new verb is the correct "enforce at the data layer" move. The Core PROFILE and CLI PROFILE both confirm this is the right pattern.

3. **The `suppress` field + daily-plan best-effort downgrade** (never silently drops a real deadline) is the right safety valve. Honoring the existing `@due` invariant as a floor is consistent with the Core PROFILE invariant documentation.

4. **Additive contract change** (adding `weekMemory` to `PlanContextBundle`) is correctly scoped — it won't break existing consumers. The field is already confirmed to be zero-impact on the frozen shape when absent.

5. **Lifecycle is well-defined**: scoped-to-week, retire-by-id, archive-at-weekly-winddown, fresh on next week-plan. The tight lifecycle prevents cross-week contamination.

6. **The week-plan LEARNINGS.md "Notes is sacred" invariant is correctly respected.** The plan explicitly says `week-memory.md` is a separate file and not a section inside `week.md`, which is the right call.

7. **The `arete commitments` pattern verification is real**: `packages/cli/src/commands/commitments.ts` exists and implements `list`, `resolve`, `create`, `migrate` subcommands with the same shape the plan proposes for `week-memory`. The "mirrors commitments pattern" claim is accurate.

---

### Devil's Advocate

**If this fails, it will be because...** the read-back enforcement is only half-wired. Daily-plan already calls `arete plan-context --day`, so `weekMemory` in the bundle will be available to it automatically. But daily-winddown and weekly-winddown don't call `arete plan-context` at all — they read `now/week.md` directly. The plan frames the enforcement as "skills get overrides for free," but two of the three downstream skills (daily-winddown, weekly-winddown) are not in the plan-context consumption path. The retire loop (Step 6: "daily-winddown marks entries resolved") requires daily-winddown to read `week-memory.md` somehow — and right now the only mechanism proposed is adding it to the plan-context bundle, which daily-winddown doesn't consume. So either: (a) the SKILL.md edits for daily-winddown add a direct `arete week-memory list --active --json` call (separate from plan-context), or (b) daily-winddown is changed to call `arete plan-context --day` as a new gather step. Neither is specified in the plan. The executing agent will improvise, and improvised wiring is exactly what the plan says it wants to avoid.

**The worst outcome would be...** the Lindsay-email scenario repeating, but with a false sense that it's fixed. John sees the `week-memory.md` file with the correct entry; week-plan captures it faithfully; the end-of-plan recap shows "Holding for the week: Lindsay email is proactive Wed update." Then daily-plan on Monday reads the bundle and the suppression doesn't fire because the `suppresses` field references a commitment ID that doesn't exactly match what daily-plan's scoring calls "the Lindsay email." The suppression does best-effort matching — which is correctly modest — but the failure mode is silent: no error, no log, daily-plan just re-flags it red. The overrides were captured and the read-back ran, but the suppression target resolution was too loose. This is a harder bug to diagnose than a complete miss, because the data is there but the effect isn't.

---

### Verdict

- [ ] **Approve** — Ready to proceed
- [ ] **Approve with suggestions** — Minor improvements recommended
- [x] **Approve pending pre-mortem** — Run `/pre-mortem` before `/approve`
- [ ] **Revise** — Address concerns before proceeding

**Rationale**: The core design is sound. The capture-on-correction model, the service-side enforcement via plan-context, and the lifecycle are all correct. However, this is a Large plan by definition (7 steps, Large size in frontmatter, no pre-mortem) — pre-mortem gating is required before "Approve." The enforcement gap (daily-winddown and weekly-winddown don't consume plan-context) should be addressed before execution begins, either in a plan revision or as the first clarification in the pre-mortem. The test coverage gaps and step-injection underspecification are execution risks that the pre-mortem should surface and gate.

**Required before /approve**: pre-mortem run; resolve the read-back enforcement gap for daily-winddown and weekly-winddown.

---

### Suggested Changes (Mode B)

**Change 1**: Read-back enforcement gap
- **What's wrong**: daily-winddown and weekly-winddown SKILL.md do not call `arete plan-context`. The plan claims enforcement is "free" via plan-context, but two of three downstream skills are not in that path.
- **What to do**: Add to Step 3 AC: "Specify which skills require a new `arete plan-context --day/--week` gather step vs. which already have one. Add that gather step to daily-winddown Step 1 and weekly-winddown Step 1 as an explicit plan task."
- **Where to fix**: `dev/work/plans/weekly-working-memory/plan.md` — Steps 3 and 6 (daily-winddown retire loop depends on reading week-memory).

**Change 2**: Step 4 injection point missing
- **What's wrong**: No specific step number in week-plan/SKILL.md is called out for the capture hook.
- **What to do**: Add to Step 4: "Injection point: after Step 3 user response processing in week-plan/SKILL.md, add a capture pass before writing priorities. After Step 5 Engage 2 response, add end-of-plan recap and capture pass."
- **Where to fix**: `dev/work/plans/weekly-working-memory/plan.md` — Step 4.

**Change 3**: Factory wiring
- **What's wrong**: Step 3 doesn't mention factory.ts wiring for the new service/function.
- **What to do**: Add to Step 3: "If `WeekMemoryService` is a class, add it to `factory.ts` and `AreteServices` type. If it's a free-function backed by `StorageAdapter`, add the read call directly in `assemblePlanContext` via the existing `deps.storage`. Either way, document the choice in plan Step 3 before execution."
- **Where to fix**: `dev/work/plans/weekly-working-memory/plan.md` — Step 3.

**Change 4**: Test expectations
- **What's wrong**: Steps 2, 5, 6, 7 have no test expectations.
- **What to do**: Add a per-step "Test expectation" line. Minimum: Step 2 → `packages/cli/test/commands/week-memory.test.ts` round-trip. Step 3 → snapshot test for plan-context bundle with/without week-memory.md. Step 5 → scenario: `weekMemory: [framing-override for Lindsay]` → daily-plan does NOT flag overdue.
- **Where to fix**: `dev/work/plans/weekly-working-memory/plan.md` — Steps 2, 3, 5, 6, 7.

**Change 5**: Capture rule non-example
- **What's wrong**: The capture rule needs one more non-example to block vocabulary-preference captures.
- **What to do**: Add to Step 1 capture rule spec: "Non-example: John says 'call it Liability PRD not liability doc' — text preference edit, no inference change, NOT captured. The 're-derivable wrong?' test fails: a fresh agent reading week.md sees the correct term."
- **Where to fix**: `dev/work/plans/weekly-working-memory/plan.md` — Step 1 context block.
