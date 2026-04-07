---
title: "BUILD Skills Tighten-Up"
slug: build-skills-tighten
status: completed
size: large
created: 2026-04-04
completed: 2026-04-05
has_prd: false
has_pre_mortem: true
has_review: true
---

# BUILD Skills Tighten-Up

Audit and tighten the 10 BUILD skills based on 23 LEARNINGS.md files, 51 memory entries, and 3 months of execution data showing 95%+ first-attempt success but growing maintenance burden from duplication, over-specification, and unclear boundaries.

## Problem Statement

The BUILD skills work well individually (high success rates, effective pre-mortems) but have accumulated cruft:
- **Ship (2363 lines)** re-specifies workflows already defined in other skills
- **Shared concepts** (AC rubric, LEARNINGS path resolution, subagent dispatch, pre-mortem categories) are duplicated 2-4x across skills with subtle drift
- **Post-mortem memory entries** are over-templated (9 sections, token estimates) leading to half-empty entries
- **Plan-to-PRD and PRD-to-JSON** are always used together but are separate skills requiring a lossy markdown round-trip
- **Ship vs execute-prd** boundary is unclear to agents
- **Learnings show** agents consistently benefit from explicit file lists, pre-mortem mitigations in prompts, and reviewer pre-work checks — but are confused by long skill files, inconsistent risk categories, and the synthesize-collaboration-profile trigger model

## Evidence from Learnings

### What consistently helped agents (from 51 PRD entries):
1. **Explicit file reading lists** in subagent prompts — mentioned in 90%+ of "what worked" sections
2. **Pre-mortem mitigations embedded in task prompts** — 0 risks materialized in 15+ PRDs that did this
3. **Reviewer pre-work sanity checks** — caught 8+ issues per PRD before implementation started (2026-03-08 AI Config, 2026-03-09 Intelligence Tuning, 2026-03-15 Meeting Processing)
4. **Show-don't-tell patterns** ("Follow testDeps pattern from qmd.ts") vs vague ("use good patterns")
5. **LEARNINGS.md injection** into task prompts — prevented regressions across all PRDs using it
6. **Phantom task detection** (2026-03-07) — saved 80% of work on reimagine-v2 PRD
7. **Phase-by-phase verification** (typecheck + test after each task) — caught issues early

### What consistently confused or didn't help agents:
1. **Inconsistent pre-mortem risk categories** — run-pre-mortem has 8, execute-prd has 11, ship has its own set
2. **Ship skill size** — 2363 lines with inline bash scripts, merge conflict markers, and duplicated phase logic
3. **Token estimation in reflections** — appears in post-mortem template and developer reflections but no entry actually uses this data meaningfully
4. **Synthesize-collaboration-profile trigger ambiguity** — "5+ entries" threshold unclear, collaboration.md last synthesized 2026-02-10 (2 months stale)
5. **Parallel subagent execution** — caused lock contention in reimagine-v1 (2026-03-05), large parallel batches hit retry overhead in workspace-areas (2026-03-25)
6. **prd.json not updated atomically** — state tracking issues noted in task-management (2026-03-28)
7. **Developer "Documentation Updated: None" claims** — reviewers learned to be skeptical (2026-03-15) but this isn't codified
8. **Two execution paths** (todo vs PRD) in plan-mode — noted as confusing in plan-mode LEARNINGS.md gotcha #7
9. **`subagent({ action: "list" })` pre-flight** — fragile; if tool API changes, entire skill halts
10. **Long subagent sessions** — hit rate limits (77 min in task-management-ui 2026-03-31), no checkpointing guidance

### Patterns that emerged but aren't codified:
1. **Fallback-first design** for migrations (goals refactor, monorepo) — always works, never codified as a standard
2. **Content-hash dedup** (sha256 of normalized content) — used in people-intelligence, task-management
3. **Function injection for circular deps** — used in task-management, not in patterns.md
4. **TDD for services** — workspace-areas (2026-03-25) proved this works but isn't required
5. **Grumpy reviewer mindset** — explicitly proven effective (reimagine-v2) but only mentioned in execute-prd, not in reviewer.md's core identity

---

## Plan

### Step 1: Extract Shared References (reduce duplication across 6+ skills)

**What**: Create 4 shared reference files that skills point to instead of inlining:

1. **`.pi/standards/ac-rubric.md`** — Extract the AC Validation Rubric from review-plan (lines 226-267). Currently only in review-plan but useful everywhere: plan-to-prd (when writing ACs), execute-prd reviewer (when validating), hotfix (when defining game plan ACs).

2. **`.pi/standards/learnings-protocol.md`** — Extract LEARNINGS.md path resolution, entry format, and when-to-create rules. Currently described differently in hotfix (lines 147-164), execute-prd (step 13.5, step 9), developer.md, reviewer.md, and maintenance.md. One canonical source.

3. **`.pi/standards/subagent-dispatch.md`** — Extract the subagent dispatch pattern (tool reference, pre-flight check, prompt template, reflection scaling). Currently inlined in execute-prd (lines 18-69, 252-312), ship (lines 50-67), and audit (lines 32-45). Include the proven "file lists + pre-mortem mitigations in prompt" pattern from learnings.

4. **`.pi/standards/pre-mortem-categories.md`** — Consolidate the canonical risk category list. Execute-prd has the most complete set (11 categories including Reuse/Duplication, Documentation, Build Scripts added from learnings). Make this the single source. run-pre-mortem and ship reference it.

**Why**: Learnings show these are the highest-value patterns. Duplicating them causes drift (e.g., 8 vs 11 risk categories) and makes updates require touching 3-4 files.

**Pre-mortem mitigation (Risk 3: Dead Links)**:
- Use consistent repo-root paths (`.pi/standards/X.md`), never relative paths
- Add shared reference files to audit skill's manifest for periodic checking
- Add a verification to `/wrap`: "Do all referenced .pi/standards/*.md files exist?"
- After completion: `grep -rh "\.pi/standards/" .pi/skills/ | sort -u` — verify every path exists

