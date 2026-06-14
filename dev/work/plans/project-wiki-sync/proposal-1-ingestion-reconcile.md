# Proposal 1 — Ingestion & Reconcile Architecture: published project docs as first-class L1 sources

Status: DESIGN PROPOSAL (no code) · 2026-06-13 · lane: INGESTION & RECONCILE
Siblings (referenced, not designed here): (B) publish lifecycle / verbs / triggers · (C) cross-project continuity / retrieval

> Scope note. This proposal answers ONE question: how does a published project doc
> (`projects/active/<slug>/outputs/*.md`) enter the EXISTING extraction→reconcile
> pipeline as an L1 source, and how is the reconcile step extended to handle the three
> ways PRDs are harder than meeting transcripts — supersession-by-omission, source
> authority/tier, and document versioning. It does NOT design the publish verb (B) nor
> the read-side retrieval/continuity surface (C); it names the seams where they connect.

---

## 1. Problem

### 1.1 What exists today (verified against code)

The wiki has exactly one writer, and one source-discovery loop feeds it:

- **Source discovery** — `discoverTopicSources(paths, storage)` (`packages/core/src/services/topic-memory.ts:1163`) scans exactly two directories: `resources/meetings/*.md` (filename `^\d{4}-\d{2}-\d{2}`) and `resources/notes/{date}-slack-digest.md` (`SLACK_DIGEST_FILENAME_RE`, `topic-memory.ts:1109`). Each file is parsed via `parseMeetingFile` (`meeting-context.ts`), and the frontmatter `topics:` array decides which topic pages it feeds. The returned `SourceDiscoveryEntry` (`topic-memory.ts:1116`) carries `{ path, date, content, type: 'meeting' | 'slack-digest', topics }`. Critically, **`type` is set by which directory the file lives in, NOT by parsing, and nothing downstream branches on it** (`topic-memory.ts:1131-1133` doc comment says so explicitly).

- **Per-source integration** — `refreshAllFromSources` (`topic-memory.ts:1238`) walks each target slug, collects sources whose `topics:` intersect `{canonicalSlug} ∪ aliases` (`topic-memory.ts:1335-1342`), and calls `integrateSource` (`topic-memory.ts:1551`) per (topic, source) pair in date-ascending order.

- **The reconcile step itself** — `integrateSource` is the entire "reconcile" surface for the wiki. It:
  1. Computes a **body hash** of the source (`hashMeetingSource`, `topic-memory.ts:604`, excludes frontmatter) and **skips if already in `sources_integrated[]`** (`topic-memory.ts:1567-1577`) — pure append-once idempotency.
  2. Sends the existing page + new source + filtered L2 to an LLM with the prompt `buildIntegratePrompt` (`topic-memory.ts:758`). The instruction is: *"Integrate it into the existing page by updating ONLY the sections the new source substantively changes"* and *"Omit section keys that don't change. Do not re-emit unchanged content."* (`topic-memory.ts:768`, `:795`).
  3. Applies the output via `applyIntegrateOutput` (`topic-memory.ts:615`): overwrites only the sections the LLM returned, **prepends** a Change log line, **appends** open-questions / known-gaps (dedup by exact line), and **appends** the source to `sources_integrated[]`.

- **Retrieval** — `retrieveRelevant` (`topic-memory.ts:1734`) ranks `qmd_score × 0.6 + recency_bonus + area_bonus` (`topic-memory.ts:1802-1813`). `RECENCY_BONUS_30D = 0.2`, `RECENCY_BONUS_90D = 0.1` (`topic-memory.ts:1705-1706`). **Recency is a first-class ranking signal; source authority is not represented at all.** Same in the no-provider fallback (`brief-assemblers.ts:604-642`).

- **Topic-page schema** — `TopicPageFrontmatter` (`models/topic-page.ts:36`) carries `topic_slug, area?, status, aliases?, entities?, first_seen, last_refreshed, sources_integrated`. `TopicSourceRef` (`:25`) is `{ path, date, hash }`. There is **no field for source tier, no field for doc identity, no supersedes pointer**. Sections (`SECTION_NAMES`, `:52`) are `Current state, Why/background, Scope and behavior, Rollout/timeline, Open questions, Known gaps, Relationships, Source trail, Change log`.

