# Phase 10a — Data model migration tool — Build Report

**Phase**: 10a (Data model + migration tooling)
**Authored**: 2026-06-04
**Status**: complete (6 of 6 steps shipped)
**Branch**: `worktree-arete-v2-chef-orchestrator`

---

## Commits

In chronological order on the worktree branch:

1. `21a77804` — `phase-10a(core): add Stakeholder + Commitment v2 fields (Step 1)`
2. `0b7c4e58` — `phase-10a(core): computeCommitmentHashV2 + text normalization (Step 2)`
3. `3c6a2039` — `phase-10a(core): extractCounterpartiesFromText parser (Step 3)`
4. `0965e535` — `phase-10a(core): migration engine + diff writer (Step 4 — engine)`
5. `e44ef983` — `phase-10a(core): feature flag for v2 read path (Step 5)`
6. `3e70f623` — `phase-10a(cli): migrate verb + 24h quiet-window gate + dist (Step 4 CLI + Step 6)`

(Two interleaved commits from other work — `c03561ca` and `ecc2cc39` for phase-9-followup-6 — landed between Step 3 and Step 4 of 10a. They are unrelated and don't touch any 10a surface.)

---

## Files changed

### New source files (core)

- `packages/core/src/services/commitments-hash-v2.ts` — text normalizer + `computeCommitmentHashV2`.
- `packages/core/src/services/commitments-counterparty-parser.ts` — owner-as-personSlug parser (Steps 0–3 of plan §"Migration plan (v2)").
- `packages/core/src/services/commitments-v2-flag.ts` — feature-flag resolver (env + workspace config).
- `packages/core/src/services/migrations/migrate-to-v2.ts` — migration engine + `formatMigrationDiff`.

### New test files

- `packages/core/test/models/commitment-v2-shape.test.ts` (6 cases).
- `packages/core/test/services/commitments-hash-v2.test.ts` (22 cases).
- `packages/core/test/services/commitments-counterparty-parser.test.ts` (27 cases).
- `packages/core/test/services/commitments-v2-flag.test.ts` (10 cases).
- `packages/core/test/services/migrations/migrate-to-v2.test.ts` (13 cases).
- `packages/cli/test/integration/commitments-migrate.integration.test.ts` (5 cases — tmp-workspace integration).

### Modified source files

- `packages/core/src/models/entities.ts` — `Stakeholder` + `StakeholderRole` + `ExternalSource` types; `Commitment` extended with optional `stakeholders[]`, `source_meetings[]`, `source_external[]`, `textVariants[]`; `CommitmentDirection` gains `'self'`; `COMMITMENT_TEXT_VARIANTS_MAX = 5` exported.
- `packages/core/src/models/index.ts` — new exports for the v2 types + cap constant.
- `packages/core/src/services/index.ts` — exports for steps 2–5 modules.
- `packages/cli/src/commands/commitments.ts` — `arete commitments migrate` verb.

### Dist

All `packages/core/dist/**` and `packages/cli/dist/**` artifacts rebuilt and committed.

---

## Test status

Unit + integration tests (Steps 1–6):

```
packages/core
  test/models/commitment-v2-shape.test.ts                          6 pass
  test/services/commitments-hash-v2.test.ts                       22 pass
  test/services/commitments-counterparty-parser.test.ts           27 pass
  test/services/commitments-v2-flag.test.ts                       10 pass
  test/services/migrations/migrate-to-v2.test.ts                  13 pass

packages/cli
  test/integration/commitments-migrate.integration.test.ts         5 pass
                                                                  --
                                                                  83 pass
```

Regression sweep against pre-existing commitments tests (passing on
top of phase-10a changes):

```
packages/core
  test/services/commitments.test.ts                                ok
  test/services/commitments-counterparty-overlap.test.ts           ok
  test/services/commitments-withlock.test.ts                       ok
  test/services/migrations/add-created-at.test.ts                  ok
```

Build:

```
npm run build:packages    ← tsc -b packages/core packages/cli passes
```

---

## What landed (mapped to plan ACs)

| Plan AC | What this build delivered |
|---------|---------------------------|
| AC1     | `arete commitments migrate --to-v2 --dry-run` produces `migration-diff-YYYY-MM-DD.md` in `dev/work/plans/.../phase-10-winddown-orchestrator/` (per AC1 audit artifact persistence). |
| AC1a    | Owner-as-personSlug arrow notation row migrates to `stakeholders: [{slug: dave-wiedenheft, role: recipient}]` with owner excluded. Test fixture row id `04*`. |
| AC1b    | "Note to self: prep for Dave's review" routes to `direction: 'self'` with Dave NOT in stakeholders (Step 0 pre-check). All 6 self-marker prefixes covered. |
| AC1c    | `--apply` writes the v2 commitments.json + retains the old file at `.arete/commitments.pre-phase-10.json`. Verified via tmp-workspace integration test (NOT run against production). |
| AC1d    | `arete commitments restore --from <snapshot>` already existed from phase-10a-pre. The migrate verb's success message points the user at it for rollback. |
| AC1e    | Bare-name ambiguity (e.g., two Lindsays) → `ambiguous: true` row with candidate list. Sidecar at `.arete/commitments.pre-phase-10-ambiguities.json` resolves; `--apply` blocks until all ambiguities resolved. |
| AC1f    | Partial-failure recovery via pre-migration snapshot **PLUS** atomic write at the storage-adapter layer. `packages/core/src/storage/file.ts:30-42` writes via a `randomBytes(6)`-suffixed tmp file in the same directory, then `fs.rename` (POSIX-atomic). Readers see either the old or new content, never a torn write. The pre-migration snapshot is the LOGIC-bug recovery anchor (we wrote bad content); the tmp+rename is the I/O-bug recovery anchor (we crashed mid-write). Updated 2026-06-04 by phase-10a-fixup; original build report said "adapter does not yet implement tmp+rename atomicity" — that was wrong. |
| AC1g    | `formatMigrationDiff` emits a delta-source breakdown section when caller passes `meta.deltaSources` (new-extract / manual-resolve / manual-drop / manual-create). The CLI path that computes deltas is **not yet wired** — this is reactive for the post-3-5-day delta path of `--apply`. |
| AC1h    | `--apply` blocks when `commitments.json` mtime is within 24h, with override via `--force-after-triage`. Integration test verifies the block + override path. |

Step 5 (feature flag, AC0a-adjacent): wired but NOT activated. The R4 dual-shape helper from phase-10a-pre already reads both v1 and v2 shapes, so the flag's purpose is mostly to gate any *new* downstream readers added in Phase 10b — none in 10a flip it.

Step 6 (--apply gate): wired with both the 24h guard (AC1h) and the ambiguity guard (AC1e). Both verified in CLI integration tests.

---

## Verification commands (for user)

All commands operate on a tmp workspace by default. **None of these
touch arete-reserv data** unless explicitly pointed there.

### Run the full phase-10a test suite

```bash
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core
npx tsx --test \
  test/models/commitment-v2-shape.test.ts \
  test/services/commitments-hash-v2.test.ts \
  test/services/commitments-counterparty-parser.test.ts \
  test/services/commitments-v2-flag.test.ts \
  test/services/migrations/migrate-to-v2.test.ts
```

```bash
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/cli
npx tsx --test test/integration/commitments-migrate.integration.test.ts
```

### Dry-run the migration against arete-reserv data (READ-ONLY)

**This will NOT write to commitments.json — only the diff report.**

```bash
cd /Users/john/code/arete-reserv
arete commitments migrate --to-v2 --dry-run \
  --owner-slug john-koht \
  --diff-dir /tmp/arete-phase-10-diffs
```

Expected: a `migration-diff-YYYY-MM-DD.md` file in `/tmp/arete-phase-10-diffs/`.
Check the **Ambiguous** section for rows that need disambiguation BEFORE
any future `--apply` run.

### Read the diff report

```bash
less /tmp/arete-phase-10-diffs/migration-diff-*.md
```

Sections in priority order:
1. Ambiguous (must resolve via sidecar before --apply)
2. Status conflict (mixed status across rows in a group)
3. Self-rewrite (owner-as-personSlug rows that became `direction: 'self'`)
4. Collapsed (multi-row groups → one canonical)
5. Pass-through (compact list — single-row groups)

### To resolve ambiguities (when ready)

Edit `.arete/commitments.pre-phase-10-ambiguities.json` in the
workspace (json-only sidecar). Shape:

```json
{
  "disambiguations": [
    { "commitmentId": "<full-id>", "name": "Lindsay", "slug": "lindsay-gray" }
  ]
}
```

Re-run `--dry-run` to verify ambiguous count drops to 0.

### Rebuild dist after pulling

```bash
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator
npm run build:packages
```

---

## Known issues / caveats

1. **Storage-adapter atomic writes (AC1f)** — UPDATED 2026-06-04
   (phase-10a-fixup): the original caveat ("adapter does NOT yet
   implement tmp+rename atomicity") was FACTUALLY WRONG. The
   `FileStorageAdapter.write` method at
   `packages/core/src/storage/file.ts:30-42` writes via a
   `randomBytes(6)`-suffixed tmp file in the same directory, then
   `fs.rename` into place. POSIX `rename(2)` is atomic within a
   filesystem, so readers see either the old content or the new
   content — never a torn write. AC1f is therefore satisfied at
   TWO independent layers: (a) the storage adapter for I/O-bug
   recovery, and (b) the pre-migration snapshot
   (`.arete/commitments.pre-phase-10.json`) for logic-bug
   recovery. The error message on failed write tells the user
   the exact `restore` command for case (b).

2. **Delta-diff at --apply time (AC1g)** — the engine + diff
   writer support delta source breakdowns, but the CLI does NOT
   currently compute deltas at apply time (i.e., compare the
   apply-time diff against the prior dry-run diff and surface the
   difference). The user runs `--dry-run` again before `--apply`
   to see the current state; the delta-source counts in the diff
   markdown are reserved for a future helper that computes the
   diff-between-diffs. Not blocking for the user's AM workflow
   (they read the post-window dry-run; if it differs materially
   they investigate manually).

3. **Owner-slug must be passed manually** — the CLI requires
   `--owner-slug <slug>` because there is no canonical "workspace
   owner" field in `arete.yaml` / `.arete/config.json` today. A
   follow-up could add `owner_slug` to `AreteConfig` and
   auto-detect; for now the user passes it explicitly.

4. **Feature flag not activated** — `COMMITMENTS_V2_ACTIVE` is
   wired (Step 5) but not flipped. The intent is for the user to
   flip via env (`ARETE_COMMITMENTS_V2_ACTIVE=true`) after
   `--apply` has run successfully and they've verified the
   workspace looks correct.

5. **Multi-token name resolution conservatism** — Step 2 of the
   parser combines "Lindsay" + a following capitalized token only
   if the COMBINED key exists in the directory. So "to Lindsay's"
   matches "to Lindsay" (apostrophe-s is not capitalized) but
   wouldn't pick "Lindsay Gray" out of "Lindsay Gray's deck". This
   is intentional — under-grab is safer than over-grab; ambiguous
   rows surface for user review.

6. **No `node:fs` "unrelated" lint complaint** — the migration
   engine module is pure (only imports `node:crypto` for sha256).
   The CLI handles all I/O via the storage adapter. No new
   filesystem coupling introduced at the service layer.

---

## What's left undone (explicitly out of scope per the brief)

- **NO `arete commitments migrate --apply` was run against arete-reserv**
  (or anywhere else). The user runs this in the AM after reviewing
  the dry-run output per Phase 10a brief.

- **NO LLM calls** — the migration is fully deterministic. Semantic
  dedup is Phase 10b.

- **NO push to remote, NO merge into parent branch** — all work
  remains on the worktree branch `worktree-arete-v2-chef-orchestrator`.

- **Feature flag NOT activated** — the v2 read path stays gated FALSE
  by default. Flip per workspace via env or config (see Step 5).

- **R4 set-overlap downstream readers not yet hardened to honor the
  flag** — they already read both shapes via
  `getCommitmentCounterpartySlugs` (phase-10a-pre). Phase 10b /
  follow-ups can promote v2-only reads behind the flag.

- **AC1g delta-diff CLI wiring** — engine supports it; CLI does
  not yet compute deltas at apply time (see "Known issues" #2).

---

## Recommended next steps

1. **User: run `--dry-run` against arete-reserv.** Read the
   `migration-diff-YYYY-MM-DD.md`. Note the ambiguous count.

2. **User: resolve any ambiguous rows** via the sidecar JSON
   (`.arete/commitments.pre-phase-10-ambiguities.json`).

3. **User: wait at least 24h after the last manual triage**
   (the gate enforces this; the rationale is so the diff is
   stable when --apply runs).

4. **User: run `--apply`.** This writes the v2 commitments.json
   + the pre-migration snapshot.

5. **User: optionally flip the feature flag** via env:
   `ARETE_COMMITMENTS_V2_ACTIVE=true arete brief person <slug>`
   to exercise v2 read paths in any UI/brief surface that gets
   hardened to honor the flag in Phase 10b.

6. **If anything goes wrong**:
   `arete commitments restore --from /Users/john/code/arete-reserv/.arete/commitments.pre-phase-10.json`
   restores byte-equal pre-migration content.
