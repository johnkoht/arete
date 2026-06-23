# Theme-render v1 (coarse) — BUILD REPORT (Gate 4, final integration)

Branch: `feat/winddown-approval-doc`. Plan: `dev/work/plans/theme-render/plan.md`.
Golden fixture / expected output: `dev/work/plans/theme-render/MOCK.md`.

Theme-render reorganizes the daily winddown approval doc **by project/area instead of by
meeting**, so the supersession arc (#22) is visible by construction. v1 is COARSE: a whole
meeting is assigned to its dominant theme (reusing the already-shipped Step-2.0 `topics:`
surface), meetings are clustered by theme, reconciled chronologically within a theme, and
rendered theme-grouped. It is flag-gated (`winddown_render: theme`); `checklist`/`prose` are
unchanged.

## What shipped (v1 coarse)

- **Cluster + chronological reconcile seam** (`winddown-theme-cluster.ts`): groups today's
  meetings by assigned theme, orders each cluster oldest→newest, and carries a superseded
  skip-reason discriminator (`kind: 'dedup' | 'superseded'`) so the render can tell an arc
  flip from a dedup skip. Count conservation is asserted at the cluster boundary.
- **Theme render** (`winddown-theme-render.ts`): `ThemeView` / `renderThemeView` /
  `buildThemeView` / `pickDominantTheme`. Emits `## <project/area>` sections with
  consolidated Decisions / Action items / Learnings, the supersession arc inline (struck-
  through `[ ]` with the verbatim reason + linked superseding target), an always-present
  `## ⚠ Uncategorized` structural bucket, and a `## Notes` chef-reasoning section. Every
  item line is emitted through the SHARED `renderItemLine` so anchor bytes are identical to
  checklist mode (apply path unchanged — D4/AC6).
- **Flag**: `winddown_render: theme` accepted by the config type, default, and clamp.
- **Golden replay** (`winddown-theme-render-golden-6-18.test.ts`): the 6/18 status-letter
  day, deterministic, covering AC1/2/3/5/6/7.
- **Production round-trip e2e** (Gate 4 — `winddown-render.test.ts`): a REAL meeting file
  carrying a `staged_item_skip_reason{kind:superseded,matchedRef}` rendered through the live
  CLI proves the parse→dispatch→render seam the golden test stubs (see below).
- **MOCK typo fix**: `ln_002@…` → `le_002@…` (the apply `ITEM_ANCHOR_RE` only matches
  `ai|de|le`; `ln_` was not anchor-recoverable).

## Gate history + commits

- Gate 1 — `a3b2bc4c`, `c168f86c`: theme cluster + chronological reconcile seam; superseded
  skip discriminator; SKILL Step 2.0b.
- Gate 2 — `016045ee`, `3ecd0c85`: theme render (`ThemeView`/render fns/`pickDominantTheme`),
  shared `renderItemLine`, hardening (3 eng-lead nits).
- Gate 3 — `c01c5e99`: 6/18 golden replay (AC1/2/3/5/6/7).
- Gate 4 (this) — production round-trip CLI test + MOCK typo fix + BUILD-REPORT.

## Test suite + typechecks

- Full suite (node:test, core + cli): **5104 pass, 0 fail, 2 skipped** (2 pre-existing
  skips, unrelated).
- `tsc --noEmit -p packages/core`: **clean (exit 0)**.
- `tsc --noEmit -p packages/cli`: **clean (exit 0)**.
- (Pre-existing backend error `review.ts:113` is out of scope and not in the gated path.)

## Production round-trip result (the Gate-4 prize)

The golden test feeds `ChecklistMeeting` metas directly, so it cannot prove that a REAL file
parses into a superseded arc. The new CLI test writes an actual morning meeting markdown with
`topics: [status-letter-automation]` and a full `staged_item_skip_reason` entry
(`kind: superseded`, `matchedRef: de_004@…`, plus the required `reason`/`evidence`/`setBy`/
`setAt`), plus the afternoon meeting that superseded it, then runs the real
`arete winddown render 2026-06-18` under `winddown_render: theme` and asserts:

- the morning decision renders `- [ ] ~~…~~ — superseded by … → [[de_004@2026-06-18-status]]`
  (struck through, never elevated, arc reason inline, superseding target linked, anchor
  retained for rescue);
- the afternoon decision is the elevated `[x]`;
- both grouped under `## status-letter-automation` (not the meeting titles);
- count-conserved (each anchor once).

**Result: PASS. No integration gap — the live parse path (`buildChecklistMeeting` →
`parseStagedItemSkipReason`) already populates `skipKind` from a real file.** No parser/dist
fix was needed. The seam (real-file parse → CLI dispatch → spine resolution →
`pickDominantTheme` → theme render) is proven end-to-end.

## What is flag-gated / safe

- Default render mode is **`prose`** (config default) and the soak workspace is pinned to
  **`checklist`**; theme mode activates ONLY when `arete.yaml` sets `winddown_render: theme`.
- An unknown `winddown_render` value clamps to `prose` (cannot half-activate a pipeline).
- `checklist` and `prose` render paths are untouched; AC7 asserts the default path does not
  emit any theme structure. Anchor bytes are identical, so apply / baseline / rollback are
  unchanged in either direction (no data migration).
- Rollback = flip the flag back to `checklist`.

## What is DEFERRED to v2 (NOT built)

- Item-level theme assignment (a meeting's items split across themes; new
  `staged_item_theme` map + parser + cleanup-filter wiring + verb).
- Cross-cutting decomposition (one meeting's items distributed across N theme sections).
- Slack / email / Jira weave into theme narratives.
- Weekly parity (same engine, week horizon).
- #20 open-commitment mechanization into the Rule-4 leg.

## What is a Layer-3 SOAK metric — NOT yet validated by tests

The deterministic structure is fully tested; the **judgment** layers are only validated by
the single 6/18 worked example and must be measured in soak by hand-audit:

- **AC4 — assignment accuracy** (≥90% meetings on-label vs a hand-labeled key). Only the 6/18
  fixture exercises it; real distribution + the degenerate-distribution alarm (>70% one theme
  or >40% Uncategorized) need soak days.
- **AC8 — latency** (≤ +20% wall-clock vs checklist). Not measured; the per-theme passes
  *replace* the per-meeting reconcile, but the real budget needs a soak run.
- **The actual chef supersession judgment** — deciding *that* a later decision supersedes an
  earlier one is chef semantics; the render faithfully shows whatever the chef marked, but
  whether the chef marks correctly is the thing soak measures (mis-supersession is the AC5
  risk; the rescue path — superseded items stay `[ ]` with anchors — is the safety valve).

## How John tries it (and rolls back)

1. In `~/code/arete-reserv/arete.yaml`, set `winddown_render: theme` (currently `checklist`).
2. Run a winddown for a day with multiple meetings on the same project (the 6/18-style
   status-letter arc is the canonical case). The doc groups by `## <project/area>`, shows the
   arc inline, and always includes `## ⚠ Uncategorized`.
3. Approve via the same checkbox-diff + `arete winddown apply <date>` flow — unchanged.
4. **Roll back**: set `winddown_render: checklist` (or `prose`). No migration; anchors and the
   apply baseline are byte-identical across modes.

SOAK plumbing is refreshed: the SKILL copy at
`~/code/arete-reserv/.arete/skills/daily-winddown/SKILL.md` was re-cp'd (now carries Step
2.0b / theme mode), and the npm-linked global `arete` resolves to this worktree's CLI + core
(theme symbols present) — verified by a live theme render through the global binary.

## Honest residual risks

- **Soak core resolution is symlink-realpath dependent.** The global `arete` bin is a symlink
  into this worktree's CLI; `@arete/core` resolves via the realpath up-walk to THIS worktree's
  core (verified by a live `arete winddown render` producing theme output). A naive
  `require.resolve` from the *global* `node_modules/@arete/cli-next` dir instead points at a
  different worktree's core that LACKS the theme symbols — harmless at runtime, but a trap if
  anyone reasons about resolution from the global path rather than the realpath.
- **SKILL doc says default `checklist`; config default is `prose`.** SKILL.md Step 2.0b text
  reads "default `checklist`", but `config.ts` defaults `winddown_render` to `prose` and
  clamps unknowns to `prose`. The soak workspace pins `checklist` explicitly, so the soak
  story is consistent, but the SKILL's parenthetical is inaccurate vs the code default
  (cosmetic; left as-is to avoid a non-gate SKILL edit — flag for John).
- **Judgment is single-fixture validated.** AC4/AC8 and chef supersession correctness are
  soak metrics, not tests (see above).
