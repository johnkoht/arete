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
// Dispatch agents for skill work
subagent({ agent: "developer", task: "<prompt>", agentScope: "project" })
subagent({ agent: "reviewer", task: "<prompt>", agentScope: "project" })
subagent({ agent: "engineering-lead", task: "<prompt>", agentScope: "project" })
subagent({ agent: "orchestrator", task: "<prompt>", agentScope: "project" })

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

[PHASE 6] Cleanup (after PR merged)
└── 6.1 Remove Worktree & Branch ← `/ship cleanup <slug>`
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
  agentScope: "project",
  task: `Load and follow the plan-to-prd skill at .pi/skills/plan-to-prd/SKILL.md.

Convert the plan at dev/work/plans/${slug}/plan.md to PRD format.

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

##### 1. Pre-Flight Check Script

```bash
# 1. Check for uncommitted changes
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Uncommitted changes detected. Commit or stash before proceeding."
  exit 1
fi

# 2. Check branch name availability
if git show-ref --verify --quiet "refs/heads/feature/${slug}"; then
  echo "❌ Branch 'feature/${slug}' already exists. Choose a different slug or delete the branch."
  exit 1
fi

# 3. Check parent directory is writable
repo_name=$(basename "$(git rev-parse --show-toplevel)")
parent_dir="../${repo_name}.worktrees"
mkdir -p "${parent_dir}" 2>/dev/null || {
  echo "❌ Cannot create worktree parent directory: ${parent_dir}"
  exit 1
}

echo "✅ Pre-flight checks passed"
```

##### 2. pi-worktrees Configuration

The extension is configured at `~/.pi/agent/pi-worktrees-settings.json`:

```json
{
  "parentDir": "../arete.worktrees",
  "onCreate": "npm install"
}
```

**Template variables available**: `{{path}}`, `{{name}}`, `{{branch}}`, `{{project}}`

##### 3. Create Worktree

Execute via pi slash command (not bash):

```
/worktree create {slug}
```

This command:
1. Creates worktree at `../{repo}.worktrees/{slug}`
2. Creates branch `feature/{slug}` pointing to current HEAD
3. Runs `onCreate` hook (`npm install`) in the new worktree directory

> **Note**: The `onCreate` hook runs asynchronously and failure is non-blocking. Verify completion explicitly.

##### 4. Verify Worktree and Branch

```bash
# Get expected paths
repo_name=$(basename "$(git rev-parse --show-toplevel)")
worktree_path=$(cd .. && pwd)/${repo_name}.worktrees/${slug}
worktree_path_abs=$(cd "${worktree_path}" && pwd)

# Verify worktree exists
if [[ ! -d "${worktree_path}" ]]; then
  echo "❌ Worktree not created at expected path: ${worktree_path}"
  exit 1
fi

# Verify it's a valid git worktree
if ! git -C "${worktree_path}" rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Directory exists but is not a valid git worktree"
  exit 1
fi

# Verify branch exists and is checked out in worktree
current_branch=$(git -C "${worktree_path}" branch --show-current)
if [[ "${current_branch}" != "feature/${slug}" ]]; then
  echo "❌ Expected branch 'feature/${slug}', found '${current_branch}'"
  exit 1
fi

echo "✅ Worktree created at: ${worktree_path_abs}"
echo "✅ Branch: feature/${slug}"
```

##### 5. Verify npm install Completed

```bash
# Check node_modules exists and has content
if [[ ! -d "${worktree_path}/node_modules" ]] || \
   [[ -z "$(ls -A "${worktree_path}/node_modules" 2>/dev/null)" ]]; then
  echo "⚠️  node_modules missing or empty. Running npm install..."
  (cd "${worktree_path}" && npm install)
fi

# Verify package-lock.json is consistent
if ! (cd "${worktree_path}" && npm ls --depth=0 > /dev/null 2>&1); then
  echo "⚠️  Dependency tree inconsistent. Running npm install..."
  (cd "${worktree_path}" && npm install)
fi

echo "✅ Dependencies installed"
```

##### 6. Error Recovery

| Error | Recovery |
|-------|----------|
| Uncommitted changes | Commit or stash changes, then retry |
| Branch already exists | Choose different slug, or `git branch -D feature/{slug}` if safe |
| Parent directory not writable | Check permissions, create manually if needed |
| Worktree creation fails | Check disk space, verify git version >= 2.5, check for existing worktree |
| npm install fails | Run manually in worktree: `cd {path} && npm install` |

**Exit Conditions**:
- Worktree exists at `../{repo}.worktrees/{slug}`
- Branch `feature/{slug}` created
- npm install complete

**Handoff to 3.2**: Worktree absolute path (stored in `$worktree_path_abs`)

---

### Phase 3.2: Launch Terminal

**Entry Conditions**:
- Phase 3.1 complete
- Worktree path known (from `$worktree_path_abs`)

##### 1. Platform Detection

```bash
detect_platform() {
  case "$(uname -s)" in
    Darwin)  echo "macos" ;;
    Linux)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

