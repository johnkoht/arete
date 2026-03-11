---
name: ship
description: Mega-build skill that automates the entire plan-to-PR workflow. After plan approval, say /ship to run pre-mortem, review, memory scan, PRD creation, worktree setup, autonomous build, and final wrap — all with intelligent gates that pause only when human judgment is needed.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# Ship Skill

Automate the complete build workflow from approved plan to PR-ready code. The builder shapes the plan (high-value human time), says `/ship`, and walks away. The system handles mechanical steps autonomously, pausing only at intelligent gates when human judgment is truly needed.

## When to Use

- User says `/ship` after approving a plan in Plan Mode
- User says "ship this plan" or "build this autonomously"
- After plan shaping is complete and ready for execution

## Prerequisites

- Plan exists in current conversation (Plan Mode) or at `dev/work/plans/{slug}/plan.md`
- Working directory is the main repository (not a worktree)
- Git working tree is clean (no uncommitted changes)
- `@zenobius/pi-worktrees` extension installed

## Tool Reference

This skill uses the following tools:

```typescript
// Run existing skills
subagent({ agent: "developer", task: "<prompt>", skill: "run-pre-mortem" })
subagent({ agent: "developer", task: "<prompt>", skill: "review-plan" })
subagent({ agent: "developer", task: "<prompt>", skill: "plan-to-prd" })
subagent({ agent: "developer", task: "<prompt>", skill: "execute-prd" })

// Memory and context
arete memory search "<query>"
arete context --for "<topic>"

// Worktree management (via pi-worktrees extension)
/worktree create <slug>
/worktree remove <slug>

// Git operations
git status, git add, git commit, git branch
```

## Workflow Overview

```
[PHASE 1] Pre-Build (main branch, human can walk away)
├── 1.1 Save Plan
├── 1.2 Run Pre-Mortem → GATE: CRITICAL risks
└── 1.3 Run Cross-Model Review → GATE: Structural blockers

[PHASE 2] Memory & PRD (main branch)
├── 2.1 Memory Review
├── 2.2 Convert to PRD
└── 2.3 Commit Artifacts

[PHASE 3] Worktree Setup
├── 3.1 Create Worktree
├── 3.2 Launch Terminal
└── 3.3 Start Pi Session

[PHASE 4] Build (worktree branch)
├── 4.1 Execute PRD → GATE: Task failures
└── 4.2 Final Review → GATE: Major rework needed

[PHASE 5] Wrap & Report (worktree branch)
├── 5.1 Create Memory Entry
├── 5.2 Update LEARNINGS.md
├── 5.3 Commit Implementation
└── 5.4 Generate Ship Report
```

---

## Phase 1: Pre-Build

### Phase 1.1: Save Plan

**Entry Conditions**:
- Plan approved in current conversation OR plan exists at specified path
- Builder has said `/ship` or equivalent trigger

**Actions**:
1. If plan is in conversation (Plan Mode), save to `dev/work/plans/{slug}/plan.md`
2. Create plan directory if it doesn't exist
3. Derive slug from plan title (kebab-case)

**Exit Conditions**:
- Plan saved at `dev/work/plans/{slug}/plan.md`
- Plan slug determined for subsequent phases

**Handoff to 1.2**: Plan path passed to pre-mortem skill

---

### Phase 1.2: Run Pre-Mortem

**Entry Conditions**:
- Plan saved at known path
- Phase 1.1 complete

**Actions**:
1. Load `run-pre-mortem` skill
2. Execute against saved plan
3. Parse output for risk severities

**Exit Conditions**:
- `pre-mortem.md` created in plan directory
- Risk assessment complete with severity levels

**Gate: Pre-Mortem**

| Condition | Action |
|-----------|--------|
| No CRITICAL risks | → Proceed to Phase 1.3 |
| Any CRITICAL risk | → **PAUSE** and report to builder |

See [orchestrator.md](./orchestrator.md) for gate decision matrix.

**Handoff to 1.3**: Pre-mortem results summary (risk count by severity)

---

### Phase 1.3: Run Cross-Model Review

