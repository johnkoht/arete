# Audit Skill PRD

**Feature**: documentation-audit
**Branch**: feature/documentation-audit
**Created**: 2026-03-28

---

## Goal

Create a `/audit` skill that orchestrates domain-expert subagents to audit and fix project documentation. Each expert owns their domain end-to-end: audit, fix (with approval gates for structural changes), and report. The skill enables systematic documentation maintenance that can be run periodically.

---

## Memory Context

From Phase 2.1 synthesis:

1. **Embed pre-mortem mitigations in subagent prompts** — Include mitigations directly in task prompts
2. **Invest upfront in complete skill documentation** — Well-documented skill files reduce iteration
3. **Use /wrap for verification, don't duplicate** — Invoke existing commands rather than reimplementing
4. **Interactive prompts for action items** — Approval gate should use clear interactive options
5. **Profile injection follows execute-prd pattern** — Use `developer` agent with expertise profile injected

---

## Pre-Mortem Mitigations (Apply to Tasks)

| Risk | Mitigation |
|------|------------|
| Skill pattern inconsistency | Read execute-prd/ship SKILL.md before writing; match frontmatter schema |
| Subagent context gaps | Include explicit "Read first" file lists in orchestrator.md |
| Conflicting capabilities.json edits | Experts report proposals; orchestrator owns all edits |
| AGENTS.md registration | Build skills auto-discovered; verify with skill routing |
| manifest.yaml drift | Use glob patterns; skill flags mismatches |
| Report aggregation | Define required report schema with exact section headers |
| No expert agent definitions | Use developer agent with profile injection |
| Validation expense | Add --dry-run flag for safe validation |

---

## Tasks

### Task 1: Create Skill Scaffold

**Description**: Create the main skill file with triggers, description, tool references, and workflow overview.

**Files**:
- `.pi/skills/audit/SKILL.md`

**Acceptance Criteria**:
- [ ] Frontmatter matches existing skills: `name`, `description`, `category: build`, `work_type: development`
- [ ] Triggers defined: `/audit`, `/audit --scope <domain>`, `/audit --dry-run`
- [ ] Tool Reference section documents `subagent` usage with profile injection pattern
- [ ] Workflow overview shows: load skill → spawn experts → collect reports → approval gate → apply fixes → report
- [ ] `--dry-run` behavior documented: runs full audit and generates reports but suppresses all auto-fixes; reports still written; proposed changes shown but not applied
- [ ] References orchestrator.md for domain dispatch details

**Pre-mortem mitigations**: Before writing, read `.pi/skills/execute-prd/SKILL.md` and `.pi/skills/ship/SKILL.md` for pattern reference.

---

### Task 2: Create Orchestrator

**Description**: Create the orchestrator file with domain dispatch logic, expert report schema, approval gate UX, and report aggregation.

**Files**:
- `.pi/skills/audit/orchestrator.md`

**Acceptance Criteria**:
- [ ] Domain expert dispatch section with task prompts for each domain (core, cli, runtime, build, docs)
- [ ] Each expert prompt includes "Read first" file list (per Risk 2 mitigation)
- [ ] Expert report schema defined with required sections:
  - `# Audit: {domain}`
  - `## Findings` (with ✅/⚠️/❌ status)
  - `## Auto-Fixed`
  - `## Proposed Changes (require approval)` with JSON snippets
- [ ] Approval gate UX defined:
  - Options: `[Y] Apply all`, `[N] Skip all`, `[#] Select items`
  - Skipped items saved to `dev/work/audits/{date}-deferred.md`
- [ ] Report aggregation logic: read /tmp/audit-{domain}.md files, merge into single report
- [ ] Cross-cutting checks owned by orchestrator: AGENTS.md consistency, memory/MEMORY.md index accuracy
- [ ] Single-point edit rule: "Experts do NOT edit capabilities.json directly; orchestrator merges all proposals"
- [ ] Domain boundary enforcement: "Before auto-fixing, verify file is exclusively within your domain"

**Pre-mortem mitigations**: Include complete file lists for each expert. Document capabilities.json merge process.

---

### Task 3: Create Documentation Manifest

**Description**: Create the manifest file that defines what to audit, organized by domain with glob patterns for flexibility.

**Files**:
- `.pi/skills/audit/manifest.yaml`

**Acceptance Criteria**:
- [ ] YAML structure with domains as top-level keys
- [ ] Each domain specifies:
  - `files`: List of explicit file paths or glob patterns
  - `expertise_profile`: Path to profile (or null)
  - `auto_fix`: List of file types/categories for auto-fix
  - `require_approval`: List of file types/categories requiring approval