platform=$(detect_platform)
```

##### Pre-Flight: Permission Check

Before attempting terminal launch on macOS, verify Automation permissions:

```bash
# Check Automation permissions by running benign osascript
if ! osascript -e 'tell application "System Events" to return name of current application' &>/dev/null; then
  echo "⚠️ Automation permissions not granted for Terminal access"
  echo "Grant access in: System Settings > Privacy & Security > Automation"
  # Fall back to manual instructions
fi
```

If the permission check fails, skip directly to the fallback message (Step 6) and provide manual instructions.

##### 2. macOS Terminal Launch (Primary Implementation)

**V1 implements macOS only** per pre-mortem Risk 2 mitigation. Linux/Windows are documented for future implementation.

**iTerm2 (preferred)**:

```bash
launch_iterm() {
  local worktree_path="$1"
  local slug="$2"
  local prd_path="dev/work/plans/${slug}/prd.md"
  
  osascript <<EOF
tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd '${worktree_path}' && clear"
        write text "echo '🚀 Ship It — Worktree Ready'"
        write text "echo 'Branch: feature/${slug}'"
        write text "echo 'PRD: ${prd_path}'"
        write text "echo ''"
        write text "echo 'Starting pi...'"
        write text "pi"
    end tell
end tell
EOF
}
```

**Terminal.app (fallback)**:

```bash
launch_terminal_app() {
  local worktree_path="$1"
  local slug="$2"
  local prd_path="dev/work/plans/${slug}/prd.md"
  
  osascript <<EOF
tell application "Terminal"
    activate
    set newTab to do script "cd '${worktree_path}' && clear && echo '🚀 Ship It — Worktree Ready' && echo 'Branch: feature/${slug}' && echo 'PRD: ${prd_path}' && echo '' && echo 'Starting pi...' && pi"
end tell
EOF
}
```

**macOS Launch Sequence**:

```bash
launch_terminal_macos() {
  local worktree_path="$1"
  local slug="$2"
  
  # Try iTerm first (preferred)
  if osascript -e 'tell application "System Events" to (name of processes) contains "iTerm2"' 2>/dev/null | grep -q "true"; then
    echo "📺 Launching iTerm2..."
    launch_iterm "${worktree_path}" "${slug}" && return 0
  fi
  
  # Check if iTerm is installed but not running
  if [[ -d "/Applications/iTerm.app" ]]; then
    echo "📺 Opening iTerm2..."
    launch_iterm "${worktree_path}" "${slug}" && return 0
  fi
  
  # Fall back to Terminal.app
  echo "📺 Launching Terminal.app..."
  launch_terminal_app "${worktree_path}" "${slug}" && return 0
  
  return 1
}
```

##### 3. Linux Terminal Launch (V2 — Documented Only)

```bash
# gnome-terminal (GNOME/Ubuntu)
gnome-terminal --working-directory="${worktree_path}" -- bash -c "echo 'Ship It — Worktree Ready'; pi; exec bash"

# xterm (fallback)
xterm -e "cd '${worktree_path}' && echo 'Ship It — Worktree Ready' && pi"

# konsole (KDE)
konsole --workdir "${worktree_path}" -e "bash -c 'pi'"
```

##### 4. Windows Terminal Launch (V2 — Documented Only)

```powershell
# Windows Terminal
wt -d "${worktree_path}" pi

