# Phase 10 — Cross-Meeting Dedup + Data Model Consolidation

**Status**: planning — v2 (post PM + eng-lead review v2; both APPROVE WITH MINOR — ready for pre-mortem)
**Authored**: 2026-06-03 (v1), revised 2026-06-03 (v2 — two passes)
**Parent**: arete-v2-chef-orchestrator
**Depends on**: Phase 9 (brief primitive) — substrate for cross-source context assembly
**Prior conversation**: 2026-06-03 alignment with John on chef-orchestrator vision

**Revision history**:
- v1 (2026-06-03): initial "end-to-end orchestrator" scope — data model migration + reactive dedup + external-source resolution + unified approval surface + background hygiene. Reviewed by PM + eng-lead.
- v2 first pass (2026-06-03): scope trimmed to "data model + reactive cross-meeting dedup + week-1 controls + hygiene verb." Defers external-source resolution (10c) and unified approval surface (10d) to Phase 11. Fixes three eng-lead factual errors (createdAt, owner-as-personSlug, restore verb). Addresses six PM workflow gaps (G1-G6).
- v2 second pass (2026-06-03): incorporated PM v2 review (G3+G4 honest non-goals, AC11a tier-promotion user-confirm gate, AC0b baseline latency capture, AC5 soft-indicator caveat) + eng-lead v2 review (N1 bare-name ambiguity → AC1e disambiguation flow, N2 concurrent atomicity → `proper-lockfile` adopted, N3 historical bloat → AC10a migration-diff pattern for decisions/learnings, N4 partial-failure recovery → AC1f, N5 R10 fuller mitigation with hash-at-decision-time in log, N6 golden-pair labeling note in 10b-min) + "note to self" parser bug fix (Step 0 self-pattern pre-check before entity extraction) + R4 dual-shape read during dry-run window (AC0a) + migration delta-diff at apply time (AC1g) + LLM batching REQUIRED (not "if possible").
- v2 third pass (2026-06-03): pre-mortem mitigations F1-F5 incorporated. F1 (AIService has no native batching — code-verified) → 10a-pre adds `callConcurrent` helper for Promise.all-based parallelism + prompt-level multi-pair batching. F2 (per-meeting dupe badge race) → AC6a reverse-stamp on canonical's meeting with mtime check. F3 ([[unmerge]] discoverability) → inline `[[unmerge]]` hints in every "Deduped today" entry + first-week banner. F4 (migration delta-diff timing collision with manual triage) → sequence migration AFTER 24h triage stabilization window + categorize delta-diff rows by cause. F5 (concurrent same-text extracts produce competing canonicals) → `CommitmentsService.withLock(fn)` wraps read-modify-write, not just save().

---

## v1 → v2 changes (review-driven)

| ID | Reviewer | What v1 said | What v2 says |
|----|----------|--------------|--------------|
| C1 | eng-lead | Migration sort by `createdAt` | Field doesn't exist. v2 adds it as 10a-pre step, OR migrates using `date` (meeting date) with documented tradeoff |
| C2 | eng-lead | Naive personSlug union into stakeholders[] | Owner-as-personSlug rewrite: parse text for `@<slug>` notation + `→`/`←` arrows; fall back to direction='self' when no counterparty found |
| C3 | eng-lead | `arete commitments restore` for reversibility | Verb doesn't exist. v2 builds it as 10a-pre OR downgrades R1 to documented `cp` instructions |
| C4 | eng-lead | "Entity-overlap" pre-filter hand-waved | Use deterministic person-slug overlap (extract `@slug` from text); drop generic NER |
| C5 | eng-lead | Slack provider for Sent-message detection | Doesn't exist. **Deferred from v2 entirely** (Phase 12+) |
| C6 | eng-lead | Phase 8 reconciler "verified" with stakeholders[] | Full rewrite, not verify. v2 adds explicit order-of-operations section |
| G1 | PM | Mid-day per-meeting approval vs winddown dedup | v2 specifies: per-meeting approvals stay; winddown dedup is over un-approved staged items + recent (7d) commitments |
| G2 | PM | Async Fathom review temporal window | v2 fixes: temporal window gates on `date` (meeting date), not commitment write time |
| G3 | PM | Weekend / skipped-day catch-up | **Partially v2**: same-day window only on initial ship per Q4; full cross-day catch-up deferred to post-soak extension (honest non-goal — see §"Non-goals"). |
| G4 | PM | Mid-stream edits break hash | **DEFERRED to Phase 11**: `[[edit]]` directive needs more design (does it preserve all variants? Reset hash? Touch source meetings?). Phase 11 picks this up alongside `[[unresolve]]` for resolution flow. Honest non-goal for v2. |
| G5 | PM | Chat MCP approval at 22+ items slower | v2 DEFERS unified approval surface entirely; per-meeting approval continues |
| G6 | PM | stakeholders[] flattens roles | v2 adds: stakeholder shape includes `role: 'recipient'\|'mentioned'\|'self'` |
| MV1 | PM | Missing `--explain` for audit | v2 adds `arete dedup --explain <id>` as part of 10b-aux |
| MV2 | PM | Missing `[[unmerge]]` for recovery | v2 adds as part of 10b-aux + chef parser |
| MV3 | PM | Missing decision log for soak | v2 adds `dev/diary/dedup-decisions.log` |
| Q1 | eng-lead | LLM tier = standard | v2 starts at `fast` tier; promote to `standard` only if golden-pair precision/recall fails |
| Q4 | both | Cross-day from day 1 | v2 ships same-day only on 10b; cross-day after soak validates |

**Deferred to Phase 11 (separate plan to be drafted post-soak):**
- External-source resolution detection (10c v1) — Gmail-only first; Slack provider in Phase 12+
- Unified chat-first approval surface (10d v1) — wait until per-meeting UI with dupe badges proves out

---

## Background

The chef-orchestrator work (Phases 2-9) built incremental fixes: commitment leak (F1-F4), mirror-pair dedup (followup-6), loop reconciler (Phase 8), agenda regression fix via brief primitive (Phase 9). Each phase solved a real symptom. **But the underlying vision — chef ORCHESTRATES the entire winddown pipeline end-to-end — was not in scope.**

