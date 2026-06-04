# Phase 9B Autonomous Build Report

**Built**: 2026-06-03
**Scope**: Phase 9B autonomous (SKILL.md refit + telemetry verify + cost preview)

## Commits

| SHA | Description |
|-----|-------------|
| `a5ba1650` | phase-9b(runtime): prepare-meeting-agenda SKILL.md refit (AC9) |
| `<this commit>` | phase-9b(verify): telemetry shim + cost preview (this report). Final SHA recorded in `git log`. |

## SKILL.md refit summary

**File**: `packages/runtime/skills/prepare-meeting-agenda/SKILL.md`
**Section rewritten**: Step 4 (Gather Context).

### Before (step 4 heading + key body, abridged)

```
### 4. Gather Context When It Adds Value

**Default: gather context** so the agenda can include suggested items (recent
topics, open action items, related projects).

- Run the get_meeting_context pattern (see PATTERNS.md) with the meeting's
  attendees and use its outputs to suggest bullets under the template sections.
- If attendees are known/resolved, run stale-aware refresh before using highlights:
  - arete people memory refresh --person <slug> --if-stale-days 3
- Check attendee person files for ## Memory Highlights (Auto) ...
- ... meetings index ... latest meetings ...

**Gather context when** (proactive; don't wait for the user to ask): ...
**Skip context only when**: ...
```

The "gather context when" language was discretionary, made the brief verb
optional, and surfaced raw person-file reads as a competing path. Phase 9
documented this as the regression vector: agents pattern-fill the template
because their gather step is fuzzy.

### After (step 4 verbatim from F3+F4 hardening prose in plan v3)

```
### 4. Gather Context (REQUIRED — verb invocation is the gate)

**Always invoke** `arete brief --meeting "<exact meeting title>"` as your first
action. The brief verb is the single source of truth for context aggregation.
Do NOT shortcut by reading person files directly with the Read tool — that path
produces the regressed thin-template output and is what Phase 9 was built to
replace.

Only fall back to per-attendee briefs (`arete brief --person <slug>` for each
attendee) when `arete brief --meeting` returns the `(unresolved — no calendar
match, no saved file)` AC4d path.

If you want richer person memory before composing, run `arete people memory
refresh --person <slug> --if-stale-days 3 --skip-qmd` to refresh stale stances.
The `--skip-qmd` flag prevents the auto-index output from being surfaced to the
user as a status prompt.

**Critical: brief section names are NOT agenda section names.** The brief
returns sections like `## Open commitments touching this group`, `## Related
wiki pages`, `## Attendees`. These are organizational headers in the *input*,
not headers for the *output*. **Synthesize themed agenda sections** named by
topic (e.g., "Glance 2.0 Roadmap — Start the Conversation", "Discovery Process
Update", "30/60/90 Surface", "Carries"). Each themed section should weave
together signal from multiple brief sections.

**Concrete synthesis pattern**:
- Read the brief output top-to-bottom.
- Identify 3-6 themes the meeting needs to cover. Themes come from cross-source
  signal: an open commitment + a related decision + a wiki callback = one
  themed section.
- For each theme, draft a section with: short framing prose, 2-4 specific
  bullets citing commitment IDs/meeting dates/wiki pages, an "ask" or "decision
  needed" framing line where appropriate.
- Do not pattern-fill the template's generic sections (Priorities / Feedback /
  Next Steps) without synthesizing first. Those sections belong AT THE END
  after the themed sections.

