# Prompt: Improving Documentation Plan Completeness

**Context:** When asked to create a plan for updating documentation (e.g., multi-IDE support docs), an AI agent produced a plan that covered README, SETUP, and AGENTS.md but initially missed ONBOARDING.md and dev/backlog feature docs. The user asked for reflection on why, and the agent provided the analysis below. Your task is to use this reflection to design prompts, checklists, or process improvements that would help future agents produce more complete plans on the first pass.

---

## Agent's Reflection (What Went Wrong)

1. **Narrow scope framing:** The task was "create a plan to update the documentation to include the new multi-IDE setup." The agent interpreted "documentation" narrowly as "docs that describe the multi-IDE feature and install flow" — README, SETUP, AGENTS. It did not consider the full set of user-facing docs or backlog items that reference doc updates.

2. **Search pattern gaps:** The agent grepped for `install`, `--ide`, and `claude` in `*.md` files. ONBOARDING.md doesn't mention install or IDE, and backlog files live in `dev/`, so they didn't surface. The agent didn't ask: "Which other docs reference Cursor, paths, or setup flows?" or "What backlog items mention doc updates?"

3. **Path drift blindness:** The agent knew about the `.cursor/skills-core/` → `.agents/skills/` change from the repo reorganization and flagged SETUP.md's outdated skill paths. It didn't extend that audit to ONBOARDING.md, which has the same stale `.cursor/skills/` reference.

4. **Backlog awareness gap:** The agent was aware of the self-guided-onboarding backlog item but didn't re-read it when planning. If it had, it would have seen Task 12's explicit doc update requirements and the Related section's Cursor-specific paths — and would have added "update self-guided-onboarding backlog for multi-IDE" to the plan.

---

## Your Task

1. **Analyze the reflection** — What patterns or root causes explain the omissions? (e.g., scope anchoring, search strategy, dependency tracing)

2. **Propose improvements** — Design one or more of:
   - **Prompt addenda** the user can append when requesting doc plans (e.g., "Before finalizing, check: ONBOARDING.md, dev/backlog for doc update tasks, grep for path references")
   - **Checklist** the agent should run through when creating doc plans
   - **Process steps** (e.g., "First list all docs that could be affected; then plan changes")

3. **Make it actionable** — The output should be something the user can copy into a Cursor rule, save as a prompt template, or add to AGENTS.md / dev/collaboration.md so future planning tasks produce more complete plans.

4. **Keep it lean** — Avoid over-engineering. A short checklist or 2–3 prompt lines is better than a long process document.

---

## Additional Suggestions from the Agent

- **Feature-specific grep patterns:** When planning doc updates for a feature (e.g., multi-IDE), run greps for the feature's key concepts (e.g., `.cursor/`, `.claude/`, `skills`, `ide_target`) to find all docs that reference those concepts — not just docs that mention the feature by name.
- **Backlog cross-check:** If the codebase has a `dev/backlog/` or similar, check for items that list "update X.md" or "docs" in their acceptance criteria; those docs may need updates when the feature ships.
- **Path audit scope:** When a feature changes paths or structure (e.g., `.cursor/` vs `.claude/`), expand the audit to all user-facing docs, not just the obvious setup/install docs.

---

## Feedback for Prompting the Agent Better

**Explicit scope prompts:** When requesting a plan, you can add: "Include all user-facing docs and any backlog items that mention doc updates (e.g., dev/backlog/features/*.md)."

**Pre-plan exploration:** "Before drafting the plan, list every .md file that references [feature concepts, e.g. Cursor, .cursor/, install, setup]. Then plan updates for any that are affected."

**Negative constraint:** "Do not assume only obvious install/setup docs need updates. Check ONBOARDING, scratchpad, and backlog for doc-related tasks."
