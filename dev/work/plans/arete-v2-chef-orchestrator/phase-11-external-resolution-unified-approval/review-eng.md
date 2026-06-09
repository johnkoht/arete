# Phase 11 v1 — eng-lead review

**Reviewer**: senior staff engineer (not author)
**Reviewed**: 2026-06-01
**Plan**: `phase-11-external-resolution-unified-approval/plan.md` (640 lines, v1, 2026-06-05)
**Verdict**: **REVISE BEFORE BUILD**

The plan's *direction* is right and the goal decomposition (Gmail-resolve, chef-mutates-staged-status, conditional-unified-surface, decision-auto-stale) is sound. But several load-bearing technical claims do not match the current code. The plan reads as if it were drafted against an imagined post-Phase-10 substrate that conflates "reserved field names" with "implemented infrastructure." Below: claim-by-claim code check, then concerns.

---

## v1 → v2 fix verification table (against current source)

| Goal | Claim in plan | Code check | Status |
|------|---------------|-----------|--------|
| G1 — Gmail Sent | "Extend `pullGmailHelper` with `--sent` mode" (line 412) | `pullGmailHelper` already accepts arbitrary `--query`; `in:sent` is a free-form Gmail query. CLI delta is near-zero. **But** the AC1 cache shape `{ threadId, subject, recipients: [...], body_text, attachments: [...], sent_at }` is far richer than the current `EmailThread = { id, subject, snippet, from, date, labels, unread }` in `gws/types.ts:64-72`. No `to/cc/bcc`, no body text (only `snippet`), no attachments. | **Understated work** — see C1 |
| G1 — Hybrid pipeline | "Recipient match via people/<slug>.md frontmatter `email:` field" (line 322) | `email:` field exists in `people/internal/*.md` (verified `lindsay-gray.md` — `email: "lindsay.gray@reserv.com "` *with trailing whitespace*). No `EmailIndex` service exists in source today. | **Mostly works** — see MC1 |
| G1 — LLM tier | "LLM cross-check at fast tier" (line 113) | `ai.ts:80-89` confirms `extraction: 'fast'`. No task name `external_resolution` or similar exists; plan needs to spec the task name + tier mapping. | **Spec gap** — see MC2 |
| G1 — `source_external[]` populated | "Phase 10 v2 reserved `source_external[]`" (line 230) | grep over `packages/core/src/` returns ZERO matches for `source_external`, `ExternalSource`, `resolvedBy`, `resolvedEvidence`, `resolvedConfidence`. Phase 10 has not shipped; reservation is in the *plan*, not the source. | **Correct prerequisite, but plan presents it ambiguously** — see C2 |
| G2 — chef mutates `staged_item_status` | Plan proposes `staged_item_status: { ai_xxxx: { status: 'skip_already_done', reason, evidence, ... }}` (line 279-292) | Current type: `StagedItemStatus = Record<string, 'approved' \| 'skipped' \| 'pending'>` (`models/integrations.ts:14`). Plan changes both (a) the value union (`'skip_already_done'` is new), and (b) the value SHAPE (string → nested object). This is a breaking change to the apply flow at `staged-items.ts:478,485-488` and the meeting-CLI flow at `meeting.ts:1398-1463`. | **Breaking change not flagged as such** — see C3 |
| G2 — `MeetingService.updateFrontmatter(slug, mutator)` | Cited as the chef mutation entry point (line 352-358) | Does not exist. Closest is `writeItemStatusToFile` in `staged-items.ts:266-292`, which is a single-item flat-string writer. No lockfile, no mtime check, no mutator-fn API. | **Invented infrastructure** — see C4 |
| G2 — `proper-lockfile` | "adopted in Phase 10 10a-pre" (line 355) | Not in source (`grep proper-lockfile packages/` returns only `node_modules` noise from unrelated deps). Phase 10's 10a-pre includes it as a prerequisite; Phase 11 is *correctly* citing a Phase 10 dependency, but the wording reads as if it already exists. | **Correct prerequisite, mis-tensed** — see MC3 |
| G3 — `arete approvals` verb / MCP-action proposals | "MCP-action proposals in chef-curated winddown output" (line 372) | Chef SKILL.md does include a `propose-with-mcp-action` Pattern 3 (verified `daily-winddown/SKILL.md:37, 990, 1099`), but it is a PROSE convention — no structured action-execution framework exists. `arete approvals` is also unimplemented. | **Conditional gate, so OK to defer the spec**, but plan should be honest the work is real, not "additive on top of MCP-action" — see MC4 |
| G4 — decision auto-stale | "Append `## Stale (auto-flagged YYYY-MM-DD)` section to entry" (line 399) | `decisions.md` is append-only; entries are `## <title>` blocks. There's no entry-id system today, so referenced "decision-id" in the `[[archive <decision-id>]]` directive (line 401) doesn't have an addressable target. Title slugs would need to be canonicalized. | **Missing schema layer** — see C5 |
| G4 — `[[archive]]` / `[[unresolve]]` directive parsing | "Extends Phase 10's `[[unmerge]]`-style directive surface" (line 458) | No directive parser exists in source today (`grep '\[\[unmerge'` returns nothing). Phase 10 builds it. Phase 11 depends on it — fine — but the phrasing implies it exists. | **Correct prereq, presentation misleading** — see MC5 |