# PowerShell fallback
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '${worktree_path}'; pi"
```

##### 5. Launch with Verification

```bash
launch_terminal() {
  local worktree_path="$1"
  local slug="$2"
  local platform=$(detect_platform)
  
  case "${platform}" in
    macos)
      if launch_terminal_macos "${worktree_path}" "${slug}"; then
        # Brief pause to let terminal initialize
        sleep 2
        echo "✅ Terminal launched"
        return 0
      fi
      ;;
    linux)
      echo "⚠️  Linux terminal launch not implemented in V1"
      echo "    See SKILL.md Phase 3.2 § Linux Terminal Launch for manual steps"
      return 1
      ;;
    windows)
      echo "⚠️  Windows terminal launch not implemented in V1"
      echo "    See SKILL.md Phase 3.2 § Windows Terminal Launch for manual steps"
      return 1
      ;;
    *)
      echo "❌ Unknown platform: ${platform}"
      return 1
      ;;
  esac
  
  return 1
}
```

##### 6. Fallback Message

If terminal launch fails, display this message:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  Terminal Launch Failed — Manual Steps Required             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Open a new terminal window                                  │
│                                                                 │
│  2. Navigate to the worktree:                                   │
│     cd {worktree_path}                                          │
│                                                                 │
│  3. Start pi:                                                   │
│     pi                                                          │
│                                                                 │
│  4. Execute the PRD:                                            │
│     Execute the PRD at dev/work/plans/{slug}/prd.md             │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  💡 Or copy-paste this one-liner:                               │
│                                                                 │
│     cd '{worktree_path}' && pi                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

##### 7. Error Recovery

| Error | Recovery |
|-------|----------|
| osascript fails | Check System Preferences > Security > Automation permissions |
| iTerm not found | Install iTerm2 or use Terminal.app fallback |
| Terminal doesn't open | Check if another app is blocking; try manual launch |
| Wrong directory in terminal | Verify `worktree_path` is absolute, not relative |

**Exit Conditions**:
- Terminal window opened in worktree directory
- OR fallback message provided with manual instructions

**Handoff to 3.3**: Terminal launch status (`launched` or `manual`)

---

### Phase 3.3: Start Pi Session

**Entry Conditions**:
- Terminal opened in worktree (Phase 3.2 `launched`)
- OR user has opened terminal manually (Phase 3.2 `manual`)

##### 1. CWD Verification (Run in Worktree Terminal)

Before executing the PRD, verify the pi session is running from the correct directory:

```bash
# This runs in the NEW terminal, not the original session
verify_cwd() {
  local expected_worktree="$1"
  local slug="$2"
  local current_dir=$(pwd)
  
  # Check we're in the worktree
  if [[ "${current_dir}" != "${expected_worktree}" ]]; then
    echo "❌ Wrong directory!"
    echo "   Expected: ${expected_worktree}"
    echo "   Current:  ${current_dir}"
    echo ""
    echo "   Run: cd '${expected_worktree}'"
    return 1
  fi
  
  # Verify this is the worktree (not main repo)
  local git_dir=$(git rev-parse --git-dir 2>/dev/null)
  if [[ "${git_dir}" == ".git" ]]; then
    echo "❌ This appears to be the main repository, not a worktree"
    echo "   Worktrees have .git as a file, not a directory"
    return 1
  fi
  
  # Verify correct branch
  local current_branch=$(git branch --show-current)
  if [[ "${current_branch}" != "feature/${slug}" ]]; then
    echo "⚠️  Unexpected branch: ${current_branch}"
    echo "   Expected: feature/${slug}"
  fi
  
  echo "✅ CWD verified: ${current_dir}"
  echo "✅ Branch: ${current_branch}"
  return 0
}
```

##### 2. Pi Startup Message

When pi starts in the worktree terminal, it should display:

```
🚀 Ship It — Worktree Session

📁 Directory: {worktree_path}
🌿 Branch:    feature/{slug}
📋 PRD:       dev/work/plans/{slug}/prd.md

Ready to execute. Say:
  "Execute the PRD at dev/work/plans/{slug}/prd.md"
```

##### 3. Execute-PRD Invocation

The user (or automated script) says to pi:

```
Execute the PRD at dev/work/plans/{slug}/prd.md
```

This triggers the `execute-prd` skill which:
1. Reads the PRD and prd.json
2. Spawns the Orchestrator (Sr. Eng Manager) persona
3. Executes tasks sequentially with quality gates
4. Runs the Reviewer (Sr. Engineer) between tasks

##### 4. PRD Path Resolution

```bash
# From within worktree
prd_path="dev/work/plans/${slug}/prd.md"
prd_json="dev/work/plans/${slug}/prd.json"

# Verify PRD files exist
if [[ ! -f "${prd_path}" ]]; then
  echo "❌ PRD not found: ${prd_path}"
  echo "   The PRD should have been committed in Phase 2.3"
  exit 1
fi

if [[ ! -f "${prd_json}" ]]; then
  echo "❌ prd.json not found: ${prd_json}"
  exit 1
fi

echo "✅ PRD ready: ${prd_path}"
```

##### 5. Execution State Setup

The execute-prd skill will create its own execution state at `dev/executions/{slug}/`. This is handled by the execute-prd skill, not Phase 3.

**Exit Conditions**:
- Pi session started in worktree
- CWD verified as worktree directory
- PRD path validated and accessible
- Ready to execute PRD via execute-prd skill

**Handoff to 4.1**: 
- PRD path: `dev/work/plans/{slug}/prd.md`
- Execution state path: `dev/executions/{slug}/`
- Branch: `feature/{slug}`

##### State Handoff (Phase 3 → Phase 4)

When a new pi session starts in the worktree, it needs to know what to execute. Here's what persists and how it transfers:

**What persists on disk**:
- PRD at `dev/work/plans/{slug}/prd.md` — the full PRD with problem statement, tasks, and acceptance criteria
- `dev/work/plans/{slug}/prd.json` — machine-readable task list with dependencies and status
- Execution state at `dev/executions/{slug}/` — progress tracking, created by execute-prd skill

**What the new session needs**:
- Plan slug — to locate artifacts
- PRD path — to read task definitions
- Execution state path — to track/resume progress

**How it's provided**:
The pi startup message in Phase 3.3 includes the exact command to run:
```
Execute the PRD at dev/work/plans/{slug}/prd.md
```

This triggers the execute-prd skill which reads the PRD, creates execution state if needed, and begins task dispatch. All necessary context is on disk — no session state transfer required.

---

## Phase 4: Build

> **Context Switch**: Phases 4-5 run in the worktree terminal, not the original session.

### Phase 4.1: Execute PRD

**Entry Conditions**:
- Pi running in worktree
- PRD available at `dev/work/plans/{slug}/prd.md`
- CWD verified as worktree (not main repo)

**Actions**:

**Step 1: Verify CWD (Risk 7 Mitigation)**

Before executing ANY code, verify you're in the worktree, not the main repo:

```bash
# Get current directory
pwd