**Entry Conditions**:
- Pre-mortem complete
- No CRITICAL risks (or builder override)
- Phase 1.2 complete

**Actions**:
1. Load `review-plan` skill
2. Execute cross-model review of plan + pre-mortem
3. Parse output for blockers vs suggestions

**Exit Conditions**:
- `review.md` created in plan directory
- Blocker assessment complete

**Gate: Review**

| Condition | Action |
|-----------|--------|
| No structural blockers | → Proceed to Phase 2.1 |
| Structural blockers found | → **PAUSE** and report to builder |

See [orchestrator.md](./orchestrator.md) for blocker classification.

**Handoff to 2.1**: Review summary (suggestions list, blocker status)

---

## Phase 2: Memory & PRD

### Phase 2.1: Memory Review

**Entry Conditions**:
- Phases 1.1-1.3 complete
- Gates passed (or builder override)

**Actions**:
1. Search `memory/entries/` for entries from last 14 days
2. Search for entries matching plan keywords
3. Check LEARNINGS.md in directories plan touches
4. Review `memory/collaboration.md` for builder preferences
5. Synthesize into 3-5 bullet insights

#### Implementation Details

##### 1. Recent Entries (14-Day Filter)

Entry filenames follow `YYYY-MM-DD_slug.md` format. Calculate recency:

```bash
# List entries from last 14 days
cutoff=$(date -v-14d +%Y-%m-%d 2>/dev/null || date -d "14 days ago" +%Y-%m-%d)
ls memory/entries/ | while read f; do
  entry_date="${f:0:10}"  # Extract YYYY-MM-DD
  [[ "$entry_date" > "$cutoff" || "$entry_date" == "$cutoff" ]] && echo "$f"
done
```

For each recent entry, extract:
- **Title** (first `# ` heading)
- **Status** (Complete/In Progress)
- **Key learnings** (from "What Worked Well", "What Didn't Work Well", "Recommendations" sections)

##### 2. Keyword Search (Plan-Relevant Entries)

Extract keywords from the plan:
- **Section headings**: Lines starting with `#` or `##`
- **Package references**: `packages/{name}` or `@arete/{name}` patterns
- **Component names**: PascalCase terms (e.g., `CommitmentsService`, `ReviewItems`)
- **File paths**: Paths mentioned in plan (e.g., `.pi/skills/`, `src/services/`)

Search entries using `grep -l`:

```bash
# Cap at 5 most relevant matches (per pre-mortem mitigation)
grep -l -i "keyword1\|keyword2\|keyword3" memory/entries/*.md | head -5
```

For matched entries (even if outside 14-day window), extract the same sections as recent entries.

##### 3. LEARNINGS.md Identification

Map plan content to directories:
- Parse **file paths** mentioned in plan → extract parent directories
- Parse **package references** (`packages/core`, `packages/cli`, etc.) → map to known LEARNINGS.md locations
- Check for **skill references** (`.pi/skills/{name}`) → check for LEARNINGS.md in skill directory

Known LEARNINGS.md locations (from AGENTS.md `[Memory]` section):
```
.pi/extensions/plan-mode/LEARNINGS.md
.pi/skills/execute-prd/LEARNINGS.md
.pi/skills/LEARNINGS.md
packages/core/src/search/LEARNINGS.md
packages/core/src/services/LEARNINGS.md
packages/core/src/integrations/LEARNINGS.md
packages/core/src/adapters/LEARNINGS.md
packages/cli/src/commands/LEARNINGS.md
packages/runtime/rules/LEARNINGS.md
packages/runtime/skills/LEARNINGS.md
packages/runtime/tools/LEARNINGS.md
packages/apps/backend/LEARNINGS.md
packages/apps/web/LEARNINGS.md
```

For each matched LEARNINGS.md, extract:
- **Gotchas**: Common pitfalls to avoid
- **Invariants**: Rules that must be maintained
- **Pre-Edit Checklist**: Steps required before changes

##### 4. Collaboration Profile Extraction

