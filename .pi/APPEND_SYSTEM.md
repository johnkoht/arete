# How to Work (Areté BUILD Mode)

> Process rules for the planner agent. For what's available, see `AGENTS.md`.
> For coding standards, see `.pi/standards/build-standards.md`. For the learning and maintenance protocol, see `.pi/standards/maintenance.md`.

---

## Routing: When to Spawn Experts

**Bug fixes** (user reports a bug, asks to fix something broken):
→ Load `.pi/skills/hotfix/SKILL.md`. Follow structured process: diagnose → implement → review → close.
→ **Do not** make ad-hoc code changes without following the hotfix skill.

**Ad-hoc questions** (user asks about code, architecture, debugging):
→ Spawn expert with appropriate expertise profile. Attach PROFILE.md for the relevant domain.

**PRD execution** (multi-task structured work):
→ Load `.pi/skills/execute-prd/SKILL.md`. Orchestrator handles spawning with composition.

**Plan lifecycle** (planning, reviewing, pre-mortem):
→ Use plan-mode extension commands. See § Plan Lifecycle below.

---

## Composition: 4-Layer Subagent Context Stack

When spawning any BUILD mode subagent, compose context in this order:

| Layer | Content | Source |
|-------|---------|--------|
| 1 | System awareness | `AGENTS.md` (always) |
| 2 | Coding standards | `.pi/standards/build-standards.md` (always for code tasks) |
| 3 | Role behavior | `.pi/agents/{role}.md` (based on task type) |
| 4 | Domain expertise | `.pi/expertise/{domain}/PROFILE.md` (based on files touched) |

**Domain selection heuristic**: If task touches `packages/core/` → attach core profile. If `packages/cli/` → attach cli profile. If both → attach both. If neither (docs, config) → skip Layer 4.

---

## LEARNINGS.md Rules

1. **Before editing**: Check for LEARNINGS.md in the file's directory, then each parent up to repo root. Stop at first found; read it.
2. **After fixing bugs/regressions**: Add entry to nearest LEARNINGS.md (what broke, why, how to avoid). Create one if none exists and gotcha is non-obvious.
3. **Regression tests**: Include a comment explaining the failure mode they prevent.
4. **Accuracy**: When you discover something missing or inaccurate in a LEARNINGS.md, update it immediately.

---

## Execution Path Decision Tree

```
User reports a bug
 └─ Load hotfix skill → Diagnose → Present game plan
    └─ User approves → Implement → Review (spawn or self) → Close with LEARNINGS.md

User approves plan → review-plan outputs `recommended_track`
 ├─ **Express** (Tiny/Small: 1-3 steps, ≤2 files, no arch decisions)
 │    → Phantom check → Developer dispatch → Reviewer post-work code review → Commit → 1-line memory note
 │    → No worktree, no PRD artifacts, no pre-mortem
 │    → Reviewer can escalate to Standard if post-work review finds concerns
 ├─ **Standard** (Medium: 4-6 steps, 3+ files)
 │    → /ship full workflow (pre-mortem + review + PRD + worktree + build + wrap)
 └─ **Full** (Large: 7+ steps, architectural, multi-phase)
      → /ship + project-level orchestration for multi-phase builds
```

**Track override**: Builder can request `--track standard` to force full workflow for any plan size.

**Bug fixes require structure.** Do not make ad-hoc code changes. Load the hotfix skill and follow its process.

**Phantom task check (mandatory before execution)**: Before starting ANY plan task, verify the output doesn't already exist. Check proposed output files with `ls` and grep for proposed function/class names. If >50% of a task's work already exists, report it to the builder before building. Evidence: reimagine-v2 (2026-03-07) — phantom detection saved ~80% of planned work.

**When in doubt**: Offer both paths and let builder choose.

---

## Direct Execution Protocol (non-PRD)

1. Implement → 2. Test → 3. Verify (`npm run typecheck && npm test`) → 4. Review (spawn orchestrator for code review) → 5. Fix feedback → 6. Commit → 7. Report → 8. Maintenance

**Step 8 — Maintenance** (light mode applies for direct execution): Update nearest LEARNINGS.md if you found a gotcha. Flag profile inaccuracies if noticed. See `.pi/standards/maintenance.md` § Light Mode.

**Scope escalation**: If change touches >5 files or reveals hidden complexity → stop, tell user, suggest proper planning.

---

## Plan Lifecycle Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode |
| `/plan new [name]` | Start new plan |
| `/plan list` | List plans (`--ideas`, `--active`) |
| `/plan open <slug>` | Open saved plan |
| `/plan save [slug]` | Save plan |
| `/plan status` | Show lifecycle info |
| `/review` | Cross-model review |
| `/pre-mortem` | Pre-mortem analysis |
| `/prd` | Convert plan → PRD |
| `/approve` | Mark ready for building |
| `/build` | Start execution |
| `/wrap` | Close-out checklist (memory entry, index, LEARNINGS review) |

**Lifecycle**: `idea → draft → planned → building → complete` (+ `abandoned`)
**Gate requirements**: tiny/small = optional gates; medium = recommended pre-mortem; large = mandatory pre-mortem + PRD

---

## Personas Council

|council:Harvester + Architect + Preparer — voice-of-customer check during BUILD planning
|invoke:when feature involves user workflow steps, input prompts, configuration, or any step GUIDE user must take
|skip:internal architecture, build tooling, bug fixes with no UX change
|definitions:dev/personas/PERSONA_COUNCIL.md
|instructions:dev/personas/COUNCIL_INSTRUCTIONS.md
|output:concrete policy — required/optional/skip/cut — not vague persona reactions

---

## Skill and Rule Changes

Before creating or modifying any skill or rule:
- [ ] **Audience**: BUILD (dev/, .pi/) or PRODUCT (runtime/)?
- [ ] **Cross-references**: Search for refs to the changed skill/rule; update them
- [ ] **Capability registry**: Read `dev/catalog/capabilities.json` before changing tooling

---

## References

- **Coding standards**: `.pi/standards/build-standards.md`
- **Build memory**: `memory/MEMORY.md`, `memory/collaboration.md`
- **Capability catalog**: `dev/catalog/capabilities.json`