**AC**:
- Each shared reference exists and contains the canonical definition extracted from its source skill(s)
- All skills that previously inlined this content now reference the shared file in their "Read These Files First" list (not just a prose mention — per review Change 2)
- All skills that previously inlined this content also include a one-line summary and path
- No skill inlines more than 5 lines of content that exists in a shared reference
- Run `grep -r "LEARNINGS.md path" .pi/skills/` confirms no duplicate path-resolution descriptions
- All referenced paths verified to exist (Risk 3 verification)

---

### Step 2: Slim Ship to a thin orchestration layer (~300 lines target, down from 2363)

**What**: Ship becomes a routing document with gates, not a re-implementation of the skills it orchestrates. Each phase tells the agent which existing skill or command to invoke, what output to check, and what gate decision to make.

**Architecture** — three files:

1. **ship/SKILL.md (~300 lines)** — Phase routing, gate logic, entry/exit conditions. Each phase is 3-10 lines: "Run [command/skill]. Check [output]. Gate: [proceed/pause condition]."

2. **ship/orchestrator.md (keep, update references)** — Gate decision matrix, autonomous heuristics, communication templates. Already well-structured.

3. **ship/build-log-protocol.md (new, ~250 lines)** — Extract all build-log management (Phase 0 entirely, the "Build Log Update Reference" section, resume/verify logic). This is infrastructure that doesn't change with the skill workflow.

**The core principle**: Every phase that just invokes another skill/command becomes 3-5 lines. The skill/command already knows how to do the work. Ship only adds: what to run, what to check in the output, and what gate decision to make.

**Phase-by-phase transformation**:

| Phase | Current (lines) | New (lines) | What changes |
|-------|----------------|-------------|--------------|
| 0: Build Log | ~300 | 5 | Move entirely to build-log-protocol.md. Ship says: "Follow build-log-protocol.md to initialize or resume." |
| 1.1: Save Plan | 20 | 3 | "Run `/plan save {slug}`." |
| 1.2: Pre-Mortem | 27 | 5 | "Run `/pre-mortem`. Gate: CRITICAL risks → PAUSE." |
| 1.3: Review | 28 | 5 | "Run `/review`. Gate: structural blockers → PAUSE." |
| 2.1: Memory Review | 138 | 30 | Keep 5-bullet synthesis spec (unique to ship). Cut 100 lines of bash for memory search — agent can search memory without scripts. |
| 2.2: PRD Conversion | 118 | 5 | "Run `/prd`. Verify prd.json exists." |
| 2.3: Commit Artifacts | 150 | 5 | "Commit all files in `dev/work/plans/{slug}/`." |
| 3.1: Worktree | 135 | 5 | "Run `/worktree create {slug}`. Verify CWD." |
| 3.2: Switch | 125 | 3 | "cd to worktree. Verify branch is `feature/{slug}`." |
| 4.1: Execute PRD | 107 | 8 | "Load execute-prd skill. Gate: task failures → PAUSE." |
| 4.2: Final Review | 125 | 10 | Keep eng-lead dispatch prompt (unique). Cut profile-selection logic — reference execute-prd's. |
| 5.1-5.2: Memory/LEARNINGS | 228 | 5 | "Execute-prd Phase 3 already handles this. Verify entry exists." |
| 5.3: Commit | 79 | 3 | "Commit wrap artifacts." |
| 5.4: /wrap | 83 | 3 | "Run `/wrap`. Address any ✗ checks." |
| 5.5: Ship Report | 130 | 40 | Keep — report template and data gathering is unique to ship. |
| 5.6: Merge | 125 | 15 | Keep gitboss dispatch (unique). Cut bash scripts for merge checks — gitboss handles that. |
| Recovery | 70 | 40 | Keep recovery matrix — it's the value of ship. Slim the prose. |
| Phase 6: Cleanup | 200 | 10 | "Run `/worktree remove {slug}`. Delete branch locally and remotely." |

**Total: ~2363 → ~300 lines.**

**What gets cut entirely** (~1650 lines):
- All inline bash scripts for git operations, memory search, artifact validation, worktree management — these are standard agent operations that don't need scripting
- All re-descriptions of how other skills work (pre-mortem workflow, review workflow, PRD conversion, execute-prd task loop, /wrap checks)
- The 70-line "Example" sections — move execute-prd examples back to execute-prd
- Phase 2.3's 150 lines of "how to git add and git commit" — an agent knows how to commit files
- Phase 6's 200 lines of "how to delete a git branch" — an agent knows this
- Merge conflict markers (lines 100-107, 1155-1165, 1171-1175)

**What ship/SKILL.md retains in detail**:
- Pre-flight check (plan-mode state validation) — ~20 lines
- Phase overview diagram (ASCII workflow) — ~30 lines  
- Per-phase: entry conditions, command/skill to run, gate table, exit conditions — ~3-10 lines each
- Phase 2.1 memory synthesis spec (unique) — ~30 lines
- Phase 4.2 eng-lead dispatch prompt (unique) — ~10 lines
- Phase 5.5 ship report generation (unique) — ~40 lines
- Phase 5.6 gitboss dispatch (unique) — ~15 lines
- Recovery matrix — ~40 lines
- References — ~10 lines

**Why**: The current ship skill is 2363 lines because it re-implements every skill it calls. An agent loading ship gets the entire build system re-described in one document. The actual ship-specific decisions (phase ordering, gate logic, resume, report) are ~300 lines buried in ~1650 lines of redundant workflow descriptions and bash scripts that agents don't need. Learnings from 51 PRDs show agents follow skill references reliably — "Run `/pre-mortem`" works as well as re-explaining the pre-mortem workflow.

