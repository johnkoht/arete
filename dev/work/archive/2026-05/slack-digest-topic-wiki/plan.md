---
title: "Slack-Digest → Topic-Wiki Integration"
slug: slack-digest-topic-wiki
status: approved
size: medium
tags: [memory, l3, topics, slack, wiki, ingest]
created: "2026-04-28T00:00:00.000Z"
updated: "2026-04-29T00:00:00.000Z"
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
depends_on: topic-wiki-memory
steps: 6
---

# Slack-Digest → Topic-Wiki Integration

The topic-wiki-memory build (Phase A+B, shipped 2026-04-23) wired the
Karpathy loop end-to-end for **meetings only**. `meeting apply` runs
Hook 1 (alias/merge); `meeting approve` runs Hook 2 (`integrateSource`
per touched topic). Slack — the primary async-decision substrate for
many users — has no equivalent path. A Slack thread that closes a
pilot question about Cover Whale templates updates commitments and
people memory but leaves `cover-whale-templates.md` untouched.

This plan adds slack-digest as a **second source class** for the topic
wiki, mirroring the meeting Hooks at the slack-digest skill boundary.
Topic extraction is biased against the same active-topic slug list
that biases meeting extraction. Source integration runs after the
user's Phase 4 approval inside the skill, against a per-thread topic
mapping (not a per-digest one — see Risks).

The smallest viable cut leans heavily on existing infrastructure:
`integrateSource` already accepts an arbitrary `{path, date, content}`
source, and `refreshAllFromMeetings`'s discovery loop is the only
piece that hard-codes `resources/meetings/`. We widen that — without
generalizing it into a fully source-agnostic engine — and add a
slack-digest writer-side that emits `topics:` per thread.

## Context

- Parent plan: `dev/work/plans/topic-wiki-memory/plan.md` — Karpathy
  loop architecture, Hook 1/Hook 2 vocabulary, `integrateSource`
  contract.
- Phase C parent: `dev/work/plans/topic-wiki-memory-phase-c/plan.md`
  item 8 — seed for this plan. **One factual error there**: item 8
  says "probably `resources/slack-digests/*.md`." The actual path
  the slack-digest skill writes is
  `resources/notes/{date}-slack-digest.md` with `type: slack-digest`
  in frontmatter (see `packages/runtime/skills/slack-digest/SKILL.md`
  line 25 and existing files in `arete-reserv/resources/notes/`).
  This plan uses the existing path — no rename, no migration.
- Sibling plan: `dev/work/plans/slack-evidence-dedup/plan.md` —
  reuses `'slack-resolved'` as an `ItemSource` for commitment dedup.
  That plan is about dedup of L2 commitments; this plan is about L3
  topic synthesis. Architecturally distinct. The collision risk is
  zero — they touch different systems — but they share the
  underlying digest schema, so coordinate any frontmatter additions.
- As-built synthesis: `memory/entries/2026-04-23_topic-wiki-memory-learnings.md`
  — surfaces the dark-code failure mode (services exist + tested ≠
  reachable from production) that Step 4 of this plan is designed to
  prevent.

## Steps

### 1. Topic extraction inside slack-digest (per-thread, biased)

**Problem.** The slack-digest skill extracts decisions, learnings,
and commitments via the significance-analyst pattern (Phase 2c of
its workflow), but does not propose topic slugs. Without topic slugs
on the digest output there is nothing to drive Hook 2. Meeting
extraction (`meeting-extraction.ts:651`) emits `topics: string[]`
biased by `activeTopicSlugs`; slack-digest needs an equivalent.

A slack digest is shaped differently from a meeting transcript: it
bundles N independent threads, each with its own subject. A single
3–6-slug list per *digest file* would be muddy ("the digest is about
templates AND access provisioning AND power-hour scheduling"). Topic
relevance is genuinely **per-thread**.

**Approach.** Extend the skill's Phase 2c extraction (significance
analyst) to emit topics per **conversation/thread** rather than per
digest. Output shape inside the skill:

```ts
// per-thread metadata in the digest's intermediate state
{ channel_id, participants, topics: string[]  /* 1-3 slugs per thread */ }
```

Bias the extraction with the same `renderActiveTopicsAsSlugList()`
output the meeting-extraction prompt uses. The skill is markdown-
authored (no TS pipeline of its own), so the bias is delivered in
two ways:

