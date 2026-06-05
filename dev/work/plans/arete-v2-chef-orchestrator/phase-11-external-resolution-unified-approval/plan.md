# Phase 11 — Gmail Auto-Resolve + Conditional Unified Approval

**Status**: planning — v3 (post pre-mortem; PROCEED WITH MITIGATIONS — F1-F4 + M1-M5 incorporated)
**Authored**: 2026-06-05 (v1), revised 2026-06-06 (v2), revised 2026-06-07 (v3)
**Parent**: arete-v2-chef-orchestrator
**Depends on**: Phase 10 (data model + reactive dedup + directive parser) shipped + 14d soak CLEAN PROCEED (no caveats); Phase 10 followup-2 (chef-mutates-staged-status) shipped + 7d soak CLEAN PROCEED + retro accepted before Phase 11 build kickoff (F1)
**Triggered by**: 2026-06-03 commitment-triage finding (6/113 = 5% of open commitments were already-done-but-not-auto-resolved)

**Revision history**:
- v1 (2026-06-05): four-goal draft (Gmail auto-resolve + chef-mutates-staged-status + conditional unified approval + decision auto-stale). REVISE BEFORE BUILD from both PM and eng-lead.
- v2 (2026-06-06): restructured per reviewer recommendations.
  - **Goal 2 (chef-mutates-staged-status) extracted** to `phase-10-followup-2-chef-mutates-staged-status/` (separate plan).
  - **Goal 4 (decision auto-stale) deferred to Phase 12+** — no empirical pain signal.
  - **Goal 1 + Goal 3 retained** with PM/eng fixes applied (G1-G6, C1-C5).
- v3 (2026-06-07): pre-mortem mitigations F1-F4 + M1-M5 incorporated. PROCEED WITH MITIGATIONS verdict. No further review pass — orchestrator moves to BUILD scheduling after v3.

---

## v2 → v3 changes (pre-mortem-driven)

| ID | Pre-mortem class | v2 said | v3 says |
|----|------------------|---------|---------|
| F1 | Soak attribution collapse across three phases | AC0 required "Phase 10 14-day soak success criteria met" (judgment-call on "with caveats") | **New AC0 hard-gate**: Phase 10 retro AND Phase 10 followup-2 retro must both close as **CLEAN PROCEED** (no PROCEED-WITH-CAVEATS) BEFORE Phase 11 build kickoff. Followup-2 7-day soak must be COMPLETE (retro written + accepted), not just started. Phase 11 mutations carry `phase: 'p11-11a'` attribution field in `resolution-decisions.log`. Per-winddown latency budget tracks phase line items. |
| F2 | `[[confirm]]` degrades into passive bulk approval | AC11 included `[[confirm-all-week-1]]` bulk directive + day-3 prompt | **Removed `[[confirm-all-week-1]]` entirely** (foot-gun). Day-3 prompt rephrased: "review the list below; if any look wrong, `[[unresolve <id>]]`." Promotion to auto-mutate at day 7 requires **≥1 explicit `[[confirm <id>]]` during week 1** (engagement signal) AND zero `[[unresolve]]` actions. Zero confirms = user didn't audit, NOT auto-resolve is perfect. Extends confirm-gated mode by 7d if no confirm engagement. Added `[[unconfirm <id>]]` directive (24h window) for wrong-confirm recovery. Inline full evidence (URL + LLM reasoning + recipient + sent-at) in staged-for-confirm chef section. |
| F3 | 11c gate evaluated at day 14 captures novelty-distorted data | "Gate criteria evaluated after 14d Phase 10 soak" | **Deferred 11c GO/NO-GO to day 28** of Phase 10 soak (two weeks after soak end). Default NO-GO at day 14 with no override. Steady-state criterion added: day-21-to-day-28 items/day, dupe-percent, and context-switching must all be within 30% of day-14-to-day-21 (regression check) AND within 30% of Phase 9 pre-Phase-10 baseline. Explicit measurement protocol in §"Conditional gate criteria for 11c." |
| F4 | `EmailThread` shape change breaks serialization / cache / prompt-template callers | R10 said "fetchBody opt-in, new fields default empty" (semantic-only mitigation) | **11-pre adds 1-day pre-soak BEFORE 11a build**. Cache file format versioned: `cacheVersion: 2` field on `EmailThread`; v1-shape caches invalidated, not crashed. Serialization gate: new fields excluded from JSON output when `fetchBody=false`. Snapshot tests on the new shape before AND after the change. Inbound `EmailThread` caller audit committed to 11-pre build report. Prompt-template surface area for any LLM prompt previously consuming `EmailThread` updated atomically. |
| M1 | Golden-set labeling falls to John mid-build with no time budget | "committed BEFORE 11a build" (implicit John labor) | **Scheduled 45-min John session at 11-pre day 2** as explicit calendar event (not background "when convenient"). Synthetic-negative seeding: 36 of 50 pairs auto-generated from `commitments.json` × `gmail-sent-*.json` mechanical-mismatch cross-product; remaining 14 are John-labeled judgment calls. 11a pipeline build is unblocked on golden-set absence (AC3a precision-gate fires at 11a END, not start). |
| M2 | followup-2 chef-skip-log and Phase 11 resolution-decisions.log don't cross-reference | Each log silo'd to its own phase | **11a logs `RESOLVE-DEFERRED-TO-FOLLOWUP-2`** line when AC8 step 2 fires (still-staged path → followup-2 owns). Followup-2's `staged_item_skip_reason.evidence` accepts multi-source string (`"slack-dm+gmail:<thread-id>"`). Daily soak observability includes a cross-phase commitment-id collision check. |
| M3 | 180-day Gmail cache for old stragglers is heavy on API quota + memory | AC1 said "regenerates daily" with no depth ceiling | **60-day cache-depth ceiling**: if `max(14, today - min(open_commit.date))` exceeds 60d, chef prompts user for confirmation ("Gmail Sent cache will pull N days; this may consume substantial API quota and add S seconds to daily pull. Continue?"). Cache depth surfaced in winddown summary. Hard cap at 90 days (older commitments emit a "won't auto-resolve" notice). |
| M4 | 14d `unresolveSuppressedUntil` has no permanent-suppress path | "now + 14d" only; user burned by 14d-loop on low-artifact commitments | **`[[unresolve <id> --permanent]]` directive variant**: sets `unresolveSuppressedUntil = '2100-01-01'` (far-future sentinel = permanent). Second `[[unresolve]]` on same `(commitment, evidence)` pair within 30d auto-promotes to permanent (one-line repeat-detection in directive handler). Surface in chef output when repeat detected: "this is your second unresolve of same evidence; promoting to permanent suppress." |
| M5 | `role: 'self'` stakeholders leak into recipient match (calendar self-invites false-positive) | Plan didn't explicitly say "recipient match excludes role: 'self'" | **Recipient pre-filter excludes `stakeholders[].role === 'self'`** (one-line filter, parallel to Phase 10 M2 fix). New test case: commitment with `[{slug: 'john-koht', role: 'self'}]` + Sent to `john.koht@reserv.com` → pipeline returns no-match cleanly, never reaches LLM. |

---

## v1 → v2 changes (retained for trace; condensed)

Scope (PM): 4 goals → 2 — Goal 2 extracted to Phase 10 followup-2, Goal 4 deferred to Phase 12+. Estimate 17-25d → 9-20d.

Eng-lead fixes: C1 (Gmail provider extension is substantial, +2-3d), C2 (full substrate inventory), C3 (Goal 2 removed), C4 (writes only to `commitments.json` via withLock), C5 (entry-id system N/A — Goal 4 deferred).

PM fixes: G1 (ordering rule — commitments.json first, still-staged → followup-2), G2 (cache depth = `max(14, today - min(open_commit.date))`), G3 (catch-up cost ceiling $3 with `--yes-cost`), G4 (Phase 10 parser quality hard-gate), G5 (structured `unresolveSuppressedUntil` field, not log-grep), G6 (Goal 4 deferred), UX (first-week `[[confirm]]` gate).

---

## Background

Phase 10 closed the same-meeting + cross-meeting reactive dedup loop. Phase 10 followup-2 closes the chef-mutates-staged-status structural gap.

The remaining real-user gap for Phase 11:

### Gap — External evidence of completion does not auto-resolve commitments

In the 2026-06-03 triage, 6 of 113 open commitments (~5%) were already-done. Status-letter draft, CoverWhale/Leap DOI feedback, the new-engineer overview session — each marked `@completedAt 2026-06-03` in `week.md` but still `status: 'open'` in `commitments.json`. The user resolved them manually with `arete commitments resolve <id>`.

This 5% signal density is enough to justify automation IF — and only if — false-positive auto-resolve can be held near zero. A silently-dropped commitment is a trust crater. The eng review, PM review, and pre-mortem converge on: ship Gmail-only, HIGH-confidence-only, with a first-week `[[confirm]]` gate AND ≥1 explicit confirm engagement before promoting to auto-mutate (F2 mitigation).

