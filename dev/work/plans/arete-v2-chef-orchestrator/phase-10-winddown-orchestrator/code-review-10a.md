# Phase 10a — Senior Staff Engineer Code Review

**Reviewer**: senior staff engineer (review pass on landed worktree)
**Authored**: 2026-06-04
**Scope**: 7 commits (`21a77804` … `801d71ac`) on `worktree-arete-v2-chef-orchestrator`
**Build report under review**: `build-report-10a.md`

---

## Verdict: APPROVE WITH MINOR

The code does what the plan says. 83/83 new tests pass; 149/149 pre-existing tests pass on top; build (`tsc -b packages/core packages/cli`) is clean. AC1, AC1a, AC1b, AC1c, AC1e, AC1h are all materially satisfied with executable evidence. AC1d (restore) was already shipped in 10a-pre and the migrate verb correctly points users at it. AC1f and AC1g are partially satisfied (see HIGH-1 and LOW-3 below).

**The build is safe to merge.** The HIGH concerns below do NOT block merge but they DO need to be acknowledged before the user runs `--apply` against arete-reserv data. There is one factual error in the build report (HIGH-1) that the user should know about before reading the "caveats" section. Everything else is small-bore.

---

## Per-commit verification table

| SHA | Subject | Tests added | Verifies | Verdict |
|-----|---------|------------:|----------|---------|
| `21a77804` | Stakeholder + Commitment v2 fields (Step 1) | 6 | Type-shape contract; dual-shape assignability; `COMMITMENT_TEXT_VARIANTS_MAX = 5`; 4-role enum; `'self'` direction | PASS |
| `0b7c4e58` | computeCommitmentHashV2 + text normalization (Step 2) | 22 | Arrow + bare-slug strip; lemmatization; intent-prefix strip; idempotency; hash = `sha256(normalized\|direction)` only; arity gate (`fn.length === 2`); LLM-variation collapse; intentional non-collapse boundary | PASS |
| `3c6a2039` | extractCounterpartiesFromText parser (Step 3) | 27 | Step 0/1/2/3 ordering; arrow override of self-pattern; multi-word resolution; ambiguity surfacing; owner-named exclusion; `buildPersonDirectory` indexing both first-name + display name | PASS |
| `0965e535` | Migration engine + diff writer (Step 4 engine) | 13 | 20-row synthetic fixture with all categories; canonical-pick by `date` asc; status-conflict (`resolved` wins, earliest `resolvedAt`); idempotency on migrate output; sidecar disambiguation; `source_external: []`; textVariants cap | PASS |
| `e44ef983` | Feature flag (Step 5) | 10 | env+config precedence; malformed → false; null-workspace → false; sync variant | PASS |
| `3e70f623` | CLI verb + 24h gate + dist (Step 4 CLI + Step 6) | 5 | dry-run does not touch commitments.json; 24h gate refuses; ambiguity gate refuses even with `--force-after-triage`; happy-path apply writes snapshot + v2 file; empty no-op | PASS |
| `801d71ac` | Build report | — | Doc commit, no code | PASS |