### 1.2 Why this is structurally weak even on meetings

The integrate prompt is **monotonic-additive by construction**. It says "update only what changed" and "don't re-emit unchanged content." There is no instruction, schema field, or mechanism to *delete* a fact, and the Change log is prepend-only. The supersession-gap memory note is exactly right: there is no machinery for a fact to die. A meeting that *narrates* a reversal ("we're dropping SMS") can in principle cause the LLM to rewrite a section, but nothing forces it, nothing records the retraction structurally, and the old assertion can survive in an untouched sibling section. The chef-holistic-reconcile plan and supersession-gap project note both treat L2-item supersession as the live frontier; **the L3 topic-page layer has no supersession story at all today.**

### 1.3 Why PRDs are strictly harder than meetings (the core problem)

A published PRD differs from a transcript in three ways that each break a different assumption the current `integrateSource` relies on:

| # | Hard case | Assumption it breaks |
|---|---|---|
| 1 | **Supersession-by-omission** | The integrate prompt only acts on what the source *says*. A PRD declares a new world and is silent about the feature it cut. No contradiction token appears, so no section gets rewritten, and the old wiki fact orphans — valid-looking forever. Meetings at least sometimes narrate the change. |
| 2 | **Source authority/tier** | Retrieval and integration both lean on recency (`topic-memory.ts:1804`). A casual brainstorm meeting dated *after* a finalized PRD will out-rank and can erode the PRD's decision. A finalized PRD must outrank an offhand meeting **regardless of date**. |
| 3 | **Document identity/versioning** | `sources_integrated[]` is keyed by content hash and is append-only. PRD v2 hashes differently from v1, so it integrates as an *additional* source that *stacks* on v1's already-integrated facts. There is no "this is a new version of that document — retract the old one." Meetings are immutable distinct events; they have no v2. |

The agreed reframe holds: `outputs/` is a **SOURCE**, not a second wiki writer. We feed the existing pipeline. But "feed the existing pipeline" only delivers value if the pipeline can absorb these three cases. **Value ≈ reconcile quality**, and on these three axes the current reconcile is at zero. This proposal is mostly about the reconcile extension; the ingestion half is genuinely small.

---

## 2. Proposed approach

### 2.1 The shape of the win, stated up front

Two halves, very different sizes:

- **Ingestion (small).** Add a third source class — `published-doc` — to `discoverTopicSources` and the L1 surface. A published doc is a project `outputs/*.md` file carrying a small frontmatter contract (doc identity, version, source-tier, supersedes pointers, topics). Discovery flattens it into the existing `SourceDiscoveryEntry` shape so `refreshAllFromSources` iterates it uniformly. This is the same widening that the slack-digest source class already did (`topic-memory.ts:1083-1096`), and it is genuinely a small extension.

- **Reconcile (the real work).** Extend `integrateSource` from a monotonic-additive merge into a **tier-aware, ownership-scoped, version-retracting** reconcile. This needs new schema (tier + doc-owned fact pointers), a new prompt mode (full-replacement diff for high-tier docs), and a new human-in-the-loop beat. Most of it is new machinery, not a tweak.

### 2.2 Do NOT build a parallel extractor — but DO add a "doc digest" pre-pass

The single-pass-extraction benchmark (`dev/work/plans/single-pass-extraction/plan.md` §"Why now", `benchmark-evidence.md`) showed that a naive single holistic pass beat the accreted pipeline 5/5 on misses. The lesson for PRDs: **do not write a PRD-specific extraction pipeline.** A PRD is already structured prose; the integrate LLM can read it directly the way it reads a transcript.