# Should output something like:
# /Users/john/code/arete.worktrees/{slug}
# NOT /Users/john/code/arete

# Verify worktree branch
git branch --show-current
# Should be: feature/{slug}
```

⚠️ **If CWD is wrong**: Stop immediately. Do NOT proceed with execute-prd. Report:
> "CWD verification failed. Expected worktree path but found [current path]. Switch to worktree and restart."

**Step 2: Invoke execute-prd**

The execute-prd skill handles the full task execution loop. Invoke it with the plan slug:

```markdown
Load and follow the execute-prd skill (`.pi/skills/execute-prd/SKILL.md`).

**PRD Path**: `dev/work/plans/{slug}/prd.md`
**prd.json Path**: `dev/work/plans/{slug}/prd.json`
**Execution State**: `dev/executions/{slug}/`

Execute all tasks per the PRD. The skill handles:
- Pre-mortem analysis
- Task dispatch to developer subagents
- Reviewer sanity checks and code reviews
- Holistic review after completion
- Progress tracking in execution state
```

The execute-prd skill will:
1. Verify subagent tool availability (pre-flight check)
2. Read and internalize the PRD
3. Run pre-mortem risk analysis
4. Execute each task in dependency order:
   - Craft developer prompt with context
   - Dispatch reviewer for pre-work sanity check
   - Dispatch developer subagent
   - Dispatch reviewer for code review
   - Iterate until approved
5. Update `dev/executions/{slug}/prd.json` after each task
6. Perform holistic review when all tasks complete

**Step 3: Monitor Quality Gates**

During execute-prd, each task must pass quality gates:
- `npm run typecheck` — TypeScript compilation
- `npm test` — All tests pass

If a task fails quality gates after 2 attempts, execute-prd will stop.

**Exit Conditions**:
- All tasks in `prd.json` status: "complete"
- All commits made on feature branch
- Execution state at `dev/executions/{slug}/`

**Gate: Build**

| Condition | Action |
|-----------|--------|
| All tasks pass quality gates | → Proceed to Phase 4.2 |
| Any task fails typecheck/tests after 2 attempts | → **PAUSE** and report |
| Task blocked/needs clarification | → **PAUSE** and report |

**Pause Message Template (Build Failure)**:
```markdown
## ⏸️ Ship Paused — Build Gate

**Reason**: Task {task-id} failed quality gates

**Details**:
- Task: {title}
- Failure: {typecheck/tests}
- Error: {error details}
- Attempts: 2/2

**Options**:
1. **Fix** — Debug the issue and run `/ship resume`
2. **Abort** — Cancel the ship: `git checkout main && rm -rf ../arete.worktrees/{slug}`

**Execution State**: `dev/executions/{slug}/progress.md`
```

**Handoff to 4.2**: Execution summary, task completion status, execute-prd final report

---

### Phase 4.2: Final Review

**Entry Conditions**:
- Phase 4.1 complete (execute-prd finished)
- All tasks in `prd.json` status: "complete"

**Actions**:

**Step 1: Spawn Engineering Lead for Holistic Review**

```typescript
subagent({
  agent: "engineering-lead",
  task: `Holistic review for PRD: {slug}

**PRD**: Read \`dev/work/plans/{slug}/prd.md\` — focus on Problem Statement and Success Criteria
**Execution State**: \`dev/executions/{slug}/\`
**Progress Log**: \`dev/executions/{slug}/progress.md\`

Perform a holistic review:

1. **Problem Satisfaction**: Does the implementation solve the problem statement in the PRD?
2. **Acceptance Criteria**: Are all ACs from each task verified as met?
3. **Integration**: Do the parts work together? Any gaps between tasks?
4. **Edge Cases**: Any obvious edge cases not covered?
5. **Regressions**: Any signs of broken existing functionality?
6. **Code Quality**: Consistent patterns, no obvious duplication?

**Return your verdict in this format:**

## Holistic Review: {slug}

**Verdict**: READY | NEEDS_REWORK

**Problem Satisfaction**: [Does implementation solve the stated problem?]

**Task Verification**:
| Task | AC Met | Notes |
|------|--------|-------|
| {id} | ✓/✗ | [any gaps] |
...

**Integration Assessment**: [How well do parts work together?]

**Issues Found** (if NEEDS_REWORK):
1. [Specific issue with fix recommendation]
2. [Specific issue with fix recommendation]

**Minor Improvements** (not blocking):
- [Optional improvement]

**Recommendation**: [READY: proceed to wrap | NEEDS_REWORK: address issues first]`,
  agentScope: "project"
})
```

**Step 2: Parse Review Verdict**

Parse the engineering lead's response for:
- **Verdict**: READY or NEEDS_REWORK
- **Issues Found**: Specific blockers if NEEDS_REWORK
- **Minor Improvements**: Note for ship report (non-blocking)

**Exit Conditions**:
- Final review complete
- Verdict: READY or NEEDS_REWORK

**Gate: Final Review**

| Condition | Action |
|-----------|--------|
| READY — implementation satisfies PRD | → Proceed to Phase 5.1 |
| NEEDS_REWORK — significant issues | → **PAUSE** and report |
| MINOR_ISSUES — small gaps, not blocking | → **PROCEED** (note in ship report) |

**Pause Message Template (Needs Rework)**:
```markdown
## ⏸️ Ship Paused — Final Review Gate