### Conditional — Unified approval surface

Phase 10 v2 explicitly deferred the unified approval surface. PM G5 finding: at 22+ items/day the unified MCP-action surface may be SLOWER than the per-meeting UI. The Phase 10 soak data will tell us; v3 defers the GO/NO-GO decision to day 28 of Phase 10 soak (F3 mitigation) to avoid novelty-distorted soak-period data.

### Why Goal 2 (chef-mutates-staged) moved out

Per PM review §"Strongest recommendation": Goal 2 has fresh empirical signal, no Gmail dependency, lower trust risk, and is a 3-4 day delivery. See `phase-10-followup-2-chef-mutates-staged-status/plan.md`.

### Why Goal 4 (decision auto-stale) deferred

Per PM G6: signal density for decision-rot does not exist in current data. Per eng C5: `decisions.md` has no entry-id system. Defer to Phase 12+.

---

## Goals (v3 — two)

1. **External-source resolution detection — Gmail Sent only**: when a commitment's intended action has external evidence of completion (a Gmail Sent message matching recipient + artifact + timing), auto-resolve at HIGH confidence with audit trail. MEDIUM confidence surfaces "possibly done, confirm?" for user adjudication via `[[confirm <id>]]`. LOW is ignored. Precision floor ≥0.95 on a 50-pair golden set. First-week trust gate: HIGH stages a resolve, user `[[confirm]]`s next winddown; after 7d zero-rollback AND ≥1 explicit `[[confirm <id>]]` engagement, demote to auto-mutate.

2. **Unified chat-first approval surface [CONDITIONAL on Phase 10 day-28 soak]**: optional ADDITIVE surface — `arete approvals --today` CLI verb + MCP-action proposals — that lets the user approve a day's worth of deduped commitments in one flow. Per-meeting approval continues to exist. Decision-to-build gated on day-28 Phase 10 soak metrics; see §"Conditional gate criteria for 11c."

---

## Non-goals (v3 — expanded deferrals)

- **Chef-mutates-staged-status (Goal 2 in v1)** — `phase-10-followup-2-chef-mutates-staged-status/`.
- **Decision/learning auto-stale (Goal 4 in v1)** — Phase 12+.
- **Slack Sent-message provider** — Phase 12+.
- **Jira auto-resolve via ticket state** — Phase 13+.
- **Calendar auto-resolve** — out of scope.
- **`[[edit]]` directive flow** — Phase 10 v2 G4 non-goal continues.
- **Cross-day reactive dedup window extension** — orthogonal to Phase 11.
- **Reopening user-resolved commitments** — `[[unresolve]]` is for auto-resolved entries only.
- **Auto-resolve from in-transcript mentions** — external signal only.
- **Bulk historical auto-resolve on first ship** — only commitments still open at ship time.
- **Auto-resolve writes to meeting-file frontmatter** — Phase 11 v3 only writes to `commitments.json`.
- **`[[confirm-all-week-1]]` bulk directive** — REMOVED per F2. Per-entry `[[confirm <id>]]` is the only confirm path. Bulk directive is a passive-vote foot-gun.
- **Cache depth > 90 days** — hard cap; older commitments emit a "won't auto-resolve" notice (M3).

---

## Pre-conditions (Phase 10 substrate inventory — eng C2 + F1 hard-gate)

Phase 11 v3 inherits Phase 10's full substrate. Each item below must be present and verified at Phase 11 build start. If any is missing or unstable, Phase 11 spec gets revisited rather than auto-pulled forward.

### Soak retro hard-gate (F1)

- **Phase 10 14-day soak retro must close as CLEAN PROCEED.** Not PROCEED-WITH-CAVEATS, not PROCEED-WITH-OPEN-ISSUES. Any caveat tier-N bug is treated as blocking for Phase 11 11a until closed.
- **Phase 10 followup-2 7-day soak retro must close as CLEAN PROCEED**, and the retro must be **written + accepted** (not "soak still in progress") before Phase 11 build kickoff. Followup-2 soak must complete in full — pushes Phase 11 right by ~7 days in worst case but eliminates compound-soak attribution.

### Data model (Phase 10 deliverables)

- `Commitment.source_external: ExternalSource[]` field present (Phase 11 populates it). `packages/core/src/models/commitment.ts`.
- `Commitment.createdAt: string` field present (Phase 10 10a-pre addition).
- `Commitment.date: string` is the temporal-window source-of-truth (PM G2 in Phase 10).
- `Stakeholder[]` with `role: 'recipient' | 'sender' | 'mentioned' | 'self'` shape (Phase 10 PM G6).
- `ExternalSource` shape reserved: `{ kind: 'slack' | 'gmail' | 'jira'; url?: string; ref: string }`.

### Atomicity infrastructure (Phase 10 10a-pre)

- `proper-lockfile` dependency in `packages/core/package.json`.
- `CommitmentsService.withLock(fn)` helper in `packages/core/src/services/commitments.ts` (Phase 10 v3 pre-mortem F5 mitigation).
- Storage adapter's atomic tmp+rename write pattern.

### Directive parser surface (Phase 10 10b-aux)

- Chef directive parser present (`[[unmerge]]` ships in Phase 10 10b-aux). Phase 11 extends with `[[unresolve <id>]]`, `[[unresolve <id> --permanent]]` (M4), `[[confirm <id>]]`, `[[unconfirm <id>]]` (F2).
- Parser entry: `packages/runtime/skills/daily-winddown/SKILL.md` directive section.
- Implementation: `packages/core/src/services/directives.ts`.

### Logging conventions

- `dev/diary/dedup-decisions.log` exists. Phase 11's `resolution-decisions.log` mirrors this format and adds **phase-attribution field** (F1): `<ISO> <action> <phase:p11-11a> <id> <confidence> <evidence-ref> <llm-reasoning>`.
- Phase 10 followup-2's `chef-skip-log.md` cross-references with Phase 11's `resolution-decisions.log` via shared commitment-id (M2).

### Parser quality gate (PM G4 — load-bearing)

- Phase 10's parser (`extractCounterpartiesFromText` and downstream) at golden-set precision ≥0.85 (Phase 10 AC3a) at Phase 11 build start.
- **If Phase 10 ships with ANY open parser ambiguity bugs (e.g., N1 Lindsay-Calar/Lindsay-Gray collision), BLOCK Phase 11 11a until resolved.** F1 hard-gate makes this enforceable: Phase 10 retro must be CLEAN PROCEED, which by definition excludes accepted-but-open ambiguity bugs.

### Gmail provider

- `arete pull gmail` functional. `packages/cli/src/commands/pull.ts:608` (`pullGmailHelper`).
- 11-pre extends provider for Sent + body/attachments + `cacheVersion: 2` (F4).

### Soak success criteria (predecessors)

- Phase 10 14-day soak: CLEAN PROCEED retro.
- Phase 10 followup-2 7-day soak: CLEAN PROCEED retro, written + accepted.
- Reactive dedup precision ≥0.85 (Phase 10 AC3a golden-set criterion).

---

## Hard parts (5)

### Hard part 1 — False-positive auto-resolve = trust crater

The CT1/CT2 dynamic from 2026-06-04 illustrates: silently dropping a commitment is the worst-case bug. If Phase 11's Gmail detector hits at MEDIUM and auto-resolves anyway, user trust collapses.

**Required mitigation**:
- **HIGH confidence only writes**; MEDIUM surfaces "possibly done — confirm?"; LOW ignored.
- **Precision floor ≥0.95** on 50-pair labeled set (`golden-set-phase-11.md`). Below 0.95 → ship as MEDIUM-only surface.
- **Audit trail on every auto-resolve**: `resolvedBy: 'auto-gmail'`, `resolvedEvidence: <thread-url>`, `resolvedConfidence: 'HIGH'`, `resolvedAt`. Dispute via `[[unresolve]]`.
- **First-week `[[confirm]]` gate (F2-strengthened)**: for the first 7 days post-ship, HIGH-confidence detection STAGES a resolve and surfaces in next winddown with **full inline evidence** (URL + LLM reasoning + recipient + sent-at). User `[[confirm <id>]]` per-entry only. After 7 days zero `[[unresolve]]` AND ≥1 explicit `[[confirm <id>]]` engagement, demote to auto-mutate. Zero confirms = extend confirm-gated mode another 7d.
- **`[[unconfirm <id>]]` recovery (F2)**: 24h window after `[[confirm]]` to flip back. Closes the wrong-confirm hole that AC6a previously blocked.
- **First-week banner** (per Phase 10 AC8a pattern): chef header surfaces auto-resolve mode + count of staged-for-confirm.

### Hard part 2 — Gmail provider extension is substantial (eng C1 + F4)

