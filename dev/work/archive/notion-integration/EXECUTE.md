# Execute notion-integration PRD

## Pre-Work (must complete before execution)

1. **SDK vs. fetch decision**: Run `npm pack --dry-run` on `@notionhq/client`. If < 5 deps and < 500KB, use SDK. Otherwise, thin fetch wrapper. Document the decision.
2. **Real API fixtures**: Capture 2-3 real Notion page responses and commit to `packages/core/test/integrations/notion/fixtures/`.

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open notion-integration
/build
```

## Manual (fallback)

Execute the notion-integration PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/notion-integration/prd.md` and the task list is at `dev/work/plans/notion-integration/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.
