# Execute wiki-leaning-meeting-extraction PRD

## Pi (preferred)

/plan open wiki-leaning-meeting-extraction
/build

## Manual (fallback)

Load `.pi/skills/execute-prd/SKILL.md`. PRD at `dev/work/plans/wiki-leaning-meeting-extraction/prd.md`, tasks at `dev/work/plans/wiki-leaning-meeting-extraction/prd.json`.

## Pre-flight notes

- Working in worktree at `.claude/worktrees/wiki-leaning-extraction` on branch `worktree-wiki-leaning-extraction`
- Pre-mortem already complete: `pre-mortem.md` (9 risks)
- Plan review already complete: `review.md` (verdict: Approve pending pre-mortem)
- 11 tasks across 5 phases with explicit `dependsOn` in prd.json
- Three commits planned along Thread A/B/C boundaries (Decision #4 in plan)
- Task 11 is the merge gate — do not skip the 5-meeting A/B validation
