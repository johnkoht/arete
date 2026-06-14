---
status: ready
branch: fix/project-index-scope-active-topics
created: 2026-06-13
revised: 2026-06-14 (real-workspace investigation → inverted WS-B model)
supersedes_approach: ignore-patterns (rejected); published-allowlist partition (rejected — see changelog)
---

# Plan: Project search hygiene — down-rank scratch, label where confident

## Goal
When working — in a `/guide` session or `arete search` — a half-baked draft
should not outrank a real decision, and the agent (and you) should be able to
tell scratch from durable content. Achieve this WITHOUT changing what's indexed
and WITHOUT hiding any folder: `working/` stays fully searchable (it's where
real iterative work happens — discussion, edits, v1→v2→v3), it just ranks below
durable content and is labeled.

Two independent workstreams:
- **WS-A (ship first, self-contained):** fix the dead Active-Topics recency
  filter so durable-but-quiet topics survive boot.
- **WS-B:** in the `arete search` pipeline, **down-rank `working/` results** and
  attach provenance **labels** where we're confident. No qmd/index changes.

This is the cheap, retrieval-side slice of the "source authority" idea in
`proposal-1-ingestion-reconcile.md`.

## Changelog
- 2026-06-13 (eng-lead review): WS-A snippet/fixtures corrected; WS-B relocated
  from `providers/qmd.ts` to `cli/commands/search.ts` (the real `arete search`
  path); plural folder names; both archive shapes; "never mutate score."
- 2026-06-14 (real-workspace investigation, 23 projects): **inverted the WS-B
  model.** The published-allowlist + stable-partition approach was rejected — see
  WS-B "Why inverted." Net: ranking is now binary (only `working/` sinks);
  labels are partial-and-honest; the qmd index is not touched at all.

## What is NOT changing
The qmd index is untouched. The `projects` collection (`arete-da59-projects`,
pattern `**/*.md`) and the `all` collection both ALREADY index the whole
`projects/` tree including `working/` — so `working/` is already searchable
today (that was the original noise). WS-B adds no indexing, removes nothing, and
edits no qmd/collection config. All logic is post-query in `search.ts`. The
abandoned `ignore`-pattern approach (and dot-folder variant) are dead.

---

## WS-A — Active Topics recency filter

### Problem
`getActiveTopics` (`packages/core/src/models/active-topics.ts:66-113`) should
keep a topic at boot if `openItems > 0` OR refreshed within 90d. But the live
path `loadMemorySummary` (`packages/core/src/services/memory-summary-loader.ts:35`)
never passes `openItemsBySlug` (callers `update.ts:71`, `intelligence.ts:519`,
`meeting.ts:1298` omit it), so `openItems` is always 0, the OR branch is dead,
and the filter (`active-topics.ts:83`) collapses to recency-only. A
durable-but-quiet topic (e.g. a status-letter thread revisited 6 months later)
silently drops off boot context. (See `proposal-3`.)

### Fix  — IMPLEMENTED (filter edit done in worktree)
Keep a topic when its status is durable, independent of recency.
`TopicStatus = new | active | stable | blocked | stale | archived`
(`topic-page.ts:17-23`). At `active-topics.ts:83`:
```ts
const status = page.frontmatter.status;
const durable = status === 'active' || status === 'stable' || status === 'blocked';
if (openItems === 0 && daysOld > recencyDays && !durable) continue;
```
`active`/`stable`/`blocked` = live → keep; `stale`/`archived` = age out; `new`
covered by recency (not durable).

### Out of scope (deferred): populating `openItemsBySlug` at the boot callers.

### Tests (`packages/core/test/models/active-topics.test.ts`) — TODO
- durable status + `daysOld>90` + `openItems 0` → kept (new).
- `stale`/`archived` + `daysOld>90` → dropped.
- `new` + `daysOld>90` + `openItems 0` → dropped (asserts new ≠ durable).
- **Fixture fix (must-do):** the existing "filters out stale topics" test (line
  36) uses the `page()` helper default `status:'active'` (line 16); under the
  new rule that page is now KEPT and the test breaks. Set its 'stale' fixture
  (line 39) to `status:'stale'`. Likewise set the "keeps stale topics that have
  open items" fixture (line 47) to `status:'stale'` so it still exercises the
  open-items branch rather than passing via durable-status.

---

## WS-B — Down-rank `working/`, label where confident (in `search.ts`)

### Where it lives
`arete search` shells out to `qmd query` and parses with its own
`parseQmdResults` (`cli/commands/search.ts:203`) → `SearchResultItem`
(`search.ts:68`) / `SearchOutput` (`search.ts:80`). It does NOT use
`providers/qmd.ts` (whose `semanticSearch` consumers are all wiki/entity/meeting
paths that filter project results out). **All WS-B logic is in `search.ts`.**

### Model: binary down-rank + honest labels
- **Ranking = binary.** `working/` results are **stable-sunk below all
  non-working results**; everything else keeps qmd's relevance order. Only
  `working/` moves.
- **Labels = partial and honest.** Tag only the confident tiers; leave the rest
  unlabeled rather than guessing.
- **Index untouched** (see "What is NOT changing").