Current `EmailThread` (`packages/core/src/integrations/gws/types.ts:64-72`) is `{ id, subject, snippet, from, date, labels, unread }` — no `to/cc/body/attachments/sentAt`. AC1's cache shape requires adding all of these:

- `GmailProvider.searchThreads` / `getThread` (`packages/core/src/integrations/gws/gmail.ts`) extended to use `format: 'full'` and add `To`, `Cc`, `Date` to `metadataHeaders`.
- MIME body walk: traverse `payload.parts`, find `text/plain` (preferred) or `text/html` (fallback), base64-decode `body.data`.
- Attachment listing: `{ filename, mimeType, sizeBytes }`.
- `normalizeEmail()` helper: lowercase + trim + extract email from `"Name <email>"` (eng MC1 — `lindsay-gray.md` has `email: "lindsay.gray@reserv.com "` with trailing whitespace).
- New cache: `.arete/cache/gmail-sent-YYYY-MM-DD.json` with **`cacheVersion: 2`** envelope (F4 cache versioning): `{ version: 2, threads: [...] }`. v1-shape caches (none exist; trivial migration) get rejected with clear error.

**Backward compat (eng R10 + F4-strengthened)**:
- `fetchBody: boolean` opt-in param defaulting `false`.
- **Serialization gate**: when `fetchBody=false`, new fields (`to`, `cc`, `body`, `attachments`, `sentAt`) are NOT included in JSON output at all (not even as `[]`). Reader code unchanged.
- **Inbound caller audit committed to 11-pre build report**: `grep -rn EmailThread packages/` — every consumer either (a) doesn't serialize threads OR (b) explicitly handles the new fields. Audit list committed.
- **Prompt-template surface area**: any LLM prompt previously consuming `EmailThread` gets updated atomically in 11-pre (no prompts can be left referencing a thread that now has unfetched-empty `to/cc`).
- **Snapshot tests before AND after**: 11-pre tests include before/after snapshot of `EmailThread` serialization in `fetchBody=false` and `fetchBody=true` modes.
- **1-day 11-pre soak**: after 11-pre merges, 1 day of normal inbound usage before 11a build starts. Catches any inbound regression before 11a code exists to be blocked by it.

This is a substantial provider-layer build (~3-4 days incl. 1-day soak), not "just a `--sent` flag."

### Hard part 3 — Cache window depth + Gmail API cost (PM G2 + M3)

Naive "last 14 days at session start" fails when an open commitment is >14 days old. Async Fathom reviews lag 3-5 days; user may have legit open commitments from 30+ days back.

**Required mitigation**:
- Cache depth = `max(14, today - min(open_commit.date))`, **soft ceiling 60 days, hard cap 90 days** (M3).
- If projected depth > 60d: chef prompts user at next pull "Gmail Sent cache will pull N days back to YYYY-MM-DD (driven by open commitment `<id>` dated YYYY-MM-DD); estimated S seconds of pull + ~M MB cache. Continue?" Requires `--yes-deep-pull` flag or interactive confirm.
- If projected depth > 90d: hard cap at 90d, surface winddown notice: "1 open commitment older than 90d — auto-resolve won't reach it; consider manual resolve."
- Cache depth surfaced in chef header: "Gmail Sent cache: N days back."

Tradeoff: wider cache = bigger initial pull, but pull is amortized across the day's checks; ceiling protects against quota+memory blowout on stragglers.

### Hard part 4 — Cost cap under catch-up conditions (PM G3)

Phase 11 cost cap of $0.50 median / $1.50 heavy is for ONE winddown. After a skipped weekend + Monday batch covering 4 days, LLM call count multiplies.

- **Normal day**: $0.50 median / $1.50 heavy (≤70 open commitments, single-day winddown).
- **Catch-up batch (≥3 days since last winddown)**: $3 ceiling. Interactive `--yes-cost` flag required if projected over $3 (Phase 9 AC11a pattern).
- **Hybrid pre-filter is the throttle**: recipient pre-filter (with `role: 'self'` excluded per M5) + temporal window cull aggressively before LLM cross-check.

### Hard part 5 — Unified approval surface — conditional gate timing (PM + F3)

The 11c GO/NO-GO gate is **biased toward NO-GO** by construction. F3 sharpens this: the day-14 Phase 10 retro captures novelty-distorted usage (deliberate stress-testing, elevated extract volume). The right moment is **day 28** of Phase 10 soak — two weeks after Phase 10 soak ends, when usage has reverted to steady-state.

**Gate timing protocol**:
- **Day 14 (Phase 10 soak retro)**: default NO-GO. No override at day 14 regardless of metrics. Documented in retro: "11c gate deferred to day 28."
- **Day 21**: snapshot of items/day, dupe-percent, context-switching across per-meeting UI. Treat as steady-state-candidate baseline.
- **Day 28**: re-snapshot. **Steady-state confirmed IF** day-21-to-day-28 metrics are within 30% of day-14-to-day-21 metrics (no continued elevation) AND within 30% of Phase 9 pre-Phase-10 daily baseline. If still elevated → defer further.
- Gate evaluation against day 21-28 window only.

Default = NO-GO. Phase 11 v3 ships as 11-pre + 11a + 11-audit only if the gate doesn't fire.

---

## End-to-end flow (target shape — v3)

```
arete pull gmail --sent --days <N>          (NEW 11-pre)
   │  N = max(14, today - earliest_open_commitment.date), soft-cap 60d, hard-cap 90d   ← G2 + M3
   │  > 60d requires --yes-deep-pull or interactive confirm
   │  Writes .arete/cache/gmail-sent-YYYY-MM-DD.json (cacheVersion: 2) + recipient pre-index
   ▼
chef-orchestrator (winddown):
   1. Gather + dedup (Phase 10 — existing)
   2. Gmail Sent cross-check (NEW 11a) — per open commitment c:
      a. SKIP if c.unresolveSuppressedUntil > now              (G5 — structured)
      b. SKIP if c.id still-staged in any meeting today        (G1 — followup-2 owns)
         → emit RESOLVE-DEFERRED-TO-FOLLOWUP-2 log line        (M2)
      c. recipient pre-filter (deterministic email match)
         → EXCLUDE stakeholders with role === 'self'           (M5)
      d. temporal window: thread.sentAt > c.date AND within cache
      e. artifact heuristic (NN+ noun phrases → LLM evidence input)
      f. direction match: c.direction == 'outbound'
      g. survives pre-filter → LLM cross-check (fast tier, task: 'external_resolution')
      h. HIGH → STAGE (week-1 confirm-gate) OR auto-mutate (week-2+, gate-passed)
         MEDIUM → surface "possibly done — confirm?" with [[confirm <id>]]
         LOW → ignore
   3. Standard winddown output + sections:
        "Auto-resolved today" (banner/roll-up — week-2+ only)
        "Possibly already done — confirm?" (MEDIUM-flagged)
        "Staged for confirm" (week-1 — full inline evidence per entry)   ← F2
        "Phase attribution" (latency line items per phase)               ← F1
   ▼
User adds directives in chef-curated view:
   [[confirm <id>]]              → next winddown: user-resolve
   [[unconfirm <id>]]            → 24h flip-back: re-stage; clear user-resolve  ← F2
   [[unresolve <id>]]            → reopen + unresolveSuppressedUntil = now+14d
   [[unresolve <id> --permanent]] → reopen + suppressedUntil = 2100-01-01      ← M4
   (silence on staged entry during week-1 = no mutation; chef re-surfaces)
```

**First-week trust-building (AC2a, F2-strengthened)**:
- **Day 1-7**: HIGH match sets `resolveStagedAt`. Chef surfaces under "Staged for confirm" with FULL inline evidence. User `[[confirm]]` writes user-resolve next winddown. Silence = no mutation. Preemptive `[[unresolve]]` sets 14d suppress.
- **Day 8+ promotion criteria (BOTH required, F2)**: (a) zero `[[unresolve]]` actions during week 1 AND (b) ≥1 explicit `[[confirm <id>]]` engagement OR explicit user statement "staged-for-confirm look right, promote." Zero confirms = user didn't audit; extend confirm-gated mode another 7d.
- **Day 8+ extension** (≥1 `[[unresolve]]` OR zero `[[confirm]]`): extend 7d. Re-evaluate at day 14.
- **Rollback (≥3 unresolves any 7d window)**: AC13 triggers; chef surfaces without writing.

---

## Architecture

### Data model — Phase 11 additions

Phase 10 reserved fields; Phase 11 populates them. Plus three new fields for Phase 11.

