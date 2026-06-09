# Build report — Phase 10b-aux (audit + recovery controls for dedup)

**Status**: COMPLETE — 3 steps shipped, all tests pass, dist rebuilt.
**Authored**: 2026-06-05
**Scope**: `arete dedup --explain` (AC7), `[[unmerge]]` directive (AC8),
decision-log surfacing in winddown (AC8a / AC4a + AC9 reuse).
**Invariants honored**: NO LLM execution against production (all tests
mock / use deterministic fixtures), NO production data writes (pure
modules + tmp-dir integration tests). Did NOT touch the settled modules
(`commitment-dedup-pipeline.ts`, `commitment-dedup-extract.ts`,
`extract-dedup-wiring.ts`, `integrations/gws/*`, `staged-items.ts:718-738`).

---

## ⚠️ Commit-hook note (read first)

A worktree auto-commit hook (driven by concurrent phase-11a work in this
same worktree) swept my source + tests into commits labeled
`phase-11a(core): …` BEFORE I could make clean per-step
`phase-10b-aux(...)` commits. The CODE is intact and correct; only the
commit labeling is wrong. Mapping:

| 10b-aux artifact | Landed in commit |
|---|---|
| `dedup-explain.ts` + test + CLI `--explain` wiring + index export | `b85a342f` (mislabeled `phase-11a`) |
| `unmerge-directives.ts` + test + index export | `c178b707` (mislabeled `phase-11a`) |
| `dedup-winddown-surface.ts` + test + index export | `c178b707` (mislabeled `phase-11a`) |
| SKILL.md prose (Step 2.6 + Step 3.5 + curated-view section) | `7192f307` `phase-10b-aux(skill): …` (correct) |

Only the final SKILL.md change was still uncommitted by the time I could
commit, so it carries the correct convention + footer. If clean history
matters, the three core modules can be cherry-pick-split off the two
`phase-11a` commits — but they are functionally complete and tested as-is.
Footer used: `Co-Authored-By: Claude Opus 4.7 (1M context)`.

---

## Step 1 — `arete dedup --explain <commitment-id>` (AC7)

**Files**
- `packages/core/src/services/dedup-explain.ts` (new) — pure module:
  - `parseDedupLog(raw)` — tolerant parse of `dedup-decisions.log`'s
    fixed-column shape (`ISO decision newId canonicalId jaccard llmTier
    llmDecision reasoning…`); skips blank / malformed / unknown-decision
    lines.
  - `lookupCommitmentById(commitments, idOrPrefix)` — full-hash, prefix,
    `ambiguous`, `not-found`.
  - `filterLogForCommitment(entries, id)` — prefix match on canonicalId
    (handles `canon_` short form).
  - `formatExplainReport(commitment, logEntries)` — AC7 shape: canonical
    text, stakeholders WITH roles (dual-shape: v2 `stakeholders[]` else v1
    `personSlug`), source meetings with per-source provenance annotation,
    `textVariants` with N/5 capacity + eviction note, and the raw dedup
    decisions overlay.
- `packages/cli/src/commands/dedup.ts` (extended) — `--scope` changed from
  `requiredOption` to `option`; added `--explain <commitment-id>`; an
  early `runExplain()` branch reads commitments.json + the log and prints
  the report (text or `--json`). Read-only — no writes, no LLM.
- `packages/core/src/services/index.ts` — exports.

**R10 honored**: `--explain` reads CURRENT state from the commitment for
stakeholders / sources / variants; the log is an observability overlay,
not source of truth.

**Tests**
- `packages/core/test/services/dedup-explain.test.ts` — 10 tests:
  parse (well-formed / malformed-skip), filter-by-prefix, lookup
  (prefix / full / ambiguous / not-found), AC7 fixture (3 source meetings
  + 2 log entries → all provenance present), v1 fallback, 5/5 capacity.
- `packages/cli/test/integration/dedup.integration.test.ts` (extended) —
  4 new tests: provenance print, `--json` payload, unknown-id error,
  `--scope`-missing error. tmp workspace, NO LLM.

---

## Step 2 — `[[unmerge]]` directive (AC8)

Parallel parser to the followup-2 `[[unskip]]` / `[[confirm-skip]]`
infrastructure (its payload — two ids joined by `←` — differs from the
single-id skip directives, so a sibling parser is cleaner than
generalizing).

**Files**
- `packages/core/src/services/unmerge-directives.ts` (new) — pure module:
  - `parseUnmergeDirectives(content)` — matches
    `[[unmerge: <canonical> ← <dupe>]]` (unicode `←` OR ASCII `<-`,
    whitespace-tolerant); multiple per view.
  - `resolveUnmerge(commitments, directive, opts)` — pure transform
    (does NOT mutate input). Splits the dupe back out as an INDEPENDENT
    `open` commitment carrying its ORIGINAL extracted text recovered from
    the canonical's `textVariants[]` (Q7), peels that source meeting +
    variant off the canonical, mints a fresh v2 hash, and returns an
    `UNMERGE` `DedupDecisionLogPayload` for the caller to write
    best-effort. Branches: `resolved` / `no-canonical` /
    `nothing-to-split`.
