# Proposal 2 — Publish Lifecycle, Verbs & Triggers

> Design proposal only. No code changes. Lane: the user-facing lifecycle and
> trigger model for turning project work into published, indexed, wiki-fed
> knowledge — folder discipline, the verbs, the approval beats, and the
> automatic-vs-gated split.
>
> **Out of lane (referenced, not designed here):**
> - **Sibling A — ingestion/reconcile internals**: the actual extraction of a
>   published doc's facts into L2/L3 (the "reconcile pass" `/publish` *offers*
>   and `/finalize-project` *runs*). I define the trigger and approval envelope;
>   A owns what happens inside the reconcile. The wiki writer itself is A's turf.
> - **Sibling C — cross-project continuity/retrieval**: reopen / spin-a-connected-project,
>   sibling-project edges, and how published `output/` docs are retrieved later.
>   I hand C a clean "durable, searchable, area/topic-tagged" `output/` corpus.

---

## 0. Grounding (what exists today)

The shipped project trio and its conventions, read in full:

- `/project` → `arete project open <name>` — READ-ONLY brief, zero writes
  (`packages/cli/src/commands/project.ts:313-444`; skill
  `packages/runtime/skills/project/SKILL.md:29`).
- `/update-project` → `arete project refresh-topics --apply` — writes ONLY the
  README `topics:` cache; preview by default; change-gated zero-write on no-op;
  reindexes qmd after a real write (`project.ts:199-307`; service
  `packages/core/src/services/project-topics.ts`; skill
  `packages/runtime/skills/update-project/SKILL.md`).
- `/finalize-project` — terminal: context updates + memory retro + archive move
  + "prompt user to run `qmd update`" (`packages/runtime/skills/finalize-project/SKILL.md:184-231`).

Two house conventions this proposal must match exactly:

1. **CLI verb shape** (`project.ts:13-15`, cli LEARNINGS): `findRoot` guard;
   `--json` complete in *all* exit paths; preview-by-default with `--apply`;
   `--skip-qmd`; `loadConfig` + `refreshQmdIndex` BEFORE the JSON return and
   **only on an actual write** (`project.ts:248-252`).
2. **The propose-edits-back-to-source-doc pattern** (`PATTERNS.md:1465-1492`):
   scan deterministically / propose judgmentally; itemized typed proposals;
   source attribution per item; per-item approval; reject-leaves-untouched;
   **change-gated persistence enforced in tested code, not prose**
   (`PATTERNS.md:1482`). `PATTERNS.md:1473` already *names* `published-doc-sync`
   as a future instance of this pattern — this proposal is that instance.

### The load-bearing finding: `working/` is searchable TODAY

The `projects` qmd scope indexes the **entire** `projects/` tree with mask
`**/*.md` (`qmd-setup.ts:413` `projects: 'projects'`, `qmd-setup.ts:423`
`QMD_COLLECTION_MASK = '**/*.md'`). There is no per-subfolder filter. So the
agreed invariant *"only `output/` is durable + searchable; `working/`+`input/`
must NEVER pollute search/memory"* is **currently false** — every half-baked
`working/draft.md` is already in qmd and reachable by `retrieveWiki`, brief
assembly, and `refresh-topics` candidate generation. **Folder discipline is not
a greenfield design choice; it is a fix to a live leak.** This drives the
trigger-model recommendation below.

---

## 1. Folder model

