# Code review — Phase 10b-aux (`--explain` + `[[unmerge]]` + winddown surfacing)

**Reviewer**: senior staff eng (code-check pass)
**Date**: 2026-06-05
**Scope**: AC7, AC8, AC8a, AC4a + SKILL.md wiring. 37 tests claimed.
**Verdict**: **APPROVE WITH MINOR**. Code is intact, correct, and tested. One
real correctness gap (HIGH) in `[[unmerge]]` dupe-selection that is masked in
the happy path but mis-fires on 3+-source canonicals; the SKILL.md driver can
work around it but the module does not honor the directive's `dupeId`. Commit
mislabeling is cosmetic — confirmed.

---

## AC coverage

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC7** `dedup --explain <id>` | PASS | `dedup-explain.ts:183` `formatExplainReport`: canonical text, dual-shape stakeholders w/ roles (`formatStakeholders:255` — v2 `stakeholders[]` else v1 `personSlug` with inferred role), source_meetings with per-source provenance (`provenanceForSource:293`), textVariants w/ `N/5` + at-capacity eviction note (`:219-230`), raw log overlay. CLI wired read-only (`dedup.ts:309 runExplain`): full-hash + prefix + ambiguous + not-found + `--json`. R10 honored — reads current commitment state, log is overlay. |
| **AC8** `[[unmerge]]` | PARTIAL (see HIGH-1) | `unmerge-directives.ts`: parser handles unicode `←` + ASCII `<-` + whitespace (`UNMERGE_PATTERN:62`). `resolveUnmerge:140` splits dupe to independent `open` commitment with ORIGINAL text from `textVariants[]` (Q7), peels source + variant off canonical, mints fresh v2 hash, emits UNMERGE payload. Pure (input not mutated — test-verified). **But `directive.dupeId` is never used to select WHICH source/variant to split** (see HIGH-1). |
| **AC8a** discoverability | PASS | `formatDedupedTodaySection:52` emits `### Deduped today (N merges)` with an inline copy-paste `[[unmerge: <canonical> ← <dupe>]]` hint per merge (`:68`). SKILL.md Step 3.5 + first-week banner (`SKILL.md:826,866`). |
| **AC4a** UNCERTAIN surface | PASS | `formatPossiblyMergeableSection:82` emits `### Possibly mergeable` for UNCERTAIN rows; SKILL.md Step 3.5 renders it. |
| **AC9** (reuse) | PASS | Read side (`parseDedupLog`) + UNMERGE write reuse `appendDedupDecisionLog` from 10b-min (`dedup-decisions-log.ts:157`). SKILL.md Step 2.6 wires the write under `commitments.withLock`. |
| SKILL.md Step 3.5 / Step 2.6 | PASS | Step 3.5 (`:826`) reads log → today-scope → both sections + banner. Step 2.6 (`:872`) parses prior-winddown directives, resolves under lock, appends log, surfaces `no-canonical`/`nothing-to-split` `.message` in `## Notes`. Ordered correctly (2.6 before 3.5, `:900`). |
| Immutable transforms | PASS | `resolveUnmerge` builds `nextCommitments` via `.map` + `.push`; test "does not mutate the input commitment list" passes. |
| no-canonical / nothing-to-split | PASS | Both branches present (`:146`, `:155`) and tested. |
| do-not-touch list | PASS | `git diff b7c82fa8..HEAD` over `commitment-dedup-pipeline.ts`, `commitment-dedup-extract.ts`, `extract-dedup-wiring.ts`, `staged-items.ts` → empty. Untouched. |
| 37 tests pass | PASS | Ran the four suites: `tests 37 / pass 37 / fail 0`. |

---

## Commit-mislabeling: COSMETIC — confirmed

The build report's mapping is accurate and verified:

- `b85a342f` (labeled `phase-11a`) contains `dedup-explain.ts` (313 LOC) + its
  test (189 LOC) + the `dedup.ts` `--explain` wiring (+113) + index export.
- `c178b707` (labeled `phase-11a`) contains `unmerge-directives.ts` +
  `dedup-winddown-surface.ts` + both tests + index exports (alongside genuine
  phase-11a resolution-pipeline files).
- `7192f307` (correctly `phase-10b-aux(skill)`) carries the SKILL.md prose.

The 10b-aux source is byte-present in the worktree and on the branch; the only
defect is the commit *subject line* attributing three core modules to
`phase-11a`. No code is missing, no code is duplicated, no phase-11a logic
leaked into the 10b-aux modules. Impact is limited to `git log`/`git blame`
archaeology and any phase-gating that greps commit subjects. **It does not
affect correctness, behavior, or AC coverage.** Optional cleanup
(cherry-pick-split) is nice-to-have, not blocking.

One note worth flagging to the next builder beyond the report: `c178b707` also
committed the **`dist/` build artifacts** for these modules (per repo
convention — commit dist). Those dist files therefore also ride under the
`phase-11a` label. Same cosmetic conclusion.