1. The skill's Phase 2a context-bundle assembly already calls
   `arete search "current priorities goals" --scope context --json`.
   Add a sibling call: `arete topic list --active --slugs --json`
   (new — see #1 below) that returns the same active-slug rendering
   the meeting prompt uses.
2. The extraction prompt section in `SKILL.md` Phase 2c gains a
   "Prefer these existing topic slugs when applicable" block,
   verbatim of the meeting-extraction prompt's bias wording.

**On aggregation.** When the skill writes the digest file in Phase
5a, it computes a **digest-level union** of per-thread topics for
the frontmatter `topics:` field. That's what Hook 2 (Step 3 below)
reads — `integrateSource` runs per slug, against the same digest
content. The union is lossy: a slug from thread 7 will be integrated
against the whole digest's content, including unrelated thread text.
This is acceptable because (a) `integrateSource`'s LLM prompt
already filters its own input ("integrate this source by updating
ONLY the sections the new source substantively changes"), and (b)
the alternative — emitting one `sources_integrated` entry per
thread — multiplies cost by ~10× and breaks the file-as-source
content-hash invariant. See Risks for the explicit trade-off.

**New CLI primitive.** `arete topic list --active --slugs` — emits
the bare-slug-list rendering used by extraction prompts. Today the
slug-list renderer is reachable only from inside core; the skill is
a markdown surface that talks to the CLI. Without this primitive we
either duplicate the rendering logic in the skill prompt (drift
risk) or pipe `arete topic list --json` through jq.

**Acceptance.**
- `SKILL.md` Phase 2c includes a topics-extraction block with active-
  slug bias, mirroring the meeting-extraction prompt's wording.
- Each extracted thread carries 1–3 topic slugs in the skill's
  intermediate state.
- The digest file's frontmatter (Phase 5a) gains `topics: [slug, ...]`
  — the union across approved threads.
- `arete topic list --active --slugs` exists and emits the same
  format `renderActiveTopicsAsSlugList(getActiveTopics(...))` produces.
- Idempotent: running the skill twice on the same Slack window with
  the same approvals produces the same `topics:` set (subject to
  LLM determinism).

### 2. Widen source discovery — `refreshAllFromMeetings` rename + slack-digest scan

**Problem.** `refreshAllFromMeetings` (`topic-memory.ts:790`) hard-
codes `pathJoin(paths.resources, 'meetings')` as its source directory.
Slack digests live at `resources/notes/{date}-slack-digest.md`.

The directory scan needs to pick up slack digests too. The parser
question is settled by inspection: `parseMeetingFile`
(`packages/core/src/services/meeting-context.ts:163`) already
tolerates missing `attendees` and reads `topics` directly via
`Array.isArray(fm.topics)`. It parses an actual
`2026-04-28-slack-digest.md` fixture cleanly. **No second parser is
needed** — the source-discovery loop reuses `parseMeetingFile` for
both shapes. Plan v1's "parser tension" was a false dichotomy.

**Approach — rename tension.** The function name
`refreshAllFromMeetings` will be a lie after this change. Three
options:

| Option | Pros | Cons |
|---|---|---|
| Rename to `refreshAllFromSources` | Honest name | Touches 9 call sites incl. one backend route; missing any in the sweep silently breaks production |
| Keep name, accept the lie | No churn | Future readers of the call sites think slack isn't covered |
| New method `refreshAllFromSources` that wraps the meeting-only path | Both names work; meeting-only callers unchanged | Two methods doing similar things — exactly the kind of overgeneralization the user warned against |

**Pick: rename to `refreshAllFromSources`.** Nine call sites is a
known set (verified via `rg -n 'refreshAllFromMeetings' packages/`):
- `packages/core/src/services/topic-memory.ts:779,790` (declaration)
- `packages/cli/src/commands/meeting.ts:1391` (doc comment),
  `meeting.ts:1421` (call)
- `packages/cli/src/commands/topic.ts:253,331,787,910` (calls)
- `packages/cli/src/commands/intelligence.ts:511` (call)
- `packages/apps/backend/src/routes/meetings.ts:244` (call) — **the
  one the original plan missed; without this, the backend's topic
  refresh silently breaks after the rename**

A pre/post grep gate (`rg -n 'refreshAllFromMeetings' packages/`
returns 0 hits) is mandatory before merge. The rename lands as its
own commit with no behavior change, then Step 2's body adds the
new source.

**Source-discovery model.** Add a small internal type:

```ts
interface SourceDiscoveryEntry {
  path: string;
  date: string;          // YYYY-MM-DD parsed from filename
  content: string;       // full file content (read once)
  type: 'meeting' | 'slack-digest';
  topics: string[];      // parsed from frontmatter
}
```

Replace the meeting-only loop with a function
`discoverTopicSources(paths, storage)` that:
1. Scans `pathJoin(paths.resources, 'meetings')` with
   `parseMeetingFile` (existing).
2. Scans `pathJoin(paths.resources, 'notes')` for files matching
   `^\d{4}-\d{2}-\d{2}-slack-digest\.md$` and parses with the
   **same** `parseMeetingFile`. The parser already tolerates the
   slack-digest frontmatter shape (no `attendees` required;
   `topics` read directly). Filename pattern is the source-of-truth
   filter; falling back to `type: slack-digest` in frontmatter is a
   belt-and-suspenders sanity check (warn, skip, don't crash if
   mismatched).
3. Returns `SourceDiscoveryEntry[]` sorted by date.

The `type` field on `SourceDiscoveryEntry` is set by the discovery
function based on which directory the file came from, not by
parsing. Keeps the parser shape-agnostic.

**Parser — settled.** Plan v1 proposed introducing
`parseSlackDigestFile`. **Dropped.** Empirical verification
(reviewer parsed a real digest through `parseMeetingFile` cleanly)
shows the existing parser already covers both shapes. Building a
second parser would be ~30 LOC of duplication and create a schema-
fork risk surface with the sibling `slack-evidence-dedup` plan.

**Hash invariant.** `hashMeetingSource` strips frontmatter before
hashing. That contract holds for slack digests too — frontmatter
edits (e.g., re-running the digest, changing `items_approved` count,
this plan adding `topics:`) must not bust idempotency. Verify the
existing `hashMeetingSource` regex works against slack digests and
add a unit test.

**Acceptance.**
- `refreshAllFromMeetings` renamed to `refreshAllFromSources` across
  all 9 call sites (incl. `packages/apps/backend/src/routes/meetings.ts:244`)
  in one commit, no behavior change.
- Pre-merge grep gate: `rg -n 'refreshAllFromMeetings' packages/`
  returns 0 hits.
- `discoverTopicSources(paths, storage)` returns entries from both
  `meetings/` and `notes/*-slack-digest.md`, deterministically
  ordered by date — using `parseMeetingFile` for both shapes (no
  second parser introduced).
- A meeting and a slack digest tagged with the same slug both
  contribute `sources_integrated` entries on the topic page.
- `hashMeetingSource` (consider rename to `hashSourceBody`) is
  unit-tested against a representative slack-digest fixture.
- Existing meeting-only behavior is preserved: every test in
  `topic-memory.test.ts` still passes unchanged after the rename.
- Backend smoke test passes after rename: `meeting approve` route
  in `packages/apps/backend/` still triggers topic refresh end-to-end.

### 3. Hook 2 wiring at slack-digest approve

**Problem.** `meeting approve` (`meeting.ts:1387-1445`) runs Hook 2
synchronously after `commitApprovedItems`. Slack-digest's equivalent
"approve" event is the user's response in Phase 4b ("approve all" /
"1-5, skip 6"). Phase 4c then writes memory items, commitments, and
the digest file (Phase 5a). There is no `arete slack-digest approve`
CLI command — the skill orchestrates the writes via existing CLI
verbs (`arete commitments create`, etc.) and direct memory file
edits.

The hook needs to land somewhere callable from the skill. Options:

1. **CLI verb.** New `arete slack-digest approve <digest-path>` that
   reads the digest's `topics:` and runs `refreshAllFromSources`
   scoped to those slugs. Skill calls it after Phase 5a write.
2. **Inline shell call to existing verbs.** The skill already calls
   `arete index` at end of Phase 5b. Add `arete topic refresh
   --slugs <comma-sep>` (slug-targeted variant of the existing
   `topic refresh` command) and have the skill call it after the
   digest file is written.
3. **Add to `arete index`'s side effects.** Bad — magical, breaks
   the principle that index is a search refresh, not a write.

**Pick: option 2.** The slug-targeted refresh path *already exists*
for individual-slug refresh in `topic.ts`. Slack-digest skill calls
`arete topic refresh --slugs slug1,slug2,slug3 --source <digest-path>`
after Phase 5a. The `--source` flag is the new bit: it tells the
refresh that this is a targeted ingest (lock label, log event), not
a bulk all-topics sweep.

Under the hood `topic refresh --slugs ... --source ...` invokes
`refreshAllFromSources({slugs, ...})` exactly as `meeting approve`
does. The unification means **one code path** for "ingest a single
new source's topics," with the source type (meeting / slack-digest)
inferred from the source path's location. No new service method.

**Sequencing.** The skill's Phase 4c writes commitments, memory
items, and people refreshes BEFORE Phase 5a writes the digest file.
Topic refresh must happen AFTER Phase 5a so the digest file exists
for `discoverTopicSources` to find. That is: skill ordering is
"approve → write digest → topic refresh → index" — same shape as
meeting approve's "commit memory items → topic refresh → other
side effects."

**Latency budget.** Per-topic LLM call is ~$0.015 at 400ms. A
typical digest tags 2–4 topics; that's 1.5–6s synchronous after
approve. Same magnitude as `meeting approve` (Phase C item 2 is
about backgrounding both). Don't add latency-mitigation here; it
shares the future queue.

**Acceptance.**
- `arete topic refresh --slugs <list> --source <digest-path>` exists
  and is called by `slack-digest/SKILL.md` Phase 5 (after digest
  file is written, before `arete index`).
- A slack digest approving a thread that references
  `cover-whale-templates` produces a new entry in
  `cover-whale-templates.md`'s `sources_integrated` referencing the
  digest file path; the narrative reflects the digest content.
- Re-running the skill on the same Slack window is a no-op against
  topic pages (content-hash idempotency via `hashSourceBody`).
- `--skip-topics` honored (mirrors `meeting approve`).

### 4. Test coverage — CLI integration with AI mock

**Problem.** Phase C item 5 (AI-mock CLI infra) is a separate plan
item that may not land before this. The 2026-04-23 learnings memo
explicitly flagged the cost of shipping LLM-orchestration code with
service-layer-only tests: `aliasAndMerge` was dark code,
`refreshAllFromMeetings` was lock-asymmetric. Repeating that here
guarantees we re-discover the same class of bugs.

**Approach — concrete and constrained.** This plan does not block
on Phase C item 5. It ships its own minimal AI mock layer scoped
to the slack-digest path:

1. **Service-level tests** (existing `topic-memory.test.ts` style):
   - `discoverTopicSources` returns both meeting + slack-digest
     entries; deterministic order; tolerates missing dir.
   - `parseMeetingFile` parses a slack-digest fixture without error
     (regression guard against future parser changes that
     accidentally re-introduce attendee or title strict-validation).
   - `hashSourceBody` is stable against frontmatter edits on a
     slack-digest fixture.
   - `refreshAllFromSources` with mixed sources updates a topic
     page's `sources_integrated` with both kinds.

2. **CLI integration test** (the one that would have caught the
   parent plan's dark code):
   - New file `packages/cli/test/commands/topic-refresh-slack.test.ts`.
   - Fixture: workspace with one existing topic page + one
     slack-digest in `resources/notes/`.
   - Inject a fake `services.ai.call` that returns scripted JSON
     responses keyed by prompt-shape (one for `integrateSource`,
     returning a valid `IntegrateOutput`).
   - Run `arete topic refresh --slugs <slug> --source <digest>`.
   - Assert: topic file's `sources_integrated` grew by one;
     `Change log` has a new entry; LLM was called exactly once.

3. **Ah-mock injection point.** The `AIService` already has
   `AIServiceTestDeps` (`packages/core/src/services/ai.ts:64`) for
   DI. Wire a CLI-test helper that constructs a services bundle
   with a `completeSimple` stub returning a queue of canned
   responses. This is the smallest viable AI-mock harness; if Phase
   C item 5 lands later, the harness here either becomes its
   foundation or gets replaced wholesale (low cost — one test
   file).

4. **Dark-code grep gate (process, not code).** Before merge:
   `rg -n 'discoverTopicSources|parseSlackDigestFile|refreshAllFromSources'
   packages/{cli,core}/src` and verify each new export has a non-
   test caller. Add this to the plan's review checklist.

**Acceptance.**
- All four service-level tests pass.
- The CLI integration test passes against a fake `services.ai.call`.
- A pre-merge grep verifies every new export has at least one
  production caller.
- Test fails meaningfully if Hook 2 wiring regresses (e.g.,
  `--skip-topics` accidentally always-on).

### 5. Backfill — explicit non-goal for Phase 1

**Problem.** Existing slack-digest files in arete-reserv lack
`topics:` frontmatter. After this plan ships, they remain invisible
to `discoverTopicSources` (the discovery loop reads
`fm.topics`; missing → skip) until a backfill happens.

**Approach.** **Explicit non-goal in this plan.** Backfill follows
the same pattern as Phase C item 6 (historical meeting backfill)
and should ride that plan's infrastructure. The skill-side change
(Step 1) only affects future digests; old digests are silently
ignored by the topic refresh path until backfilled.

If users complain about gaps in topic narratives that should have
captured Slack content, they can run `arete slack-digest --days-
back=N` to re-process old windows; that produces fresh digests
with `topics:` populated, which the topic refresh then picks up.
Document this as the manual-recovery path.

**Acceptance.**
- Plan's "Out of scope" section explicitly names backfill of
  pre-existing digests.
- README/SKILL.md notes the manual re-process path
  (`--days-back=N`) as the workaround.
- Phase C item 6's plan, when written, addresses meeting AND
  slack-digest backfill in one motion.

### 6. Documentation + naming alignment

**Problem.** The phase-c seed (item 8) referred to
`resources/slack-digests/*.md`; the actual path is
`resources/notes/*-slack-digest.md`. PATTERNS.md, area-memory docs,
and the topic-wiki-memory parent plan all describe the substrate
as "meetings only." Shipping Steps 1–5 without updating those
creates contradictions.

**Approach.**
1. **`packages/runtime/skills/PATTERNS.md`** — `topic_page_retrieval`
   pattern's Inputs section gains "slack-digest" as a recognized
   source type alongside meetings.
2. **`packages/runtime/skills/slack-digest/SKILL.md`** — Phase 2c
   gains topic extraction; Phase 5 gains the topic-refresh call.
3. **`packages/runtime/skills/slack-digest/SKILL.md` references
   section** — add `arete topic refresh` to the CLI list.
4. **`packages/runtime/rules/cursor/agent-memory.mdc`** — already
   updated to include topics; add a sentence that topic sources
   include slack-digests.
5. **`dev/work/plans/topic-wiki-memory-phase-c/plan.md`** — fix the
   factual error in item 8 about the slack-digest path. (One-line
   diff. Cite this plan as the resolution.)

**Acceptance.**
- All five files updated in one commit; diff reviewed.
- Grep for "meeting" in `topic-memory.ts` doc comments — anything
  describing the substrate as meetings-only gets rewritten.

## Risks & open questions

- **Per-thread vs. per-digest topic-slug aggregation.** Picked
  per-thread extraction with per-digest union for `sources_integrated`.
  Trade-off: a slug from one thread sees the whole digest's content
  during integration. Mitigation: `integrateSource`'s LLM prompt is
  already trained to update only sections the new source
  substantively changes. If this proves too noisy in practice (e.g.,
  unrelated thread content leaks into topic narratives), the next
  iteration introduces a per-thread source-segment abstraction —
  but that breaks the file-as-source content-hash invariant and
  needs its own plan.

- **`refreshAllFromMeetings` rename tension.** Picked
  `refreshAllFromSources` over keeping the misleading name. Nine
  call sites including `packages/apps/backend/src/routes/meetings.ts:244`
  — the backend route was missed in plan v1 and pre-mortem; without
  catching it the rename silently breaks the backend's topic
  refresh. Pre-merge gate: `rg -n 'refreshAllFromMeetings' packages/`
  must return 0 hits. If the rename produces test surprises, fall
  back to keeping the name and adding a TODO — but that bakes in
  long-term confusion.

- **Interaction with `slack-evidence-dedup`'s `'slack-resolved'`
  reservation.** That plan reserves `'slack-resolved'` as an L2
  `ItemSource` for commitment/decision dedup. **No conflict here**:
  this plan never touches `ItemSource` and never reserves a string.
  L3 topic integration uses `sources_integrated[].path` (a file
  path, not a typed source token). Coordination point: both plans
  read slack-digest frontmatter; if `slack-evidence-dedup` adds
  fields (e.g., commitment IDs), this plan ignores them.

- **`arete topic refresh --source` semantics.** Today
  `topic refresh --slugs` does a slug-scoped sweep across ALL
  meetings. With slack digests in scope, the same call would
  re-integrate every digest tagged with that slug. That's
  correct (idempotent via content hash) but means a `--source`
  flag is just a label-for-logging hint, not a behavioral
  filter. Document explicitly so users don't assume `--source`
  scopes to "this one file."

- **Non-determinism of skill output.** The skill is markdown-
  authored — its "test" is "the user runs it and the output looks
  right." Step 4's CLI integration tests cover the post-skill code
  path; the skill's prompt itself (Step 1) is not unit-testable.
  Mitigation: the skill prompt borrows verbatim from
  meeting-extraction's bias block (which IS exercised by tests),
  and the topic-extraction output is constrained by `aliasAndMerge`
  on the receiving end (Step 3). A misshapen slug from the skill
  is normalized or dropped, not corrupted.

- **Cost surprise on first run.** Each newly-tagged digest spends
  1.5–6s + ~$0.015 × N_topics on the next `slack-digest` run. If a
  user runs the skill on a 7-day window after this ships, that's
  ~7 digests × ~3 topics × ~$0.015 = ~$0.30. Acceptable; document
  in SKILL.md.

- **Concurrent topic refresh from meeting approve + slack-digest
  approve.** Both paths acquire `.arete/.seed.lock` via
  `refreshAllFromSources`. **Pre-mortem correction**: the lock is
  `O_CREAT|O_EXCL` non-reentrant (`packages/core/src/services/seed-lock.ts:54`),
  not symmetric/queueing — concurrent runs fail-fast. `meeting approve`
  has a catch+warn fallback. Slack-digest skill must mirror that
  pattern: catch the lock-held error and surface a clear "topic
  refresh deferred — re-run when current operation completes"
  message rather than crashing the whole skill flow. Step 3's
  `arete topic refresh --slugs ... --source ...` invocation must
  set the skill's exit policy to "non-fatal on lock contention."

## Notes

- **Sequencing relative to Phase C items.**
  - Item 5 (AI-mock CLI test infra) is *complementary* — Step 4
    here ships a minimal scoped harness; if item 5 lands first,
    use its harness instead. If item 5 lands second, it can adopt
    or replace this plan's harness. Don't gate on each other.
  - Item 6 (historical meeting backfill) absorbs slack-digest
    backfill (per Step 5). Coordinate so item 6's plan covers
    both.
  - Item 2 (background queue for Hook 2) absorbs slack-side Hook 2
    too. No special wiring needed there — once the queue exists,
    `arete topic refresh --slugs` calls it through the same path.
  - Item 8 in phase-c (this plan) gets updated to point at this
    plan once accepted.

- **Sizing estimate.** ~3 days of focused work:
  - Step 1 (skill edit + new CLI flag): 0.5 day
  - Step 2 (rename + discovery widening + parser): 1 day
  - Step 3 (CLI flag + skill wiring): 0.5 day
  - Step 4 (test coverage incl. CLI mock harness): 1 day
  - Steps 5–6 (docs, non-goal calls, fix phase-c plan): 0.25 day

- **Out of scope explicitly.**
  - Backfill of pre-existing slack-digests (deferred to Phase C #6).
  - Per-thread source segments in `sources_integrated[]` (defer
    until proven necessary by topic-narrative noise).
  - Cursor AGENTS.md wiring of slack-source provenance (separate
    Phase B follow-up; orthogonal).
  - Generalizing `refreshAllFromSources` into a fully source-
    agnostic engine (e.g., adding `notes/*.md` non-digest files,
    capture-conversation outputs). Two source types is not enough
    abstraction pressure; revisit on the third.

### Critical files for implementation

- `/Users/john/code/arete/packages/core/src/services/topic-memory.ts`
- `/Users/john/code/arete/packages/runtime/skills/slack-digest/SKILL.md`
- `/Users/john/code/arete/packages/cli/src/commands/topic.ts`
- `/Users/john/code/arete/packages/core/src/services/meeting-context.ts` (parser reused, not extended)
- `/Users/john/code/arete/packages/apps/backend/src/routes/meetings.ts` (rename target)
- `/Users/john/code/arete/packages/core/src/services/seed-lock.ts` (non-reentrant lock; skill needs catch+warn)
- `/Users/john/code/arete/packages/cli/test/commands/topic-refresh-slack.test.ts` (new)
