# Project search provenance + active-topics durable-status — build learnings

> Conversational build (not /ship orchestrator), 2026-06-14. Branch `fix/project-index-scope-active-topics` → PR #14 (merge `4fb7f351`). Docs/release wrap on `docs/v0.16.0-wrap`. Released as v0.16.0.

## Outcome

- WS-A: `getActiveTopics` keeps durable-status (`active`/`stable`/`blocked`) topics past the 90-day boot recency cutoff. WS-B: `arete search` labels project results by source folder and stable-sinks `working/` drafts below all else (new pure module `packages/cli/src/lib/provenance.ts`). Index untouched; displayed score never mutated; only `working/` changes rank.
- 30 new tests (active-topics + provenance) + 69 existing search/topics tests green; `tsc -b` clean; `dist/` committed (house rule).

## What worked

+ Two pre-build gates earned their keep. An eng-lead plan review caught two WS-B show-stoppers — (1) singular `output/`/`input/` vs the real plural `inputs/working/outputs`, and (2) `arete search` does NOT use `providers/qmd.ts` (it has its own parse stack in `search.ts`; the provider's consumers are wiki/entity/meeting and filter project paths out). Then a real-workspace investigation (23 projects in `~/code/arete-reserv`) forced a model inversion.
+ Model inversion from data: durable content is scattered far beyond `outputs/` (project-root docs, `skill/`, `plan/`, `sessions/`, …), so a "published allowlist" over-fits and is brittle. Only `working/` is a reliable scratch signal → down-rank just `working/`, leave everything else neutral. Simpler and robust to new/odd folders.
+ Down-rank + label instead of qmd `ignore`/exclude or dot-folders: keeps `working/` searchable and Obsidian-visible. The real problem was *unlabeled scratch outranking decisions*, not scratch being present.

## What didn't / gotchas

− First plan targeted `providers/qmd.ts` — a path that doesn't serve `arete search` at all. Confirm the real consumer before editing a shared provider.
− First classifier used singular folder names; a wrong classifier would have passed its own (wrong) tests green. Validate path conventions against live data, not assumption.
− No `normalizeBM25` exists in the codebase; `qmd query` score distribution is unverified → chose a rank-based stable partition over additive score bonuses.

## Key decisions

- `/publish` (project outputs → wiki) stays deferred; this ships only the search-time provenance floor. Wiki write boundary unchanged (meeting/slack ingest only).
- `input/` stays searchable (pulled-in reference incl. other teams' PRDs); only `working/` is down-ranked.
- Released as v0.16.0 (minor; new non-breaking capability). Merged via `gh pr` (no local main checkout) to honor the never-touch-main-working-dir rule.

## Follow-ups

- Populate `openItemsBySlug` at boot callers (fuller WS-A fix; status-relaxation is the shipped floor).
- Down-rank denylist is intentionally minimal (`working/` only); revisit `prototypes/`/`sessions/` only if they prove noisy.
- Larger published-doc→wiki reconcile (supersession, source-authority) remains in `dev/work/plans/project-wiki-sync/` (proposal-1) and the user auto-memory note `project_published_doc_sync`.
- `wrap` vs `finalize-project` overlap (shared triggers "wrap up" / "archive project") is a known rough edge to reconcile someday.

## Learnings

- Builder preference confirmed: gate substantive plans with an eng-lead review AND validate assumptions against the real workspace before building — both caught issues automated tests would have shipped green.
