# Review: Agent Learning Quick Wins

**Reviewer**: Senior Engineer
**Date**: 2026-02-21
**Verdict**: Conditional

---

## Completeness

**Step 1** — Rules and template definition: Clear and complete. Both `dev.mdc` and `.pi/APPEND_SYSTEM.md` are explicitly called out, which matches the capabilities catalog entry that notes these two files must stay in sync. The four rules are concrete. "What it's NOT for" guidance is well-thought-out. One gap: the AC says "`dev.mdc` and `APPEND_SYSTEM.md` contain all rules" but doesn't specify *which* rules must appear (by name or summary) — this makes the AC reviewer-dependent. Consider enumerating the 4 rules in the AC text itself so a reviewer can check off each one without re-reading the plan body.

**Step 2** — Seeding LEARNINGS.md: Strong. Source material is enumerated per component, the builder review gate is explicit, and the AC requires specific past incidents (not generic advice). The table of 6 components with source files is the right approach — it forces the developer to read before writing.

**Step 3** — Pi extension: Feasible and well-scoped, but underspecified in one important way (see Feasibility). The AC is verifiable but says "system prompt includes collaboration.md content" — this needs to be verified mechanically, not just by trust. The AC should specify the verification method: "Inspect the `--debug` output of a new pi session, or check that `pi.getCurrentSystemPrompt()` contains the `## Builder Collaboration Profile` header."

**Step 4** — AGENTS.md and execute-prd updates: Correct. `.pi/skills/` is a symlink to `.agents/skills/`, so updating `.agents/skills/execute-prd/SKILL.md` updates both. No dual-update issue. The `npm run build:agents:dev` gate is the right verification.

**Step 5** — Verification: The four checks are the right ones. One issue: "Simulate a regression fix → confirm agent adds entry to nearest LEARNINGS.md" is non-deterministic and hard to verify in a single test. Consider replacing or augmenting this with a simpler check: "Confirm the LEARNINGS.md rule appears in `dev.mdc` and `APPEND_SYSTEM.md` (by grep), and that a new pi session's system prompt contains the rule text."

**Missing AC across all steps**: No step specifies updating `dev/catalog/capabilities.json` after creating the new `agent-memory` extension. This is required by both `dev.mdc` and `conventions.md` (Capability Registry Check, §7): *"Before changing developer tooling or platform behavior (extensions)... Update the capability entry if behavior, paths, status, or ownership changed."* Adding a new extension is exactly this scenario. Add to Step 3 AC: "Update `dev/catalog/capabilities.json` with a new entry for `pi-agent-memory-extension`."

---

## Feasibility

**Steps 1, 2, 4** — Documentation work. Straightforward, low risk.

**Step 3 — Extension implementation**: Feasible, but the plan conflates two different return types from `before_agent_start`. The plan says the extension:
- On `session_start`: reads `memory/collaboration.md` and stores it
- On `before_agent_start`: injects content into the system prompt