---

## Verdict reasoning

The plan does the *strategic* work well: it names the structural gap (chef can detect, can't enforce), frames the precision-vs-recall tradeoff honestly (HIGH-only auto-resolve, ≥0.95 precision floor), keeps decisions as "auto-stale not auto-close," and gates 11c behind soak data. The Hard Parts section is genuinely strong — particularly Hard part 1 (false-positive trust crater) and Hard part 4 (decisions are fuzzy).

What pushes this to REVISE-BEFORE-BUILD:

1. **G2 (chef-mutates-staged-status) is the lynchpin of the new value-add, and it requires breaking the existing `StagedItemStatus` shape from `string` to `object`**. The plan does not call this out, does not spec the migration, and does not address how `commitApprovedItems` (which today filters `v === 'approved'` over flat strings — `staged-items.ts:485-488`) will work post-shape-change. This is a real bug-risk surface that needs to be in 11b's spec.

2. **The Gmail integration is consistently understated as "extend with `--sent` mode" when it actually requires extending the `EmailThread` type, the `searchThreads`/`getThread` provider methods to fetch headers+body+attachments, and a new caching layer.** This is fine work to do, but estimating 11a at "7-10 days" while presenting it as a small extension is calibration-off. Honest estimate: probably 9-12 days once you account for body-text fetching, MIME parsing, attachment metadata, and the cache schema.

3. **Phase 10 dependencies are real, multi-layered, and not all reflected in pre-conditions**. The plan lists `source_external[]` reservation and `proper-lockfile` adoption. It misses: (a) the `[[<directive>]]` parser surface that Phase 11 inherits for `[[unresolve]]`/`[[archive]]`, (b) the `dev/diary/dedup-decisions.log` file format that `resolution-decisions.log` mirrors, (c) the `Stakeholder[]` shape with `role` field — used by recipient-matching but only specced in Phase 10.

4. **`staged_item_status` shape change is irreversible-ish**: any meeting file that gets a nested-object value written by chef will fail to round-trip through the existing `writeItemStatusToFile` / `commitApprovedItems` code paths unless those are updated AT THE SAME TIME. This needs to be an atomic refactor, not a chef-only addition.

If C1-C5 are addressed, this is APPROVE WITH MINOR. The shape-of-the-spec is right; the substrate verification is incomplete.

---

## High concerns (must address before build)

### C1 — Gmail Sent provider extension is substantial, not a flag

The plan claims AC1: cache structure `{ threadId, subject, recipients: [...], body_text, attachments: [...], sent_at }`. Current `EmailThread` is `{ id, subject, snippet, from, date, labels, unread }`. To populate the AC1 shape you need:

- Extend `EmailThread` to add `to: string[]`, `cc: string[]`, `body: string`, `attachments: Array<{filename, mimeType}>`, `sentAt: string`.
- Modify `GmailProvider.searchThreads` to also fetch `To`, `Cc`, `Date` headers — easy (just add to `metadataHeaders` list at `gmail.ts:104`).
- Add a new code path for body fetching (`format: 'full'` instead of `metadata`) plus MIME walk + base64 decoding for body text. The current `getThread` does `format: 'full'` but the response mapper at line 41-52 doesn't extract body.
- Add attachment listing (walk `payload.parts` for non-text parts).
- New cache file format + reader/writer (`.arete/cache/gmail-sent-YYYY-MM-DD.json`).

**Required**: 11a spec needs to enumerate the EmailThread schema extension explicitly and call out that this is a provider-layer change, not just a CLI flag. Estimate up by ~2-3 days.

### C2 — Phase 10 prereqs are spread across the plan; consolidate

`source_external[]`, `Stakeholder[]` with `role` field, `Commitment.createdAt`, `CommitmentsService.withLock`, `dedup-decisions.log` format, and the `[[<directive>]]` parser are all Phase 10 outputs that Phase 11 *uses*. Today the plan lists ~3 of these as pre-conditions and assumes the rest. If Phase 10 ships partially (e.g., 10c gets cut), Phase 11 silently breaks.

**Required**: Add a "Phase 10 substrate inventory" subsection enumerating EVERY Phase 10 deliverable Phase 11 depends on, with file-path anchors where possible. Pre-condition AC0 should reference this inventory, not a vague "Phase 10 model is stable."

### C3 — `staged_item_status` shape change is a breaking refactor

Plan proposes (line 279-292) a nested-object value where every existing reader expects a flat string union. Code sites affected:

- `staged-items.ts:14` — type definition (must change)
- `staged-items.ts:196-201` — `parseStagedItemStatus` (return shape change cascades)
- `staged-items.ts:285` — `writeItemStatusToFile` (must accept richer options)
- `staged-items.ts:485-488` — `commitApprovedItems` `Object.entries(statusMap).filter([,v] => v === 'approved')` becomes `v?.status === 'approved'`
- `meeting.ts:1398, 1457-1462` — CLI `approve` command's filter logic
- `meeting.ts:1105` — `processed.stagedItemStatus` write path

**Required**: 11b spec needs an explicit "schema migration" subsection covering (a) the new shape, (b) which readers are touched, (c) whether existing meeting files need an in-place migration or default-undefined is sufficient, (d) tests covering the v1→v2 transition (because some meeting files in the workspace will already have flat-string values from current production). Test AC7 must include a meeting file with mixed-shape entries (e.g., `ai_001: 'approved'`, `ai_002: { status: 'skip_already_done', ... }`) — current parser would crash here.

Suggested alternative shape that avoids breakage: keep `staged_item_status` as flat `'approved' | 'skipped' | 'pending' | 'skip_already_done'` and put the audit metadata in a NEW sibling field `staged_item_skip_reason: Record<string, { reason, evidence, detected_at, detected_by }>`. Parallels `staged_item_edits` / `staged_item_owner` / `staged_item_confidence` patterns already in the codebase (`staged-items.ts:204-247`, `:482`). This is more consistent with the existing schema philosophy.

### C4 — `MeetingService.updateFrontmatter(slug, mutator)` doesn't exist

Plan cites this as the atomicity primitive (line 352-358). Closest current API is `writeItemStatusToFile` — a single-item writer with no mutator-function API, no lockfile, no mtime guard.

**Required**: 11b spec needs to either (a) explicitly build this service (5-step API: lock → read → parse → mutate → atomic-write → release), with tests, and call out that this is NEW infrastructure not Phase 10 inheritance, or (b) reuse `writeItemStatusToFile` but extend it. Estimate +1-2 days for this scope. The atomicity story (Hard part 5) is otherwise well-thought-through, but the verb-level wiring is hand-waved.

### C5 — Decision auto-stale needs an entry-id scheme

Plan refers to `[[archive <decision-id>]]` (line 401), AC8 (line 515), and "decision-id" throughout 11d. `decisions.md` entries today are `## <title>` blocks with no stable ID. Slug-from-title is one option but it's lossy (title edits break it) and not unique (two decisions can share a title).

**Required**: 11d spec needs to:
1. Decide on entry-id scheme (hash of title? auto-generated ID prepended to title? frontmatter-with-id?).
2. Spec how the ID is allocated at decision creation (in `appendToMemoryFile` at `staged-items.ts:677-708`).
3. Spec how `[[archive <id>]]` looks up the entry to move (which markdown file? what does "move" mean structurally — delete-then-append, in-place markup?).

Without this, 11d is unimplementable as specified.

---

## Minor concerns

### MC1 — Email-field-parsing footgun

`people/internal/lindsay-gray.md` has `email: "lindsay.gray@reserv.com "` (trailing whitespace). Hybrid recipient-match needs `.trim().toLowerCase()` before comparing against Gmail `To`/`Cc` headers (which themselves may be `"Lindsay Gray <lindsay.gray@reserv.com>"` format requiring email-extraction). 11a should call out an `EmailIndexService` with normalized lookup.

### MC2 — LLM task name + tier mapping

The plan references "fast tier" but doesn't propose a task name. `ai.ts:80-89` shows the task-tier mapping is data-driven. 11a should propose a new task name (e.g., `external_resolution`) and add it to `DEFAULT_TASK_TIERS` with `'fast'`. Otherwise the call has to overload `extraction` and dilute its semantic.

### MC3 — `proper-lockfile` prereq tensing

Plan says "lockfile (`proper-lockfile` adopted in Phase 10 10a-pre)" which reads as if it's already in source. Reword to "adopted in Phase 10 10a-pre; Phase 11 inherits and extends to meeting-file writes."

### MC4 — `arete approvals` verb data path is unspecified

11c proposes `arete approvals --today`, `--auto-resolved`, `--approve-all`, `--json`. The plan describes WHAT it does (line 366-384) but not the file-IO sequence:
- Does it read commitments.json + ALL meeting files in `resources/meetings/`?
- How does `--approve-all` atomically write N meeting Approved sections + commitments.json + memory files (decisions.md, learnings.md)? Today `commitApprovedItems` is per-meeting-file; cross-meeting atomicity is genuinely new infra.
- AC10 mentions all-or-nothing recovery — that's a tmp+rename across N+1 files, which is non-trivial filesystem-level work.

This is conditional-build, but the spec depth for 11c is thinner than 11a/11b. If Phase 10 soak fires GO, you'll re-spec at that point.

### MC5 — Directive parser inheritance from Phase 10

`[[unresolve]]` and `[[archive]]` inherit from Phase 10's `[[unmerge]]` parser. Phase 10 has not shipped, so the parser doesn't exist yet. Phase 11 plan should add a note that the directive-parser surface is Phase 10 deliverable; Phase 11 extends it with two new verbs.

### MC6 — Backward compat for existing commitments

Plan doesn't address: existing commitments without `source_external[]` populated — how does `brief` verb / `arete commitments` output handle them? Phase 10 reserves the field as `[]`, so the typesystem default should hold; but the migration timing (Phase 10 migration writes `[]` to all existing entries, Phase 11 populates a subset) deserves one AC line stating the no-op behavior for unpopulated entries.

### MC7 — Frontmatter rendering of `skip_already_done` for John

Plan AC7 writes the marker to frontmatter; AC7c writes an inline body comment. Question: does John actually SEE `staged_item_status: skip_already_done` in his editor? Most YAML frontmatter is collapsed/ignored visually. The body comment alongside is the visible signal — fine, but AC7c should be REQUIRED, not just an audit nicety.

### MC8 — Cost projection arithmetic is unverified

Plan claims $0.50/day median, $1.50/day heavy. The hard-part-2 numbers (70 commitments × ~5 cross-checks/day × $0.001/call ≈ $0.35/day) are plausible at fast tier IF the recipient pre-filter culls aggressively. But the plan doesn't show the math; AC4 just states the budget. Add an estimated-budget table to AC4 with assumptions (calls/day, $/call, total).

### MC9 — Golden-set fixture path not specified

AC3a says "50-pair labeled set drawn from arete-reserv real data." Plan should commit a fixture path (e.g., `dev/work/plans/arete-v2-chef-orchestrator/phase-11.../golden-set.md`), parallel to Phase 10's `golden-set-from-triage-2026-06-03.md`. Otherwise reproducibility on the precision-floor measurement is informal.

### MC10 — R10 (sticky `[[unresolve]]`) is right but vague

Plan says "if `(commitment_id, evidence_url)` pair was unresolved within 14d, skip + flag." Mitigation logic needs to be specified: where is the sticky-unresolve cache stored? (Plan implies `resolution-decisions.log`, but logs are append-only; querying the log on every chef invocation is fine but should be called out.) Test AC for this would be: auto-resolve → unresolve → next-day's hybrid pipeline finds same evidence → must NOT re-resolve.

---

## Strengths

- **G2 framing is exactly right.** "Chef detects but can't enforce" is the structural gap, and `staged_item_status` mutation is the correct mechanism. Tonight's CT2 catch is a clean motivating case.
- **Hard part 1 (trust crater) gets the right weight.** HIGH-only auto-write, MEDIUM-flagged-only, precision floor ≥0.95 (vs Phase 10's ≥0.85), first-week banner, `[[unresolve]]` recovery — these are the right defaults.
- **Conditional 11c gate is well-specified for Phase 11 standards.** Hard part 6 has concrete numeric criteria (15+ items, 5+ meetings, 30%+ dupes, >2 min context-switching). Default = don't build.
- **Decision auto-stale is correctly framed as "auto-stale not auto-close."** Hard part 4 honestly grapples with the fact that decisions don't have done-states.
- **R9 (Slack provider doesn't exist) is acknowledged.** Phase 11 ships Gmail-only and accepts the limitation.
- **Soak observability spec (line 599-624) is solid.** Daily checks, rollback triggers in priority order, success criteria with measurable thresholds — mirrors Phase 10's pattern.

---

## Build sequencing recommendation

Phase 10 must ship + soak (14 days) first — agreed. Once cleared:

1. **11b BEFORE 11a** — the structural fix (chef-mutates-staged-status) is the higher-value, lower-risk delivery. Even if 11a's precision floor misses ≥0.95, 11b can ship using Slack DM evidence (manually surfaced by chef per CT2's current behavior) OR no-evidence-required if user manually flags. Get the apply-pathway working first; then layer auto-detection on top.
2. **11a SECOND** — Gmail Sent integration + auto-resolve. Requires the schema work (C1) AND the precision-floor work (AC3a). If golden-set precision <0.95, ship as MEDIUM-only-surface (Hard part 1 mitigation).
3. **11d THIRD** — decision auto-stale. Requires entry-id scheme (C5). Lower priority because soft signal.
4. **11-audit FOURTH** — `[[unresolve]]`, `--explain`, banner. Wraps 11a+11b.
5. **11c LAST, conditional** — only if Phase 10 soak retro hits GO gates.

Total honest range: **18-28 days** (vs. plan's 17-25), assuming C1-C5 are addressed in re-spec.

---

## Atomicity story

**Partially specified, gaps remain.**

**Specified well:**
- `staged_item_status` write via atomic tmp+rename + lockfile (line 352-358, Hard part 5)
- mtime guard at 60s for user-in-editor (line 356, AC7a)
- Re-extract preservation flag (`--force`) (line 432, AC7b)

**Gaps:**
- The `MeetingService.updateFrontmatter` API doesn't exist; the spec assumes Phase 10 builds it OR Phase 11 builds it without saying which.
- Cross-meeting atomic write (11c AC10) is sketched at a single sentence — "tmp+rename pattern" — but N-file atomic writes are genuinely hard. Either each file is atomically renamed individually (and partial failure mid-batch leaves N-of-M files updated) OR you use a journal/two-phase pattern. Plan doesn't disambiguate.
- Concurrent `arete meeting extract` running while chef writes `staged_item_status`: the lockfile mitigates corruption but doesn't address semantics. Extract re-write would clear status; AC7b says `--force` clears, default preserves. The non-`--force` re-extract case still re-runs the LLM extractor and replaces staged sections — does it preserve `staged_item_status` keys whose item IDs no longer exist (orphans)? Spec silent.

---

## Question-by-question (Q1-Q7)

**Q1 — Email mapping required vs graceful degradation?** Plan leans graceful. **Agree.** R11 (line 570) is the right framing; surface missing-email as a backfill nudge. Required-only would gate Phase 11 on a backfill chore John has not committed to.

**Q2 — Artifact extraction: single LLM call vs separate extractor?** Plan leans single LLM call (cross-check prompt handles artifact reasoning). **Agree.** Separate regex extractor for noun phrases is brittle (plan acknowledges in line 324); inline LLM reasoning is cheaper-of-the-two given fast-tier pricing.

**Q3 — `[[confirm <id>]]` directive: auto-resolve or user-resolve?** Plan leans user-resolve (preserves `resolvedBy: 'user'` semantics). **Agree.** MEDIUM-flagged-confirmed-by-user is morally a user-resolution; tagging it as auto-resolve would dilute the audit trail.

**Q4 — 30-day stale threshold?** Plan leans 30d uniform with soak tuning. **Lean toward 45-60d for v1.** Decisions don't churn at the same cadence as commitments; 30d would catch every "Drive Glance 2 MVP by EOY" type decision that's mentioned in a quarterly retro and nothing else. 45-60d gives more headroom and reduces false-positive-stale rate. Either way, threshold should be config-tunable.

**Q5 — 11c GO/NO-GO: who decides?** Plan leans John, with PM+eng consult. **Agree** for personal-tool context. Concrete gate criteria (Hard part 6) reduce subjectivity to the right level.

**Q6 — `resolvedConfidence: MEDIUM` in commitments.json?** Plan leans winddown-surface-only (MEDIUM never writes). **Agree.** Field reservation for future provider with different confidence ladder is fine.

**Q7 — Banner removal: 7d-or-first-unresolve?** Plan leans 7d-timeout if no `[[unresolve]]`. **Agree** *with caveat* — if zero unresolves in 7d that's either "auto-resolve is perfect" (good) or "user didn't notice" (bad). AC12 should include a soft prompt at d3 in chef header asking John to confirm the auto-resolves looked right; otherwise the timeout is a passive vote of confidence that may not reflect actual review.

---

## Final recommendation

**REVISE BEFORE BUILD.**

Re-spec C1-C5 in a v1.1 (don't need a full v2 round — these are scoped fixes). Key edits:
- **C1**: Enumerate `EmailThread` extension explicitly. Add MIME body-fetch + attachment-walk to 11a scope. Bump estimate +2-3 days.
- **C2**: Add "Phase 10 substrate inventory" subsection with file-path anchors for every inherited deliverable.
- **C3**: Choose between (a) breaking `StagedItemStatus` shape (with full migration spec + test coverage) OR (b) parallel sibling field `staged_item_skip_reason`. I'd lean (b) — consistent with existing schema patterns at `staged-items.ts:204-247, 482`.
- **C4**: Either build `MeetingService.updateFrontmatter` in 11b explicitly (with API, lockfile, mtime guard, tests) OR scope to extending `writeItemStatusToFile`. Call it out as new infra, not Phase 10 inheritance.
- **C5**: Spec decision entry-id scheme. Either change `appendToMemoryFile` to allocate IDs at creation, or define a `## <title>` → slug derivation with explicit collision handling.

Also address MC1-MC10 in the re-spec; they're all small but cumulatively meaningful.

Once C1-C5 are in v1.1: APPROVE for build under the sequencing above (11b → 11a → 11d → 11-audit → 11c-conditional).

The plan's core insight — that the chef detecting "already done" needs a structural enforcement pathway, not just a prose nudge — is correct, important, and timely. Get the substrate verification right and this ships clean.