Project layout (extends today's `projects/active/<slug>/`):

```
projects/active/<slug>/
  README.md          # frontmatter: area, topics: (system cache), status; the project's spine
  input/             # SCRATCH — raw dumps, pasted threads, references. Not searchable. Not memory.
  working/           # SCRATCH — half-baked PRDs, specs-in-progress, thinking. Not searchable. Not memory.
  output/            # DURABLE — published docs. Searchable (auto-indexed). L1 source for wiki/memory.
```

Folder roles and the single rule per folder:

| Folder | Role | Searchable? | Feeds wiki/memory? | Mutability |
|---|---|---|---|---|
| `README.md` | Project spine + system `topics:` cache | yes (existing) | indirectly (brief/topics) | system-owned cache keys; body user-owned |
| `input/` | Raw intake, references | **NO** | no | freely churned, never durable |
| `working/` | Drafts, half-baked thinking | **NO** | no | freely churned, never durable |
| `output/` | Published docs (the "I'm ready" act) | **YES, auto** | **YES, gated** | append-mostly; moving a file *out* of working/ INTO output/ is the publish act |

**The folder boundary IS the readiness signal.** "Ready to publish" is not a
flag, a status field, or an LLM judgment — it is the physical act of the doc
landing in `output/`. This keeps the discipline cheap and unambiguous: the user
already knows when a doc is done because they move it. No "is this ready?"
heuristic to get wrong. (The risk this creates is in §7.)

**Folder-discipline fix required (precondition for everything below):** the
`projects` qmd collection must index `projects/**/output/**/*.md` only — i.e.
exclude `input/` and `working/`. Mechanism options (qmd ignore file vs. a
narrower scope mask vs. a dedicated `project-output` scope) are a sibling-A /
search-layer implementation detail; this proposal asserts the *requirement* and
flags that without it `/publish`'s "auto-index" promise is a no-op (the files are
already indexed) and the "scratch never pollutes" invariant stays violated.
**Open question OQ1.**

---

## 2. Trigger model — auto-index vs. gated-reconcile

The agreed two-commitments split (given), mapped to mechanism:

| Commitment | Risk | Reversible? | Trigger | Mechanism |
|---|---|---|---|---|
| **(a) Make a doc SEARCHABLE** (qmd index of `output/`) | low | yes (`qmd update` is idempotent; un-index by moving the file) | **automatic** on file landing in `output/` | see below |
| **(b) Assert a doc's FACTS into wiki/memory** (L2/L3) | high; contradiction-prone; reconcile-dependent | no (memory is sticky, supersession is hard) | **explicit + human-gated** | `/publish` skill → reconcile pass (sibling A) behind the markdown-checkbox approval doc (§5) |

### Mechanism for (a): hook vs. instruction vs. verb

Three candidates, assessed:

