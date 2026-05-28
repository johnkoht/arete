---
title: "Phase 3.5 follow-up 5 — Wiki source discoverability"
slug: phase-3-5-followup-5-wiki-discoverability
created: "2026-05-27"
revised: "2026-05-28"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
---

# Phase 3.5 follow-up 5 — Wiki source discoverability

## Why this exists

The 2026-05-27 user-driven investigation surfaced two compounding bugs and three forward-looking questions (A/B/C). Subagent diagnosis confirmed both bugs have well-defined fix surfaces, and answered A/B/C with code-grounded evidence.

Scoping this as a directory-scoped follow-up (not a new full phase) follows the **`phase-3-5-polish` precedent** — the only prior directory-scoped follow-up under phase 3.5. The four inline-commit followups (`7ca3ea47`, `8c507f7d`, `67e4394f`, `f1aacec5`) are smaller commits without dedicated artifacts. This one is large enough (multi-file code + tests + prose) to warrant the full artifact set.

**One-line goal**: meeting intelligence reliably reaches the topic + area wiki regardless of which chef CLI path extracts it, AND the email-templates orphan class is repairable (not just preventable) via an alias-aware integration loop with concrete user-facing alias suggestions.

## Revisions from review-1 (eng-lead, 2026-05-28)

- **DROPPED AC4 (containment match).** Reviewer flagged that production has legitimate parent/child topic hierarchies (`claim-clear` ⊂ `claim-clear-pause`, `claim-narrative` ⊂ `claim-narrative-{action-plan,cost,disruption,feature-flag}`, etc.). Auto-coerce would silently collapse them. Singular `|canonical|≥2` guard does NOT prevent the over-coerce. Revisit in a future phase if AC3 alone is insufficient.
- **REFRAMED AC5 as a build-time diagnostic step**, not a shippable AC. Reviewer confirmed code reality: `getActiveTopics` doesn't filter by `status`, recency is 90d (not 30d). The premise of "widen the filter" was wrong. Replaced with: confirm whether `email-templates` appears in `renderActiveTopicsAsSlugList` output for a recent meeting extract. Document finding in build-report.
- **AC8 ledger math restated** with explicit substitution argument. Per code re-read: removes are ~56 LOC (not 90 LOC), adds are the unified-writer module + 3 call sites + AC2/AC3 code + AC6 prose. Net is small-positive. Substitution argument: consolidating divergent writer paths is load-bearing for path-3 correctness (closes the regression source); LOC delta is bounded and substitution is essential.
- **Extended AC6 to surface CONCRETE alias candidates.** Reviewer flagged AC2 ships a knob no one turns without UX. Chef must list the actual adjacent slugs in the surfacing prose, not just "slug drift suspected."
- **MC2 precedent citation corrected.** Phase 4 chef-rewrites shipped legacy companions; phase 3.5 prior followups were inline. This phase is prose+code on existing post-MC5 skills, so `git revert` is the correct rollback shape.
- **Added R10 to pre-mortem**: AC1's path-3 unification newly invokes `aliasAndMerge` at extract time. First chef `process-meetings` run after merge could mass-coerce in-flight meetings. Build step adds a shadow-pass to N recent meetings.

## Bugs being fixed

### Bug 1 — Three-way meeting-frontmatter writer divergence

Three code paths emit meeting frontmatter, each writes a different subset:

| Path | `topics:` | counts | Notes |
|---|---|---|---|
| `meeting-apply.ts:281-308` (CLI `arete meeting apply`) | ✓ | ✓ | full write, ~28 LOC |
| `agent.ts:480-510` (backend `/process` route) | ✓ | ✓ | full write, ~28 LOC |
| `meeting.ts:1068-1090` (CLI `arete meeting extract --stage`) | ✗ | ✗ | only `processed_at`, `status`, `staged_item_*`; NO topics or counts |

Phase 2 chef-orchestrator runtime (commit `8a43078f`, 2026-05-04) switched the chef process-meetings flow from `arete meeting apply` (path 1) to `arete meeting extract --stage` (path 3). Path 3 silently omits topics + counts → meetings processed 5/11+ via CLI lose discoverability.

