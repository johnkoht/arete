---
title: "Phase 7a — Cross-skill foundations (additive substrate)"
slug: phase-7a-cross-skill-foundations
created: "2026-05-29"
revised: "2026-05-29 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
---

## Revisions from review-1 (eng-lead, 2026-05-29)

Independent review-1 surfaced 5 concerns (2 high). Substantive revisions:

- **AC5 expanded** — eng-lead confirmed: today only `email` is populated in person frontmatter across all `~/code/arete-reserv/people/internal/*.md` (no `slack_handle`, `slack_user_id`, `alt_emails`). AC5 now (a) introduces documented schema conventions for these fields (no enforcement; convention only), (b) ships `arete people audit-channels --json` helper that surfaces what's populated workspace-wide, (c) ships `--channels` flag that returns whatever IS populated. Phase 8 then has the audit data to know what backfill is needed before reconciler can match counterparties across sources.
- **AC1 lowered to "best-effort prose contract"** — reviewer correctly noted there's no enforcement for the `[gather-only]` handshake. Adding env-var or code-level gates is mismatched with the chef pattern (which fundamentally relies on LLM following prose contracts). Plan now documents the limitation explicitly and notes Phase 8's design must account for it.
- **AC4 renamed `arete area` → `arete areas`** (plural matches `arete people`) AND ships `arete areas list` alongside `arete areas epics`. Avoids single-subcommand namespace squatting.
- **AC6 semantic pinned down** — "events on calendar regardless of who created them, in next-N-days window" is the actual reconciler need (per spec example `ai_004`). Verify against existing `arete pull calendar --days N` semantics.
- **Substitution-argument sunset trigger made concrete** — calendar date (2026-07-15: ~7 weeks from 7a ship) instead of vague "1 month."
- **MC4 ordering** — AC2 and AC3 are separate commits, each with its own test.
- **New risks added** in skeptical view: person frontmatter sparseness, calendar ACL semantics.

# Phase 7a — Cross-skill foundations (additive substrate)

## Why this exists

Parent plan's 2026-05-28 reframe split Phase 7 into 7a (additive substrate) + 7b (validation-then-deletion sweep of Phase 5 absorbed removes). This is 7a — pure additions that Phase 8's loop reconciler will consume. Per the parent plan's sequencing rule, 7a → 7b → Phase 8 with minimal buffer.

**One-line goal**: the substrate Phase 8 reconciler needs — documented gather-only sub-mode for chef skills, a jira watchlist that lives where multiple skills can read it, and a cross-source identity helper — exists and is consumable, with no behavior change for the user yet.

## Critical scoping insight (informs ACs)

Initial parent-plan framing called for "gather-only CLI verbs" (e.g., `arete slack-digest extract --json`). Code-side investigation reveals slack-digest + email-triage are **pure SKILL.md prose** — no backing TypeScript extractor service. There is no extraction code to wrap into a CLI verb.

Two ways forward:
- **(A) Move extraction prompts into code.** Heavy refactor; conflicts with Principle 1 ("CLI primitives = literal extraction, minimal LLM judgment") because the extraction here IS LLM judgment.
- **(B) Gather-only mode = a documented SKILL.md sub-mode** the agent can invoke. The skill's GATHER stages return structured output without engaging. The orchestrating chef agent composes by invoking the sub-skill in gather-only mode.

**Decision: (B)**. Aligns with v2 principles (CLI stays minimal-judgment; LLM extraction stays in agent context). PATTERNS.md gets the new pattern; individual SKILL.md files document their gather-only entry point and JSON output shape.

What this means for 7a scope:
- The "gather-only CLI verb" deliverable from the parent plan becomes **PATTERNS.md doc + per-skill SKILL.md mode**, not new CLI code, for slack-digest/email-triage.
- For meeting + calendar + (later) jira, real CLI verbs already exist (`arete meeting extract`, `arete pull calendar`, etc.). 7a verifies they expose what Phase 8 needs (JSON, time-window flags) and gap-fills where missing.

## Scope (acceptance criteria)

### AC1 — PATTERNS.md gains a "gather-only composition" sub-mode (GATE)

`packages/runtime/skills/PATTERNS.md` adds a new section, parallel to the four existing chef-orchestrator patterns:

**5. `gather-only composition`** — a chef-pattern skill exposes a documented sub-mode where it runs Steps 1-N (gather, extract, judge) AND returns structured output WITHOUT proceeding to the engage step. An orchestrating skill (Phase 8 daily-winddown) invokes the sub-skill in gather-only mode, collects output, composes with other sources, and engages the user once.