All seven commits carry the `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer. Per-commit hygiene is clean — each commit is one task, message describes intent.

---

## HIGH concerns (must acknowledge before `--apply` on production)

### HIGH-1 — Build report misstates storage adapter atomicity

The build report (§"Known issues" #1) and the CLI verb's inline comment both say:

> "the storage adapter does not yet implement tmp+rename atomicity at the per-file level"

This is **false**. `packages/core/src/storage/file.ts:30-42` writes via `randomBytes(6)`-suffixed tmp file in the same directory, then `fs.rename`. Per POSIX `rename(2)`, this IS atomic within a filesystem. The migrate verb already gets AC1f atomicity for free through `storage.write`:

```ts
// packages/core/src/storage/file.ts:30-42
async write(path: string, content: string): Promise<void> {
  const dir = join(path, '..');
  await fs.ensureDir(dir);
  const tmpSuffix = randomBytes(6).toString('hex');
  const tmpPath = `${path}.${tmpSuffix}.tmp`;
  try {
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, path);
  } catch (err) {
    await fs.remove(tmpPath).catch(() => {});
    throw err;
  }
}
```

The recovery story (snapshot at `.arete/commitments.pre-phase-10.json`) is still correct and useful — but the user should know AC1f is satisfied at the adapter layer too, not just by the snapshot. The misstatement makes the safety story sound weaker than it is, and incentivizes someone in Phase 10b to do unnecessary "fix the atomic write" work.

**Action**: amend the build report's caveat #1 + drop the "TODO: true tmp+rename atomicity" comment from `commitments.ts:895-900`. Pure documentation fix; no code change.

### HIGH-2 — `migrate --apply` does NOT use `CommitmentsService.withLock`

`CommitmentsService.withLock(fn)` exists (`packages/core/src/services/commitments.ts:649-671`) and was introduced in 10a-pre precisely to serialize read-modify-write against extract/apply paths. The migrate verb bypasses it entirely:

- CLI reads raw via `services.storage.read(commitmentsPath)` (no lock).
- Engine runs in memory (pure).
- CLI writes via `services.storage.write(commitmentsPath, migratedJson)` (no lock).

The 24h quiet-window guard (AC1h) is a **soft** gate against same-day triage, not against concurrent operations during the apply window. If the user runs `--apply` in one terminal and an `arete meeting apply` happens to fire in another (or via a slash-flow background process), the latter could be holding a write through its own `withLock`, and the migrate's plain `storage.write` would race against the lock holder.

Pre-mortem F5 explicitly called this out: "the lock serializes the WRITES but doesn't serialize the READ-decide-WRITE atomically." The pre-mortem mitigation was `CommitmentsService.withLock(fn)`. That mitigation EXISTS in code but is not applied to the migrate verb.

Realistic blast radius is low — the user typically doesn't run two operations in parallel — but for a 600-row migration, "low probability × high impact" is the wrong tradeoff. Worst case: a concurrent `meeting apply` writes a new commitment AFTER migrate reads but BEFORE migrate writes; migrate's write clobbers the new commitment. The snapshot would NOT contain the lost commitment either (snapshot was taken at the same `read` moment). Restore would not help.

**Action**: before running `--apply` against arete-reserv, either (a) confirm no other arete processes are running (use the `ps -ef | grep arete` check in the verification commands below), or (b) add `withLock` wrapping to the CLI (preferable; ~5-line change wrapping lines 728-911 of `commitments.ts` inside `services.commitments.withLock(async () => { ... })`).

### HIGH-3 — `parseCommitmentsFile` silently returns `[]` on malformed JSON

`packages/core/src/services/migrations/add-created-at.ts:107-115` catches all JSON-parse errors and returns `[]`. The migrate verb then hits its "No commitments found — nothing to migrate" branch and exits 0 with success. **A corrupt commitments.json would be misreported as "empty workspace, nothing to do" and the user might re-run other tooling against the corrupt file.**

Inherited behavior (existed before Phase 10a), but `--apply` is the place where this matters: if commitments.json were ever corrupted on disk and the user ran `migrate --apply`, the migrate would write an empty-array file and the snapshot would be the corrupted source. Restore from snapshot would not help.

**Action**: in the migrate verb, treat `raw !== null && parseCommitmentsFile(raw).length === 0 && raw.trim() !== ''` as an error: "commitments.json appears malformed; refusing to migrate." Two-line guard.

---

## LOW concerns

### LOW-1 — Feature flag wiring is correct but no downstream readers honor it

`isCommitmentsV2Active` exists, has 10 passing tests, and is `false` by default. `grep` confirms ZERO call sites outside `commitments-v2-flag.ts` and the services index re-export. This is the intended state per the build report ("Step 5: wired but NOT activated"). The flag value cannot affect production behavior in this build — confirmed.

Caveat: the flag's stated purpose ("gate v2 read paths") cannot be exercised by an integration test in this build because no caller reads it. The 10 unit tests verify the resolver in isolation. Phase 10b is on the hook for actually wiring readers to consult the flag.

### LOW-2 — `--owner-slug` not in `AreteConfig`

The CLI requires `--owner-slug <slug>` on every invocation (build report caveat #3). Error message when omitted is clear: `'--owner-slug <slug> is required (e.g., "john-koht"). Used to repair owner-as-personSlug rows.'` (`commitments.ts:718-722`). Acceptable for a one-shot tool; matches build-report claim.

Follow-up worth tracking (not blocking): add `owner_slug` to `AreteConfig` so reactive dedup in Phase 10b doesn't need this argument on every extract call.

### LOW-3 — AC1g delta-diff path: engine supports it, CLI doesn't compute it

`formatMigrationDiff(result, { ..., deltaSources: {...} })` emits the breakdown when `meta.deltaSources` is provided. Test `delta-source breakdown appears when meta.deltaSources is provided (AC1g)` confirms the formatter works.

What's missing: the CLI's `--apply` path does NOT compute deltas between a previous dry-run diff and the current state before writing. The user's recommended workflow is "re-run `--dry-run` before `--apply` and visually diff." This is a reasonable degraded path for a one-shot tool — not blocking — but the build report's caveat #2 should explicitly tell the user "you must re-run `--dry-run` immediately before `--apply` to see the current state; the apply path does not show deltas from the prior dry-run."

Build report does say this (lines 200-210). Marking as acknowledged.

### LOW-4 — Multi-name natural-language pattern (pre-mortem M3) is NOT supported

Per pre-mortem M3, real-workspace text has constructions like "Send X to Lindsay and Anthony" or "Coordinate with Lindsay, Anthony, and Greg." The parser's `NL_PREPOSITION_PATTERN` only catches the first capitalized token after each preposition. Subsequent "and"-joined names are NOT extracted.

Realistic impact: any commitment text with multi-recipient natural language will land with an incomplete stakeholders[] list. The first name is captured; subsequent names lost. The dry-run diff will NOT flag this as ambiguous because the parser thinks it resolved cleanly. **User won't see the gap in the diff report.** The 28 owner-as-personSlug rows in arete-reserv may include some of these.

**Action (defer to Phase 10b)**: add Step 2.5 multi-name resolution OR add a `containsAndConjunction` heuristic that flags rows for ambiguity surfacing.

### LOW-5 — Self-pattern prefix list excludes "remember I"-pattern variants

Plan §"Migration plan (v2)" Step 0 lists six patterns. Code's `SELF_PATTERN_PREFIXES` has seven (plan's six + `"dont forget to"` apostrophe-less). Implementation is more permissive than spec by one row — defensible (handles non-typographic apostrophes), but undocumented. Add a comment.

### LOW-6 — `idempotency: ParsedRow.selfRewritten` flag's three-state direction check looks odd

`migrate-to-v2.ts:276-279`:
```ts
const selfRewritten =
  direction === 'self' &&
  c.direction !== 'self' &&
  c.direction !== ('self' as CommitmentDirection);
