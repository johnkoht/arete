---
title: "Areté v2: chef-orchestrator architecture"
slug: arete-v2-chef-orchestrator
status: live (revised 2026-05-28 — cross-skill chef extension)
size: xlarge
tags: [v2, architecture, memory, chef-orchestrator, summaries, skills, simplification, cross-skill]
created: "2026-05-01"
updated: "2026-05-28 — cross-skill reframe per user spec; Phase 5 subsumed, Phase 7/8/9 added"
execution: meta-orchestrator (parent) + sub-orchestrators per phase
has_review: true
has_pre_mortem: true
has_prd: false
phases: 9 (Phase 0–4 shipped; 5 subsumed; 6 conditional; 7–8 new; 9 deferred)
review_verdict: APPROVE WITH MINOR CONCERNS (review-2 2026-05-01); 2026-05-28 cross-skill extension pending its own phase plans
inputs:
  - inputs/daily-winddown-unification-spec.md (user-supplied 2026-05-28; drives Phase 7/8 scope)
---

## 2026-05-28 reframe

User design spec (`inputs/daily-winddown-unification-spec.md`) reframes the chef-orchestrator pattern from "one chef per skill" to "one chef across skills." The day is a ledger of *loops* (intent/commitment/question/decision with source, counterparty, timestamp, state). Multiple sources (slack/email/calendar/jira/meetings/commitments) emit loops into one ledger; a reconciliation pass matches intents to fulfilling actions across sources and time before staging anything for user review.

This extends the original v2 thesis. Today's chef ("do all work then engage once") still stops at skill boundaries — slack-digest engages independently, email-triage engages independently, daily-winddown engages independently. Across-skill orchestration is the unfinished promise.

Concrete consequence on the phased rollout:

- **Phase 5 (`meeting extract` decomposition) is subsumed** into the new Phase 7. The decomposition spirit (literal extract + orchestrator-driven judgment) IS the gather-only pattern; rather than decomposing only `meeting extract`, Phase 7 documents gather-only mode as a chef pattern and adds CLI verbs for slack-digest + email-triage in the same shape.
- **Phase 6 (schema layer) consumer story sharpens.** The loop reconciler is a strong potential consumer of state.json. Phase 6 stays conditional, but the "what consumer needs this?" answer now has a real candidate.
- **New Phase 7 — Cross-skill foundations (Slice A).** Gather-only CLI verbs; `jira_epics:` area frontmatter + `arete area epics` helper; `arete people show --channels` helper; PATTERNS.md "gather-only composition" sub-mode. Pure additions composable by Phase 8 and beyond.
- **New Phase 8 — Loop reconciler (Slice B).** Rules 1-3 from the spec (intent→fulfillment, intent→scheduled event, action moot post-event). Daily-winddown becomes the canonical cross-skill orchestrator. "Closed today" narrative section.
- **Deferred Phase 9 — Item supersede across meetings (Slice C).** Rule 4 from the spec (learning/decision corrected/voided by later meeting). Heaviest judgment; needs Phase 7/8 to soak first.

# Areté v2: chef-orchestrator architecture

## TL;DR

Areté v2 inverts the current architecture: CLI/services do less, the chat agent does more. CLI primitives are extraction, fetch, store, and query. The chat agent uses wiki + memory + raw sources to apply judgment (importance, dedup-against-state, conflict-with-priorities, deferral suggestions). The user reviews exceptions and proposals, not flat firehoses. The architectural keystone is a typed schema layer (`events.jsonl` + `state.json`) that lets the agent leverage signals the system already captures but currently drops at the commit boundary.