From `memory/collaboration.md`, extract:
- **Working Patterns**: How to collaborate effectively
- **Process Preferences**: Workflow expectations
- **Corrections**: Past mistakes to avoid (CRITICAL — these are explicit "don't repeat this")
- **Design Philosophy**: Architectural preferences

Focus on entries most relevant to the plan's scope (e.g., if plan touches CLI, prioritize CLI-related preferences).

##### 5. Synthesis Format

Produce **exactly 3-5 bullets** (per pre-mortem mitigation — avoid noise). Each bullet must be:
- **Actionable**: States what to DO or AVOID, not just what happened
- **Sourced**: References the entry/file it came from
- **Relevant**: Directly applies to the current plan

**Output Format**:

```markdown
## Memory Synthesis

**Recent Context** (last 14 days):
- [Entry title](entries/YYYY-MM-DD_slug.md): Key insight relevant to this work

**Past Learnings**:
- [LEARNINGS.md location]: Gotcha or invariant that applies

**Builder Preferences**:
- From collaboration.md: Specific preference that affects this work

**Risks to Avoid**:
- From corrections/entries: Past mistake not to repeat
```

**Example Synthesis**:

```markdown
## Memory Synthesis

1. **Use Jaccard similarity for dedup** — Reusable pattern from `meeting-extraction.ts`; don't reinvent. (Source: 2026-03-09_intelligence-tuning-learnings.md)

2. **Backend has separate extraction flow** — `agent.ts` has its own schema/prompt distinct from core; check both when changing extraction. (Source: intelligence-tuning-learnings, LEARNINGS.md)

3. **Builder prefers fast models for structured tasks** — Use cheaper model tier for subagents when tasks are well-defined. (Source: collaboration.md → Working Patterns)

4. **Pre-work sanity checks are mandatory** — Reviewer must verify task clarity before developer starts. (Source: multiple entries, 100% effectiveness rate)

5. **Don't put backlog items in entries** — Entries = what happened; backlog = future work → `dev/work/backlog/`. (Source: collaboration.md → Corrections)
```

**Exit Conditions**:
- Memory synthesis complete (3-5 bullets)
- Synthesis stored for PRD handoff

**Handoff to 2.2**: Memory synthesis bullets to inform PRD context

---

### Phase 2.2: Convert to PRD

**Entry Conditions**:
- Phase 2.1 complete
- Memory synthesis available (3-5 bullets from Phase 2.1)

**Actions**:
1. Load `plan-to-prd` skill
2. Include memory synthesis in context
3. Generate `prd.md` and `prd.json`
4. Validate `prd.json` against schema

#### Implementation Details

##### 1. Invoke plan-to-prd with Memory Context

When invoking the skill, include memory synthesis in the task prompt:

```typescript
subagent({
  agent: "developer",
  skill: "plan-to-prd",
  task: `Convert the plan at dev/work/plans/${slug}/plan.md to PRD format.

## Memory Context (from Phase 2.1)
${memorySynthesis}

## Instructions
- Use memory insights to inform task acceptance criteria
- Reference relevant LEARNINGS.md gotchas in task descriptions
- Apply builder preferences from collaboration.md
- Ensure tasks avoid documented anti-patterns from corrections

Output prd.md and prd.json to dev/work/plans/${slug}/`
})
```

##### 2. prd.json Validation

After generation, validate the JSON against the schema. The schema is at `dev/autonomous/schema.ts` and provides `validatePRD()`:

```bash
# Quick structural validation (orchestrator can run)
node -e "
const prd = JSON.parse(require('fs').readFileSync('dev/work/plans/${slug}/prd.json', 'utf-8'));

const errors = [];

// Required fields
if (!prd.name) errors.push('Missing: name');
if (!prd.branchName) errors.push('Missing: branchName');
if (!prd.goal) errors.push('Missing: goal');
if (!prd.userStories?.length) errors.push('Missing: userStories (need at least 1)');

// Task validation
prd.userStories?.forEach((task, i) => {
  if (!task.id) errors.push(\`Task \${i}: missing id\`);
  if (!task.title) errors.push(\`Task \${i}: missing title\`);
  if (!task.acceptanceCriteria?.length) errors.push(\`Task \${i}: missing acceptance criteria\`);
  if (task.status !== 'pending') errors.push(\`Task \${i}: status should be 'pending'\`);
});

// Metadata validation
if (prd.metadata?.totalTasks !== prd.userStories?.length) {
  errors.push(\`metadata.totalTasks (\${prd.metadata?.totalTasks}) != actual (\${prd.userStories?.length})\`);
}

if (errors.length > 0) {
  console.error('❌ Validation failed:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  console.log('✅ prd.json validation passed');
  console.log(\`   - \${prd.userStories.length} tasks\`);
  console.log(\`   - Branch: \${prd.branchName}\`);
}
"
```

