# people-memory-incremental — /hotfix diary

> New diary (this hotfix is self-contained; not folded into single-pass-extraction).
> Branch: `fix/people-memory-incremental` off main 55ad73b7.

## 2026-06-17 — /hotfix Phase 2 (IMPLEMENT)

### Root cause (confirmed in Phase 1, approved by John)
`arete people memory refresh` always scopes to **all refreshable people × every
meeting that names them**, with no time window on the core scan. The window
problem manifested in two places:

1. **Core (`entity.ts` `refreshPersonMemory`)** scanned the **entire**
   `resources/meetings/` corpus on every run — no window at all. When a
   SearchProvider was present it pre-filtered by relevance but still across all
   time.
2. **CLI cost-estimate (`people.ts` ~574)** hard-coded a **90-day** window for
   the stance cost estimate. On an active workspace the 90-day delta is large
   enough to trip the `$1` confirm gate, so an unattended winddown call would
   block on `confirm_required` (or burn the full 90-day re-extraction with
   `--yes`). Daily/weekly winddown only need the last 1/7 days.

The **unit** (which people a meeting pertains to — attendees AND body mentions)
was correct and is preserved unchanged. Only the **time WINDOW** was the bug.

### Mechanism chosen — `sinceDays` + `--days` / `--full`
- **Core**: added optional `sinceDays?: number` to `RefreshPersonMemoryOptions`.
  When set (and `>= 0`), the `meetingFiles` set is filtered to files whose
  filename date (`extractDateFromPath`, the existing `\d{4}-\d{2}-\d{2}` parse)
  is `>= cutoff`, where `cutoff = (referenceDate ?? now) - sinceDays days`,
  formatted as a `YYYY-MM-DD` string (timezone-safe lexicographic compare, same
  approach as `meeting-reconciliation.ts`). Files with no parseable filename
  date are **kept** (can't safely window them out). The window is also applied
  to the **SearchProvider candidate paths** via a normalized-absolute-path Set
  (`windowedMeetingSet`) so the window holds whether or not a provider is
  present. **Unset = scan all meetings** → fully backward-compatible.
  - Because `scannedMeetings` is `meetingFiles.length`, the filtered count flows
    through to the result for free — which the tests assert on.
- **CLI**: added `--days <n>` (incremental) and `--full` (explicit 90-day
  rebuild). `--full` wins if both passed. The cost-estimate loop now uses
  `windowDays = sinceDays ?? 90` for its cutoff — the **same** window the refresh
  uses — so an incremental run estimates ~$0 and never hits the gate. `sinceDays`
  is threaded into `refreshPersonMemory` only when set.

### Unflagged-default decision
Unflagged `arete people memory refresh` (no `--days`, no `--full`) keeps the
**90-day** behavior for the cost estimate and **scan-all** for the core (the two
were already effectively "everything in 90d" interactively). This preserves
existing interactive use. Winddown skills opt into the narrow window explicitly:
`--days 1` (daily) / `--days 7` (weekly). `--full` is the documented explicit
"rebuild everything" override.

### Files changed
- `packages/core/src/services/entity.ts` — `sinceDays` option + window filter on
  `meetingFiles` + SearchProvider-candidate window intersection.
- `packages/cli/src/commands/people.ts` — `--days` / `--full` options, window
  resolution, cost-estimate cutoff scoped to the window, `sinceDays` threaded in.
- `packages/runtime/skills/daily-winddown/SKILL.md` — invocation → `--days 1`
  (line ~1310; prompt referenced 1513, but the live file has it at 1310 — single
  edit to the bare invocation line only, no surrounding prose touched).
- `packages/runtime/skills/weekly-winddown/SKILL.md` — invocation → `--days 7`
  (line 303).
- `packages/core/test/services/person-memory.test.ts` — new describe block.
- `packages/cli/test/people-memory-window.test.ts` — new file.
- Rebuilt dist (`packages/core/dist`, `packages/cli/dist`) committed per house rule.

### Tests (regression that would have caught this)
Core (`person-memory.test.ts`, describe `EntityService.refreshPersonMemory — sinceDays window`):
- `sinceDays filters the meeting set to the window (excludes older meetings)`
- `unset sinceDays scans all meetings (90-day / --full default unchanged)`
- `preserves name-mention scope inside the window (mentioned, not an attendee)`

CLI (`people-memory-window.test.ts`, describe `arete people memory refresh — incremental window cost gating`):
- `unflagged default (90d) estimate trips the confirm gate`
- `--days 1 scopes the estimate to ~$0 and does NOT trip the gate`
- `--full forces the 90-day rebuild even when --days is also passed`

`npm run typecheck` clean; full `npm test` green (4795 pass / 0 fail / 2 skipped).

### Scope notes / residual
- Minimal change held — `refreshPersonMemory`'s meeting-set selection was NOT
  tangled; a single filter point on `meetingFiles` plus the SearchProvider-set
  intersection covered it. No scope creep.
- Incidental churn (`package-lock.json` 0.15.1→0.18.0 lockfile drift, and the
  `dist/AGENTS.md` regenerated timestamp) was reverted — not part of this fix.
- NOT done (out of scope, no merge/push): merge, release bump, reviewer gate.
  Phase 3 (independent eng-lead review) runs separately.