Example agenda quality bar: `resources/meetings/2026-04-29-john-lindsay-11.md`
lines 88-158. Themed sections ("Glance 2.0 Roadmap — Start the Conversation
(20min)", "Discovery Process Update (10min)"), specific commitment IDs
("commitment 45ef9b64"), prior-conversation callbacks ("Per our 4/22
conversation, past misfires came from leadership defining the experience
before adjuster-driven research"). That's the target shape.

Do not reimplement calendar or context logic; use existing commands and
patterns only.
```

### Critical anti-pattern-fill prose (cited verbatim per F3 mitigation)

> **Critical: brief section names are NOT agenda section names.** The brief
> returns sections like `## Open commitments touching this group`, `## Related
> wiki pages`, `## Attendees`. These are organizational headers in the *input*,
> not headers for the *output*. **Synthesize themed agenda sections** named by
> topic (e.g., "Glance 2.0 Roadmap — Start the Conversation", "Discovery
> Process Update", "30/60/90 Surface", "Carries"). Each themed section should
> weave together signal from multiple brief sections.

### April 29 quality bar reference

Confirmed inline in the refitted prose: `resources/meetings/2026-04-29-john-lindsay-11.md`
lines 88-158, with the verbatim themed-section examples ("Glance 2.0 Roadmap —
Start the Conversation (20min)", "Discovery Process Update (10min)"),
commitment-ID citation pattern ("commitment 45ef9b64"), and prior-conversation
callback pattern ("Per our 4/22 conversation, past misfires came from
leadership defining the experience before adjuster-driven research").

### Other AC9 requirements satisfied

| Requirement | Confirmed |
|------------|-----------|
| "Always invoke" gate | "Always invoke `arete brief --meeting`" as the first action; "Do NOT shortcut by reading person files directly" |
| --skip-qmd flag on people memory refresh | `arete people memory refresh --person <slug> --if-stale-days 3 --skip-qmd` |
| Anti-pattern-fill prose | "Critical: brief section names are NOT agenda section names" paragraph |
| Concrete synthesis pattern | 4-bullet list (read top-to-bottom → 3-6 themes → per-theme framing+bullets+ask → no template-fill) |
| April 29 quality bar reference | File path + lines 88-158 + verbatim examples |
| Fallback to per-attendee briefs | "Only fall back to per-attendee briefs ... when `arete brief --meeting` returns the `(unresolved — no calendar match, no saved file)` AC4d path" |

Diff scope: step 4 only; steps 1-3 (Identify Meeting, Select Type, Choose
Template) and steps 5-7 (Build, Review, Save) unchanged. The "Output Format"
section, frontmatter table, and references list are unchanged. Net diff +17 / -20.

## Telemetry shim verification

**Method**: invoked all 4 typed modes of `arete brief` against
`/Users/john/code/arete-reserv` (which is the user's live workspace — the
worktree has no fixture meetings/people/projects of its own, and the global
`arete` binary symlinks to this worktree's `packages/cli/dist`, so the test
exercises the Phase 9A code path against real data).

**Commands run**:

```
cd /Users/john/code/arete-reserv
arete brief --person lindsay-gray --json
arete brief --project glance-2-mvp --json
arete brief --area glance-2-mvp --json
arete brief --meeting "John / Lindsay 1:1" --json
```

All four commands exited 0 and emitted valid JSON. Sanity checks:
- `--person` → `"mode": "person"`, `"subjectSlug": "lindsay-gray"`
- `--project` → `"mode": "project"`, `"subjectSlug": "glance-2-mvp"`
- `--area` → `"mode": "area"`, `"subjectSlug": "glance-2-mvp"`, subject resolved to "Glance 2.0 MVP" from area memory file
- `--meeting` (free-text title) → `"mode": "meeting"`, `"subjectSlug": "2026-06-03-john-lindsay-11"` — resolved free-text to today's saved meeting file (M1 path: title doesn't match `^\d{4}-\d{2}-\d{2}-` so skips slug-match; falls through to filename-substring + content match against meeting frontmatter)

**Log file**: `/Users/john/code/arete-reserv/dev/diary/brief-invocations.log`
(created on first invocation; was absent before this run).

**Captured log content**:

```
2026-06-04T04:26:25.494Z --person "lindsay-gray"
2026-06-04T04:26:31.256Z --project "glance-2-mvp"
2026-06-04T04:26:32.337Z --area "glance-2-mvp"
2026-06-04T04:26:33.455Z --meeting "John / Lindsay 1:1"
```

**Format verification**:
- 4 lines, one per invocation — matches the AC10c contract (one telemetry line per typed-mode invocation).
- Each line is `<ISO-8601 timestamp> <mode-flag> <json-quoted-input>` exactly as documented in Phase 9A build report decision note 5.
- ISO timestamps are present and monotonically increasing.
- `--meeting "John / Lindsay 1:1"` correctly JSON-quotes the input despite the embedded spaces — confirms the parseability decision (deviation from plan literal text).
- No errors surfaced to stdout from telemetry; the soft-fail wrapper in `appendBriefInvocationTelemetry` (intelligence.ts:837-851) is doing its job.
- `dev/diary/` directory was auto-created via `fs.mkdir({recursive: true})` — confirms first-write bootstrap works.

**Soak observability conclusion**: F4 detection signal is live. Daily
`wc -l /Users/john/code/arete-reserv/dev/diary/brief-invocations.log` + tail
will surface SKILL.md drift (zero invocations on a day with a prepared
agenda).

## Cost preview for AC8a

**Method**: ran `arete people memory refresh --dry-run --json --skip-qmd`
against `/Users/john/code/arete-reserv`. The CLI's stance-specific cost
estimator (`packages/cli/src/commands/people.ts:558-602`) walks all people
under `people/{internal,users,customers}/`, counts meeting-files-in-90-days
where the filename includes the person's slug OR the file body contains the
person's display name, multiplies by `COST_PER_STANCE_CALL` ($0.015 default),
and gates against the $10 ceiling.

**Authoritative CLI output**:

```json
{
  "success": false,
  "error": "cost_exceeds_ceiling",
  "estimate": {
    "stanceCallCount": 1842,
    "costUsd": 27.63,
    "ceilingUsd": 10
  },
  "hint": "Re-run in a TTY to confirm interactively; --yes is insufficient for this magnitude."
}
```

**Headline number**: **1,842 (person, meeting) pairs** would be LLM-extracted,
at an estimated **$27.63** total spend. This is **2.76× the $10 ceiling**, so
the CLI cost-gate would block a non-interactive run (`--yes` insufficient — a
TTY confirmation is required, per `topic.ts:963` seedMaxUsd ceiling pattern).

**Threshold breaches**:
- ≥ $1 confirm threshold: yes (27.63 ≥ 1.00) — would fire confirm prompt even without ceiling.
- ≥ $10 ceiling: yes (27.63 > 10.00) — fires interactive-TTY confirm. `--yes` not sufficient.
- TTY-required path: triggered.

**Workspace shape**:
- People in scope: 126 internal + 19 users + 0 customers = **145 total person files** considered by `listPeople(paths)`.
- Meetings in 90-day window: **274 meeting files** (`resources/meetings/*.md` with `^YYYY-MM-DD-` prefix where YYYY-MM-DD ≥ 2026-03-05, excluding `index.md`).
- Total `meetings × people` cross-product is 39,730; the 1,842 hit-rate (~4.6%) reflects the per-person × per-meeting match (slug-in-filename OR name-in-content) — the estimator does what its name says.

**Samples of which (person, meeting) pairs would be hit** (filename- or content-matched in last-90d meetings):

| Slug | Display name | 90d meetings (would extract) |
|------|-------------|-----|
| `lindsay-gray` | Lindsay Gray | **101** |
| `john-koht` | John Koht | **267** |
| `anthony-avina` | Anthony Avina | **68** |
| `nate-fullerton` | Nate Fullerton | **54** |
| `dave-wiedenheft` | Dave Wiedenheft | **38** |
| `chris-mauro` | Chris Mauro | **40** |
| `matt-thompson` | Matt Thompson | **8** |
| `jamie-mullins` | Jamie Mullins | **5** |
| `brett-hughes` | Brett Hughes | **4** |
| `adrian-soto` | Adrián Soto | **4** |
| `sarah-handley` | Sarah Handley | **2** |
| `andrew-marell` | Andrew Marell | **1** |

(Counts replicate the estimator's filename-substring + content-grep logic
against `/tmp/9b-cost-preview/recent-meetings.txt`. `john-koht` is by far the
heaviest hitter — he appears in nearly every meeting because his name is on
every 1:1 — and dominates the bill. Lindsay's 101 reflects the breadth of
manager touch-points.)

**The top-3 alone (john-koht + lindsay-gray + anthony-avina) account for
436/1,842 calls (~24%), i.e. ~$6.54 of the ~$27.63 estimated spend.**

**Calibration note (carried from 9A)**: `COST_PER_STANCE_CALL = $0.015` is a
conservative TODO-flagged default. Actual per-call cost depends on the meeting
file size (extraction prompt scales with body length). Empirical recalibration
is queued for the post-refresh path (divide actual spend by 1,842).

### Recommendation for user gate

The cost-gate is doing its job — the workspace-wide refresh is **above the
$10 hard ceiling** and will require interactive TTY confirmation. Three paths
forward, in order of preference:

1. **Recommended — incremental per-person, ladder up.** Start with `lindsay-gray`
   (~$1.52, 101 calls) since she's the canonical April 29 quality-bar
   benchmark. Sample stance quality on her file (per AC8a step 3 — pre-mortem
   F1 detection: hallucinated stances attributed to person Y's quoted speech;
   fabricated stances absent from source meeting body; tone inversion). If
   sample passes, fan out to a wider set: anthony-avina (~$1.02), nate-fullerton
   (~$0.81), dave-wiedenheft (~$0.57), chris-mauro (~$0.60). Cost so far ~$4.50,
   confirms COST_PER_STANCE_CALL calibration, surfaces F1 risk early.

2. **Cap-and-yes.** Pass `--yes` with a smaller scope by filtering with
   `--min-mentions 5` (already supported; not yet a confidence-weighted gate,
   but caps the obvious noise people who only appear once or twice). Sample
   shows ~6 people would be excluded (sarah-handley, andrew-marell, etc.).

3. **Full workspace, TTY-confirmed.** John runs `arete people memory refresh
   --if-stale-days 0 --skip-qmd --snapshot-path dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/pre-refresh-memory-blocks.json`
   in a real terminal, answers the confirm prompt, accepts ~$27.63 spend.
   Requires snapshot path so `restore-memory-blocks.sh` can roll back if F1
   sample gate fails (AC8a step 3).

In all three paths, run the daily-winddown timing measurement before and
after (AC8a step 4 / M3) to keep Phase 8 soak signals isolable from Phase 9
entropy.

**Dry-run was a clean cost preview — no spend, no person-file writes, no
LLM calls fired.** Cost-gate exit-code path was 1 (above ceiling), so the
CLI surfaced the estimate and bailed before any wiring path could run.

## User-gated steps remaining (for John to execute)

1. **AC8a one-shot workspace refresh** (Phase 9 plan build-step 14a):
   - **(i)** Cost preview already captured above ($27.63 / 1,842 calls — over the ceiling).
   - **(ii)** Pre-refresh snapshot — pass `--snapshot-path dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/pre-refresh-memory-blocks.json` when running.
   - **(iii)** Phase 8 winddown timing baseline — `time arete winddown` (or equivalent flow) BEFORE refresh.
   - **(iv)** `arete people memory refresh --if-stale-days 0 --skip-qmd --snapshot-path ...` against `/Users/john/code/arete-reserv` (TTY for confirm).
   - **(v)** Phase 8 winddown timing post-measure — `time arete winddown` AFTER refresh. Record delta.
   - **(vi)** Stance-quality sample gate — pick 10 person files post-refresh, scan for hallucination signals (per AC8a step 3 contract above). If ≥1 hallucination per 10, abort and `restore-memory-blocks.sh dev/work/plans/.../pre-refresh-memory-blocks.json`, then re-try at `'standard'` tier instead of `'extraction'`.

2. **AC10 manual quality verification**:
   - Run `/prepare-meeting-agenda` for an upcoming 1:1 (recommend John/Lindsay since that's the April 29 calibration target).
   - Compare resulting agenda to `resources/meetings/2026-04-29-john-lindsay-11.md` lines 88-158.
   - Pass criteria (per AC10 v3): ≥ 3 themed sections (headers neither verbatim-template nor verbatim-brief-section), ≥ 2 cross-source references (prior meeting OR commitment hash OR topic page), ≥ 2 specific items per section.

3. **AC10b unsupervised second-run**:
   - ≥ 6 hours after AC10 supervised run, in a fresh Claude Code session with no priming context, re-run `/prepare-meeting-agenda` for the same meeting.
   - Compare both. Quality regression in the unsupervised run = F3 materialized = strengthen SKILL.md prompt structure before merging Phase 9.

4. **Daily soak checks** (14-day window from plan §"Soak observability + rollback"):
   - `wc -l /Users/john/code/arete-reserv/dev/diary/brief-invocations.log` + tail.
   - Spot-check agenda quality every 2 days for themed-section count, commitment-hash citations.
   - `git diff people/internal/*.md` on day 3/7/14 for stance-block churn signal.

## Verification commands for user

Run from `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator` unless otherwise noted.

### Verify SKILL.md refit

```bash
sed -n '70,90p' packages/runtime/skills/prepare-meeting-agenda/SKILL.md
# Expect: "Always invoke" gate + "--skip-qmd" + "brief section names are NOT
# agenda section names" + concrete synthesis pattern + April 29 reference.
git log --oneline -1 -- packages/runtime/skills/prepare-meeting-agenda/SKILL.md
# Expect: a5ba1650 phase-9b(runtime): prepare-meeting-agenda SKILL.md refit (AC9)
```

### Re-verify telemetry shim

```bash
cd /Users/john/code/arete-reserv
arete brief --person lindsay-gray --json >/dev/null
arete brief --project glance-2-mvp --json >/dev/null
arete brief --area glance-2-mvp --json >/dev/null
arete brief --meeting "John / Lindsay 1:1" --json >/dev/null
tail -4 dev/diary/brief-invocations.log
# Expect 4 lines matching: <ISO-8601> <--mode> <"input">
```

### Re-run the cost preview (still no spend)

```bash
cd /Users/john/code/arete-reserv
arete people memory refresh --dry-run --json --skip-qmd | head -10
# Expect: stanceCallCount: 1842 (±2 if meetings changed), costUsd: 27.63,
# error: "cost_exceeds_ceiling" — exit 1.
```

### When ready: user-gated one-shot refresh (with snapshot + ceiling confirm)

```bash
cd /Users/john/code/arete-reserv
# Time the daily-winddown BEFORE the refresh (AC8a step 4)
time arete daily-winddown --json >/dev/null 2>&1 || true

# Pre-refresh snapshot + workspace-wide LLM refresh
arete people memory refresh \
  --if-stale-days 0 \
  --skip-qmd \
  --snapshot-path /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/pre-refresh-memory-blocks.json
# This is over the $10 ceiling. You'll get an interactive confirm. Answer y to proceed.

# Time the daily-winddown AFTER (record delta — if > 30s, flag)
time arete daily-winddown --json >/dev/null 2>&1 || true

# Stance-quality sample gate (per AC8a step 3 — pick 10 person files at random)
ls people/internal/*.md | shuf -n 10 | xargs -I {} sh -c 'echo "=== {} ===" && sed -n "/<!-- AUTO_PERSON_MEMORY:START -->/,/<!-- AUTO_PERSON_MEMORY:END -->/p" {}'

# If sample fails F1 detection — rollback:
bash /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/restore-memory-blocks.sh \
  /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/pre-refresh-memory-blocks.json
```

### When ready: AC10 quality verification

In a real Claude Code session against `/Users/john/code/arete-reserv`:
```
/prepare-meeting-agenda
# Pick an upcoming John/Lindsay 1:1 (or whichever 1:1 is next).
# Agent should invoke `arete brief --meeting "<title>"` as its first action —
# confirmed by tail of dev/diary/brief-invocations.log post-run.
```

Side-by-side against `resources/meetings/2026-04-29-john-lindsay-11.md` lines
88-158. Pass / fail per AC10 v3 criteria (themed sections, cross-source
references, specific items per section).
