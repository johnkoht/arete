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