---

## HIGH

**HIGH-1 — `[[unmerge]]` ignores the directive's `dupeId`; always peels the LAST source/variant.**
`resolveUnmerge` (`unmerge-directives.ts:140`) resolves the canonical by id,
then *unconditionally* splits off `sources[sources.length - 1]` and the LAST
non-canonical `textVariant` (`:169`, `:177`). `directive.dupeId` is parsed
(`:74`) and lowercased but used ONLY in error-message interpolation (`:149`,
`:158`) — never to select which merged source/variant to peel.

Consequence: for a canonical with exactly two sources (one merged), the result
is correct by coincidence. For a canonical that absorbed **2+ dupes**, a user
who writes `[[unmerge: <canon> ← <the-FIRST-dupe>]]` gets the LAST dupe split
out instead — silently wrong, and the only signal is the log reasoning string
naming the actually-split meeting. AC8 says "splits the dupe **entry pointed
to**"; the current code points at "whatever merged most recently."

The build report's follow-up #2 acknowledges adjacent imprecision and suggests
the SKILL.md driver pass `opts.dupeMeetingSlug`. But (a) the driver can only do
that if it can map `dupeId → meeting slug`, and the dedup log keys decisions on
item-id, not slug — there is no shipped slug lookup; and (b) even with
`dupeMeetingSlug`, the **variant** selection still ignores it (`splitText` is
always the last non-canonical variant, independent of `dupeMeetingSlug`), so a
3-source unmerge can pair the right meeting with the wrong original text.

Recommendation (cheapest first): plumb `dupeId` into `resolveUnmerge` and, when
the canonical's source/variant arrays are index-aligned (or when a
`dupeMeetingSlug` is supplied), select the matching pair; fall back to the
current last-wins only when no mapping is possible, and say so in the log
reasoning. At minimum, add a test with a 3-source canonical asserting the
named dupe (not the last) is the one split, and document the last-wins fallback
in the "Deduped today" hint so the user knows ordering matters. Acceptable to
defer to a 10b-aux follow-up IF the soak only exercises 2-source canonicals —
but that is an empirical bet, not a guarantee.

---

## LOW

**LOW-1 — `provenanceForSource` labels every merged source with the SAME merge detail.**
`dedup-explain.ts:293` annotates the first source as "(original)" and *every*
subsequent source with `relevant.find(MERGE|UNCERTAIN)` — i.e. the first merge
entry in the log, repeated. The docstring honestly admits the log carries no
slug→id mapping, but the rendered report can attach meeting B's jaccard/tier to
meeting C's line. For `--explain` (an audit surface) this is mildly
misleading. Low because it is observability-only and the raw log overlay below
shows the true per-entry detail. Consider rendering "(deduped; see Dedup
decisions below)" generically for all non-first sources rather than
synthesizing a per-source jaccard it cannot actually attribute.

**LOW-2 — `idMatches` / `idsMatch` bidirectional-prefix can over-match short ids.**
Both modules treat ids as matching when *either* is a prefix of the other
(`dedup-explain.ts:122`, `unmerge-directives.ts:112`). With short staged-item
ids like `ai_004`, `ai_0042` and `ai_0043` mutually prefix-match `ai_004`.
`lookupCommitmentById` guards this with an explicit ambiguous branch, but
`filterLogForCommitment` and `resolveUnmerge`'s canonical lookup take the
first/all loose matches with no ambiguity guard. Low risk for full-hash
canonical ids (the common case); worth a min-length floor (the lookup path
already implies ≥4) if staged-item ids ever flow through these paths.

**LOW-3 — Footer attribution `Claude Opus 4.7`.** Per the build report and repo
memory the standard is `4.8`. Cosmetic; flag for standardization (matches the
builder's own follow-up #3). Not a 10b-aux defect.

---

## Notes / non-blocking

- Direction enum: the model uses `'i_owe_them' | 'they_owe_me' | 'self'`
  (`entities.ts:217`), NOT the `outbound|inbound` shape the plan prose uses.
  `formatStakeholders` correctly maps `they_owe_me → sender`, else `recipient`
  (`dedup-explain.ts:269`). The brief's "dual v1/v2 shape aware" requirement is
  met; the plan's `outbound/inbound` wording is just stale prose.
- `resolveUnmerge` sets the split-out commitment `status: 'open'`,
  `resolvedAt: null` — both valid under `CommitmentStatus` / `resolvedAt:
  string|null`. Good: a re-independent obligation should be open.
- Best-effort log write honored end-to-end: `appendDedupDecisionLog` swallows
  errors; `runExplain` treats a missing log as an empty overlay (`dedup.ts:354`).
- `parseDedupLog` tolerance (skip <7-col / unknown-decision / blank) is correct
  for an append-only best-effort log.
