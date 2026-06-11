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

## Data-model gap (confirmed 2026-06-10, John's catch)
12. **Meetings never get `area:` frontmatter — nothing writes it.** Verified: zero `area:` keys in
    recent meeting files; `MeetingIndexEntry.area` reads `fm.area` (brief-assemblers.ts:1783) which
    is always absent. Area-scoped meeting retrieval works ONLY via the W6 topics-union fallback
    (`meetingsForArea`, :242): a meeting matches an area iff the area slug appears in its `topics:`
    list — i.e. meeting→area mapping is de-facto delegated to the wiki extractor's topic tagging.
    Two weaknesses: (a) only works where a same-named topic page exists and gets tagged (works for
    glance-2-mvp / glance-communications; will NOT work for pm-operations-style areas without a
    twin topic page); (b) topic-mention ≠ area-belonging — tangential meetings leak into area
    recent-activity (BISR updates / claim-review-template under glance-2-mvp). Fix shape: propose
    area at `meeting process/approve` time (suggestAreaForMeeting exists, Phase 8 f8) + a meeting
    `backfill-area` mirroring the project one; then `meetingsForArea` prefers `area:`, topics stay
    the fallback. Candidate for the follow-up phase — it makes area a real first-class edge on all
    three entities (projects ✅, commitments ✅, meetings ❌).

## Routing / discoverability (confirmed 2026-06-10 evening, John's catch)
13. **"load project X" doesn't trigger `/project`** — the skill's trigger list (`open project`,
    `work on project`, `pull up project`, …) misses "load/review/look at"; the agent freestyled
    with manual file reads and missed the assembled surface (1 of 4 siblings, 0 wiki pages, no
    what's-new). Cheap fix: broaden triggers → folded into phase-13 AC6. Deeper pattern to watch:
    skill value is gated on invocation phrasing (same family as the forgotten `synthesize`);
    collect further routing misses during dogfooding as evidence for intent-routing work.

## Watch items (not yet actionable)
10. Morning-of-2026-06-10 `brief --project glance-2-mvp` had NO wiki section at the CLI layer;
    same-day post-index `project open task-management-v1` shows 6 well-ranked pages. Hypothesis:
    qmd index state (refreshed after splits/area-stamps). If a brief silently drops its wiki
    section again, investigate for real.
11. Wiki landing-pads validated: rescue-checklist keeps (`pop-adjuster-workflow`,
    `snapsheet-task-replacement`) re-ranked into the task-management-v1 brief on day 1 —
    the "activity ≠ importance" call was right.

## Soak findings — 2026-06-11 (meeting backfill preview + hotfix scope-outs)
14. **MANIFEST.md appears as a backfill candidate** — the meeting-area candidate filter should skip
    non-meeting files in resources/meetings/. Cosmetic, one-line filter.
15. **Recurring-title signal needs recency-bounding** — `john-lindsay-11` series proposed
    `reserv-onboarding` at confidence 1 for JUNE meetings because the series was born in the
    onboarding era; the 1:1's content moved on (June = Glance 2.0 roadmap). Series identity ≠
    current content. Candidate fix: window the recurring-title evidence (e.g. last N occurrences'
    area evidence, not all-time) or decay confidence with drift in the also-via-topics arm.
    Live evidence: 2026-06-03-john-lindsay-11 carries also-via-topics glance-2-mvp — the two arms
    disagree and the topics arm is right.
16. **Dedup should re-point task `@from` refs to the surviving sibling** — hotfix 2026-06-11
    scope-out; without it, dropping a dupe orphans the task's commitment link (and the text-hash
    task-ID collision means mirror tasks can share IDs). Pairs with #5 claim tooling.
17. **/update-project soak runs have no automatic record** — proposals live only in the session;
    applied edits visible as workspace git diffs. If manual paste-back proves annoying, add a
    one-line append to an .arete/ soak log in the skill prose. Optional.
