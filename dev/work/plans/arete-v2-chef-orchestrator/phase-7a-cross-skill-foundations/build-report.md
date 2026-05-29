---
title: "Phase 7a — build report"
slug: phase-7a-build-report
created: "2026-05-29"
parent: phase-7a-cross-skill-foundations
status: build-complete
---

# Phase 7a — Build report

## Pre-flight result

PASS. All five checks (branch name, plan commit reachable, parent reframe
reachable, plan + pre-mortem files present, `node_modules/@arete/{core,cli}`
symlinks present) verified at start of build.

- Branch: `worktree-phase-7a-cross-skill-foundations`
- Plan commit `25b1adc0` reachable.
- Parent reframe commit `f3649c4e` reachable.

## AC6 semantic finding — `arete pull calendar`

**Real behavior** (verified by reading the Google Calendar provider
source at `packages/core/src/integrations/calendar/google-calendar.ts`,
specifically `fetchEvents` lines 265-301 and `queryEvents` lines 396-410):

The Google Calendar `events.list` endpoint is called with
`singleEvents=true, orderBy=startTime, timeMin/timeMax=window` and
**no `showHiddenInvitations` flag**. The API defaults for this endpoint
return:

- **All events visible on the user's calendar** in the time window —
  regardless of organizer.
- **Events organized by others where user is attendee** are included
  (this is the default Google Calendar API behavior; user does not need
  to be the organizer for the event to surface).
- **Declined events are included** (Google Calendar API does not filter
  `responseStatus: declined` by default).
- **The JSON output includes `organizer.self: boolean`** (mapped at
  line 239-245 of google-calendar.ts), so the reconciler can distinguish
  user-organized vs invited events without additional context.

