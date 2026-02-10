# GUIDE Carry-Overs from BUILD Experience

**Purpose**: Capture what we've learned in BUILD mode and carry it over to GUIDE (end-user PM workspace) so the PM experience benefits from the same patterns that made BUILD effective.

**Status**: Backlog — improvements to implement for GUIDE.

---

## 1. Memory and Learning

### What BUILD Does

- **Leverage build memory before acting** (AGENTS.md § For Autonomous Development):
  - At start of substantive work: read **`dev/collaboration.md`** (patterns, preferences, Corrections) and scan **`dev/MEMORY.md`** for relevant entries.
  - Before adding backlog, running seed, placing PRDs, or starting PRD/plan execution: read the related entry or collaboration.md so you don't repeat past mistakes.
- **Entries + index**: Dated entries (`dev/entries/YYYY-MM-DD_slug.md`) with a **Learnings** section; index in `dev/MEMORY.md`.
- **Collaboration profile**: Synthesized from Learnings → `dev/collaboration.md`; injected into new conversations.
- **Auto-capture corrections**: When builder corrects you, auto-add to Learnings + `dev/collaboration.md` Corrections section (no asking).

### What GUIDE Has Today

- Same *structure* (observations → collaboration.md; decisions/learnings in items).
- **Missing**: An explicit "Leverage user/workspace memory before acting" instruction in the rules that ship to GUIDE.
- **Missing**: Agent is not told to read `.arete/memory/summaries/collaboration.md` (and optionally recent `decisions.md` / `learnings.md`) at the start of substantive work or before loading a skill.
- Transparency rules say "ask before adding to memory" for substantive work — BUILD moved to auto-capture for *corrections*; GUIDE could adopt the same for user corrections (add to agent-observations + optionally Corrections in collaboration.md).

### Carry-Overs

| Carry-Over | Action |
|------------|--------|
| **Leverage workspace memory** | Add a "Leverage workspace memory" section to `agent-memory.mdc` (GUIDE-only block): at start of substantive work, read `.arete/memory/summaries/collaboration.md`; before running a skill or starting a project, scan `.arete/memory/items/` (decisions, learnings) for relevance. Ship this in the rule so GUIDE agents get it. |
| **Corrections auto-capture** | In GUIDE, when the user corrects the agent ("that's wrong because…"), auto-add to `agent-observations.md` (and optionally a "Corrections" subsection in `collaboration.md`) without asking. Document in agent-memory.mdc. |
| **Index / discoverability** | GUIDE has no MEMORY.md-style index. Optional: add a simple index or "recent" pointer (e.g. `.arete/memory/README.md` or last N decisions/learnings) so the agent knows where to look. Lower priority. |

---

## 2. PRDs: BUILD vs GUIDE

### What BUILD Does

- **Structured PRD lifecycle**: `dev/prds/{feature}/prd.md` + `dev/autonomous/prd.json` (task breakdown) + execute-prd skill (orchestrator + subagents).
- **Pre-mortem**: Mandatory 8-category pre-mortem before execution; risks + mitigations in every subagent prompt.
- **Show-don't-tell**: Subagent prompts reference specific files and patterns ("Follow testDeps from qmd.ts"); no vague "use good patterns."
- **Light pre-mortem**: Already carried to GUIDE — `light_pre_mortem` in `PATTERNS.md` used by create-prd, quarter-plan, construct-roadmap.
- **Post-mortem**: After execution, analyze which risks materialized; extract learnings; update build memory.

### What GUIDE Has Today

- **create-prd** skill: Project setup under `projects/active/{feature}-prd/`, discovery questions, template selection, context integration (context/, QMD), PRD generation, optional light pre-mortem and "What am I getting wrong?"
- **No** task breakdown (prd.json) or multi-agent execution — PM writes the PRD; eng/design consume it elsewhere.
- **Light pre-mortem** is already in create-prd (optional before finalizing).

### Carry-Overs

