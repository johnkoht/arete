# Area aliases + integrity check — rename safety hotfix (2026-06-11)

## What

- **`aliases:` frontmatter on area files**: an area can declare its former slugs, so renaming `areas/{old}.md` → `areas/{new}.md` no longer orphans historical `area:` references in meetings, projects, goals, topic pages, memory items, or commitments.json. `getAreaContext()` falls back to alias resolution on direct-lookup miss; `loadAreaAliasMap()` (frontmatter-only scan) + `canonicalizeAreaSlug()` are the shared primitives.
- **Canonicalize-at-load-boundary architecture** (eng-lead review outcome, not the original plan): one alias→canonical map per operation, applied where user files are parsed into memory (`loadMeetingIndex`, project loaders, `loadTopicAreaMap`, manifest generation, area-memory scan, memory-index) — so every downstream `===` join works unchanged. Write paths (`meeting set-area`, `commitments create --area`, area-memory file keying, entity area stamping) persist canonical only.
- **`arete areas check`**: report-only integrity diagnostic — dangling `area:` refs grouped by value, duplicate aliases, shadowing aliases, orphan area-keyed memory artifacts. New `area-integrity.ts` service.

## Why

John's vault wants to rename `glance-2-mvp` → `glance-operations`. Pre-aliases, resolution was a bare filename join: a slug rename silently excluded ~200 archived refs from area memory and briefs (no error). Rewriting history was rejected — vault treats archived files as point-in-time records.

## Learnings

1. **The first plan fixed resolution (slug→file) but missed the join direction (slug↔slug across documents)** — the eng-lead plan review caught that `assembleBriefForArea` joins projects/meetings/commitments on raw slugs in ~8 places `getAreaContext` never touches. Per-join patching was the wrong shape; load-boundary canonicalization covers joins not yet written.
2. **An alias fallback on the resolution path actively launders aliases into new data unless write paths are guarded** — `set-area` would validate via alias then write the alias. Every resolver-backed write must persist `context.slug`, compare `context.slug !== input` to detect alias input.
3. **Worktrees branch from origin/main, not local main** — this worktree started 9,473 insertions behind local main (missing phases 12–14). Check `git log --oneline HEAD..main` immediately after EnterWorktree; rebase before building.
4. **Service stubs in tests break when a service grows a method** — three test files stub `AreaParserService` as object literals; each needed `getAliasMap` added. Grep for `as unknown as AreaParserService` when extending that service.
5. Commitment ids hash only `text+personSlug+direction` (hash-invariance gate test exists) — `area` is safe to canonicalize in comparisons; still never rewritten in storage.

## Files touched

- **Added**: `packages/core/src/services/area-integrity.ts`, `packages/core/test/services/area-integrity.test.ts`
- **Updated (core)**: `models/entities.ts`, `services/area-parser.ts`, `brief-assemblers.ts`, `area-memory.ts`, `commitments.ts`, `meeting-manifest.ts`, `entity.ts`, `memory-index.ts`, `services/index.ts`, `services/LEARNINGS.md`
- **Updated (cli)**: `commands/areas.ts` (`check` subcommand), `commands/meeting.ts` (set-area canonical write), `commands/commitments.ts` (create --area canonical)
- **Tests**: alias parse/fallback/collision policy, alias joins (area-memory, listOpen, unionProjectCommitments, brief-area integration, manifest), integrity suite