The pi extension API supports this correctly — `before_agent_start` can return `{ systemPrompt: event.systemPrompt + "\n\n## Builder Collaboration Profile\n..." }` to modify the system prompt for that turn. This is distinct from returning `{ message: { ... } }` which injects a *context message* (not a true system prompt modification). The plan-mode extension uses the `message` pattern; the agent-memory extension should use the `systemPrompt` pattern, since the collaboration profile should be invisible to the conversation history (it's a background instruction, not a user-visible message). The plan body says "system prompt" correctly but a developer reading only Step 3 might copy the plan-mode pattern and use `message` instead. The implementation guidance should be explicit: use `return { systemPrompt: event.systemPrompt + "\n\n## Builder Collaboration Profile\n..." + collabContent }`.

**Path resolution**: The extension will need to read `memory/collaboration.md` relative to the workspace root. Using `path.join(process.cwd(), 'memory/collaboration.md')` is the correct approach — pi runs from workspace root. This should be noted in Step 3's implementation guidance.

**Step 5 — Verification**: Starting a new pi session to verify injection is easy. The harder check is verifying the rule is followed (agent reads LEARNINGS.md before editing). There's no automated mechanism for this — it's behavioral observation. This is acceptable for a "quick wins" plan; just be honest that behavioral adoption verification is observational.

---

## Risk Coverage

The five risks in the plan are the right ones. Two are underweighted:

**Risk 2 (Agents ignore LEARNINGS.md)**: The plan acknowledges this and points to the orchestrator explicitly including LEARNINGS.md in subagent prompts as the mitigation. This is correct and the most important enforcement path. But the plan doesn't note that this enforcement only applies to PRD execution via execute-prd. For direct execution (small/tiny tasks, which skip the execute-prd skill), the rule is still voluntary compliance. This is an acceptable limitation for a "quick wins" plan but should be stated explicitly so expectations are calibrated correctly.

**Risk 3 (Pi extension breaks something)**: The plan says "read-only." This is accurate — the extension only reads a file and injects text. But it fires on `before_agent_start`, which runs *every turn*, not just the first turn of a session. If `memory/collaboration.md` grows large or the injection causes system prompt token overhead, this accumulates. At 91 lines today, collaboration.md is fine. Worth noting as a future scaling consideration.

**Unaddressed risk — `dev.mdc` / `APPEND_SYSTEM.md` sync drift**: The capabilities catalog explicitly notes: *"Potential drift risk between .cursor/rules/* and .pi/APPEND_SYSTEM.md. Keep both in sync when rules/workflows change."* Adding LEARNINGS.md rules to both files increases this surface by 4 more rules that must be kept synchronized. The plan should acknowledge this as an accepted trade-off and note that future rule changes must update both files.

---

## LEARNINGS.md Template Assessment

The 7-section structure is well-designed. The sequence is correct: orientation first ("How This Works"), then references, then gotchas/invariants (the regression-prevention core), then testing gaps, patterns, checklist. This is the right read order for an agent approaching a module it hasn't touched before.

**Strongest sections**: "How This Works" (5-10 lines — tight constraint is good; prevents sprawl) and "Pre-Edit Checklist" (directly addresses the regression problem by providing specific verification steps).

**Weakest sections for initial seeding**: "Patterns That Work" and "Testing Gaps" may be thin in files that have had regressions but not yet developed strong patterns. Both risk being generic ("write tests," "use the factory pattern") rather than specific. Mitigation: treat these sections as optional stubs initially — fill them when patterns actually emerge from incidents. The plan's "what it's NOT for" guidance handles this implicitly by limiting scope.

**One structural note**: The plan doesn't specify a length limit for the overall file, only for "How This Works" (5-10 lines). A LEARNINGS.md that grows to 200+ lines across 7 sections becomes an orientation document, not a quick-read before editing. Consider adding a soft limit: "Each section should be 3-10 lines initially; add detail only when an incident demonstrates the need."

---

## Adoption Likelihood

**Auto-injection of collaboration.md**: High confidence this works. Zero voluntary compliance required — the extension fires unconditionally. This is the plan's strongest mechanism and is worth doing even if nothing else lands.

**LEARNINGS.md for PRD execution**: Medium-high confidence. The execute-prd skill update is the right enforcement path — when the orchestrator explicitly includes "Read LEARNINGS.md in the working directory" in every subagent task prompt, adoption within PRD execution is automatic. The 6-file seed means there's content waiting when agents look for it.

**LEARNINGS.md for direct execution**: Lower confidence. The rule in dev.mdc works for conscientious agents but provides no mechanical enforcement. This is the known gap the plan explicitly accepts. Don't over-optimize for this — the PRD path coverage is the 80% case.

**Long-term maintenance of LEARNINGS.md files**: The "update after regression" rule is the right one. The organic-growth model (start with 6 files; create new ones only after real pain) is correct. The risk is the files becoming stale after refactors change the architecture they describe. The "How This Works" 5-10 line limit reduces maintenance burden significantly — harder to become stale when you're describing 5-10 key facts rather than a full architecture doc.

---

## Scope Assessment

Right-sized. The plan correctly excludes:
- Memory entry system changes (good — separate concern)
- qmd indexing for LEARNINGS.md (good — future enhancement)
- Full component documentation (good — scope creep risk)
- Session exit auto-summarization (good — memory refactor territory)

One item to reconsider adding (tiny, low-risk): after completing the plan, create a memory entry documenting the new LEARNINGS.md convention and the agent-memory extension. This follows dev.mdc's guidance ("after work that modifies 3+ files, creates new patterns") and gives future agents a memory anchor when they encounter a LEARNINGS.md for the first time. Not blocking — add as an informal note to Step 5 if the developer has headroom.

---

## Recommendations

**Must resolve before starting (2 items)**:

1. **Add capabilities.json update to Step 3 AC**: Step 3 creates a new pi extension. Per dev.mdc §7 (Capability Registry Check), `dev/catalog/capabilities.json` must be updated. Add to Step 3 AC: "Update `dev/catalog/capabilities.json` with a new `pi-agent-memory-extension` entry (type: extension, provenance: customized, implementationPaths: [`.pi/extensions/agent-memory/index.ts`], platform: pi)." Without this, the catalog drifts immediately on the first use of the new extension.

2. **Clarify Step 3 injection mechanism**: Add explicit implementation note to Step 3: "Use `return { systemPrompt: event.systemPrompt + '\n\n## Builder Collaboration Profile\n' + collabContent }` from `before_agent_start`, NOT `return { message: { ... } }`. System prompt modification keeps the profile invisible in conversation history; message injection makes it visible as a turn in the thread." This prevents a developer from copying the plan-mode pattern and getting the wrong behavior.

**Should address (2 items)**:

3. **Soft length limit for LEARNINGS.md sections**: Add to Step 1 template definition: "Each section should be 3-10 lines initially. Grow sections only after incidents demonstrate the need. If a file exceeds ~100 lines across all sections, it has become documentation rather than a quick-read checklist — split or trim."

4. **Explicitly acknowledge the sync drift trade-off**: In Step 1 (or the Risk section), note: "Adding 4 rules to both `dev.mdc` and `APPEND_SYSTEM.md` increases the sync surface flagged in the capabilities catalog. This is an accepted trade-off for the quick-wins plan. Future rule changes must update both files. If the pattern of identical rules in both locations grows beyond ~10 rules, consider a single-source approach (e.g., `dev.mdc` includes APPEND_SYSTEM.md or vice versa)."

**Nice to have (1 item)**:

5. **Memory entry as informal close-out step**: Note in Step 5 that after all checks pass, the developer should create `memory/entries/YYYY-MM-DD_agent-learning-quick-wins-learnings.md` summarizing the new conventions and any surprises encountered during seeding.
