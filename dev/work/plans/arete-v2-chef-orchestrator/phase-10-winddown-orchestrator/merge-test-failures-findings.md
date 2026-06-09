# Merge gate: full-suite test-failure findings (Areté v2 Phases 1–12)

**Branch:** `worktree-arete-v2-chef-orchestrator`
**Baseline:** `main` (clean) at `/Users/john/code/arete`
**Suite state:** 4438/4457 pass, 17 fail.
**Verdict:** **3 of 17 are TRUE branch regressions** (all in one file, one product change + stale test fixtures). **14 of 17 are pre-existing / environment-flaky** and also fail on `main` — NON-BLOCKING.

Reproduction commands used throughout (single file): `ARETE_SEARCH_FALLBACK=1 npx tsx --test <file>`. Full suite is invoked from **repo root** (`process.cwd()` = repo root), which matters for one failure below.

---

## 1. Failure table

| # | Failure | File | Regression? (evidence) | Root cause | Recommended fix | Blocking? |
|---|---------|------|------------------------|------------|-----------------|-----------|
| 1 | AC K8: alias match returns the canonical slug | `packages/core/test/services/topic-detection.test.ts:134` | **Y** — passes on `main`, fails on branch; `topic-detection.ts` + test byte-identical to `main`, so transitive | `tokenizeSlug` (branch) now singularizes (`templates`→`template`) but transcript is tokenized by `normalizeForJaccard` (no singularize). Alias `cw-templates`→`[cw, template]`; transcript `cw templates`→`[cw, templates]` ⇒ only `cw` matches (1 hit <2) ⇒ no detection | Fix product code: make transcript tokenization symmetric with `tokenizeSlug` (see §3, Fix A) | **YES** |
| 2 | returns slug + score + matched tokens + lastRefreshed | `packages/core/test/services/topic-detection.test.ts:234` | **Y** — same as #1 | Same asymmetry. Slug `cover-whale-templates`→`[cover, whale, template]`; transcript has `templates` not `template` ⇒ 2/3 match ⇒ score `0.667` not `1.0` (test asserts `score===1`) | Fix A (symmetric tokenization). After Fix A this test passes unchanged | **YES** |
| 3 | populates topicWikiContext.detectedTopics… | `packages/core/test/services/meeting-context.test.ts:1855` | **Y (cascade of #1/#2)** — `meeting-context.ts` + test byte-identical to `main` | Same asymmetry, downstream. Slug `pricing-tiers`→`[pricing, tier]`; transcript `pricing tiers`→`[pricing, tiers]` ⇒ 1 hit ⇒ `detectTopicsLexical` returns `[]` ⇒ `topicWikiContext` undefined | Fix A (no test change) | **YES** |
| 4 | populates l2Excerpts with topic-tagged memory entries | `packages/core/test/services/meeting-context.test.ts:1914` | **Y (cascade of #1/#2)** | Same as #3 | Fix A | **YES** |
| 5 | returns empty l2Excerpts when detected topic has no tagged memory items | `packages/core/test/services/meeting-context.test.ts:1954` | **Y (cascade of #1/#2)** | Same as #3 | Fix A | **YES** |
| 6 | finds person in recent meetings via attendee_ids when not in attendees array | `packages/core/test/services/meeting-context.test.ts:446` | **N** — FAILS ON `main` too (verified in isolation), source + test byte-identical | Pre-existing bug in `attendee_ids`→`recentMeetings` resolution. Not introduced by this branch | Out of scope for merge. File as separate pre-existing bug | NO |
| 7 | extracts stances when callLLM is provided | `packages/core/test/services/person-memory-integration.test.ts:109` | **Y** — passes on `main` (18/18), fails on branch | Phase 9 followup-6 rewrote stance extraction: `_justification` is now a REQUIRED field (`person-signals.ts:241` drops any stance with empty/missing justification). Test mock returns stances WITHOUT `_justification` ⇒ all dropped ⇒ 0 extracted. Verified by probe: LLM called once, returns 1 stance, parser drops it (`stancesExtracted:0`) | Update STALE TEST (see §3, Fix B) — add `_justification` to mock stances | **YES** |
| 8 | deduplicates stances by topic+direction across meetings | `packages/core/test/services/person-memory-integration.test.ts:170` | **Y** — same as #7 | Same: mock stances lack `_justification` ⇒ dropped before dedup ever runs | Fix B (add `_justification` to mocks) | **YES** |
| 9 | deduplicates stances case-insensitively ("React"/"react") | `packages/core/test/services/person-memory-integration.test.ts:186` | **Y** — same as #7 | Same `_justification` drop | Fix B | **YES** |
| 10 | uses separate stance cache keys for different people on same meeting | `packages/core/test/services/person-memory-integration.test.ts:398` | **Y** — same family, **second cause** | Two stale couplings: (a) mock matches old prompt string `'Extract stances ONLY for: Jane Doe'` (colon) but branch rewrote prompt to `Extract stances ONLY for ${personName}.` (no colon, `person-signals.ts:182`) ⇒ falls through to `{stances:[]}` ⇒ `callArgs.length===0` (assert wants 2); (b) mock stances also lack `_justification` | Fix B + update prompt-match string (see §3, Fix B note) | **YES** |
| 11 | suppresses owner self-reminder when bilateral entry exists under counterparty | `packages/core/test/services/person-memory.test.ts:674` | **N** — FAILS ON `main` too; `person-memory.ts` + test byte-identical | Pre-existing failure in bilateral self-reminder suppression. Not this branch | Out of scope. File separately | NO |
| 12 | preserves owner-only items without bilateral counterpart | `packages/core/test/services/person-memory.test.ts:728` | **N** — fails on `main` | Same pre-existing cluster | Out of scope | NO |
| 13 | suppresses heuristic-based self-reminders when bilateral match exists | `packages/core/test/services/person-memory.test.ts:783` | **N** — fails on `main` | Same pre-existing cluster | Out of scope | NO |
| 14 | selectively suppresses: bilateral removed, unrelated owner-only preserved | `packages/core/test/services/person-memory.test.ts:848` | **N** — fails on `main` | Same pre-existing cluster | Out of scope | NO |
| 15 | grep guard — brief-assemblers.ts contains no forbidden LLM symbols | `packages/core/test/services/brief-no-llm.test.ts:38` | **Y (test-only)** — NEW file on branch; passes when run from `packages/core/` cwd, ENOENT when run from repo root (how the full suite runs) | Test builds path from `process.cwd()` + `src/services/brief-assemblers.ts` (`brief-no-llm.test.ts:30`). From repo root that resolves to `<root>/src/...` which doesn't exist (file is at `packages/core/src/...`) | Fix NEW TEST (see §3, Fix C) — resolve path from `import.meta.url`, not `process.cwd()` | **YES** |
| 16 | spawns server, polls health, opens browser, prints ready | `packages/cli/test/commands/view.test.ts:378` | **N** — FAILS ON `main` too; `view.test.ts` + `view.ts` byte-identical; run times out (exit 124) | Environment-flaky: spawns a real server + browser + health poll | Out of scope (known accepted flaky, like backend `agent.test.ts`) | NO |
| 17 | kills child process on SIGINT | `packages/cli/test/commands/view.test.ts:446` | **N** — fails on `main` too | Same environment-flaky harness | Out of scope | NO |

---

## 2. Grouped root-cause narrative

### Root cause A — `tokenizeSlug` singularize asymmetry (failures 1–5; 5 tests)
**The merge knot.** Phase 3.5 followup-5 (commit `ec702925`) rewrote `tokenizeSlug` in `packages/core/src/services/topic-memory.ts:150–158` to (a) drop stop-words `{vs,and,or}` and (b) singularize via `singularizeToken` (`topic-memory.ts:126–132`, strips trailing `s` on len≥4 non-`-ss` tokens). Goal: collapse `templates`/`template` etc. for the Jaccard alias matcher — legitimate and desirable for `bestAliasMatch`.

Independently, `main` shipped the lexical detector `detectTopicsLexical`/`detectTopicsLexicalDetailed` (`packages/core/src/services/topic-detection.ts`), which:
- tokenizes the **transcript** via `normalizeForJaccard` (`utils/similarity.ts:13`, **no singularize**), and
- tokenizes each **slug/alias** via `tokenizeSlug` (now **singularizes**) inside `scoreSurface` (`topic-detection.ts:125`).

Merging the two features creates a tokenization mismatch: slug side emits `template`, transcript side emits `templates`; they no longer intersect. `topic-detection.ts`, `meeting-context.ts`, `similarity.ts`, and both test files are **byte-identical to `main`** (verified via `git show main:… | diff`) — confirming this is a pure transitive-dependency regression, not a code or test edit.

- Failure 1 (alias `cw-templates`): drops from 2 non-stop hits to 1 ⇒ below the ≥2 rule ⇒ `[]`.
- Failure 2 (detailed score): drops from 3/3 to 2/3 ⇒ `score` `0.667` not `1.0`.
- Failures 3–5: identical mechanism, one layer up — `buildMeetingContext` calls `detectTopicsLexical` with slug `pricing-tiers`; `pricing tiers` transcript yields 1 hit ⇒ no detection ⇒ `topicWikiContext` undefined.

**Blast radius — production:** YES. This is live behaviour, not test-only. Any meeting transcript that uses the **plural** of a slug token (`templates`, `decisions`, `learnings`, `meetings`, `tiers`, …) now fails or under-scores lexical topic detection in `buildMeetingContext`. So the wiki-leaning meeting extractor silently stops attaching topic pages + L2 excerpts for plural-form mentions — a real precision/recall regression in the meeting pipeline. Tests are the canary; the bug ships.

### Root cause B — Phase 9 followup-6 stance rewrite + stale test fixtures (failures 7–10; 4 tests)
`person-signals.ts` was rewritten on the branch:
- New REQUIRED `_justification` field: `extractStancesForPerson` drops any stance whose parsed `_justification` is empty/whitespace (`person-signals.ts:235,241`). Intended audit-trail invariant (Proposal C).
- Prompt fully rewritten (contrastive pairs, etc.); the old line `Extract stances ONLY for: <name>` (colon) is gone — replaced by `Extract stances ONLY for ${personName}.` (no colon, `person-signals.ts:182`).
- Stance cap raised 3→5 (`person-signals.ts:257`); `neutral` direction removed.

The 4 failing tests in `person-memory-integration.test.ts` (which **pass on `main`**) are stale:
- Their mock LLMs return stance objects **without `_justification`** ⇒ all dropped ⇒ `stancesExtracted:0`. (Confirmed by probe: LLM invoked, returns 1 stance, parser discards it.)
- Failure 10 additionally matches the **old prompt string** (`'Extract stances ONLY for: Jane Doe'`) which no longer appears ⇒ mock returns `{stances:[]}` ⇒ `callArgs.length===0` (wants 2).

The product change is the intended Phase 9 behaviour; the **tests** are the stale party. (Note: the same file also ADDS new area-propagation tests that pass — confirming only the pre-existing 4 broke.)

**Blast radius — production:** The justification requirement is intended and shipping; the real prod LLM is instructed to emit `_justification`, so live extraction is unaffected. Risk is only that real stance recall now depends on the model reliably emitting a non-empty `_justification` — worth a soak watch, but not a merge blocker.

### Root cause C — new `brief-no-llm.test.ts` cwd-relative path bug (failure 15; 1 test)
NEW test on the branch (Phase 9). It computes `ASSEMBLERS_PATH = join(process.cwd(), 'src', 'services', 'brief-assemblers.ts')` (`brief-no-llm.test.ts:30`). The file actually lives at `packages/core/src/services/brief-assemblers.ts`. The test passes only when cwd is `packages/core`; the canonical full-suite invocation runs from **repo root**, so it ENOENTs. Test-only bug; the product file and its content are fine.

### Pre-existing / environment (failures 6, 11–14, 16, 17; 7 tests) — NON-BLOCKING
All verified to **fail on `main`** with byte-identical source+test, OR are environment-flaky:
- 6 `meeting-context.test.ts:446` (attendee_ids → recentMeetings) — fails on main.
- 11–14 `person-memory.test.ts` bilateral self-reminder suppression — fail on main; `person-memory.ts` identical to main.
- 16–17 `view.test.ts` — fail on main; spawn real server/browser, run times out (exit 124). Matches the diary's accepted pre-existing flaky set (`people.test.ts:166`, backend `agent.test.ts`).

These are **not introduced by this branch** and should not gate the merge. They should be tracked as separate pre-existing-bug tickets (especially 6 and 11–14, which look like genuine latent product bugs, not flakiness).

---

## 3. Ordered fix plan for a developer

Do these in order. Expected end state: **full suite green except the 7 documented pre-existing/flaky failures** (6, 11–14, 16, 17).

### Fix A — restore symmetric tokenization for lexical detection (fixes 1–5, the merge knot)
**Recommended approach: make the transcript side singularize the same way the slug side does, scoped to `topic-detection.ts` so `followup-5`'s `tokenizeSlug` behaviour is preserved everywhere it's already correct (the alias Jaccard matcher).**

Concretely, in `packages/core/src/services/topic-detection.ts`:
- Where the transcript is tokenized — `detectTopicsLexicalDetailed` line 185: `const transcriptTokens = new Set(normalizeForJaccard(transcript));` — apply the SAME singularization that `tokenizeSlug` applies, so transcript tokens and slug tokens live in the same space. Cleanest: export a small shared helper from `topic-memory.ts` (e.g. `singularizeTokens(tokens: string[]): string[]`, wrapping the existing private `singularizeToken`) and map the transcript tokens through it:
  `const transcriptTokens = new Set(singularizeTokens(normalizeForJaccard(transcript)));`
  Apply the `TOKENIZE_STOP_WORDS` drop too if you want full parity (harmless for transcripts — `vs/and/or` are not scored tokens anyway).

Why this over "scope `tokenizeSlug` so it doesn't singularize for detection": the followup-5 intent is that `templates` and `template` are the SAME token. Reverting singularization on the slug side for detection would re-introduce the `templates`/`template` clash the followup-5 commit was written to fix, and would split behaviour between the alias matcher and the detector. Making BOTH sides singularize keeps one consistent token space and satisfies both followup-5 AND alias/plural detection.

**Tests to update for Fix A:** NONE. Tests 1–5 are byte-identical to `main` and assert the correct (pre-regression) behaviour; symmetric tokenization makes them pass as-is. Do NOT weaken any topic-detection assertion.

**Add a regression test (recommended):** an explicit plural/singular case — slug `pricing-tiers` + transcript "pricing tiers" should detect — to lock the symmetry invariant so a future `tokenizeSlug` tweak can't silently desync the two sides again.

### Fix B — refresh stale stance fixtures in `person-memory-integration.test.ts` (fixes 7–10)
This is a **test** fix; the product code is correct.
1. Add a non-empty `_justification` string to every mock stance object returned by the four tests' `mockLLM` functions (lines ~122–131, ~190–199, ~234–243, ~420–438). Example: `_justification: 'Considered Pair 6 (project approval) and ruled it out — this is a transferable methodology position.'`
2. In the "uses separate stance cache keys" test (line ~415), change the prompt-match strings from `'Extract stances ONLY for: Jane Doe'` / `'…Bob Smith'` (colon) to match the new prompt. Safest match is the new header `'extracting STANCES held by Jane Doe'` or the reminder line `'Extract stances ONLY for Jane Doe'` (no colon, `person-signals.ts:182`). Confirm against the live prompt to avoid re-coupling to brittle wording — matching on `personName` substring presence is the robust choice.

### Fix C — make `brief-no-llm.test.ts` path cwd-independent (fixes 15)
In `packages/core/test/services/brief-no-llm.test.ts:30`, replace the `process.cwd()`-based path with one resolved relative to the test file:
```
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSEMBLERS_PATH = join(__dirname, '..', '..', 'src', 'services', 'brief-assemblers.ts');
```
(test is at `packages/core/test/services/`, source at `packages/core/src/services/`). This makes the grep-guard pass regardless of invocation cwd.

### Out of scope for the merge (file as separate tickets — do NOT block)
- 6 — `attendee_ids` → `recentMeetings` resolution bug (pre-existing on main; latent product bug).
- 11–14 — bilateral self-reminder suppression in `person-memory.ts` (pre-existing on main; latent product bug, worth its own investigation).
- 16–17 — `view.test.ts` server/browser/SIGINT (pre-existing environment flaky; consider gating these behind an env flag or moving to a separate integration lane).

---

## 4. Blockers vs acceptable

**TRUE blockers (branch regressions) — 3 logical fixes covering 10 failing tests, all addressable as above:**
- **A (product):** failures 1, 2, 3, 4, 5 — `tokenizeSlug` singularize asymmetry. **Has production blast radius** (lexical topic detection on plurals). Highest priority.
- **B (tests):** failures 7, 8, 9, 10 — stale stance fixtures vs intended Phase 9 justification + prompt rewrite.
- **C (test):** failure 15 — new test's cwd-relative path bug.

**Acceptable pre-existing / environment (NOT this branch's fault, NON-BLOCKING) — 7 tests:**
- 6, 11, 12, 13, 14 — fail identically on `main` with byte-identical source+test.
- 16, 17 — fail on `main`; environment-flaky real-server spawn.

**Merge recommendation:** Land Fix A, B, C before merge (A is the only one with real product impact and is mandatory). After those three, the suite is green except the 7 documented pre-existing failures, which should be merged with tracking tickets rather than blocked on.