Required documentation:
- When to offer gather-only (a skill that another orchestrator will reasonably compose)
- JSON output shape conventions (an array of "loops" with source, counterparty slug, timestamp, text, evidence-pointer fields)
- Invocation convention (a documented agent-level instruction string, NOT a CLI flag — since chef skills are SKILL.md prose, not CLI commands)
- How orchestrators consume (e.g., "Invoke `slack-digest` in gather-only mode by including `[gather-only]` in your invocation prompt; the skill returns JSON instead of engaging the user")
- The contract: skill SHOULD NOT write to disk, propose actions, or engage user in gather-only mode — output goes back to the orchestrator only

**Explicit limitation (per review-1)**: this is a best-effort prose contract. There is no code-level gate. A sub-agent that violates the contract (writes to disk, proposes actions, engages user) is not blocked by the harness — it's only blocked by the agent following its SKILL.md instructions. Adding an enforcement layer (env-var, code gate) was considered and rejected: the chef pattern fundamentally relies on agents following prose contracts (Pattern 1 `do-all-work-then-engage` has the same shape), and adding code enforcement only for gather-only mode would be a mismatched layer.

**Implication for Phase 8 design**: orchestrator should validate sub-skill output structurally (is the response JSON? Does it match the loop shape?) and surface a warning if the sub-skill engaged the user instead of returning structured output. Side-effects (e.g., disk writes) are not detectable from the orchestrator and are accepted as risk.

### AC2 — slack-digest SKILL.md adds gather-only mode (GATE)

`packages/runtime/skills/slack-digest/SKILL.md` adds a "Gather-only mode" section documenting:
- The invocation contract (per PATTERNS.md AC1)
- The structured loop output shape this skill emits
- Which gather steps run in gather-only mode (all of Steps 1-2 — pull + significance_analyst) and which don't (Steps 3+ — engagement, action proposals, write-back)

### AC3 — email-triage SKILL.md adds gather-only mode (GATE)

Same as AC2 for `packages/runtime/skills/email-triage/SKILL.md`.

### AC4 — `jira_epics:` area frontmatter + `arete areas` command (GATE — renamed per review-1)

**Schema**: `areas/<slug>.md` frontmatter accepts an optional `jira_epics: [PLAT-11014, PLAT-10025, ...]` array. Missing field is treated as empty. Parser accepts and ignores when absent.

**Command**: new CLI command `arete areas` (plural, matches `arete people`):
- `arete areas list --json` → returns `{ areas: [{slug, name, status, ...}] }` — listing of all areas with summary fields
- `arete areas epics --active --json` → returns `{ areas: [{slug, name, status, epics: [...]}], union: [...] }` where `union` is the deduplicated union of `jira_epics` across `status: active` areas
- `arete areas epics --slug <slug> --json` → returns just that area's epics
- Non-JSON output is human-readable

**Two subcommands ship together (per review-1)**: avoids single-subcommand namespace squatting. `list` is cheap (existing `intelligence.ts` reads areas already; CLI just surfaces it). `epics` is the Phase 8 prerequisite.

### AC5 — `--channels` flag on `arete people show` + schema convention doc + audit helper (GATE — expanded per review-1)

**The core problem (verified during review-1)**: today only `email` is populated in person frontmatter across all `~/code/arete-reserv/people/internal/*.md`. There is NO `slack_handle`, `slack_user_id`, `alt_emails`, etc. on any person. Phase 8's reconciler needs these to match Slack messages → person counterparty. AC5 must address both surfaces (helper code + schema convention) to be useful.

**5a — Documented schema conventions** (no enforcement; convention only):

Add to `dev/conventions/person-frontmatter.md` (new file) the recognized channel-style fields:

```yaml
# Person frontmatter — channel fields (all optional)
email: alice@reserv.com        # primary email; already widely populated
alt_emails:                    # alternate / historical emails
  - alice@oldcompany.com
slack_user_id: U01ABC123       # canonical Slack ID; survives display-name changes
slack_handle: alice            # @-mention name; mutable
phone: "+1-555-0100"
```

Document that:
- Only `email` is consistently populated today
- New fields are user-maintained; no automated discovery in 7a
- Reconciler (Phase 8) consults whichever fields are present; missing fields just mean that channel-match-rule doesn't apply for that person
- A future phase may wire automated discovery via Slack MCP `slack_get_user_by_email` and similar

**5b — `arete people show --channels --json` flag**:

`packages/cli/src/commands/people.ts` `show` subcommand gains `--channels`:
- Returns `{slug, name, channels: {email?, alt_emails?, slack_user_id?, slack_handle?, phone?}}` — only populated fields appear
- Empty `channels: {}` valid when no channel fields populated
- Without `--channels`, default `show` output unchanged