##### 3. Error Handling

| Error | Recovery |
|-------|----------|
| plan-to-prd skill fails | Log error, retry once. If retry fails, pause and report to builder. |
| prd.md not created | Check skill output for errors. Common: plan structure unclear → ask builder to clarify. |
| prd.json validation fails | Report specific validation errors. Fix in-place if obvious (e.g., missing status field). |
| prd.json not created | prd-to-json step may have failed. Check if prd.md exists and re-run prd-to-json. |

##### 4. Idempotent Behavior (Safe to Re-run)

- **If prd.md exists**: Skip regeneration unless `--force` flag
- **If prd.json exists**: Skip regeneration unless `--force` flag
- **If validation fails**: Always regenerate (existing artifacts are incomplete)
- **Re-run detection**: Check file timestamps vs plan.md mtime

```bash
# Check if PRD is newer than plan (no regeneration needed)
plan_mtime=$(stat -f %m "dev/work/plans/${slug}/plan.md" 2>/dev/null || stat -c %Y "dev/work/plans/${slug}/plan.md")
prd_mtime=$(stat -f %m "dev/work/plans/${slug}/prd.md" 2>/dev/null || stat -c %Y "dev/work/plans/${slug}/prd.md")

if [[ -f "dev/work/plans/${slug}/prd.md" && "$prd_mtime" -ge "$plan_mtime" ]]; then
  echo "ℹ️ prd.md is up-to-date (skip regeneration)"
else
  echo "📝 Generating prd.md..."
fi
```

**Exit Conditions**:
- `prd.md` created in plan directory
- `prd.json` created and passes validation
- Memory insights incorporated into task descriptions/criteria

**Handoff to 2.3**: Artifact paths for commit, validation status

---

### Phase 2.3: Commit Artifacts

**Entry Conditions**:
- Phase 2.2 complete
- prd.json validation passed
- All plan artifacts exist

**Actions**:
1. Pre-flight artifact check
2. Stage artifacts with `git add`
3. Commit with conventional message
4. Record commit SHA

#### Implementation Details

##### 1. Pre-Flight Artifact Check

Before committing, verify all required artifacts exist:

```bash
slug="your-plan-slug"
plan_dir="dev/work/plans/${slug}"

required_files=(
  "${plan_dir}/plan.md"
  "${plan_dir}/pre-mortem.md"
  "${plan_dir}/review.md"
  "${plan_dir}/prd.md"
  "${plan_dir}/prd.json"
)

missing=()
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    missing+=("$f")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "❌ Missing artifacts:"
  printf "   - %s\n" "${missing[@]}"
  exit 1
else
  echo "✅ All artifacts present"
fi
```

##### 2. Git Add with Verification

```bash
# Stage the plan directory
git add "dev/work/plans/${slug}/"

# Verify files are staged
staged=$(git diff --cached --name-only | grep "^dev/work/plans/${slug}/" | wc -l)
if [[ $staged -eq 0 ]]; then
  echo "⚠️ No files staged — artifacts may already be committed"
  # Check if already committed (idempotent)
  if git log -1 --oneline --grep="plan: ${slug}" > /dev/null 2>&1; then
    echo "ℹ️ Plan already committed (idempotent: skip)"
    exit 0
  else
    echo "❌ No files to commit and no previous commit found"
    exit 1
  fi
fi
echo "✅ Staged ${staged} files"
```

##### 3. Commit with Error Handling