- **Prose instruction in CLAUDE.md / AGENTS.md** ("whenever a doc lands in
  `output/`, run `arete index`"). **Reject.** Per the harness's own rule,
  automated *whenever-X* behaviors are not reliably driven by prose — the model
  only acts when it happens to be in the loop and remembers. Worse, the dominant
  way a doc lands in `output/` is the user moving a file in their editor/Finder,
  **with no agent turn at all**. A prose instruction cannot fire on a
  filesystem event Claude never observes. This is a fundamentally non-prose
  trigger.

- **Claude Code hook (`settings.json`)**. A hook *can* run a command
  deterministically, but Claude Code hooks fire on **tool/agent lifecycle
  events** (PreToolUse, PostToolUse, Stop, etc.), not on arbitrary external
  filesystem writes. There is **no hook today** in this repo (`.claude/settings.json`
  is absent; no `.claude/hooks/`). A `PostToolUse` hook matching `Edit|Write`
  with a path under `output/` would catch *agent-authored* publishes and is the
  right tool for **that** path — but it still misses the user-moves-a-file-in-Finder
  case. So a hook is **necessary but not sufficient**: it covers agent writes,
  not editor moves.

- **CLI verb the agent/flow calls** (`arete index` / the existing
  `refreshQmdIndex`, `qmd-setup.ts:185`). Deterministic, already the house
  pattern (every write-verb calls it post-write, `project.ts:248-252`). But it
  must be *invoked* by something.

**Recommendation — layered, "no orphan output" guarantee:**

1. **Primary trigger = `/publish` verb (§3).** Publishing is a deliberate act;
   when the user (or agent) publishes via the verb, the verb runs
   `refreshQmdIndex` itself, exactly like `refresh-topics` does today
   (`project.ts:248-252`). This is the well-lit path and the one the lifecycle
   documents.
2. **Safety-net hook for agent writes** (recommended, via the `update-config`
   skill → `settings.json`): a `PostToolUse` hook on `Write|Edit` whose path
   matches `projects/active/*/output/*.md` that runs `arete index --quiet`.
   Catches the case where the agent authors a doc directly into `output/`
   without going through `/publish`. Tradeoff: fires per-write (debounce / let
   `qmd update` be a cheap no-op — `qmd-setup.ts:221` notes embed is ~0.2s for a
   no-op).
3. **Reconciling drift for editor/Finder moves**: the user moving a file into
   `output/` outside any agent turn cannot be caught by hook or prose. Make
   `/publish` (and `arete project open`) **detect un-indexed `output/` docs** —
   compare `output/*.md` mtimes against the last index time and surface "N docs
   in output/ not yet indexed; index now?". This converts a missed automatic
   trigger into a visible, one-keystroke catch-up at the next natural touchpoint,
   rather than a silent gap. (Mirrors the existing "what's new since last
   touched" delta computation, `project.ts:391`.)

Net: **auto-index = verb-driven + hook safety-net + drift-detection at open**,
never prose. The index is cheap and reversible, so "mostly automatic with a
catch-up net" is the right reliability bar — we don't need a daemon.

> Note for sibling A: commitment (b)'s reconcile is **never** auto-triggered.
> The most a passive surface should do is *notice* an unreconciled published doc
> and offer the reconcile (the §5 approval doc), exactly the way
> `published-doc-sync` is framed in `PATTERNS.md:1473`. Auto-asserting facts is
> the tar pit.

---

## 3. `/publish` verb design

A new skill `publish` + CLI verb `arete project publish`. **Recurring,
mid-life, per-document** — the opposite of terminal. The project stays open.

### Skill frontmatter (matches house style, cf. `update-project/SKILL.md:1-18`)

```yaml
name: publish
description: Publish a project doc to output/ — make it durable + searchable now, and OFFER to reconcile its facts into wiki/memory. Recurring, mid-project, per-document. Never auto-asserts facts.
triggers:
  - /publish
  - publish this doc
  - publish to output
  - this draft is ready
  - promote to output
work_type: general
category: essential
primitives: []
intelligence:
  - context_injection
requires_briefing: false
```

### CLI: `arete project publish <slug> <doc>` (preview default, `--apply`)

Follows the `refresh-topics` skeleton (`project.ts:199-307`) exactly:
`findRoot` guard; `--json` all exit paths; `--skip-qmd`; qmd refresh only on an
actual write.

**What it does (the mechanical, tested half — the CLI):**

1. Resolve `<doc>` — accepts a path in `working/`/`input/` (the publish *move*)
   or already in `output/` (re-publish / re-index of an edited doc).
2. **Preview (default):** report (a) the move `working/x.md → output/x.md` if
   applicable, (b) whether the doc is currently indexed, (c) the
   `refresh-topics` preview for the project (publishing changes the corpus, so
   the topics cache may move — reuse `computeProjectTopicsRefresh`,
   `project-topics.ts:119`), and (d) a **reconcile preview hand-off** to sibling
   A: "this doc asserts the following candidate decisions/learnings" (A computes
   the candidates; `/publish` only *surfaces* them — does not write).
3. **`--apply`:**
   - Move the file into `output/` (the durable act).
   - `refreshQmdIndex` (`project.ts:248-252` pattern) → doc is now searchable. **This is commitment (a), done.**
   - Optionally chain `arete project refresh-topics <slug> --apply` (change-gated, so zero-write if the corpus didn't move the cache).
   - **Stop.** Commitment (b) is NOT performed by the CLI. The CLI's job ends at "searchable + topics cache fresh."

**What it does (the judgmental, LLM-mediated half — the skill prose):** after
the apply, the skill *offers* the reconcile: "This doc is now published and
searchable. It looks like it asserts these N facts — want to reconcile them into
memory/wiki?" If yes, it opens the **§5 approval doc** pre-filled with the
candidate items (from sibling A) and runs the propose-edits-back-to-source-doc
envelope (`PATTERNS.md:1475-1482`). **Per-item approval; apply exactly the
approved set; reject leaves memory untouched.**

### Relationship to the other verbs

- **vs. `refresh-topics`**: `refresh-topics` maintains the README `topics:`
  *cache* (a pointer into the wiki). `/publish` *adds a new L1 source* and may
  *trigger* a `refresh-topics` because the corpus changed. `/publish` reuses
  `refresh-topics` as a step; it does not replace it.
- **vs. `/update-project`**: `/update-project` flows *meeting/area deltas* back
  into the README. `/publish` flows *a project's own authored doc* outward into
  the durable/searchable/memory layers. Different direction, same approval
  pattern. They can coexist in one session.
- **vs. sibling A's reconcile**: `/publish` *owns the trigger and the approval
  envelope*; A owns *what the reconcile computes and writes*. Clean seam: A
  exposes a "candidate facts from this doc" preview + an "apply approved facts"
  call; `/publish` drives both through the approval doc.

### Idempotency / zero-write discipline

Re-publishing an unchanged doc: file already in `output/`, content unchanged →
no move, `qmd update` is a cheap no-op, `refresh-topics` is change-gated to zero
writes (`project-topics.ts:214` `if (!refresh.changed) return { written: false }`).
**A `/publish` on nothing-changed must be byte-clean**, matching the R2 ethos
(`PATTERNS.md:1482`). Enforce in a counting-adapter test, not prose.

---

## 4. Decoupling `/finalize-project`

Today `/finalize-project` conflates **(i) extract knowledge** with **(ii) end
the project** (`finalize-project/SKILL.md:124-148` does the memory retro;
`:184-196` does the archive move; `:213-231` even still tells the user to run
`qmd update` *by hand* — pre-`/publish` thinking).

**Untangle into:**

- **`/publish`** absorbs the *recurring* knowledge-extraction — it can run any
  number of times during the project's life, per doc. The decisions/learnings a
  project produces should mostly reach memory *as they are published*, not in
  one terminal dump.
- **`/finalize-project`** becomes a genuinely terminal, lighter step:
  1. **Last-call reconcile sweep** — "these `output/` docs were never
     reconciled; reconcile now?" (reuses the §5 approval doc; the safety net for
     anything published-but-not-reconciled).
  2. **Closed-project retro** — keep exactly as-is, it's good and idempotent
     (`finalize-project/SKILL.md:130-148`: scan `decisions.md` for
     `Closed project: <name>`, append the structured item, `arete memory refresh`).
  3. **Archive move** `projects/active/<slug>/ → projects/archive/YYYY-MM_<slug>/`
     (`:184-196`).
  4. **Drop** the manual `qmd update` prompt (`:213-231`) — `/publish` and the
     archive-move's own `refreshQmdIndex` handle indexing; a terminal "please run
     qmd by hand" instruction is exactly the kind of prose trigger §2 rejects.

Net behavior change: finalize stops being the only door to memory. A project
that published diligently arrives at finalize with **almost nothing left to
extract** — finalize just sweeps stragglers, stamps the retro, and archives. The
"extract knowledge" responsibility moves to where the knowledge is actually
created (the publish moment), which is the whole point.

> Continuity note for sibling C: "keep open / archive / reopen / spin a
> connected project" is C's lane. From this proposal's side, the only contract
> is: archive is a *move*, not a delete; archived `output/` stays indexed
> (read-only) so C can retrieve it; reopen is C's verb, not finalize's inverse.

---

## 5. Approval surface — the markdown-checkbox approval doc

John approves in the **CLI/editor, not chat**, and has stated a preference for a
**markdown checkbox approval doc the agent pre-fills with reasons and reads back
on apply** (memory `feedback_cli_review_surface`). The existing flows present an
*in-chat* "## Proposed updates" surface (`update-project/SKILL.md:76-94`); this
is the next iteration of that same propose-edits pattern, rendered as a file.

**Shape** — written by `/publish` (and the finalize sweep) to a scratch path the
agent owns, e.g. `projects/active/<slug>/working/.publish-review.md` (lives in
`working/`, so it is itself never indexed/memory — §1):

```markdown
# Publish review — <doc title>
> Pre-filled by Areté. Check the boxes you approve, edit text inline, save, then say "apply".
> Unchecked = rejected. Rejecting everything leaves wiki/memory byte-identical.

## Decisions to log  → .arete/memory/items/decisions.md
- [ ] **<decision title>**
      Reason: <why this rises to a decision>
      Source: output/<doc>.md — "<quoted line>"
      Area/Topics: <area-slug>, <topic-slug>     # required so it surfaces (cf. finalize retro :136)

## Learnings to log  → .arete/memory/items/learnings.md
- [ ] **<learning>** — Source: output/<doc>.md — "<quote>"

## Supersessions (CARE)  → wiki / decisions
- [ ] This doc CONTRADICTS recorded decision "<existing>" (<path>).
      Proposed: supersede the old entry. Reason: <…>      # the hard one — see §7 / sibling A

## Topics cache  → arete project refresh-topics <slug> --apply
- [ ] Cache: [a, b] → [a, b, c]  (changed: true)
```

**Beats:**

1. **Pre-fill** — agent writes the doc with every candidate item, each carrying
   a *reason* and a *source quote* (`PATTERNS.md:1479` source attribution). The
   user opens it in their editor.
2. **Curate** — user checks/unchecks boxes, edits text inline, saves. This is
   the CLI/editor approval John wants; no chat round-trip.
3. **Read back on apply** — user says "apply"; the agent **re-reads the file**,
   parses checked items, and **reads each approved item back to the user** before
   writing ("Applying: [3 decisions, 1 learning, skipping the supersession].").
   Apply exactly the checked set, each via its listed mechanism (append to
   `items/*.md`; `refresh-topics --apply`; the supersession through sibling A).
4. **Reject-leaves-untouched** (`PATTERNS.md:1481`) — zero checked → zero writes.
5. **Provenance** — the approval doc itself is disposable scratch in `working/`;
   delete or leave it after apply (it is gitignored-from-search by §1).

This is a faithful file-rendering of the `propose-edits-back-to-source-doc`
envelope already documented (`PATTERNS.md:1475-1482`), with the surface moved
from chat to a checkbox markdown file. The *parsing of checkboxes on apply* is
LLM-mediated and not CI-provable — pin it in skill prose tests + a soak, and say
so in the skill's verification-honesty section (the `update-project` precedent,
`update-project/SKILL.md:113-115`).

---

## 6. Jira / Notion boundary

Given constraint: **Jira/Notion are one-way push targets; `output/` is the local
source-of-record. No bidirectional sync (tar pit).**

- **`output/` is canonical.** A published doc lives in `output/`. Pushing it to
  Jira/Notion is a *separate, optional, downstream* action — never a
  precondition for publish, never a source that flows back.
- **`/publish` may OFFER a push** ("also push to Jira/Notion?") as a
  `propose-with-mcp-action` sibling step (`PATTERNS.md` names that as the verb-action
  cousin of propose-edits). The push is fire-and-forget; success/failure is
  reported but **the external system is never read back into memory or `output/`**.
- **No reconciliation of Notion edits.** If John edits the doc in Notion after
  pushing, that edit does **not** flow back. The local `output/` doc remains the
  record; if he wants the Notion change captured, he edits `output/` and
  re-publishes. This is the discipline that keeps us out of the sync tar pit —
  state it as a hard rule in the `publish` skill's Boundaries section (cf.
  `update-project/SKILL.md:107-111`).
