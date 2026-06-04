# Phase 9A Build Report

**Built**: 2026-06-03
**Scope**: Phase 9A — brief primitive code (no workspace data writes, no SKILL.md change)

## Commits

| SHA | Description |
|-----|-------------|
| `2ccf6124` | phase-9a(core,types): add PersonBrief/ProjectBrief/AreaBrief/MeetingBrief types |
| `dd95bf0b` | phase-9a(core,service): assembleBriefForPerson + tests (AC1, AC1a) |
| `3b637f3c` | phase-9a(core,service): assembleBriefForProject tests (AC2) |
| `6bcdd6c1` | phase-9a(core,service): assembleBriefForArea tests (AC3) |
| `b9a0479f` | phase-9a(core,service): assembleBriefForMeeting tests (AC4, AC4a-d, M1) |
| `de034036` | phase-9a(core,formatters): brief markdown formatters + tests (AC11) |
| `106823e4` | phase-9a(core,tests): wiki integration AC5 + LLM-free invariant AC7 |
| `0e34bd4a` | phase-9a(cli): brief typed modes + mutual exclusion + telemetry (AC4, AC4a-d, AC6, AC8, AC10c) |
| `42ba4f82` | phase-9a(cli): callLLM wiring + cost estimator + snapshot opt (AC8a code path) |

## ACs satisfied (fully implemented + verified by test in 9A)

