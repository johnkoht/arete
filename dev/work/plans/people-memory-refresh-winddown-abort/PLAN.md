# People memory refresh aborts during winddown

**Status:** diagnosed, not yet fixed — picked up cold next week
**Reported:** 2026-06-17 (winddown agent: "people memory refresh aborted at a prompt — harmless here, no new meetings this pass")
**Severity:** silent failure (exits 0, does nothing) — fires on real meeting days too

---

## Symptom

A winddown run reported:

> ⚠️ arete people memory refresh aborted at a prompt — harmless here (no new
> meetings this pass), but flagging in case it recurs on a real meeting day.

It is **not** harmless and it is **not** gated on new meetings. See below.

## Root cause — two distinct bugs

### Bug 1 — Caller bug (the reported symptom)

All three skills invoke the refresh **bare**, with no flags:

- `packages/runtime/skills/daily-winddown/SKILL.md:1310`
- `packages/runtime/skills/weekly-winddown/SKILL.md:303`
- `packages/runtime/skills/process-meetings/SKILL.md:230`

```bash
arete people memory refresh
```

The command has a cost-confirm gate at `packages/cli/src/commands/people.ts:625-646`.
It fires when **all** of:

- `estimatedCost >= $1.00` (`COST_CONFIRM_THRESHOLD_USD`)
- `--yes` not passed
- not `--dry-run`

…in which case it prints `Re-run with --yes…` and does **`process.exit(0)`** — a
no-op with a **success exit code**. In an agent-driven winddown there is no TTY,
so nothing answers the prompt; it just exits. The 0 exit code is why it reads as a
clean "harmless abort" rather than an error → silent failure (cf.
`memory/...feedback_poc_vs_fair_test` — silent failures are bugs).

### Bug 2 — Estimator bug (why the gate over-fires; root cause)

The cost estimator (`people.ts:558-602`) counts **all** person×meeting pairs in
the last 90 days. It never applies the `isMemoryStale` filter that the *actual*
refresh uses (`entity.ts:1304-1310`, `person-memory.ts:388`). So:

- The estimate is inflated vs. real work, and stays high even when
  `--if-stale-days` would skip most people.
- The estimate **does not depend on today's meetings** — so the gate trips
  identically on a real meeting day. The "no new meetings → harmless" assumption
  is wrong.
- The `>$10` ceiling path (`people.ts:606-624`) calls `confirmInteractive`, which
  **returns `false` in any non-TTY context** (`people.ts:767`). So `--yes` cannot
  override the ceiling. On a large workspace the inflated 90d estimate can exceed
  $10 and abort **regardless of flags**.

### Why "no new meetings" is a red herring

The bare invocation passes **no `--if-stale-days`**, and
`isMemoryStale(lastRefreshed, undefined)` returns `true` unconditionally
(`person-memory.ts:389`). So the refresh is never gated on new meetings — it
intends to refresh **every** person, every winddown. The abort means stakeholder
memory silently did **not** refresh, and the same gate fires on real meeting days.

---

## Proposed fix (do both)

### Fix A — Estimator stale-awareness (root cause)
In `people.ts:558-602`, apply the same staleness filter the refresh uses before
counting meetings — read each person's `last_refreshed` and skip via
`isMemoryStale(lastRefreshed, ifStaleDays)` so the estimate tracks actual
refreshable work. This keeps the gate a genuine guardrail for interactive runs
while letting `--if-stale-days`-bounded automated runs stay under threshold.

### Fix B — Caller invocations (symptom + redundant qmd)
Update the three skill invocations to:

```bash
arete people memory refresh --if-stale-days <N> --yes --skip-qmd
```

- `--yes` — clears the $1 confirm gate (user already opted into winddown)
- `--if-stale-days <N>` — bounds work to genuinely-stale people; avoids
  re-spending LLM on people refreshed earlier the same day. Pick N (1 for daily? 7
  for weekly? — decide.)
- `--skip-qmd` — winddown already runs `arete index` at the end
  (daily-winddown `:1316`); per-command qmd refresh is redundant (cf.
  `memory/...feedback_batch_commitments`)

> Note: Fix B alone is insufficient on large workspaces because of the `>$10`
> ceiling that `--yes` can't override (Bug 2). Fix A is what actually makes the
> non-interactive path reliable. Both needed.

---

## Open decisions (for John)

1. **Here or worktree?** (branch-isolation rule — not yet started.)
2. **Stale window N** per skill: daily vs weekly vs process-meetings.
3. Should the bare/non-TTY-no-`--yes` path exit **non-zero** (or emit a
   machine-readable signal) instead of `exit(0)`, so a silent no-op can't masquerade
   as success? Cheaper alternative to relying on every caller passing flags.
4. Whether the `>$10` ceiling should remain TTY-only (intentional human gate) or
   accept an explicit override env/flag for automated runs.

## Verification when fixed
- Non-TTY run with a realistic workspace estimate ≥ $1 and ≥ $10 actually
  refreshes (doesn't abort).
- Estimator output with `--if-stale-days N` matches the count of actually-stale
  people, not the full 90d population.
- All three skills updated and consistent.

## Key files
- `packages/cli/src/commands/people.ts` — refresh command, gate (`:625-646`),
  estimator (`:558-602`), ceiling (`:606-624`), `confirmInteractive` (`:767`)
- `packages/core/src/services/entity.ts:1277` — `refreshPersonMemory` (staleness `:1304-1310`)
- `packages/core/src/services/person-memory.ts:388` — `isMemoryStale`
- Skill callers: daily-winddown `:1310`, weekly-winddown `:303`, process-meetings `:230`
