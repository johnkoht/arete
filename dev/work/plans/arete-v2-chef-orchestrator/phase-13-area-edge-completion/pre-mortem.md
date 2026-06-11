---
title: "Phase 13 — Area edge completion — DELTA pre-mortem"
slug: phase-13-area-edge-completion-pre-mortem
created: "2026-06-10"
parent: phase-13-area-edge-completion
type: delta
---

# Delta pre-mortem

Scope per the plan's Review disposition: the inherited phase-12 pre-mortem (R1–R10) covers the backfill-contract risks; this delta covers the three seeded risks the reviewer named plus three new risks found during build recon. Each risk gets a concrete mitigation that lands in the build (task-level, not prose). Every claim below was verified against code or the live workspace (read-only) — nothing is assumed.

**Recon inputs**: `area-parser.ts:392-482` (scoring internals), `meeting-lock.ts:208-276` (writeWithLock semantics), and a read-only scan of all 322 live arete-reserv meeting files (frontmatter `area:`/`topics:` distribution).

---

## D1 — 0.8 name-substring mislabel (seeded; HIGH)

**Sharpened by recon — this is not a long-tail problem, it is THE distribution.** `suggestAreaForMeeting` scores three signals: recurring-title (1.0), area-name substring in title OR summary (0.8), keyword-vs-focus Jaccard (similarity × 0.7, i.e. **max 0.7, reached only at similarity = 1.0**). With the inherited 0.7 floor, a keyword match essentially never qualifies alone — so **every backfill proposal that isn't an exact recurring-title match is a 0.8 name-substring match**. The "long tail" the MC3 spot-check was told to eyeball is the bulk of the table. And the 0.8 fires on a bare substring in the *summary* too ("we briefly touched on Glance 2.0 MVP" → 0.8 → `glance-2-mvp`) — summary-mention is structurally the same tangentiality that produced the observed leak failure mode (b).

| Severity | Likelihood |
|---|---|
| High (confident-but-wrong area; AC1 then also REMOVES the meeting from the right area — double damage) | High for summary-substring; Medium for title-substring (titles usually do name their area) |

**Mitigation (decision: per-match-type policy + preview flagging — both, because they're cheap and orthogonal; floor-raise rejected):**

1. **Additive `signal` provenance on `AreaMatch`** (area-parser.ts): each match records where it came from — `'recurring-title' | 'area-name-title' | 'area-name-summary' | 'keyword'` — and the winning match carries `corroborated: true` when a second distinct signal matched the same area. Purely additive fields; existing consumers (`project backfill-area`, `commitments backfill-area`, entity.ts) read only `areaSlug`/`confidence` and are byte-identical in behavior. (Without this, callers can only infer "name match" from `confidence === 0.8` — a magic-number comparison that breaks the day scoring changes.)
2. **Per-match-type floor for MEETING backfill only** (meeting-area.ts): a `'area-name-summary'`-only match does NOT qualify — the meeting stays area-less and is listed as unmatched (honest, recoverable). Title-name and recurring matches qualify as before. This is *stricter* than the inherited 0.7 floor, which the contract permits (the floor is a floor); the project/commitments verbs are untouched.
3. **Preview flags + sorts name-only rows** (AC3 CLI): uncorroborated `'area-name-title'` proposals render with a `name-only` marker, grouped last, with a summary line ("N of M proposals are name-only title matches — eyeball these before --apply"). JSON output carries `signal`/`corroborated` per proposal so the MC3 table John reviews has the column. `--apply` still writes all listed proposals — John's review of the flagged preview is the gate (matching the John-operated apply contract), and `--reset` scoped to `backfill` provenance is the recovery.

**Why not raise the backfill floor to >0.8?** It would zero out every non-recurring proposal (see distribution above), making backfill cover only meetings whose titles exactly match a recurring-meeting title — at that point the verb isn't worth shipping. Precision is recovered by signal-typing instead.

**Tests**: unit — summary-only name match excluded as candidate proposal; title-only name match flagged `name-only`; corroborated title match unflagged; existing area-parser consumers' suites pass unmodified.

## D2 — Multi-area recall loss (seeded; MEDIUM)

AC1's per-meeting preference means an `area: X` meeting stops matching area Y via topics. The reviewer asked: does any live meeting actually span areas? **Answered with data, not opinion** (read-only scan, 2026-06-10):

- Zero live meetings have `area: X` + a *different* area slug in `topics:` — AC1 itself changes nothing live at merge.
- **47 area-less meetings currently surface via the topics arm; ~10 of them carry topics matching BOTH glance areas** (e.g. `2026-05-29-claim-review-template-internal-strategy-meeting.md` → `glance-2-mvp` + `glance-communications`). Backfill assigning one area drops each from the other's brief. Notably this multi-area set overlaps the observed leak set (claim-review-template under glance-2-mvp was John's own leak example) — evidence that precision-over-recall is the right default here.