```

The third clause is a no-op (typed cast of the same literal). Probably a vestige from an earlier broader-direction type. Harmless; cosmetic.

---

## Test quality spot-check (5 sample assertions)

I read 5 representative assertions across the suite.

1. **`commitments-counterparty-parser.test.ts:294-304`** — "self-pattern is case-insensitive but only matches PREFIX." Crafted text "Send to Dave (note to self: bring the slides)" — verifies prefix-only semantics (not substring). Excellent test; pins a real semantic boundary.

2. **`commitments-hash-v2.test.ts:178-188`** — "does NOT collapse 'talk to' vs 'chat with' (lemma + preposition diff)." Pins the conservative-normalization boundary documented in plan §"Hard part 5." Test ASSERTS NON-EQUALITY, which is the right kind of test for a "do not over-merge" invariant. High-signal.

3. **`migrate-to-v2.test.ts:412-427`** — "status-conflict group: mixed status → resolved + earliest resolvedAt." Fixture has rows 15 (resolved 2026-05-22) and 16 (open). Asserts canonical.status === 'resolved' AND resolvedAt === '2026-05-22T12:00:00.000Z'. Both invariants checked. Good.

4. **`commitments-migrate.integration.test.ts:219-243`** — "--apply blocks on ambiguous rows even with --force-after-triage." Backdates commitments.json mtime by 48h (passes the 24h gate), THEN expects the ambiguity gate to fire. Tests the right interaction — `--force-after-triage` bypasses ONE gate, not BOTH. Excellent layered-gate test.

5. **`commitments-hash-v2.test.ts:190-196`** — "createdAt is NOT in the hash inputs (R3 invariance)." `assert.equal(fn.length, 2)`. Asserts the function's arity (TypeScript function arity excludes defaults). This pins the SIGNATURE against accidental addition of a third hash input via "convenience" refactor. Smart invariant test.

**Verdict on test quality**: high. Tests use clear naming, exercise both happy and negative paths, and pin invariants (not just behavior). 78 unit + 5 integration is solid coverage for a one-shot migration tool.

---

## AC traceability table

| AC | Spec ref | Verified by | Status |
|----|----------|-------------|--------|
| AC1 | plan §"Migration plan (v2)" | `migrate-to-v2.test.ts` ("renders header + summary + category sections") + `commitments-migrate.integration.test.ts` ("--dry-run produces a diff report...") | PASS |
| AC1a | plan §"Migration plan (v2)" eng C2 | `commitments-counterparty-parser.test.ts:44-56` (outbound arrow) + `migrate-to-v2.test.ts:318-346` (owner-twin group: Dave NOT owner in stakeholders) | PASS |
| AC1b | plan §"Migration plan (v2)" Step 0 | `commitments-counterparty-parser.test.ts:253-292` (all 6 self-marker prefixes) + `migrate-to-v2.test.ts:392-410` (Dave NOT a recipient on "Note to self" rows) | PASS |
| AC1c | plan §"Migration plan (v2)" | `commitments-migrate.integration.test.ts:245-307` ("--apply succeeds on the happy path") — writes v2 fields + snapshot retained | PASS |
| AC1d | plan §"Migration plan (v2)" | `commitments.ts:467-650` (restore verb already shipped in 10a-pre); migrate verb's apply success message points at it | PASS (inherited) |
| AC1e | plan §"Migration plan (v2)" Step 2 + eng N1 | `commitments-counterparty-parser.test.ts:204-221` (bare Lindsay → ambiguous) + integration `--apply blocks on ambiguous rows even with --force-after-triage` | PASS |
| AC1f | plan §"Migration plan (v2)" + eng N4 | Storage adapter atomic write (file.ts:30-42, contrary to build report claim — see HIGH-1) + snapshot retained as recovery anchor (integration test asserts `snapshotPath` exists) | PASS (over-stated as "caveat" in build report; actually fully satisfied) |
| AC1g | plan §"Migration plan (v2)" + eng "delta-diff" | `migrate-to-v2.test.ts:544-565` (delta-source breakdown rendering) — engine supports; CLI does not invoke (see LOW-3) | PARTIAL (engine PASS; CLI wiring deferred) |
| AC1h | plan §"Migration plan (v2)" v3 pre-mortem F4 | `commitments-migrate.integration.test.ts:197-217` (`--apply BLOCKS within the 24h quiet-window`) + override path via `--force-after-triage` exercised in subsequent test | PASS |

---

## Verification commands (run before any production --apply)

```bash
# 1. Re-run the full test suite from a clean state
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator
npm run build:packages   # tsc -b — should be silent
( cd packages/core && npx tsx --test \
  test/models/commitment-v2-shape.test.ts \
  test/services/commitments-hash-v2.test.ts \
  test/services/commitments-counterparty-parser.test.ts \
  test/services/commitments-v2-flag.test.ts \
  test/services/migrations/migrate-to-v2.test.ts )
