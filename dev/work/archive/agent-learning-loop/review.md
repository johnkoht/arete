## Review: Agent Learning Loop — Planner Identity, Patterns Guide, Maintenance Protocol

**Type**: Plan (pre-execution)
**Audience**: Builder (internal agent infrastructure for developing Areté)

---

### Concerns

1. **Scope / Size Mislabel**: The plan says "small" but has **5 steps** touching **8+ files** (AGENTS.md, APPEND_SYSTEM.md or new maintenance.md, build-standards.md, patterns.md, developer.md, reviewer.md, orchestrator.md, execute-prd SKILL.md, plus both expertise profiles). That's a **medium** plan by the project's own definition (3-5 steps = medium). This matters because medium plans recommend pre-mortem and the execution path decision tree recommends the PRD path.
   - **Suggestion**: Relabel as medium. Given it's all documentation (no runtime code, no tests needed), the risk is low enough to skip PRD, but the size label should be honest.

2. **Completeness — APPEND_SYSTEM.md Size Check**: Step 3 says "add to APPEND_SYSTEM.md or create maintenance.md if it pushes past 120 lines." APPEND_SYSTEM.md is currently **~80 lines**. The maintenance protocol (two modes, three roles, key principle) is easily 40-60 lines. That puts it right at the boundary. The plan should **decide now** rather than leave it to the implementer.
   - **Suggestion**: Given the amount of content, create `.pi/standards/maintenance.md` as a standalone file and add a one-line reference from APPEND_SYSTEM.md (matching the existing pattern of `APPEND_SYSTEM.md → build-standards.md` reference). This keeps APPEND_SYSTEM.md lean — it's a routing doc, not a dump.

3. **Dependencies — Step 3 and Step 4 Overlap**: The maintenance protocol (Step 3) defines what each role should do. Step 4 then updates the role files with those same responsibilities. There's a risk of **saying the same thing in two places** — maintenance.md defines the protocol AND developer.md/reviewer.md/orchestrator.md repeat it in their sections. This creates a maintenance burden (update one, forget the other).
   - **Suggestion**: maintenance.md should be the **source of truth** for the protocol. Role files should reference it with a brief summary: "See `.pi/standards/maintenance.md` for the full learning protocol. Key responsibility for this role: [1-2 sentences]." This is the same pattern the role files already use for build-standards.md — they reference it rather than duplicating it.

4. **Patterns — Accuracy Risk**: Step 2 lists 9 architectural patterns extracted from profiles and code. Some claims need verification against current code:
   - "services are stateless" — is this universally true? Services hold `workspaceRoot` and a `storage` reference.
   - "Legacy function-based APIs delegate to service classes" — the compat layer may have evolved since the profiles were written.
   - "Config Resolution: workspace arete.yaml > global ~/.arete/config.yaml > defaults" — need to verify this cascade actually exists in code.
   - **Suggestion**: Before writing patterns.md, verify each pattern claim against the actual code. The patterns doc only has value if it's accurate. A wrong patterns doc is worse than no patterns doc — agents will confidently follow incorrect guidance.

5. **Completeness — Missing AC**: The plan describes what to create but has no acceptance criteria. How do we know each step is "done"?
   - **Suggestion**: Add lightweight AC per step. For documentation-only work, something like: "Step 2 AC: patterns.md exists, build-standards.md references it, both expertise profiles reference it, and each pattern is verified against current code with a file path example."

6. **Backward Compatibility — Role File Changes**: Steps 4 and 5 modify files that are actively consumed by the execute-prd skill during PRD execution. If the wording is imprecise, it could cause agents to waste time on documentation tasks during simple PRDs where no documentation improvements are needed.
   - **Suggestion**: The "detailed mode" trigger should be explicit and mechanical, not subjective. E.g., "Detailed mode applies when the task count in prd.json ≥ 3 or when the orchestrator's holistic review identifies documentation gaps." Avoid vague triggers like "medium/large tasks" — agents interpret those differently.

7. **Catalog Check**: This plan adds new files to `.pi/standards/` and modifies agent infrastructure. `dev/catalog/capabilities.json` should be checked for any entries related to the agent composition system or standards.
   - **Suggestion**: Quick check of capabilities.json to see if any entries need updating after this work.

---

### Strengths

- **Clear problem statement**: The three gaps (planner identity, patterns, learning loop) are well-articulated and grounded in real experience with the agent system.
- **Right location for planner identity**: Putting it in AGENTS.md (hand-written, always loaded) rather than a separate file is the correct call. The planner isn't a subagent — it shouldn't be loaded via Layer 3.
- **Additive and low-risk**: All new files or appending to existing ones. No deletions, no runtime code, no breaking changes.
- **Follows established patterns**: The plan uses the same reference-not-duplicate approach that already works (build-standards.md referenced from role files). Extending this to maintenance.md and patterns.md is consistent.
- **Out of scope is well-defined**: Explicitly excludes new profiles, automated validation, and GUIDE mode changes. Good discipline.

---

### Devil's Advocate

**If this fails, it will be because...** the maintenance protocol becomes aspirational documentation that agents don't actually follow. The existing LEARNINGS.md rules are already in AGENTS.md and dev.mdc — they're not new — and agents still don't always follow them (per the builder's own correction about "entries and learnings after meaningful fixes"). Adding more documentation about documentation maintenance won't change agent behavior if the fundamental issue is that agents deprioritize documentation when they're focused on code. The protocol needs a **mechanical enforcement point** (like the reviewer blocking approval until LEARNINGS.md is updated), not just another doc saying "you should do this."

**The worst outcome would be...** creating 3-4 new documentation files that overlap with each other and with existing rules, increasing the total amount of text agents must process without proportionally improving their behavior. The AGENTS.md identity section + APPEND_SYSTEM.md + maintenance.md + patterns.md + build-standards.md + role files + expertise profiles = a lot of layered documentation. If an agent's context window is consumed by documentation about how to document, it has less room for the actual work. The value of each additional doc must exceed its cost in tokens and cognitive load.

---

### Verdict

- [ ] Approve
- [x] **Approve with suggestions** — Minor improvements recommended

**Key recommendations before building:**
1. Relabel as medium (5 steps, 8+ files)
2. Decide now: create standalone `maintenance.md` (don't defer to implementer)
3. Role files should **reference** maintenance.md, not duplicate the protocol
4. Verify pattern claims against actual code before writing patterns.md
5. Add the reviewer as a mechanical enforcement point for the learning protocol (the reviewer already blocks on missing LEARNINGS.md updates — extend that to the new protocol items)