- [ ] Includes all domains: core, cli, runtime, build, docs
- [ ] Uses glob patterns where possible (e.g., `packages/core/src/**/LEARNINGS.md`)
- [ ] Includes `last_verified` timestamp field
- [ ] Includes auto-discover entries: "Check packages/*/README.md exists"

**Domain assignments**:
- core: packages/core/src/{services,integrations,adapters,search}/, capabilities.json (services/integrations)
- cli: packages/cli/, capabilities.json (commands), README.md commands section
- runtime: packages/runtime/, GUIDE.md, UPDATES.md
- build: .pi/{skills,extensions,standards,expertise,agents}/, memory/
- docs: README.md, SETUP.md, DEVELOPER.md, AGENTS.md, ONBOARDING.md

---

### Task 4: Create Report Template

**Description**: Create the report template used by the orchestrator to generate the final audit report.

**Files**:
- `.pi/skills/audit/templates/audit-report.md`

**Acceptance Criteria**:
- [ ] Template structure with sections for each domain
- [ ] Summary section with counts: total files audited, issues found, auto-fixed, deferred
- [ ] Per-domain sections with findings and actions taken
- [ ] Capabilities.json changes section (if any)
- [ ] Deferred items section (items requiring follow-up)
- [ ] Timestamp and next audit recommendation

---

### Task 5: Verify Skill Discovery

**Description**: Verify the skill is discoverable via Pi's skill routing and add capability entry.

**Files**:
- `dev/catalog/capabilities.json` (update)

**Acceptance Criteria**:
- [ ] Skill appears in `<available_skills>` block when pi loads (build skills in `.pi/skills/` are auto-discovered)
- [ ] Verify with: check skill description appears in pi's skill list
- [ ] Capability entry added to `dev/catalog/capabilities.json` with:
  - `type: skill`
  - `owner: build`
  - `status: active`
  - `entrypoints: ["/audit", "/audit --scope", "/audit --dry-run"]`
  - `implementationPaths: [".pi/skills/audit/SKILL.md", ".pi/skills/audit/orchestrator.md"]`

---

### Task 6: Validate with Single Domain (Dry Run)

**Description**: Validate the skill works by running a single-domain audit in dry-run mode.

**Acceptance Criteria**:
- [ ] Run `/audit --scope cli --dry-run`
- [ ] Skill loads and parses scope correctly
- [ ] Expert is spawned with correct prompt including file list
- [ ] Expert produces report in correct format
- [ ] No files are modified (dry-run enforcement)
- [ ] Report is written to `/tmp/audit-cli.md`
- [ ] Any issues found during validation are fixed

---

### Task 7: Full Orchestration Test (Dry Run)

**Description**: Validate full orchestration with all 5 domains in dry-run mode.

**Acceptance Criteria**:
- [ ] Run `/audit --dry-run`
- [ ] All 5 experts spawn (parallel or sequential per orchestrator design)
- [ ] All 5 reports collected
- [ ] Report aggregation works correctly
- [ ] Approval gate shows proposed changes (no input needed in dry-run)
- [ ] Final report written to `dev/work/audits/{date}.md`
- [ ] Execution completes without errors

---

### Task 8: Apply Validation Fixes

**Description**: Fix any issues discovered during validation runs (Tasks 6-7).

**Acceptance Criteria**:
- [ ] All issues from Tasks 6-7 are resolved
- [ ] Re-run validation if significant changes made
- [ ] Skill is production-ready
- [ ] Run `npm run typecheck` passes
- [ ] Run `npm test` passes (if any tests added)

---

## Out of Scope

- Broken external link detection (future enhancement)
- Package-level README creation (flag only, don't create)
- Test doc creation (MANUAL-SMOKE.md, TEST-SCENARIOS.md — flag only)

---

## Dependencies

- `subagent` tool for dispatching domain experts
- Existing expertise profiles: `.pi/expertise/{core,cli}/PROFILE.md`
- Existing `developer` agent: `.pi/agents/developer.md`

---

## Success Criteria

- `/audit` runs full documentation audit via orchestrator + subagents
- `/audit --scope <domain>` runs single-domain audit
- `/audit --dry-run` reports findings without making changes
- Auto-fixes applied for safe changes (LEARNINGS.md gaps, minor doc updates)
- Structural changes (capabilities.json, profiles) require approval
- Final report written to `dev/work/audits/{date}.md`