```bash
# Commit with conventional message
commit_msg="plan: ${slug} - PRD and artifacts"

if git commit -m "$commit_msg"; then
  commit_sha=$(git rev-parse HEAD)
  echo "✅ Committed: ${commit_sha:0:7}"
  echo "   Message: $commit_msg"
else
  # Check if nothing to commit (already clean)
  if git diff --cached --quiet; then
    echo "ℹ️ Nothing to commit — working tree clean"
    # Retrieve existing commit SHA if already committed
    existing_sha=$(git log -1 --format="%H" --grep="plan: ${slug}")
    if [[ -n "$existing_sha" ]]; then
      commit_sha="$existing_sha"
      echo "   Using existing commit: ${commit_sha:0:7}"
    fi
  else
    echo "❌ Commit failed unexpectedly"
    exit 1
  fi
fi
```

##### 4. Record Commit SHA

Store the commit SHA for handoff to Phase 3:

```bash
# Export for subsequent phases
echo "$commit_sha" > "dev/work/plans/${slug}/.commit-sha"

# Or store in execution state
echo "plan_commit_sha=${commit_sha}" >> "dev/executions/${slug}/state.env"
```

##### 5. Idempotent Behavior (Safe to Re-run)

| Scenario | Behavior |
|----------|----------|
| Artifacts not yet committed | Normal commit flow |
| Artifacts already committed (no changes) | Skip commit, retrieve existing SHA |
| Artifacts modified since last commit | Commit with same message (creates new SHA) |
| Partial commit (some files missing) | Fail pre-flight check, report missing files |

```bash
# Idempotent commit check
if git diff --quiet "dev/work/plans/${slug}/" && \
   git diff --cached --quiet "dev/work/plans/${slug}/"; then
  # Check if files are tracked and committed
  if git ls-files --error-unmatch "dev/work/plans/${slug}/prd.json" > /dev/null 2>&1; then
    echo "ℹ️ All artifacts already committed (no changes)"
    commit_sha=$(git log -1 --format="%H" -- "dev/work/plans/${slug}/")
  else
    echo "❌ Files exist but are not tracked by git"
    exit 1
  fi
fi
```

##### 6. Error Recovery

| Error | Recovery |
|-------|----------|
| Pre-flight check fails | Report missing artifacts. Return to Phase 2.2 if prd.md/prd.json missing; return to Phase 1.2/1.3 if pre-mortem/review missing. |
| `git add` fails | Check file permissions. Ensure plan directory is inside repo. |
| `git commit` fails | Check for git hooks that may block. Ensure valid git state (not mid-merge/rebase). |
| Commit SHA retrieval fails | Use `git rev-parse HEAD` after successful commit. |

**Exit Conditions**:
- All artifacts committed (plan.md, pre-mortem.md, review.md, prd.md, prd.json)
- Commit SHA recorded and available for handoff
- No uncommitted changes in plan directory

**Handoff to 3.1**: Plan slug and commit SHA (stored in `.commit-sha` or `state.env`)

---

## Phase 3: Worktree Setup

### Phase 3.1: Create Worktree

**Entry Conditions**:
- Phase 2.3 complete
- Git working tree clean
- pi-worktrees extension available

**Pre-Flight Checks**:
1. Verify no uncommitted changes: `git status --porcelain`
2. Verify branch name available: `git branch --list feature/{slug}`
3. Verify parent directory writable

**Actions**:
1. Execute `/worktree create {slug}`
2. Wait for onCreate hook (npm install)
3. Verify worktree created at expected path

**Exit Conditions**:
- Worktree exists at `../{repo}.worktrees/{slug}`
- Branch `feature/{slug}` created
- npm install complete

**Handoff to 3.2**: Worktree absolute path

---

### Phase 3.2: Launch Terminal

**Entry Conditions**:
- Phase 3.1 complete
- Worktree path known

**Actions**:
1. Detect platform (macOS/Linux/Windows)
2. Execute platform-appropriate terminal command:
   - macOS: `osascript` → iTerm or Terminal.app
   - Linux: `gnome-terminal` or `xterm`
   - Windows: `wt` (Windows Terminal)
3. Verify terminal opened (best effort)