Today's actual flow:
1. User runs `arete pull krisp` / `arete pull fathom` (raw transcripts → meeting files)
2. User runs `arete meeting extract <slug>` per meeting (LLM extracts action items / decisions / learnings → staged sections IN the meeting file)
3. User reviews/approves per meeting in UI (or via slash-flow)
4. User runs `arete meeting apply` per meeting (commits items, writes Approved sections + memory files + commitments.json)
5. User runs `/daily-winddown` at end of day (chef curates ALREADY-APPROVED state, surfaces day's progress)

User's actual vision (confirmed 2026-06-03):
1. User runs `/daily-winddown` (or chef triggers itself)
2. Chef pulls all sources (krisp, fathom, slack, email, jira eventually)
3. Chef extracts per meeting → produces STAGED items
4. **Chef holistically processes**: cross-meeting dedup, cross-day dedup, external-source resolution detection
5. Chef presents UNIFIED approval surface (chat-first now; UI later)
6. User approves once; commits propagate
7. Winddown concludes

The gap: today's flow is decomposed into 4-5 manual steps with no dedup between them and no cross-source resolution. The vision is one orchestrated session.

**Phase 10 closes this loop.**

---

## Goals (v2 — trimmed)

1. **Data model consolidation (a)**: commitment = (action + direction). Counterparty becomes metadata (stakeholders[] with role field). Migration is one-shot, reversible, dry-run-first, with owner-as-personSlug aware parser.
2. **Cross-meeting reactive dedup** at staging time — same commitment voiced in 3 meetings appears ONCE in the approval surface, with provenance to all source meetings. **Same-day only on initial ship**; cross-day extension follows soak validation.
3. **Semantic dedup beyond text-hash** — two extractions of the same commitment may have different wording ("talk to Dave about staffing" vs "going to chat with Dave on the staffing plan"). Hybrid pre-filter + LLM cross-check (at `fast` tier on initial ship). Per-meeting approval UI gets dupe badges; per-meeting workflow preserved.
4. **Week-1 audit + recovery controls** (PM-required):
   - `arete dedup --explain <commitment-id>` — surface provenance of a merge decision
   - `[[unmerge]]` directive — undo a dedup merge in next winddown
   - `dev/diary/dedup-decisions.log` — observability surface for soak review
5. **Background dedup hygiene verb** — `arete dedup --scope <area|topic|commitments>` for catching what reactive missed; manual-only in v2 (cron later).

**Removed from v2 (deferred to Phase 11):**
- External-source resolution detection (Slack/email cross-reference to auto-resolve)
- Unified chat-first approval surface (single review queue)

---

## Non-goals (v2 — expanded deferrals)

- **External-source resolution detection** — Slack/email cross-referencing to auto-mark commitments resolved. **Deferred to Phase 11** (Gmail first; Slack provider Phase 12+). Per PM review: highest risk + lowest evidence-of-need from current winddowns. Per eng review: Slack Sent-message provider doesn't exist; building it is its own phase.
- **Unified chat-first approval surface** — single MCP-action review queue replacing per-meeting approval. **Deferred to Phase 11.** Per PM review G5: at 22+ items per day this likely takes LONGER than the per-meeting UI John uses today. v2 ships per-meeting approval WITH dupe badges instead; revisit unified approval after soak shows what John actually wants.
- **Rebuilding the per-meeting review UI**: per-meeting review remains structurally. v2 adds dupe badges + canonical references; surface doesn't change.
- **Replacing `arete meeting extract` / `arete meeting apply`**: existing per-meeting flow continues. Dedup pipeline hooks INTO extract (post-LLM extraction, pre-staging) and apply (cross-check at approval).
- **Cross-workspace dedup**: arete-reserv is one workspace.
- **Cron-scheduled background dedup**: manual-only verb in v2. Schedule it later if soak shows accumulated dupes between weekly winddowns.
- **Auto-resolution from meeting mentions** (e.g., "I already sent that to Lindsay" in transcript): out of scope. Manual resolution only via approval UI or `arete commitments resolve`.
- **Cross-day reactive dedup window (G3 explicit)** — v2 ships **same-day only** (per Q4). Cross-day window (last 7-14 days) deferred to a post-soak extension after threshold-tuning settles. This means weekend/skipped-day catch-up does NOT auto-dedup in v2 — user runs `arete dedup --since <date>` manually in that scenario, or backfill happens at the next winddown for that day's items. Honest tradeoff: smaller blast radius for soak vs. less complete dedup coverage. Revisit after 14d soak.
- **`[[edit]]` directive flow (G4 explicit)** — mid-stream commitment edits (user updates canonical text) need a flow that preserves dupe linkage via textVariants[] and source_meetings. Deferred to Phase 11 alongside `[[unresolve]]` (resolution recovery) since both touch the same chef-directive parser surface. v2 supports `[[unmerge]]` (split a dupe back out) but NOT in-place edit of canonical text.

---

## The hard parts (called out before architecture)

This plan is more architecturally substantial than Phases 2-9. Hard parts up front so reviewers can stress-test them:

### Hard part 1: Semantic equivalence is fuzzy

Two extractions of the same commitment will have different wording. Hash-based dedup misses these. Examples John flagged:

| Meeting A extracts | Meeting B extracts | Same? |
|---|---|---|
| "Talk to Dave about staffing" | "Going to chat with Dave on the staffing plan" | Yes |
| "Send Lindsay the deck by Friday" | "Get the deck to Lindsay before EOW" | Yes |
| "Send Lindsay the deck" | "Send Anthony the deck" | No |
| "Discuss Dave's role" | "Talk to Dave about staffing" | Ambiguous |
| "Follow up with Dave on hiring" | "Talk to Dave about staffing" | Probably same (both Dave-staffing-related) but not certain |

The threshold matters. Build wrong, you either:
- Dedup too aggressively → lose distinct commitments (false positive merge)
- Dedup too conservatively → still see dupes (false negative)

**This is irreducibly fuzzy.** The mitigation is iterative threshold tuning + always surfacing dedup decisions to the user (never silent), so users can correct in real-time during approval.

### Hard part 2: Data model migration

Existing `commitments.json` has thousands of entries hashed by `sha256(text + counterparty + direction)`. Migrating to `sha256(text + direction)` requires:

- Grouping existing commitments by new hash key
- Within each group: pick canonical entry (oldest? most-edited?), merge `source_meetings` arrays, union `stakeholders` (counterparty becomes one of N), preserve provenance
- Handle edge cases: one entry in group is `resolved`, another `open` → group resolves (any-resolved wins)? Or surface conflict for user adjudication?
- Backup before migration; reversible script

**This is non-trivial and one-shot.** Get it wrong = data loss or quiet corruption. Mitigation: dry-run mode with diff report, user confirms before applying.

### Hard part 3: Owner-as-personSlug pattern in legacy data (NEW in v2 — eng C2)

155 of ~600 commitments in arete-reserv have `personSlug="john-koht"` (the workspace owner). For these, the real counterparty is buried in text — `"@john-koht → @dave-wiedenheft: Talk to Dave about staffing"` or `"Deliver POP MVP project plan ... to Lindsay"`. Naive migration that unions personSlug into stakeholders[] produces `["john-koht"]` and loses the actual counterparty.

**This is non-trivial.** Two patterns to detect in text:
- **Arrow notation**: `@<owner-slug> → @<counterparty-slug>` (outbound), `@<owner-slug> ← @<counterparty-slug>` (inbound)
- **Natural language**: "send to Lindsay" / "from Anthony" / "with Dave" — requires entity resolution against `people/` directory

Mitigation: dedicated parser `extractCounterpartiesFromText(text, direction)` that:
1. First tries arrow regex (deterministic)
2. Falls back to person-name resolution against `people/**/*.md` frontmatter (display name + aliases)
3. Returns `string[]` of counterparty slugs (excluding owner)
4. If empty → direction shifts to 'self' (the commitment IS a self-reminder)

Dry-run migration surfaces every group where parsing was ambiguous so user can review.

### Hard part 4: Cost

Every meeting extraction now does an additional LLM cross-reference against recent commitments (same-day window in v2). At 5-10 meetings/day × N commitments-to-check × LLM call, this adds up.

Mitigation v2:
- Hybrid pre-filter: text-hash + Jaccard + **deterministic person-slug overlap** (extract `@slug` from text, not LLM-based NER per eng C4)
- Narrow candidate set to 3-5 → LLM-cross-check those
- **Start at `fast` tier** per eng Q1 counter-rec — measure precision/recall on golden set; promote to `standard` only if recall drops below target
- Caps total spend per winddown at ~$0.50-1.50 (lower than v1 estimate due to fast-tier choice)
- Cost reported in chef summary at session end

### Hard part 5: Text normalization stability

Semantic dedup hinges on stable text normalization so that two extractions of the same commitment hash identically. Required normalization steps:
- Lowercase
- Strip punctuation (`.`, `,`, `;`, `:`, `!`, `?`, but preserve `@` for slug tokens)
- Collapse whitespace
- Strip arrow notation (`→`, `←`, `->`, `<-`) and `@<owner-slug>:` prefixes
- Lemmatize verbs minimally: `talked` → `talk`, `sent` → `send`, `sending` → `send`, `will send` → `send` (rules-based, no library)
- Strip leading "I'll", "I will", "going to", "gonna" → empty

This is brittle. Cases where it'll break:
- `"Send the FY25 deck by Friday"` vs `"Send the FY25 deck by EOW"` — normalize to different text (Friday ≠ EOW), correctly NOT deduped → semantic layer should handle (Friday IS EOW)
- `"Talk to Dave"` vs `"Talk with Dave"` — `to` vs `with`. Normalize should strip these OR keep them; depends on tuning
- `"Send Lindsay the deck"` vs `"Send the deck to Lindsay"` — same action, different word order. Normalize via token sort? Then `"send lindsay deck"` and `"send deck lindsay"` → token-sort → same. But losing word order can over-merge ("Send Lindsay's deck to Anthony" vs "Send Anthony's deck to Lindsay" — different!).

**Honest reality**: normalization will be empirically tuned across soak. Ship with conservative rules (no token sort, minimal lemmatization), let LLM semantic layer catch what hash misses. Threshold sweep planned in test phase.

---

## End-to-end flow (target shape — v2)

### Per-meeting flow (unchanged structurally; dedup hooks added)

User still runs `arete meeting extract <slug>` (manually or as part of pull). The change: extract NOW does a dedup pass before staging.

```
arete meeting extract <slug>:
  1. LLM extracts action items / decisions / learnings (existing)
  2. Within-meeting mirror-pair dedup (existing — Phase 8 followup-6)
  3. NEW: Cross-meeting dedup pass (Phase 10):
     a. For each extracted item: compute normalized-text hash
     b. Cross-reference against commitments.json + recent (last 7d) staged items in other meetings
     c. Hybrid pipeline: text-hash → Jaccard pre-filter (≥0.6) + person-slug overlap → LLM cross-check (fast tier)
     d. For each match decision: log to dev/diary/dedup-decisions.log
     e. Annotate staged item with canonical reference if dupe found
  4. Write staged sections (with dupe badge metadata for the UI)
```

Per-meeting approval (existing UI) sees:
- Non-dupe items: normal stage with checkbox
- Dupe items: ↪ badge linking to canonical meeting, approval click redirects to canonical's approve flow

```
arete meeting apply (existing — small change):
  1. Read approved staged items (existing)
  2. NEW: Skip dupe items (they already committed via canonical's approval)
  3. Write commitments.json (existing — now uses v2 hash + stakeholders[])
  4. Write Approved sections in meeting body (existing — dupes get ↪ canonical reference)
  5. Append to memory files (existing — NEW: dedup-aware append, see §"Memory file dedup")
```

### Winddown flow (additive, NOT a rewrite)

Today's `/daily-winddown` chef-orchestrator flow continues. Phase 10 ADDS dedup-related sections to the chef-curated view:

```
/daily-winddown:
  1. Gather context (existing — Phase 7a Pattern 5)
  2. Cross-skill gather: slack-digest, email-triage, process-meetings (existing)
  3. Loop reconciler R1-R4 (existing — Phase 8; R4 logic updated for stakeholders[] per C6)
  4. NEW: Surface dedup decisions made during the day's meeting extracts
     - "Deduped today" section: list of merge decisions with --explain hint
     - "Possibly mergeable" section: items where LLM confidence was MEDIUM (user can confirm)
  5. Closed today (existing — manual closures only in v2; auto-resolve deferred)
  6. Standard winddown output (existing)
```

**Critical: this is NOT a SKILL.md rewrite for orchestration.** Per PM review G5, the unified approval surface adds friction not removes it for John's current 22+ items/day. v2 preserves per-meeting approval flow; winddown just surfaces what the dedup pass did.

---

## Architecture

### Data model: commitment shape v2 (eng C1 + C6 + PM G6 fixes)

```ts
interface Stakeholder {
  slug: string;                        // person slug
  role: 'recipient' | 'sender' | 'mentioned' | 'self';  // PM G6 — role distinction
}

interface Commitment {
  id: string;                          // unchanged
  hash: string;                        // NEW: sha256(text_normalized + direction) — no counterparty
  text: string;                        // canonical (user-edited or LLM-extracted)
  textVariants: string[];              // NEW: all observed wordings (cap 5 per PM Q3) — eviction: drop oldest when full
  direction: 'outbound' | 'inbound' | 'self';
  status: 'open' | 'resolved' | 'deferred';
  
  stakeholders: Stakeholder[];         // NEW (richer than v1 v2): role-tagged
  
  source_meetings: string[];           // meeting slugs that surfaced this
  source_external: ExternalSource[];   // RESERVED for Phase 11 (always [] in v2)
  
  date: string;                        // EXISTING (meeting date) — used for temporal queries
  createdAt: string;                   // NEW (10a-pre) — wall-clock time of first creation; preserved across merges
  resolvedAt?: string;                 // EXISTING (nullable)
  resolvedBy?: 'user';                 // v2: ONLY 'user' (auto-resolve deferred to Phase 11)
  
  area?: string;                       // unchanged
  areaSetBy?: 'frontmatter' | 'inference' | 'backfill' | 'user';  // unchanged
}

interface ExternalSource {            // RESERVED for Phase 11
  kind: 'slack' | 'gmail' | 'jira';
  url?: string;
  ref: string;
}
```

Key v2 changes:
- **`hash` drops counterparty** (data-model decision (a))
- **`stakeholders: Stakeholder[]`** with role field (PM G6 — distinguishes "actually sent to" from "mentioned-in-context")
- **`createdAt` ADDED** as a new field (eng C1 — was incorrectly assumed to exist in v1). Wall-clock timestamp of first surfacing. Used for canonical-pick during migration AND for cap eviction on textVariants[].
- **`source_external: []`** reserved for Phase 11; always empty in v2 (still emitted in JSON for shape stability)
- **`resolvedBy: 'user'` only** in v2 (auto-resolve sources deferred)
- **`textVariants` cap = 5** (PM Q3) with oldest-first eviction
- **NO change** to existing fields (`date`, `area`, `areaSetBy`, `id`, `direction`, `status`, `resolvedAt`)

### Migration plan (v2 — eng C2 owner-as-personSlug fix)

One-shot migration. Three pre-requisites in 10a-pre:

1. **Add `createdAt` field** to `Commitment` model. Backfill existing entries with `date` (meeting date) value as a sentinel. New entries get wall-clock time.
2. **Build `arete commitments restore --from <backup>` verb** (eng C3 — was invented in v1). Reads a snapshot JSON, writes commitments.json. Idempotent. ~50 LOC.
3. **Update Phase 8 Rule 4 reconciler** to use stakeholders[] set-overlap instead of counterparty slug-equality (eng C6). This is a rewrite of `daily-winddown/SKILL.md:540-608` and the underlying logic.

After 10a-pre, migration steps (10a):

1. **Snapshot**: write `.arete/commitments.json` to `.arete/commitments.pre-phase-10.json` (atomic copy via storage adapter).

2. **Build counterparty parser**: `extractCounterpartiesFromText(text, owner_slug, direction) → { stakeholders: Stakeholder[], ambiguous: boolean, ambiguousNames?: { name: string; candidates: string[] }[] }`:
   - **Step 0 (NEW v2 — eng N1 + "note to self" fix)**: self-pattern pre-check. If text starts with one of `["note to self", "remember to", "remember i", "make sure i", "don't forget to", "todo:"]` (case-insensitive), AND no arrow notation present → mark as self-reminder immediately, return `{stakeholders: [{slug: owner, role: 'self'}], direction: 'self'}`. Skip remaining steps.
   - **Step 1**: arrow notation regex `@<slug>` → `@<slug>` or `@<slug>` ← `@<slug>`. Deterministic, highest confidence. If matches, return immediately with role=recipient/sender per direction.
   - **Step 2**: natural language regex for "to <Name>", "from <Name>", "with <Name>", "for <Name>" → resolve via person directory.
     - If `<Name>` resolves to EXACTLY ONE person slug → use it.
     - If `<Name>` resolves to MULTIPLE person slugs (e.g., "Lindsay" → both `lindsay-calar` and `lindsay-gray`): set `ambiguous: true`, populate `ambiguousNames` with the name + candidate list, return WITHOUT picking a slug. Migration surfaces these in diff for user disambiguation.
   - **Step 3**: if owner is the ONLY slug present (no arrow, no resolvable name, no self-pattern): direction shifts to 'self', stakeholders = [{ slug: owner, role: 'self' }].
   - Returns `ambiguous: true` if parsing reached natural-language step AND multiple candidates resolved.

3. **Group by new hash**: iterate commitments, compute `sha256(normalize(text) + direction)`, group.

4. **Within each group** (sorted by `date` ascending — oldest first per PM Q5):
   - Pick canonical = oldest by `date`, falling back to insertion order
   - Run parser on each entry's text → union resulting Stakeholder[] (deduplicate by slug, preserve highest role)
   - Merge `source_meetings: string[]` (union of all entries' meeting refs)
   - Merge `textVariants: string[]` (union of distinct texts, cap at 5, drop oldest when over)
   - Resolve status conflicts: any `resolved` → group is `resolved` (use earliest resolvedAt); any `deferred` w/o `resolved` → `open` (un-defer when consolidated); else preserve `open`

5. **Generate diff report**: `migration-diff.md` listing every group with: old N entries → new entry, ambiguous-parse entries highlighted, status-conflict entries highlighted. **Persist as audit artifact** (PM trust-risk recommendation — not one-time view).

6. **Confirm + apply**: user reads diff report. If acceptable, `arete commitments migrate --to-v2 --apply` writes new commitments.json. Old file retained at `.arete/commitments.pre-phase-10.json`.

7. **Reversibility**: `arete commitments restore --from .arete/commitments.pre-phase-10.json` undoes migration.

**Feature flag gating** (eng-lead build sequencing rec):
- Migration ships as `--to-v2 --dry-run` for 3-5 days BEFORE applying
- User runs dry-run, reads diff report, raises issues
- Issues addressed → migration applied
- v2 hash code path gated behind feature flag until migration complete; old code paths still functional

**Expected scope** (arete-reserv eng review found): ~600 commitments, ~155 with owner-as-personSlug. Migration must handle owner-aware parsing for those 155 specifically OR they'll all collapse together.

### Semantic dedup pipeline (hybrid, v2 — eng C4 deterministic person-slug overlap)

```
new_staged_item:
  1. Normalize text (lowercase, strip punct, strip @<slug>: prefix and arrows, minimal lemmatization)
  2. Compute exact-match hash: sha256(normalized + direction)
  3. Lookup commitments.json + recent staged items (same-day window for v2) by hash:
     - Exact match found → canonical attached, dedup decision logged, DONE
     - No exact match → continue to fuzzy
  
  4. Hybrid pre-filter (v2 — eng C4 fix):
     a. Jaccard token similarity: candidates with Jaccard ≥ 0.6 over normalized text
     b. Person-slug overlap: extract @<slug> tokens from text; candidates sharing ≥1 slug
     c. Direction match: candidates must share `direction` field
     Combined: candidates = (Jaccard ≥ 0.6) AND (direction match) AND (person-slug overlap ≥ 1 OR action verb overlap)
     If 0 candidates: register as new canonical, DONE
     If 1+ candidates: cap at top 5 by Jaccard score, continue to LLM cross-check
  
  5. LLM cross-check — REQUIRED batched (PM v2): all candidate pairs for an extraction batched into a single LLM call. Latency budget AC13 (≤5s extra/extract) depends on this. If AIService batching not yet supported in the codebase, build it in 10b-min as a sub-task — non-batched per-pair calls fail AC13 by construction.
     Tier: 'fast' (per eng Q1 counter-rec) — promote to 'standard' only if golden-set precision drops below 0.90
     Prompt:
       Given two commitments from a workspace, decide if they refer to the same intended action.
       Consider: same actor, same recipient/stakeholders, same artifact, same timing window.
       Different timing, different artifacts, or different recipients = NOT the same.
       A: <new item> | from meeting <meeting-A>
       B: <candidate> | created <date>, status <status>
       Return: SAME | DIFFERENT | UNCERTAIN, with 1-sentence reasoning
     Parse:
       SAME → attach as dupe to canonical
       DIFFERENT → register as new canonical
       UNCERTAIN → register as new canonical AND flag for "Possibly mergeable" surface in next winddown
  
  6. Log dedup decision to dev/diary/dedup-decisions.log:
     <ISO timestamp> <decision> <new-item-id> <canonical-id> <jaccard-score> <llm-decision> <llm-reasoning>
```

**Cost estimate v2** (with fast tier per eng Q1):
- 10 new staged items × ≤5 candidates × $0.001/call (fast tier) ≈ $0.05/winddown
- Conservative ceiling for heavy day: 30 items × 5 candidates × $0.001 ≈ $0.15
- Compare to v1 estimate of $0.25 at standard tier → v2 is 3-5x cheaper baseline

### Per-meeting UI dupe badges

In each meeting file's staged sections, dupe items get a badge:
```markdown
## Action Items (staged)

- [ ] [ai_0042] Talk to Dave about staffing  ↪ canonical in <other-meeting-slug>
- [ ] [ai_0043] Send Lindsay the deck by Friday
```

In the existing `arete meeting extract` UI, the dupe badge surfaces as a tooltip "see canonical in <slug>". Approval clicks on the dupe → marked as a reference-only approval (no second commitment writes; canonical's approval propagates).

### Memory file dedup (decisions.md / learnings.md)

When `commitApprovedItems` appends to `decisions.md` / `learnings.md`, it now runs through the same hybrid pipeline against existing entries in that file:
- Exact match → skip append; add meeting-ref to existing entry's `## Source` line
- Hybrid match → skip append; add meeting-ref to canonical
- No match → append new entry

Result: decisions.md / learnings.md stop accumulating dupes going forward. (Historical cleanup via `arete dedup --scope decisions`.)

### Week-1 audit + recovery controls (PM MV1-3)

**`arete dedup --explain <commitment-id>`** — prints provenance of a merge decision:
```
Commitment: c8e3d2f1...
Canonical text: "Talk to Dave about staffing"
Stakeholders: [@dave-wiedenheft (recipient), @lindsay-gray (mentioned), @anthony-avina (mentioned)]
Source meetings:
  - 2026-06-01-john-lindsay-11.md (original; LLM-extracted)
  - 2026-06-02-glance-2-sync.md (deduped 2026-06-02; jaccard 0.78; LLM: SAME)
  - 2026-06-03-pop-review.md (deduped 2026-06-03; exact text hash match)
Text variants observed (5/5 capacity):
  - "Talk to Dave about staffing"  ← canonical
  - "Going to chat with Dave on the staffing plan"
  - "Need to discuss staffing with Dave"
  ...
```

**`[[unmerge]]` directive** — when user adds `[[unmerge]]` to a chef-curated view (next to a dedup decision), next winddown:
1. Picks the dupe entry pointed to
2. Splits it back out from canonical
3. Removes from canonical's source_meetings
4. Restores as independent commitment with original text
5. Logs `unmerge` action to dedup-decisions.log

**`dev/diary/dedup-decisions.log`** — append-only log:
```
2026-06-03T15:42:01Z MERGE ai_0042 → canon_c8e3d2 (jaccard 0.78, fast-tier SAME, "same actor + Dave + staffing context")
2026-06-03T15:42:03Z NEW ai_0043 (no hybrid match within 7d window)
2026-06-03T15:42:05Z UNCERTAIN ai_0044 vs canon_e94f1a (jaccard 0.62, fast-tier UNCERTAIN, surface for user review)
2026-06-03T22:08:11Z UNMERGE ai_0043 ← canon_c8e3d2 (user-initiated via [[unmerge]] directive in winddown-2026-06-03.md)
```

### Background dedup verb (manual-only in v2)

```bash
arete dedup --scope commitments    # consolidate commitments.json (post-migration hygiene)
arete dedup --scope decisions      # consolidate decisions.md
arete dedup --scope learnings      # consolidate learnings.md
arete dedup --scope topics         # cross-reference topic pages (Karpathy wiki dedup)
arete dedup --scope all            # everything
arete dedup --dry-run              # preview without writing
arete dedup --since 2026-04-01     # only dedup recent
arete dedup --explain <id>         # provenance of a specific merge
```

Runs hybrid pipeline against scoped data. Same hybrid as reactive (text-hash → Jaccard + slug-overlap → LLM fast-tier). Useful for catching what reactive missed + post-migration hygiene.

**Phase 8 reconciler interaction (eng C6 — order of operations)**:

```
arete meeting extract <slug>:
  1. LLM extracts (existing)
  2. Within-meeting mirror-pair dedup (existing — Phase 8 followup-6)
  3. Phase 10 cross-meeting dedup (NEW)
  4. Write staged sections

/daily-winddown:
  1. Gather (existing — Phase 7a)
  2. Phase 8 loop reconciler R1-R4 (existing logic; R4 REWRITTEN for stakeholders[] set-overlap)
  3. Phase 10 dedup-decision surfacing (NEW — "Deduped today" + "Possibly mergeable" sections)
  4. Winddown output (existing)
```

R4 rewrite (Phase 8 logic update — was slug-equality):
- v1 R4: "if commitment.counterparty matches recurring meeting attendee AND not voiced in last 5d → suggest close"
- v2 R4: "if commitment.stakeholders set ∩ recurring meeting attendees set ≥ 1 AND not voiced in last 5d → suggest close"

---

## Build phases (sub-orchestrated, v2)

> **NOTE**: v1 had a separate "## Migration plan" section here. That content moved into §"Migration plan (v2)" inside the Architecture section, with the eng C2 owner-as-personSlug fixes incorporated.

**10a-pre — Prerequisites (~3-4 days, v3)**:
- Add `createdAt: string` field to `Commitment` model + frontmatter contract; backfill existing entries with `date` value as sentinel (1-line migration script)
- Build `arete commitments restore --from <backup-path>` CLI verb (~50 LOC)
- Rewrite Phase 8 Rule 4 reconciler logic from counterparty slug-equality to stakeholders[] set-overlap (`daily-winddown/SKILL.md:540-608` + underlying logic in `commitments.ts`). **R4 must read both shapes** during 3-5 day dry-run window (AC0a): fall back to `personSlug` when `stakeholders` undefined.
- **Add `proper-lockfile` dep** (eng N2 — R12 mitigation) — `CommitmentsService.save()` acquires exclusive file lock before read-modify-write; 30s TTL with PID check. Cross-process safe.
- **`CommitmentsService.withLock(fn)` helper** (v3 pre-mortem F5) — wraps read-modify-write atomically. Replaces ad-hoc `read → modify → save` patterns in extract/apply paths. F5 mitigation: two concurrent extracts of same text can't both decide "no canonical exists" because the second acquires lock only after the first commits.
- **`AIService.callConcurrent` helper** (v3 pre-mortem F1 — code-verified gap) — Promise.all-based parallelism for N independent calls; also supports prompt-level multi-pair batching ("Given these 5 pairs, return YES/NO for each: [pairs]"). Required infrastructure for AC13's ≤5s gate. ~30 LOC.
- **Baseline extract latency** (PM v2 — AC0b) — measure current `arete meeting extract <slug>` wall-time on 3 typical meeting fixtures; record in `phase-10-baseline-latencies.md`. AC13 (≤5s extra) regression compares against this baseline.
- Tests: backfill produces no-ops on fresh entries, restore verb round-trips fixture, Rule 4 set-overlap test cases, R4 dual-shape read test (AC0a), concurrent-extract lock test (R12), `callConcurrent` parallelism test (F1), `withLock` race-condition test (F5)

**10a — Data model + migration tooling (~4-5 days)**:
- New `Commitment` shape v2 in `models/commitment.ts` (PURE additive — old shape readable; v2 shape written)
- `Stakeholder` interface with `role` field (PM G6)
- `computeCommitmentHashV2(text_normalized, direction)` function — no counterparty
- `extractCounterpartiesFromText(text, owner_slug, direction)` parser (handles arrow notation + natural language + owner-as-personSlug case per eng C2)
- `arete commitments migrate --to-v2 [--dry-run] [--apply]` CLI verb
- Diff report writer: `migration-diff.md` listing every group with: old entries → new entry, ambiguous-parse entries highlighted, status-conflict entries highlighted (persisted as audit artifact per PM trust-risk rec)
- Feature flag: v2 read path active only after migrate --apply succeeds
- Tests:
  - Synthetic fixture: 20 commitments with various owner-as-personSlug + arrow-notation patterns → migration round-trips correctly
  - Real fixture: snapshot of arete-reserv commitments.json (155 owner-as-personSlug entries) → migration produces expected groups, no data loss in dry-run diff
  - Reversibility: migrate → restore → assert exact byte-equality with pre-migration snapshot

**10b-min — Reactive dedup, same-day window only (~5-7 days)**:

> **Golden-pair labeling note (PM v2 N6)**: AC3a's 30-pair golden set requires ~30 minutes of John's time on real arete-reserv commitment-text variations. Schedule: engineer drafts pair candidates from triage data; John adjudicates in a single ~30min session during build week 1. Without this, AC3a tier-promotion gate can't fire.


- Hybrid pipeline: normalize → exact hash → Jaccard pre-filter (≥0.6) + person-slug overlap + direction match → LLM cross-check at `fast` tier (eng Q1 counter-rec)
- `arete meeting extract` becomes dedup-aware: cross-references against commitments.json + same-day staged items in OTHER meetings (NOT last 7d in initial ship — per Q4 deferred to soak observation)
- Memory file append-time dedup: `appendToMemoryFile` in `staged-items.ts` runs same hybrid against existing entries; collapses to meeting-ref-on-canonical
- Dupe badges in per-meeting staged sections: `[ai_0042] Text ↪ canonical in <slug>`
- `apply` flow: dupe items skip commitment write (canonical already wrote); just emit `↪` reference in Approved sections
- Tests:
  - Synthetic dupes at Jaccard 0.3 / 0.5 / 0.6 / 0.7 / 0.85 / 0.95 — measure precision/recall (eng test-strategy gap fix)
  - Golden-pair set: 30 hand-labeled (SAME / DIFFERENT / UNCERTAIN) pairs — assert LLM fast-tier precision ≥0.85, recall ≥0.80; if fails, promote to standard tier
  - Per-meeting badge rendering test
  - apply flow with dupe item: assert no double-write to commitments.json

**10b-aux — Audit + recovery controls (~2-3 days)** (PM MV1-3 — REQUIRED for safe soak):
- `arete dedup --explain <commitment-id>` CLI verb — surface provenance, source_meetings, textVariants, dedup-decisions log entries for that commitment
- `[[unmerge]]` directive parser in chef-curated views — next winddown reads marker, splits dupe back out, logs unmerge action
- Append-only `dev/diary/dedup-decisions.log` with format: `<ISO> <decision> <new-id> <canonical-id> <jaccard> <llm-tier> <llm-decision> <reasoning>`
- Best-effort write (log failure does not block command, per Phase 9 telemetry convention)
- Tests:
  - --explain output format includes all expected fields
  - [[unmerge]] directive correctly splits dupe; reversibility check (re-merge produces same canonical)
  - Log write under contention (concurrent extracts) does not corrupt

**10e — Background dedup hygiene verb (~3-4 days)**:
- `arete dedup --scope <commitments|decisions|learnings|topics|all>` CLI verb
- Same hybrid pipeline as reactive, applied retroactively
- Default `--dry-run`; explicit `--apply` required for writes
- `--since <date>` to limit scope
- Tests:
  - Each scope produces expected dedup groupings on fixture
  - Idempotent: second --apply is no-op
  - --dry-run does NOT write

**Total (v2)**: ~16-22 working days (~3-4 weeks at typical pace, less if some parallelizable).

**NOT in v2 (Phase 11+)**:
- 10c — External-source resolution (Gmail-only first; Slack provider Phase 12+)
- 10d — Unified chat-first approval surface
- Cross-day dedup window extension (10b post-soak)

---

## Acceptance criteria (v2)

**AC0 (10a-pre)**: `createdAt` field present on `Commitment`; backfill of existing entries with `date` sentinel is a no-op on re-run; `arete commitments restore --from <path>` round-trips a snapshot byte-equal; Phase 8 Rule 4 set-overlap test cases pass.

**AC0a (R4 dual-shape read during dry-run window — eng v2)**: Phase 8 R4 reconciler reads `stakeholders[]` if present; falls back to `personSlug` if `stakeholders` undefined. Both shapes must coexist correctly during the 3-5 day dry-run window before --apply runs. Test: R4 against v1-shape commitment AND v2-shape commitment in same workspace → both return correct skip-decisions.

**AC0b (extract latency baseline — PM v2)**: measure `arete meeting extract <slug>` wall-time on 3 typical meeting fixtures BEFORE 10b ships dedup pipeline. Record in `phase-10-baseline-latencies.md` (committed). AC13's "≤5s extra" gate compares against this.

**AC1 (migration — dry-run)**: `arete commitments migrate --to-v2 --dry-run` produces `migration-diff.md` listing all dedup groups with: before entries → after entry, ambiguous-parse rows highlighted, status-conflict rows highlighted. **Migration diff persisted as audit artifact** (not one-time view — kept in `dev/work/plans/.../phase-10-migration-diff-YYYY-MM-DD.md`).

**AC1a (migration — owner-as-personSlug parsing — eng C2)**: synthetic fixture entry `{personSlug: "john-koht", text: "@john-koht → @dave-wiedenheft: Talk to Dave about staffing", direction: "outbound"}` migrates to `{stakeholders: [{slug: "dave-wiedenheft", role: "recipient"}], direction: "outbound"}`. Owner not in stakeholders.

**AC1b (migration — self-reminder, v2 — eng "note to self" fix)**: synthetic fixture entry `{personSlug: "john-koht", text: "Note to self: prep for Dave's review", direction: "outbound"}` migrates to `{direction: "self", stakeholders: [{slug: "john-koht", role: "self"}]}`. Detected via Step 0 self-pattern pre-check (`"note to self"` prefix) regardless of name mentions in body — Dave is NOT marked as recipient. Also covered patterns: "remember to", "remember I", "make sure I", "don't forget to", "todo:".

**AC1e (migration — bare-name ambiguity, v2 — eng N1)**: synthetic fixture entry with text `"Deliver POP MVP project plan ... to Lindsay"` in a workspace with both `lindsay-calar.md` and `lindsay-gray.md` → parser returns `{ambiguous: true, ambiguousNames: [{name: "Lindsay", candidates: ["lindsay-calar", "lindsay-gray"]}], stakeholders: []}`. Migration writes this row to `migration-diff.md` under an "Ambiguous (user must disambiguate)" section. User edits `.arete/commitments.pre-phase-10-ambiguities.json` to specify the chosen slug; `--apply` reads disambiguations and uses them. Without disambiguation, --apply blocks with clear error.

**AC1f (migration — partial-failure recovery, v2 — eng N4)**: if `arete commitments migrate --to-v2 --apply` throws before completing the single atomic write of commitments.json, the file is unchanged (atomic-write-via-tmp pattern). Pre-migration snapshot at `.arete/commitments.pre-phase-10.json` is the recovery anchor. Re-running `--apply` after fixing the upstream error produces the same result. Test: inject a parser exception on row 234/600 → assert commitments.json unchanged + tmp file cleaned up.

**AC1g (migration — delta-diff at apply time, v2 — eng "migration atomicity" finding)**: dry-run runs 3-5 days before --apply; new commitments accrue during that window. `--apply` regenerates the diff at apply time. If the post-window diff differs from the dry-run diff by > 5 affected groups OR > 10 new rows: surface a delta-diff alongside the original; require user to re-confirm before writing. Otherwise apply proceeds.

**AC1h (migration — 24h quiet-window guard, v3 pre-mortem F4)**: `migrate --to-v2 --apply` REFUSES to run if `.arete/commitments.json` has been modified in the last 24 hours (e.g., user just ran a manual triage). Surfaces: `"commitments.json modified <X> hours ago — wait 24h after the last manual triage for the diff to stabilize, or pass --force-after-triage to override (with delta-diff re-confirm)."`. Delta-diff (AC1g) is the safety net for --force-after-triage path. Categorize delta-diff rows by source: `new-extract`, `manual-resolve`, `manual-drop`, `manual-create` — so the user can read large deltas legibly.

**AC1c (migration — apply)**: `migrate --to-v2 --apply` writes new commitments.json; old shape preserved at `.arete/commitments.pre-phase-10.json`; subsequent reads via v2 path return expected structure.

**AC1d (migration — reversibility — eng C3)**: `arete commitments restore --from .arete/commitments.pre-phase-10.json` undoes the migration; assert byte-equality with pre-migration content.

**AC2 (reactive dedup — exact text match, same-day)**: extracting "Talk to Dave about staffing" against an existing commitment with identical normalized text + direction in another meeting from TODAY → dupe attached, canonical updated, dedup-decision logged, commitments.json count unchanged.

**AC3 (reactive dedup — semantic match)**: extracting "Going to chat with Dave on the staffing plan" against existing "Talk to Dave about staffing" → hybrid pre-filter (Jaccard ≥0.6 + person-slug overlap) → fast-tier LLM cross-check returns SAME → dupe attached. Threshold sweep across Jaccard 0.3/0.5/0.6/0.7/0.85/0.95 produces P/R curve documented in build report.

**AC3a (LLM tier choice — eng Q1)**: golden-pair set of 30 hand-labeled pairs (SAME/DIFFERENT/UNCERTAIN). Fast-tier achieves precision ≥0.85 AND recall ≥0.80. If fails, promote to standard tier and document cost delta.

**AC4 (reactive dedup — distinct items)**: extracting "Send Lindsay the deck" vs existing "Send Anthony the deck" → normalized texts differ; hashes differ; hybrid pre-filter person-slug overlap differs (lindsay vs anthony); NOT deduped, both retained as distinct canonicals.

**AC4a (reactive dedup — UNCERTAIN handling)**: when LLM returns UNCERTAIN, item is registered as NEW canonical AND flagged for "Possibly mergeable" surface in next winddown. User can confirm merge via UI action (next winddown).

**AC5 (memory file dedup at apply)**: approving the same decision via 2 meeting approvals → `decisions.md` has ONE entry with both meeting sources (joined as `## Source` list), not two entries.

**AC5a (memory file dedup — semantic)**: appending "POP migration must complete by EOY" against existing "POP MVP wraps by end of year" → hybrid + LLM cross-check → dupe → single entry, both meeting sources merged.

**AC6 (per-meeting UI dupe badges)**: meeting B's staged section shows dupe item as `[ai_0042] <text>  ↪ canonical in <meeting-A-slug>`. Per-meeting approval UI:
- Treats dupe approval as a reference-only commit (no double-write to commitments.json)
- Records meeting B in canonical's source_meetings
- Writes `↪` reference in meeting B's Approved section

**AC6a (reverse-stamp on canonical's meeting — v3 pre-mortem F2)**: when a later meeting extract finds an EXISTING canonical in an earlier meeting, the canonical's source meeting file ALSO gets updated (best-effort): a comment `<!-- also surfaced in <meeting-B-slug> on YYYY-MM-DD -->` is appended after the staged item line. mtime check before write — skip if meeting file is in user's open-edit window (mtime within last 60s). User opening the earlier meeting later sees the cross-reference and isn't confused by stale state. Best-effort: failure does not block extract.

**AC7 (audit — `dedup --explain`)**: `arete dedup --explain <commitment-id>` prints: canonical text, all stakeholders with roles, all source_meetings with dedup-event provenance (when merged, what jaccard, what LLM decision, what reasoning), textVariants list with eviction state. Fixture-validated output shape.

**AC8 (recovery — `[[unmerge]]` directive)**: chef-curated winddown view contains `[[unmerge: <canonical-id> ← <dupe-id>]]` directive. Next winddown:
- Parses directive
- Splits dupe entry back out as independent commitment with original text
- Removes from canonical's source_meetings
- Logs UNMERGE action to dedup-decisions.log
- Surfaces "Unmerged 1 commitment" in winddown output

**AC8a (`[[unmerge]]` discoverability — v3 pre-mortem F3)**: chef's "Deduped today" section inlines the `[[unmerge: ...]]` directive next to every merge decision, ready for copy-paste edit. Format:
```
### Deduped today (5 merges)
- "Talk to Dave about staffing" — merged from meeting-B (jaccard 0.78, fast-tier SAME)
  → wrong? add `[[unmerge: 0b3609e9 ← 09e356d0]]` below to split next winddown
```
Plus first-week banner in winddown header (auto-removes after 7 days OR after first user [[unmerge]] use, whichever comes first): "Phase 10 dedup is active — merges in 'Deduped today' below; use `[[unmerge]]` directive to undo any wrong call."

**AC9 (soak observability — dedup-decisions.log)**: every dedup decision (MERGE / NEW / UNCERTAIN / UNMERGE) emits one log line to `dev/diary/dedup-decisions.log`. Format: `<ISO timestamp> <decision> <new-id> <canonical-id> <jaccard> <llm-tier> <llm-decision> <reasoning>`. Log write is best-effort (failure does not block command).

**AC10 (background dedup verb)**: `arete dedup --scope commitments --dry-run` produces report listing dedup candidates; `arete dedup --scope commitments --apply` writes; second `--apply` is no-op (idempotent). All scopes (commitments / decisions / learnings / topics) covered.

**AC10a (historical memory-file bloat — v2 eng N3)**: first `arete dedup --scope decisions --apply` (and similarly for `--scope learnings`) follows the same migration-diff pattern as commitment migration:
- Writes `decisions-dedup-diff-YYYY-MM-DD.md` (persisted audit artifact)
- 3-5 day dry-run window (manual; user runs `--dry-run` first)
- Subsequent `--apply` runs are incremental no-ops
- Same canonical-pick logic (oldest by entry date)
- Same atomic-write semantics

**AC11 (cost cap — v2 fast-tier)**: end-to-end day's LLM spend across all dedup operations stays under $0.50 (median) and $1.50 (heavy day). Cost reported in winddown summary AND in `arete meeting extract` output. **AC11a (PM v2 — explicit tier-promotion gate)**: if AC3a golden-set precision fails at fast tier and standard-tier promotion is proposed, builder MUST surface an interactive user-confirm prompt before flipping the tier flag. Format: "Fast tier precision X.YY (below threshold 0.85). Promote to standard? Estimated cost shifts from $0.50/$1.50 median/heavy to $1.50/$5 median/heavy. [y/N]". No silent tier flips.

**AC12 (Phase 8 reconciler interaction — eng C6)**: Phase 8 R4 reconciler uses `stakeholders[]` set-overlap correctly with `recurring_meetings.attendees`. Unit test: commitment with `stakeholders: [{slug: "lindsay"}, {slug: "anthony"}]` and recurring meeting attendees `[lindsay, jamie]` → set-overlap = 1 (lindsay) → R4 applies. Same commitment with attendees `[jamie, greg]` → set-overlap = 0 → R4 does NOT apply.

**AC13 (quality bar — manual, 14-day soak)**: John reports:
- No silently-dropped commitments
- No false-positive merges that cost a real distinct action (or, if any, ≤1 per week and recoverable via [[unmerge]])
- Dedup feels right ≥85% of the time (subjective)
- Per-meeting UI workflow not significantly slowed by dedup pass (≤5s extra per extract)

---

## Tests (v2)

Beyond per-step unit + integration tests:

- **Threshold sweep** (AC3, AC3a): synthetic dupe pairs at Jaccard 0.3 / 0.5 / 0.6 / 0.7 / 0.85 / 0.95 — measure P/R of dedup pipeline at fast tier; promote to standard if fast fails precision ≥0.85, recall ≥0.80.
- **Golden-pair set**: 30 hand-labeled (SAME / DIFFERENT / UNCERTAIN) pairs drawn from arete-reserv real commitment text variations. Used to validate AC3a and prevent LLM regressions. Cache LLM responses for determinism (eng test-strategy gap fix).
- **Migration fixture**: snapshot of arete-reserv commitments.json (~600 entries including 155 owner-as-personSlug) → run migration → diff report → assert no data loss, all source_meetings preserved, owner-as-personSlug rewrites correctly per AC1a/AC1b.
- **Owner-as-personSlug parser unit tests** (eng C2 — explicit fixture coverage):
  - Arrow notation: `@john-koht → @dave-wiedenheft: ...` → counterparty=dave, role=recipient
  - Arrow inbound: `@john-koht ← @lindsay-gray: ...` → counterparty=lindsay, role=sender
  - Natural language: `... send to Lindsay ...` → counterparty=lindsay (resolved via people directory)
  - Self-reminder: `... note to self ...` with no slugs → direction='self', stakeholders=[{owner,self}]
  - Ambiguous: text mentions Dave but no @slug and no person directory match → marked ambiguous in diff report
- **Concurrency test** (eng test-strategy gap fix — atomicity): two concurrent `arete meeting extract` runs against different meeting files writing to commitments.json → assert no corruption, no lost writes. Use storage adapter's atomic-write pattern.
- **Threshold-drift soak telemetry**: dedup-decisions.log accumulates → weekly-winddown emits aggregate P/R metrics if AC10b golden-pair sample re-evaluated.

**Phase 8 reconciler regression** (AC12 — eng C6): existing Phase 8 unit tests pass after R4 rewrite from slug-equality to set-overlap. Add 5 new test cases for stakeholders[] set-overlap behavior (zero overlap, partial overlap, full overlap, with/without recurring meeting match).

---

## Risks (v2 — updated)

- **R1 — Migration data loss**: a bug in the grouping logic could merge two genuinely-distinct commitments. Mitigation: dry-run + persisted diff report + user confirms; reversible `arete commitments restore` verb (10a-pre); pre-migration snapshot retained at `.arete/commitments.pre-phase-10.json`.
- **R2 — Owner-as-personSlug parser misses**: text uses non-standard arrow or natural language that parser doesn't catch → counterparty buried, stakeholder=owner. Mitigation: dry-run flags ambiguous rows for user review; user can manually fix in `migration-diff.md` before --apply; parser has explicit test coverage for known patterns.
- **R3 — Over-aggressive semantic merge**: LLM cross-check at fast tier returns SAME for distinct actions. Mitigation: hybrid pre-filter (Jaccard + slug-overlap + direction match) keeps candidates tight; UNCERTAIN flagged for user review (not auto-merged); `[[unmerge]]` directive provides recovery path; AC3a gates tier choice on golden-set precision.
- **R4 — Cost overrun**: a 10-meeting day with many staged items + many open commitments. Mitigation: fast-tier baseline keeps median at ~$0.50/day; hard ceiling at $1.50 (fast) / $5 (standard if promoted) with interactive confirm above; cost report in winddown summary.
- **R5 — Threshold mis-tune blocks soak**: ship with conservative threshold (Jaccard ≥0.6 + LLM SAME with reasoning); iterate per-soak feedback. Q4 deferred — initial ship is same-day only, lower exposure.
- **R6 — Extractor produces inconsistent text on different runs**: This IS the case that motivated semantic-dedup layer in the first place. Text-hash is fast path; semantic layer is the catch. R6 is the bet AC3 tests.
- **R7 — Stakeholder cardinality bloat**: cap displayed stakeholders to 5 in surface; "...+3 more" pattern. Data model holds unlimited. Eviction policy: never drop, just truncate display.
- **R8 — Phase 8 reconciler interaction**: addressed in 10a-pre (R4 rewrite to set-overlap). Test coverage in AC12.
- **R9 — Soak entropy compounding with Phase 9**: Phase 9 still soaking. Phase 10 changes commitment shape. Mitigation: Phase 9 doesn't write commitments; it reads. Phase 10 migration runs INSIDE feature flag — Phase 9 soak signals continue to be observable against pre-migration data until 10a --apply.
- **R10 — User reads stale dedup-decisions.log and acts on outdated decision** (NEW v2): log is append-only, decisions accumulate. Mitigation v2 (eng N5 fuller): `arete dedup --explain` reads current state from commitments.json, not from log; log is observability, not source of truth. **Each log entry now includes the commitment hash AT-DECISION-TIME** so soak review can: (a) grep the log for patterns, (b) take a canonical ID, (c) run `arete dedup --explain <id>` for the current truth. Log format updated: `<ISO> <decision> <new-id> <canonical-id> <hash-at-decision> <jaccard> <llm-tier> <llm-decision> <reasoning>`.

- **R12 — Concurrent extract corrupts commitments.json** (NEW v2 — eng N2): two `arete meeting extract` invocations both read commitments.json, both compute different deltas, last-writer-wins silently loses one. Mitigation: **`proper-lockfile` npm dep** (adopted in 10a-pre) — `CommitmentsService.save()` acquires an exclusive file lock before read-modify-write; releases on completion. Stale-lock TTL = 30s with PID check. Cross-process safe. Add to dependencies in 10a-pre alongside `createdAt` field + restore verb work.
- **R11 — Per-meeting extract slowdown**: dedup pass adds Jaccard scan + (potentially) LLM call. For very large workspaces, could add seconds per extract. Mitigation: hybrid pre-filter bounds candidate set; cache LLM responses across pairs; AC13 includes "≤5s extra per extract" gate.

---

## Open questions for review (v2 — updates)

- **Q1 [v2 RESOLVED]**: LLM tier = `fast` initial, with golden-set gate (AC3a) to promote to `standard` only if precision/recall fails. Eng counter-rec accepted.
- **Q2 [v2 DEFERRED]**: External-source resolution chef-confirmation flow → deferred to Phase 11 with the feature itself.
- **Q3 [v2 RESOLVED]**: `textVariants[]` cap = 5 per PM rec (not 10 from v1). Drop oldest on overflow.
- **Q4 [v2 RESOLVED]**: Same-day window on initial ship. Cross-day extension after soak shows reactive precision/recall stable.
- **Q5 [v2 RESOLVED]**: Canonical = oldest by `date` field (eng-confirmed createdAt was missing in v1; `date` is the real anchor; after 10a-pre, future entries also have createdAt for tie-breaking).
- **Q6 [v2 RESOLVED]**: Background `arete dedup` verb is manual-only in v2. Cron deferred per PM rec.

**New v2 question (open, for build-time)**:

- **Q7**: When `[[unmerge]]` directive splits a dupe out, should the dupe text default to the ORIGINAL extracted text (preserving the wording from the source meeting that was deduped), or to the canonical's text? **Recommendation**: original extracted text — preserves provenance integrity and avoids user confusion ("but I said it this way in that meeting").

---

## What this phase explicitly bets (v2)

1. **Data model (a) is right.** Commitment = (action + direction). If user surfaces cases where per-stakeholder granularity actually mattered for tracking distinct obligations, back off to data model (b) — but the 600-row sample from arete-reserv strongly suggests (a) is the model.
2. **Hybrid pre-filter + fast-tier LLM beats either alone.** If golden-pair precision/recall fails at fast tier (AC3a), promote to standard — cost ceiling shifts but architecture holds.
3. **Per-meeting approval UI continues to work** (PM G5 rec — unified approval surface deferred to Phase 11). If 14-day soak shows per-meeting + badges remains his preferred flow, Phase 11 unified-approval may never ship. If soak shows the dupe badges aren't actually saving review time, Phase 11 unified-approval becomes the natural next step.
4. **Same-day window is enough for initial ship** (Q4). If soak shows dupes voiced across multiple days are leaking through (e.g., "talk to Dave" said Monday but again Wednesday → both end up as separate commitments), extend window in a Phase 10 followup before declaring done.

These bets are the things to watch in 14-day soak. If they hold, Phase 10 is the dedup foundation for Phase 11's external-source resolution + unified approval work.

---

## Soak observability + rollback (v2)

**Daily during 14-day Phase 10 soak:**

1. **Dedup-decisions log** — `wc -l dev/diary/dedup-decisions.log` + tail to spot-check. Trigger: > 5 UNMERGE actions in a week = semantic dedup misfiring too often.
2. **Migration audit** — `migration-diff.md` persisted. If user spots a merge they disagree with: `[[unmerge]]` it. If high rate (≥3/week), revisit hybrid threshold.
3. **Per-meeting extract latency** — log extract time before/after Phase 10. AC13 gate: ≤5s extra. If exceeds, profile hybrid pipeline.
4. **Phase 8 R4 regression** — Phase 8's existing AC11 (winddown wall-time hard stop at 45m) should be unaffected. If wall-time drifts > 60s, attribute to R4 rewrite and inspect.
5. **Decisions/learnings file growth** — `wc -l .arete/memory/items/decisions.md` weekly. With AC5 in place, growth rate should be ~50% of pre-Phase-10 (dupes prevented). **Important caveat (PM v2)**: 50% is a *soft* indicator, not a strict pass/fail gate. Growth-rate can vary for unrelated reasons (busier week, different meeting mix, new project starting). If 50% target misses BUT decisions are visibly cleaner in spot-checks, that's still a pass. The real signal: open `decisions.md` in a 7-day window and check whether the same decision is recorded ≥2 times — count should be ≤2/week post-Phase-10.

**Rollback triggers:**

- **R1/R2 (migration data loss or parser misses) discovered post-apply**: `arete commitments restore --from .arete/commitments.pre-phase-10.json`. Re-run migration with parser fix.
- **R3 (semantic merge eats real distinct action)**: `[[unmerge]]` immediate; if recurring >1/week, lower fast-tier confidence → promote to standard tier OR raise Jaccard threshold to 0.7.
- **R11 (extract slowdown)**: feature flag flip — disable cross-meeting dedup pass on extract, fall back to per-meeting-only. Background `arete dedup` verb catches up later.

**Soak-success criteria (declare Phase 10 done at +14d):**

- AC13 manual: dedup feels right ≥85%, no silently-dropped commitments, ≤1 false-positive merge/week recoverable via `[[unmerge]]`.
- Decisions.md growth rate ~50% of pre-Phase-10 (validates AC5).
- Per-meeting extract latency ≤5s extra (AC13).
- ≥1 `[[unmerge]]` actually used by user (validates AC8 recovery path actually works).
- Cost stays under $1.50/day median (AC11).

---

## References

- 2026-06-03 alignment conversation with John (transcript in this session)
- v1 reviews: `review-pm.md`, `review-eng.md` — drove v2 scope trim + factual fixes
- Phase 9 plan v3 (brief primitive — substrate for context assembly)
- Phase 8 followup-6 mirror-pair dedup (within-meeting dedup; Phase 10 extends to cross-meeting)
- Phase 8 followup-7 Rule 4 reconciler (Phase 10 rewrites slug-equality → set-overlap per eng C6)
- `packages/core/src/services/commitments.ts` — current commitment service; `computeCommitmentHash` at line 200; `addCommitment` etc.
- `packages/core/src/models/entities.ts:221-249` — current Commitment type (no `createdAt`; eng C1)
- `packages/core/src/integrations/staged-items.ts` — current per-meeting approval flow; `appendToMemoryFile` at line 677 (no dedup; AC5 fixes)
- `packages/runtime/skills/daily-winddown/SKILL.md:540-608` — Phase 8 R4 reconciler logic (rewritten in 10a-pre)
- `/Users/john/code/arete-reserv/.arete/commitments.json` — real-data shape, owner-as-personSlug pattern