**Visible regression**: 5/11–5/14 + 5/27 meetings have no `topics:`/counts. 5/26 email-templates-weekly has them (web UI path). 5/8 has them (web UI path).

**`area:` field**: ONLY writer is the backend web UI (`workspace.ts:580` via UI body field). CLI/agent extraction does NOT write it. The 5/8 `area: glance-2-mvp` came from a user UI selection. CLI-path meetings post-5/08 inherit nothing — explains why area-memory rollup misses them.

**`projects:` field**: NO code writer exists. The pre-5/08 `projects: [glance-2-mvp, ...]` was a manual user edit (arete-reserv commit `446679e`, 2026-05-27 22:57). Zero consumers across the codebase. Inert metadata.

### Bug 2 — Slug drift orphans the wiki

`email-templates` topic page (canonical slug) has 33+ recent meetings + 9+ slack-digests in body but **zero sources tag the canonical slug** in frontmatter. They tag sub-slugs (`default-email-template`, `snapsheet-import-script`, `rollout-strategy`, `language-preference`, ...).

Contributing causes (refined post-review-1):

1. **`tokenizeSlug` has no stemming.** `template` vs `templates` are distinct tokens. Jaccard `{default, email, template}` vs `{email, templates}` = 0.25 — well below 0.67 `COERCE_THRESHOLD`. Singularizing tokens of length ≥4 (drop trailing `s`, EXCEPT when preceded by `s` to preserve `-ss` endings like `process`/`address`/`business`/`status` after token-length check) brings Jaccard to 0.67 → coerce.
2. **`aliases:` field is wired in `bestAliasMatch` (extraction time) but NOT in the integration loop** at `topic-memory.ts:1133-1135` (exact-string match on `targetSlug`). So even if a user adds `aliases:` to a topic page, existing meetings already tagged with the alias-slug never re-integrate.
3. **(diagnostic only — verified during build per AC5)** Active-topic bias list reaches the prompt, but may not include `email-templates` if `last_refreshed` is beyond the 90-day recency window. Verify before assuming.

## Questions A/B/C — answers

### A. Do we care about mapping meetings to projects?

**Answer: not in this phase.** Verdict: `fm.projects` is inert metadata today — zero consumers (grep confirmed across `packages/`). No code filters meetings by `fm.projects`. `MeetingContextBundle.projects` is populated from a meeting body `## Project — Source:` section parse, not frontmatter.

If we want this later, the right design is a meeting-prep / week-plan consumer that filters via `fm.projects`. Until that consumer exists, the field is dead weight.

**Action**: drop manual `projects:` examples from skill prose (small cleanup). Don't add a writer. Keep the `topic-page.ts` model field in case a consumer arrives.

### B. Should project README have related topics?

**Answer: not in this phase.** Verdict: no precedent. Sampled project READMEs — frontmatter is `{title, status, started, notion}`. No `topics:` field. Topic-page model has `entities.related_topics?: string[]` but no writer.

The chef agent reads project READMEs at the point of need (e.g., `meeting-prep` runs `get_meeting_context` which reads `projects/active/*/README.md`). Explicit cross-references add maintenance burden and risk drift between two truth sources.

**Lean**: agent infers project↔topic linkage at use time. Don't add frontmatter cross-refs.

If a future use case proves valuable, the cleaner shape is a third source class in `discoverTopicSources` that scans project READMEs as topic-page integrators — bigger work, separate phase.

### C. Other wiki power-ups (this phase tackles 1 + 2; defers 3+)