**Reason**: Engineering lead review found significant issues

**Verdict**: NEEDS_REWORK

**Issues**:
{issues from eng lead review}

**Options**:
1. **Address** — Fix the issues and run `/ship resume`
2. **Override** — Proceed anyway (issues become tech debt)
3. **Abort** — Cancel the ship

**Review Details**: `dev/executions/{slug}/final-review.md`
```

**Handoff to 5.1**: Review verdict, notes, any minor improvements to note in ship report

---

## Phase 5: Wrap & Report

### Phase 5.1: Create Memory Entry

**Entry Conditions**:
- Phase 4.2 complete with READY verdict

**Actions**:

**Step 1: Gather Metrics from Execution**

Collect from `dev/executions/{slug}/`:
- `prd.json` — task count, status distribution
- `progress.md` — iterations, blockers, reflections
- `status.json` — timing, token estimates
- Pre-mortem risks vs outcomes

**Step 2: Create Memory Entry**

Create `memory/entries/YYYY-MM-DD_{slug}-learnings.md`:

```markdown
# {PRD Title} — Learnings

**PRD**: `dev/work/plans/{slug}/prd.md`
**Executed**: {date}
**Duration**: {start to end time}

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | {completed}/{total} |
| First-Attempt Success | {percentage}% |
| Iterations | {count} |
| Tests Added | +{count} |
| Token Usage | ~{estimate} |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| {risk 1} | Yes/No | Yes/No | Yes/Partial/No |
| {risk 2} | Yes/No | Yes/No | Yes/Partial/No |
...

**Surprises** (not in pre-mortem):
- {positive or negative surprise}

## What Worked Well

- {Pattern that worked, be specific}
- {Another pattern}

## What Didn't Work

- {Pattern that caused issues}
- {Approach that needed iteration}

## Subagent Reflections

Synthesized from developer completion reports:
- {Common theme from reflections}
- {Suggestion that appeared multiple times}

## Collaboration Patterns

- {How did builder respond during gates?}
- {Any corrections or preferences noted?}

## Recommendations

**Continue** (patterns to repeat):
- {Pattern 1}
- {Pattern 2}

**Stop** (patterns to avoid):
- {Pattern 1}

**Start** (new practices to adopt):
- {Practice 1}
- {Practice 2}

## Documentation Gaps

- [ ] {File that needs update} — {what to add}

## Refactor Items (if any)

- `dev/work/plans/refactor-{name}/plan.md` — {one-line summary}
```

**Step 3: Update MEMORY.md Index**

Add entry at the TOP of the Index section in `memory/MEMORY.md`:

```markdown
<!-- Add new entries at the top -->
- YYYY-MM-DD: [{slug}-learnings](entries/YYYY-MM-DD_{slug}-learnings.md) — {one-line summary of what was built}. {N}/{N} tasks, {N} iterations, +{N} tests. Key: {one key insight}.
```

**Format Convention**:
- Date prefix with colon
- Link in brackets with relative path
- Em dash (—) before summary
- Summary: what was built, metrics, key insight
- One line only, ~100-150 chars

**Example**:
```markdown
- 2026-03-11: [ship-it-learnings](entries/2026-03-11_ship-it-learnings.md) — Ship skill build/wrap phases. 8/8 tasks, 0 iterations, +24 tests. Key: CWD verification before execute-prd essential.
```

**Exit Conditions**:
- Memory entry created at `memory/entries/YYYY-MM-DD_{slug}-learnings.md`
- MEMORY.md index updated with new line at top

**Handoff to 5.2**: Entry path, execution summary

---

### Phase 5.2: Update LEARNINGS.md

**Entry Conditions**:
- Phase 5.1 complete
- Execution state with progress and reflections

**Actions**:

**Step 1: Identify Gotchas from Build**

Scan these sources for gotchas, invariants, and patterns:

1. **Developer Reflections** (`dev/executions/{slug}/progress.md`):
   - Did any task require iteration? Why?
   - Did developers report unexpected complexity?
   - Were there "This was harder because..." notes?

2. **Reviewer Feedback** (from execute-prd logs):
   - Were there ITERATE cycles? What was caught?
   - Any patterns of issues across tasks?

3. **Quality Gate Failures**:
   - Did any task fail typecheck/tests initially?
   - What was the root cause?

4. **Pre-mortem Surprises**:
   - Did risks materialize despite mitigations?
   - Were there issues NOT in the pre-mortem?

**Gotcha Categories to Look For**:
- **Regression fixes** — What broke and why?
- **First use of API/pattern** — Something new to this codebase
- **Non-obvious design decisions** — "We chose X over Y because Z"
- **Invariants discovered** — Constraints that must be preserved

**Step 2: Map Gotchas to Directories**

For each gotcha, identify the nearest appropriate LEARNINGS.md:

```bash
# Find existing LEARNINGS.md files
find packages .pi -name "LEARNINGS.md" -type f