**5c — `arete people audit-channels --json` helper**:

New subcommand `audit-channels` (or `channels-audit`):
- Walks all `people/{internal,users,customers}/*.md`
- For each, counts which channel fields are populated
- Returns workspace-wide health: `{ total: N, with_email: N, with_slack: N, with_alt_emails: N, with_phone: N, gaps: [{slug, missing: [slack_user_id, slack_handle]}] }`
- Non-JSON output: human-readable table + "X of Y people have slack identity; reconciler match-rate degraded for the rest"

**Phase 8 dependency**: Phase 8's reconciler should run `arete people audit-channels` at start of every winddown and surface the gap count in the curated view (when nontrivial) as a one-line nudge: "23 of 41 internal people missing slack_user_id; reconciler match-rate for slack→person is ~56%." This makes the gap visible without forcing immediate backfill.

**Note**: 5a is doc-only (no code enforces it). The convention exists so that when John (or someone else) wants to populate, the fields are named consistently and the helper reads them.

### AC6 — Calendar pull semantics for reconciler (STRETCH, defer-not-cut — revised per review-1)

Pin down Phase 8's actual reconciler need (the original AC6 framing of "created today" was a misread of the spec):

**Real reconciler need (per spec example `ai_004`)**: given an open commitment "meet with Nick & Anthony to review prototype," does a calendar event matching {attendees: nick + anthony, status: scheduled, start: today or future} exist? **The creation date of the event is irrelevant; what matters is whether the event EXISTS on the calendar (regardless of who organized it)**.

So Phase 8 needs:
- All events on the user's calendar in a forward window (e.g., next 30 days) — to match against future-intent commitments
- All events that already occurred in a recent backward window (e.g., last 1 day) — to detect "action moot — event passed" (spec skip rule 3)

**Verification step**: build sub-orch verifies `arete pull calendar`'s current behavior:
- Does `arete pull calendar --days 30` return all events on the calendar in the next 30 days, or only events organized BY the user?
- Does it include events the user is an attendee of?
- Does it include declined events? (Probably should — declined still counts as "user knew about this event")

**If existing flags suffice**: AC6 reduces to documentation in PATTERNS.md gather-only section noting the exact `arete pull calendar` invocation Phase 8 should use.

**If they don't suffice**: minimal flag additions to filter the calendar pull output as needed.

**Stretch defer-not-cut criteria**: build sub-orch documents the actual semantics in the build-report. If there's a meaningful gap, AC6 ships flag additions. If existing flags are good enough with explicit documentation of how to use them, AC6 ships doc-only.

### AC7 — Tests (GATE)

Per-file `tsx --test` (no `npm test` at root). Specifically:
- `area-parser.test.ts` extended: `jira_epics:` parsing — present, missing, malformed.
- New `areas.test.ts` (CLI command): `arete areas epics --active --json` + `--slug <s> --json` — empty workspace, no epics declared, single area with epics, multiple areas with overlapping epics (union dedup).
- `people.test.ts` extended: `--channels` flag — present with all fields, missing fields omitted, default output unchanged when flag absent.
- `chef-orchestrator-skills.test.ts` extended: assert PATTERNS.md contains a "gather-only" section + slack-digest/email-triage SKILL.md contain a "Gather-only mode" section (loose regex per the post-Phase-3.5-followup test conventions; not exact phrasing).

### AC8 — Discipline ledger (revised per review-1)

Per parent plan AC8: net delta ≤ 0 OR explicit substitution argument.

7a is **pure additions** (split intentionally to keep removal work in 7b). Honest accounting (post AC5 expansion):

| Item | LOC estimate |
|---|---|
| PATTERNS.md gather-only section | ~+70 markdown |
| slack-digest SKILL.md gather-only section | ~+30 markdown |
| email-triage SKILL.md gather-only section | ~+30 markdown |
| area-parser.ts: jira_epics field | ~+5 code |
| `arete areas` command (new file, list + epics) | ~+120 code |
| `--channels` flag on `arete people show` | ~+30 code |
| `arete people audit-channels` subcommand (AC5c) | ~+80 code |
| `dev/conventions/person-frontmatter.md` (AC5a) | ~+40 markdown |
| Tests | ~+200 code |
| **Net (code)** | **~+205** |
| **Net (markdown)** | **~+170** |