```ts
// EXISTING from Phase 10 (Phase 11 populates):
interface ExternalSource {
  kind: 'slack' | 'gmail' | 'jira';
  url?: string;
  ref: string;                          // Gmail thread ID
}

// NEW in Phase 11:
interface ExternalSourceMatch {
  source: ExternalSource;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedAt: string;
  matchedBy: 'auto-gmail';              // v3 — Slack/Jira deferred
  evidence: {
    recipientMatch: boolean;
    temporalMatch: boolean;
    artifactMatch: boolean;
    llmDecision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN';
    llmReasoning: string;
  };
}

interface Commitment {                  // EXISTING + Phase 11 extensions
  // ... existing Phase 10 fields ...
  source_external: ExternalSource[];    // populated in Phase 11
  resolvedBy?: 'user' | 'auto-gmail';   // EXTENDED — Phase 10 had 'user' only
  resolvedEvidence?: string;            // NEW: Gmail thread URL
  resolvedConfidence?: 'HIGH';          // NEW: only HIGH writes; MEDIUM is winddown-only
  unresolveSuppressedUntil?: string;    // NEW (G5): ISO8601; '2100-01-01' = permanent (M4)
  resolveStagedAt?: string;             // NEW (first-week UX): set when chef stages a resolve
                                        //   awaiting [[confirm]]. Cleared on confirm or unresolve.
  confirmedAt?: string;                 // NEW (F2 — [[unconfirm]] recovery): set on [[confirm]]
                                        //   write. Within 24h, [[unconfirm]] can flip back.
}
```

```ts
// Extended EmailThread (11-pre, F4 cache-versioned)
interface EmailThread {
  id: string;
  subject: string;
  snippet: string;
  from: string;
  date: string;
  labels: string[];
  unread: boolean;
  // NEW in 11-pre (excluded from serialization when fetchBody=false):
  to?: string[];                        // [] when not fetched
  cc?: string[];
  bcc?: string[];
  body?: string;                        // '' when not fetched
  attachments?: { filename: string; mimeType: string; sizeBytes: number }[];
  sentAt?: string;                      // ISO8601 from Date header
}

// Cache envelope (F4 versioning)
interface GmailSentCache {
  version: 2;                           // bump on any breaking shape change
  pulledAt: string;
  daysCovered: number;
  threads: EmailThread[];
  recipientIndex: Record<string, string[]>; // normalized email → thread.id[]
}
```

Key design points:
- `resolvedBy` union — audit trail + rollback filter.
- `resolvedEvidence` is a Gmail thread URL — clickable.
- `resolvedConfidence` reserved as `'HIGH'` only.
- `unresolveSuppressedUntil` is the **structured** suppress field (G5). `'2100-01-01'` sentinel for permanent (M4).
- `resolveStagedAt` is the first-week trust-gate marker.
- `confirmedAt` is the F2 `[[unconfirm]]` recovery marker — populated on user-confirm; 24h window for flip-back.

### Gmail provider extension (11-pre — eng C1 + F4)

Build deliverables:
- Extended `EmailThread` shape with `to/cc/bcc/body/attachments/sentAt` (excluded from serialization when `fetchBody=false`).
- `fetchBody: boolean` opt-in mode on `searchThreads` / `getThread`.
- MIME walk + attachment listing.
- `normalizeEmail()` helper (eng MC1).
- `arete pull gmail --sent --days <N>` mode in `pullGmailHelper`.
- Cache writer + reader with `cacheVersion: 2` envelope.
- Recipient pre-index built at load.
- New task `external_resolution` mapped to `'fast'` tier in `DEFAULT_TASK_TIERS` (eng MC2).
- Inbound `EmailThread` caller audit committed to build report (F4).
- Snapshot tests before AND after (F4).
- 1-day 11-pre soak before 11a kicks off (F4).

### Auto-resolve LLM prompt (11a)

Fast tier, task `external_resolution`. Survives pre-filter (recipient + temporal + direction + non-zero artifact heuristic) → cross-check:

```
Commitment: "<c.text>"
  direction: outbound, intended recipient: <recipient slug> <<email>>
  commitment date: <c.date>
Sent email:
  subject: "<thread.subject>"
  to: <thread.to>, cc: <thread.cc>
  sent: <thread.sentAt>
  body excerpt (first 400 chars): "<thread.body[:400]>"
  attachments: <thread.attachments.map(filename)>
Heuristic artifact candidates from commitment: [<extracted_NN>]

Does this Sent email fulfill the commitment?
Consider: artifact identity, timing, recipient match.
Return JSON: { decision: "HIGH" | "MEDIUM" | "LOW", reasoning: "<1 sentence>" }
```

**Mutation paths (all via `CommitmentsService.withLock`)**:
- HIGH week-1: set `resolveStagedAt`; surface "Staged for confirm" with full inline evidence. No status change. Log `RESOLVE-HIGH-STAGED` with phase `p11-11a`.
- HIGH week-2+ (gate passed): set `resolvedBy='auto-gmail'`, `resolvedConfidence='HIGH'`, `resolvedEvidence=<thread-url>`, `resolvedAt=thread.sentAt`, `source_external += { kind: 'gmail', ref: thread.id, url }`, `status='resolved'`. Log `RESOLVE-HIGH-AUTO`.
- MEDIUM: no commitment mutation; surface "Possibly already done — confirm?" Log `RESOLVE-MEDIUM-FLAGGED`.
- LOW: ignore, no log.
- Deferred (AC8 step 2, still-staged): no mutation; log `RESOLVE-DEFERRED-TO-FOLLOWUP-2` with evidence URL (M2).

### Directive handlers (extends Phase 10 parser surface)

**`[[confirm <id>]]`** — for week-1 staged OR MEDIUM-flagged. Next winddown: withLock writes `resolvedBy='user'`, `resolvedConfidence='HIGH'`, preserves `resolvedEvidence`, sets `status='resolved'`, sets `confirmedAt=now` (F2), clears `resolveStagedAt`. Logs `RESOLVE-USER-CONFIRMED`. Already-resolved or missing id → no-op + warning.

**`[[unconfirm <id>]]`** (F2 — NEW) — for entries where `resolvedBy='user'` AND `confirmedAt > now - 24h`. withLock: sets `status='open'`, re-stages with `resolveStagedAt=now`, clears `confirmedAt/resolvedBy/resolvedAt`, preserves `resolvedEvidence` and `source_external` for re-evaluation. Logs `UNCONFIRM`. Outside 24h window → no-op + warning "Use `[[unresolve <id>]]` instead." Entries with `resolvedBy='auto-gmail'` → no-op + warning "Use `[[unresolve <id>]]` instead."

**`[[unresolve <id>]]`** — auto-resolved or week-1-staged only:
- `resolvedBy === 'auto-gmail'`: withLock sets `status='open'`, clears `resolvedBy/resolvedEvidence/resolvedConfidence/resolvedAt`, **preserves `source_external[]` as audit trail**, sets `unresolveSuppressedUntil = now + 14d` (G5).
- `resolveStagedAt` set (week-1 staged): clear staging marker, set `unresolveSuppressedUntil = now + 14d`.
- `resolvedBy === 'user'` (without `confirmedAt < now - 24h` constraint): no-op + warning ("Use `arete commitments reopen <id>` or `[[unconfirm <id>]]` within 24h").
- **Repeat detection (M4)**: if `resolution-decisions.log` shows prior UNRESOLVE for same `(id, evidence_url)` pair within 30d → auto-promote to permanent suppress (`unresolveSuppressedUntil = '2100-01-01'`); chef surfaces notice.
- Logs `UNRESOLVE` with phase attribution.

**`[[unresolve <id> --permanent]]`** (M4 — NEW) — explicit permanent suppress variant. Same behavior as `[[unresolve]]` but `unresolveSuppressedUntil = '2100-01-01'` regardless of prior history. Logs `UNRESOLVE-PERMANENT`.

### CLI verbs

**`arete commitments resolve-from-gmail`** (11a):
- `--dry-run`: pipeline, report, no writes.
- `--apply`: pipeline, writes.
- `--yes-cost`: bypass interactive cost gate (catch-up batches).
- `--yes-deep-pull`: bypass interactive depth-gate (>60d cache).
- `--revert-all`: AC13 rollback — sets every `resolvedBy: 'auto-gmail'` back to open; preserves `source_external`.

**`arete resolve --explain <id>`** (11-audit): prints commitment text, evidence URL, sent timestamp, recipient match, artifact match, LLM decision + reasoning, phase attribution, match-time metadata.

**`arete commitments --auto-resolved --since <date>`** (11-audit): filter on `resolvedBy: 'auto-gmail'`.

### Unified approval surface (11c — CONDITIONAL, day-28 gate)

Only if Phase 10 day-28 steady-state gate fires GO (Hard part 5 + F3). If built — atomic cross-meeting + cross-file writes are genuinely new infra (eng MC4):

```bash
arete approvals             # all pending across meetings
arete approvals --today
arete approvals --auto-resolved
arete approvals --json      # MCP-friendly
arete approvals --approve-all --today
```

If 11c fires GO, a 11c-spec pass happens before build.

---

## Build phases