**Exit Conditions**:
- Terminal window opened in worktree directory
- OR fallback message provided if launch failed

**Fallback**: If terminal launch fails, print:
> Terminal launch failed. Please manually:
> 1. Open a terminal
> 2. `cd {worktree-path}`
> 3. Run `pi`
> 4. Say: `Execute the PRD at dev/work/plans/{slug}/prd.md`

**Handoff to 3.3**: Terminal status (launched or manual instructions)

---

### Phase 3.3: Start Pi Session

**Entry Conditions**:
- Terminal opened in worktree (Phase 3.2)

**Actions**:
1. Start pi in terminal
2. Provide execute-prd invocation command

**Exit Conditions**:
- Pi session started in worktree
- Ready to execute PRD

**Handoff to 4.1**: PRD path, execution context

---

## Phase 4: Build

> **Context Switch**: Phases 4-5 run in the worktree terminal, not the original session.

### Phase 4.1: Execute PRD

**Entry Conditions**:
- Pi running in worktree
- PRD available at `dev/work/plans/{slug}/prd.md`
- CWD verified as worktree (not main repo)

**Actions**:
1. Verify CWD: `pwd` should match worktree path
2. Load `execute-prd` skill
3. Execute all tasks per PRD

**Exit Conditions**:
- All tasks in `prd.json` status: "complete"
- All commits made on feature branch
- Execution state at `dev/executions/{slug}/`

**Gate: Build**

| Condition | Action |
|-----------|--------|
| All tasks pass quality gates | → Proceed to Phase 4.2 |
| Any task fails typecheck/tests | → **PAUSE** and report |
| Task blocked/needs clarification | → **PAUSE** and report |

**Handoff to 4.2**: Execution summary, task completion status

---

### Phase 4.2: Final Review

**Entry Conditions**:
- Phase 4.1 complete
- All tasks passed

**Actions**:
1. Spawn engineering lead for holistic review
2. Review: Does implementation satisfy PRD problem statement?
3. Review: Any gaps, edge cases, or integration issues?
4. Assess: Ready to merge or needs rework?

**Exit Conditions**:
- Final review complete
- Verdict: READY or NEEDS_REWORK

**Gate: Final Review**

| Condition | Action |
|-----------|--------|
| READY - implementation satisfies PRD | → Proceed to Phase 5.1 |
| NEEDS_REWORK - significant issues | → **PAUSE** and report |

**Handoff to 5.1**: Review verdict and notes

---

## Phase 5: Wrap & Report

### Phase 5.1: Create Memory Entry

**Entry Conditions**:
- Phase 4.2 complete with READY verdict

**Actions**:
1. Create `memory/entries/YYYY-MM-DD_{slug}-learnings.md`
2. Include: metrics, pre-mortem analysis, learnings, recommendations
3. Update `memory/MEMORY.md` index

**Exit Conditions**:
- Memory entry created
- MEMORY.md index updated

**Handoff to 5.2**: Entry path

---

### Phase 5.2: Update LEARNINGS.md

**Entry Conditions**:
- Phase 5.1 complete
- Gotchas or invariants discovered during build

**Actions**:
1. Identify directories with new gotchas from build
2. Create or update LEARNINGS.md files
3. Add gotchas, invariants, or pre-edit checklist items

**Exit Conditions**:
- LEARNINGS.md files updated (if applicable)
- OR noted that no new learnings found

**Handoff to 5.3**: Files updated list

---

### Phase 5.3: Commit Implementation

**Entry Conditions**:
- Phases 5.1-5.2 complete

**Actions**:
1. `git add -A`
2. `git commit -m "feat: {slug} - implementation"`
3. Optionally push branch: `git push -u origin feature/{slug}`

**Exit Conditions**:
- Implementation committed
- Branch ready for PR

**Handoff to 5.4**: Final commit SHA, branch name

---

### Phase 5.4: Generate Ship Report

**Entry Conditions**:
- Phase 5.3 complete

**Actions**:
1. Generate report using [templates/ship-report.md](./templates/ship-report.md)
2. Include: phases completed, time, artifacts, branch/PR info