- **Provenance, not sync:** an `output/` doc's frontmatter may carry
  `jira: <key>` / `notion: <url>` as *pointers* (the README already supports a
  nested `jira:` block per `project-topics.ts` task note re: lossless YAML
  round-trip of `jira:`/`notion:`). Pointers are one-way breadcrumbs, not sync
  anchors.

---

## 7. The single hardest risk

**The readiness boundary collapses, and `working/` discipline rots — taking the
"scratch is invisible" invariant down with it.**

The whole model rests on one human act: *moving a doc into `output/` means "I
assert this."* That is elegant but fragile in exactly the way John works:

- He drafts a PRD in `working/`, it gets "good enough," he references it, shares
  the path, maybe pushes a copy to Notion — **without ever moving it to
  `output/`.** Now the real source-of-record is a `working/` draft that is (by
  design) invisible to search and memory. The system's knowledge silently lags
  reality. This is the same failure shape as the June-fixation case
  (`update-project/SKILL.md:24`), one layer up: the truth moved, the durable
  layer didn't.
- Conversely, he moves a still-half-baked doc to `output/` to "get it out of the
  way," and now scratch thinking is searchable and offered for reconcile into
  memory — the pollution the model exists to prevent.

The boundary is a **discipline tax**, and disciplines that depend on a human
remembering to move files at the right moment are the ones that rot first. The
deeper tension: the same looseness that makes projects useful as "temporary
working containers" (John's vision) is what makes a crisp `working/`→`output/`
line hard to hold.