### Why inverted (real-workspace investigation, 23 projects: 16 active, 7 archive)
The earlier "boost a published allowlist + stable-partition" model was rejected:
- The `inputs/working/outputs` convention holds for only ~74%; **durable content
  is scattered** — 100% of projects have authoritative `.md` at the project
  ROOT (`discovery.md`, `strategic-vision.md`, `pre-mortem.md`…), plus one-off
  durable folders (`skill/`, `plan/`, `rollout-strategy/`, `sessions/`,
  `prototypes/`, and project-specific names like `glance-2-lindsay-megadump/`).
- Enumerating "published" is a losing game and **over-fits to today's folders.**
- The partition order (published→reference→neutral→draft) would mis-order: your
  own root `discovery.md` (neutral) would sink BELOW someone else's `inputs/` PRD
  (reference). Wrong.
- The ONE reliable signal is the scratch one: `working/` (74%, unambiguous).
  Sinking `working/` puts ALL durable content (which sits at neutral) above
  scratch — goal achieved with zero enumeration, robust to new/weird folders,
  and correct for the common "durable doc at project root" case. Even the
  "no `outputs/` yet, only a `working/` draft" case is right (draft still
  surfaces, just lower + labeled).

### Classifier — `classifyProvenance(path)` (pure, testable)
Over the workspace-relative path, normalized `\`→`/` (mirror
`topic-memory.ts:1773`). `<seg>` = one segment matching `<slug>` OR
`YYYY-MM_<slug>` (both archive shapes per `area-integrity.ts:14-16`; real data
shows only `YYYY-MM_` in archive, but tolerate both — free):

| Result | Path                                                              | Rank effect |
|--------|-------------------------------------------------------------------|-------------|
| `draft`     | `projects/(active\|archive)/<seg>/working/…`                 | **sink**    |
| `published` | `projects/(active\|archive)/<seg>/outputs?/…`, project `README.md` | none (label only) |
| `reference` | `projects/(active\|archive)/<seg>/inputs?/…`                 | none (label only) |
| _undefined_ | everything else (root docs, `skill/`, `plan/`, the tail, non-project) | none |

Notes:
- `inputs?`/`outputs?` tolerates `notion-refactor`'s singular `input/`/`output/`.
- `README.md` is `published` ONLY at `projects/(active|archive)/<seg>/README.md`
  — workspace READMEs (`context/README.md`, `inbox/README.md`) stay undefined.
- **Denylist is minimal — only `working/`.** `prototypes/` and `sessions/` stay
  neutral (primary design history / research data, not the abandoned-brainstorm
  failure mode; 1 project each). Expand the denylist later only if proven noisy.

### Mechanism (in `search.ts`)
1. Add optional `provenance?: 'published'|'reference'|'draft'` to
   `SearchResultItem` (`:68`) and the `SearchOutput`/`--json` schema (`:80`);
   populate at `parseQmdResults` (`:203`). Carry it through the person-filter
   (`:709`) and renderer.
2. After `minScore`/person filters: **stable-partition into [non-draft …,
   draft …]**, each side preserving qmd relevance order; then take top-N.
3. **Never mutate the displayed `score`** (rendered `(score*100)%` at `:757`) —
   order only.
4. Render label tag in human output (`[draft]`/`[published]`/`[reference]`;
   none when undefined); include `provenance` in `--json`.
5. One line of agent guidance (`generators/claude-md.ts:124`/AGENTS.md): `draft`
   = exploratory, don't treat as decision; `published`/`reference` = as marked;
   no label = normal project content, judge on content.

### Out of scope: version inference inside `working/` (human marks v1/v2/v3;
whole folder is `draft`). No `/publish`, no wiki reconcile, no index changes.

### Tests
- `classifyProvenance`: `working/` (plural + singular) → draft; `outputs?/` &
  project `README.md` → published; `inputs?/` → reference; root `discovery.md`,
  `skill/`, `plan/` → undefined; `YYYY-MM_<slug>` archive; Windows `\`;
  `context/README.md` → undefined; nested `outputs/sub/x.md` → published.
- `arete search`-level: a `working/` hit with HIGHER base relevance still ranks
  below a non-working hit; non-working order unchanged; displayed `score`
  unchanged; label present in text + `--json`.

---

## Sequencing
1. WS-A — finish (tests + fixture fixes); filter edit already done.
2. WS-B Phase 1 — `classifyProvenance` module + `search.ts` integration
   (type, populate, stable down-rank, tests).
3. WS-B Phase 2 — label rendering (text + `--json`) + agent-guidance line.

Each phase independently shippable; diffs reviewed in worktree before commit.
Stop at the merge gate — no autonomous merge to `main`.

## Risks
- **Label pass-through** — `provenance` must survive the person-filter (`:709`)
  and truncation. Covered by the search-level test.
- **`--json` schema** — `provenance` is an additive, public-ish field; note it.
- **Denylist too narrow** — accepted: start minimal (`working/` only), expand if
  real noise appears. Low risk since index is unchanged.

## Relation to broader design
Safe, shippable floor under `proposal-1/2/3` and `[[project_published_doc_sync]]`
— makes the durable/scratch distinction real at retrieval time, the precondition
that later makes a `/publish` verb meaningful.
