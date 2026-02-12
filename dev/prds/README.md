# Areté feature PRDs

Index of PRDs for Areté development. Execution is tracked via `dev/autonomous/prd.json` and `dev/MEMORY.md`; completed runs can be archived under `dev/autonomous/archive/`.

## Implemented (executed and complete)

| PRD | Date | Notes |
|-----|------|--------|
| [meeting-propagation](meeting-propagation/README.md) | 2026-02-06 | Template frontmatter, process-meetings skill, internal_email_domain |
| [meeting-intelligence](meeting-intelligence/README.md) | 2026-02-06 | meeting-prep, daily-plan, get_meeting_context |
| [pm-planning-system](pm-planning-system/README.md) | 2026-02-06 | Quarter/week skills, goals/ and now/ |
| [intelligence-and-calendar](intelligence-and-calendar/prd.md) | 2026-02-09 | Search providers, calendar integration |
| [multi-ide-support](multi-ide-support/prd.md) | 2026-02-10 | IDE adapter, Cursor & Claude Code |
| [meeting-agenda-skill](meeting-agenda-skill/README.md) | 2026-02-11 | prepare-meeting-agenda skill, template system |

## Active / vision (not task-executed)

| Item | Status | Notes |
|------|--------|--------|
| [product-os](product-os/README.md) | Active | Vision and spec (vision.md, skill-interface.md); guides architecture, not a single executable PRD |

## Planning docs (not PRD executions)

Plans in `dev/docs/` that are not converted to PRDs or executed via execute-prd:

- `dev/docs/distribution-architecture-plan.md`
- `dev/docs/meetings-feature-plan.md`
- `dev/docs/openclaw-integration-plan.md`

## Not yet executed

There are no feature PRDs in `dev/prds/` that are pending execution; all listed PRDs above have been executed (see `dev/MEMORY.md` and `dev/entries/` for learnings).

To run a new PRD: create the PRD under `dev/prds/{name}/`, run prd-to-json to produce `dev/autonomous/prd.json`, then use the execute-prd skill or the PRD’s EXECUTE.md handoff.