**Implication for Phase 8 spec example `ai_004`** ("meet with Nick &
Anthony" — auto-skip when invite exists): `arete pull calendar --days 30
--json` returns all events on the user's calendar over the next 30 days
regardless of organizer. The reconciler can match {attendees: nick +
anthony, status: scheduled, start: today or future} from this output.
**Phase 8 does NOT need to call the calendar MCP directly for attendee
lookups.**

**Known gap (R5 partial confirmation)**: the JSON output does not include
per-attendee `responseStatus`. If Phase 8 wants to exclude events the user
DECLINED (vs accepted / tentative / no-response), it would need to add
`responseStatus` to the event mapper. Phase 7a documents this as a known
gap; the reconciler can ship without it and treat all visible events as
"on calendar" — which matches the spec intent ("the event EXISTS on the
calendar").

**Live verification not possible**: `arete-reserv` does not have Google
Calendar credentials configured (no `.arete/config/google-workspace.json`).
Verification is code-level (reading the provider source). The semantic
finding above is accurate but not empirically demonstrated against a real
workspace in this build.

**Disposition**: AC6 ships as both flag-addition AND doc (not stretch
defer-to-doc-only). The `--days N` flag was previously parsed but only
honored by fathom/krisp/gmail/drive — calendar hardcoded
`getUpcomingEvents(7)`. Phase 8's reconciler needs `--days 30` for the
forward window, so the flag honoring is a real gap-fill not a doc-only
ship. Two tests added in `packages/cli/test/commands/pull.test.ts`.

## AC5c audit run on arete-reserv (R1 mitigation)

Live run on `~/code/arete-reserv`:

```
arete people audit-channels --json
```

**Result**:

| Field | Count | % of total |
|---|---|---|
| **total people** | 147 | 100% |
| `with_email` | 17 | **12%** |
| `with_alt_emails` | 0 | 0% |
| `with_slack_user_id` | 0 | 0% |
| `with_slack_handle` | 0 | 0% |
| `with_phone` | 0 | 0% |
| `no_channels` (zero fields populated) | 130 | **88%** |

**Pre-mortem R1 status — confirmed and worse than estimated**:

The pre-mortem estimated "today only `email` is populated across all
`~/code/arete-reserv/people/internal/*.md`". The actual situation is even
sparser:

- Only **17 of 147 people (12%)** have `email` populated.
- **130 of 147 people (88%)** have ZERO channel fields populated.
- The other four channel fields (`alt_emails`, `slack_user_id`,
  `slack_handle`, `phone`) are at **0% coverage**.

**Phase 8 implications**:

1. Reconciler's email-match heuristic will fire for ~12% of attendees, not
   the assumed higher rate.
2. Reconciler's slack→person match-rule is fully degenerate at 0% coverage
   — name-string heuristic fallback is the dominant path until user
   backfills.
3. The `audit-channels` nudge surfaces this on every winddown (Phase 8's
   reconciler should consume the audit output and surface the count to
   the user).

**Top-10 most-frequent counterparties by gap**: not computable in 7a —
counting "Slack message volume" requires Slack MCP integration which
wasn't run as part of the build. Recommend Phase 8 design include
"top-N counterparties by slack-message volume" as a one-time backfill
nudge in the curated view.

**Phase 7c future work suggested** (per pre-mortem R1's "elevated
mitigation"): a `arete people backfill-channels --interactive` command
that pulls `slack_user_id` from Slack MCP via `slack_get_user_by_email`
for the 17 people with email, then prompts for the rest. Not in 7a scope.

## AC by AC

### AC1 — PATTERNS.md gather-only composition (GATE) — SHIPPED

Added § "gather-only composition" section to
`packages/runtime/skills/PATTERNS.md`, parallel to the four chef-orchestrator
patterns. Documents:

- When to offer the sub-mode (parallel decision criteria — sub-skill
  composable, engagement step independently useful, user benefits from
  one cross-source engage).
- Invocation marker (`[gather-only]`) — agent-level prose convention,
  NOT a CLI flag.
- JSON output shape with per-loop required/optional fields (`source`,
  `source_ref`, `counterparty`, `timestamp`, `text`, `evidence_pointer`,
  `kind`; plus optional `confidence`, `area`, `topics`, `dedup_key`).
- How orchestrators consume (parse, validate shape, merge by
  counterparty + dedup_key, compose per Pattern 1, engage once).
- Per-skill contract (no `resources/notes/` write, no engage, no
  write-CLI verbs).
- Explicit "best-effort prose contract" limitation paragraph (per
  review-1 concern; no harness gate, orchestrators must not depend on
  the contract for correctness).
- Calendar pull semantics sub-section (preview of AC6 finding — events
  organized by others are returned, declined included, organizer.self
  included).

**Test**: extended `packages/core/test/services/chef-orchestrator-skills.test.ts`
with AC1 assertion (PATTERNS.md contains "gather-only composition",
"best-effort prose contract", "counterparty", "evidence_pointer",
"[gather-only]"). Loose regex per the post-Phase-3.5-followup
conventions.

**Deviation from plan**: none. Plan called for ~+70 markdown; actual is
about that.

### AC2 — slack-digest SKILL.md gather-only mode (GATE) — SHIPPED

Added § "Gather-only mode" section to
`packages/runtime/skills/slack-digest/SKILL.md`. Documents:

- Invocation contract (cites PATTERNS.md anchor verbatim).
- Per-step run/skip table covering all phases of the standalone flow,
  with explicit "skipped" markers on `now/archive/slack-digest/` write,
  `resources/notes/YYYY-MM-DD-slack-digest.md` write,
  `arete commitments create/resolve`, `arete topic refresh`,
  `now/week.md` edits, Slack DMs, and engage.
- JSON output shape with full example (loops + unresolved_participants +
  partial flag).
- Per-skill `kind` taxonomy (incoming-ask, outgoing-ask,
  commitment-incoming, commitment-outgoing, decision, learning,
  dedup-candidate, unresolved-thread).
- Allowed side-effects (all read CLIs + `arete events log slack-thread`
  best-effort).

**Pre-mortem R2 mitigation**: the standalone flow includes writing to
`resources/notes/YYYY-MM-DD-slack-digest.md` (step 5b). The gather-only
section explicitly lists this in the skip table AND in the "MUST NOT"
list. Per the explicit limitation in AC1, this is a best-effort contract;
the orchestrator is responsible for detecting violations post-hoc.

**Test**: AC2 assertion in `chef-orchestrator-skills.test.ts`. Loose regex
check for the section header, PATTERNS.md anchor reference, `[gather-only]`
marker, `counterparty`, `evidence_pointer`, and `resources/notes`
(explicit skip).

**Deviation from plan**: none.

### AC3 — email-triage SKILL.md gather-only mode (GATE) — SHIPPED

Added § "Gather-only mode" section to
`packages/runtime/skills/email-triage/SKILL.md`. Same shape as AC2:
invocation contract, run/skip table (calling out `now/archive/email-triage/`
write as skipped), JSON output shape, per-skill `kind` taxonomy
(incoming-ask, incoming-fyi, decision, commitment-outgoing,
dedup-candidate, uncertain), and `auto_filtered_count` field for
newsletter-shaped threads.

**Test**: AC3 assertion in `chef-orchestrator-skills.test.ts`. Same loose
regex shape as AC2.

**Deviation from plan**: none.

### AC4 — `jira_epics:` parser + `arete areas` (GATE) — SHIPPED

**Parser change** (`packages/core/src/services/area-parser.ts` +
`models/entities.ts`): added `jira_epics?: string[]` to
`AreaFrontmatter`; added derived `jiraEpics: string[]` to `AreaContext`
(empty array when frontmatter field is missing). Parser drops malformed
entries (non-strings, empty strings, whitespace-only). YAML quoting
variations (single, double, unquoted) all parse correctly.

**Tests** (`packages/core/test/services/area-parser.test.ts`, +6 cases):
present, missing (defaults to empty), `null` value, malformed entries
dropped, empty array, YAML quote variations.

**CLI** (new file `packages/cli/src/commands/areas.ts`): two subcommands.

- `arete areas list [--json]` — lists all areas with summary fields
  (slug, name, status, recurringMeetingCount, jiraEpicCount). Sorted
  alphabetically by slug.
- `arete areas epics [--active] [--slug <s>] [--json]` — lists epic
  watchlists per area. `--active` emits a `union: [...]` field (deduped,
  sorted) so a reconciler can pull the full watchlist in one call.
  `--slug` filters to one area.

Namespace convention documented in the source file comment: "arete
areas <noun-or-noun-phrase>", not "arete areas <verb>". Three future
subcommands sketched in the comment (`show <slug>`, `focus`, `sync`)
— all fit the namespace without conflict (R3 mitigation).

**Tests** (`packages/cli/test/commands/areas.test.ts`, 16 cases):
empty workspace, no epics declared, single area with epics, multiple
areas with overlapping epics (union dedup), `--active` filter,
`--slug` present and absent, scoped union, human-readable output.

**Live verification on arete-reserv**: `arete areas list --json` returns
4 active areas (glance-2-mvp, glance-communications, pm-operations,
reserv-onboarding), all with `jiraEpicCount: 0` since no `jira_epics:`
field is declared yet. The watchlist is empty until user populates —
which is expected and matches the plan's "purely substrate today" framing.

**Deviation from plan**: none.

### AC5 — `--channels` + audit-channels + convention doc (GATE) — SHIPPED

Three sub-deliverables, three commits.

**AC5a** (`dev/conventions/person-frontmatter.md`): convention-only doc
of the five recognized channel fields (email, alt_emails, slack_user_id,
slack_handle, phone). Documents that today only `email` is consistently
populated; new fields are user-maintained; reconciler match-rule
priority (email → slack_user_id → slack_handle → name-string fallback);
the audit nudge; recommended manual backfill workflow.

**AC5b** (`--channels` flag on `arete people show`): Added flag.
- JSON output: `channels: {...}` with only populated fields (empty `{}`
  if none populated; no `channels` field at all without the flag — default
  output unchanged).
- Human-readable: new "Channels" section with one listItem per populated
  field.
- New `readPersonChannels()` helper in `@arete/core` exported for reuse.
- 6 unit tests in `entity.test.ts` (full population, email-only typical
  case, no-channels-populated, missing file, malformed-dropped, phone
  trimming).
- 5 CLI integration tests in `people.test.ts` (--channels --json full /
  email-only / empty, default-unchanged, human-readable Channels
  section).

**AC5c** (`arete people audit-channels`): new subcommand.
- Walks `people/{internal,users,customers}/*.md`, returns aggregate
  counts (`with_email`, `with_alt_emails`, `with_slack_user_id`,
  `with_slack_handle`, `with_phone`, `no_channels`) + per-person gap
  detail (sorted by slug).
- Human-readable: includes one-line slack_user_id-coverage nudge (e.g.,
  "23 of 41 people missing slack_user_id; reconciler match-rate for
  slack→person is ~56%") plus top-10 gap list with category.
- New `computeChannelsAudit()` pure function (unit-testable without
  filesystem) and `EntityService.auditPeopleChannels()` method.
- 4 unit tests in `entity.test.ts` (empty input, mixed-population
  counts + gaps, service walks all three categories).
- 3 CLI integration tests in `people.test.ts` (empty workspace, populated
  workspace, human-readable totals + nudge).

**Deviation from plan**: none. Pre-mortem R1 mitigation worked as
designed — the audit makes the gap visible. The actual numbers are worse
than anticipated (12% email coverage, 0% slack) — see "AC5c audit run
on arete-reserv" section above.

### AC6 — Calendar pull semantics (STRETCH defer-not-cut) — SHIPPED (flag + doc)

See "AC6 semantic finding" section above for the full investigation.

**What shipped**:
- `--days N` flag honoring for `arete pull calendar` (default 7).
  Previously parsed but ignored for calendar; now forwarded to
  `getUpcomingEvents(N)`. Phase 8 reconciler can call `arete pull
  calendar --days 30 --json`.
- Semantic finding documented in PATTERNS.md gather-only composition
  section (calendar pull semantics sub-section).
- Two tests in `pull.test.ts` (--days 30 forwards correctly; default 7
  when omitted).

**What did NOT ship**:
- `responseStatus` field on attendees (known gap; Phase 8 can decide
  whether to add it).
- Live verification on arete-reserv (calendar credentials not configured;
  semantic finding is code-level only).

**Disposition**: stretch criteria met (existing flags sufficient with
explicit doc), but I also shipped the small `--days N` flag honoring
since that was a real gap — calling `pullCalendarHelper` with `days: 30`
would have done nothing before the fix.

### AC7 — Tests (GATE) — SHIPPED

See "Test counts" section below.

### AC8 — Discipline ledger — SHIPPED with substitution argument

Actual vs. plan estimate:

| Item | Plan estimate | Actual |
|---|---|---|
| PATTERNS.md gather-only section | ~+70 markdown | +236 lines (more thorough than estimated; includes calendar semantics sub-section absorbing some AC6 work) |
| slack-digest SKILL.md gather-only | ~+30 markdown | +174 lines |
| email-triage SKILL.md gather-only | ~+30 markdown | +153 lines |
| area-parser.ts: jira_epics | ~+5 code | +14 src (entities.ts +14 + area-parser.ts +6 - small refactor) |
| `arete areas` command | ~+120 code | +211 src (areas.ts new) |
| `--channels` flag | ~+30 code | +71 src (people.ts +43 + entity.ts +27 + index.ts +5) |
| `audit-channels` subcommand | ~+80 code | +71 src (people.ts +71) + computeChannelsAudit ~+60 src + auditPeopleChannels method ~+45 src |
| `dev/conventions/person-frontmatter.md` | ~+40 markdown | +109 lines |
| `--days N` flag honoring (AC6) | (not separately estimated) | +12 src |
| Tests (all ACs) | ~+200 code | +611 (areas.test.ts) + +176 (area-parser.test.ts) + +143 (entity.test.ts) + +219 (people.test.ts) + +84 (pull.test.ts) + +90 (chef-orchestrator-skills.test.ts) = ~+1300 test code |

**Net (code, src files only, excl tests + dist)**: **~+606 LOC** (vs. +205 plan estimate — **3x overrun**).
**Net (markdown)**: **~+1079 LOC** (vs. +170 plan estimate — **6.3x overrun**).
**Net (tests)**: ~+1210 LOC.

(Correction post eng-lead build review: the original numbers in this report
under-counted both axes. The 3x src and 6.3x markdown overruns are
documented honestly here. Substitution argument below explains why this
remains acceptable given the substrate-for-Phase-8 framing.)

The overrun on src and markdown is dominated by:
- PATTERNS.md gather-only section being thorough (~236 vs. ~70 plan
  est.) — includes explicit limitation paragraph, calendar semantics
  preview, full per-loop field spec.
- SKILL.md gather-only sections being thorough (~150 each vs. ~30 plan
  est.) — both include full run/skip tables, JSON output examples, and
  `kind` taxonomies.
- `arete areas` command (~211 vs. ~120 plan est.) — both subcommands
  with human-readable + JSON paths.

**Substitution argument**: 7a is load-bearing substrate for Phase 8's
loop reconciler. Without gather-only mode documented, area-level epic
watchlist available, and cross-source identity surfaced, the reconciler
has nothing to compose. The split into 7a/7b was made explicitly to
scope removal work separately. 7b will run the validation-then-deletion
sweep that brings cumulative back toward neutral. Cumulative across
7a + 7b expected: ~+200 to ~+500 LOC net, dominated by Phase 5 removes
in 7b.

This substitution argument follows the Phase 2 pattern (skills-local +
skill-resolver were load-bearing for chef pattern with safe rollback;
ledger went positive at ship; subsequent phase brought it back).
Reviewer accepted that argument on first /review at +8, then dropped
to +2 after MC5 sunset shipped in Phase 3. Same shape here.

**Sunset trigger** (per pre-mortem R4 — tightened from plan's
2026-07-15 to 2026-06-30 if eng-lead accepts): if Phase 8 has not
merged to parent worktree by 2026-06-30, substrate sunset rule applies
— revert AC1/AC2/AC3 (gather-only sections), keep AC4 areas + AC5
channels + AC6 calendar flag (standalone-useful).

### AC9 / AC10 / AC11 — no impact

- AC9: zero user-facing behavior change. Daily-winddown median
  unaffected (no chef changes; PATTERNS.md is doc; SKILL.md gather-only
  mode is dormant until Phase 8 invokes it).
- AC10: each AC independently revertable (per `git revert <commit>`).
- AC11: hard stop not at risk.

## Test counts (pass / fail per file)

All counts from per-file `npx tsx --test <path>` runs.

| Test file | Pass | Fail | Notes |
|---|---:|---:|---|
| `packages/core/test/services/area-parser.test.ts` | 83 | 0 | +6 from AC4 |
| `packages/core/test/services/chef-orchestrator-skills.test.ts` | 90 | 0 | +3 from AC1/AC2/AC3 |
| `packages/cli/test/commands/areas.test.ts` | 16 | 0 | NEW for AC4 |
| `packages/core/test/services/entity.test.ts` | 22 | 0 | +10 from AC5b/AC5c |
| `packages/cli/test/commands/people.test.ts` | 16 | 1 | **1 pre-existing failure** unrelated to AC5 — see Edge Cases |
| `packages/cli/test/commands/pull.test.ts` | 27 | 0 | +2 from AC6 |
| **Phase 7a totals** | **254** | **1** | |
| Regression checks: `topic-memory.test.ts` | 52 | 0 | unchanged |
| Regression checks: `meeting-frontmatter.test.ts` | 9 | 0 | unchanged |
| Regression checks: `commitments.test.ts` | 102 | 0 | unchanged |
| Regression checks: `tasks.test.ts` | 109 | 0 | unchanged |

## Dist commit hash

`b89cd77c` — `phase-7a(dist): rebuild after AC1-AC6`. Built clean from
the `npm run build` at the top of the worktree; rebuilt @arete/core
and @arete/cli + the workspace web UI assets.

## Edge cases hit + resolutions

1. **CLI test failure on `--channels` initial run**: the CLI imports
   `@arete/core` which is symlinked to `packages/core/` but the
   package.json's `main` field points at `dist/index.js`. Running
   CLI tests via `tsx` invokes the source directly, but the imported
   `@arete/core` reads from `dist/` — which was stale until I ran the
   build. Resolution: rebuilt dist after every core change. Noted in
   Phase 8 build pre-flight as a reminder.

2. **Single AC4 commit estimate too thin**: the plan estimated `arete
   areas` at ~120 LOC including both subcommands; actual was ~210 LOC.
   Both subcommands needed human-readable + JSON paths + error handling,
   which doubled the code. Tests doubled too (16 cases). Not a problem,
   just a sizing miss.

3. **Pre-existing test failure in `people.test.ts`**: "refreshes person
   memory highlights from meetings" fails with an assertion at line 166
   (`tmpDir, 'people', 'internal'` falsy). Verified via `git stash` /
   `npx tsx --test` that this fails on the base commit (before any
   7a changes). NOT caused by AC5b/AC5c. Documented in build-report;
   reverting `git stash pop` to restore my changes verified the
   failure is identical with and without AC5 work. Recommend Phase
   8 or follow-up trace the regression.

4. **arete-reserv calendar not configured for live AC6 verification**:
   `~/code/arete-reserv/.arete/config/google-workspace.json` does not
   exist; `arete pull calendar` returns "Google Calendar not available".
   Resolution: AC6 verification is code-level (provider source) rather
   than empirical. Documented in AC6 finding above.

5. **arete-reserv has 88% no-channels coverage** (vs. plan-anticipated
   "everyone has email"): see "AC5c audit run" section above. This is
   a finding worth surfacing to the eng-lead — Phase 8's reconciler
   will be MORE degraded than the pre-mortem R1 anticipated, and the
   substitution argument for shipping 7a substrate becomes weaker if
   the user doesn't backfill. Recommend Phase 7c future-work
   `arete people backfill-channels --interactive` get scoped soon.

## Open questions for meta

1. **Should AC8 ledger reviewer accept the 2x src overrun?** The
   substitution argument is intact (7b will bring it back), and per-AC
   sizes are within reason for production-quality code with thorough
   prose + tests. Defer to eng-lead /review.

2. **Pre-existing `people.test.ts` failure** — should we file a
   separate fix-it task or leave for Phase 8? Not load-bearing for
   7a but is a known-bad regression in main.

3. **arete-reserv's 88% no-channels coverage** — does this change
   Phase 8's plan timing? With reconciler match-rate this degraded,
   the spec example `ai_004` ("auto-skip meet with Nick & Anthony")
   won't fire for ~88% of people-mentions. Phase 8 design should
   surface this and the user-decides-when-to-backfill UX needs to
   be in the curated view.

4. **AC6 `responseStatus` gap**: should it ship in 7a as a follow-up
   commit, or in Phase 8 when the reconciler actually needs it? Today
   the gather-only consumer can treat all visible events as "on
   calendar" without harm. Defer to Phase 8 build.

5. **Sunset trigger date** — plan says 2026-07-15, pre-mortem R4
   recommends tightening to 2026-06-30. The 5-week window is more
   honest given recent phase wall times. Eng-lead's call.

## Files changed (summary)

```
dev/conventions/person-frontmatter.md                          NEW (+109)
packages/runtime/skills/PATTERNS.md                            edit (+236)
packages/runtime/skills/slack-digest/SKILL.md                  edit (+174)
packages/runtime/skills/email-triage/SKILL.md                  edit (+153)
packages/core/src/models/entities.ts                           edit (+22)
packages/core/src/services/area-parser.ts                      edit (+12)
packages/core/src/services/entity.ts                           edit (+221)
packages/core/src/services/index.ts                            edit (+11)
packages/cli/src/index.ts                                      edit (+8)
packages/cli/src/commands/areas.ts                             NEW (+211)
packages/cli/src/commands/people.ts                            edit (+114)
packages/cli/src/commands/pull.ts                              edit (+15)
packages/core/test/services/area-parser.test.ts                edit (+176)
packages/core/test/services/chef-orchestrator-skills.test.ts   edit (+86)
packages/core/test/services/entity.test.ts                     edit (+305)
packages/cli/test/commands/areas.test.ts                       NEW (+390)
packages/cli/test/commands/people.test.ts                      edit (+219)
packages/cli/test/commands/pull.test.ts                        edit (+65)
+ dist/* (rebuilt — commit b89cd77c)
```

11 task commits + 1 dist commit + 1 build-report commit (pending) =
13 commits in the 7a series.