This is a parent / strategy plan. Phase plans live under `phase-N-<slug>/` subdirectories and run their own `/ship` cycles via sub-orchestrators. The meta-orchestrator (this plan's owner) reviews each phase at the `/review` stage and merges phase work back into this worktree.

## Origin and motivation

Areté has evolved with ups and downs and feels overcomplicated to John (its builder and primary daily user). Specific pain:

- Daily winddown takes 30–45 min and produces overwhelming, redundant output.
- `week.md` bloats over the week.
- John doesn't know how parts of the system work — a strong signal that simplification, not addition, is the goal.
- Many subagents each running their own embedded LLM calls produce non-cohesive piles of commitments / action items / learnings / decisions.

Four research subagents ran on 2026-04-30 to ground the v2 conversation in data, not vibes. Findings are in the diary. Headlines: the "10 cooks" feeling has a specific source (post-approval topic integration runs N×M Sonnet calls importance-blind); a `grep importance|priority` across the post-commit pipeline returns zero hits (signals captured at extraction, dropped at commit); `meeting extract` smuggles 5 judgment calls into one CLI invocation; storage fan-out has one true duplicate (`frontmatter.approved_items`).

## Vision: chef-orchestrator (with cross-skill extension per 2026-05-28 reframe)

Today's pattern: subagents and CLI commands do extraction + judgment in opaque LLM calls. The orchestrator (chat agent) glues outputs together. The user reviews flat firehoses.

v2 pattern (Phases 0-4 + 3.5 shipped):
- **CLI primitives**: literal extraction (what was said, decided, committed to), fetch from sources, store to memory, query existing state. Minimal LLM judgment.
- **Chat agent (the chef)**: applies judgment with full context — priorities, recent dismissal patterns, importance scores, conflicts with stated focus. Stages a curated set of items per source.
- **User**: reviews exceptions and proposals, not firehoses. Could-include / pruning candidates / deferred surfaces give visibility without burden.

v2 pattern extension (Phases 7-9 per 2026-05-28 reframe):
- **Gather-only chef pattern**: each chef skill exposes its extractor as a CLI verb (`arete <skill> extract --json`) returning structured loops without engaging the user. Standalone skill prose still works; calling the verb from another orchestrator composes them.
- **The day as a ledger of loops**: meetings + slack + email + calendar + jira + commitments emit loops (intent/commitment/question/decision with source, counterparty, timestamp, state) into one ledger.
- **Reconciliation pass before staging**: a chef agent matches intents to fulfilling actions across sources and time, collapsing closed loops into a "Closed today" trace. Survivors reach the user; nothing already resolved does.
- **One engagement per day, not per source**: daily-winddown becomes the cross-skill chef. Slack-digest/email-triage continue to work standalone; called from winddown they extract-only and feed the ledger.

## Principles

1. **Signals captured must be signals consulted.** Every importance/confidence/dismissal field that the system records must be readable by the post-commit pipeline. No more capture-then-drop.
2. **Adds pay for themselves with removes.** Every new substrate, primitive, or surface must name what it deletes. No "we'll clean up later."
3. **Simplicity is judged at the user view, not the code view.** The test is "does John understand how this works?", not LOC.
4. **Markdown remains source of truth.** Any typed/derived substrate is a cache; users edit markdown; the system regenerates derived views.
5. **MCPs over Areté primitives where one MCP cleanly covers the abstraction.** Calendar (multi-provider) earns a Core primitive; Slack-send (single-provider) does not. Recording-source abstractions (Krisp/Fathom) earn primitives; Notion stays as Core because no MCP equivalent exists in John's stack.
6. **Skills become user-extendable templates.** Workflow opinions (daily plan, winddown, slack digest, inbox triage, scheduling, PM artifacts) are user-tunable, not shipped as universal opinions.
7. **Substrate sunset rule (added post-review).** Every new substrate (events.jsonl, state.json, .agents/skills, etc.) ships with an explicit "fail to ship" criterion: if N consumers haven't migrated to it within the next 2 phases, the substrate is reverted, not extended.
8. **Baseline before architecture (added post-review).** No phase that touches code ships before AC10's baseline (median winddown time today) is measured. Otherwise the win condition is unfalsifiable.
9. **Skeptical-counterweight (added post-review).** Every phase plan includes an "if-I-were-skeptical" section listing the strongest case for *not* shipping that phase. Meta-orchestrator reads it back at /review. This is the structural antidote to the builder-also-being-the-user enthusiasm bias.

10. **Gather-only composition (added 2026-05-28).** Every chef skill exposes its extractor as a CLI verb returning structured output without engaging the user. The standalone skill calls the verb + engages; an orchestrator calls the same verb and composes. Single source of truth = the CLI verb logic. This is what makes cross-skill orchestration tractable without forking extraction logic.

## Phased rollout (revised twice — post-first-review + post-absorption-principle)

The current ordering reflects two rounds of revision: (1) post-independent-review structural changes (added Phase 0, pulled skills split forward, split Phase 3, deferred judgment substrate), and (2) the user's clarification that the chef-orchestrator pattern is primarily a skill-prose rewrite (not a substrate change), and that the wiki expansion deserves first-class billing aligned with the absorption principle (every primary ingest gets a summary; subsidiary inputs are absorbed by parent).

Phases run sequentially. Each phase is its own plan with its own `/ship` cycle (pre-mortem, build, review, wrap). Sub-orchestrator owns the phase; meta-orchestrator reviews at `/review`.

### Phase 0 — Instrument + baseline (`phase-0-instrument-baseline/`)

**Why first (added post-review)**: AC10 (median winddown ≤15 min) is the only AC that measures the actual thesis. Without a baseline it's unfalsifiable, and AC10 is the gating AC by which v2 will be judged. Phase 0 is also a small, low-risk first ship that proves the meta-orchestrator + sub-orchestrator pattern works before committing to bigger phases.

**Scope**:
- Winddown timing log — append a timestamped entry every time `daily-winddown` skill is invoked and again when the user marks it complete. Bash hook in skill prose; no code changes required to Areté.
- Cost telemetry already exists in `memory/log.md`; add a weekly aggregator (`arete cost report --since 7d`) so the trend is visible.
- Item-fate log — when a staged item becomes approved / dismissed / skipped, append a typed event to a simple `.arete/memory/item-fates.jsonl` (this is the smallest possible precursor to Phase 2 schema layer; only the item-fate event type, no full event store yet).
- Run for 14 days. Daily winddown median + p90 establishes baseline. Item-fate distribution establishes "what does today's pipeline actually produce" baseline.

**Removes**: nothing (pure add). **Justification for not failing the discipline rule**: Phase 0 is not architecture; it's measurement. The discipline rule applies to substrate and surface area. Phase 0's "add" is a 14-day data file, deleted at end of phase if no later phase consumes it.

**Skeptical view (required per Principle 9)**: "We're spending 14 days on data collection when we could be shipping the obvious cuts. The user already knows winddown is too long; we don't need a number to confirm it." **Counter**: the cuts are ambiguous on whether they actually move the lived-experience metric. Without baseline we can declare AC10 met based on a quiet week, then have it regress in busy weeks.

**Rollback**: trivial — delete the log files; no code changes to revert.

### Phase 1 — Wiki expansion (`phase-1-wiki-expansion/`)

**Why second**: the chef (Phase 2) reads the wiki to make judgments. Without strong wiki — complete summaries layer, entity pages for orgs, cross-refs — chef judgment is shallow. Phase 1 brings the wiki to the full Karpathy shape (raw → wiki of summaries+entities+concepts → schema) so Phase 2 has substrate to reason against.

**Scope organized around the absorption principle.** A source gets a summary page when it represents a primary unit of knowledge ingested into the workspace. Subsidiary inputs (Notion notes pulled as meeting context, agenda files, etc.) are absorbed into the parent's summary, not summarized separately. This is more nuanced than Karpathy's "every source = summary" because Areté has merge-flows where ingests combine into one knowledge unit.

**(a) Summary writers, per-primary-ingest:**

| Source flow | Primary or subsidiary | Summary in Phase 1 |
|---|---|---|
| Meeting (Krisp/Fathom) | Primary | Always — post-call-email quality |
| Notion / agenda / pre-reads pulled as meeting context | Subsidiary | None — absorbed by meeting summary |
| Inbox document (Notion, web, manually-added) | Primary | Always — source-agnostic summary writer |
| Slack thread — substantial | Primary | Conditional — heuristic-gated |
| Slack chatter touching a topic | Subsidiary — wiki updates only | None (today's slack-digest behavior; preserved) |
| Conversation export | Primary but not in active use | Skip / defer |
| Manual notes (long-form) | Primary | Yes when substantial; reuse inbox-doc writer |

Default slack-thread "substantial" heuristic: `messages ≥ 10` OR `≥ 1 detected decision/commitment` OR `participants ≥ 3` OR user-flagged. Tunable per-user via `.agents/skills` once Phase 3 ships.

Files written to `.arete/memory/summaries/<source-type>/<slug>.md` with frontmatter `{source_path, source_type, date, area, importance, topics[], participants[]}` and body sections (what happened / what was decided / what's next / open questions / FYI / things mentioned but not actioned). Sonnet-tier prompt; cost paid once at ingest, not per-consumer-read.

**(b) Entity pages for orgs/customers** — `.arete/memory/entities/orgs/<slug>.md` for accounts/vendors (Cover Whale, LEAP, Foxen, Snapsheet). Today these only exist as topic slugs and prose strings. Promoting to first-class entity pages gives the chef a place to look up "what's the state of <org> right now?" Same auto-section pattern as people pages. People pages stay where they are (`workspace/people/`); orgs go under `.arete/memory/entities/orgs/` for now (single-namespace migration deferred to a later plan if needed).

**(c) Topic-page integration reads summaries, not transcripts** — current N×M topic integration prompt receives the full meeting transcript. Switching to the summary as input dramatically reduces input tokens (summary << transcript) and improves synthesis quality (curated input > raw signal). Cost reduction is a side effect; primary win is quality.

**(d) Wikilinks across all wiki types** — wikilinks (`[[slug]]`) work in topic pages today. Extend to summaries (links to topics + entities + people) and entity pages (links to topics + people + summaries that mention them). The chef navigates the wiki via wikilinks at retrieval time.

**(e) Wiki health/lint** — extend existing `arete topic lint` to a `arete wiki lint` covering stub pages, orphan refs, near-duplicates across summaries/topics/entities.

**Removes**:
- `## Could include` body block on meeting files (content moves to summary "FYI" section).
- Transcript-reading path in topic integration (replaced by summary-reading).
- Org names as ad-hoc topic slugs where an entity page is the right home (topic slugs become actual concepts again).
- Per-thread slack summaries for non-substantial threads (preserved as today's wiki-update-only path; explicitly *not* generated in v2 either, removing any future creep).

**Skeptical view**: "Phase 1 just got 3× bigger than 'summaries promotion.' That's the precise scope-creep failure mode. Could ship summaries-only and add (b)/(d)/(e) iteratively." **Counter**: the chef (Phase 2) needs all five to make the dream concrete. Shipping summaries alone forces a half-rewrite of Phase 2 once entity pages and wikilinks land later. Better to ship the wiki layer complete. Mitigation per MC1: (a)–(c) are gates and non-negotiable; (d) wikilinks and (e) lint are stretch.

**Gate-vs-stretch criteria (MC1)**:
- **(a) Summary writers, (b) entity pages for orgs, (c) topic-page integration reads summaries** — gates. Phase 1 does not ship without all three.
- **(d) Wikilinks across all wiki types, (e) Wiki health/lint** — stretch. Defer (don't cut) if Phase 1 build runs >18 days. Defer-not-cut criteria: (d) and (e) move to a follow-on plan named `phase-1-extension-wikilinks-lint` if at day 18 of build either has not landed. They are not removed from v2 scope; they're sequenced after Phase 2 chef ships, so the chef's wiki-navigation needs are observed in practice before they're built.

**Slack-substantial heuristic shadow-run (MC3)**:

The slack heuristic for "substantial enough to summarize" is unprincipled until validated against real threads. Phase 1 plan must include a 7-day shadow-run period BEFORE the slack-thread summary writer goes live:

1. Implement the heuristic (`messages ≥ 10` OR decision detected OR `participants ≥ 3` OR user-flagged) as a logging-only pass.
2. For 7 days, the heuristic runs against every slack-digest ingest and logs to `.arete/memory/log.md` which threads it WOULD summarize, with the trigger reason. **No summary file is written.**
3. John spot-checks the log daily — flagging false negatives (substantial threads the heuristic missed) and false positives (chatter the heuristic flagged).
4. Heuristic is tuned based on shadow-run data.
5. After ≥80% accuracy on John's spot checks, the writer goes live.

This adds 7 days to Phase 1's wall-clock but no new build work. Defends against silent under-summarization (substantial-but-quiet 2-person threads with one decision) and over-summarization (8-message brainstorms with 4 participants where the brainstorm was just "what should we order for lunch").

**Rollback**: layered, since sub-deliverables are independent.
- (a) Disable summary writers via config flag; meeting files unchanged in primary content.
- (b) Entity pages live alongside topic pages; deletion is a `rm -rf .arete/memory/entities/orgs/`.
- (c) Topic integration falls back to transcript-reading via config flag (kept in place during soak).
- (d) Wikilinks are markdown text; no migration to revert.
- (e) Lint is a CLI command; harmless to delete.

### Phase 2 — Chef-orchestrator behavior rewrite (`phase-2-chef-orchestrator-rewrite/`)

**Why third**: this is where the user's lived-experience dream lands. Today's skills engage the user step-by-step: run CLI X, present output, get approval, run CLI Y, present output, get approval. The chef-orchestrator pattern flips that — the agent does all the work upfront, applies judgment using the wiki + memory + commitments queries, and engages the user once at the end with a curated, reasoning-labeled view plus optional MCP-backed action proposals. This is mostly skill-prose orchestration, not new substrate.

**Skills rewritten in Phase 2**:
- `daily-winddown`
- `weekly-winddown`
- `week-plan`
- `process-meetings`
- `meeting-prep`

**Four reusable patterns documented in `packages/runtime/skills/PATTERNS.md` and applied to all five skills**:
1. **`do-all-work-then-engage`** — the agent runs all primitive calls, gathers outputs, applies judgment BEFORE engaging the user.
2. **`curate-with-reason-labels`** — every staged item carries a "why this surfaced" tag; every deferred item carries a "why this was deferred" tag.
3. **`propose-with-mcp-action`** — when a committed action maps to an MCP-backable verb (Slack DM, calendar create, Jira create), the agent proposes the action with specific parameters and awaits user approval before executing. **Conservative**: agent never auto-executes, even for "simple" actions.
4. **`surface-deferred-as-sidecar`** — auto-deferred items roll up to a count + a sidecar file (e.g., `deferred-2026-05-15.md`), not the primary view. User can spot-check; pulled-back items become a `deferral_disagreement` event in the item-fates log (Phase 0 substrate).

**Substrate touches (read-only or light writes; no new substrate)**:
- Importance gating: `meeting.frontmatter.importance != 'light'` is consulted at topic-integration time, area-memory ranking, and winddown surfacing. Read direct from frontmatter; no schema layer needed.
- Four-tier winddown surface: stage-for-approval / could-include (FYI, sourced from summaries' FYI sections) / pruning candidates / deferred (sidecar). Quotas per tier.
- `frontmatter.approved_items` removed (the third-copy duplicate). Web review UI reads body sections instead.

**Removes**:
- Step-by-step engagement gates inside skill prose (the largest cognitive remove for the user).
- Flat-firehose winddown output.
- `frontmatter.approved_items` (third-copy duplicate).
- Importance-blind topic integration (cost + bloat regression).

**Skeptical view**: "Rewriting five skills at once is the precise scope-bigger-than-it-looks failure mode. Two of them (process-meetings and meeting-prep) are the most-used and any subtle behavior regression will land on John during real meetings, not safe soak hours." **Counter**: the patterns are shared, so the rewrite is one-template-applied-five-times rather than five independent rewrites. AC11 (>45 min winddown = revert) is the hard stop. Mitigation: per-skill feature flag (`ARETE_LEGACY_SKILL_PROSE=daily-winddown,meeting-prep,...`) so John can flip back any subset if a rewrite degrades the experience mid-soak.

**PATTERNS.md ships first (MC4)**:

Before any of the five skills is rewritten, Phase 2 must ship `packages/runtime/skills/PATTERNS.md` updated with all four patterns fully specified:

1. `do-all-work-then-engage` — the agent runs all primitive calls, gathers outputs, applies judgment BEFORE engaging the user. Pattern doc includes: when to use, what counts as "all work," what to do when a primitive fails mid-gather (continue with partial state vs abort).
2. `curate-with-reason-labels` — every staged item carries a "why this surfaced" tag; every deferred item carries a "why this was deferred" tag. Pattern doc includes: standard reason taxonomy (importance match, dismissal pattern, conflict with priority, etc.), label format, where the label appears in surface output.
3. `propose-with-mcp-action` — when a committed action maps to an MCP-backable verb (Slack DM, calendar create, Jira create), the agent proposes the action with specific parameters and awaits user approval. Pattern doc includes: action verbs taxonomy, parameter shape per verb, propose-message format, never-auto-execute rule. **This is where divergence is most likely** — Slack DM, calendar create, and Jira create have different verb shapes; PATTERNS.md must specify a unified propose envelope so each skill doesn't reinvent it.
4. `surface-deferred-as-sidecar` — auto-deferred items roll up to a count + a sidecar file. Pattern doc includes: sidecar file naming convention, what data the sidecar carries, how the user pulls items back, how pulled-back items become `deferral_disagreement` events in the item-fates log.

PATTERNS.md gets its own /review pass before any skill rewrite ships. If the patterns prove inadequate during the first skill rewrite, the patterns are revised first and downstream skills inherit the revision — avoiding incompatible per-skill drift.

**Per-skill legacy preservation as ship gates (MC2)**:

Each of the five rewritten skills must ship with two artifacts that act as **ship gates** (build does not merge until both are in place):

1. **`<skill>/SKILL.legacy.md`** — verbatim copy of the pre-rewrite prose, committed in the same PR as the rewrite. Not just "git history has it" — the file exists on disk, named explicitly, agent harness knows to consult it when the legacy flag is set.
2. **Per-skill flag check** — agent harness reads `ARETE_LEGACY_SKILL_PROSE` env var (comma-separated skill names) and routes to `SKILL.legacy.md` for each named skill. Per-skill, not global; John can run new daily-winddown but legacy meeting-prep if the latter regresses.

These are not rollback prose — they are gates. Phase 2 PR review checks for both artifacts; if missing, the skill rewrite does not merge.

**Legacy × Phase 3 directory split — four-way merge (MC5)**:

Phase 2 introduces `SKILL.legacy.md` alongside `SKILL.md`. Phase 3 introduces `.arete/skills/<name>/` (managed) + `.agents/skills/<name>/` (user) with override semantics. Combined, that's potentially four artifacts per skill: legacy + new shipped + user fork + IDE adapter rendering. Without explicit handling, Phase 3's `arete skill diff/merge` could break against the legacy artifact.

Phase 2 plan must pick one of the following resolutions and document it:
- **(a) Sunset legacy before Phase 3 ships.** Once Phase 2 soak completes successfully, all `SKILL.legacy.md` files are deleted and the env-var flag is removed. Phase 3 then operates on a clean two-artifact world (managed + user). **Preferred** — simpler. Downside: post-soak regressions discovered after legacy is removed have no escape hatch.
- **(b) Phase 3 `skill diff/merge` knows about legacy.** Implementation work in Phase 3, but legacy survives indefinitely as a recovery option.

**Rollback**: per-skill via flag. Old skill prose preserved during the phase as `SKILL.legacy.md`; flag flip restores the old behavior without revert. Legacy artifact disposition follows MC5 resolution above.

### Phase 3 — Skills directory split (`phase-3-skills-split/`)

**Why fourth**: now that skill prose is right (Phase 2), preserve customizations across upstream updates. Without the split, John's edits to `daily-winddown` would be overwritten on the next `arete update`. With it, edits are owned by `.agents/skills/` and protected.

**Scope**:
- `.arete/skills/` (shipped, managed, refreshed on `arete update`, read-only by convention).
- `.agents/skills/` (user customizations; takes precedence at agent-load time).
- Resolution: agent harness checks `.agents/skills/<name>/` first, falls back to `.arete/skills/<name>/`.
- `arete skill fork <name>` — copy upstream template into user-skills dir.
- `arete skill diff <name>` + `arete skill merge <name> [--interactive]` — upstream-update flow.
- CursorAdapter / Codex AGENTS.md path: adapter renders the merged view (`.arete/skills` + `.agents/skills` overrides) into AGENTS.md.

**Removes**:
- "Workflow opinions shipped as universal" — `daily-plan`, `slack-digest` (heuristic configs), `inbox-triage` (routing rules), `schedule-meeting`, all `pull-from-*`, all PM artifact templates become user-extendable boilerplate, not opinionated ships.

**Skeptical view**: "If skill is the unit, the user maintains N forked skills against upstream. The diff/merge tooling is a maintenance tax disguised as a customization win." **Counter**: today's alternative is editing shipped skills in place and losing edits on `arete update`, which is worse. The diff/merge is the structural protection.

**Rollback**: revert adapter resolution order; user skills go back to last-modified-wins against upstream.

### Phase 4 — Skills audit + chef-pattern propagation (`phase-4-skills-audit/`)

**Why fifth**: with the chef-pattern proven on the five Phase 2 skills and the directory split in place (Phase 3), audit the remaining shipped runtime skills, apply the chef pattern where it fits, **demote to CLI commands where the skill is just a wrapper**, drop where it's unused.

#### Three dispositions per skill (added 2026-05-05 from user input)

The original Phase 4 framing had two outcomes: apply chef pattern, or drop. User feedback during Phase 2 soak surfaced a missing third disposition:

> Skills earn their existence when (a) they orchestrate multi-step judgment, OR (b) they have user-tunable prose that affects behavior. Skills are bloat when they're 1:1 with a CLI command, when their user-customizable bit is a config file rather than the prose, or when they're shims around external tooling.

So Phase 4 produces a per-skill verdict from this disposition table:

| Disposition | When | What happens |
|---|---|---|
| **Apply chef pattern** | User-tunable workflow with multi-step judgment | Rewrite as chef-pattern skill following Phase 2 PATTERNS.md envelopes; preserve `SKILL.legacy.md` per Phase 2 MC2 pattern |
| **Demote to CLI** | 1:1 with an existing CLI verb, or pure wrapper around an integration/MCP, or user-customizable bit lives in a config file (not prose) | Remove the skill; expose the underlying CLI verb as the user surface; if the skill carried policy-as-config, keep the config file alongside the CLI verb |
| **Drop** | Unused (no John invocation, no other-skill invocation), no upstream-update story | Delete the skill outright |
| **Leave as-is** | True universal primitive that doesn't benefit from chef pattern | No action |

#### Pre-identified candidates (from 2026-05-05 conversation)

Sub-orch validates each at audit time; this is starting input, not final verdict.

**Demote to CLI:**
- `pull-from-krisp`, `pull-from-fathom`, `pull-from-notion`, `pull-from-doc`, `pull-from-drive`, `pull-from-email` — pure integration shims; `arete pull <integration>` already exists
- `save-meeting` — single ingest; becomes `arete meeting save` (or extend existing `meeting add`)
- `email-search`, `drive-search`, `doc-search` — query primitives
- `calendar` — `arete calendar create / find / availability` already exists; skill is a wrapper
- `people-intelligence` — **confirmed by John never invoked directly via `/people-intelligence`** (2026-05-05). Becomes `arete people intelligence digest` (or already is — verify). Policy file at `context/people-intelligence-policy.json` stays as user-tunable config

**Apply chef pattern (already user-customizable workflows):**
- `inbox-triage` — routing rules + "important" definitions are personal
- `email-triage` — same
- `slack-digest` — split: pull-from-slack as CLI; user-tunable digest workflow (with `significance_analyst` rules) as chef-pattern skill
- `schedule-meeting` — orchestrates calendar primitive + context + communication; user has preferences

**PM artifacts (case-by-case):**
- `create-prd`, `discovery`, `pre-mortem`, `review-plan`, `synthesize`, `construct-roadmap`, `competitive-analysis` — apply chef pattern where user-felt step-by-step pain exists; otherwise leave as-is

**Leave as-is (true universal primitives):**
- `getting-started`, `workspace-tour`, `rapid-context-dump`, `capture-conversation`

**Already covered by Phase 2** (skip in Phase 4 audit):
- `daily-winddown`, `weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`

#### Scope notes

- For **Demote to CLI**, the corresponding CLI verb must already exist (or be added in Phase 4). Audit: does `arete pull krisp` actually do what `pull-from-krisp` skill described? If not, gap-fill the CLI before removing the skill.
- For **Apply chef pattern**, follow Phase 2's MC2 ship gate: per-skill `SKILL.legacy.md` + `ARETE_LEGACY_SKILL_PROSE` flag routing. Same legacy sunset path per MC5.
- For **Drop**, surface the deletion in the Phase 4 review. If anything in PATTERNS.md or other skills refers to a dropped skill, update the references.
- The `pull-from-*` skill removals also tie back to Phase 1's absorption principle: when a `pull-from-X` flow becomes a primary-ingest path that should produce a summary, wire the summary writer at the CLI layer (not the skill).

#### Removes

Expected scope of removals (sub-orch validates):
- 6+ `pull-from-*` skills demoted to existing CLI verbs
- 4–6 search/query skills demoted to CLI
- 1–2 wrapper skills (`calendar`, possibly `save-meeting`) dropped
- 0–4 skills dropped outright as unused
- Estimated 12–18 skill files removed from `packages/runtime/skills/`

This is a substantial AC8-ledger remove — pulls Phase 1's +8 ledger materially closer to ≤0 across phases.

**Skeptical view**: "Audit phases drift into make-work. Demoting to CLI risks losing useful prose context that the agent benefits from when invoked via `/<name>`." **Counter**: the demotion criterion is specific (1:1 with CLI, config-not-prose customization, integration shim). Where prose is genuinely load-bearing, the disposition is "apply chef pattern," not "demote." Each demotion ships with explicit verification: the corresponding `arete X` CLI invocation actually produces the same outcome the deleted skill prose orchestrated.

**Rollback**: per-skill, since each disposition is independent.

### Phase 5 — `meeting extract` decomposition — **SUBSUMED into Phase 7 (2026-05-28)**

**Status**: subsumed. The 2026-05-28 cross-skill reframe makes "decompose meeting extract" a special case of "gather-only mode for chef skills." Rather than a standalone meeting-only decomposition, Phase 7 documents the gather-only pattern in PATTERNS.md and adds verbs for slack-digest + email-triage + (when relevant) meeting in the same shape.

The original Phase 5 removals (items that should NOT survive once meeting extract is gather-only) carry forward into Phase 7's "Removes" — `meeting-parser.ts` regex, `brief --for` LLM branch, `search --answer` LLM branch, `memory refresh` synthesis pipelines, three context-bundle services collapse, `route` CLI command. Phase 7 plan inherits these.

**What's preserved**: the CLI primitives originally proposed (`arete propose decision|learning|action --target`, `arete diff staged-vs-committed`, `arete commitments history --since`) are recast as gather-only outputs from the new verbs. If they prove load-bearing after Phase 7's gather-only pattern lands, they become Phase 7.5 commits.

**Hygiene reconciliation** (carried forward to Phase 7): `brief --for`, `search --answer`, `daily`, `meeting-parser.ts` confirmed NOT removed by hygiene-pass-1. Phase 7 owns these.

### Phase 7 — Cross-skill foundations / Slice A (`phase-7-cross-skill-foundations/`)

**Why next (added 2026-05-28)**: prerequisite for Phase 8's loop reconciler. Pure additions, no behavior change for the user yet — but other tools can compose them. Also absorbs Phase 5's `meeting extract` decomposition spirit (gather-only mode for chef skills replaces the standalone decomposition framing).

**Scope**:

**(a) Gather-only CLI verbs for chef skills.** Each chef-pattern skill that today engages the user gets a sibling `extract` verb returning structured loops (or whatever the skill's output unit is) as JSON, without engaging. Standalone skill prose calls the verb + engages; orchestrators call the verb and compose:
- `arete slack-digest extract --window 1d --json` → returns structured loops + closure-evidence candidates
- `arete email-triage extract --window 1d --json` → same
- `arete meeting extract --json` (already exists; gets a `--gather-only` mode that returns loops without staging into frontmatter)
- `arete calendar pull --created-today --json` AND `arete calendar pull --next 30d --json` (per spec D9 — two queries, different scopes)
- `arete jira pull --watchlist --json` (consumes the `jira_epics:` watchlist from (b))

**(b) Jira watchlist in area frontmatter.** `areas/<slug>.md` frontmatter gets `jira_epics: [PLAT-11014, PLAT-10025, ...]`. New helper:
- `arete area epics --active --json` → returns union of jira_epics across `status: active` areas.

Why area frontmatter (per spec Q2 analysis): areas are the operational rollup; epics span multiple projects; multiple chef skills will want this watchlist. Project README is too narrow; winddown APPEND is workspace-private and per-skill.

**(c) Cross-source identity resolution helper.** Extends `arete people show` with a `--channels` flag:
- `arete people show <slug> --channels --json` → returns `{slug, name, email, alt_emails[], slack_handle, slack_user_id, ...}` from the existing `people/internal/<slug>.md` frontmatter.

Per spec Q3 analysis: `arete resolve` resolves text→slug; reconciler needs the reverse (slug→all known channels). Today the data exists in people frontmatter but no helper exposes it.

**(d) PATTERNS.md "gather-only composition" sub-mode.** New section in `packages/runtime/skills/PATTERNS.md` documenting the gather-only pattern as a chef-orchestrator sub-mode: when to use, how to expose, how callers compose. Becomes the architectural anchor for Phase 8's reconciler.

**(e) Phase 5 absorbed removes.** Phase 5's deletion list survives the subsumption — they're targets for Phase 7 sweep where compatible:
- `meeting-parser.ts` regex (re-parses what extraction produced)
- `brief --for` LLM branch
- `search --answer` LLM branch
- `daily` CLI command (already deferred per parent-plan note)
- `memory refresh` synthesis pipelines (split: keep mechanical; drop embedded LLM synthesis)
- Three context-bundle services collapse to one
- `route` CLI command pending review

Phase 7 build sub-orch validates each — some may have crept into active use during followups 1-5 and need re-evaluation. Sub-orch surfaces verdict per-item before deletion.

**Removes**:
- The "5 separate digests" surface — slack-digest still works standalone, but invoked from winddown it extracts-only (no separate engagement)
- The above Phase 5 deletion list (where validated)
- The `meeting extract` monolith's hidden judgment (mode-picking, topic-picking, core/could-include separation) — refactored into gather-only output that the chef judges

**A/B/C answers locked here** (from spec Q1–Q3):
- Gather-only is documented in PATTERNS.md as Pattern 5
- Reconciler stays agent-judgment (no new CLI primitive yet) — see Phase 8
- DRY via shared CLI verbs (the gather-only output IS the shared truth)
- `jira_epics:` in area frontmatter
- `arete people show --channels` for identity

**Skeptical view**: "Phase 7 ships substrate that has no immediate user-visible win. Standalone skills work the same; the new verbs sit unused until Phase 8 calls them. Could be a phase that ships and then we lose momentum before Phase 8 starts." **Counter**: Phase 7 is the cheapest path to Phase 8 — without gather-only verbs, Phase 8's reconciler has nothing to consume. Splitting the work is the only way Phase 8 stays scoped. Mitigation: Phase 7 and Phase 8 sequence with no buffer between them; ship Phase 7, then immediately scope Phase 8.

**Rollback**: pure additions; revert per-commit. No existing behavior changes (standalone skills are untouched).

### Phase 8 — Loop reconciler / Slice B (`phase-8-loop-reconciler/`)

**Why eighth (added 2026-05-28)**: this is where the user-felt win lands per the spec. Daily-winddown becomes the canonical cross-skill chef. Closes the "3 of 5 hand-skipped action items" failure mode the spec documents on `2026-05-28-john-nate-pre-runyon-checkin`.

**Scope** (rules 1-3 from spec; rule 4 deferred to Phase 9):

**(a) New daily-winddown pipeline**:
```
GATHER (parallel via Phase 7 gather-only verbs)
  slack-digest extract · email-triage extract · meeting extract (gather-only)
  · calendar pull (--created-today + --next 30d) · jira pull --watchlist
  · commitments list · week.md read
        ↓
RECONCILE (the gate — agent judgment in-context, no new CLI primitive)
  unify identities via `arete people show --channels` cache
  → order loops by timestamp
  → apply the three skip rules (below)
  → conservative collapse: concrete evidence only; fuzzy → Uncertain tier
        ├── closed/superseded → "Closed today" narrative section (trace source→fulfillment)
        ├── survivors         → staged into existing meeting-review UI
        └── fuzzy             → ## Uncertain — your call (chat)
        ↓
ENGAGE ONCE
```

**(b) The three skip rules** (rule 4 deferred to Phase 9):
1. **Intent → fulfilling action elsewhere.** "Confirm with Lindsay X" + a DM to Lindsay doing exactly that → closed. Bonus: detect her reply.
2. **Intent → already-scheduled event.** "Meet with Nick & Anthony" + a calendar invite with them already exists → closed; the event IS the fulfillment.
3. **Action moot — its event already passed.** Prep item for an event that has now occurred → moot. (Cheapest rule — just compare timestamps.)

**(c) "Closed today" narrative section.** Required by spec D2. Every collapsed loop traces source → fulfillment in 1-2 lines:
> *"You promised Anthony X in the morning Comms WG. Sent via Slack 11:42a ✓"*
> *"Action item from Nick standup: 'meet with Nick & Anthony to review prototype.' Calendar invite already exists for Fri 2p ✓"*

**(d) Conservative collapse**: only on concrete evidence (real invite/message/ticket; matching counterparty + topic + same-or-later timestamp). Anything fuzzy goes to `## Uncertain` for user judgment.

**(e) Closure detection**: per spec D6, "you acted = done" by default. Fire-and-forget closes on send; blocking question closes on send but drops a light "waiting on \<person\>" only if an answer is needed to unblock. Detect actual reply when present.

**Removes**:
- The "hand-skip 3 of 5 action items because they're already done" daily user-time drain
- 4+ separate engagement surfaces (slack, email, meeting-review UI, post-extract review) collapse to one

**Substitution argument for AC8**: this is the keystone "across-skill chef" extension. Adds the reconciler (agent-judgment, not new code substrate) and the new daily-winddown pipeline. Net code LOC change is small (the heavy lifting is prose in SKILL.md + cross-source helpers added in Phase 7). The substitution: chef engages once across all sources, replacing N independent engagements.

**Skeptical view**: "Silent drop of a real obligation is the catastrophic failure mode. The conservative-collapse threshold and Uncertain-tier fallback help, but the agent will be wrong sometimes. Trust takes weeks to earn back if it surfaces as 'I told you that already happened, why didn't you remember?' from the user." **Counter**: D1 (concrete evidence only) + D2 ("Closed today" traces every collapse) are the safety net. Mitigation: AC11 hard stop applies; if closed-today traces show >1 silent drop per week during 2-week soak, revert to non-reconciler winddown.

**Gate-vs-stretch criteria (MC1)**:
- Rules 1, 2, 3 are gates
- "Closed today" narrative section is a gate (visibility into what was collapsed — D2 is the safety net)
- Closure detection (reply detection in slack/email) is stretch — ship rule-1 with "sent" as the closure signal first; reply detection adds nuance if soak warrants

**Rollback**: feature flag `ARETE_LEGACY_DAILY_WINDDOWN=1` reverts to non-reconciler pipeline (pre-Phase-8 prose). Reconciler is agent-judgment so revert is prose-only; per Phase 3.5 followup-4 pattern this is a clean `git revert` path.

### Phase 9 — Item supersede across meetings / Slice C (deferred, `phase-9-item-supersede/`)

**Status**: deferred until Phase 8 soaks. Spec rule 4: "Item superseded by a later item. A learning/decision from meeting 1 corrected or voided by meeting 2 → only the corrected version survives. Applies to ALL item types — tasks, commitments, decisions, AND learnings."

**Why deferred**: judgment-heavy and depends on the wiki being in better shape (the followup-5 work improves this; ongoing). Rules 1-3 in Phase 8 are about *fulfillment* (concrete evidence: invite exists, message sent, event passed). Rule 4 is about *correction* (learning A says X; learning B says ~X) which requires either a strong wiki state for the LLM to compare against, OR a typed schema layer (Phase 6) for explicit conflict detection.

If Phase 8 ships and rule 4 still feels load-bearing after 2 weeks of soak, draft Phase 9. If the wiki + Phase 8 reconciler together feel sufficient, Phase 9 stays deferred indefinitely.

### Phase 6 — Schema layer (conditional, `phase-6-schema-layer/`)

**Why conditional**: the original parent plan had this as the keystone. The independent review correctly noted that Phase 2/5 can be done by reading markdown directly. Phase 6 ships ONLY IF Phase 2/7/8 retros surface specific consumer-needs the schema layer fills, named explicitly. If those consumers don't materialize, Phase 6 is dropped — that's the substrate sunset rule (Principle 7) in action.

**2026-05-28 update**: Phase 8's loop reconciler is the strongest potential consumer of `state.json` — typed active-loops state would let the reconciler avoid re-parsing markdown sources on every run. If Phase 8 ships with agent-judgment reconciler (per D7) and the agent's judgment proves consistent across 30+ days, that's evidence for OR against Phase 6. Specifically:
- If agent runs are slow / expensive: Phase 6's typed state.json speeds reconciliation. SHIPS.
- If agent runs are fast enough but reconciler logic is stable: Phase 6 codifies the stable shape as types. CONDITIONAL.
- If agent judgment varies run-to-run on the same inputs: schema layer adds rigor. SHIPS.
- If everything works fine with markdown re-parse: substrate sunset rule says DROP.

**If shipped, scope**:
- `.arete/memory/state.json` — derived snapshot of current commitments, active topics, week focus, capacity, attention scores, **active loops (per Phase 8)**. Regenerated from markdown sources + the item-fates.jsonl already produced by Phase 0.
- `arete state` CLI primitive.
- (Possibly) `events.jsonl` if state.json alone isn't enough for the consumer needs Phase 2/7/8 retros surfaced.

**Removes** (if shipped):
- `task-scoring.ts` re-derivation at retrieval — scores live in state.json.
- Week-priority prose-parsing in `task-scoring.ts:271`.
- Multiple ad-hoc "what's open with this person" queries — replaced by state.json read.
- Phase 8's per-run loop-ledger reconstruction — read from state.json instead.

**Skeptical view (required if shipping)**: "What if state.json becomes the third copy of data we feared, and consumers keep falling back to markdown re-parsing because the shape is wrong on first cut?" **Counter**: defined sunset criterion. If the migration checklist ("delete these N consumers when state.json ships") isn't met within Phase 6, state.json is reverted, not extended.

### (Deferred to follow-up plan) Judgment substrate

The original Phase 5 (dismissal-as-signal feedback loop, attention scores, agent-observations writer) shipped as "pure additions" in the original plan. Per Principle 2 and the first independent review's strongest critique, this is **deferred to a separate follow-up plan**, sequenced after v2 has 30+ days of real Phase 0 + Phase 1 + Phase 2 data and a clear consumer story. Some functionality may move into Phase 6 if Phase 2/5 retros surface specific consumer needs.

## Outcome-level acceptance criteria (revised post-review)

These are the cross-cutting ACs the parent plan owns. Phase plans define implementation-level ACs.

**AC10 is the gating AC** — if median winddown time fails to improve, v2 has failed regardless of how the other ACs measure. AC1, AC3, AC4 are reframed against the gameability the review flagged. AC8 gains concrete measurement proxies.

| AC | How verified |
|---|---|
| **AC1** (revised): The daily winddown primary view is **observably importance-ordered** — high-importance items surface first; low-importance / matched-dismissal-pattern items are auto-deferred to sidecar. | User review on 10 consecutive winddowns; subjective "did the right things surface?" pass on each |
| **AC2**: Approved decisions/learnings appear in **at most 2 places** (body section + `memory/items/*.md`); `frontmatter.approved_items` is gone | Test + manual inspection of a fresh-meeting commit |
| **AC3** (revised): Topic-page integration LLM cost drops by ≥60% on **both** a typical day (~4 meetings) **and** a heavy day (≥7 meetings). Both measurements required. | Cost telemetry; A/B against Phase 0 baseline; one of each day type |
| **AC4** (revised post-Phase-2 design): Every staged item has a reason label; every deferred item has a reason label; when uncertain, the agent surfaces a small `## Uncertain — your call` tier rather than guessing. **No length cap** — chef judgment determines what surfaces. (Earlier draft had ≤25 line cap; replaced because hard caps are a forcing function inconsistent with judgment-driven curation. The "skim-able" property comes from clear sections + reason labels + APPEND-file context, not artificial caps.) | Manual review on 10 consecutive winddowns; subjective "did the right things surface, with the right reasons?" pass on each |
| **AC5**: User can `arete skill fork daily-winddown`, edit, and `arete update` (which refreshes `.arete/skills/`) without losing customizations | Integration test + manual upstream-merge dry run |
| **AC6** (conditional, only if Phase 4 ships): User can `arete state` and get one read of "current state of my workspace" instead of N file parses, AND ≥3 consumers have migrated off ad-hoc parsing | CLI smoke test + grep check of consumer migration |
| **AC7** (deferred — judgment substrate): N/A in v2 plan as revised; deferred to follow-up plan |
| **AC8** (revised — concrete proxies): Adds-vs-removes ledger uses these counts (each phase reports delta): (a) CLI verbs, (b) shipped runtime skills, (c) frontmatter fields across all canonical file shapes, (d) memory file types in `.arete/memory/`, (e) services in `packages/core/src/services/`. **Net delta across all five categories combined must be ≤0** through Phase 3b. | Phase /review checkpoint with the count diff |
| **AC9** (revised): Each phase plan ships with a "**skeptical view**" section. Meta-orchestrator reads it back at /review. Phase ships only when the skeptical view's strongest argument is named, faced, and either accepted as residual risk or addressed. | /review checkpoint with skeptical-view discussion |
| **AC10** (gating, promoted): Daily winddown median time drops from {Phase 0 baseline} to ≤15 min over a 14-day rolling window after Phase 3b ships. **If AC10 fails, v2 has failed.** Other ACs are necessary but not sufficient. | Self-reported, 14-day rolling median; baseline established in Phase 0 |
| **AC11** (added post-review — daily-driver hard stop): During any phase soak, if winddown takes >45 min on any single day, the phase is reverted and re-planned, not iterated in place. The user is the daily driver and cannot be a debug subject. | Per-phase checkpoint; explicit revert criterion in each phase plan |

## Testing strategy

### Cross-cutting

- **Byte-equal regression**: where existing outputs (CLAUDE.md, `index.md`, `decisions.md` append shape) should remain stable, snapshot before/after each phase. Idempotency tests as in topic-wiki Step 9.
- **A/B comparison**: at the end of Phases 3 and 5, run a 5-meeting bake-off — current-shape extraction vs v2-shape — and compare by manual review (item quality, redundancy, time to review).
- **Soak period**: 1 week of John using each phase before declaring it shipped. Soak findings feed back into the next phase plan.
- **Cost telemetry**: every LLM call logged to `memory/log.md`; weekly cost report compared to baseline.
- **User-view test (subjective)**: at end of each phase, John writes one paragraph: "what's clearer now? what's still confusing?" Phase ships when "still confusing" is empty for that phase's scope.

### Per-phase

Each phase plan owns its detailed test plan (unit, integration, end-to-end). Phase plan must include:

- Unit tests for new model/parser/render code (round-trip for any file format).
- Integration tests for new CLI primitives (empty workspace, partial state, error paths).
- Service-layer tests for any new write path (atomic-write contract; idempotency).
- Migration tests where existing data shape changes (Phase 3 topic-integration gating; Phase 4 skills resolution).
- Performance sanity: no regression on `arete meeting apply` median time.

## Dependencies

- **Hygiene-pass-1 must merge first.** That worktree removes dead/unused code and surfaces what's actually load-bearing. v2 cannot add back what hygiene removed; v2 priorities reshape around hygiene findings. As of 2026-05-01, hygiene-pass-1 needs a rebase before merge.
- **Existing topic-wiki memory infrastructure stays.** Topic pages are the concept-page leg of the wiki; v2 adds the summaries leg and the schema layer. Topic-integration costs change (gated), but topic pages themselves remain.
- **Phase 5 depends on ~30 days of populated events.jsonl from Phase 2.** Phase 5 plan must explicitly handle the "cold start" period where attention scores and dismissal patterns are not yet meaningful.

## Deferred / explicitly out of scope

- AGENTS.md / Cursor adapter symmetry beyond the basic merged-view rendering (later phase if needed).
- Background queue for topic integration (sync default; revisit if production feel degrades after Phase 3 gating).
- Web review UI redesign (out of scope; UI follows after backend stabilizes).
- Marp slide / visual outputs per Karpathy gist (separate plan; Karpathy "inspiration item" in user memory).
- Web-clipper ingest (separate plan).
- LLM-driven contradiction lint for topics (was Phase 5 of topic-wiki plan; still deferred).
- Restructuring `commitments.json` storage (handled by other in-flight worktrees if any).

## Risks

See `pre-mortem.md` for the full risk catalog. Top concerns at draft time:

1. **And-also creep** — adds happen, removes don't. Mitigated by the "what does this delete?" gate at every PR.
2. **Schema layer becomes a third copy of data** — events.jsonl + state.json sit alongside markdown without replacing anything. Mitigated by Phase 2 explicitly identifying replacement paths in its plan.
3. **Trust-gap miscalibration** — chef's curation is wrong too often (auto-defers things John wanted to see). Mitigated by reason labels, easy-recall-from-deferred, and the disagreement-as-signal feedback loop. Tolerance: ~10% wrong-deferral acceptable; ≥20% breaks trust.
4. **Phase 3 blast radius** — `meeting extract` decomposition touches the most-used path. Mitigated by phasing summaries (Phase 1) and schema (Phase 2) before this; A/B against current shape; soak before ship.
5. **Skills split breaks IDE adapters** — Cursor / Codex AGENTS.md path silently drops user customizations if adapter rendering is wrong. Mitigated by explicit adapter test in Phase 4 (capability probe + signature-level enforcement, same pattern as topic-wiki Step 9).
6. **`week.md` semantics drift** — derived view vs hand-edited file is a known-hard split. Mitigated by sentinel-bracketed auto-sections (same pattern as person memory) so user edits and machine regen don't collide.

## Phased rollout cadence (revised 2026-05-28)

Indicative; subject to phase-plan refinement. Actual wall times for shipped phases (recorded in diary) have been DRAMATICALLY shorter than estimates — autonomous meta+sub-orch pattern collapses build into minutes/hours, not days. Estimates below reflect the calendar/soak schedule, not wall-clock build effort.

| Phase | Status | Build | Soak | Total |
|---|---|---|---|---|
| 0 — Instrument + baseline | **shipped** (~64 min build) | actual: 1 hour | 14 days | done |
| 1 — Wiki expansion | **shipped to parent** (~69 min build) | actual: 1.2 hours | pending main merge | parent-merge done |
| 2 — Chef-orchestrator behavior rewrite | **shipped to parent** (~43 min build) | actual: 43 min | pending main merge | parent-merge done |
| 3 — Skills directory split | **shipped to parent** (~41 min build) | actual: 41 min | pending main merge | parent-merge done |
| 3.5 — Polish + followups 1-5 | **shipped to parent** (5 followups) | actual: spans 2 weeks of incremental commits | pending main merge | parent-merge done |
| 4 — Skills audit + chef-pattern propagation | **shipped to parent** (~43 min build) | actual: 43 min | pending main merge | parent-merge done |
| 5 — `meeting extract` decomposition | **SUBSUMED into Phase 7** (2026-05-28 reframe) | — | — | — |
| 7 — Cross-skill foundations (Slice A) | **not started** | est. 2–4 hrs build | 3–5 day soak | ~5–7 days |
| 8 — Loop reconciler (Slice B) | **not started; sequences after Phase 7** | est. 3–6 hrs build | 14 days (heavy soak — the user-felt dream) | ~14–16 days |
| 9 — Item supersede (Slice C) | **deferred indefinitely** | — | — | only if Phase 8 soak shows need |
| 6 — Schema layer (conditional) | **not started; conditional on Phase 7/8 retros** | est. 1–2 days build | 7 days | ~9 days |

Sequencing rule per 2026-05-28 reframe: **Phase 7 → Phase 8 with no buffer** (Phase 7 is the substrate Phase 8 consumes; gap risks momentum loss). Phase 6 evaluated AFTER Phase 8 ships and soaks.

User-felt cross-skill win lands at end of Phase 8 (the "auto-skip 3 of 5 already-resolved action items" experience from the spec's anchor example).

## Phase plan requirements (from second-pass review MC1–MC5)

The second-pass review (`review-2.md`) approved the parent plan with minor concerns to be threaded into individual phase plans. These are durable constraints — every phase plan must address its applicable items before sub-orchestrator spawn.

| Constraint | Applies to | What the phase plan must include |
|---|---|---|
| **MC1 — gate vs stretch** | Phase 1 | (a)–(c) committed as gates; (d) wikilinks and (e) wiki lint as stretch with explicit *defer-not-cut* criteria (what conditions push them to a follow-on plan vs. drop entirely) |
| **MC2 — legacy preservation** | Phase 2 | Per-skill `SKILL.legacy.md` preservation + per-skill `ARETE_LEGACY_SKILL_PROSE` flag enumerated as ship gates. Build does not merge until both are in place |
| **MC3 — heuristic validation** | Phase 1 | 7-day shadow-run period for the slack-substantial heuristic before writers go live. Heuristic logs decisions but does not write; John spot-checks false-negative rate |
| **MC4 — patterns first** | Phase 2 | `PATTERNS.md` (all four patterns specified) ships and is reviewed *before* any of the five skills is rewritten |
| **MC5 — legacy × split interaction** | Phase 2 (looking ahead to Phase 3) | Address how `SKILL.legacy.md` interacts with Phase 3's `.arete/skills` vs `.agents/skills` split. Either remove legacy before Phase 3 ships, or Phase 3 `skill diff/merge` handles legacy artifact |

## /ship cycle per phase

Each phase plan goes through `/ship` independently:

1. **Pre-mortem** — sub-orchestrator drafts. Meta reviews and adds parent-level concerns.
2. **PRD** (optional, larger phases only) — sub-orchestrator drafts. Meta reviews.
3. **Build** — sub-orchestrator runs. Meta does not micro-manage; checks in at milestones.
4. **Review** — sub-orchestrator requests review. Meta reads diff, evaluates against phase ACs and parent ACs (especially AC8 and AC9 — "what does this delete?"). Posts review notes to phase plan's `review.md`.
5. **Wrap** — sub-orchestrator addresses review, runs final checks. Meta merges into parent worktree.
6. **Ship** — sub-orchestrator opens PR to main from parent worktree (sub-orchestrators don't push to main directly).

## Sub-orchestrator handoff brief template

When meta-orchestrator spawns a sub-orchestrator for a phase, the brief includes:

- Phase plan path (after meta has drafted at least the skeleton).
- Pointer to this parent plan + diary.
- Pointer to relevant memory files (`project_arete_v2_direction.md`, `feedback_*.md` rules).
- The phase's outcome ACs from the table above.
- Discipline rules — especially AC8 and AC9.
- Review expectations: meta reviews at `/review`; specific things to flag for meta attention (boundary changes, new substrate, anything that crosses phase scope).
- Worktree convention: each phase gets its own sub-worktree off this parent worktree's branch, named `arete-v2-phase-N-<slug>`.

## Notes

- Diary at `diary.md` is the durable thread for the meta-orchestrator across context resets.
- Pre-mortem at `pre-mortem.md` is iterated after each phase ships (lessons feed forward).
- Phase plans live in subdirectories: `phase-1-summaries-promotion/`, `phase-2-schema-layer/`, etc.
