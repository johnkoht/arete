# Pre-Mortem: Persona Council

**Plan**: 5 steps — 2 new persona docs, 1 PM agent update, 1 Cursor rule, 1 AGENTS.md sources update + rebuild
**Date**: 2026-02-19
**Risk categories assessed**: Context Gaps, Integration, Scope Creep, Multi-IDE Consistency, Dependencies
**Categories skipped**: Test Patterns (no code), Platform Issues (straightforward file ops + known build command)

---

### Risk 1: PM Agent Prompt Bloat

**Problem**: `.pi/agents/product-manager.md` is already a dense, comprehensive prompt (~120 lines). Adding a Persona Council section without careful scoping risks: (a) making the plan-mode system prompt too long and degrading response quality, (b) creating tension with the existing "Your Responsibilities" and "Adapting to Work Type" sections that might contradict or overlap with council behavior, (c) producing a section the plan-mode extension loads but that gets ignored because it's buried.

**Mitigation**: Keep the new section tight — 10-15 lines max. Scope it as a *trigger condition with a file reference* rather than embedding the full decision table inline. The PM prompt should say "when X, invoke council, read `dev/personas/COUNCIL_INSTRUCTIONS.md`" — not reproduce the council logic. The full content lives in the persona files.

**Verification**: After editing `.pi/agents/product-manager.md`, verify the file stays under ~140 lines total and the new section doesn't duplicate content already in `COUNCIL_INSTRUCTIONS.md`.

---

### Risk 2: Cursor Rule Trigger Scope Is Wrong

**Problem**: The `.cursor/rules/persona-council.mdc` needs correct `description` and `globs` frontmatter. The persona council should fire during *discussions about user-facing features* — conversation-based, not file-edit-based. Getting this wrong means the rule either fires for everything (annoying) or never fires at all (useless).

**Mitigation**: Study the `plan-pre-mortem.mdc` glob pattern and `description` field before writing the new rule. Mirror the structure of existing rules exactly. Keep globs scoped to `dev/**/*` to match planning context. The `description` field (used for contextual matching) is likely more important than `globs` for a conversation-triggered rule.

**Verification**: Compare the new rule's frontmatter structure against `plan-pre-mortem.mdc` side-by-side before saving.

---

### Risk 3: AGENTS.md Source File Format Mismatch

**Problem**: `.agents/sources/builder/rules-index.md` uses a specific markdown table format that the build script compresses into pipe-delimited AGENTS.md. Adding a row incorrectly could silently produce malformed output or break the build.

**Mitigation**: Read `.agents/sources/builder/rules-index.md` in full before editing it. Match the exact column format of existing rule rows. Run `npm run build:agents:dev` as the final step and verify with `grep "persona-council" AGENTS.md`.

**Verification**: `grep "persona-council" AGENTS.md` returns a result after the build.

---

### Risk 4: Personas Drift to Fiction Without Evidence Discipline

**Problem**: The three archetypes are created from qualitative reasoning and one concrete example (the Slack people-mapping case), not from user research. Without the Evidence sections being populated from real signals, the council becomes confirmation bias with extra steps — "The Harvester *would* hate this" stated as fact to justify pre-decided conclusions.

**Mitigation**: (a) Add explicit language in `COUNCIL_INSTRUCTIONS.md` that empty evidence sections mean "hypothesis, not validated — treat output as directional only." (b) Add a `## Evidence Policy` note in `PERSONA_COUNCIL.md` stating that unsupported persona claims should be flagged as assumptions. (c) Keep Evidence sections prominent at the end of each persona, not buried.

**Verification**: Each persona in `PERSONA_COUNCIL.md` has a visible `## Evidence` section with a note stating "No evidence collected yet — persona is hypothesis-based."

---

### Risk 5: Council Check Becomes Rote Overhead

**Problem**: If the trigger language is too prescriptive ("*always* run a full council check before *any* user-facing feature discussion"), it becomes a checkbox. The agent produces formulaic persona reactions for every feature, wasting time and training the builder to ignore it.

**Mitigation**: Scope the trigger narrowly — fire when a feature involves *user workflow steps, input prompts, or configuration*, not every feature mention. Write the PM agent section as "offer a council check" not "always run a council check." The decision table outcome (required/optional/skip/cut policy) should be the actionable output, not the persona reactions themselves.

**Verification**: The PM agent section in `.pi/agents/product-manager.md` uses language like "offer a council check" or "when workflow steps are involved" rather than "always invoke the council."

---

## Summary

| Risk | Category | Severity | Mitigation |
|---|---|---|---|
| PM agent prompt bloat | Scope Creep | Medium | Keep new section ≤15 lines, reference-only |
| Cursor rule trigger scope wrong | Integration | Medium | Study existing rule frontmatter; scope to `dev/**/*` |
| AGENTS.md format mismatch | Integration | Low | Read source file first; verify with grep after build |
| Personas drift to fiction | Context Gaps | **High** | Empty evidence = hypothesis; flag prominently |
| Council check becomes rote | Scope Creep | **High** | Narrow trigger; "offer" not "always"; policy output is the value |

Total risks identified: 5
Categories covered: Scope Creep, Integration, Context Gaps

**Key insight**: The two highest-severity risks are content quality risks, not technical ones. Getting the wording right in the PM agent section and the evidence policy in the persona docs matters more than the structural file creation steps.
