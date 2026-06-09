# Phase 9 Followup-1 Build Report

**Built**: 2026-06-04
**Scope**: Stance prompt rewrite (Proposal C hybrid) — code only, no LLM execution

## Commits

| SHA | Description |
|---|---|
| `a5ce597b` | `phase-9-followup-1(core): rewrite stance prompt — proposal C hybrid` — replaces the simple stance prompt with Proposal C's 10 contrastive KEEP/SKIP pairs + brief rules section + `_justification` schema. Updates 2 prompt-shape assertions in `person-signals.test.ts` for new phrasing. Parser unchanged at this commit. |
| `8398d275` | `phase-9-followup-1(core): drop neutral direction, require justification, hard-cap 3` — drops `neutral` from `StanceDirection` and `VALID_DIRECTIONS`; adds required `justification: string` to `PersonStance` and `_justification?: string` to `RawStanceResult`; parser rejects stances with missing/empty (whitespace-only) justification; `slice(0, 3)` at parser exit. Updates existing fixtures in `person-signals.test.ts` and `person-memory-unit.test.ts` to include `_justification` / `justification`. |
| `80ac881d` | `phase-9-followup-1(test): cover neutral-drop, justification-required, hard-cap` — adds a dedicated `parseStanceResponse — Proposal C invariants` suite (7 cases). |
| `09923067` | `phase-9-followup-1(dist): rebuild for Proposal C stance prompt + parser` — `pnpm`-equivalent `npx tsc` rebuild of `packages/core/dist/services/person-signals.{js,d.ts,*.map}`. |

## Files changed

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/src/services/person-signals.ts`

- `StanceDirection` union: dropped `'neutral'` → now `'supports' | 'opposes' | 'concerned'`.
- `VALID_DIRECTIONS` set: dropped `'neutral'`.
- `PersonStance` type: added `justification: string` between `evidenceQuote` and `source`.
- `RawStanceResult.stances[]`: added optional `_justification?: string`.
- `buildStancePrompt()`: replaced body verbatim from Proposal C lines 33-160 of the proposal (10 contrastive PAIRS, QUICK RULES section, DIRECTION section, OUTPUT SCHEMA with `_justification` required, FINAL REMINDERS, transcript suffix).
- `parseStanceResponse()`: extracts `_justification` from raw; rejects stance if any required field (including `justification`) is empty after trim; returns `stances.slice(0, 3)` at exit.
- `source` and `date` continue to be `''` at parser output (populated downstream by `entity.ts:1361-1365` — untouched).

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/test/services/person-signals.test.ts`

- Two prompt-assertion tweaks (commit 1): `'if uncertain'/'omit'` → `'when in doubt'/'skip'`; `'Extract stances ONLY for: Alice'` → `'Extract stances ONLY for Alice'` (colon removed because the new prompt phrases it inline).
- Eleven existing fixtures updated (commit 2) to include `_justification` so they pass the new parser gate; the `PersonStance` literal in the export-type compile check gained `justification: 'test justification'`.
- Seven new tests added (commit 3) in a `parseStanceResponse — Proposal C invariants` suite:
  - `drops stances with direction "neutral" (no longer a valid direction)`
  - `drops stances missing _justification entirely (audit-trail required)`
  - `drops stances with empty-string _justification`
  - `drops stances with whitespace-only _justification`
  - `hard-caps output at 3 stances even when LLM returns 5`
  - `validation runs before slice: dropped stances do not count toward the cap`
  - `schema-pass: well-formed stance with all required fields is accepted`

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/test/services/person-memory-unit.test.ts`

- Three `PersonStance` literals updated to add the new required `justification` field. Pure mechanical update; no semantic change.

### `/Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/dist/services/person-signals.{js,d.ts,d.ts.map,js.map}`

- Rebuilt from source via `npx tsc` in `packages/core/`. No hand-edits.

## Test status

| Test file | Cases | Pass | Notes |
|---|---|---|---|
| `packages/core/test/services/person-signals.test.ts` | 54 | 54 | Was 47 (baseline); +7 new Proposal C invariant tests. |
| `packages/core/test/services/person-memory-unit.test.ts` | 67 | 67 | Existing tests; fixtures updated for new required field. |
| `packages/core/test/services/entity.test.ts` | 22 | 22 | Unchanged; passes against new types. |
| **Combined sweep** | **143** | **143** | Full pass on all touched / dependent files. |

Typecheck: `npx tsc --noEmit` in `packages/core/` exits clean.

## Verification commands for the user

```bash
# 1. Confirm the new prompt body is in source (look for the contrastive PAIR signposts)
grep -c "PAIR " /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/src/services/person-signals.ts
# expected: 11 (10 PAIR headers + the "Considered PAIR 5" example in a test, but src-only check counts 10)

