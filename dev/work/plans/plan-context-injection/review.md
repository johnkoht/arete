# Eng-Lead Review: plan-context-injection

Run 2026-06-14 (core+cli expertise profiles attached). **Verdict: READY-WITH-CHANGES** — all 9 CRs incorporated into plan.md; drafted ACs + testing strategy folded in.

## Claim verification (all load-bearing claims CONFIRMED against the tree)
- `assembleBriefForMeeting` renders projects as metadata bullets only; body never parsed — CONFIRMED `brief-assemblers.ts:2210-2232`.
- `assembleAgendaScaffold` never routes project bullets into candidates — CONFIRMED `agenda-scaffold.ts:155-195` (heading-regex extraction; no project section extractor).
- `assembleBriefForProject` reads only Background+Status — CONFIRMED `:1397-1404`, capped `:1408`.
- `retrieveWiki` searches only `.arete/memory/topics/` — CONFIRMED `:561-643`.
- Brief/scaffold make NO LLM calls (defended invariant) — CONFIRMED via `brief-no-llm.test.ts`.
- `arete project open` → brief + `whatsNew` — CONFIRMED `project.ts:390-391`.
- **REFUTES plan framing:** `assembleBriefForProject(slug, paths)` is 2-arg, no options (`intelligence.ts:438-450`) — budget/selection is a signature change, not additive composition.
- Cache precedent `gmail-sent-cache.ts` is date-keyed/version-validated, NOT content-hash — plan's hash design has no copy-paste precedent.
- arete-reserv `glance-2-roadmap/` has NO `outputs/` dir; root holds `glance-1.5-roadmap.md` (26k) — confirms outputs/-as-signal + budget-blowout risk.

## The 9 Change Requests (all incorporated into plan.md)
1. **Reconcile "compose don't duplicate"** — state plainly traverse+select is net-new service code, not composable. ✅
2. **Pin `selectProjectDocs` signature** as the WS-1 contract (descriptor not markdown; budget arg; lives in `brief-assemblers.ts`; rendering in CLI). ✅
3. **Scaffold candidate extractor** = named WS-1 deliverable (new `project-doc` extractor + heading regex + routing; else WS-1 fails silently). ✅
4. **Deterministic + lexical selection algorithm** (jaccard + recency + locationBoost; no embeddings/LLM; tie-breaks; budget; zero-result fallback). ✅
5. **AC vs spike evidence** — automated ACs on temp-dir fixtures; arete-reserv comparison is a manual READ-ONLY release gate, not CI. ✅
6. **Demote/descope WS-5** — cache caches a no-LLM computation (token win not being paid) → DEFERRED. ✅
7. **Cache key = max-mtime, hash as tiebreak** (not content-hash on every read). ✅
8. **Add missed risks** — multi-project meetings (per-project selection, shared budget, slug-tagged); no-area projects (precondition + `--project` escape); `--json` schema freeze + snapshot; concurrent-cache safety; locationBoost caller-controlled. ✅
9. **Paste rubric-passing ACs + testing strategy** verbatim into plan. ✅

## Architecture decisions locked
- New pure `selectProjectDocs` in `brief-assemblers.ts`, surfaced via `IntelligenceService`, returns a `ProjectDocSelection` descriptor (NOT rendered markdown — rendering stays in CLI/formatters).
- `assembleBriefForProject` *optionally* calls it behind a new opts flag → `/project` + `arete brief --project` inherit; agenda path via meeting brief + new scaffold extractor.
- Do NOT widen `assembleBriefForProject`'s existing return shape (ripples into `brief-formatters.ts`).
- Single body reader; `plan-context` composes, never re-parses bodies.

Full drafted ACs (WS-1..WS-5) and testing strategy now live in `plan.md`.