**Substitution argument**: 7a is load-bearing substrate for Phase 8's loop reconciler — without gather-only mode documented, area-level epic watchlist available, and cross-source identity surfaced, the reconciler has nothing to compose. The split into 7a/7b was made explicitly to scope removal work separately. 7b will run the validation-then-deletion sweep that brings cumulative back toward neutral. Cumulative across 7a + 7b expected: ~-50 to +100 LOC net, dominated by Phase 5 removes in 7b.

This substitution argument follows the Phase 2 pattern (skills-local + skill-resolver were load-bearing for chef pattern with safe rollback; ledger went positive at ship; subsequent phase brought it back). Reviewer accepted that argument on first /review at +8, then dropped to +2 after MC5 sunset shipped in Phase 3. Same shape here.

**Sunset trigger (concrete date per review-1)**: if Phase 8 has not merged to parent worktree by **2026-07-15** (~7 weeks from 7a ship target), substrate sunset rule applies — revert AC1/AC2/AC3 (gather-only sections) and keep only the standalone-useful pieces (AC4 areas, AC5 channels + audit). The standalone-useful pieces have secondary consumers (meeting-prep, week-plan, ad-hoc query) so they survive sunset.

### AC9 — AC10 / AC11 still hold

7a has zero user-facing behavior change. Daily-winddown median is unaffected (no chef changes; PATTERNS.md is doc; SKILL.md gather-only mode is dormant until Phase 8 invokes it). AC11 hard stop not at risk.

### AC10 — Rollback path

Each AC is independently revertable:
- AC1-AC3 (markdown): `git revert <commit>` restores prior SKILL.md / PATTERNS.md
- AC4 (jira_epics): parser tolerates missing field; reverting the parser change is safe even if user added the field to their workspace
- AC5 (--channels): backward-compat by design; revert removes the flag
- AC6 (calendar): if shipped as flags, revert; if shipped as doc-only, no-op revert

Per MC2 (post-MC5 sunset): `git revert` is the rollback shape. No `SKILL.legacy.md` needed.

## Skeptical view (per parent plan principle #9)

**The strongest case against shipping 7a:**

"This is a phase that ships and then the user can't tell anything changed. PATTERNS.md gets a section, two SKILL.md files get a section nobody invokes yet, `arete areas epics` returns empty results because no `jira_epics:` are declared, `arete people show --channels` returns mostly email-only because the schema fields are widely unpopulated. The work is real but the user-visible win is zero until Phase 8 ships AND user backfills person frontmatter. Phase 7a is the riskiest kind of phase — substrate without consumer AND substrate that depends on user backfill for usefulness — and historically those are the phases that get reverted (substrate sunset rule)."

**Counter**:
1. **Phase 8 is the named consumer**, scheduled to follow with no buffer. The substrate sunset rule applies to substrate that hasn't named a consumer; 7a's consumer is in the queue. Sunset trigger date: 2026-07-15.
2. **Splitting 7a/7b was a discipline choice** — keeping removal work separate prevents conflation of "did the additions break anything?" with "did the removals break anything?" during review.
3. **Each AC is independently useful even at zero-fill**:
   - `arete areas list` exposes data `intelligence.ts` already reads, but no current CLI surfaces it
   - `arete people audit-channels` is independently useful as a workspace-health probe even before Phase 8 reads it — surfaces the gap to the user, who can decide whether to backfill
   - `--channels` returns whatever IS populated (graceful degradation to email-only)
4. **The backfill UX is built into AC5c** — `audit-channels` makes the gap visible. Phase 8 surfaces it in winddown. User backfills if they want better matching. Not a hidden problem.
5. **The slack-digest / email-triage gather-only docs cost ~60 LOC of markdown**. Opportunity cost vs. shipping nothing is trivial.

**Risks added per review-1**:

- **Person frontmatter sparseness (R-new-1)**: today only `email` is populated for almost all people. `--channels` returns `{email}` for everyone; `audit-channels` surfaces this as a workspace-wide gap. Phase 8's reconciler match-rate for slack→person will be ~10% until backfill happens. Mitigation: AC5c audit surfaces visibility; Phase 8 design accommodates "name-string heuristic fallback" for unmatched cases. The substrate is correctly designed; the data isn't there yet.
- **`arete areas` namespace decision is locked in (R-new-2)**: shipping `arete areas list` + `arete areas epics` commits to a multi-subcommand future. Future area work (`focus`, `sync`, ad-hoc queries) must fit the `arete areas <verb>` shape. Mitigation: verbs are nouns ("epics", "list") not actions ("show-epics"), which leaves room for additions. Naming is intentionally generic.
- **Calendar ACL/permissions (R-new-3)**: `arete pull calendar` reads the user's own calendar. For spec example `ai_004` (event organized by someone else where user is attendee), `arete pull calendar` should return it — but verify in AC6. If it doesn't, Phase 8's reconciler skip rule 2 only works for user-organized events. Mitigation: AC6 explicitly verifies and documents in build-report.
- **Best-effort gather-only contract (R-new-4)**: per AC1's explicit limitation, a sub-agent could violate the contract (write to disk, engage user) and the orchestrator can't fully detect it. Mitigation: orchestrator validates output structure; surfaces a warning on contract violation; accepts side-effects as residual risk. Phase 8's design must not depend on the contract for correctness.

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch)**: AC1, AC2, AC3, AC4, AC5, AC7 are gates. AC6 is stretch with defer-not-cut criteria (ship doc-only if existing flags suffice).
- **MC2 (per-skill rollback)**: prose-only modifications to existing post-MC5 skills; `git revert` is the rollback shape. No `SKILL.legacy.md` needed.
- **MC3 (shadow validation)**: N/A — no new heuristic.
- **MC4 (PATTERNS.md ships first)**: applies here — AC1 (PATTERNS.md gather-only section) lands FIRST, then AC2/AC3 reference it.
- **MC5 (legacy interaction)**: N/A — no legacy code touched.

## Build orchestration

Sub-orchestrator runs in a manually-created sub-worktree off the parent branch (per Phase 3 lesson: `Agent` tool's `isolation: "worktree"` doesn't reliably land on the parent v2 branch). Pre-flight check in handoff brief.

Branch name: `worktree-phase-7a-cross-skill-foundations`
Worktree path: `.claude/worktrees/phase-7a-cross-skill-foundations`

Per-task commits during build. Per-file `tsx --test` (NO `npm test` at root). Dist rebuild before final commit.

Steps (in order, revised per review-1 MC4 ordering):
1. **Pre-flight**: verify base + parent reframe commit `f3649c4e` reachable. Halt if base wrong.
2. **AC1 build** — PATTERNS.md gather-only section. Test: `chef-orchestrator-skills.test.ts` assertion verifies the new section exists. Commit `phase-7a(runtime): PATTERNS.md gather-only composition (AC1)`.
3. **AC2 build (SEPARATE from AC3 per review-1)** — slack-digest SKILL.md gather-only section. Test: assert SKILL.md cites the PATTERNS.md anchor exactly. Commit `phase-7a(runtime): slack-digest gather-only mode (AC2)`.
4. **AC3 build (SEPARATE from AC2 per review-1)** — email-triage SKILL.md gather-only section. Test: same shape as AC2. Commit `phase-7a(runtime): email-triage gather-only mode (AC3)`.
5. **AC4 build** — `jira_epics:` parser + `arete areas` command (`list` + `epics` subcommands) + tests. Two commits OK (parser, CLI command). Commit `phase-7a(core): jira_epics area frontmatter (AC4)` + `phase-7a(cli): arete areas list/epics commands (AC4)`.
6. **AC5 build** — three sub-deliverables, separate commits OK:
   - 5a: `dev/conventions/person-frontmatter.md` doc. Commit.
   - 5b: `--channels` flag on `arete people show`. Commit.
   - 5c: `arete people audit-channels` subcommand. Commit.
7. **AC6 build** — verify calendar pull semantics; document in PATTERNS.md gather-only section. Add flags only if needed (stretch). Commit.
8. **AC7 full test sweep** — per-file `tsx --test` for all modified test files. Document counts.
9. **Rebuild dist**. Commit `phase-7a(dist): rebuild after AC1-AC6`.
10. **Write build-report.md** — include AC6 verification finding (what calendar pull actually returns) + AC5 channel-population workspace-wide audit run on arete-reserv as evidence. Commit.

Eng-lead review at the end. Fix-up agent if concerns. Merge to parent worktree.

## Open questions / parking lot

- After 7a + 7b ship, the user runs `arete update` in arete-reserv to pick up. Phase 8 reconciler then becomes the canonical consumer.
- Jira pull integration is OUT of scope for 7a (no Jira MCP exists today; `jira_epics:` is just the watchlist for now). Phase 8 reconciler reads the watchlist and prompts user for current state, OR Phase 7c future work wires a Jira MCP / integration.
- `arete areas` ships with `list` + `epics` subcommands in 7a (renamed `arete area` → plural `arete areas` per review-1; both subcommands ship together to avoid single-subcommand namespace squatting). Other area-related queries (`show <slug>`, `focus`, `sync`, etc.) are future work if useful.
- If AC6's "calendar dual-query" requires flag additions, they ship in 7a. If existing `--today` + `--days N` cover the need, 7a ships doc-only and Phase 8 uses the existing flags.