**Exit Conditions**:
- Ship report presented to builder
- Skill complete

**Final Output**: Ship report (see template)

---

## Recovery

When failures occur, the ship skill is designed for **idempotent recovery**. Each phase can be re-run safely.

### Failure Point Recovery Matrix

| Phase | Failure Point | State After Failure | Recovery Steps |
|-------|--------------|---------------------|----------------|
| 1.1 | Plan save fails | No artifacts | Re-run `/ship` — save is idempotent |
| 1.2 | Pre-mortem errors | Plan saved, no pre-mortem | Re-run pre-mortem: `subagent skill:run-pre-mortem` |
| 1.3 | Review errors | Plan + pre-mortem exist | Re-run review: `subagent skill:review-plan` |
| **1.2/1.3** | **GATE PAUSE** | All artifacts present | **Address concerns, then `/ship resume`** |
| 2.1 | Memory search fails | Pre-build complete | Re-run `/ship` from phase 2 (graceful: proceed without memory) |
| 2.2 | PRD creation fails | Memory synthesis done | Re-run plan-to-prd skill manually |
| 2.3 | Commit fails | PRD exists uncommitted | Manual: `git add && git commit` |
| 3.1 | Worktree creation fails | Artifacts committed | Check git state, retry `/worktree create` |
| 3.2 | Terminal launch fails | Worktree exists | **Graceful fallback**: manual terminal instructions |
| 3.3 | Pi start fails | Terminal open | Manual: run `pi` in terminal |
| **4.1** | **Task fails quality gates** | Partial build | **Resume via execute-prd** (existing recovery) |
| **4.2** | **Final review: NEEDS_REWORK** | Build complete | **Address feedback, re-run final review** |
| 5.1 | Memory entry fails | Build complete | Manual: create entry following template |
| 5.2 | LEARNINGS update fails | Entry created | Manual: update LEARNINGS.md files |
| 5.3 | Commit fails | Wrap complete | Manual: `git add -A && git commit` |
| 5.4 | Report generation fails | Everything committed | Manual: review `dev/executions/{slug}/` |

### Resume Command (V2)

Future enhancement: `/ship resume {slug}` to resume from last successful phase.

For V1, recovery is manual:
1. Check `dev/work/plans/{slug}/` for existing artifacts
2. Check `dev/executions/{slug}/` for build state
3. Re-run from appropriate phase

### Gate Pause Recovery

When a gate pauses execution:

1. **Pre-mortem gate (CRITICAL risk)**:
   - Read the CRITICAL risk in `pre-mortem.md`
   - Either: address the risk and modify the plan, OR provide justification to proceed
   - Resume: Orchestrator re-evaluates and continues

2. **Review gate (structural blocker)**:
   - Read blockers in `review.md`
   - Either: address blockers in plan/PRD, OR acknowledge and justify proceeding
   - Resume: Orchestrator re-evaluates and continues

3. **Build gate (task failure)**:
   - Check `dev/executions/{slug}/progress.md` for failure details
   - Fix the issue (code, tests, or acceptance criteria)
   - Resume: execute-prd continues from failed task

4. **Final review gate (needs rework)**:
   - Read eng lead feedback
   - Address significant issues
   - Resume: Re-run final review phase

---

## Cleanup Command

After PR is merged, clean up the worktree:

```
/ship cleanup {slug}
```

**Actions**:
1. Check if `feature/{slug}` is merged to main
2. If merged: Remove worktree, delete branch
3. If not merged: Warn and require confirmation

---

## Success Criteria

- [ ] Builder can say `/ship` after plan approval and walk away
- [ ] System pauses only at gates when human judgment needed
- [ ] All 5 phases complete successfully
- [ ] Final output is branch ready for PR
- [ ] Ship report summarizes the build

---

## References

- **Orchestrator behavior**: [orchestrator.md](./orchestrator.md)
- **Report template**: [templates/ship-report.md](./templates/ship-report.md)
- **Chained skills**: run-pre-mortem, review-plan, plan-to-prd, execute-prd
- **Extension**: @zenobius/pi-worktrees
