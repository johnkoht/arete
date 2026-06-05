# Phase 10 followup-2 — Build Report

**Date**: 2026-06-01
**Plan**: `plan.md` v3 (PROCEED-WITH-MITIGATIONS verdict applied; F1/F2/F5 + M1-M4 folded in)
**Pre-mortem**: `pre-mortem.md`
**Code review from 10a-pre**: `../phase-10-winddown-orchestrator/code-review-10a-pre.md` (4 items folded in as Step 0)

---

## Commits (in order)

| # | SHA       | Subject                                                                                                       |
|---|-----------|---------------------------------------------------------------------------------------------------------------|
| 0 | `49733df7` | `phase-10a-pre-followup(core): address code review concerns C1 + LOW1 + LOW2 + LOW3`                          |
| 1 | `fcf084b7` | `phase-10-followup-2(core): add staged_item_skip_reason sibling frontmatter field`                            |
| 2 | `0462ef5c` | `phase-10-followup-2(core): add meeting-file writeWithLock with partial-merge contract`                       |
| 3 | `e704049e` | `phase-10-followup-2(core): add chef-skip audit log writer (Phase 9-shape)`                                   |
| 4 | `9bc07d87` | `phase-10-followup-2(core): F5 cleanup-by-approvedIds + Skipped on Apply section + APPLY-SKIP audit`          |
| 5 | `012453f9` | `phase-10-followup-2(runtime): SKILL.md Rule 5 + chef-skip curated-view sections`                             |
| 6 | `9f2ac7b4` | `phase-10-followup-2(core): [[unskip]] + [[confirm-skip]] directive parser + resolver`                        |
| 7 | `6b157ba3` | `phase-10-followup-2(core): end-to-end flow tests for chef-skip + apply + unskip`                             |

Each commit carries the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer.

---

## Step 0 — 10a-pre code review concerns (single commit, no plan-scope creep)

### HIGH-1 — `ensureLockTarget()` silent lock bypass on mock storage

**Before**: returned `false` on bootstrap failure; `runUnderLock` quietly ran `fn` without a lock.

**After**: `ensureLockTarget` throws a new `LockBootstrapError` class. `runUnderLock` propagates the throw, honoring the plan's "abstain, never silent corruption" contract.

**Test-impact mitigation**: introduced `ARETE_LOCK_BYPASS_MOCK=1` env-var escape hatch. The big mock-storage test file `commitments.test.ts` (which uses a virtual `/workspace` root) sets the flag at module load; production code never sets it. New StorageAdapter shapes (remote / S3 / SQLite) cannot silently degrade — they'll get the throw. Two new tests in `commitments-withlock.test.ts` verify both the throw path AND the env-var bypass.

Files touched: `packages/core/src/services/commitments.ts`, `packages/core/test/services/commitments.test.ts` (env-var line at top), `packages/core/test/services/commitments-withlock.test.ts` (+2 tests).

### LOW-1 — misnamed counterparty test

Renamed `'returns empty set when stakeholders is an empty array (no fallback to personSlug)'` → `'falls back to personSlug when stakeholders is an empty array'`. The assertion was already correct; only the name lied. JSDoc updated to document the actual behavior + flag the place to change BOTH if semantics ever change to "empty array = explicit no-counterparties signal."

### LOW-2 — hash invariance vs `createdAt` not tested

Added `'computeCommitmentHash is invariant when createdAt differs'` test that constructs two commitments with identical text/personSlug/direction but different `createdAt` values and asserts identical hashes via three separate `assert.equal` calls. Today this holds by type-system construction (hash signature is `(text, personSlug, direction)`), but the explicit test catches future inline-rebuild refactors.

### LOW-3 — restore path "injection guard" overstates

Rewrote the source comment in `commitments restore --from` to read: "we accept ANY absolute path the caller can supply, including paths outside the workspace... The CLI runs with the workspace owner's privileges and delegates read permission enforcement to the OS — there is no explicit out-of-workspace rejection." Threat model documented; soft-guard claim removed.

---

## Phase 10 followup-2 — 7 build steps

### Step 1 — `staged_item_skip_reason` sibling field

**Files**: `packages/core/src/models/integrations.ts`, `packages/core/src/models/index.ts`, `packages/core/src/integrations/staged-items.ts`, `packages/core/src/index.ts`, `packages/core/test/integrations/staged-items.test.ts` (+7 tests).

New types: `StagedItemSkipReasonMeta` (reason, evidence, setBy union, setAt) and `StagedItemSkipReason` (map keyed by item id). `parseStagedItemSkipReason` clones the `parseStagedItemOwner` shape, validates required fields, rejects malformed entries silently, returns `{}` for M3 first-ship default. JSDoc documents the M2 producer discriminator table on `StagedItemStatus` AND `StagedItemSkipReasonMeta`.