**11-pre — Gmail provider extension + golden-set labeling (~3-4 days)** [REQUIRED before 11a]:
- Extend `EmailThread` shape (`packages/core/src/integrations/gws/types.ts:64-72`).
- Extend `GmailProvider.searchThreads` / `getThread` with `fetchBody` mode + MIME walk + attachment listing.
- Add `normalizeEmail()` helper.
- Add `--sent --days <N>` mode to `pullGmailHelper`.
- Cache writer/reader with `cacheVersion: 2` envelope (F4).
- Serialization gate: new fields excluded from JSON when `fetchBody=false` (F4).
- Add `external_resolution` task to `DEFAULT_TASK_TIERS`.
- Inbound `EmailThread` caller audit (F4 — committed to build report).
- Snapshot tests before/after `EmailThread` shape change (F4).
- **Day 2 of 11-pre: scheduled 45-min John golden-set lab session** (M1) — committed calendar event, not background. 6 anchor positives (from 6/03 triage) + ~30 auto-generated synthetic negatives (stakeholder-mismatch mechanical cross-product) + 14 John-labeled judgment calls = 50 pairs in `golden-set-phase-11.md`.
- **1-day 11-pre soak** after merge before 11a build starts (F4).
- Tests: MIME body extraction round-trip, attachment listing, email normalization, cache pre-index lookup, cache version mismatch rejection, snapshot test parity.

**11a — Auto-resolve hybrid pipeline (~7-9 days)**:
- Add Phase 11 commitment fields (`source_external` populated, `resolvedBy: 'auto-gmail'`, `resolvedEvidence`, `resolvedConfidence`, `unresolveSuppressedUntil`, `resolveStagedAt`, `confirmedAt`).
- Build hybrid pipeline: recipient pre-filter (`role: 'self'` excluded — M5) → temporal → artifact heuristic → LLM cross-check (fast tier, `external_resolution`).
- Implement first-week confirm-gate: HIGH → `resolveStagedAt` set; promotion to auto-mutate requires zero `[[unresolve]]` AND ≥1 `[[confirm]]` engagement (F2).
- Inline evidence in "Staged for confirm" chef section (F2).
- `arete commitments resolve-from-gmail [--dry-run] [--apply] [--yes-cost] [--yes-deep-pull] [--revert-all]` CLI verb.
- `dev/diary/resolution-decisions.log` with phase-attribution field (F1).
- Wire into chef-orchestrator winddown gather phase.
- Ordering rule (G1): commitments.json check FIRST; still-staged items → log `RESOLVE-DEFERRED-TO-FOLLOWUP-2` (M2).
- Cache depth = `max(14, today - min(open_commitment.date))`, soft-cap 60d (M3), hard-cap 90d.
- Cost cap: $0.50 / $1.50 / $3 catch-up with `--yes-cost` gate.
- Phase-attributed latency tracking in winddown summary (F1).
- Tests: see §"Tests."

**11c — Unified approval surface (~5-7 days)** [CONDITIONAL on Phase 10 day-28 soak]:
- Gate evaluation at day 28 (F3), not day 14.
- If GO: re-spec pass (one-day design doc) before build.
- If NO-GO: skip 11c entirely; documented in Phase 11 final retro.
- Default = NO-GO.

**11-audit — Audit + recovery controls (~2-3 days)** [REQUIRED]:
- `arete resolve --explain <id>` CLI verb (with phase attribution).
- `arete commitments --auto-resolved --since <date>` filter.
- `[[unresolve <id>]]`, `[[unresolve <id> --permanent]]` (M4), `[[confirm <id>]]`, `[[unconfirm <id>]]` (F2) directive handlers.
- First-week banner in chef header (auto-removes after 7d zero-rollback AND ≥1 confirm engagement OR first `[[unresolve]]`).
- Day-3 soft prompt (F2-revised): "Auto-resolves look right? Review the list below; if any look wrong, `[[unresolve <id>]]`." Default action = REVIEW, not bulk-confirm. **`[[confirm-all-week-1]]` directive REMOVED**.
- Tests: round-trip `[[unresolve]]` → reopen + 14d suppress; `[[unresolve --permanent]]` → 2100 sentinel; `[[unconfirm]]` 24h window; `--explain` output shape; banner timing; day-3 prompt phrasing.

**Total (v3)**:
- Without 11c: 11-pre (3-4) + 11a (7-9) + 11-audit (2-3) = **12-16 days** = ~2.5-3.5 weeks.
- With 11c: + 5-7 days = **17-23 days** = ~3.5-4.5 weeks.

11-pre grew by 1-2d for cache versioning + caller audit + 1-day pre-soak + scheduled golden-set lab.

---

## Acceptance criteria (v3)

**AC0 (Phase 10 retro hard-gate — F1)**: Phase 11 11-pre build kickoff is BLOCKED until BOTH:
- Phase 10 14-day soak retro closes as **CLEAN PROCEED** (no caveats, no open issues, no tier-N bugs accepted-but-unresolved). The retro doc must state "CLEAN PROCEED" explicitly.
- Phase 10 followup-2 7-day soak retro closes as **CLEAN PROCEED** AND is **written + accepted** (not "soak still in progress"). Followup-2 soak completes in full before Phase 11 build kicks off.
- If either retro contains caveats, Phase 11 build is blocked until caveats resolve. No exceptions.

**AC0a (substrate pre-conditions)**: All items in §"Pre-conditions" verified at Phase 11 build start. Reactive dedup precision ≥0.85. Phase 10 parser at golden-set precision ≥0.85 with NO open ambiguity bugs (G4 — load-bearing).

**AC1 (Gmail provider extension — 11-pre)**: `arete pull gmail --sent --days <N>` writes `.arete/cache/gmail-sent-YYYY-MM-DD.json` with `cacheVersion: 2` envelope (F4). Extended `EmailThread` shape (`to/cc/bcc/body/attachments/sentAt`) excluded from JSON when `fetchBody=false`. Cache regenerates daily. Recipient pre-index built at load. Default `--days = max(14, today - earliest_open_commitment.date)`, soft-cap 60d (interactive `--yes-deep-pull` gate above), hard-cap 90d. Email normalization (`normalizeEmail()`) handles whitespace + `"Name <email>"`. Inbound caller audit committed to build report. Snapshot tests pass before/after shape change.

**AC1a (11-pre 1-day soak — F4)**: After 11-pre merges, 1 day of normal inbound usage (`arete pull gmail` standard mode) must pass without regression in (a) cache writes/reads, (b) inbound triage skill output, (c) any `EmailThread`-consuming prompt template, (d) snapshot test parity, before 11a build kickoff.

**AC2 (auto-resolve HIGH — basic case)**: commitment `"Send Lindsay the deck"` (direction: outbound, stakeholders: [{slug: lindsay-gray, role: recipient}]) + Gmail Sent to `lindsay.gray@reserv.com` containing `"deck.pdf"` attachment, sent within commitment-date window → hybrid pipeline returns HIGH → (post-week-1 gate passed) commitment auto-resolved with `resolvedBy: 'auto-gmail'`, `resolvedEvidence: <thread-url>`, `resolvedConfidence: 'HIGH'`, `resolvedAt: <sent-timestamp>`, `source_external` populated.

**AC2a (first-week confirm-gate UX — F2-refined)**: during days 1-7 post-ship, HIGH-confidence match sets `resolveStagedAt` BUT does NOT mutate `status` — commitment remains open. Chef surfaces under "Staged for confirm" with **full inline evidence** per entry (thread URL + LLM reasoning + recipient slug + sent-at timestamp). User `[[confirm <id>]]` in winddown → next winddown converts to user-resolve (`resolvedBy: 'user'`, `resolvedConfidence: 'HIGH'`, `confirmedAt: now`). User silence → no mutation; chef re-surfaces.

**Promotion to auto-mutate at day 7+ requires BOTH (F2)**:
1. Zero `[[unresolve]]` actions during week 1, AND
2. ≥1 explicit `[[confirm <id>]]` action during week 1 OR explicit user statement "staged-for-confirm look right, promote" recorded in retro.

Zero `[[confirm]]` engagement = user didn't audit = trust signal absent. Extend confirm-gated mode another 7d. Re-evaluate at day 14. After two extended weeks with no confirm engagement, demote 11a to MEDIUM-only-surface (no auto-mutate path).

**AC2b (`[[unconfirm]]` 24h recovery — F2)**: user adds `[[unconfirm <id>]]` directive against an entry where `resolvedBy='user'` AND `confirmedAt > now - 24h`. Next winddown: re-stages the commitment (sets `status='open'`, `resolveStagedAt=now`, clears `confirmedAt/resolvedBy/resolvedAt`, preserves `resolvedEvidence`/`source_external` for re-evaluation). Logs `UNCONFIRM`. Outside the 24h window OR against `resolvedBy='auto-gmail'` → no-op + warning.

