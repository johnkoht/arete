# Phase 2–7 Review (Steps 4–10)

**Date**: 2026-04-22
**Reviewer**: Plan subagent, targeted critique of later-phase steps
**Source**: pre-build autonomous run

## Critical findings folded into plan during build

1. **`memory.md` template dependency** (Step 4) — `packages/runtime/templates/memory.md` documents `## Keywords` and `## Recently Completed` for user-facing area files. The plan's "no skill/rule dependencies on removed sections" claim missed this. Resolution: the template is a *user-facing* area file at workspace root (not the computed `.arete/memory/areas/*.md`); they're different artifacts. Step 4 only changes the computed file. Step 10 adds explicit clarification to the L3 rules distinguishing the two.
2. **`pm-workspace.mdc` tree staleness** (Step 10) — tree diagram at line 66 predates `areas/` shipping. Step 10 updates tree with both `areas/` and `topics/`.
3. **Layer coupling in Step 4** — the new Topics section in area files requires reading topic page frontmatter + first line of Current state. Solution: `TopicMemoryService.listForArea(slug)` returns pre-rendered lines (not raw entries). Area-memory depends on topic-memory, not the reverse — no layer inversion.
4. **Shared model helpers** — `getTopicHeadline(page)` and `selectSectionsForBudget(page, n)` needed by Steps 4, 7, 9. Added to Step 1's model (topic-page.ts) so all three consumers use one implementation.
5. **Idempotent write helper** — `StorageAdapter.writeIfChanged(path, content): 'unchanged' | 'updated'` factored once, used by `index.md`, `log.md` rewrite, CLAUDE.md (Step 9), topic page writes.
6. **`--allow-no-llm` orphan flag** — mentioned once in Step 6, never defined. Dropped — behavior is `callLLM` absence detection, no flag needed.
7. **Seed "chronological" wording** — "newer overwrites older" was backwards for incremental synthesis. Corrected: "oldest-first; each source accumulates into the topic page."
8. **Seed resumability** — Step 3's content-hash idempotency makes seed naturally resumable. No separate cursor file; just skip if hash already in `sources_integrated[]`.
9. **`arete init` over existing workspace** — explicitly document wipe-on-reinit (or load memory like update). Step 9.4 updated to load memory with failure fallback.

## Held as-is (not folding into plan)

- Full LLM contradiction-lint (deferred to Phase 5 follow-up plan, already acknowledged).
- `intelligence: topic_retrieval` frontmatter schema split (still fold-into-memory by default; Open Q #5 stands).
- `arete init`/`install` idempotent re-init edge case — documented in pre-mortem; builder handles at implementation time.
- Rate-limit mid-seed recovery — Step 3's idempotency covers resume; individual call retry logic is implementation detail, not plan-level spec.

## Scope-creep warnings for the builder

- **Step 6 estimate** is the most likely to blow up (5 subcommands + status integration + empty/no-LLM/missing matrices + JSON parity). Plan on 2× initial estimate.
- **Step 4 "Active People sorted by recency"** requires per-person last-seen tracking — data model change. Either drop the AC or budget for it.
- **`memory-log.ts` replay parser** — keep minimal (parse + serialize) in this plan; replay engine deferred.

## Detail reference

Full reviewer output preserved in transcript. Key per-step findings:

- **Step 4**: template reconciliation; `extractKeywords()` dead code; TopicEntry schema change
- **Step 5**: extensible log-event schema; value escaping in k=v grammar; concurrent-append documented
- **Step 6**: `--allow-no-llm` dropped; `--fix-orphans` spec clarified; cost threshold config-backed
- **Step 7**: `paths` filter normalization; rank weights as named constants; `selectSectionsForBudget` helper in models
- **Step 8**: dry-run reads actual `intelligence.topics[]`; resumability via content-hash (not separate cursor)
- **Step 9**: `arete init` re-init edge case; `<`/`>` operators only (never `Intl.Collator`)
- **Step 10**: `memory.md` template, `pm-workspace.mdc` tree both added to file list
