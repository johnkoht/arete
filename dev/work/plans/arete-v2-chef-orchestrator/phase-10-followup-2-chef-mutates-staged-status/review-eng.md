# Phase 10 followup-2 — eng-lead review

**Reviewer**: senior staff engineer (not author)
**Reviewed**: 2026-06-01
**Plan**: `phase-10-followup-2-chef-mutates-staged-status/plan.md` (334 lines, v1, 2026-06-05)
**Verdict**: **APPROVE WITH FIXES** (3 concrete edits before build; substrate verification good, but 2 prerequisite mis-tenses + 1 audit-log inconsistency + 1 atomicity story hole)

---

## Claim verification table

| Claim | Code check | Status |
|-------|-----------|--------|
| `commitApprovedItems` already filters `v === 'approved'` at `staged-items.ts:485-488`, so `'skipped'` is silently dropped (pre-condition #3, AC3) | Verified: `staged-items.ts:485-489` is `Object.entries(statusMap).filter(([, v]) => v === 'approved').map(([k]) => k)`. Zero-LOC apply path holds. | **Correct** |
| Sibling field pattern at `staged-items.ts:204-247` and `:482` (basis for `parseStagedItemSkipReason`) | Verified: `parseStagedItemOwner` (204-247) is a textbook clone target — frontmatter-key lookup, type-guard, per-entry shape validation, drop-malformed-silently. Line 482 confidence read pattern also confirmed (`staged-items.ts:483`). Plan's "copy parseStagedItemOwner" maps cleanly. | **Correct** |
| Frontmatter cleanup at `staged-items.ts:575-579` deletes the five sibling fields; add `delete data['staged_item_skip_reason']` as one-line addition | Verified: lines 575-579 are exactly those five deletes. The single-line insertion lands cleanly. | **Correct** |
| `writeItemStatusToFile` (`staged-items.ts:266-292`) is the template for `writeChefSkipToFile` | Verified: 266-292 is read-parse-init-set-write, no lockfile, no mtime, no atomic-tmp-rename. New helper does need to be 3-5x its size (lock + mtime + body comment + atomic). Template is right; scope of the new helper is bigger than "small helper." | **Mostly correct — see Concern 4** |
| Re-extract clobber at `meeting.ts:1103-1108` | Verified at `packages/cli/src/commands/meeting.ts:1103-1111` — five sibling fields written wholesale (`staged_item_source`, `staged_item_confidence`, `staged_item_status`, conditionally `staged_item_owner`, `staged_item_matched_text`). The clobber path is real and is THE place to land preservation logic. | **Correct** |
| `proper-lockfile` adopted in Phase 10 10a-pre; Phase 10 main scope shipped (pre-condition #1) | Partially verified: `proper-lockfile` IS installed and used by `CommitmentsService.withLock` (`commitments.ts:14, 653`). BUT it's only wired to commitments.json — no meeting-file lockfile exists. The plan acknowledges this ("Followup-2 can ship without 10a-pre with a documented atomicity trade") but the framing in pre-condition #1 is misleading: 10a-pre's lockfile work IS shipped *for commitments*; it's NOT shipped for meeting files. Followup-2 needs to BUILD the meeting-file lockfile, not inherit it. | **Mis-tensed — see Concern 1** |
| `[[<directive>]]` parser surface from Phase 10 exists (pre-condition #2) | NOT verified. `grep -rn '\[\[unmerge\|\[\[unresolve\|\[\[archive\|\[\[confirm' packages` returns zero matches across `core/src` and `cli/src`. (The web `/unskip` endpoint is the whole-meeting-unskip flow; unrelated.) Phase 10 main scope has NOT shipped the directive parser. The plan acknowledges this ("If Phase 10's directive parser hasn't shipped, followup-2 includes a minimal parser scoped to `[[unskip]]` alone") — but Step 6's "extends Phase 10's surface or minimal local parser" presents this as an OR with a low cost on either branch. The local-parser branch is the de-facto path and Step 6 budgets ½ day for both the parser + SKILL.md prose + first-week banner. That's under-sized. | **Mis-tensed + under-budgeted — see Concern 2** |
| `--force-clear-skips` referenced as escape hatch | NOT verified — this is a NEW CLI flag. `grep force-clear-skips packages` returns nothing. Plan never explicitly says "new flag on `arete meeting extract`," but Step 5 implicitly creates it. | **New infra — see Concern 3 (minor)** |
| `chef-skip-log.md` format consistent with Phase 9 `brief-invocations.log` (AC8, Step 3) | Partially verified. Phase 9 format at `intelligence.ts:846` is `${ISO} ${mode} ${JSON.stringify(input)}\n` — three positional fields, JSON-quoted input. Plan's proposed format is `${ISO} <ACTION> <id> meeting=<slug> setBy=<who> reason="..." evidence="..."` — positional action+id, then key=value pairs with quoted strings. These are NOT the same shape. `wc -l` works on both, `grep` works on both, but the formats diverge. | **Divergent — see Concern 5 (minor)** |

---

## Verdict reasoning

Substantively the plan does the work the Phase 11 eng-review (C3) recommended: keep `staged_item_status` as flat string, add a sibling `staged_item_skip_reason` field. That preserves the apply-path zero-LOC story, mirrors the existing schema philosophy at `staged-items.ts:204-247, 482`, and ships without breaking backward compat. The Hard Parts (HP1 atomicity, HP2 visibility, HP3 first-week banner) are correctly identified and given proportional treatment. Step decomposition is reasonable.

What pushes this to APPROVE WITH FIXES rather than clean approval:

1. **Pre-condition framing is loose on two Phase 10 dependencies**. The plan says "ideally" for lockfile and "if not, fallback" for directive parser — both with a soft "ships-without-it" trade. But the reality on master is: lockfile is shipped FOR COMMITMENTS (not meeting files), directive parser is NOT shipped AT ALL. The "fallback" path is the only path. The plan needs to be honest about that, then size Step 2 and Step 6 against reality.

2. **Step 2 ("writeChefSkipToFile + mtime guard + atomic write, ~1 day")** is the riskiest single step and likely the most under-budgeted given (1) and (2) above. mtime guard + tmp+rename + body-comment insertion (with "fail soft if not locatable" being non-trivial regex/parsing work over staged-item body lines) + AND building the meeting-file lockfile wrapper (because the plan needs it given (1)) is closer to 1.5 days.

3. **Atomicity story has a real gap**. The mtime guard at 60s closes the chef-write-during-user-edit race, but it does NOT close the chef-write-vs-extract-write race. If chef writes at T=0 and extract starts at T=5s (parallel CLI run), the mtime guard fires only if chef sees a fresh user mtime — but here both writers think they're first. The plan's answer (Step 5 re-extract preservation logic in `meeting.ts:1103-1108`) closes the SEMANTIC race (extract preserves chef writes) but does NOT close the WRITE race (concurrent writes corrupt frontmatter). The new meeting-file lockfile from (1) above is what closes both; without it, R3's "low probability, recoverable via git checkout" is reasonable but should not be presented as comparable to the locked path.

4. **The audit-log format divergence** (Concern 5) is cosmetic but the plan claims consistency with Phase 9's pattern and it isn't actually consistent. Either match the format or own the divergence.

---

## Concerns (must address before build)

### Concern 1 — Lockfile pre-condition mis-tense

Pre-condition #1 reads "Phase 10 10a-pre `withLock` + `proper-lockfile` ideally landed." Reality: `proper-lockfile` is installed (`package.json`); `withLock` exists on `CommitmentsService` (`commitments.ts:653`). NEITHER is wired to meeting-file writes. Followup-2's "build its own narrow lockfile around `MeetingService.updateFrontmatter`" IS the build, not a fallback. Reword: "Phase 10 10a-pre adopted `proper-lockfile` for `CommitmentsService.withLock`. Followup-2 extends this to a NEW meeting-file write lock (Step 2 scope)." Then Step 2 is honest about the meeting-file lockfile being net-new.

### Concern 2 — Directive parser is wholly new infra; budget accordingly

Pre-condition #2 leans "extends Phase 10's surface OR minimal local parser." Code check: zero `[[unmerge]]` / `[[unresolve]]` / `[[archive]]` references in `packages/core/src` or `packages/cli/src`. The directive-parser surface does not exist. Step 6 budgets ½ day for SKILL.md prose + inline hints + first-week banner + directive parser + locate-the-meeting-from-id logic. That last part — finding which meeting file owns `ai_0042` — is non-trivial: the ID is per-meeting-scoped, not global, so the parser has to either scan all meeting files OR limit to the recent N days. Q5 ("`[[unskip <id>]]` — require meeting-slug qualifier?") punts on this with "lean id-alone v1" but doesn't spec the lookup cost. **Fix**: bump Step 6 to 1 day. Add a spec sub-bullet for the directive→meeting-file resolver (scan strategy + recency bound).

### Concern 3 — Atomicity story doesn't fully close the chef-write-vs-extract-write race

HP1 lists three risks: re-extract clobber, concurrent writer race, apply-after-chef-mutate timing. Mitigations: mtime guard, atomic tmp+rename, lockfile-if-available, re-extract preservation. The mtime guard catches user-in-editor (good). Atomic tmp+rename catches torn writes (good). But concurrent CLI invocations (e.g., chef SKILL invokes `writeChefSkipToFile` while `arete meeting extract` is running) is not caught by mtime (both writers see stale mtime) and is not caught by tmp+rename (last writer wins; chef write silently lost). **Fix**: Step 2 must build the meeting-file lockfile, not list it as conditional. R3 in the Risks section should be tightened: "ship with meeting-file lockfile; chef-skip-helper takes lock before mtime check + read + write + release."

### Concern 4 — Step 2 size underestimated (~1.5d realistic, not 1d)

`writeChefSkipToFile` is 3-5x the surface of `writeItemStatusToFile` (which is ~25 lines). It adds: lock acquire/release, mtime check, frontmatter parse+update for two fields (status + skip_reason), body-comment insertion with locate-the-item-line logic (the "fail soft if not locatable" wording understates: locating `- [ ] <text> [ai_0042]` lines requires parsing staged-section structure), atomic tmp+rename via storage adapter (storage adapter may not expose rename today — check), audit-log append, and tests for each branch. **Fix**: re-size Step 2 to ~1 day write + ~½ day tests-and-edge-cases.

### Concern 5 — Audit-log format diverges from `brief-invocations.log`

Plan references Phase 9's pattern but proposes a different format. Phase 9: `${ISO} ${mode} ${JSON.stringify(input)}\n` (positional). Plan: `${ISO} ${ACTION} ${id} meeting=<slug> setBy=<who> reason="..." evidence="..."` (key=value). Pick one. Either (a) match Phase 9 with `${ISO} chef-skip ${JSON.stringify({action, id, meeting, setBy, reason, evidence})}\n` (parseable by `jq` + `grep`), or (b) own the divergence in the plan with a one-line note ("key=value chosen for human-readability of evidence strings").

---

## Minor concerns

- **MC1 — `'skipped'` value overload (R5)**: The plan flags this and mitigates via `setBy`. But there's a second consumer: `meeting-processing.ts:416, 439, 476, 518, 557` already writes `'skipped'` during extract for various silent-merge / drop scenarios. After this ship, four producers can write `'skipped'`: user (manual), extract pipeline (silent-merge), chef (new), and re-extract preservation (forward). Audit log's `setBy` covers chef/user; nothing distinguishes user from extract-pipeline writes. Not a blocker — the consumer (`commitApprovedItems`) doesn't care — but the plan's "today `'skipped'` is only set via user manual skip" is factually wrong. Reword R5.

- **MC2 — Body-comment insertion idempotence**: AC2 writes `<!-- chef-skip: ... -->` near the item line. If chef writes twice on the same item (e.g., evidence gets refined), does the second write append a duplicate comment or update the existing one? Plan doesn't say. Lean: update if comment exists for same `<id>`; append if not. Spec it in Step 2.

- **MC3 — Orphan ID semantics (AC5)**: If chef-skipped `ai_0042` no longer appears in re-extracted sections (LLM removed the item), plan says "drop the orphan entry + log a one-line warning." Question: does the body-comment also get cleaned up? If extract regenerates the body and the orphan ID's line is gone, the comment is gone too — fine. But if the orphan ID's line is RENAMED (LLM re-emitted same semantic item with new ID `ai_0089`), we lose the chef-skip signal. Not addressable here, but worth a one-line non-goal: "rename detection across re-extracts is out of scope; orphan = drop."

- **MC4 — First-week banner removal semantics (AC7)**: "auto-removes after 7d OR first `[[unskip]]`" — what's the storage for "first ship date"? Probably workspace file mtime of some sentinel, or a config entry. Spec it.

---

## Build sequencing — 3-4 days realistic?

The 7-step decomposition is right. With the resizing above:

- Step 1: ½ day (correct)
- Step 2: 1.5 days (was 1 day) — meeting-file lockfile, atomic write, body-comment locator
- Step 3: ½ day (correct, assuming audit-log format question resolved)
- Step 4: ½ day (correct — straightforward markdown writer pass + delete-line)
- Step 5: ½-1 day (correct lower bound; orphan handling adds half a day if tested properly)
- Step 6: 1 day (was ½ day) — directive parser + meeting-file resolver + SKILL.md + banner is real work
- Step 7: ½ day (correct)

**Total honest range: 4.5-5 days**, not 3-4. The plan's range assumes Phase 10 directive parser exists; it doesn't.

---

## Final recommendation

**APPROVE WITH FIXES.** Three concrete edits before build:

1. **Pre-condition #1 + #2 re-tense**: lockfile is built here (not inherited); directive parser is built here (not extended). Then Step 2 + Step 6 sizes follow honestly.
2. **Atomicity story**: drop the "ships-without-lockfile" trade. Build the meeting-file lockfile in Step 2. R3 becomes "lockfile failure → audit + abort, never silent corruption."
3. **Audit log format**: pick consistent-with-Phase-9 (JSON.stringify) OR own the divergence with a one-line rationale.

Total estimate adjusts from 3-4 days to **~4.5-5 days**. C3 sibling-field design is exactly right; substrate verification on the apply path (zero-LOC change at `staged-items.ts:485-488`) is correct; cleanup path (`staged-items.ts:575-579`) lands cleanly. This is a precision strike on the CT2 structural gap and should ship.

The plan's core call — keep `staged_item_status` as flat string, add sibling `staged_item_skip_reason`, chef writes both, apply honors `'skipped'` for free — is exactly the right minimal-substrate-change. Get the prerequisite mis-tensing fixed and ship.