**Pre-mortem mitigations**:
- **(Risk 1: Resume breakage)**: Before starting, check `dev/executions/` for any build-logs with State != COMPLETE — finish or archive them first. Build-log-protocol.md state verification must match on phase **names** (e.g., "Pre-Mortem"), not numbers. Include an old→new phase number migration note.
- **(Risk 9: Cross-reference breakage)**: Before starting, grep for all references to ship sections: `grep -r "ship" .pi/ --include="*.md"`. Maintain a reference map (old section → new section). Update ALL references in the same commit as the slim-down.
- **(Risk 2: Self-referential editing)**: Complete Steps 1-4 as a single atomic phase. Don't leave the system in a state where ship has been slimmed but other skills still reference the old structure.

**AC**:
- ship/SKILL.md is under 350 lines
- ship/build-log-protocol.md exists with all Phase 0 and update-reference content
- Every phase that delegates to another skill/command is under 10 lines
- All gate decisions preserved with clear proceed/pause conditions
- Merge conflict markers resolved
- No bash scripts for standard operations (git, memory search, file validation)
- Dry-run verification: read slimmed ship/SKILL.md and verify every phase references an existing skill or command with a concrete invocation
- No dangling references to old ship phase numbers or section names (Risk 1, 9 verification)
- `dev/executions/` has no in-progress build-logs referencing old phase structure

---

### Step 3: Merge plan-to-prd and prd-to-json into a single skill

**What**: Combine into `.pi/skills/plan-to-prd/SKILL.md` that emits both `prd.md` and `prd.json` in one pass. Keep prd-to-json as a minimal "standalone converter" for the edge case where someone has a PRD but no prd.json.

**Current flow**: plan-to-prd creates prd.md → calls prd-to-json → prd-to-json re-parses the markdown → outputs prd.json. The structured data (tasks, ACs, dependencies) exists in the agent's context during plan-to-prd but gets serialized to markdown then re-parsed.

**New flow**: plan-to-prd creates both artifacts simultaneously. The prd.md is the human-readable document; the prd.json is generated from the same internal representation.

**prd-to-json becomes**: A 50-line skill that says "If you have a standalone prd.md without prd.json, parse it into JSON using this schema." No workflow steps, no memory reading, no parsing tips — just schema reference and output path.

**What to cut from prd-to-json**:
- Step 1 (Read Build Memory) — plan-to-prd already has context
- Step 2 (Locate the PRD) — plan-to-prd just created it
- Steps 3-6 (Parse, Generate IDs, Branch, Build Object) — done during plan-to-prd
- Parsing Tips section (70 lines) — LLM doesn't need markdown parsing instructions
- Example Conversion section (70 lines) — one compact example is enough
- Error Handling section — covered by plan-to-prd

**Why**: Every PRD execution starts from a plan. The standalone-PRD-to-JSON case is rare (noted in 0 of 51 memory entries). The round-trip through markdown is a lossy step that adds complexity without value.

**AC**:
- plan-to-prd/SKILL.md outputs both prd.md and prd.json
- prd-to-json/SKILL.md is under 80 lines, schema-reference only
- AGENTS.md skill listing updated
- All files referencing `plan-to-prd` or `prd-to-json` point to valid skill paths; `grep -r 'prd-to-json' .pi/skills/` shows only the standalone converter

---

### Step 4: Clarify execute-prd vs ship boundaries

**What**: Add a crisp 3-line boundary statement to the top of both skills:

**execute-prd**: "Runs the build loop for an existing PRD+prd.json. Assumes branch/worktree already set up. Call this directly for focused execution without the full ship workflow."

**ship**: "End-to-end from approved plan to merged code. Calls plan-to-prd, execute-prd, and /wrap internally. Use when you want autonomous plan-to-merge."

Add a "Relationship to Ship" section in execute-prd (3 lines) and a "Relationship to Execute-PRD" section in ship (3 lines).

**Also**: Add a routing hint to APPEND_SYSTEM.md's execution path decision tree:
```
User approves plan
 ├─ Tiny (1-2 steps) → Direct execution → quality gates
 ├─ Small (2-3 steps) → Offer pre-mortem → quality gates → offer memory capture
 ├─ Medium (3-5 steps) → /ship (full workflow) or /build (just execute-prd)
 └─ Large (6+) → /ship (mandatory full workflow)
```

**Why**: Learnings don't show explicit confusion between these two, but the overlap is a maintenance hazard. Making the boundary explicit now prevents future drift as ship gets slimmed.

**AC**:
- Both skills have explicit boundary statements in first 10 lines
- APPEND_SYSTEM.md decision tree updated with ship vs build routing

---

### Step 5: Simplify post-mortem memory entry template

**What**: Reduce the 9-section post-mortem template to 5 sections. Cut sections that learnings show are consistently empty or noise:

**Keep (5 sections)**:
1. **Metrics** — tasks, success rate, iterations, tests added (always filled, always useful)
2. **Pre-mortem effectiveness** — risk table (always filled, high signal)
3. **What worked / what didn't** — merge into one section with +/- format (currently split across 2 sections + "Surprises" which is redundant)
4. **Recommendations** — continue/stop/start format (actionable)
5. **Follow-ups** — refactor items, doc gaps, catalog updates (merge 3 current sections)

**Cut**:
- **Subagent insights / token patterns** — "Memory: X% found progress.md valuable" is never actionable. Token estimates are consistently rough guesses. No memory entry meaningfully uses this.
- **Collaboration patterns** — useful early (first 5-10 PRDs) but 51 entries in, collaboration.md captures this. New observations should go directly to collaboration.md, not through the entry.
- **Separate "Surprises" section** — merge into what worked/didn't. A surprise is just something that worked or didn't that wasn't expected.

**Also**: Remove token estimation from developer reflection prompts in execute-prd. Replace with: "Note any tools, patterns, or LEARNINGS.md entries that were particularly helpful or missing."

**Why**: Learnings show agents fill these sections formulaically. The post-mortem for meeting-agenda (2026-02-11) notes "Developer entry NOT created" as a gap — meaning even the useful sections get skipped. Simpler template = higher completion rate.