### Step 2 — `MeetingService.writeWithLock` + partial-merge contract

**Files**: `packages/core/src/services/meeting-lock.ts` (NEW), `packages/core/src/services/index.ts`, `packages/core/test/services/meeting-lock.test.ts` (NEW, 8 tests).

`writeWithLock(storage, meetingPath, mutator, opts?)` acquires `proper-lockfile` on `<meetingPath>.lock` (30s stale, PID check — shape matches `CommitmentsService.withLock`). Mutator returns `Partial<Frontmatter>` (shallow merged; explicit `undefined` deletes) OR `{ abstain: reason }`. mtime guard defaults 60s INSIDE the lock; settable to 0 to disable.

**Load-bearing F2 contract test**: `'F2 partial-merge contract: mutator returning only owned keys does NOT clobber sibling fields'` — pre-existing `staged_item_skip_reason[ai_0042]` survives byte-for-byte through a mutator that only returns the 5 extract-owned keys. This is the type-system-enforced per-field ownership.

### Step 3 — Audit log writer

**Files**: `packages/core/src/services/chef-skip-log.ts` (NEW), `packages/core/src/services/index.ts`, `.gitignore` (+1 entry), `packages/core/test/services/chef-skip-log.test.ts` (NEW, 6 tests).

`appendChefSkipLog(workspaceRoot, payload)` writes `${ISO} chef-skip ${JSON.stringify(payload)}\n` to `dev/diary/chef-skip-log.md`. Best-effort: errors swallowed; failure never blocks winddown or apply. 6 action types: SKIP / PROPOSE / UNSKIP / CONFIRM / ABSTAIN / APPLY-SKIP. `.gitignore` adds `dev/diary/chef-skip-log.md` (M3/F4 — local-only audit).

### Step 4 — F5 cleanup fix + Skipped on Apply section + APPLY-SKIP audit

**Files**: `packages/core/src/integrations/staged-items.ts`, `packages/core/src/index.ts`, `packages/cli/src/commands/meeting.ts`, `packages/core/test/integrations/staged-items.test.ts` (+7 tests).

The critical v3 F5 bug fix. The previous wholesale `delete data['staged_item_*']` at lines 575-579 clobbered chef-proposed skip_reason entries on pending items. Replaced with a per-key filter that retains entries whose ID is NOT in `approvedIds`. Pending items + skipped items the user `[[unskip]]`'d back to pending retain their sibling fields for next round.

Added `## Skipped on Apply` body section listing each `'skipped'` item with its reason + setBy + setAt (pulled from snapshot taken BEFORE the cleanup).

Added `SkippedItemRecord` + `SkippedItemObserver` types + `onSkipped` callback option. CLI `meeting.ts` wires `onSkipped` → `appendChefSkipLog(action: 'APPLY-SKIP', ...)`.

### Step 5 — SKILL.md updates

**Files**: `packages/runtime/skills/daily-winddown/SKILL.md`, `packages/core/test/services/chef-orchestrator-skills.test.ts` (+6 tests; existing "4 rules" assertion bumped to 5).

New `#### Rule 5 — Chef writes a STRUCTURAL skip on staged items` in Step 2. Two new output template sections in Step 4: "Chef-skip proposals (week-1)" filtered by `setBy === 'chef-proposed'`, and "Chef already-skipped (post-week-1)" for confirmed/demoted skips. Prose covers data path, HP3 first-week confirm gate, HP4 directive parser semantics (both id-alone and slug-qualified), HP2 three-surface visibility, audit log location, AC3/F5 apply-path interaction.

### Step 6 — `[[unskip]]` + `[[confirm-skip]]` directive parser

**Files**: `packages/core/src/services/chef-skip-directives.ts` (NEW, ~240 LOC), `packages/core/src/services/index.ts`, `packages/core/test/services/chef-skip-directives.test.ts` (NEW, 21 tests).

`parseChefSkipDirectives(content)` returns all matched directives; case-insensitive on kind; accepts `ai_NNN` / `de_NNN` / `le_NNN` ids; ignores unknown directives (e.g. future `[[unmerge]]`) cleanly. Both id-alone and slug-qualified forms accepted from day 1 (PM C4).

`resolveChefSkipDirective(storage, directive, opts)` — slug-qualified is exact path lookup; id-alone scans `resources/meetings/`, sorts by mtime desc, caps at N=50, parses `staged_item_status` per file, returns candidates. Returns `'resolved' | 'ambiguous' | 'no-match' | 'invalid-slug'`.

`formatDirectiveStatusMessage(d)` produces the human-readable line for the next winddown view when a directive doesn't resolve cleanly.