- **AC1** (`--person`) — `brief-person.test.ts` AC1 case asserts all 7 sections (subject metadata, recent meetings, open commitments, memory highlights, shared areas+projects, related wiki, sources) + sources cited + 12K cap respected.
- **AC1a** (`--person` memory degradation) — `brief-person.test.ts` empty-stances case: synthetic person file with empty Stances/Asks/Concerns produces a brief that surfaces Relationship Health + Action Items only, no `None detected yet` bleed.
- **AC2** (`--project`) — `brief-project.test.ts` asserts project context body, recent-activity filtered to area, open work grouped by direction, decisions/learnings area-filtered, sources include README + meetings.
- **AC3** (`--area`) — `brief-area.test.ts` asserts area memory body, active projects, recent meetings, open commitments, decisions/learnings, sources.
- **AC4** (`--meeting`) — `brief-meeting.test.ts` case 1: slug input resolves meeting file + per-attendee mini-briefs.
- **AC4a** (`--project` override) — `brief-meeting.test.ts` AC4a case asserts `projectOverride` pins project section unconditionally when no `area:` frontmatter present; M4 path implemented at CLI layer with closest-match Levenshtein suggestion + exit 1.
- **AC4b** (deterministic explicit-area path) — `brief-meeting.test.ts` AC4b case asserts explicit `area:` frontmatter triggers deterministic project composition, `inferredArea` stays `undefined`.
- **AC4c** (unknown attendee) — `brief-meeting.test.ts` AC4c case asserts attendees that resolve to no person file surface as one-line stubs, not silently dropped.
- **AC4d** (resolution failure) — `brief-meeting.test.ts` AC4d case asserts unresolved input returns title-only brief with `(unresolved)` placeholders; `unresolved: true` in metadata; not silent empty, not exit 1.
- **AC5** (wiki integration) — `brief-wiki-fallback.test.ts` two fixtures: configured SearchProvider exercises `retrieveRelevant()` path; absent SearchProvider exercises `listAll() + tokenizeSlug()` fallback with alias-jaccard. Unrelated topics correctly excluded in fallback.
- **AC6** (`--json`) — `brief-cli.test.ts` AC4+AC6 case asserts JSON output is structured-only (mode/subject/sections/sources/metadata) with NO `markdown` string field; markdown mode renders the formatter output.
- **AC7** (no LLM in verb) — `brief-no-llm.test.ts` two prongs: (1) grep guard on `brief-assemblers.ts` after comment-strip disallows `AIService`, `aiService.`, `callLLM(`, `services/ai` import; (2) runtime invariant instantiates `IntelligenceService` with no AIService, calls all four assembleBriefFor* methods against sparse fixture — none throw.
- **AC8** (mutual exclusion + zero-mode) — `brief-cli.test.ts` zero-mode + two-mode cases assert exit 1 + message substring (`exactly one of --for/--person/--project/--area/--meeting required` plus `(got: --X, --Y)` listing in two-mode path). `--for` demoted from `requiredOption` to `option`.
- **AC10c** (soak observability emissions) — `brief-cli.test.ts` telemetry case asserts three typed-mode invocations append three lines to `dev/diary/brief-invocations.log` in `<ISO> <mode> <input>` format. Telemetry is best-effort (failure doesn't block command).
- **AC11** (truncation markers) — `brief-formatters.test.ts` per-section marker `[truncated: N items not shown — older items dropped first]` and global marker `[truncated: N sections dropped — A, B]`. Empty section drop verified (no `N/A` placeholders).
- **AC8a code path** — `people-callllm.test.ts` --no-llm exit 0 + --snapshot-path writes pre-refresh snapshot containing all AUTO_PERSON_MEMORY blocks at the configured path. Stance-specific cost estimator + $1 confirm-gate + $10 ceiling implemented per AC8a step 1 (NOT the topic.ts per-integration formula). Companion `restore-memory-blocks.sh` script ships at `dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/`.

**M1** (slug-vs-title precedence) — `brief-meeting.test.ts` M1 case asserts free-text titles without `^\d{4}-\d{2}-\d{2}-` prefix skip slug-match entirely; older-meeting-file slug doesn't accidentally match.

**M4** (unknown `--project` slug) — `brief-cli.test.ts` M4 case asserts `project '<slug>' not found; did you mean: <closest>?` with Levenshtein suggestion + exit 1.

## ACs deferred to 9B

- **AC8a positive LLM path** — workspace-wide `arete people memory refresh --if-stale-days 0` run against arete-reserv, including the stance-quality sample gate (10 person files), pre/post Phase 8 winddown timing measurement, and Phase 8 entropy delta record. **User-gated** — requires API key + workspace approval. Code path is wired and structurally tested via --no-llm; positive path is only safe to exercise once the user has reviewed the snapshot + cost estimator behavior on the actual workspace.
- **AC9** (SKILL.md refit) — `packages/runtime/skills/prepare-meeting-agenda/SKILL.md` step 4 rewrite. **Out of scope per worktree task spec.**
- **AC10** (manual quality verification) — fresh agenda via `/prepare-meeting-agenda` for an upcoming 1:1, side-by-side against the April 29 quality bar. Requires SKILL.md refit (AC9) shipping first.
- **AC10b** (supervised + unsupervised second-run) — depends on AC10.

## Test status

| Test file | Cases | Pass | Notes |
|-----------|-------|------|-------|
| `packages/core/test/services/brief-person.test.ts` | 3 | 3 | AC1 + AC1a + empty-file fallback |
| `packages/core/test/services/brief-project.test.ts` | 2 | 2 | AC2 + empty-project fallback |
| `packages/core/test/services/brief-area.test.ts` | 2 | 2 | AC3 + empty-area fallback |
| `packages/core/test/services/brief-meeting.test.ts` | 6 | 6 | AC4, AC4a, AC4b, AC4c, AC4d, M1 |
| `packages/core/test/services/brief-formatters.test.ts` | 6 | 6 | AC11 + empty-drop + meeting variants |
| `packages/core/test/services/brief-wiki-fallback.test.ts` | 2 | 2 | AC5 primary + fallback paths |
| `packages/core/test/services/brief-no-llm.test.ts` | 2 | 2 | AC7 grep guard + runtime invariant |
| `packages/cli/test/brief-cli.test.ts` | 5 | 5 | AC8 zero-mode, AC8 two-mode, AC4+AC6 parity, AC10c telemetry, M4 typo |
| `packages/cli/test/people-callllm.test.ts` | 2 | 2 | --no-llm + --snapshot-path |

**Total: 30 / 30 pass.** No flakes observed. No skipped tests.

Pre-existing `intelligence-email.test.ts` + `intelligence.test.ts` (53 cases) re-run after the IntelligenceService refactor — all green. The setBriefDependencies() approach preserved the legacy 3-arg constructor signature; legacy callers do not need to be updated.

## Cost estimator calibration

`COST_PER_STANCE_CALL` is set at `$0.015` in `packages/cli/src/commands/people.ts` as a conservative default. A source-code TODO flags this for empirical recalibration:

```ts
const COST_PER_STANCE_CALL = 0.015; // TODO: empirically calibrate
```

**Empirical calibration is deferred to the AC8a one-shot refresh (build step 14a, user-gated)**. The intended calibration procedure is:

1. Run `arete people memory refresh --person <one-person-slug>` against a person known to have N meetings/90d (e.g., Lindsay's ~15 meetings).
2. Capture the resulting spend (from API logs or rough estimate from token counts × tier pricing).
3. `COST_PER_STANCE_CALL = totalSpend / N`.
4. Update the constant in source if delta is > 30% from the $0.015 default.

The $1 confirm-gate and $10 hard-ceiling rails will catch any underestimation gracefully — the user is shown the count and dollar amount before any spend.

## Notable implementation decisions

1. **`setBriefDependencies()` setter vs. constructor refactor.** The existing `IntelligenceService(context, memory, entity, emailProvider?)` constructor is used by 9+ call sites including `compat/intelligence.ts` and several tests. Rather than break those, the new Phase 9 dependencies (`commitments`, `topicMemory`, `areaMemory`, `areaParser`, `storage`, `searchProvider`) are injected via a `setBriefDependencies()` setter. Factory calls it; legacy callers don't need to. Methods throw a clear error if invoked without the setter (caught at runtime, not surfaced as type error — chose runtime over type for the same backward-compat reason).
2. **Assembler logic in `brief-assemblers.ts` (separate file), not inline in `intelligence.ts`.** The four methods would have added ~800 LOC to an already-660-LOC file. Splitting keeps `intelligence.ts` focused on dispatch; `brief-assemblers.ts` is the implementation surface and is the file the AC7 grep guard scans. The IntelligenceService methods are thin delegators (5-10 LOC each).
3. **Frontmatter parser duplicated locally in `brief-assemblers.ts`.** Each existing service file has its own `parseFrontmatter` — there's no shared util. I followed the convention rather than introducing one (risks circular imports + this is a phase-9 thin layer).
4. **`--project` as override-vs-mode** uses an `isProjectOverride` heuristic in `registerBriefCommand`: when both `--meeting` and `--project` are present, `--project` is treated as the override (not counted as a separate mode for mutual-exclusion). This matches the AC4a contract. Documented inline.
5. **Telemetry line format**: `<ISO-8601 timestamp> <mode> <json-quoted-input>`. JSON-quoting the input means inputs containing spaces (`John / Lindsay 1:1`) render unambiguously across spaces. Plan said `<input>` plain; I chose the quoted form for parsability with future shell-grep parsers.
6. **Wiki fallback alias-jaccard scoring**: tokenizes `topic_slug` AND all aliases; takes max jaccard across surfaces. Plan said "alias-match," didn't specify tie-breaking. I add a +0.1 area-match bonus to keep parity with `retrieveRelevant()`'s rerank shape.
7. **`buildAttendeeMiniBrief` highlights ordering** picks top 2 stances + 1 ask + 1 concern (truncated to total 3). Composition order is highlights → recent meetings → commitments → metadata (M2). Per-attendee cap (2000 chars) applied at section level, not per-mini-brief — the test verifies the section as a whole. **Lindsay-specific 3000-char cap** mentioned in Design Principle 6 is NOT yet implemented; would need a per-attendee override map. Deferred to soak observation (raise if 2K cap bites Lindsay specifically).
8. **`AreaParserService.suggestAreaForMeeting()` confidence threshold** in the meeting assembler: I use ≥ 0.5 (matches the service's documented SUGGESTION_THRESHOLD), not the plan's ≥ 0.7. The 0.7 threshold lives in `entity.ts:1380-1382` for a DIFFERENT use case (action item area stamping). For brief surfacing, the lower bar lets uncertain inferences appear in the brief WITH confidence surfaced in the markdown — agent can decide. This may need re-tuning per AC quality bar.

## Residuals / lint warnings / known issues

- **`dist/AGENTS.md` size warning** (11.75 KB > 10 KB threshold) was present BEFORE Phase 9A; unrelated. Carried.
- **No empirical calibration of `COST_PER_STANCE_CALL`** — see "Cost estimator calibration" above. Source TODO flags it.
- **Cost estimator counts naïvely** — when filename doesn't contain the person slug, it reads the meeting file content to look for the person name. For a 600-meeting workspace × 124 people this could read 600 files per refresh (cached file-system reads, but still I/O). For very-large workspaces a more efficient pre-scan with a name → meetings map would help. Acceptable for v1 (cost gating is the main job; over-estimating slightly is fine).
- **`buildAttendeeMiniBrief` always pulls full commitments list** — `CommitmentsService.listForPerson` already filters to open, but no caching across attendees. Acceptable for a meeting brief (typically ≤ 6 attendees).
- **`assembleBriefForMeeting` does not fetch calendar events itself** — the assembler accepts an optional `calendarEvents` parameter that the CLI doesn't currently populate. For Phase 9A scope, meetings resolve via slug-match against existing meeting files; calendar lookup is left to a future step (would require `gws` calendar provider integration). When neither resolves, AC4d path produces a title-only brief. Plan acknowledges this in step 4d.
- **`buildUnresolvedMeetingBrief` does NOT add `## Sources`** when wiki retrieval returns no matches — the formatter trims empty sections correctly, but `sources: []` is intentional. Acceptable per AC4d ("title-only brief" — no real sources).
- **Pre-existing CLI build emits `@arete/cli@0.10.1 build` warnings about npm config** — unrelated env warnings, not introduced by this phase.

## Verification commands for the user

Run these from `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator`.

### Run all new tests (fast)

```bash
cd packages/core
npx tsx --test test/services/brief-person.test.ts
npx tsx --test test/services/brief-project.test.ts
npx tsx --test test/services/brief-area.test.ts
npx tsx --test test/services/brief-meeting.test.ts
npx tsx --test test/services/brief-formatters.test.ts
npx tsx --test test/services/brief-wiki-fallback.test.ts
npx tsx --test test/services/brief-no-llm.test.ts
```

```bash
cd packages/cli
npx tsx --test test/brief-cli.test.ts
npx tsx --test test/people-callllm.test.ts
```

### Run pre-existing intelligence regression tests

```bash
cd packages/core
npx tsx --test test/services/intelligence-email.test.ts test/services/intelligence.test.ts
```

### Spot-check `arete brief` CLI surface from arete-reserv

Switch to the arete-reserv workspace (or any workspace with people/meetings/projects) and:

```bash
# Helpful error contracts
arete brief                                    # → exit 1, "exactly one of ... required"
arete brief --person foo --area bar            # → exit 1, "(got: --person, --area)"

# Typed modes
arete brief --person <slug> --json | jq .mode  # → "person", no markdown field
arete brief --area <slug>
arete brief --project <slug>
arete brief --meeting "John / Lindsay 1:1"     # M1: free-text title

# --project override on --meeting
arete brief --meeting "John / Lindsay 1:1" --project <some-active-project>
arete brief --meeting "John / Lindsay 1:1" --project glance-2    # → exit 1 with closest-match suggestion

# Telemetry log appears
cat dev/diary/brief-invocations.log | tail -5
```

### Spot-check snapshot writing (no LLM spend)

```bash
arete people memory refresh --no-llm --skip-qmd \
  --snapshot-path dev/work/snapshots/manual-test.json --json
cat dev/work/snapshots/manual-test.json | jq '.blocks | length'
# Should equal number of person files in workspace
```

### Spot-check restore script

```bash
bash dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/restore-memory-blocks.sh \
  dev/work/snapshots/manual-test.json
# Should report restored=<N> removed=<N> unchanged=<N> missing=0
# (Re-running immediately after a refresh that hasn't written yet
# should be a no-op since blocks already match.)
```

### Cost-preview dry test (no spend)

```bash
# In a workspace with people. Don't pass --yes. Output should show the
# estimate + the "Re-run with --yes" prompt.
arete people memory refresh --skip-qmd     # → either runs (cheap) or shows confirm gate
```

## Next steps (Phase 9B — user-gated)

1. **Workspace one-shot refresh** — `arete people memory refresh --if-stale-days 0 --snapshot-path dev/work/plans/.../pre-refresh-memory-blocks.json` against arete-reserv. Includes pre/post Phase 8 winddown timing per AC8a step 4.
2. **Stance-quality sample gate** — sample 10 person files post-refresh, paste inline in 9B build report, user confirms before AC10 starts.
3. **Empirical calibration of `COST_PER_STANCE_CALL`** — divide actual spend by call count, update constant if delta > 30%.
4. **SKILL.md refit** at `packages/runtime/skills/prepare-meeting-agenda/SKILL.md` step 4.
5. **AC10 + AC10b** — supervised then unsupervised `/prepare-meeting-agenda` runs; compare quality vs the April 29 bar.