1. **Chef winddown surfaces stale topics with concrete alias candidates** (AC6 — in this phase).
2. **Singularize tokens in `tokenizeSlug`** (AC3 — in this phase).
3. **Containment match in `bestAliasMatch`** — **DEFERRED** per review-1 (would over-coerce production parent/child topics).
4. **Wire project READMEs as a topic-source class** — deferred (Question B's "later" path).
5. **`areas:` plural-array schema migration** for meetings — deferred (consumer-side work in `area-memory.ts`).

## Scope (acceptance criteria)

### AC1 — Unified meeting-frontmatter writer (GATE)

A shared helper `writeMeetingApplyFrontmatter(fm, intelligence, processed, normalizedTopics)` (new export — pick: in `meeting-extraction.ts` OR new `meeting-frontmatter.ts` module; build sub-orch decides based on import-graph cleanliness) writes:
- `fm.topics` (array of slugs, post-alias-coerce)
- `fm.open_action_items` (number)
- `fm.my_commitments` (number)
- `fm.their_commitments` (number)
- `fm.decisions_count` (number)
- `fm.learnings_count` (number)

Called from all three writers:
- `meeting-apply.ts:281-308` (replaces inline write)
- `agent.ts:480-510` (replaces inline write)
- `meeting.ts:1068-1090` (NEW call site — closes the regression)

**Idempotent**: re-running on the same `intelligence` input produces the same output. Test asserts this.

**Removes**: 2 inline write blocks (~28 LOC each = ~56 LOC) → 1 helper + 3 call sites.

### AC2 — Alias-aware integration filter (GATE)

`topic-memory.ts:1133-1135`:

```typescript
// Before:
if (!src.topics.includes(targetSlug)) continue;
// After:
const aliasSet = new Set([targetSlug, ...(page?.frontmatter.aliases ?? [])]);
if (!src.topics.some((t) => aliasSet.has(t))) continue;
```

Running `arete topic refresh email-templates` after adding `aliases: [default-email-template, snapsheet-import-script, rollout-strategy, language-preference, email-template-rollout, pop-email-templates]` to `email-templates.md` frontmatter integrates the orphan sources without re-extraction.

**Test**: a topic page with N aliases and M source files where M/2 tag the canonical slug and M/2 tag an alias must integrate all M.

### AC3 — Singularize-or-stem in `tokenizeSlug` (STRETCH, defer-not-cut)

`topic-memory.ts:105-107`: strip trailing `s` on tokens of length ≥4, EXCEPT when preceded by `s` (preserves `-ss` endings).

**Required test cases** (in `topic-memory.test.ts`):
- `templates` → `template` ✓
- `decisions` → `decision` ✓
- `learnings` → `learning` ✓
- `meetings` → `meeting` ✓
- `process` → `process` (preserved, `-ss` ending) ✓
- `address` → `address` (preserved) ✓
- `business` → `business` (preserved) ✓
- `status` → `status` (preserved, `-us`; test by adding length-4 condition; `status` is 6-char ending in `us` — verify stem doesn't fire) ✓
- `class` → `class` (preserved, `-ss`) ✓
- `news` → `news` (4-char, ends `ws`; verify the rule: strip if preceded-by-NOT-s; `w` is not `s`, so `news` → `new`; this is acceptable since `news` is unlikely to be a real topic-slug token, BUT enumerate as a known edge case and add to test as documenting actual behavior)
- Two-character `vs` literal — should be added to a small stop-word/connector blocklist before tokenization. List: `vs`, `and`, `or`. Update `tokenizeSlug` to filter these.

**Stretch defer-not-cut criteria**: ship if AC1+AC2 land cleanly with no test regressions. Cut to a follow-up commit if it blows out.

### AC4 — DROPPED per review-1

Containment match would over-coerce legitimate parent/child topics. Defer indefinitely; revisit only if AC3 proves insufficient for slug drift cases observed in subsequent soak.

### AC5 — Active-topic bias verification (BUILD-TIME DIAGNOSTIC, not shippable AC)

Build sub-orch runs `arete topic list --active --slugs` (or invokes `renderActiveTopicsAsSlugList(memory.activeTopics)` directly via a small test harness) and checks whether `email-templates` is in the output. Document finding in build-report:
- If `email-templates` IS in bias list → the orphan cause is purely tokenizer + integration-filter (Bug 2 contributing causes 1 + 2). AC2+AC3 are sufficient.
- If NOT → investigate why (recency window, openItems gating, or a separate filter). Surface as a parking-lot item for the next phase. Do NOT widen the filter in this phase without measured evidence.

### AC6 — Chef daily-winddown surfaces stale topics with CONCRETE alias candidates (STRETCH, defer-not-cut)

`packages/runtime/skills/daily-winddown/SKILL.md` — extend Step 1 gather OR add Step 0.7 to call `listTopicMemoryStatus` and surface topics where:
- `stale === true` AND
- ≥3 sources in `resources/meetings/` or `resources/notes/` since `last_refreshed` mention adjacent slugs (token-overlap ≥1 with canonical, post-singularize)

Surface in `## Uncertain` tier with CONCRETE candidate aliases, e.g.:

> **email-templates topic stale (33d, 7 adjacent-slug sources since 4/24).**
> Suspected slug drift. Proposed aliases to add to `email-templates.md`:
> - `default-email-template` (3 sources)
> - `rollout-strategy` (2 sources)
> - `language-preference` (1 source)
> - `pop-email-templates` (1 source)
>
> Add aliases + run `arete topic refresh email-templates`? [skip / accept / list-only]

The chef proposes; user approves. Surfacing prose includes exact bash command to run.

**Cap**: ONE stale-topic surfacing per winddown (the one with highest adjacent-source count). Prevents AC10 ≤15-min target degradation.

**Stretch defer-not-cut criteria**: ship if AC1+AC2 land cleanly. Cut to follow-up if AC3 is also cut.

### AC7 — Tests for all of the above (GATE)

Per-file `tsx --test` (no `npm test` at root). Specifically:
- `topic-memory.test.ts` extended: alias-aware integration filter (AC2) + singularize edge cases (AC3 if shipped).
- Either extend `meeting-apply.test.ts`/`meeting-extraction.test.ts` OR add `meeting-frontmatter.test.ts`: unified writer produces same output across call sites (AC1).
- `chef-orchestrator-skills.test.ts` extended: daily-winddown SKILL.md includes stale-topic surfacing language (AC6 if shipped) — regex on "stale.*topic" + "alias" within an `## Uncertain` block; not exact phrasing.

### AC8 — Discipline ledger (negative-to-small-positive with substitution argument)

Per parent plan AC8: net delta combined ≤0 through completion, OR explicit substitution argument.

Honest accounting (post review-1 correction):

| Item | LOC delta |
|---|---|
| Removes — 2 duplicated inline writers | ~−56 |
| Adds — shared helper module + signature | ~+25 |
| Adds — 3 call sites for shared helper | ~+15 |
| Adds — `aliasSet` filter in integration loop (AC2) | ~+3 |
| Adds — singularize + stop-word filter in tokenizeSlug (AC3, if shipped) | ~+8 |
| Adds — chef prose for stale-topic surface (AC6, if shipped) | ~+25 (markdown) |
| Adds — tests | ~+80 |
| **Net (code only, no tests/prose)** | **~−5 to +5** |
| **Net (with tests + prose)** | **~+100 to +120** |

**Substitution argument**: shared `writeMeetingApplyFrontmatter` helper REPLACES the divergent inline writers — without it, path-3 keeps silently dropping data. The AC2 filter is load-bearing for the alias-as-rescue-path UX promised by AC6. AC3 singularize is mechanical hygiene with bounded LOC impact. Tests are required by parent plan AC9 and not counted against the ledger by convention.

This is consistent with how Phase 2's substitution argument was accepted (skills-local + skill-resolver were load-bearing for chef pattern with safe rollback).

### AC9 — AC10 / AC11 still hold

Daily-winddown median ≤15 min unaffected. AC11 hard stop (>45 min winddown = revert) still applies. AC6 caps surfacing at ONE topic per run; risk of degradation is low.

### AC10 — Rollback path

`git revert <build commit(s)>` reverts code + prose cleanly. Per MC2: prose-only modifications to existing post-MC5 skills require only `git revert`. No `SKILL.legacy.md` needed.

For AC2 (alias-aware filter): if it over-integrates a topic that shouldn't have included alias-tagged sources, the user can remove offending entries from `sources_integrated` and the next refresh re-syncs. Reversible at the data layer.

## Skeptical view (per parent plan principle #9)

See `pre-mortem.md` (10 risks enumerated, including R10 added post review-1 for AC1's alias-coerce side-effect on first chef run).

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch)**: AC1, AC2, AC7 are gates. AC3, AC6 are stretch — defer if scope blows out. AC4 dropped. AC5 demoted to build-time diagnostic.
- **MC2 (per-skill rollback)**: AC6 is prose-only in daily-winddown SKILL.md; rollback via `git revert`. Phase 4 chef-rewrite skills shipped legacy companions; Phase 3.5 prior followups were inline. This phase is prose+code on existing post-MC5 skills, so `git revert` is the correct rollback shape.
- **MC3 (shadow validation)**: AC1's path-3 first-run risk → build sub-orch runs a shadow pass on N=3 recent CLI-extracted meetings, comparing pre/post frontmatter to verify no surprise coerces.
- **MC4 (PATTERNS.md ship first)**: N/A — no new chef pattern.
- **MC5 (legacy interaction)**: N/A — no legacy code touched.

## Build orchestration

Sub-orchestrator runs in a manually-created sub-worktree off the parent branch (per Phase 3 lesson: `Agent` tool's `isolation: "worktree"` doesn't reliably land on the parent v2 branch). Pre-flight check in handoff brief.

Branch name: `worktree-phase-3-5-followup-5-wiki-discoverability`
Worktree path: `.claude/worktrees/phase-3-5-followup-5-wiki-discoverability`

Per-task commits during build. Per-file `tsx --test` (NO `npm test` at root). Dist rebuild before final commit.

Steps (in order):
1. **Pre-flight**: verify base + Phase 3.5 followup-4 commits (`6c8a9992`, `b454c507`, `a1447910`) reachable. Halt if base wrong.
2. **AC5 diagnostic** (do this FIRST, informs whether AC3 is essential): run `arete topic list --active --slugs` in arete-reserv; check email-templates inclusion. Document in build-report.
3. **AC1 build** — shared helper + 3 call sites + idempotency test + AC1 shadow pass (N=3 CLI-extracted meetings pre/post-diff). Commit.
4. **AC2 build** — alias-aware integration filter + test. Commit.
5. **AC3 build** — singularize tokens + stop-word filter + 10+ edge-case tests (mandatory enumeration: `templates`, `decisions`, `learnings`, `meetings`, `process`, `address`, `business`, `status`, `class`, `news`). Commit. (Skip if scope blew on AC1/AC2.)
6. **AC6 build** — chef daily-winddown stale-topic surface prose + chef-orchestrator-skills test. Commit. (Skip if scope blew.)
7. **AC7 full test sweep** — all per-file tests in scope pass.
8. **Rebuild dist**. Commit dist files (per memory `feedback_commit_dist.md`).
9. **Write build-report.md**.

Eng-lead review at the end. Fix-up agent if concerns. Merge to parent worktree.

## Open questions / parking lot

- Post-AC2: user manually adds `aliases:` to `email-templates.md` (and any other slug-drift-affected topic). AC6 chef prose proposes concrete aliases; chef does NOT auto-add to topic frontmatter (proposal only — user runs an `arete topic add-aliases <slug> <alias1> <alias2>...` CLI verb OR hand-edits).
- A future CLI verb `arete topic add-aliases <slug> <a> <b>` would close the UX loop (chef proposes → user one-command accepts). Defer to next phase or a small follow-up commit.
- Schema migration (`area:` singular → `areas:` plural array on meetings) is deferred. When we do it, `area-memory.ts:919` must read both shapes during the migration window. Slack-digest area data continues to be 100% dropped until then; flag in build-report.
- Project README → topic source class (Question B's "later" path) — defer indefinitely; revisit if a real consumer use case emerges.