- `packages/core/src/services/index.ts` — exports.

**Tests**
- `packages/core/test/services/unmerge-directives.test.ts` — 9 tests:
  parse (unicode / ASCII / multiple / none), split-out (original text
  restored, canonical sources+variants updated, count grows, UNMERGE
  payload), explicit `dupeMeetingSlug`, no-canonical, nothing-to-split,
  input-immutability.

---

## Step 3 — decision-log surfacing in winddown (AC8a / AC4a)

**Files**
- `packages/core/src/services/dedup-winddown-surface.ts` (new) — pure
  formatters:
  - `filterLogByDate(entries, isoDate)` — scope to today.
  - `formatDedupedTodaySection(entries)` — `### Deduped today (N merges)`
    with an inline copy-paste `[[unmerge: <canonical> ← <dupe>]]` hint per
    merge (F3). `''` when no merges.
  - `formatPossiblyMergeableSection(entries)` — `### Possibly mergeable`
    for UNCERTAIN rows (AC4a). `''` when none.
  - `formatDedupWinddownSections(entries, isoDate)` — both, joined; `''`
    when the day had no activity.
- `packages/runtime/skills/daily-winddown/SKILL.md` (extended):
  - **Step 3.5** — read the log, scope to today, emit the two sections;
    first-week banner per AC8a.
  - **Step 2.6** — resolve prior-winddown `[[unmerge]]` directives via
    `parseUnmergeDirectives` + `resolveUnmerge` under
    `commitments.withLock`, write the UNMERGE log line, surface
    `"Unmerged N commitment(s)"` / status messages in `## Notes`.
  - Curated-view template gains a `## Dedup activity (phase-10)` section.
- `packages/core/src/services/index.ts` — exports.

**Tests**
- `packages/core/test/services/dedup-winddown-surface.test.ts` — 7 tests:
  date-scope, 3-MERGE section (3 unmerge hints, exact-hash note),
  1-UNCERTAIN section, combined (prior-day row excluded), empty cases.

---

## Test status

```
core dedup-explain.test.ts            10 pass
core unmerge-directives.test.ts        9 pass
core dedup-winddown-surface.test.ts    7 pass
cli  dedup.integration.test.ts        11 pass (4 new --explain + 7 prior)
-------------------------------------------------
total                                 37 pass / 0 fail
```

`npm run typecheck` (tsc -b core + cli): clean.
`npm run build:packages`: clean. dist rebuilt for both packages.

---

## AC coverage

| AC | Status | Where |
|----|--------|-------|
| **AC7** (`dedup --explain`) | ✅ | `dedup-explain.ts` + CLI `--explain`; fixture-validated output (canonical text, stakeholders w/ roles, sources w/ provenance, textVariants w/ eviction state, log overlay). |
| **AC8** (`[[unmerge]]`) | ✅ | `unmerge-directives.ts`: parse → split dupe out, canonical sources updated, original text restored (Q7), UNMERGE logged; SKILL.md Step 2.6 wires the winddown resolution. |
| **AC8a** (discoverability) | ✅ | `formatDedupedTodaySection` inline `[[unmerge]]` hints + first-week banner in SKILL.md Step 3.5. |
| **AC4a** (UNCERTAIN surface) | ✅ | `formatPossiblyMergeableSection` + SKILL.md "Possibly mergeable" section. |
| **AC9** (decisions.log) | reused | Writer shipped in 10b-min; `appendDedupDecisionLog` reused by the Step 2.6 UNMERGE path. 10b-aux adds the READ side (parse + surface + explain). |

---

## Verification commands

```bash
# typecheck + build
npm run typecheck
npm run build:packages

# 10b-aux unit + integration tests
ARETE_SEARCH_FALLBACK=1 ./node_modules/.bin/tsx --test \
  packages/core/test/services/dedup-explain.test.ts \
  packages/core/test/services/unmerge-directives.test.ts \
  packages/core/test/services/dedup-winddown-surface.test.ts \
  packages/cli/test/integration/dedup.integration.test.ts

# manual --explain smoke (against a tmp workspace; no production data)
arete dedup --explain <8-char-prefix>
arete dedup --explain <8-char-prefix> --json
```

---

## Follow-ups / notes for the next builder

1. **Commit hygiene**: the three core modules ride in `phase-11a`-labeled
   commits (auto-hook). Optional cleanup: cherry-pick-split for clean
   `phase-10b-aux(core)` history. Functionally complete as-is.
2. **`resolveUnmerge` dupe-text recovery** picks the LAST non-canonical
   `textVariants[]` entry when `dupeMeetingSlug` isn't supplied. The
   SKILL.md Step 3.5 "Deduped today" entries carry both ids, so the
   winddown driver SHOULD pass `dupeMeetingSlug` when it can map the dupe
   id → its source meeting for precise splits. Documented in the module.
3. **Footer**: brief asked for `Co-Authored-By: Claude Opus 4.7`; used
   verbatim. (Repo convention elsewhere uses 4.8 — flag if standardizing.)