| Severity | Likelihood |
|---|---|
| Medium (under-includes; recoverable by deleting/extending the key) | Certain for ~10 known meetings once backfill is applied broadly |

**Mitigation:**
1. AC1's named exclusion fixture (already in plan) makes the trade-off tested, not surprising.
2. **Preview table carries an `also-matches-via-topics` column**: for each proposal, list other area slugs present in the meeting's `topics:` — the recall-loss candidates are visible at preview time, before John applies. (Cheap: the candidate lister already parses frontmatter.)
3. Post-merge checklist (ship report) names the ~10 dual-glance meetings explicitly so John decides keep-via-skip vs accept-the-drop per meeting.
4. Parked `areas:` plural stays the structural fix (phase-12 R4 posture, unchanged).

## D3 — Cross-phase contamination into phase-14 (seeded; MEDIUM-HIGH)

A confident-wrong backfilled area becomes ground truth for phase-14's `/update-project` scan → confidently-wrong README proposals. Compounding: AC1 makes the mislabeled meeting *invisible* in the right area's brief, so the error is harder to notice organically.

| Severity | Likelihood |
|---|---|
| High if it fires (writes to committed READMEs downstream) | Medium — bounded by D1 mitigations + John-gated apply |

**Mitigation:**
1. D1's signal-typing + summary-exclusion removes the highest-volume mislabel source *before* it can compound.
2. `area_set_by: backfill` provenance distinguishes machine-set areas forever — `--reset` recovers in bulk; phase-14 reviewers can see which areas were inferred.
3. **Binding sequence in the ship report**: phase-14 dogfooding starts only after John's MC3 preview review + long-tail spot-check passes (the plan's post-merge order, restated as a gate, not a suggestion).
4. Phase-14 decision 3 (proposals quote their source meeting) is the visibility net at proposal time — out of this build's scope but noted as the dependency contract.

## D4 — NEW: `writeWithLock` mtime-guard silently swallows set-area/backfill writes (HIGH likelihood if unmitigated)

Found in recon: `writeWithLock` defaults to a **60-second mtime guard** — if the target file was modified less than 60s ago, it returns `{ written: false, abstainReason: 'recent-user-edit' }` WITHOUT invoking the mutator. The AC2 flow is literally `process` (writes attendee_ids → mtime = now) **then immediately** `set-area` on John's confirm → set-area would silently abstain and the approve step would not inherit the area. Same for backfill `--apply` on freshly-pulled meetings. The failure is invisible: exit 0, no area written.