# If no LEARNINGS.md in component dir, create one
```

**Directory Selection**:
- Gotcha about `packages/core/src/services/` → `packages/core/src/services/LEARNINGS.md`
- Gotcha about a skill → `.pi/skills/{skill}/LEARNINGS.md`
- Cross-cutting gotcha → `.pi/standards/LEARNINGS.md` or `packages/core/LEARNINGS.md`

**Step 3: Update LEARNINGS.md Files**

For each LEARNINGS.md to update, add entries following the 7-section template:

```markdown
# {Component Name} — Learnings

## Gotchas

- **{Gotcha title}** ({date}): {What went wrong or could go wrong}. Fix: {How to avoid it}. Source: {PRD name or ticket}.

## Invariants

- **{Invariant}**: {What must always be true}. Violating this causes: {consequence}.

## Pre-Edit Checklist

Before editing files in this directory:
- [ ] {Check item 1}
- [ ] {Check item 2}

## Patterns

- **{Pattern name}**: {Description}. Example: `{file path}`.

## Anti-Patterns

- **{Anti-pattern}**: {What not to do}. Instead: {what to do}.

## Test Considerations

- {Testing notes for this component}

## References

- {Related LEARNINGS.md files}
- {Relevant memory entries}
```

**Step 4: Handle "No New Learnings"**

If no gotchas were discovered:
- Verify by reviewing progress.md one more time
- If genuinely none: Note in ship report: "No new LEARNINGS.md updates — all tasks passed first attempt, no new patterns discovered"

**Exit Conditions**:
- LEARNINGS.md files updated (if applicable)
- OR noted that no new learnings found (and verified)

**Handoff to 5.3**: List of LEARNINGS.md files updated (or "None — verified")

---

### Phase 5.3: Commit Implementation

**Entry Conditions**:
- Phases 5.1-5.2 complete
- Memory entry created
- LEARNINGS.md updated (if applicable)

**Actions**:

**Step 1: Stage All Wrap Artifacts**

```bash
# Stage memory entry
git add memory/entries/YYYY-MM-DD_{slug}-learnings.md

# Stage MEMORY.md index update
git add memory/MEMORY.md

# Stage LEARNINGS.md updates (if any)
git add -A "*.LEARNINGS.md" 2>/dev/null || true

# Stage any execution state updates
git add dev/executions/{slug}/

# Verify what's staged
git status
```

**Step 2: Commit with Standard Message**

```bash
git commit -m "feat: {slug} - implementation

Executed via /ship skill.

Tasks: {N}/{N} complete
Tests: +{N} added
Memory: entries/YYYY-MM-DD_{slug}-learnings.md

PRD: dev/work/plans/{slug}/prd.md"
```

**Commit Message Format**:
- Type: `feat` (new feature from PRD)
- Scope: `{slug}` (matches plan slug)
- Subject: `- implementation`
- Body: execution summary, metrics, PRD reference

**Step 3: Push Branch (Optional)**

```bash
# Push and set upstream
git push -u origin feature/{slug}

# Output shows PR creation URL
```

**Step 4: Record Final State**

```bash
# Get final commit SHA
COMMIT_SHA=$(git rev-parse --short HEAD)
echo "Implementation commit: $COMMIT_SHA"