| Carry-Over | Action |
|------------|--------|
| **Pre-mortem in create-prd** | Already done (light_pre_mortem). Optional: add one more prompt to create-prd: "Before we lock this PRD, want to run a quick pre-mortem? Assume it failed in 6 months — what would have caused it?" (already in PATTERNS; ensure skill text reinforces it). |
| **Show-don't-tell for context** | In create-prd (and other skills), when instructing the agent to "use context," point to specific files: e.g. "Read `context/business-overview.md`, `context/users-personas.md`, and `goals/strategy.md` before generating." Reduces vagueness. |
| **Structured handoff / next steps** | BUILD has EXECUTE.md handoff for execute-prd. GUIDE could add a "PRD handoff" pattern: after create-prd, optionally write a short `outputs/handoff.md` or "Next steps" with review process, stakeholders, and "what to do with this PRD" so the PM (or another agent) has a clear next action. |
| **Decisions/learnings from PRD work** | When the PM makes key decisions during PRD creation (e.g. "we're not doing X because Y"), offer to append to `.arete/memory/items/decisions.md` — same spirit as BUILD capturing learnings in entries. |

---

## 3. Other Carry-Overs

### Collaboration profile as first-class context

- BUILD: Read `dev/collaboration.md` at start of substantive work (AGENTS.md).
- GUIDE: collaboration.md exists but no rule says "read it first." Adding "Leverage workspace memory" (above) fixes this.

### Session continuity

- BUILD: Session context lives in entries and progress files (prd.json, progress.txt); no separate sessions.md.
- GUIDE: Has `sessions.md` for work session tracking. Ensure agent-memory.mdc tells the agent to *update* sessions at natural breaks and to *read* the active session when resuming (if present). Already partially there; verify "at start of substantive work" includes "check sessions.md for current focus."

### Backlog vs scratchpad

- BUILD: Clear split — raw/exploratory → scratchpad; mature ideas with a plan → `dev/backlog/` (features/ vs improvements/). Entries = what happened; backlog = future work.
- GUIDE: Has `now/scratchpad.md`. No formal "backlog" for the PM. Optional: document in pm-workspace or agent-memory that "park for later" → scratchpad; "we agreed to do this later" could also go to scratchpad or a simple `now/backlog.md` if we add it. Lower priority.

### Explicit autonomy / permission

- BUILD: Execute-prd and prd-task explicitly say "DO NOT ask for permission to write files, make commits, or proceed" so the builder can "start and walk away."
- GUIDE: For long-running flows (e.g. "create a full PRD with 10 sections"), consider a similar note in create-prd: "Proceed through discovery and generation without pausing for permission at each step unless the user asks to review." Keeps flow; user can still interrupt.

### Corrections section in collaboration profile

- BUILD: `dev/collaboration.md` has a **Corrections** section (things the builder corrected — avoid repeat mistakes).
- GUIDE: `.arete/memory/summaries/collaboration.md` template doesn't mention a Corrections subsection. Add optional **Corrections** section to the template in workspace-structure.ts and document in agent-memory.mdc that when the user corrects the agent, add to agent-observations and optionally to collaboration.md Corrections.

---

## 4. Summary: Highest-Impact Carry-Overs

1. **Leverage workspace memory** — Add to agent-memory.mdc (GUIDE): at start of substantive work, read collaboration.md; before skill/project, scan decisions/learnings. (Mirrors BUILD's "read collaboration + MEMORY before acting.")
2. **Auto-capture user corrections** — When user corrects the agent, auto-add to agent-observations (and optionally collaboration.md Corrections); no asking. (Mirrors BUILD auto-capture.)
3. **Collaboration.md Corrections** — Add Corrections subsection to GUIDE collaboration template and rules.
4. **Show-don't-tell in skills** — In create-prd and others, reference specific context files by path when asking the agent to "use context."
5. **Optional: PRD handoff / next steps** — After create-prd, offer to write a short handoff or next-steps so the PRD has a clear consumer.

---

## 5. References

- BUILD memory: `dev/MEMORY.md`, `dev/collaboration.md`, `dev/entries/`
- BUILD PRD flow: `dev/skills/execute-prd/SKILL.md`, `dev/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md`, `dev/entries/2026-02-09_builder-orchestration-learnings.md`
- GUIDE memory: `.cursor/rules/agent-memory.mdc` (mode-aware), `src/core/workspace-structure.ts` (default files)
- GUIDE create-prd: `runtime/skills/create-prd/SKILL.md`, `runtime/skills/PATTERNS.md` (light_pre_mortem)
- AGENTS.md § For Autonomous Development (Leverage build memory)