**AC**:
- prd-post-mortem/SKILL.md template has 5 sections
- execute-prd developer reflection prompt removes token estimation
- execute-prd developer reflection prompt asks about helpful/missing resources instead
- Existing memory entries are not modified (they're historical records)

---

### Step 6: Codify proven patterns from learnings into standards

**What**: Update `.pi/standards/patterns.md` and relevant agent definitions with patterns that learnings proved work but aren't codified:

1. **Grumpy reviewer mindset** → Add to reviewer.md's identity/mindset section (not just execute-prd). Evidence: reimagine-v2 caught 5 phantom tasks (2026-03-07), meeting-processing caught doc claims (2026-03-15).

2. **Fallback-first migration design** → Add to patterns.md. "When migrating data formats, always read old format as fallback. Never require migration to run first." Evidence: goals-refactor (2026-03-19), monorepo (2026-02-15), priority toggle (2026-03-07).

3. **Sequential subagent execution for shared codebase** → Add to subagent-dispatch.md (from Step 1). "Never run parallel subagents that edit the same codebase — lock contention causes failures." Evidence: reimagine-v1 (2026-03-05), workspace-areas (2026-03-25).

4. **Skeptical doc-update review** → Add to reviewer.md's post-work checklist. "If developer reports 'Documentation Updated: None', verify against files changed. Developers underreport doc needs." Evidence: meeting-processing (2026-03-15), explicit correction in collaboration.md.

5. **Phantom task detection as standard** → Currently only in execute-prd. Move to a pre-execution standard since it saved 80% of work. Add to APPEND_SYSTEM.md or the subagent-dispatch standard.

**Why**: These patterns have 3+ data points each across real PRD executions. They're currently scattered in memory entries but not in the files agents actually read before working.

**AC**:
- patterns.md has fallback-first migration pattern with evidence
- reviewer.md has grumpy mindset in identity section and skeptical doc review in checklist
- subagent-dispatch.md (from Step 1) has sequential execution warning
- execute-prd or shared standard has phantom task detection
- Each addition cites the source PRD/date as evidence

---

### Step 7: Simplify synthesize-collaboration-profile trigger model

**What**: Change from "5+ entries" threshold (vague, never triggered naturally) to two clear triggers:

1. **After every post-mortem** — post-mortem already extracts learnings; synthesize is just the "push to collaboration.md" step. Make it automatic, not suggested. This is a 30-second operation, not worth a separate decision.

2. **On request** — builder says "update collaboration profile."

Remove the "5+ entries" threshold, the "monthly" suggestion, and the "after major build phase" trigger. These are all approximations of "after post-mortem."

**Implementation**: prd-post-mortem's Step 9 changes from "suggest running synthesize-collaboration-profile" to "run synthesize-collaboration-profile." The synthesize skill itself stays the same (it's well-written); just the trigger model simplifies.

**Also**: collaboration.md shows "Last Synthesized: 2026-02-10" — 2 months stale. This proves the current trigger model doesn't work.

**Why**: The evidence is clear: collaboration.md is 2 months stale despite 30+ entries with learnings since last synthesis. The "suggest" model fails because the suggestion comes at the end of a long PRD execution when both agent and builder are ready to move on.