**AC3 (false-positive guard)**: commitment `"Send Lindsay the FINAL deck"` + Gmail Sent with `"deck-draft.pdf"` (different artifact identity) → LLM cross-check returns MEDIUM → NOT auto-resolved; surfaced under "Possibly already done — confirm?" with `[[confirm <id>]]` hint.

**AC3a (precision floor — 50-pair golden set + M1 timing)**: `golden-set-phase-11.md` committed by end of 11-pre day 2 (scheduled John session — M1). 50 hand/synthetic-labeled pairs: 6 RESOLVE anchors from `golden-set-from-triage-2026-06-03.md` + ~30 auto-generated synthetic negatives (mechanical stakeholder mismatch) + 14 John-labeled judgment calls. HIGH-only auto-resolve precision ≥0.95, recall ≥0.50. If precision <0.95 at 11a end: ship as MEDIUM-only surface; no auto-resolve.

**AC3b (cache depth — G2 + M3)**: commitment dated 30 days ago, Gmail Sent on day-25, winddown today → cache extends back to commitment.date; auto-resolve fires correctly. NOT gated on fixed 14d window. If projected cache depth > 60d: chef prompts user interactively or via `--yes-deep-pull`. If > 90d: hard-capped at 90d with winddown notice for unreachable commitments.

**AC4 (cost cap — G3)**: end-to-end day's auto-resolve LLM spend stays under:
- $0.50 median / $1.50 heavy on a normal-day winddown.
- $3 ceiling on a catch-up batch winddown (≥3 days since last winddown).
- Interactive `--yes-cost` gate required if dry-run projects > $3.

Cost reported in winddown summary alongside Phase 10's dedup-cost line.

**AC5 (audit trail + phase attribution — F1)**: every commitment with `resolvedBy: 'auto-gmail'` has `resolvedEvidence` URL + `resolvedConfidence` + `resolvedAt` + `source_external[]` entry. `arete resolve --explain <id>` prints: commitment text, evidence URL, sent timestamp, recipient match, artifact match, LLM decision + reasoning, **phase attribution** (`p11-11a`). Log entry in `dev/diary/resolution-decisions.log` carries phase field for cross-phase grep-attribution.

**AC6 (`[[unresolve]]` directive)**: chef-curated winddown lists each auto-resolved commitment with inline `[[unresolve <id>]]` hint. User adds directive; next winddown:
- Parses directive.
- Sets `status='open'`, clears `resolvedBy/resolvedEvidence/resolvedConfidence/resolvedAt/resolveStagedAt`.
- **PRESERVES `source_external[]` as audit trail**.
- **Sets `unresolveSuppressedUntil = now + 14d`** (G5 structured).
- Repeat detection (M4): if prior UNRESOLVE for same `(id, evidence_url)` within 30d → promotes to permanent (`'2100-01-01'`); chef surfaces notice.
- Logs UNRESOLVE with phase attribution.

**AC6a (`[[unresolve]]` only for auto-resolved / staged)**: directive against `resolvedBy: 'user'` → no-op + warning ("Use `arete commitments reopen <id>` or `[[unconfirm <id>]]` within 24h"). Against unstaged commitment → no-op.

**AC6b (suppress field structurally prevents re-resolve — G5)**: commitment was auto-resolved → user `[[unresolve]]` → `unresolveSuppressedUntil = now+14d` → next-day pipeline finds same `(commitment, evidence)` pair → SKIPs at pre-check (Step 2a). Verified via structured field check, not log-grep.

**AC6c (`[[unresolve --permanent]]` — M4)**: user adds `[[unresolve <id> --permanent]]`. Same behavior as `[[unresolve]]` but sets `unresolveSuppressedUntil = '2100-01-01'` (sentinel = permanent), regardless of repeat-detection. Logs `UNRESOLVE-PERMANENT`. Pipeline pre-check treats far-future date identically to 14d suppress — never re-resolves.

**AC7 (`[[confirm <id>]]` directive)**: chef surfaces MEDIUM-flagged or week-1-staged commitments with `[[confirm <id>]]` hint **and full inline evidence per entry** (F2). User adds directive; next winddown:
- For week-1 staged: converts to user-resolve (`resolvedBy: 'user'`, `resolvedConfidence: 'HIGH'`, `confirmedAt: now`, evidence preserved).
- For MEDIUM-flagged: same conversion.
- Logs `RESOLVE-USER-CONFIRMED` with phase attribution.
- `resolvedBy` stays `'user'` — preserves audit semantics (Q3).

**AC8 (ordering rule — G1 + M2)**: chef pipeline check order: for each candidate match,
1. If commitment.id ∈ commitments.json (already-committed) → 11a auto-resolve path.
2. If commitment.id is still-staged in any of today's meetings → SKIP; **log `RESOLVE-DEFERRED-TO-FOLLOWUP-2`** with evidence URL (M2). Followup-2's `staged_item_skip_reason.evidence` accepts `"<existing>+gmail:<thread-id>"` multi-source string when 11a defers — preserves multi-source provenance structurally.
3. Never both for the same id in the same winddown.

**AC9 (unified approval surface — CONDITIONAL on day-28 gate)**: IF Phase 10 day-28 steady-state gate fires GO (Hard part 5, F3), 11c is re-spec'd then built. IF NO-GO (default), AC9 declared N/A. Default: NO-GO.

**AC10 (soak observability — resolution-decisions.log with phase field — F1)**: every Phase 11 decision (`RESOLVE-HIGH-STAGED` / `RESOLVE-HIGH-AUTO` / `RESOLVE-MEDIUM-FLAGGED` / `RESOLVE-USER-CONFIRMED` / `RESOLVE-DEFERRED-TO-FOLLOWUP-2` / `UNRESOLVE` / `UNRESOLVE-PERMANENT` / `UNCONFIRM` / `SUPPRESS-HIT`) emits one line. Format: `<ISO> <action> phase=<p11-11a> <id> <confidence> <evidence-ref> <llm-reasoning>`. Best-effort write. Daily soak check: `wc -l + tail`.

**AC11 (first-week banner — F2-revised)**: chef header during first 7 days post-ship surfaces "Phase 11 auto-resolve in confirm-gated mode — N staged for confirm today; use `[[confirm <id>]]` per entry or `[[unresolve <id>]]`." Banner auto-removes after promotion-gate passes (zero rollbacks AND ≥1 confirm engagement) OR first `[[unresolve]]`. **At day 3**, chef header adds soft prompt: "Auto-resolves look right? **Review the list below; if any look wrong, `[[unresolve <id>]]`.**" Default action = REVIEW. **`[[confirm-all-week-1]]` directive does NOT exist** — per-entry `[[confirm <id>]]` is the only confirm path.

**AC12 (soak quality bar — manual, 14-day soak)**: John reports:
- ≤1 false-positive auto-resolve per week post-trust-phase (recoverable via `[[unresolve]]`).
- ≥3 genuine auto-resolutions per week (validates 5% signal density).
- Zero false-positive HIGH-staged events during week 1.
- Per-winddown latency increase from Phase 11 ≤2s additive on Phase 10's ≤5s.
- Daily resolution-decisions.log shows expected mix.

**AC13 (rollback path)**: feature flag `PHASE_11_AUTO_RESOLVE_ENABLED` (env or `.arete/config.json`). Setting false disables all Phase 11 paths. Commitments auto-resolved before rollback stay resolved (source_external preserved). `arete commitments resolve-from-gmail --revert-all` mass-unresolves every `resolvedBy: 'auto-gmail'` entry.

---

## Tests (v3)

Beyond per-step unit + integration:

