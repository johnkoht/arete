# Phase 10a fixup — code-review HIGH/LOW patches — Build Report

**Phase**: 10a-fixup (patches against `code-review-10a.md`)
**Authored**: 2026-06-04
**Status**: complete (3 of 3 fixes shipped + 1 doc fix)
**Branch**: `worktree-arete-v2-chef-orchestrator`
**Builds on**: `build-report-10a.md`

---

## Commits

In chronological order on the worktree branch:

1. `cacb6d93` — `phase-10a-fixup(parser): multi-name natural-language support (LOW-4 / pre-mortem M3)`
2. `04f65a97` — `phase-10a-fixup(cli): malformed commitments.json refuses to migrate (HIGH-3)`
3. `674a0f43` — `phase-10a-fixup(cli): migrate --apply uses withLock + AC1f doc correction (HIGH-2 + DOC)`

Each commit carries the `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer.

---

## Review concerns addressed

| Code-review concern | Severity | Status | Commit |
|---------------------|---------|--------|--------|
| HIGH-1 — Build report misstated storage adapter atomicity | HIGH | FIXED (doc) | `674a0f43` |
| HIGH-2 — `migrate --apply` did NOT use `CommitmentsService.withLock` | HIGH | FIXED | `674a0f43` |
| HIGH-3 — `parseCommitmentsFile` silently returns `[]` on malformed JSON | HIGH | FIXED (guard in migrate verb; shared parser unchanged) | `04f65a97` |
| LOW-4 — Multi-name natural-language pattern (pre-mortem M3) not supported | LOW (high soak risk) | FIXED | `cacb6d93` |

Out of scope per brief: LOW-1, LOW-2, LOW-3, LOW-5, LOW-6 (not part of this fix-up).

---

## Files changed

### Source — packages/core

- `packages/core/src/services/commitments-counterparty-parser.ts` — adds `CONJUNCTION_CONTINUATION_PATTERN` + multi-name extraction loop in `extractNaturalLanguageNames`; changes ambiguous-row contract to retain resolved stakeholders alongside ambiguity flag (LOW-4); updates `ExtractCounterpartiesResult.stakeholders` docstring.
- `packages/core/src/services/migrations/migrate-to-v2.ts` — sidecar disambiguation merges sidecar-resolved with parser-resolved (de-dup by slug) when ambiguous + resolved coexist.

### Source — packages/cli

- `packages/cli/src/commands/commitments.ts` — HIGH-3 malformed-JSON guard added after the initial `storage.read` (refuses with "malformed" error); HIGH-2 wrap of read-migrate-write in `services.commitments.withLock(...)` with locked re-read + re-run; obsolete "TODO atomic write" comment replaced with the correct AC1f explanation citing `file.ts:30-42`.

### Tests

- `packages/core/test/services/commitments-counterparty-parser.test.ts` — 8 new tests under "Step 2 — multi-name natural language (LOW-4 / pre-mortem M3)"; updated existing "mixed: one resolvable, one ambiguous" test to reflect the new contract (resolved stakeholder retained).
- `packages/cli/test/integration/commitments-migrate.integration.test.ts` — 3 new tests: 2 HIGH-3 (truncated JSON; shape-invalid JSON), 1 HIGH-2 (concurrent withLock holder + measured wait).

### Docs

- `dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/build-report-10a.md` — caveat #1 + AC1f traceability row corrected (DOC fix).

### Dist

`packages/core/dist/**` + `packages/cli/dist/**` artifacts rebuilt and committed after each fix. `npm run build:packages` (= `tsc -b packages/core packages/cli`) is clean.

---

## Test status

Phase-10a parser + migrate tests (CORE):

```
test/models/commitment-v2-shape.test.ts                           6 pass
test/services/commitments-hash-v2.test.ts                        22 pass
test/services/commitments-counterparty-parser.test.ts            35 pass (27 prior + 8 new)
test/services/commitments-v2-flag.test.ts                        10 pass
test/services/migrations/migrate-to-v2.test.ts                   13 pass
                                                                 --
                                                                 86 pass (+8 over 10a baseline)
```

Phase-10a CLI integration tests:

```
test/integration/commitments-migrate.integration.test.ts          8 pass (5 prior + 3 new)
```

Regression sweep against pre-existing commitments tests:

```
test/services/commitments.test.ts                                ok
test/services/commitments-counterparty-overlap.test.ts           ok
test/services/commitments-withlock.test.ts                       ok
test/services/migrations/add-created-at.test.ts                  ok
```

Build:

```
npm run build:packages    ← tsc -b packages/core packages/cli passes (silent)
```

---

## Fix details

### HIGH-3 — Malformed `commitments.json` refuses (commit `04f65a97`)

`parseCommitmentsFile` returns `[]` for BOTH "file truly missing" and "file exists but failed to parse / shape-invalid." The migrate verb would then hit its empty-no-op branch and exit 0 with "nothing to migrate" — silent corruption swallow.

The fix is a narrow defensive guard inside the migrate verb (NOT in the shared parser — other consumers like `add-created-at` keep the lenient behavior). Logic:

```
raw === null               → file truly missing (fresh workspace; current empty-no-op path is correct)
raw.trim() === ''          → empty file (treat as missing)
raw !== null && parse OK   → normal flow
raw !== null && parse fail → REFUSE with "malformed" error, exit 1
raw !== null && shape bad  → REFUSE with "malformed" error, exit 1
```

Test coverage:
- Truncated JSON (`{"commitments": [{"id":`) → exit 1 + `/malformed/i`.
- Shape-invalid JSON (`{"commitments": "not-an-array"}`) → exit 1 + `/malformed/i`.

### HIGH-2 — `withLock` wrapping (commit `674a0f43`)

`CommitmentsService.withLock(fn)` is the pre-mortem F5 mitigation, introduced in 10a-pre, but the migrate verb didn't use it. A concurrent `meeting apply` could race the read-modify-write.

The fix restructures the apply path:

1. The dry-run-style read + engine pass above the apply branch stays (drives ambiguity gate + diff report).
2. The apply branch enters `services.commitments.withLock(async () => { ... })`.
3. Inside the lock: re-read commitments.json (authoritative input), re-run the engine, capture snapshot from the locked read, write commitments.json via the storage adapter (which already does tmp+rename — see DOC fix below).
4. Defensive: if the locked re-run produces ambiguity that wasn't there in the unlocked pass, throw out of the lock pointing the user back at `--dry-run` (the file shifted under us).
5. On lock failure / write failure, surface a user-friendly error message that includes the `restore` command and exit 1.

Test coverage (CLI integration): spawn a holder ESM process that grabs `service.withLock` and sleeps 700ms, poll for the proper-lockfile sidecar to confirm acquisition, then run `migrate --apply`. Assert:
- holder exits 0 with "holder-done" → it really held the lock.
- CLI exits 0 → the migrate completes after the holder releases.
- elapsed CLI time >= 300ms → proves the CLI waited (lock honored, not bypassed).
- final commitments.json has v2 fields → migration actually wrote.

### LOW-4 — Multi-name natural language (commit `cacb6d93`)

Pre-mortem M3 risk: real-workspace text has "Send X to Lindsay and Anthony" / "Coordinate with Lindsay, Anthony, and Greg" patterns. The `NL_PREPOSITION_PATTERN` only matched the first capitalized token after each preposition; subsequent "and"-joined names were dropped silently — the diff report would NOT flag this as ambiguous because the parser thought it resolved cleanly.

Two related changes in this commit:

1. **New `CONJUNCTION_CONTINUATION_PATTERN`** scans for `<conj> <Name>` continuations after each primary preposition match. Supports `" and "`, `" & "`, `", "`, and `", and "` (Oxford comma). Same multi-word peek as the primary path (so "to Lindsay Gray and Anthony" picks the full "Lindsay Gray").

2. **Ambiguous-row contract change**: when a row mixes resolved + ambiguous names, the parser now retains the resolved subset AND flags the ambiguous names. Previously the row would surface as `stakeholders: []` + `ambiguous: true`. The migrate verb's apply gate still refuses on any ambiguity, so the user must still resolve via sidecar before `--apply` — the only change is that the diff report now shows what we picked up cleanly. The migration engine's sidecar disambiguation path merges sidecar-resolved with parser-resolved (de-dup by slug) on both partial and full resolution.

Test coverage (8 new + 1 updated):
- `"to X and Y"` outbound — Lindsay ambiguous + Anthony resolved (per brief).
- `"to X and Y"` both unambiguous → 2 stakeholders.
- `"to X, Y, and Z"` Oxford-comma list → 3 stakeholders.
- `"to X & Y"` ampersand form → 2 stakeholders.
- `"to X, Y"` comma-only list → 2 stakeholders.
- `"to <owner> and Y"` → owner filtered, Y kept (per brief case 3).
- `"from X and Y"` inbound → both stakeholders carry sender role.
- `"to X and the team"` (lowercase regression-pin) → only X.
- Updated: "mixed: one resolvable, one ambiguous" (Dave + Lindsay) now asserts Dave retained + Lindsay flagged.

### DOC — AC1f atomicity correction (commit `674a0f43`)

The original `build-report-10a.md` "Known issues" #1 and the migrate verb's inline comment said the storage adapter "does NOT yet implement tmp+rename atomicity." That was factually wrong: `packages/core/src/storage/file.ts:30-42` writes via a `randomBytes(6)`-suffixed tmp file in the same directory, then `fs.rename` (POSIX-atomic within a filesystem). Updated both the build report (caveat #1 + AC1f traceability row) and the CLI inline comment to make this clear.

The pre-migration snapshot story is still useful — it's the LOGIC-bug recovery anchor (we wrote bad content); the tmp+rename is the I/O-bug recovery anchor (we crashed mid-write). Both layers contribute to AC1f.

---

## Critical invariants honored

- **NO LLM calls** — none of the three fixes touched any LLM call site. Confirmed via `grep -rn "AIService\|aiService\|ChatModel\|callLLM"` against the changed source files (zero hits).
- **NO production data writes** — all tests use tmp workspaces under `os.tmpdir()`. No `arete-reserv` interaction.
- **Per-step commits** — three commits, each one fix.
- **Co-authored footer** — present on all three commits.
- **Dist rebuilt after each commit** — `tsc -b` clean; dist/ artifacts committed alongside src/.
- **Did NOT touch Followup-2 surfaces** — confirmed via `git diff cacb6d93^..HEAD -- packages/cli/src/commands/meeting.ts packages/core/src/services/meeting-extraction.ts packages/core/src/services/meeting-lock.ts` → no diff.

---

## Recommended next steps

1. (User, when ready) Re-run `--dry-run` against `arete-reserv` and compare the diff. Multi-name rows (LOW-4) may now produce additional stakeholders that the prior diff missed. Expect higher counts on the "Pass-through with stakeholders" rows.
2. The 24h quiet-window guard still applies; soak window unchanged.
3. The HIGH-2 fix removes the "must confirm no parallel arete processes" caveat. The CLI now serializes against any other `meeting apply` / `commitments resolve` / etc. via the same proper-lockfile lock.
4. If `--dry-run` against `arete-reserv` surfaces NEW ambiguous names (because multi-name extraction found names that weren't visible before), resolve them via the sidecar at `.arete/commitments.pre-phase-10-ambiguities.json` before `--apply`.
