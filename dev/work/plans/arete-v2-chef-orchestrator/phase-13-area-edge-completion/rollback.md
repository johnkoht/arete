# Rollback — phase-13-area-edge-completion (AC11)

## Code + prose (full revert)

All implementation landed as per-task commits on the build branch; `git revert` of the implementation commits removes code + skill prose together. Commits (oldest first):

- `3b10d89b` AC1 meetingsForArea preference
- `446d45d5` AC8 formatter polish
- `d2e5e6d6` AC7 jira read-side
- `a70918f2` AC4 sibling union + archive prefix
- `7e932760` AC6 project skill prose
- `9aebe3d7` D1 AreaMatch signal provenance
- `37ccf0e2` AC3 meeting-area.ts core
- `9f4cc3da` AC3 backfill-area CLI
- `f0a15fb9` AC2 set-area CLI
- `a714086b` AC2 process proposal + inheritance
- (process-meetings prose commit follows a714086b)
- `a1911b96` AC5 setProjectSlug service
- `b79a87d1` AC5 claim CLI

No migration; no consumer hard-depends on the new keys this phase (jira/metadata read-side is tolerant of absence; `proposedArea` is additive JSON; `signal`/`corroborated` are optional fields existing consumers ignore).

## Data rollback (live workspace, post-merge)

- **Backfilled meeting areas**: `arete meeting backfill-area --reset` — clears `area:`+`area_set_by:` ONLY where `area_set_by: backfill`. Verified by tests (`meeting-area.test.ts` reset suite + CLI apply→reset round-trip); approval/manual provenance and the 96 legacy capture-flow carriers (no provenance key) are untouched.
- **set-area writes**: hand-delete the two frontmatter keys (`area:`, `area_set_by:`), or re-run `set-area` with the correct slug. Per-meeting, explicit.
- **Claims**: `arete commitments claim <id> --clear`. Claims are inert metadata (NOT in the dedup hash — pinned test), so clearing restores the prior brief behavior exactly.

## Behavior rollback notes

- AC1's semantic change is live-inert until meeting areas exist beyond the legacy 96 (verified: zero live meetings carry cross-area `area:`+`topics:` combos — shadow gate). Reverting AC1 alone restores the W6 union.
- Formatter fixes (AC8) are rendering-only; revert restores prior rendering with no data impact.