**Why this is the hardest, not folder-config or Notion drift:** the qmd-scope
fix (OQ1) is a known engineering task; Notion one-way is a stated rule. But "did
the user draw the line in the right place at the right time" is a *judgment that
recurs on every doc, forever*, with no deterministic check possible — and
getting it wrong is silent in both directions (lagging truth / leaked scratch).

**Mitigations (partial, none fully closes it):**

1. **Make the boundary observable, not enforced.** `/publish` and `arete project
   open` surface drift: "3 docs in `working/` modified in the last 14 days but
   never published — still scratch, or ready?" Turn a silent omission into a
   visible nudge at a natural touchpoint (reuses the "what's new since last
   touched" delta machinery, `project.ts:391`).
2. **Cheap reversibility both ways.** Un-publish = move back to `working/` +
   re-index (drops it from search). If the act is trivially reversible, the user
   is more willing to publish early — lowering the "is it ready?" stakes.
3. **Supersession is the sub-risk to flag for sibling A.** Even when the
   boundary is drawn correctly, a published doc that *contradicts* a recorded
   decision is the expensive case (the `published-doc-sync` SUPERSESSION problem,
   `PATTERNS.md:1473`; memory `project_supersession_gap`). `/publish`'s approval
   doc *surfaces* the contradiction (§5 "Supersessions (CARE)") but **must not
   resolve it** — the user resolves; A executes. Auto-superseding on publish
   would be the worst version of the tar pit.

---

## 8. Open questions

- **OQ1 (blocking the auto-index promise):** how is `projects/**/{input,working}/`
  excluded from the `projects` qmd collection (`qmd-setup.ts:413,423`)? `.qmdignore`,
  a narrowed mask, or a new `project-output` scope rooted at `output/`? Without
  this, "auto-index on publish" is a no-op and scratch stays searchable. **Search-layer
  / sibling-A territory, but `/publish` cannot ship correctly until it's answered.**
- **OQ2:** Is the `PostToolUse` safety-net hook (§2.2) worth the per-write churn,
  or does verb-trigger + open-time drift-detection suffice? Lean: ship
  verb+drift-detection first; add the hook only if agent-authored `output/` writes
  prove common in the soak.
- **OQ3:** Does `/publish` chain `refresh-topics --apply` automatically, or
  propose it as a checkbox item (§5)? Chaining is convenient but writes the
  README cache without an explicit beat; the cache is change-gated and
  display-only (`project-topics.ts:65` R10), so auto-chaining is probably fine —
  confirm against the "no side-effect writes on read/open" ethos
  (`project/SKILL.md:71`).
- **OQ4:** Where exactly does the approval doc live, and is it deleted on apply?
  Proposed `working/.publish-review.md` (invisible to search by §1). A
  dot-prefixed name also dodges qmd's dot-dir pruning note (`qmd-setup.ts:433`).
- **OQ5:** Granularity of "a fact a doc asserts" — sibling A owns the extraction,
  but `/publish` needs A's preview contract (what shape are candidate items in,
  how is supersession flagged) to render the approval doc. **Seam to negotiate
  with A.**
- **OQ6:** Should archived-project `output/` docs stay in the live search index
  (read-only), or move to a separate archive collection? Affects sibling C's
  retrieval. Proposed: stay indexed; archive is a move not a delete.