- **50-pair golden set (AC3a)**: `golden-set-phase-11.md` committed by 11-pre day 2 (M1 scheduled session). 6 anchor positives + ~30 auto-synthetic-negatives + 14 John judgment calls.
- **Provider extension tests (AC1)**: MIME body extraction (text/plain preferred, text/html fallback, base64-decoded), attachment listing, email normalization (whitespace trim, `"Name <email>"` extraction), recipient pre-index lookup.
- **Cache version mismatch (F4)**: write cache with `version: 1`, attempt read → reader rejects with clear error message. Write with `version: 2`, read succeeds.
- **EmailThread serialization gate (F4)**: serialize thread with `fetchBody=false` → new fields (`to/cc/bcc/body/attachments/sentAt`) NOT present in JSON output. With `fetchBody=true` → all fields present.
- **EmailThread snapshot before/after (F4)**: snapshot pre-11-pre shape (no new fields) and post-11-pre shape (new fields). Both snapshots committed.
- **Inbound caller audit fixture (F4)**: 11-pre build report includes `grep -rn EmailThread packages/` output with annotation per consumer (safe / updated / needs-update). Annotation matrix passes review.
- **Cost cap (AC4)**: 70 open commitments + 50 cached Sent threads → median spend < $0.50; catch-up 4-day batch < $3 with interactive ceiling at >$3 dry-run.
- **G1 ordering test (AC8)**: same item in commitments.json AND staged → only 11a runs.
- **M2 deferred-log test**: item in commitments.json AND staged → 11a logs `RESOLVE-DEFERRED-TO-FOLLOWUP-2` with evidence URL. Followup-2's chef-skip-log shows `staged_item_skip_reason.evidence` appended with `"+gmail:<thread-id>"`.
- **G2 cache depth (AC3b)**: commitment dated 30d ago, Sent on day-25 → cache extends back; auto-resolves.
- **M3 cache-depth ceiling**: commitment dated 70d ago → projected depth 70d → interactive prompt fires OR `--yes-deep-pull` required. Commitment dated 100d ago → hard-capped at 90d + winddown notice.
- **G4 parser dependency (AC0a)**: mocked Phase 10 parser bug at build start → AC0a blocks Phase 11; tests fail loudly.
- **G5 suppress structural (AC6b)**: auto-resolve → `[[unresolve]]` → next day finds same evidence → pipeline pre-check skips at Step 2a.
- **M4 permanent suppress (AC6c)**: `[[unresolve <id> --permanent]]` → `unresolveSuppressedUntil = '2100-01-01'`. Repeat-detection: two UNRESOLVE entries within 30d for same `(id, evidence)` → next `[[unresolve]]` auto-promotes to permanent.
- **M5 `role: 'self'` filter**: commitment with `stakeholders: [{slug: 'john-koht', role: 'self'}]` + Sent to `john.koht@reserv.com` → recipient pre-filter EXCLUDES the self-stakeholder → pipeline returns no-match cleanly (never reaches LLM). Counter-test: same commitment with `role: 'recipient'` → pre-filter retains, pipeline runs.
- **Temporal window edges**: commitment dated D, Sent D+1, winddown D+3 → auto-resolves. Sent D-1 (pre-commitment) → doesn't. Sent D+30 (beyond cache window) → doesn't.
- **F2 first-week confirm-gate**: HIGH match during week 1 → `resolveStagedAt` set, status remains 'open'. Staged-for-confirm chef section includes full inline evidence per entry. User `[[confirm]]` → converts to user-resolve + `confirmedAt` set. User silence → no mutation.
- **F2 promotion gate**: week-1 ends with zero `[[unresolve]]` AND zero `[[confirm]]` → promotion BLOCKED; confirm-gated mode extended 7d. Week-1 ends with zero `[[unresolve]]` AND ≥1 `[[confirm]]` → promotion fires; week-2+ auto-mutates.
- **F2 `[[unconfirm]]` 24h**: user `[[confirm <id>]]` → next day `[[unconfirm <id>]]` (within 24h) → re-stages successfully. 25h later → `[[unconfirm]]` no-op + warning.
- **F2 `[[confirm-all-week-1]]` REMOVED**: parser rejects bulk directive with helpful error. No test fixture references it.
- **`[[unresolve]]` round-trip (AC6)**: auto-resolve → unresolve → status open + suppress field set + source_external preserved.
- **`[[confirm]]` round-trip (AC7)**: staged → confirm → resolvedBy='user' + confirmedAt set + evidence preserved.
- **F1 phase-attribution log**: every Phase 11 mutation writes `phase=p11-11a` field. Grep `resolution-decisions.log` filters cleanly by phase.
- **F1 latency budget**: per-winddown invocation log records phase-attributed line items (`phase-10-dedup: Ns; phase-11-resolve: Ns`). AC12 ≤2s budget verifiable.
- **Phase 10 interaction**: new staged item → Phase 10 dedup first → if dupe → Phase 11 runs against canonical's stakeholders. No double-LLM-call.
- **Resolution-decisions.log format parity**: log entries follow same format as `dedup-decisions.log` (verified by parser shared with Phase 10).

---

## Risks (v3)

- **R1 — False-positive auto-resolve = trust crater**. Mitigation: AC3a ≥0.95 precision floor; MEDIUM never auto-resolves; first-week confirm-gate (AC2a) with ≥1 confirm engagement required (F2); `[[unresolve]]` + structural 14d suppress (AC6b); `[[unresolve --permanent]]` for repeat cases (AC6c, M4); `[[unconfirm]]` 24h recovery (AC2b, F2); inline evidence in staged-for-confirm (F2); first-week banner + day-3 review-not-bulk prompt (AC11); `arete resolve --explain` audit.
- **R2 — Gmail provider extension scope underestimated** (eng C1). Mitigation: 11-pre is its own build step; +3-4d incl. F4 hardening + 1-day pre-soak.
- **R3 — Phase 10 parser ambiguity bug leaks into Phase 11** (PM G4 + F1). Mitigation: AC0 hard-gate requires Phase 10 retro CLEAN PROCEED; AC0a requires parser at ≥0.85 precision with NO open ambiguity bugs.
- **R4 — Cost overrun on catch-up batch** (PM G3). Mitigation: AC4 separate $3 ceiling + `--yes-cost` gate.
- **R5 — Cache window depth wrong for old commitments** (PM G2). Mitigation: AC3b explicit + M3 60d soft-cap with interactive gate + 90d hard-cap.
- **R6 — Resolved-but-actually-unresolved loop** (eng MC10 + PM G5). Mitigation: AC6b structural `unresolveSuppressedUntil`; AC6c permanent variant (M4); repeat-detection auto-promote.
- **R7 — `[[unresolve]]` only catches what John notices** (PM trust-risk). Mitigation: first-week confirm-gate (AC2a) eliminates silent-write surface; ≥1 confirm engagement REQUIRED (F2) — zero engagement = trust signal absent, extend gate.
- **R8 — Recipient email mapping incomplete** (eng MC1, PM Q1). Mitigation: surface in winddown "skipped resolution check for <id>: no email for <stakeholder>" — backfill nudge. Recall floor 0.50.
- **R9 — Conditional 11c gate too easy to rationalize "GO"** (PM Hard part 5 + F3). Mitigation: gate deferred to day 28 with steady-state criterion; biased toward NO-GO by construction; decision-maker is John alone with PM consultation.
- **R10 — `EmailThread` shape change breaks existing inbound callers** (eng C1 + F4). Mitigation: `fetchBody` opt-in; **serialization gate when `fetchBody=false`** (F4); inbound caller audit committed; snapshot tests before/after; cache versioning; **1-day 11-pre soak**.
- **R11 (NEW) — Three-phase soak attribution collapse** (F1). Mitigation: AC0 hard-gate on CLEAN PROCEED retros; phase-attribution field in log; followup-2 soak completes before Phase 11 build kickoff; phase-attributed latency budget.
- **R12 (NEW) — `[[confirm]]` UX degrades into passive bulk approval** (F2). Mitigation: `[[confirm-all-week-1]]` removed; promotion gate requires ≥1 explicit per-entry `[[confirm <id>]]`; inline evidence in staged-for-confirm; `[[unconfirm]]` 24h recovery.
- **R13 (NEW) — Self-stakeholder leak into recipient match** (M5). Mitigation: pre-filter excludes `role: 'self'`; explicit test case.

---

## Open questions for review (v3)

PM, eng-lead, and pre-mortem Q-stances resolved:

- **Q1 (recipient email mapping)**: graceful degradation. Backfill nudge.
- **Q2 (artifact extraction)**: dual approach. Regex NN+ as input; LLM final call.
- **Q3 (`[[confirm <id>]]` → user-resolve)**: user-resolve. Preserves `resolvedBy: 'user'`.
- **Q4 (decision auto-stale threshold)**: N/A — Phase 12+.
- **Q5 (11c GO/NO-GO decision-maker)**: John alone with PM consultation.
- **Q6 (`resolvedConfidence: MEDIUM` in commitments.json)**: never. Winddown-surface-only.
- **Q7 (first-week banner removal)**: zero rollbacks AND ≥1 confirm engagement (F2). Day-3 prompt phrased as review-not-bulk (F2).
- **Q-new-1 (week-1 ≥1 unresolve)**: extend confirm-gated mode 7d. Second window with unresolves → AC13 rollback.
- **Q-new-2 (catch-up `--yes-cost` UX)**: flag-only for first ship.
- **Q-new-3 (F4 cache version migration)**: no migration needed — v1 caches don't exist yet (cache file is new in 11-pre). Reader rejects unrecognized version with clear error.
- **Q-new-4 (M1 golden-set lab session scheduling)**: explicit calendar event on 11-pre day 2, ~45min. If John can't make day 2, blocks 11a until rescheduled (AC3a precision-gate fires at 11a end regardless).

---

## Soak observability + rollback (v3)

**Daily during 14-day Phase 11 soak**:

