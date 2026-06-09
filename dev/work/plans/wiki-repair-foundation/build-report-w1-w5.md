# Build report — W1 (seed-lock resilience) + W5 (observability)

Branch: `fix-wiki-w1-w5` off `b373703e`. Commits: `1dfedaa4` (W1), `48a0cd2c` (W5 events/logger/progress), `6b7dc32b` (W5 staleness/fossil/qmd), `a4323ab3` (dist). Post-build: merged with post-W6 main (brief-assemblers.ts collision resolution — see merge commit).

## W1 — seed-lock resilience
- `seed-lock.ts:52-218`: `acquireSeedLock` classifies EEXIST locks via new `isPidAlive` (`process.kill(pid,0)`; ESRCH=dead, EPERM=alive/other-user, non-integer/≤0=dead). Dead/unparseable → `breakSeedLock` + ONE retry; live pid refuses; **losing the takeover race refuses** (pre-mortem R2). Takeovers append `seed-lock-takeover` log events (O_APPEND; append failure warns).
- Approve Hook 2 catch (`meeting.ts:1839-1870`): error → `topicIntegrationError` in JSON (:1986), loud human output "Topic integration SKIPPED/FAILED" + `arete topic refresh` catch-up hint (:2030-2040), `topic-integration-skipped` log event.
- False hint fixed (:2026): `memory refresh` → `topic refresh` (+2 help strings).
- AC1 tests: dead-pid takeover (guaranteed-dead pid via spawnSync), live-pid refusal, unparseable-lock takeover, takeover log event, takeover-race refusal, surfaced error (JSON+human+log). Two pre-existing fixtures moved from pid 99999 (always-dead) to live `process.pid`.

## W5 — observability
- **`ingest` events** (`refreshAllFromSources`): per integrated source — `topic, source, source_type, input_kind=summary|transcript, input_chars, result`. Summary variant unit-proven forward of W2.
- **Lossy logger fixed**: `intelligence.ts` 3b appends split + warn-on-failure; `topic.ts` refresh-event swallow warns. `claude-md-regen` was chained behind the same swallowed try — fixed.
- **Staleness on retrieval**: `WikiMatch.lastRefreshed` + `wikiStalenessLabel` (strict >60d; unparseable=stale) in all three Related-wiki builders + both retrieval paths; `topicWikiContext` entries carry `lastRefreshed`/`stale` on `### [[slug]]` headings.
- **Progress**: `RefreshBatchOptions.onProgress`; `topic refresh` prints `page N/M <slug>` to stderr (JSON stdout parseable).
- **`_synthesis.md` fossil dropped** from `status.ts` (reader + JSON key + line; backend/web grepped clean).
- **qmd follow-ups**: `collectionSpecMismatch` → `ok|mismatch|unverifiable` (surfaced as info note in index+update); add-fail-after-remove test.

## 6/08 missing-event root cause (investigated)
A full `memory refresh` completed 6/08 10:59:36 (index.md + area file same second) with ZERO events: the append threw and the bare `catch {}` at `intelligence.ts:574` erased the evidence (exact binary unrecoverable — npm symlink chain + dist rebuilt that night mid-release). Corollary: "claude-md-regen stopped 5/11" is NOT a separate regression — full-scope refreshes ran 4/24, 4/27, 5/11, 6/08; the first three logged pairs; same single 6/08 failure. The fix converts the class from invisible to visible.

## Gates
- ~754 targeted assertions across 25 files, 0 failures (seed-lock 14, approve 11, topic CLI 41, topic-memory 137, qmd-setup 64, extraction 293, briefs/context 129, status/golden 17, memory-log 39, other 19). Typecheck clean; dist rebuilt + committed.
- Not in scope (per brief): CLAUDE.md-age status line, index off-by-2 (plan's optional extras).

## For reviewer (MG-1 gates)
- Verify TOCTOU handling: post-break acquire must confirm OWN pid / lose-race-refuse path.
- Verify approve EXIT CODE stays 0 when integration is skipped (items already committed; non-zero invites chef retry → double-approve).
- Verify integrated state with W6 (brief-assemblers.ts both-touched).

## Deferred (ticketed)
- Pid-recycling belt (review finding 3): takeover past a generous `started` age / "held 6h+" surfacing — deferred, not in MG-1.

## Review fixup (MG-1.1)
- **Guarded, exclusive lock break** (`seed-lock.ts`): the stale-takeover path's unconditional `unlink` could delete a competitor's FRESHLY re-created lock (both classify the same dead pid; A unlinks+creates; B's lagging unlink deletes A's lock → both proceed). Replaced with rename-based capture-and-verify: `rename(path, tmp)` atomically captures the file (exactly one breaker wins; ENOENT → retry the O_EXCL create, still bounded at one takeover attempt); a captured LIVE-pid lock is restored and refused with `SeedLockHeldError`. The `seed-lock-takeover` event is now emitted AFTER the capture succeeds, so the awaited log I/O no longer sits inside the classification→break window. Accepted residual (docstring): three-party race during the restore window — advisory-lock-grade.
- **Post-acquire own-pid verify**: after the `open('wx')` create + write, the lock is read back; if it no longer carries our pid, throw `SeedLockHeldError` (assertable invariant).
- **Steal-interleaving test**: new test injects a live-pid lock via the test-only `onBeforeBreak` hook (fires between classification and the rename); asserts the breaker refuses, restores the competitor's lock, and emits no takeover event. 15 seed-lock tests green.
- **Meeting-brief staleness bullets**: `assembleBriefForMeeting` + the meeting fallback still rendered the old wiki bullet without the staleness label — both switched to the shared `wikiBullet(w, rel)`.