# Get branch name
BRANCH=$(git branch --show-current)
echo "Branch: $BRANCH"
```

**Exit Conditions**:
- Implementation committed with standard message
- Branch pushed (or ready to push)
- Commit SHA and branch recorded

**Handoff to 5.4**: Final commit SHA, branch name, push status

---

### Phase 5.4: Generate Ship Report

**Entry Conditions**:
- Phase 5.3 complete
- All artifacts created

**Actions**:

**Step 1: Collect All Report Data**

Gather from execution state and artifacts:

```typescript
const reportData = {
  // Identity
  slug: "{slug}",
  startedAt: "{ISO timestamp from ship start}",
  completedAt: "{current ISO timestamp}",
  duration: "{calculated duration}",
  
  // Phases
  completedPhases: 5,
  
  // Tasks (from prd.json)
  tasksCompleted: N,
  tasksTotal: N,
  
  // Quality
  successRate: "{percentage of first-attempt success}",
  testsAdded: N,
  
  // Gates
  pauseCount: N,
  pauseDetails: "{gate names if any paused}",
  gates: {
    premortem: "Passed",
    review: "Passed", 
    build: "Passed",
    finalReview: "Passed"
  },
  
  // Commits
  commitCount: N,
  artifactCommitSha: "{Phase 2.3 commit}",
  implCommitSha: "{Phase 5.3 commit}",
  
  // Artifacts
  planPath: "dev/work/plans/{slug}/plan.md",
  premortermPath: "dev/work/plans/{slug}/pre-mortem.md",
  reviewPath: "dev/work/plans/{slug}/review.md",
  prdPath: "dev/work/plans/{slug}/prd.md",
  prdJsonPath: "dev/work/plans/{slug}/prd.json",
  executionStatePath: "dev/executions/{slug}/",
  memoryEntryPath: "memory/entries/YYYY-MM-DD_{slug}-learnings.md",
  
  // Worktree
  worktreePath: "/path/to/worktree",
  branchName: "feature/{slug}",
  
  // Learnings
  learningsUpdated: "{N files updated}" or "No updates needed",
  learningsList: ["Key learning 1", "Key learning 2"],
  continueList: ["Pattern to continue"],
  stopList: ["Pattern to stop"],
  startList: ["Practice to start"]
}
```

**Step 2: Generate Report from Template**

Use [templates/ship-report.md](./templates/ship-report.md) to generate the final report.

Fill in all template fields from `reportData`. The template includes:
- Summary table with metrics
- Phase-by-phase completion status
- Artifacts table with paths
- Branch and PR information
- Gate decisions table
- Key learnings and recommendations

**Step 3: Present Report**

Present the completed ship report to the builder:

```markdown
# 🚢 Ship Complete: {slug}

**Started**: {startedAt}
**Completed**: {completedAt}  
**Duration**: {duration}

---

## Summary

| Metric | Value |
|--------|-------|
| Phases Completed | 5/5 |
| Tasks Executed | {tasksCompleted}/{tasksTotal} |
| Quality Gates | ✓ All passed |
| Gate Pauses | {pauseCount} |
| Commits | {commitCount} |

---

## Next Steps

1. Review changes in worktree
2. Create PR: `gh pr create --title "feat: {slug}" --body "PRD: dev/work/plans/{slug}/prd.md"`
3. After merge: `/ship cleanup {slug}`

---