But there is one asymmetry worth a cheap pre-pass. A transcript is fed either raw or via a per-meeting summary (`loadMeetingSummaryBody`, `topic-memory.ts:1053`, the Phase 1 §c summary-first swap). A long PRD (often >8k tokens) integrated against N topic pages would be re-sent N times. So mirror the summary-first pattern: on publish (sibling B's verb), generate **one per-doc digest** at `.arete/memory/summaries/docs/<doc-id>.md` capturing, per topic the doc touches: the doc's *current declared facts* for that topic, plus an explicit **`asserts` / `retracts` / `silent-on` classification** the LLM produces while it still has the whole doc in attention. This digest is what powers omission detection (§3). The idempotency hash still anchors on the source body (same trick as `topic-memory.ts:1592-1601`) so regenerating the digest doesn't bust dedup.

This keeps us inside the "ONE reconcile pass" target of chef-holistic-reconcile (D1) — the doc digest is a *gather/extract* artifact, not a second reconcile brain. The reconcile still happens in one place (`integrateSource` / the chef pass).

### 2.3 Published-doc frontmatter contract (what a published doc MUST carry)

Sibling B owns *writing* this on publish. Sibling A (this proposal) owns *consuming* it. The contract:

```yaml
---
type: published-doc            # the source-class discriminator (parallels slack-digest)
doc_id: glance-2-roadmap/prd   # STABLE identity across versions — see §5.1
doc_version: 3                 # monotonic int; v(n) retracts v(n-1)'s owned facts
source_tier: finalized         # finalized | published-draft | working   — see §4.1
supersedes_docs: []            # OPTIONAL explicit doc_ids this doc replaces wholesale
project: glance-2-roadmap      # provenance / area resolution
area: glance-operations        # for the area-match retrieval bonus
topics: [glance-mvp-scope, liability-determination, roadmap-sequencing]
published_at: 2026-06-13       # the "date" used for ordering/recency, NOT mtime
---
```

Notes:
- `doc_id` is the **identity** axis (§5). `doc_version` is the **versioning** axis. `source_tier` is the **authority** axis (§4). `topics:` is the routing axis (unchanged mechanism). These four new keys are the entire ingestion-side contract.
- `topics:` runs through the **same alias-coercion path meetings use** (`meeting-frontmatter.ts:42-43`, `aliasAndMerge`, `topic-memory.ts:428`) — published docs do not get a private slug namespace. Sibling B should call `topicMemory.aliasAndMerge` on the doc's proposed topics before writing frontmatter, exactly as `meeting-apply` does.
- `published_at` (not file mtime) is the ordering key, so re-saving a file doesn't reorder the ledger.

### 2.4 Ingestion wiring (the small extension)

`discoverTopicSources` (`topic-memory.ts:1163`) grows a third block, structurally identical to the existing two:

```
const docsDir = pathJoin(paths.projects, /* scan active/*/outputs/ */);
for each outputs/*.md whose frontmatter type === 'published-doc':
  entries.push({ path, date: published_at, content, type: 'published-doc',
                 topics, /* NEW: */ docId, docVersion, sourceTier, supersedes });
```

`SourceDiscoveryEntry` (`topic-memory.ts:1116`) gains optional `docId?, docVersion?, sourceTier?, supersedes?` fields — additive, so meeting/slack-digest entries leave them undefined and behave exactly as today. `refreshAllFromSources` already iterates entries source-agnostically; the only change is that when `entry.type === 'published-doc'` it routes through the **doc reconcile mode** (§2.5) instead of the transcript path.

One real decision: **published docs must be in the qmd index** for retrieval (sibling C's concern), but they live under `projects/`, not `.arete/memory/`. The wiki retrieval path filters strictly to `.arete/memory/topics/` (`topic-memory.ts:1775`). Published docs feed the *topic pages*; the topic pages are what's retrieved. So no index change is needed for the wiki path — the doc's facts land in the topic page and are retrieved from there. (Sibling C may additionally want to retrieve the doc *directly*; that's their lane.)

### 2.5 Doc reconcile mode (the real work — overview; details in §3–§5)

When `integrateSource` receives a `published-doc` entry, it runs a different prompt + apply path than the transcript path:

1. **Resolve doc identity** — look up prior `sources_integrated[]` entries with the same `doc_id`. If a lower `doc_version` exists, this is a **version bump** (§5).
2. **Full-replacement diff, not incremental append** — for the sections a high-tier doc owns, the prompt asks the LLM to *rewrite the section to match the doc*, and to **emit explicit retractions** for facts present in the old page but absent from the doc (§3).
3. **Tier-gated writes** — the LLM's proposed rewrite is annotated with the doc's `source_tier`; a higher-tier assertion wins over a lower-tier incumbent regardless of date; a *lower*-tier doc may not silently overwrite a higher-tier incumbent fact (§4).
4. **Human-in-the-loop for retractions** — additive facts can auto-apply (today's behavior). **Retractions and supersessions are proposed, never auto-applied**, surfaced on the winddown/approval surface (§3.3, ties to John's CLI-review-surface preference and chef-holistic D7 "proposed-only stays sacred").

---

## 3. How it handles **supersession-by-omission**

This is the hardest of the three and gets the most machinery.

### 3.1 The mechanism: doc-scoped fact ownership + full-replacement diff

The root cause is that `integrateSource` only ever *adds*; it has no concept of "the doc is now the authority for this section, so anything here that the doc doesn't say is suspect." Fix it with **fact ownership scoped to a doc**.

**Schema addition — `owned_facts` on the topic page.** Extend the topic page so that sections (or, finer-grained, individual asserted facts) can record which `doc_id` currently *owns* them. Minimal viable form: a frontmatter map

```yaml
section_owners:
  Scope and behavior: glance-2-roadmap/prd@v3
  Rollout/timeline:    glance-2-roadmap/prd@v3
```

A section owned by a doc means: "the authoritative content of this section came from doc X version N." (Finer-grained per-bullet ownership is possible but §6 argues it's the over-engineered path; section-level is the right first cut.)

**The diff.** When a `published-doc` of tier `finalized` (or `published-draft`) integrates and claims a section it owns or is taking ownership of, the prompt switches from "update only what changed" to a **full-replacement diff**:

> Here is the current `Scope and behavior` section of the wiki page. Here is what the published doc `<doc_id>@v<n>` says about this topic's scope. Rewrite the section to match the DOC as the authority. For every distinct fact in the CURRENT section that the DOC does not assert or implies is no longer true, output it in `retracted_facts[]` with a one-line reason. Do not silently keep facts the doc omits.

This is the inversion of `buildIntegratePrompt`'s "don't re-emit unchanged content" (`topic-memory.ts:795`). For docs, the doc *is* the section's new content; omission is meaningful. The `silent-on` classification from the doc digest (§2.2) tells the reconciler which topics the doc is authoritative-and-complete on (apply omission logic) vs merely mentions in passing (don't — a PRD that name-drops `email-templates` should not be treated as the authority that retracts email-template facts).

**Why the digest's `silent-on` field is load-bearing:** omission is only meaningful *within the doc's declared scope*. The doc digest, generated while the whole doc is in attention, classifies each touched topic as `authoritative` (doc fully specifies it → omission ⇒ retraction candidate) vs `mentions` (doc references it → omission is not signal). Without this, every PRD would "retract" every fact in every tangentially-related topic. This is the single most important design element for case 1.

### 3.2 Worked example

Wiki `glance-mvp-scope` currently asserts (from older meetings): "MVP includes SMS notifications." PRD v3 of `glance-2-roadmap` is published, owns `glance-mvp-scope`, and its scope section lists email + in-app only — SMS absent.

- Transcript path today: nothing fires. SMS fact orphans, looks valid forever.
- Doc reconcile mode: digest marks `glance-mvp-scope` as `authoritative` for this doc. Full-replacement diff sees "SMS notifications" in the current section, absent from the doc → emits `retracted_facts: [{fact: "MVP includes SMS notifications", reason: "PRD v3 scope omits SMS; doc is authoritative for glance-mvp-scope"}]`. This is **proposed** on the approval surface. John confirms; the section is rewritten, the Change log records `- 2026-06-13: SMS removed from MVP scope per glance-2-roadmap/prd@v3 (was: meeting 2026-05-04)`, and the retraction is logged to the memory-log `ingest` stream (`topic-memory.ts:1416`).

### 3.3 The human-in-the-loop beat

Retraction is destructive and omission-inference is fallible, so it cannot auto-apply. This aligns with chef-holistic-reconcile D7 ("the engine computes; the chef proposes; the user approves") and the CLI-review-surface memory ("John approves in CLI/editor, wants a markdown checkbox approval doc"). The beat:

- **Additive facts** (doc asserts something new) → auto-apply, same as today.
- **Retractions + supersessions** → written to a **proposed-retractions surface** (the markdown checkbox approval doc per the CLI-review memory; mechanically the same proposed surface chef-holistic-reconcile R4 already writes). Each carries `{retracted_fact, owning_doc, superseding_doc, reason, evidence}` — the D5/D10 provenance contract. Reject leaves the fact untouched (and records a `[[keep]]` directive so the next refresh doesn't re-propose it).

Where it sits in the flow: this is a reconcile-pass output, so it lands in the **winddown's proposed surface** when the wiki refresh runs as part of winddown, OR in a dedicated `arete doc publish --review` step (sibling B's verb). Either way the *computation* is in `integrateSource`/the reconcile pass; the *surface* is the existing proposed-items machinery.

### 3.4 Feasibility

The full-replacement-diff prompt is a **moderate** extension — it reuses the `parseIntegrateResponse` validator shape (`topic-memory.ts:525`) with one new array (`retracted_facts[]`). `section_owners` frontmatter is a small schema add. The genuinely new and risky piece is the **`authoritative` vs `mentions` classification** — get it wrong toward `authoritative` and PRDs nuke unrelated facts; toward `mentions` and omission never fires. This is the hardest risk (§7).

---

## 4. How it handles **source authority / tier**

### 4.1 The mechanism: a source-tier lattice that beats recency

**Schema addition — `source_tier` on `TopicSourceRef`** (`models/topic-page.ts:25`). `TopicSourceRef` gains optional `tier?: SourceTier` and `docId?`, `docVersion?`. `SourceTier` is an ordered enum:

```
finalized        (4)  — a published, finalized PRD/spec/decision doc
published-draft  (3)  — a published-but-marked-draft doc
meeting          (2)  — a meeting transcript / per-meeting summary
working          (1)  — working-folder doc, slack digest, casual note
```

Meetings and slack-digests get their tier assigned by source class in `discoverTopicSources` (meeting → `meeting`, slack-digest → `working`), so the field is populated for *all* sources without per-file frontmatter on legacy sources. Published docs carry their tier explicitly in frontmatter (§2.3).

### 4.2 Two places tier changes behavior

**(a) At reconcile time — tie-breaking on conflict.** When the doc reconcile (or the chef holistic pass) finds two sources asserting *contradictory* facts about the same section, the **higher tier wins regardless of date**. A finalized PRD (tier 4) dated 2026-06-01 beats a brainstorm meeting (tier 2) dated 2026-06-10. Concretely: the integrate/reconcile prompt is given the tier of the incumbent section owner and the tier of the new source, with the rule "a higher-or-equal-tier source may overwrite; a strictly-lower-tier source proposes a *correction candidate* but does not overwrite a higher-tier fact — it surfaces as 'a working note disagrees with the finalized PRD' for human resolution." This directly fixes "a later offhand meeting erodes a finalized decision."

**(b) At retrieval time — tier as a ranking term.** `retrieveRelevant` (`topic-memory.ts:1802`) currently scores `qmd × 0.6 + recency + area`. Add a **max-tier term**: each topic page records the max tier among its `sources_integrated[]` (or per-section, the owning doc's tier); ranking adds e.g. `+0.15` for a page whose authoritative content is `finalized`. This is additive and small — it nudges finalized-doc-backed pages above purely-meeting-backed pages of equal semantic match, without removing recency (a stale finalized page should still show its staleness label via `wikiStalenessLabel`, `brief-assemblers.ts:547`). Sibling C owns retrieval tuning; this proposal only flags that the tier field must exist for them to use.

### 4.3 The subtlety: tier ≠ truth, recency still matters within a tier

Authority must not become "the PRD is frozen forever." A *newer* finalized PRD (v3) beats an older finalized PRD (v2) — that's the versioning axis (§5), and it's the right precedence: **tier first, then version/recency within tier.** And a meeting can still legitimately update a PRD-owned fact when it *narrates a decision to change the PRD* — but that should produce a *proposed* update flagged "meeting contradicts finalized PRD; publish a doc update or confirm," not a silent overwrite. This keeps the PRD as the system of record while letting reality intrude through the human beat.

### 4.4 Feasibility

The schema field is a **small** add. Reconcile-time tie-breaking is **moderate** (a prompt rule + the incumbent-tier lookup). Retrieval re-ranking is **small** but lives in sibling C's lane. The conceptual risk is mis-tiering: a `published-draft` John forgot to promote to `finalized` will under-rank. Mitigation: tier is visible in the proposed surface and in `arete status` topic health, so mis-tiers are diagnosable, not silent.

---

## 5. How it handles **document identity / versioning**

### 5.1 The mechanism: doc_id identity + version-bump retraction

**`doc_id` is the stable identity across versions** (§2.3). v1, v2, v3 of the Glance roadmap PRD all carry `doc_id: glance-2-roadmap/prd` and increment `doc_version`. `sources_integrated[].docId` + `docVersion` (the §4.1 schema add) records which doc-version a page integrated.

**Version-bump detection.** When `integrateSource` sees a `published-doc` whose `doc_id` already appears in `sources_integrated[]` at a *lower* `doc_version`, it is a **version bump**, not a new source. This is detected by `doc_id` equality — distinct from today's body-hash idempotency (`topic-memory.ts:1567`), which would (wrongly) treat v2 as a brand-new source because the bytes differ.

**Retraction-on-bump.** A version bump triggers the §3 full-replacement diff *against the prior version's owned content specifically*: "v2 owned these facts in `Scope and behavior`; v3 is now authoritative; which v2 facts does v3 drop?" The dropped facts are retraction candidates (proposed, per §3.3). The `sources_integrated[]` entry for v1/v2 is **superseded-marked** (gains `superseded_by: glance-2-roadmap/prd@v3`) rather than deleted — so the source trail stays auditable and a future "what did v2 say?" query is answerable. This is the L3 analog of the L2 supersession the supersession-gap note describes; here the doc-version arc is *explicit in frontmatter*, so the reconciler doesn't have to infer the arc from timestamps.

**Idempotency interaction.** The body-hash skip (`topic-memory.ts:1567`) still guards re-running the *same* version (v3 integrated twice → skip). The doc_id+version check guards *bumps*. Both coexist: same hash ⇒ skip; same doc_id, higher version ⇒ version-bump reconcile; new doc_id ⇒ new source.

### 5.2 Worked example

`glance-2-roadmap/prd@v2` had been integrated, owning `Rollout/timeline` with "Phase 1 ships Q3." v3 is published with "Phase 1 ships Q4, Phase 0 added." Discovery sees `doc_id` already integrated at v2 < v3 → version bump. Diff against v2's owned timeline → retracts "Phase 1 ships Q3" (proposed), asserts Q4 + Phase 0 (the Q4 assertion can auto-apply as it's a same-owner update; the retraction of Q3 is proposed). v2's source entry gets `superseded_by: ...@v3`. Change log: `- 2026-06-13: timeline updated per glance-2-roadmap/prd@v3 (supersedes v2: Q3→Q4)`.

### 5.3 Feasibility

`doc_id`/`docVersion` on `TopicSourceRef` + the version-bump branch in `integrateSource` is a **moderate** extension — it's a new code path but a well-bounded one (an equality check + a routing decision). `superseded_by` marking is a **small** schema add. The hard part is shared with §3 (the diff itself), not unique to versioning.

---

## 6. What's a small extension vs. what's new machinery

| Element | Size | Why |
|---|---|---|
| `published-doc` source class in `discoverTopicSources` | **Small** | Exact replay of the slack-digest widening (`topic-memory.ts:1083-1227`). |
| Frontmatter contract (`doc_id, doc_version, source_tier, supersedes_docs`) on published docs | **Small** | Additive YAML; written by sibling B; consumed in discovery. |
| `tier?, docId?, docVersion?, superseded_by?` on `TopicSourceRef`; `section_owners` on page frontmatter | **Small–moderate** | Additive schema; `parseTopicPage`/`renderTopicPage` (`models/topic-page.ts`) round-trip extension; all-optional so legacy pages parse unchanged. |
| Per-doc digest pre-pass with `asserts/retracts/silent-on` classification | **Moderate** | Mirrors `loadMeetingSummaryBody` summary-first pattern (`topic-memory.ts:1053`); but the classification prompt is new and accuracy-critical. |
| Tier-as-ranking-term in retrieval | **Small** | One additive term in `retrieveRelevant` re-rank (`topic-memory.ts:1802`) — **sibling C's lane**. |
| Version-bump detection + routing in `integrateSource` | **Moderate** | New branch, bounded logic. |
| **Full-replacement-diff prompt + `retracted_facts[]` + omission inference** | **NEW MACHINERY** | This is the genuinely new reconcile capability. The current pipeline has *no* concept of a fact dying (§1.2). Needs prompt design, the `authoritative`/`mentions` gate, validator extension, and a golden-doc eval harness. |
| Proposed-retraction approval surface | **Moderate** | Reuses chef-holistic R4 proposed-items machinery + the CLI-review markdown-checkbox doc; the *surface* exists, the *retraction item type* is new. |

**Honest bottom line on feasibility against the current reconcile:** the current `integrateSource` is a monotonic-additive merge with append-only logging. Cases 2 (tier) and 3 (versioning) are *bolt-on* — they add fields and routing to a path that already exists. Case 1 (omission) requires a **net-new reconcile behavior** — inferring deletion from absence — that the codebase has nowhere today, including in the L2 layer the chef-holistic plan is still trying to get right. So this proposal is roughly 30% small extension, 30% moderate routing, and 40% genuinely new and risky (the omission machinery + its accuracy gate).

**Sequencing recommendation.** Land ingestion + tier (cases 2, partial 4) + explicit versioning (case 3) **first** — they deliver real value (finalized PRDs stop being eroded by offhand meetings; v2 retracts v1's facts when the doc *explicitly* lists supersedes) with bounded risk and no destructive auto-inference. Land omission-by-absence (case 1) **last**, behind a flag, proposed-only, with a golden-doc eval — because it's the one that can silently corrupt the wiki, and it depends on a classification accuracy we have no data on yet. This mirrors the single-pass / chef-holistic posture: ship the safe structural part, gate the inference part behind a soak.

---

## 7. Hardest risk (single, explicit)

**The `authoritative`-vs-`mentions` scope classification is the load-bearing inference for omission, and getting it wrong is silently destructive.**

Omission-as-retraction (§3) only works if the system correctly knows, for each topic a doc touches, whether the doc is the *complete authority* on that topic (so absence ⇒ retraction) or merely *references* it (so absence ⇒ nothing). This is a judgment call the LLM makes in the doc digest. The two failure modes are asymmetric and both bad:

- **Over-claim `authoritative`** → a PRD that mentions `email-templates` in passing gets treated as the authority and proposes retracting real email-template facts. With section-level ownership and proposed-only gating, this surfaces as bogus retraction proposals — annoying, reviewable, recoverable. *But at volume the review burden itself defeats the feature* (the same approval-budget concern single-pass-extraction AC11 flagged), and a tired reviewer rubber-stamps a bad retraction.
- **Under-claim `mentions`** → omission never fires; we're back to the status quo where cut features orphan forever. Silent, and the whole point of case 1 is lost.

This is *the* supersession-gap risk (project memory: "risk = dedup hiding the arc by collapse-to-oldest") re-expressed at the L3 doc layer: the dangerous direction is silent data change the user never sees to correct. The chef-holistic plan's answer (AC6: a sampled re-audit, **0/10 hard bar**, not just unmerge events) is the right model here — a false retraction *hides* the fact, so user-correction events alone are blind to it. A golden-doc eval (a real PRD v1→v2→v3 chain with hand-verified asserts/retracts/silent-on per topic) plus a sampled re-audit of auto-applied changes must gate turning omission-inference on. Until that bar is met, omission stays proposed-only and flag-gated; tier + explicit-versioning (the safe 60%) ship without it.

Secondary risk worth naming: **mis-tiering by the human** (a `published-draft` never promoted to `finalized`) silently under-ranks a real authority — mitigated by surfacing tier in `arete status` and the proposed surface, but worth a lint that flags long-lived `published-draft` docs whose project is closed.

---

## 8. Open questions

1. **Ownership granularity.** Section-level `section_owners` is the proposed first cut. Per-bullet/per-fact ownership would make omission detection far more precise (a doc can own *part* of a section) but multiplies schema and prompt complexity. Is section-level precise enough for real PRDs, or do PRDs routinely co-own a section with meetings? (Needs a look at 2–3 real `outputs/` docs against their topics — `bisr-letters-project/outputs`, `claims-review-generator/outputs` exist today but I did not inspect their contents in this pass.)

2. **Where does the doc digest get generated — publish-time or refresh-time?** Publish-time (sibling B's verb) means the digest is fresh and the whole doc is in attention once; refresh-time means it's regenerated with current wiki context but re-pays the cost. The summary-first precedent (`topic-memory.ts:1053`) is read-at-refresh. Leaning publish-time for the classification, refresh-time for the integrate — but this straddles the A/B boundary and needs joint resolution.

3. **`supersedes_docs` explicit pointer vs. inferred supersession.** §2.3 allows a doc to *explicitly* name docs it replaces. When present, supersession is deterministic (no inference). Should we *require* it for cross-doc supersession (safe, but burdens the author) and reserve inference only for same-`doc_id` version bumps? That would shrink the risky-inference surface (§7) substantially — version bumps are deterministic; cross-doc supersession becomes author-declared. **This may be the single best risk-reducer and is worth deciding early.**

4. **Tier of a meeting that ratifies a doc.** If a meeting explicitly says "we're approving the PRD as final," should that promote the doc's tier, or is tier strictly a property of the doc's own frontmatter? Likely the latter (tier = doc metadata) with the meeting producing a *proposed tier bump* — but it interacts with sibling B's lifecycle verbs.

5. **Interaction with the chef holistic pass.** chef-holistic-reconcile (D1) wants ONE reconcile brain over the day's ledger. Does published-doc reconcile run *inside* that pass (the doc becomes another ledger source with tier), or as a separate `arete topic refresh`-style pass? Cleanest is: the doc is a ledger entry the chef pass already reconciles, and the §3–§5 mechanisms become *rules the engine applies* (parallel to its Rule 1–4). That keeps "one brain" intact but means this proposal's machinery should be specified as engine rules, not a separate code path — worth confirming with whoever owns the chef-holistic build.

6. **Closed-project docs.** When a project closes (`finalize-project`), do its `outputs/` docs stay live L1 sources, freeze at their last version, or archive? A finalized PRD for a shipped feature is *the* authority and should stay live; a working doc should probably stop feeding. This ties to the project lifecycle (sibling B) and the wiki-repair "project-fed landing pads" band (`rescue-proposal-v2.md` — 23 pages kept frozen precisely because projects don't yet flow to the wiki; this proposal is what un-freezes them).