1. **Resolution-decisions log + phase attribution** — `grep "phase=p11-11a" dev/diary/resolution-decisions.log | wc -l` + tail. Trigger: ≥2 UNRESOLVE in any 7d window post-trust-phase = auto-resolve misfiring.
2. **Auto-resolve quality sample** — pick 1 random `auto-gmail` resolved commitment daily, audit evidence URL + LLM reasoning. Trigger: any auto-resolve where evidence URL doesn't fulfill commitment = AC3a precision regression.
3. **Week-1 staged-vs-confirm rate (F2)** — daily count of `resolveStagedAt`-set events vs. subsequent `[[confirm <id>]]` actions vs. `[[unresolve]]` actions. Triggers:
   - Queue depth > 5 with confirm rate <50% = F2 materializing (passive non-review); investigate per-entry friction.
   - Zero confirm engagement by day 5 with non-zero staged entries = passive approval pattern; explicitly block day-7 promotion.
4. **`[[unconfirm]]` actions (F2)** — count of wrong-confirm recoveries. Trigger: ≥1/week = AC3a precision below 0.95 in practice; investigate.
5. **Gmail Sent cache freshness + depth** — `ls .arete/cache/gmail-sent-*.json` mtime + cache version + days-covered. Triggers: cache > 24h on winddown day = pull broken; cache > 60d depth = M3 surface check.
6. **Cost** — Phase 11 LLM spend in winddown summary. Trigger: > $1/day median = cost regression.
7. **Suppress field hits** — count of `SUPPRESS-HIT` entries. Trigger: ≥3/week = same evidence keeps re-triggering; surface permanent-suppress option (M4 repeat-detection should auto-handle).
8. **Cross-phase attribution check (F1 + M2)** — daily grep across `resolution-decisions.log` (p11-11a) + `dedup-decisions.log` (p10) + `chef-skip-log.md` (p10-fu2) for shared commitment-ids. Trigger: ≥1 commitment touched by all three phases in the same week = compound-soak interaction surface; investigate attribution before acting.
9. **Phase-attributed latency line items (F1)** — every winddown invocation log records `phase-10-dedup: Ns; phase-10-fu2-frontmatter: Ns; phase-11-resolve: Ns`. Trigger: any single phase exceeds budget for 3+ consecutive winddowns = budget regression localized to phase.

**Phase attribution model (F1)**:

When a regression hits during compound soak, attribution flow:
1. Identify the commitment/item.
2. Grep all three logs by commitment-id; collect `phase=` field values.
3. If ONLY p11-11a touched it → Phase 11 regression. Investigate hybrid pipeline.
4. If p10 + p11 → check whether p10 wrote stakeholders that p11 misinterpreted (parser interaction).
5. If p10-fu2 + p11 → check whether followup-2 skip happened before 11a deferred (M2 cross-reference).
6. If all three → escalate to F1 rollback (feature-flag-off Phase 11 only; investigate compound interaction).

This makes "which phase caused it" a `grep` instead of forensics.

**Rollback triggers (priority order)**:

- **R1 materializes** (≥2 false-positive auto-resolves from John in any 7d window post-trust-phase, OR any silently-dropped commitment): flip `PHASE_11_AUTO_RESOLVE_ENABLED=false`. Mass `[[unresolve]]` via `--revert-all`.
- **F1 (attribution collapse)**: feature-flag-off Phase 11 only (leave Phase 10 + followup-2 running). Re-attempt only after Phase 10 retro re-confirms clean.
- **F2 (passive confirm pattern detected)**: extend confirm-gated mode by 7d. If still passive after 14d, demote to MEDIUM-only surface.
- **AC12 manual signal degrades**: pause mutation path; chef continues to SURFACE without writing.
- **AC3a precision regression at week 2** (<0.95 on golden-set re-eval): rollback to MEDIUM-only.
- **All other signals**: log + queue for post-soak retro.

**Soak-success criteria (declare Phase 11 done at +14d)**:

- AC12 manual: ≤1 false-positive/week post-trust-phase; ≥3 genuine/week; zero false-positive week-1 staged events.
- AC3a golden-set precision holds ≥0.95 on re-evaluated 50-pair set at week 2.
- Combined Phase 10 + Phase 11 cost stays under $1.50/day median.
- ≥1 `[[unresolve]]` actually used (validates AC6) OR explicit "no rollbacks needed."
- **≥1 `[[confirm <id>]]` actually used during week 1 (validates per-entry engagement — F2)** OR explicit user statement "staged-for-confirm look right, promote."
- Phase 11c GO/NO-GO decision documented at day 28 (F3 — not day 14).
- Cross-phase attribution log shows clean separation (no unattributable regressions — F1).

---

## Conditional gate criteria for 11c (Phase 10 day-28 steady-state — F3)

Build 11c IF AND ONLY IF Phase 10 day-28 soak data shows:

**Day 14 (Phase 10 soak retro): default NO-GO**. No override at day 14 regardless of metrics. Documented in retro: "11c gate deferred to day 28 per F3 mitigation — day-14 data is novelty-distorted."

**Day 21**: capture snapshot of items/day, dupe-percent, context-switching across per-meeting UI. Treat as steady-state-candidate baseline.

**Day 28**: re-snapshot.

**Steady-state CONFIRMED IF**:
- Day-21-to-day-28 items/day within 30% of day-14-to-day-21 items/day (no continued elevation post-soak).
- Day-21-to-day-28 dupe-percent within 30% of day-14-to-day-21 dupe-percent.
- Day-21-to-day-28 context-switching within 30% of day-14-to-day-21 context-switching.
- Day-21-to-day-28 items/day within 30% of Phase 9 pre-Phase-10 daily baseline.

If any criterion fails → steady-state NOT confirmed → defer gate further (re-snapshot day 35). If failure persists for two re-snapshots → NO-GO default applied with documented reasoning.

**Steady-state confirmed AND GO criteria (ALL must hold)**:
- Median day-21-to-day-28 has ≥15 staged items across ≥5 distinct source meetings.
- ≥30% of items are dupes (chef-curated count, post-Phase-10-dedup).
- John reports >2 min/day spent context-switching across per-meeting UIs (day-28 retro).
- John explicitly says "per-meeting workflow doesn't scale at current volume."

**NO-GO criteria (ANY triggers)**:
- Day-21-to-day-28 has <10 dedup-collapsed items.
- John reports per-meeting + dupe badges feel adequate.
- John doesn't explicitly request unified surface.

**Decision-maker**: John alone, with PM consultation on metric interpretation. Lived experience trumps metrics.

**Default**: NO-GO. The gate is biased toward "don't build" by construction. If 11c fires GO, a re-spec pass (one-day design doc) precedes build to address eng MC4.

**Measurement protocol**:
- Items/day = count of items surfaced in chef-curated winddown sections (post-dedup).
- Dupe-percent = (dedup-collapsed items) / (total raw staged items) per day, averaged across window.
- Context-switching = self-report wall-clock minutes spent moving between per-meeting approval UIs.
- Phase 9 baseline = Phase 9 retro daily metrics (already recorded).

---

## References

- **Phase 11 v2 (predecessor)**: same path, version history above.
- **Phase 11 pre-mortem**: `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/pre-mortem.md` — F1-F4 + M1-M5 incorporated.
- **Phase 11 PM review (v1)**: `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/review-pm.md`
- **Phase 11 eng-lead review (v1)**: `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/review-eng.md`
- **Phase 10 followup-2 (chef-mutates-staged-status)**: `dev/work/plans/arete-v2-chef-orchestrator/phase-10-followup-2-chef-mutates-staged-status/plan.md`
- **Phase 10 v2 plan (substrate)**: `dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/plan.md`
- **Phase 9 v3 plan (telemetry + cost-cap pattern)**: `dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/plan.md`
- **2026-06-04 winddown CT2 catch**: `now/archive/daily-winddown/winddown-2026-06-04.md` (lines 13-16)
- **2026-06-03 triage data**: `dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/golden-set-from-triage-2026-06-03.md`
- **`packages/cli/src/commands/pull.ts:608`** — current `pullGmailHelper` (extended in 11-pre).
- **`packages/core/src/integrations/gws/types.ts:64-72`** — current `EmailThread` shape (extended in 11-pre per F4 with cache versioning).
- **`packages/core/src/integrations/gws/gmail.ts`** — current `GmailProvider`.
- **`packages/core/src/integrations/staged-items.ts`** — `StagedItemStatus` shape (untouched; followup-2 owns).
- **`packages/core/src/services/commitments.ts`** — `CommitmentsService` (Phase 11 adds `autoResolve()` through Phase 10's `withLock`).
- **`packages/runtime/skills/daily-winddown/SKILL.md`** — chef prompt (Phase 11 adds Gmail Sent cross-check + first-week confirm-gate + day-3 review-not-bulk prompt).
- **`/Users/john/code/arete-reserv/.arete/commitments.json`** — real-data shape for golden-set construction.
- **`/Users/john/code/arete-reserv/people/internal/*.md`** — recipient email mappings (eng MC1 normalization required).