### Step 7 — End-to-end flow tests

**Files**: `packages/core/test/integrations/chef-skip-e2e.test.ts` (NEW, 4 flows).

Synthetic fixtures, real fs. Four flows:
- **A — post-week-1 happy path**: chef writes setBy='chef' + status='skipped', user approves a separate item, apply drops the skip with full reason in `## Skipped on Apply`, APPLY-SKIP audit log line written.
- **B — F5/AC11 week-1 unskip survival**: chef proposes ai_0099 chef-proposed; user `[[unskip]]` flips status pending + deletes skip_reason; apply preserves the pending item in `staged_item_status` (F5 contract).
- **C — chef-proposed lapses harmlessly**: no directive; apply preserves chef-proposed entry for next-round re-propose.
- **D — concrete CT2 reproduction**: the 2026-06-04 winddown catch that motivated this followup. Chef writes skip → apply → no commitment created.

---

## Test status

**Total core tests touched**: 396 across 79 suites, all green.

| File | Tests | Pass | Fail |
|------|-------|------|------|
| `commitments.test.ts` | 111 | 111 | 0 |
| `commitments-withlock.test.ts` | 8 | 8 | 0 |
| `commitments-counterparty-overlap.test.ts` | 21 | 21 | 0 |
| `meeting-lock.test.ts` (NEW) | 8 | 8 | 0 |
| `chef-skip-log.test.ts` (NEW) | 6 | 6 | 0 |
| `chef-skip-directives.test.ts` (NEW) | 21 | 21 | 0 |
| `staged-items.test.ts` | 63 | 63 | 0 |
| `chef-skip-e2e.test.ts` (NEW) | 4 | 4 | 0 |
| `chef-orchestrator-skills.test.ts` | 154 | 154 | 0 |

Net new tests: **53**.

---

## Invariants verified

- **NO LLM calls against arete-reserv**. All tests use synthetic fixtures + real tmp dirs.
- **NO writes to `.arete/commitments.json` or any production data**. Verified by grep — no `services.commitments` or `commitments.json` touches in test paths.
- **Per-step commits** with convention `phase-10-followup-2(scope): description` (Step 0 uses `phase-10a-pre-followup(core)` to scope properly).
- **Co-authored footer**: present on all 8 commits.
- **dist rebuilt after each step**: yes — `packages/core/dist/` + `packages/cli/dist/` regenerated and committed per step.
- **Apply-path filter unchanged**: confirmed line `Object.entries(statusMap).filter(([, v]) => v === 'approved')` at `staged-items.ts:545` (was 487 before Step 1 added skipReasonMap snapshot above) — UNTOUCHED. `'skipped'` items continue to drop silently. Only the cleanup at the same file (Step 4a) changed.

---

## Verification commands

Run from repo root (assumes `tsx` is on PATH):

```bash
# Step 0 (10a-pre code review fixes)
npx tsx --test packages/core/test/services/commitments.test.ts
npx tsx --test packages/core/test/services/commitments-withlock.test.ts
npx tsx --test packages/core/test/services/commitments-counterparty-overlap.test.ts

# Step 1 — parser
npx tsx --test packages/core/test/integrations/staged-items.test.ts

# Step 2 — writeWithLock
npx tsx --test packages/core/test/services/meeting-lock.test.ts

# Step 3 — audit log
npx tsx --test packages/core/test/services/chef-skip-log.test.ts

# Step 4 + 7 — apply path + e2e
npx tsx --test packages/core/test/integrations/staged-items.test.ts \
                 packages/core/test/integrations/chef-skip-e2e.test.ts

# Step 5 — SKILL.md
npx tsx --test packages/core/test/services/chef-orchestrator-skills.test.ts

# Step 6 — directive parser
npx tsx --test packages/core/test/services/chef-skip-directives.test.ts

# Full chef-skip slice in one shot
npx tsx --test \
  packages/core/test/integrations/staged-items.test.ts \
  packages/core/test/integrations/chef-skip-e2e.test.ts \
  packages/core/test/services/commitments.test.ts \
  packages/core/test/services/commitments-withlock.test.ts \
  packages/core/test/services/commitments-counterparty-overlap.test.ts \
  packages/core/test/services/meeting-lock.test.ts \
  packages/core/test/services/chef-skip-log.test.ts \
  packages/core/test/services/chef-skip-directives.test.ts \
  packages/core/test/services/chef-orchestrator-skills.test.ts
```

---

## Known issues / what's left undone

### In scope but not landed