( cd packages/cli && npx tsx --test \
  test/integration/commitments-migrate.integration.test.ts )

# 2. Confirm NO LLM calls in any new file (should print nothing)
grep -rn "AIService\|aiService\|ChatModel\|callLLM" \
  packages/core/src/services/commitments-hash-v2.ts \
  packages/core/src/services/commitments-counterparty-parser.ts \
  packages/core/src/services/commitments-v2-flag.ts \
  packages/core/src/services/migrations/migrate-to-v2.ts

# 3. Confirm feature flag is NOT activated anywhere (should print nothing
#    outside the flag file itself + the services index re-export)
grep -rn "isCommitmentsV2Active\|isCommitmentsV2ActiveFromConfig" \
  packages/core/src packages/cli/src | \
  grep -v "commitments-v2-flag.ts\|services/index.ts"

# 4. Read the dry-run output BEFORE thinking about --apply.
cd /Users/john/code/arete-reserv
arete commitments migrate --to-v2 --dry-run \
  --owner-slug john-koht --diff-dir /tmp/p10-diffs

# 5. Inspect ambiguous count — this MUST be 0 before --apply.
less /tmp/p10-diffs/migration-diff-*.md
# Look for the "Ambiguous (user must disambiguate)" section.

# 6. (HIGH-3 sanity) Confirm commitments.json parses to a non-empty
#    array before invoking --apply:
jq '.commitments | length' /Users/john/code/arete-reserv/.arete/commitments.json
# If this shows 0 OR errors, STOP and investigate — see HIGH-3.

# 7. (HIGH-2 sanity) Confirm no other arete processes are running
#    against arete-reserv before --apply:
ps -ef | grep -i arete | grep -v grep
# Should show only your shell + this command.
```

---

## Bottom line

Code matches plan. Tests are rigorous. Build is clean. The two genuine HIGH concerns (atomicity misstatement, missing withLock) are fixable in <50 LOC each and do NOT block the merge. The user should fix HIGH-2 before `--apply`, or commit to running `--apply` only when no other arete processes are active. HIGH-3 is inherited and worth a defensive guard for the migrate verb specifically.

Soak should focus on:
- pre-mortem M3 (multi-name natural language) — LOW-4 above — measured by post-migration audit of stakeholder lists vs. text body for "and"-joined name patterns.
- The 24h gate is a real fix for F4; verify by waiting 24h after last triage before running `--dry-run`.
- HIGH-2 (`withLock`) — if soak observes any duplicate-canonical row, fix this first.