# 2. Confirm neutral is gone from the parser's allowed directions
grep "VALID_DIRECTIONS" /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/src/services/person-signals.ts
# expected: const VALID_DIRECTIONS = new Set<string>(['supports', 'opposes', 'concerned']);

# 3. Confirm hard-cap is at parser exit
grep "slice(0, 3)" /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/src/services/person-signals.ts
# expected: return stances.slice(0, 3);

# 4. Full Proposal C invariant test sweep
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator && npx tsx --test packages/core/test/services/person-signals.test.ts 2>&1 | grep "Proposal C\|invariants"

# 5. Confirm dist is in sync with src
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core && npx tsc --noEmit && echo "src typechecks"
grep "VALID_DIRECTIONS" /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/core/dist/services/person-signals.js
# expected: ['supports', 'opposes', 'concerned'] — no 'neutral'

# 6. Confirm 4 commits landed cleanly on the worktree branch
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator && git log --oneline -4
# expected: dist → test → core (parser) → core (prompt), all phase-9-followup-1
```

## User-gated next steps

1. **Re-extract Lindsay's stances with the new prompt** (LLM-firing, requires API key env):

   ```bash
   arete people memory refresh \
     --person lindsay-gray \
     --if-stale-days 0 \
     --skip-qmd \
     --snapshot-path <new-snapshot-path> \
     --yes --json
   ```

2. **Validate Proposal C target metrics on the new extraction:**
   - **Count**: target 60-90 stances (Proposal C estimate). If >100, prompt is still too loose. If <40, prompt is over-correcting.
   - **Sample 10 random stances**: verify each passes the audit's KEEP criteria (contestability + transfer). Target >85% precision.
   - **Sample 10 random `_justification` fields**: verify they name a real SKIP pattern that was considered (cite a PAIR number or describe the rejected alternative). If >2 are boilerplate, the model is gaming the field — add more counter-examples or tighten the requirement.
   - **Check for neutral entries**: should be zero (parser drops them). If any sneak in, the dist rebuild didn't land.
   - **Sample 5 single meetings**: verify none yielded more than 3 stances. If any did, the parser slice isn't applied.
   - **Sample 3 1:1 transcripts and 3 working-session transcripts**: 1:1s should still yield more keepers per the audit; working sessions should yield fewer. If they match, prompt may be over-correcting toward strict mode.

3. **Cost-estimate before triggering**: ~$4-5 at fast tier (similar to first refresh). Prefix is stable and aggressively cacheable; output adds ~30 tokens per stance for justification.

4. **Drop from 696 → target 60-90 range** — if the count comes in materially outside that window, re-open the prompt for iteration (the `_justification` log makes this grep-able).

## Known issues / residuals

- **`source` and `date` populated downstream**: confirmed at `entity.ts:1361-1365`. Parser output keeps `''` for both; the caller fills in. Unchanged from prior behavior. No new tests added here because this is existing-call-site contract, not parser scope.
- **`dist/AGENTS.md`**: was already modified in the working tree before this followup started (unrelated to scope). Left untouched as instructed — only `packages/core/dist/services/person-signals.*` was committed in the dist rebuild commit.
- **Cross-session dedup**: out of scope for this followup. If the new extraction still shows duplicate stances across meetings (same `topic` from N meetings → N entries), that's a separate post-extraction merge concern. Proposal C is per-call only.
- **Person-specificity of the example pairs**: all 10 contrastive pairs draw from Lindsay's audit. If the prompt is later reused for a non-PM, the example domain may subtly mislead. The contrastive structure teaches *shape* more than *content*, so this should be acceptable, but validation on a non-Lindsay person should happen as a sanity check before broader rollout.
- **No regression risk to other callers**: `PersonStance` consumers (`person-memory.ts`, `entity.ts`) read existing fields; the new `justification` field is additive and not asserted-on in renderers. Verified by full 143-test sweep on touched/dependent files.
