# Ship Report Template

Use this template to generate the final ship report after successful completion.

---

```markdown
# 🚢 Ship Complete: {slug}

**Started**: {startedAt}
**Completed**: {completedAt}
**Duration**: {duration}

---

## Summary

| Metric | Value |
|--------|-------|
| Phases Completed | {completedPhases}/5 |
| Tasks Executed | {tasksCompleted}/{tasksTotal} |
| Quality Gates | ✓ All passed |
| Gate Pauses | {pauseCount} ({pauseDetails}) |
| Commits | {commitCount} |

---

## Phases Completed

### Phase 1: Pre-Build ✓
- Plan saved: `{planPath}`
- Pre-mortem: `{premortermPath}` — {riskSummary}
- Review: `{reviewPath}` — {reviewSummary}
- **Gate**: {premortermGate}, {reviewGate}

### Phase 2: Memory & PRD ✓
- Memory synthesis: {memorySynthesisBullets}
- PRD created: `{prdPath}`
- Artifacts committed: `{artifactCommitSha}`

### Phase 3: Worktree Setup ✓
- Worktree: `{worktreePath}`
- Branch: `{branchName}`

### Phase 4: Build ✓
- Tasks: {tasksCompleted}/{tasksTotal} complete
- First-attempt success: {successRate}%
- Tests added: {testsAdded}
- **Gate**: Build — {buildGate}
- **Gate**: Final Review — {finalReviewGate}

### Phase 5: Wrap ✓
- Memory entry: `{memoryEntryPath}`
- LEARNINGS.md: {learningsUpdated}
- Implementation committed: `{implCommitSha}`
- /wrap verification: {wrapVerificationStatus}

---

## Artifacts Created

| Artifact | Path |
|----------|------|
| Plan | `{planPath}` |
| Pre-mortem | `{premortermPath}` |
| Review | `{reviewPath}` |
| PRD | `{prdPath}` |
| prd.json | `{prdJsonPath}` |
| Execution state | `{executionStatePath}` |
| Memory entry | `{memoryEntryPath}` |

---

## Branch & PR

**Branch**: `{branchName}`
**Worktree**: `{worktreePath}`
**Commits**: {commitCount}

**Next Steps**:
Ready to merge? The skill will prompt you to:
1. Merge to main (handles conflicts if any)
2. Cleanup worktree and branch automatically

Or if you prefer manual merge later:
- Create PR: `gh pr create --title "{prTitle}" --body "{prBody}"`
- After merge: `/ship cleanup {slug}`

---

## Gate Decisions

| Gate | Outcome | Details |
|------|---------|---------|
| Pre-mortem | {premortermGate} | {premortermDetails} |
| Review | {reviewGate} | {reviewDetails} |
| Build | {buildGate} | {buildDetails} |
| Final Review | {finalReviewGate} | {finalReviewDetails} |

{#if pauseCount > 0}
### Pauses

{pauseDetails}
{/if}

---

## Key Learnings

{learningsList}

---

## Recommendations

- **Continue**: {continueList}
- **Stop**: {stopList}
- **Start**: {startList}
```

---

## Field Definitions

| Field | Source | Example |
|-------|--------|---------|
| `slug` | Plan slug | `ship-it` |
| `startedAt` | Orchestrator state | `2026-03-11T10:30:00Z` |
| `completedAt` | Current time | `2026-03-11T12:45:00Z` |
| `duration` | Calculated | `2h 15m` |
| `completedPhases` | Phase count | `5` |
| `tasksCompleted` | prd.json status count | `8` |
| `tasksTotal` | prd.json task count | `8` |
| `pauseCount` | Gate pause count | `0` |
| `pauseDetails` | Gate pause reasons | `None` or `Pre-mortem: 1 CRITICAL risk` |
| `commitCount` | Git log count | `3` |
| `planPath` | File path | `dev/work/plans/ship-it/plan.md` |
| `premortermPath` | File path | `dev/work/plans/ship-it/pre-mortem.md` |
| `reviewPath` | File path | `dev/work/plans/ship-it/review.md` |
| `prdPath` | File path | `dev/work/plans/ship-it/prd.md` |
| `prdJsonPath` | File path | `dev/work/plans/ship-it/prd.json` |
| `worktreePath` | Absolute path | `/Users/john/code/arete.worktrees/ship-it` |
| `branchName` | Git branch | `feature/ship-it` |
| `memoryEntryPath` | File path | `memory/entries/2026-03-11_ship-it-learnings.md` |
| `executionStatePath` | Directory path | `dev/executions/ship-it/` |
| `artifactCommitSha` | Git SHA (short) | `abc1234` |
| `implCommitSha` | Git SHA (short) | `def5678` |
| `riskSummary` | Risk counts | `0 CRITICAL, 2 HIGH, 3 MEDIUM` |
| `reviewSummary` | Finding summary | `No blockers, 4 suggestions` |
| `memorySynthesisBullets` | Bullet count | `4 insights extracted` |
| `wrapVerificationStatus` | /wrap result | `✓ All checks passed` or `⚠️ 1 warning` |
| `successRate` | Percentage | `87%` |
| `testsAdded` | Test count | `12` |
| `premortermGate` | Gate status | `Passed` or `Paused → Override` |
| `reviewGate` | Gate status | `Passed` |
| `buildGate` | Gate status | `Passed` |
| `finalReviewGate` | Gate status | `Passed` |
| `learningsUpdated` | Update status | `2 files updated` or `No updates needed` |
| `learningsList` | Markdown list | From memory entry |
| `continueList` | Recommendations | From final review |
| `stopList` | Recommendations | From final review |
| `startList` | Recommendations | From final review |
| `prTitle` | PR title | `feat: ship-it skill` |
| `prBody` | PR body | Link to PRD |

---

## Conditional Sections

### If Gate Paused

Include pause details:

```markdown
### Pauses

**Pre-mortem pause** (Phase 1.2):
- Reason: 1 CRITICAL risk — "Worktree creation could fail on Windows"
- Resolution: Builder acknowledged, scoped to macOS-only for V1
- Resumed: 2026-03-11T10:45:00Z
```

### If Tasks Failed Then Recovered

Include recovery details:

```markdown
### Task Recovery

- Task 3 failed typecheck on first attempt
- Issue: Missing import for `SearchProvider`
- Fixed and passed on retry
```

### If Using Single-Agent Fallback

Include warning:

```markdown
> ⚠️ **Executed in single-agent fallback mode** — subagent tool was not available. Quality gates were self-checked rather than independently reviewed.
```
