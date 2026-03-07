# Areté Reimagine v2 Learnings

**Date**: 2026-03-05
**Branch**: reimagine
**Status**: ✅ Complete — 6/6 tasks

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 6/6 (100%) |
| First-attempt reviews approved | 0/6 — all needed 1 iterate cycle |
| Total reviewer iterations | 6 (1 per task — always dist not committed or one spec bug) |
| Commits | 15 (feature + fix + dist commits) |
| Core tests before | 1436 |
| Core tests after | 1436 (no net change — web/backend tests are counted separately) |
| Backend tests before | 112 |
| Backend tests after | 147 (+35 new tests) |
| Web build size | 957 KB JS (up from 482 KB — TipTap adds ~475 KB) |
| TypeScript errors | 0 |

---

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Applied | Effective |
|------|--------------|--------------------|-----------|
| Backend dist not recompiled | Yes — every single task | Explicit instruction in all prompts | Partial — dist was compiled but not always committed |
| V2-3 depends on V2-2 | No | Strict ordering | Yes |
| V2-5 depends on V2-3 | No | Strict ordering | Yes |
| TipTap install may fail | No | Install verify step | Yes |
| API key storage path unclear | No | Trace getEnvApiKey + use .credentials/ | Yes |
| Goals week.md parsing | No | Read actual file first | Yes |
| Meeting scan performance | No | Acceptable for v2 | Yes |

**Unplanned risk that materialized**: `@tiptap/extension-markdown` doesn't exist — correct package is `@tiptap/markdown`. The reviewer caught this in the pre-work sanity check, preventing a broken install.

---

## What Worked Well

1. **Pre-work sanity check by reviewer catches spec bugs before developer starts** — all 6 tasks had the reviewer catch at least one issue in the pre-work check (wrong package name, unclear write mechanism, missing shared component extraction, self-contradictory spec). This pattern consistently adds value.

2. **rawContent pre-stripping server-side** — stripping AUTO_PERSON_MEMORY and Recent Meetings sections from `rawContent` in the backend (not the frontend) made TipTap integration trivial in V2-5. The LEARNINGS.md note from V2-3 explicitly told V2-5 "feed directly to TipTap."

3. **Targeted string replacement for week.md toggle** — implementing the PATCH priority route as a read-string → find-section → modify-section → write-string approach (no AST) was fast, testable, and correct.

4. **Personal Badges extraction** — the reviewer's catch that `HealthDot`/`CategoryBadge` were private to PeopleIndex.tsx (and PersonDetailPage would need them) prevented a copy-paste DRY violation. The extraction to `components/people/PersonBadges.tsx` was the right call.

---

## What Didn't Work

1. **Backend dist omission on every task** — 5 out of 6 backend tasks required a "dist not committed" iterate cycle. The dist commit is genuinely easy to miss because tests pass (they use tsx source, not dist), so the failure is invisible to the developer. The explicit instruction in prompts helps but isn't enough on its own.

2. **`@tiptap/extension-markdown` vs `@tiptap/markdown`** — package name confusion is hard to pre-empt without testing the install. The reviewer's pre-work check was the right firewall.

3. **Lazy regex `\z`/`$` with multiline flag** — the rawContent stripping bug where `[\s\S]*?(?=\n##\s|$)` with the `m` flag stopped at end-of-line (not end-of-string). Greedy `[\s\S]*` was the fix. This is the same class of bug from v1 (v1 learnings mentioned `\z` PCRE-only issue). The fix required an iterate cycle.

4. **TipTap initial-only content** — `useEditor({ content })` doesn't reinitialize from prop changes. After a save + `invalidateQueries` cycle, the read-only display stayed stale. The fix (`key={content}`) is canonical React but non-obvious. Now documented in LEARNINGS.md.

---

## Learnings (for Future PRDs)

1. **Backend dist: add explicit git check step** — After `npx tsc`, have the developer run `git status packages/apps/backend/dist/` and verify all changed `.js` files are staged. Add this to the developer prompt: "Verify with `git status packages/apps/backend/dist/ | grep -c 'modified\|new'` — should be > 0 for any backend change."

2. **TipTap packages to use** (now documented in LEARNINGS.md):
   - `@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/markdown @tiptap/extension-placeholder @tiptap/extension-bubble-menu`
   - BubbleMenu imports from `@tiptap/extension-bubble-menu`, not `@tiptap/react`
   - Markdown serialization: `editor.storage.markdown.getMarkdown()`
   - `key={content}` on read-only display to force remount after data updates

3. **Multi-param URL sync pattern** — When a page has multiple independent URL params, use functional-setter `setSearchParams((prev) => { ... })` to avoid clobbering params. The destructive form `setSearchParams({})` is only safe when you own all params. Documented in LEARNINGS.md.

4. **matter.stringify for frontmatter preservation** — `matter.stringify('\n' + content, data)` correctly reconstructs frontmatter + body. The leading newline ensures the body starts on its own line. This is the right approach for any "preserve frontmatter, update body" operation.

5. **Gray-matter test fixture directories** — Test fixtures for people routes need directories matching the actual code paths (`people/internal/`, `people/customers/`, `people/users/`). The v1 implementation had a bug (`internals/` vs `internal/`) that V2-3 discovered and fixed, recovering 12 silently-failing tests.

---

## Subagent Insights

- **Developers correctly flagged dist issues in reflections** — they knew the dist pattern from prior context. The gap is that `npm test` passes without dist, making it invisible to automated checks.
- **Pre-work sanity checks consistently added value** — reviewer caught package name, shared component, spec contradiction, tailwind typography config gap. All prevented broken developer passes.
- **Small scope + good context = fast, high-quality output** — all tasks were completed in one developer pass except for the dist commit and one regex bug. The per-task reflection estimates (~6-22K tokens) were accurate.

---

## System Improvements Applied

- `packages/apps/web/LEARNINGS.md` — Multi-param URL coexistence pattern, TipTap integration guide (3 invariants + key pattern)
- `packages/apps/backend/test/routes/people.test.ts` — Fixed 12 silently-failing tests (wrong fixture directory name)

---

## What's Next (Backlog Ideas)

- Real-time search index for larger workspaces (current global search scans all files)
- TipTap bundle size optimization (code splitting — adds ~475 KB currently)
- Wire MarkdownEditor into meeting notes editing and goals editing
- Mobile layout polish for PersonDetailPage two-column layout