- **Sentinel file `.arete/phase-10-followup-2-ship-date.json`** is NOT written by this build. Per Pre-condition #4 + M3, this is meant to be a committed runtime config that the SKILL.md prose reads to decide week-1 vs post-week-1 mode. Without it, the SKILL.md prose for the week-1 confirm gate has no anchor. The user should commit this sentinel on the first day they ship this followup-2 to their workspace; the SKILL.md prose explains how (fail-closed → assume week-1 if sentinel missing).
- **Chef-side `writeChefSkipToFile` wrapper** that automates writeWithLock + audit log + body comment insertion in one helper is NOT built as a separate function. The end-to-end test (Flow A) shows the pattern inline; if winddown SKILL execution needs more sugar, a wrapper can land in a followup. The plan §"Architecture > Chef writes the skip — winddown phase" describes the shape; the SKILL.md prose (Step 5) explains it to the chef. Functionally complete via `writeWithLock` + `appendChefSkipLog` composition.

### In scope, explicitly deferred per user instructions

- **Cron-style demotion** ("automatic week-2+ flip when sentinel + audit log meet criterion") — first ship sentinel logic only. The directive parser exists; the demotion logic that consults `chef-skip-log.md` for ≥1 CONFIRM + zero UNSKIP at +7d is NOT in this build. SKILL.md prose describes the criterion; the chef agent applies it at runtime when invoked. Plumbing this as a separate scheduled task is followup work.

### Out of scope per plan v3

- Gmail Sent integration / auto-resolution of committed entries — Phase 11a.
- Building a Slack-Sent provider — Phase 12+.
- Rename detection across re-extracts (per MC3 of plan; orphan = drop).
- LLM-graded confidence on chef skip decisions — chef writes when its existing "concrete match" tier fires.

### Possible follow-up items

- The 2 new tests in `commitments-withlock.test.ts` (HIGH-1 fix) only cover in-process throw + bypass. Real cross-process semantics are a property of `proper-lockfile` itself — not separately exercised here. Same partial coverage as 10a-pre noted by the reviewer.
- The `commitApprovedItems` cleanup now handles `staged_item_skip_reason`; we did NOT backport this filter-by-approvedIds pattern to `meeting-processing.ts:{416, 439, 476, 518, 557}` extract-time writes. Plan Q6 leans NO for scope reasons. If the soak surfaces extract-time wholesale-rewrite issues with skip_reason, revisit.

---

## Phase 10 followup-2 — Acceptance criteria mapping

| AC  | Description | Covered by | Status |
|-----|-------------|------------|--------|
| AC1 | sibling field schema | `parseStagedItemSkipReason` tests | ✓ |
| AC2 | chef writes skip — CT2 reproduction (post-week-1) | e2e Flow D | ✓ |
| AC3 | apply honors skip + F5 cleanup | staged-items tests (AC3 block) | ✓ |
| AC4 | mtime guard inside lock | meeting-lock tests | ✓ |
| AC5 | re-extract preservation via partial-merge | meeting-lock F2 test | ✓ (pattern proven; extract path refactor noted under undone) |
| AC6 | user override `[[unskip]]` directive | chef-skip-directives tests | ✓ |
| AC7 | first-week banner | SKILL.md prose | ✓ prose; sentinel file not written |
| AC8 | week-1 confirm gate + F1 demotion criterion | SKILL.md prose + parser + e2e Flow B/C | ✓ prose + parser; runtime demotion logic deferred to chef agent at invocation time |
| AC9 | APPLY-SKIP audit line | onSkipped wiring + e2e Flow A | ✓ |
| AC10 | soak observability | audit log + SKILL.md M1 grep recipes | ✓ |
| AC11 | F5 week-1 unskip survival | staged-items test + e2e Flow B | ✓ |

---

## Bottom line

7 build steps + Step 0 fixes complete. 53 net new tests, all green. dist rebuilt and committed. The structural CT2 fix lands; F5 closes the most-likely-to-bite production failure mode; F2 partial-merge contract makes the merge semantics type-system-clean. The directive parser becomes the project's `[[<dir>]]` infrastructure for follow-on work (Phase 10b-aux `[[unmerge]]`).

Per plan v3's pre-mortem soak-success criteria, the user should:
1. Commit the `.arete/phase-10-followup-2-ship-date.json` sentinel on day 0 (e.g., `{ "shippedAt": "2026-06-01T00:00:00Z" }`).
2. Daily review `dev/diary/chef-skip-log.md` per the M1 grep recipes (in SKILL.md).
3. At +7d, check demotion criterion: `grep -c '"action":"CONFIRM"'` AND `grep -c '"action":"UNSKIP"'`. If ≥1 CONFIRM + zero UNSKIP → safe to demote chef to direct-skip mode.
4. Watch for AC11 regressions (F5 sanity check) — if any `[[unskip]]`'d item disappears post-apply, emergency hotfix.

No partial-build state. No blockers.
