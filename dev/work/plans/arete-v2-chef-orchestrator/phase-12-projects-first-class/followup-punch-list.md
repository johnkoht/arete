# Phase 12 follow-up punch list (dogfooding day 1 — 2026-06-10)

Input for scoping the follow-up phase (Slices D/E + accumulated polish). Source: John's first
live day with /project, project open, backfill-area, and the two mega-project splits.

## Deferred slices (from the amendment)
1. **Slice D — `/update-project` write-back** (AC5 topics-cache + AC7). **Acceptance test fixture
   settled:** meeting transcript says EOY-2026 goal, README says end-of-June → skill must propose
   the correction and touch nothing else (the live June-fixation case, observed + hand-fixed via
   restructure 2026-06-10). Dogfooding gate partially satisfied (splits were driven through the
   new flows).
2. **Slice E — close→frozen retro into area page** (AC8). Note: the visioning-deck finalize during
   the split wrote decisions/learnings to items/ and let `topic refresh` integrate — that pattern
   worked and may inform/simplify AC8.

## Presentation (skill prose, cheap)
3. `/project` agent presentation drops CLI sections it deems secondary — John wants **siblings**
   and **related wiki pages** always shown. One-line prose additions to `project/SKILL.md`.

## Design improvements
4. **Siblings source: derive from shared `area:` membership**, not (only) README `](../slug/)`
   links. The link-graph design predates reliable areas (it was the only signal); post-phase-12
   every active project has `area:`, so same-area-actives is the robust source. Keep link-graph
   as a supplement (cross-area references). Evidence: task-management-v1 has area siblings but no
   sibling section (no README links).
5. **Commitment claim tooling**: "claimed" = commitment record's `projectSlug`, but agents/users
   claim in README prose (a4fdaf7b listed in runyon's tasks yet surfaces to all siblings as
   unclaimed-area). Need a cheap way to stamp `projectSlug` on a commitment (CLI verb or skill
   step in the split/update flows).
6. **`jira:` frontmatter binding** — promote from parking lot: John already hand-maintains the
   exact proposed shape (task-management-v1 carries `jira: {idea: GL-12 …}`). Read-side surfacing
   in the project brief is the cheap first step.

## Formatter polish (one small task)
7. Status field echoes raw `### YYYY-MM-DD` heading from README Status section.
8. Open-work bullets double-nest (`- **I owe (1):**` then `-   - …`).
9. Recent-activity summaries show `<!-- merged from … -->` HTML comments instead of content
   (summary extraction should skip comment nodes).

## Watch items (not yet actionable)
10. Morning-of-2026-06-10 `brief --project glance-2-mvp` had NO wiki section at the CLI layer;
    same-day post-index `project open task-management-v1` shows 6 well-ranked pages. Hypothesis:
    qmd index state (refreshed after splits/area-stamps). If a brief silently drops its wiki
    section again, investigate for real.
11. Wiki landing-pads validated: rescue-checklist keeps (`pop-adjuster-workflow`,
    `snapsheet-task-replacement`) re-ranked into the task-management-v1 brief on day 1 —
    the "activity ≠ importance" call was right.