*Full report: See [templates/ship-report.md](./templates/ship-report.md) for complete format*
```

**Exit Conditions**:
- Ship report generated
- Report presented to builder
- Skill complete

**Final Output**: Ship report with all metrics, artifacts, and next steps

---

## Recovery

When failures occur, the ship skill is designed for **idempotent recovery**. Each phase can be re-run safely.

### Failure Point Recovery Matrix

| Phase | Failure Point | State After Failure | Recovery Steps |
|-------|--------------|---------------------|----------------|
| 1.1 | Plan save fails | No artifacts | Re-run `/ship` — save is idempotent |
| 1.2 | Pre-mortem errors | Plan saved, no pre-mortem | Re-run pre-mortem skill via subagent |
| 1.3 | Review errors | Plan + pre-mortem exist | Re-run review-plan skill via subagent |
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
| 6.1 | Worktree remove fails | Branch may exist | Check for processes using worktree; `git worktree remove --force` |
| 6.1 | Branch delete fails | Worktree removed | Check if branch checked out elsewhere; `git branch -D` |
| 6.1 | Remote delete fails | Local cleanup done | Check permissions; `git push origin --delete feature/{slug}` |

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

## Phase 6: Cleanup

> **Trigger**: Run `/ship cleanup <slug>` after PR is merged to main.

### Phase 6.1: Remove Worktree & Branch

**Entry Conditions**:
- PR merged to main (normal case), OR
- Builder decides to abandon the branch (force case)

**Actions**:

**Step 1: Check Merge Status**

```bash
check_merge_status() {
  local slug="$1"
  local branch="feature/${slug}"
  
  # Ensure we're on main and have latest
  git fetch origin main
  
  # Check if branch exists
  if ! git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "❌ Branch '${branch}' does not exist"
    return 2
  fi
  
  # Check if branch is merged to main
  # git branch --merged lists branches whose tips are reachable from the specified commit
  if git branch --merged origin/main | grep -q "^\s*${branch}$"; then
    echo "✅ Branch '${branch}' is merged to main"
    return 0
  else
    echo "⚠️  Branch '${branch}' is NOT merged to main"
    return 1
  fi
}
```

**Step 2a: If Merged — Clean Removal**

When the branch is merged, proceed with cleanup without confirmation:

```bash
cleanup_merged() {
  local slug="$1"
  local branch="feature/${slug}"
  
  echo "🧹 Cleaning up merged branch: ${branch}"
  
  # Step 1: Remove worktree (if exists)
  local repo_name=$(basename "$(git rev-parse --show-toplevel)")
  local worktree_path="../${repo_name}.worktrees/${slug}"
  
  if [[ -d "${worktree_path}" ]]; then
    echo "📁 Removing worktree: ${worktree_path}"
    # Use pi-worktrees extension for clean removal
    # /worktree remove {slug}
    # OR manual removal:
    git worktree remove "${worktree_path}" --force
    echo "✅ Worktree removed"
  else
    echo "ℹ️  Worktree already removed (not found at ${worktree_path})"
  fi
  
  # Step 2: Delete local branch
  echo "🌿 Deleting local branch: ${branch}"
  git branch -d "${branch}"
  echo "✅ Local branch deleted"
  
  # Step 3: Delete remote branch (if exists)
  if git ls-remote --heads origin "${branch}" | grep -q "${branch}"; then
    echo "🌐 Deleting remote branch: origin/${branch}"
    git push origin --delete "${branch}"
    echo "✅ Remote branch deleted"
  else
    echo "ℹ️  Remote branch already deleted or never pushed"
  fi
  
  # Step 4: Prune stale worktree refs
  git worktree prune
  
  echo ""
  echo "✅ Cleanup complete for: ${slug}"
}
```

**Step 2b: If Not Merged — Warn and Confirm**

When the branch is NOT merged, show a warning and require explicit confirmation:

```bash
cleanup_unmerged() {
  local slug="$1"
  local branch="feature/${slug}"
  
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────┐"
  echo "│  ⚠️  WARNING: Branch '${branch}' is NOT merged to main         │"
  echo "├─────────────────────────────────────────────────────────────────┤"
  echo "│                                                                 │"
  echo "│  This branch contains unmerged commits that will be LOST.      │"
  echo "│                                                                 │"
  echo "│  Unmerged commits:                                              │"
  git log origin/main..${branch} --oneline | head -10 | while read line; do
    printf "│    • %-57s │\n" "$line"
  done
  echo "│                                                                 │"
  echo "│  Options:                                                       │"
  echo "│    1. Type the branch name to force cleanup (DESTRUCTIVE)       │"
  echo "│    2. Type anything else to cancel                              │"
  echo "│    3. Merge the PR first, then run cleanup again                │"
  echo "│                                                                 │"
  echo "└─────────────────────────────────────────────────────────────────┘"
  echo ""
  
  # In an interactive session, prompt for confirmation with branch name
  read -p "Type branch name to confirm force cleanup (${branch}): " confirmation
  
  if [[ "${confirmation}" == "${branch}" ]]; then
    force_cleanup "${slug}"
  else
    echo "❌ Cleanup cancelled"
    return 1
  fi
}
```

**Step 3: Force Cleanup (Confirmed)**

When user confirms force cleanup of an unmerged branch:

```bash
force_cleanup() {
  local slug="$1"
  local branch="feature/${slug}"
  
  echo "🗑️  Force cleaning unmerged branch: ${branch}"
  
  # Step 1: Remove worktree (force)
  local repo_name=$(basename "$(git rev-parse --show-toplevel)")
  local worktree_path="../${repo_name}.worktrees/${slug}"
  
  if [[ -d "${worktree_path}" ]]; then
    echo "📁 Force removing worktree: ${worktree_path}"
    git worktree remove "${worktree_path}" --force
    echo "✅ Worktree removed"
  fi
  
  # Step 2: Force delete local branch (-D instead of -d)
  echo "🌿 Force deleting local branch: ${branch}"
  git branch -D "${branch}"
  echo "✅ Local branch force deleted"
  
  # Step 3: Delete remote branch (if exists)
  if git ls-remote --heads origin "${branch}" | grep -q "${branch}"; then
    echo "🌐 Deleting remote branch: origin/${branch}"
    git push origin --delete "${branch}"
    echo "✅ Remote branch deleted"
  fi
  
  # Step 4: Prune stale refs
  git worktree prune
  
  echo ""
  echo "✅ Force cleanup complete for: ${slug}"
  echo "⚠️  Unmerged commits have been discarded"
}
```

**Exit Conditions**:
- Worktree directory removed
- Local branch deleted (`-d` for merged, `-D` for force)
- Remote branch deleted (if exists)
- Stale worktree refs pruned

**Command Summary**:

| Command | Description |
|---------|-------------|
| `/ship cleanup <slug>` | Check merge status, clean if merged, warn if not |
| Merged branch | Auto-cleanup: worktree remove + `git branch -d` |
| Unmerged branch | Warning + confirmation required |
| Force cleanup | After confirmation: worktree remove + `git branch -D` |

**Error Recovery**:

| Error | Recovery |
|-------|----------|
| Branch doesn't exist | Nothing to clean — report and exit |
| Worktree doesn't exist | Skip worktree removal, continue with branch deletion |
| Branch delete fails | Check if branch is checked out elsewhere; use `git branch -D` |
| Remote delete fails | May need `git push origin --delete` with force; check permissions |
| Worktree locked | Check for running processes in worktree; `git worktree remove --force` |

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