**AC**:
- prd-post-mortem Step 9 is "run synthesize-collaboration-profile" not "suggest"
- synthesize-collaboration-profile trigger table updated (remove 5+, monthly, major phase)
- AGENTS.md [Memory] section updated if it references the old trigger model
- collaboration.md note about staleness is not part of this plan (that's a separate run of the skill)

---

### Step 8: Audit skill gets pre-flight check and fallback

**What**: Add the same pre-flight pattern from execute-prd to audit:

1. **Check subagent tool availability** — if unavailable, offer single-agent fallback (audit domains sequentially as the orchestrator agent, not dispatched experts)
2. **Check manifest.yaml exists** — if missing, use hardcoded domain defaults (the domain table in SKILL.md already has the information)

**Why**: Execute-prd's pre-flight check is explicitly praised in learnings (2026-02-06 execute-prd-fallback, 2026-03-08 AI Config). Audit lacks this and would silently fail if subagent tool isn't available. The fix is small (~20 lines per check).

**AC**:
- audit/SKILL.md has pre-flight check section matching execute-prd's pattern
- Fallback mode for no-subagent clearly labeled in output
- Missing manifest.yaml falls back to inline domain table
- When subagent tool is available, audit dispatches experts per the existing domain table (no change to dispatch logic)

---

### Step 9: Clean up collaboration.md staleness

**What**: Run synthesize-collaboration-profile against all entries since 2026-02-10 to bring collaboration.md current. This is a direct execution step, not a skill change.

**Why**: collaboration.md is the most-read file by agents (loaded at conversation start per AGENTS.md). It being 2 months stale means agents are working with outdated collaboration preferences. Corrections 9-12 in collaboration.md were added manually but the bulk of learnings from March PRDs (grumpy reviewer, phantom tasks, doc skepticism, parallel subagent issues) aren't reflected.

**AC**:
- collaboration.md "Last Synthesized" date is 2026-04-04
- All corrections from 2026-02-10 through 2026-04-03 entries are reflected
- No duplicate bullets (merge, don't append)
- Working Patterns section reflects current process (plan-mode commands, not manual)

---

### Step 10: Complexity-based workflow routing (Express / Standard / Full)

**What**: Replace the one-size-fits-all pipeline with three tracks selected at plan approval time:

| Track | When | What runs | What's skipped |
|-------|------|-----------|----------------|
| **Express** | 1-3 steps, <=2 files, no architectural decisions | Developer dispatch → reviewer code review → commit | Pre-mortem, reviewer pre-work, formal post-mortem, worktree |
| **Standard** | 4-6 steps, or 3+ files | Current /ship flow (slimmed) | Token estimation, collaboration synthesis |
| **Full** | 7+ steps, architectural changes, multi-phase | /ship + project-level orchestration | Nothing skipped |

The review-plan skill already computes complexity tiers (Tiny/Small/Medium/Large) with exact thresholds. Currently this intelligence dies at the review step. Propagate it forward: review-plan outputs a `recommended_track: express|standard|full` field, and /ship or /build respects it.

**Express track details**: No plan artifacts created on disk. No worktree. Developer gets the task prompt directly, reviewer does post-work code review, commit, done. A one-line memory entry records what was done. This is the missing fast path between "just do it manually" and "full PRD ceremony."

**Pre-mortem mitigation (Risk 5: Express lets issues through)**:
- Express MUST keep post-work code review (mandatory on all tracks)
- Express MUST still run the recon check (Step 13 phantom detection) — it's cheap and catches the biggest waste
- Define an escalation escape hatch: if the reviewer during post-work finds something concerning, escalate to Standard retroactively
- Builder can always override: `--track standard` forces the full flow even for small work

**Why**: The process skeptic nailed this: a 2-file config change currently pays the same overhead as a 15-task architectural PRD. Builders route around the system for small work, which means small changes get zero quality gates. Express gives quality without ceremony.

**AC**:
- review-plan outputs `recommended_track` based on existing complexity tiers
- APPEND_SYSTEM.md decision tree updated with three tracks
- Express track defined (developer + reviewer, no artifacts, no worktree)
- Express includes recon check and post-work code review (Risk 5 mitigation)
- Escalation path from Express → Standard documented
- Standard = current /ship (slimmed)
- Full = /ship + optional project-build for multi-phase
- Builder can override track selection

---

### Step 11: Merge engineering-lead into orchestrator (5 roles, not 6)

**What**: Delete `.pi/agents/engineering-lead.md`. Fold its unique responsibilities into orchestrator.md.

**Analysis of overlap**:
- Technical pre-mortem → orchestrator already does this (Phase 1 of execute-prd)
- Task breakdown & context assembly → orchestrator's core job (Step 10 of execute-prd)
- Pre-work sanity check → orchestrator dispatches reviewer for this
- Code review (strict) → orchestrator dispatches reviewer for this
- Holistic review → orchestrator does this (Phase 3 of execute-prd)

**What engineering-lead has that orchestrator doesn't**:
- The "Testing Requirements (Enforced)" section with the red-flags list → move to orchestrator.md
- The "Communication with Developers" templates → already in execute-prd's prompt template
- The code review checklist → lives in reviewer.md (engineering-lead was duplicating it)

**Where engineering-lead is currently referenced**:
- ship/SKILL.md Phase 4.2 (final review) → change to spawn orchestrator or reviewer
- APPEND_SYSTEM.md direct execution protocol → change to orchestrator
- AGENTS.md roles section → remove engineering-lead, update count to 5

**Why**: These roles never run simultaneously. The orchestrator IS the engineering lead during PRD execution. Having both creates prompt injection of overlapping context and confusion about which to spawn. 5 roles (developer, reviewer, orchestrator, product-manager, gitboss) is cleaner.

**Pre-mortem mitigations**:
- **(Risk 6: Orchestrator bloat)**: Only move the testing red-flags section (~30 lines). Don't concatenate files. Actively prune overlapping sections (e.g., "Failure Mode Awareness" overlaps with "Failure Recovery" — merge them). Target: orchestrator.md under 260 lines.
- **(Risk 2: Dangling references)**: Update ALL references to engineering-lead in the same task. After completion: `grep -r "engineering-lead" .pi/` must return 0.

**AC**:
- engineering-lead.md deleted
- orchestrator.md gains the testing red-flags section
- orchestrator.md is under 270 lines (Risk 6 verification)
- All references to engineering-lead in skills and AGENTS.md updated
- `grep -r "engineering-lead" .pi/` returns 0 (Risk 2 verification)
- No behavioral change — same checks happen, just under one role name

---

### Step 12: Replace freeform reflections with structured signals

**What**: Change the developer completion report's "Reflection" section from freeform prose to tagged signal blocks:

```markdown
## Signals
- REUSE: Used getSearchProvider() from search.ts (was in my prompt)
- MISSING_CONTEXT: Had to discover testDeps pattern by reading qmd.ts — wasn't in "Patterns to Follow"
- NEW_PATTERN: Created sentinel-comment pattern for non-destructive updates
- BLOCKER_RESOLVED: Light meetings need 'processed' status, not 'approved'
- NOTHING_NOVEL: Implementation followed existing patterns exactly
```

Each signal type maps to an orchestrator action:

| Signal | Orchestrator Action |
|--------|-------------------|
| `REUSE` | Good — context assembly was effective |
| `MISSING_CONTEXT` | Add to next task's prompt, update LEARNINGS.md |
| `NEW_PATTERN` | Feed into LEARNINGS.md, consider patterns.md |
| `BLOCKER_RESOLVED` | Feed into next task's prompt, add to working-memory |
| `NOTHING_NOVEL` | No action — skip documentation synthesis for this task |

**Also remove**: Token estimation from both tiers of reflection. Replace with signals.

**Why**: The current freeform reflections are "formulaic and never used" (51 PRDs of evidence). Execute-prd Step 13.5 (Documentation Synthesis) tries to mine freeform text for signal — that's exactly what structured data prevents. A `MISSING_CONTEXT` tag is immediately actionable; "Existing saveMeetingFile() pattern for conditional frontmatter..." is not.

**Pre-mortem mitigation (Risk 7: Signals too rigid/loose)**:
- Allow a brief freeform note AFTER the tag (one line): `MISSING_CONTEXT: testDeps pattern — had to read qmd.ts to discover it`
- Include `OTHER: [freeform]` as a catch-all. If OTHER appears >30% across a PRD, categories need revision.
- Make NOTHING_NOVEL the explicit expected default for simple tasks — it's confirmation context assembly worked, not failure.

**AC**:
- developer.md completion report template uses signal tags instead of freeform reflection
- Signal tags allow one-line freeform note after the tag (Risk 7 mitigation)
- OTHER tag included as catch-all
- execute-prd Step 10 prompt template uses signal tags
- execute-prd Step 13.5 can check for MISSING_CONTEXT and NEW_PATTERN tags directly
- Orchestrator between-task intelligence references signal tags
- Token estimation removed from all reflection/signal templates

---

### Step 13: Add recon phase before pre-mortem (phantom task prevention)

**What**: Add a "Recon" check as the first step of execute-prd Phase 0, BEFORE the pre-mortem. For every task in prd.json:

1. `ls` the proposed output files — do they already exist?
2. `grep` for the function signatures the task would create — already implemented?
3. Check if acceptance criteria are already met by existing code

Output a recon report:

```markdown
## Recon Report

| Task | Status | Evidence |
|------|--------|----------|
| task-1: Add area field to API | PHANTOM | area field already in getMeeting response (routes/meetings.ts:47) |
| task-2: Create AreaService | CONFIRMED | No existing service found |
| task-3: Add CLI command | PARTIAL | Command exists but missing --filter flag |
```

Tasks marked PHANTOM get surfaced to the builder with options: skip, verify AC and mark complete, or proceed anyway. This runs BEFORE the pre-mortem because there's no point risk-analyzing work that doesn't need to happen.

**Why**: The single most documented waste pattern in the codebase. reimagine-v2 saved 80% of work (2026-03-07). product-simplification found gap 1 already implemented (2026-04-03). core-refactor reduced 7 tasks to 2. This is not theoretical — it's the most frequently realized waste.

**AC**:
- execute-prd Phase 0 has recon check before pre-mortem
- Recon report format defined with CONFIRMED/PHANTOM/PARTIAL statuses
- PHANTOM tasks require builder decision before proceeding
- Recon check is automated (ls + grep), not manual orchestrator judgment

---

### Step 14: Agent working memory across tasks

**What**: Create a `working-memory.md` file in the execution state directory (`dev/executions/{slug}/working-memory.md`) that every subagent (developer and reviewer) can read AND write to.

Structure:
```markdown
## Discovered Patterns
- [Task 2] Speaker label matching: bidirectional partial name matching (meeting-processing.ts:145)

## Active Gotchas
- [Task 3] Light meetings must get 'processed' status, NOT 'approved'

## Shared Utilities Created
- [Task 1] calculateSpeakingRatio() in meeting-processing.ts

## Context Corrections
- [Task 2] MISSING_CONTEXT: testDeps pattern not in prompt, found by reading qmd.ts
```

Developer prompt template adds: "Before starting, read `{execution-state}/working-memory.md`. After completing, update it with anything the next developer should know."

**Why**: Currently cross-task knowledge transfer is bottlenecked through the orchestrator. The orchestrator reads the previous developer's report, extracts relevant info, and pastes it into the next prompt. This is manual, lossy, and dependent on orchestrator judgment. Working memory makes developers first-class participants in knowledge transfer.

**AC**:
- working-memory.md created during execute-prd Phase 0 initialization
- If working-memory.md already exists (resume case), append to it rather than overwriting
- Developer prompt template includes read+write instruction for working-memory.md
- Orchestrator between-task intelligence reads working-memory.md as a source
- working-memory.md is structured (sections, not freeform)

---

### Step 15: Elevate /ship to meta-orchestrator for multi-phase builds

**What**: Extend `/ship` to handle both single-phase and multi-phase plans. No separate project-build skill — ship detects the plan type and routes accordingly. `/build` (execute-prd) handles per-phase task execution.

**Two modes, one command**:

```
/ship (reads plan, detects mode)
├── Single-phase (flat step list, no explicit phases)
│   └── Current flow: worktree → /build → wrap → merge
│
└── Multi-phase (plan has explicit phases/sections)
    └── Meta-orchestrator mode:
        ├── Creates project worktree (feature/{slug})
        ├── Per-phase loop:
        │   ├── Writes phase briefing (tasks, context, prior learnings)
        │   ├── Spawns sub-orchestrator → /build on phase branch
        │   ├── Post-work gate (reviewer + integration check)
        │   └── Merge phase branch → project branch
        └── Final: holistic review → wrap → merge to main
```

**Detection**: Ship reads the plan and checks for explicit phase markers (## Phase 1, ## Phase 2, or numbered phase sections). If found → multi-phase. If flat list of steps → single-phase. Builder can override with `/ship --multi` or `/ship --single`.

**Sub-orchestrators work from the plan, not full PRD ceremony.** The meta-orchestrator writes a detailed phase briefing containing: tasks, ACs, context from prior phases, constraints, and integration points. However, the meta-orchestrator **generates a prd.json for each phase** mechanically from the briefing (tasks + ACs are already structured). This is necessary because `/build` (execute-prd) depends on prd.json for state tracking, commit SHAs, progress logging, and recon checks. The prd.json generation is mechanical — no separate PRD markdown, no plan-to-prd skill invocation, just structured data from the briefing. If the sub-orchestrator judges the phase is too complex (7+ tasks, unclear scope), it can create a full prd.md as well.

**The meta-orchestrator maintains three checklists**:

1. **Project management plan**: Phase ordering, dependencies, branch strategy, gate criteria, what "done" looks like for the whole project.

2. **Per-phase pre-work briefing**: Context for each sub-orchestrator:
   - What to build (tasks and ACs from the phase section of the plan)
   - What prior phases produced (from project-working-memory.md)
   - Branch to work on (`feature/{slug}-phase-N` off `feature/{slug}`)
   - Integration points and constraints from other phases
   - Learnings from prior phase gates

3. **Per-phase post-work gate**: Review criteria:
   - Spawn reviewer for code review of the phase diff
   - Check: does implementation satisfy the phase goals?
   - Check: does it integrate cleanly with prior phases?
   - Check: does it set up the next phase correctly?
   - Decision: merge, iterate (send back to sub-orchestrator with feedback), or pause for builder

**Autonomous authority model**:
- Within a phase: sub-orchestrator has full authority (it's running /build)
- Between phases: meta-orchestrator proceeds if gate passes, pauses only on: phase gate failure, cross-phase integration issue, or project-level risk
- Builder gets a notification at each gate completion (not a blocker, just FYI)
- Builder can interrupt at any time

**Cross-phase learning**: A `project-working-memory.md` accumulates across all phases:
```markdown
## Phase 1 Outputs
- Created AreaService in packages/core/src/services/area.ts
- Pattern: area files use YAML frontmatter with recurring_meetings field

## Phase 1 Gate Feedback
- Reviewer flagged: area parser should handle missing frontmatter gracefully

## Phase 2 Pre-Work Context
- Must import AreaService from Phase 1
- Must handle missing frontmatter (from Phase 1 gate feedback)
```

**Branch strategy**:
```
main
└── feature/{slug}              ← meta-orchestrator's worktree/branch
    ├── feature/{slug}-phase-1  ← sub-orchestrator 1's branch
    │   └── (merged back after gate passes)
    ├── feature/{slug}-phase-2  ← sub-orchestrator 2's branch
    │   └── (merged back after gate passes)
    └── ... 
```

**Pre-mortem mitigation (Risk 4: Multi-phase under-specified)**:
- Do NOT implement multi-phase mode in the same execution as the ship slim-down (Step 2). Get single-phase working clean first.
- Start with minimal viable version: 2-phase only, no parallel phases, linear dependency only. Expand after proving the basic loop works.
- Write explicit branch mechanics before implementation: `git checkout -b feature/{slug}-phase-1 feature/{slug}` — concrete commands, not just diagrams.
- Before marking complete: execute a real 2-phase build and verify phase branch creation, phase merge to project branch, cross-phase context passing, and recovery from a simulated failure.

**Why**: This is the biggest gap in the current system. The builder spends valuable time on planning (high-value human work) then has to babysit execution across phases (low-value human work). The builder's own instruction (manually spawning meta-orchestrators) proves demand exists — it just needs to be codified. Keeping it within /ship rather than a separate skill means one command for all build work.

**AC**:
- ship/SKILL.md has mode detection (single vs multi-phase)
- Multi-phase mode: meta-orchestrator loop with phase briefings and post-work gates
- Sub-orchestrators work from briefings by default, PRD creation optional (sub-orchestrator's judgment)
- Branch-per-phase strategy defined with explicit git commands (Risk 4 mitigation)
- Cross-phase context passing via project-working-memory.md
- Autonomous authority model defined (when to proceed, when to pause)
- `/build` (execute-prd) is the per-phase execution engine
- Builder can override mode detection with `--multi` or `--single`
- Verified with a real 2-phase test build before marking complete (Risk 4 mitigation)

---

### Step 16: Worktree guard — /ship never runs on main

**What**: Add a mandatory pre-flight check to /ship that prevents any build execution from happening on the main branch or the main worktree. This applies to ALL modes (single-phase, multi-phase, Express, Standard, Full).

**The rule**: When `/ship` is invoked, before ANY other work:

1. **Check current branch**: If on `main` or `master` → HALT
2. **Check worktree**: If CWD is the main repository (not a worktree) → HALT
3. **If halted**: Ship creates the worktree automatically and moves there before proceeding

```
/ship invoked
├── On main branch or main worktree?
│   ├── YES → Create worktree (feature/{slug}), switch to it, then proceed
│   └── NO → Already in a worktree on a feature branch, proceed
├── Multi-phase mode?
│   ├── YES → Meta-orchestrator is in project worktree
│   │         Sub-orchestrators get phase branches OFF the project branch
│   │         (sub-orchestrators should also be in worktrees or branches, never main)
│   └── NO → Single-phase, already in correct worktree, proceed with /build
```

**What this prevents**:
- Commits landing directly on main during builds
- Subagents editing the live codebase without isolation
- Accidental merge conflicts with other work
- The current ship skill's Phase 3 (worktree setup) happening AFTER pre-mortem/review/PRD creation — which means those artifacts get created on main first, then the worktree. The guard moves worktree creation to the FIRST action.

**Multi-phase enforcement**: The meta-orchestrator must also verify that each sub-orchestrator is working on the correct branch. The pre-work briefing includes the branch name, and the sub-orchestrator's first action is verifying its CWD matches.

**Pre-mortem mitigation (Risk 8: Worktree guard breaks artifact flow)**:
- Plan artifacts (pre-mortem.md, review.md, prd.md) should be committed on the current branch BEFORE creating the worktree. The worktree then inherits them via git.
- Revised flow: pre-flight checks → save plan + run pre-mortem + review + PRD on current branch → commit artifacts → THEN create worktree → proceed with /build in worktree.
- The guard's role is specifically: "don't let `/build` (code execution with subagents) happen on main." Planning artifacts on main is fine and expected — they're documentation, not implementation.

**Why**: Ship running on main is a footgun. The current skill creates artifacts on main in Phases 1-2, then moves to a worktree in Phase 3. If the skill fails between Phases 1 and 3, plan artifacts are left uncommitted on main. Worse, if a builder says `/ship` without realizing they're on main, subagents start committing implementation code to main. The guard makes this impossible while preserving artifact visibility.

**AC**:
- /ship pre-flight checks branch and worktree before code execution (/build)
- Planning phases (pre-mortem, review, PRD) can run on any branch including main
- Code execution (/build) requires a worktree — auto-creates and switches if needed
- Plan artifacts committed before worktree creation (Risk 8 mitigation)
- Multi-phase: meta-orchestrator verifies sub-orchestrator branches in pre-work
- Sub-orchestrators verify their own CWD as first action (already exists in execute-prd)

---

## Review Incorporation

**Verdict**: Approve with suggestions (all incorporated below).

**Split decision**: Keep as one plan. The 4-phase execution strategy creates natural boundaries — each phase leaves the system consistent. We can stop after any phase and assess. Two separate plans would add overhead (separate PRDs, post-mortems) without benefit since Phase A must complete before Phase C anyway.

**Key review findings incorporated**:
1. Risk 3 (dead links) elevated to CRITICAL — shared references must be in "Read These Files First" lists, not just prose mentions
2. prd.json handling specified for multi-phase — meta-orchestrator generates prd.json mechanically from briefings
3. Weak ACs tightened across Steps 1, 2, 3, 4, 8, 10, 14
4. Inter-phase consistency checks added after each phase
5. Backward compatibility note: Steps 10 (Express), 12 (signals), 15 (multi-phase) are behavioral additions, not just refactoring — they add new capabilities to the system

---

## Execution Strategy

**CRITICAL (Risk 2): This plan modifies the skills it would normally be executed by.** Do NOT use autonomous `/ship` or `/build` to execute this plan. Use direct execution with manual orchestration in a worktree. After each phase, verify the modified skills are internally consistent before proceeding.

**Worktree requirement**: All execution happens in a worktree on a feature branch, never on main. Create `feature/build-skills-tighten` worktree before starting Phase A.

### Phase A: Foundation (Steps 1-4, 16)
Structural changes — shared references, ship slim-down, skill merges, boundary clarity, worktree guard. These are interdependent and set up the clean base. **Execute as a single atomic phase — don't leave the system in an intermediate state.** Step 16 (worktree guard) is part of ship's slim-down in Step 2.

**Dependency ordering within Phase A**:
1. Step 1 first (shared references) — other steps reference these
2. Steps 2 + 16 together (ship slim-down + worktree guard)
3. Step 3 (plan-to-prd merge)
4. Step 4 last (boundary clarity — references the new ship and execute-prd)

After Phase A: Run inter-phase consistency check — load ship/SKILL.md, execute-prd/SKILL.md, and orchestrator.md; verify every referenced skill/agent/standard exists at the referenced path. Also: `grep -r "engineering-lead\|old-phase-name\|ship/SKILL.md Phase [0-9]" .pi/`.

### Phase B: Process Improvements (Steps 5-8, 10-13)
Template/trigger simplifications and new patterns. Mostly independent of each other, but Step 10 depends on Phase A (references slimmed ship):
- Steps 5-7: Post-mortem, patterns, collaboration trigger (independent)
- Step 8: Audit pre-flight (independent)
- Step 10: Complexity routing (depends on Phase A)
- Step 11: Merge eng-lead into orchestrator (independent, but update all references atomically)
- Step 12: Structured signals (independent)
- Step 13: Recon phase (independent)

After Phase B: Run inter-phase consistency check (same as Phase A). Plus: `grep -r "engineering-lead" .pi/` returns 0. `grep -r "token estimate" .pi/skills/execute-prd/` returns 0.

### Phase C: Agent Experience (Steps 14-15)
Working memory and ship meta-orchestrator mode. These build on the foundation from Phase A. **Step 15 (multi-phase) should NOT be implemented in the same session as Step 2 (ship slim-down)** — get single-phase clean first, then add multi-phase.

After Phase C: Run full consistency check. Test multi-phase with a real 2-phase build.

### Phase D: Cleanup (Step 9)
Run collaboration.md synthesis last — captures all process changes from earlier steps.

## Summary: Skill Topology After This Plan

```
/ship (the builder's one command)
├── Pre-flight: worktree guard (Step 16) — never run on main
├── Detect mode: single-phase vs multi-phase (Step 15)
├── Detect complexity: Express / Standard / Full (Step 10)
│
├── Express (1-3 tasks, <=2 files):
│   └── Developer → reviewer code review → commit → done
│
├── Standard single-phase (4-6 tasks):
│   └── Worktree → pre-mortem → /build → wrap → merge
│
├── Full single-phase (7+ tasks):
│   └── Worktree → recon → pre-mortem → review → /build → wrap → merge
│
└── Multi-phase (explicit phases in plan):
    └── Project worktree → meta-orchestrator loop:
        ├── Phase briefing → sub-orchestrator → /build per phase
        ├── Post-work gate per phase → merge to project branch
        └── Final holistic review → wrap → merge to main

/build (execute-prd — the task-level engine)
├── Recon check (Step 13) — phantom task detection
├── Pre-mortem (references shared categories, Step 1)
├── Task loop: developer dispatch → reviewer → iterate
│   ├── Structured signals (Step 12) instead of reflections
│   └── Working memory (Step 14) across tasks
├── Holistic review
└── Memory entry (simplified template, Step 5)

Supporting:
├── /pre-mortem, /review, /wrap — unchanged, referenced by /ship
├── 5 agent roles (Step 11): developer, reviewer, orchestrator, product-manager, gitboss
├── 4 shared references (Step 1): AC rubric, LEARNINGS protocol, subagent dispatch, pre-mortem categories
└── Collaboration: append-only corrections + auto-synthesis after post-mortem (Step 7)
```

## Risks

- **Ship slim-down breaks resume** — Phase 0 build-log management is tightly coupled to ship's phase numbering. Extracting it requires updating phase references.
- **Shared references become stale** — Same risk as any DRY refactor. Mitigated by keeping references short and linking from skills.
- **Agents don't read shared references** — If skills say "see .pi/standards/ac-rubric.md" but agents skip it, quality drops. Mitigate by including the file path in the "Read These Files First" pattern.
- **Multi-phase adds complexity to ship** — Meta-orchestrator mode is another code path in an already-complex skill. Mitigate by keeping ship as a thin router (~300 lines) and delegating all per-phase work to /build.
- **Express track bypasses quality** — Skipping pre-mortem and reviewer pre-work for small changes could let issues through. Mitigate by keeping post-work code review mandatory on all tracks.
- **Role merge loses nuance** — Engineering-lead may have subtle behavioral differences from orchestrator in some contexts. Mitigate by moving the testing red-flags section to orchestrator.md verbatim.
- **Worktree-first changes artifact flow** — Moving worktree creation before pre-mortem/review means those artifacts are created in the worktree, not main. This is actually better (artifacts travel with the branch) but changes the current behavior.
- **Sub-orchestrators without PRDs may lack structure** — Working from phase briefings instead of formal PRDs means less artifact trail. Mitigate by making briefings structured (tasks, ACs, context) and by letting sub-orchestrators create PRDs when they judge the phase is too complex.