| Severity | Likelihood |
|---|---|
| High (the steady-state writer AC2 exists to create silently no-ops; commitments don't inherit) | High (process→set-area is the designed sequence; sub-60s gap is the normal case) |

**Mitigation (in-build, both halves):**
1. `set-area` and backfill-apply call `writeWithLock` with **`mtimeGuardSeconds: 0`** — the guard exists to protect against racing a human editor during *background* mutations; set-area/backfill are explicit, user-gated commands that own exactly two frontmatter keys (the same rationale the extract path uses for its guard opt-out, documented at `meeting-lock.ts:106`).
2. CLI **surfaces every `written: false` result** as an explicit error (set-area) or per-file warning + non-zero `unwritten` count in JSON (backfill) — never silent.

**Tests**: set-area on a file written milliseconds earlier succeeds (regression for this exact trap); a mocked abstain path produces the error/warning output.

## D5 — NEW: yaml round-trip reformats historical frontmatter on backfill apply (LOW-MEDIUM)

`writeWithLock` re-serializes the FULL frontmatter via `stringifyYaml`. Historical meeting files (especially the 96 written by the older capture flow, and any hand-edited ones) may not match yaml-stringify's normalized formatting (quoting style, `>-` folding, key order is preserved by parse but formatting is not) — a backfill apply across ~226 candidate files produces a one-time formatting-noise diff in a committed repo beyond the two intended keys.

| Severity | Likelihood |
|---|---|
| Low-Medium (git noise, not correctness: values + body preserved; body-only `hashMeetingSource` invariant means NO wiki re-integration cascade) | Medium (depends on per-file formatting drift) |

**Mitigation:** (1) accept — extract/approve already round-trip processed meetings through this exact serializer, so the normalization is the established house behavior, not new; (2) AC3's no-op write suppression means the noise is one-time (rerun = zero writes); (3) post-merge order tells John to `git diff` after the first small apply batch before applying broadly (preview → apply few → diff → apply rest). Documented honestly in the ship report.

## D6 — NEW: plan premise corrected — 96 live meetings ALREADY carry `area:` (LOW, informational but gate-relevant)

The plan says "zero `area:` keys in recent meeting files / nothing writes it." Recon: **96 of 322 live meetings carry `area:`** — written by the older capture flow (`arete meeting add` serializes `MeetingInput.area`, `integrations/meetings.ts:437`; the process-meetings skill's Step 1b suggested areas at capture). All 96 are pre-June; 0 of the 46 June meetings carry it (the W6 "June-style meetings carry topics:, no area:" comment is exactly right). The plan's *operative* claim survives on better evidence: zero meetings have `area: X` + different-area topics, so AC1 is live-behavior-identical — **verified empirically, not assumed**.

| Severity | Likelihood |
|---|---|
| Low (premise correction; no scope change) | Certain (it's already true) |

**Implications baked into the build:**
1. The AC10 live shadow gate stands as written (section counts unchanged) — and now has a real population to prove it against, which makes it a *stronger* gate, not a vacuous one.
2. AC3's candidate filter (only meetings WITHOUT `area:`) excludes the 96 — they are never re-proposed, never churned. Candidate count ≈ 226.
3. The 96 lack `area_set_by` → `--reset` provably never touches them (provenance scoping test covers absent-provenance files).
4. `set-area --set-by manual` gives John a way to re-stamp any of the 96 if one is wrong (no new scope; existing AC2 surface).

---

## Verdict

**No CRITICAL risks — proceed to build.** Two risks change the build concretely: **D1** (signal-typed matches + summary-exclusion + preview flagging → lands in AC3's tasks, with the additive area-parser change as its own reviewed step) and **D4** (`mtimeGuardSeconds: 0` + surfaced abstains → lands in AC2/AC3 tasks with a regression test for the process→set-area sequence). D2 adds one preview column + a post-merge checklist item. D3 is discharged by D1 + provenance + binding post-merge ordering. D5/D6 are documented behaviors with tests pinning their boundaries (no-op rerun; reset scoping).

Slice-gate restatement under the corrected premise (D6): Slice A's live shadow must show **unchanged section counts** across all live project briefs — now a meaningful assertion over 96 area-carrying + 47 topics-arm meetings, not a tautology.
