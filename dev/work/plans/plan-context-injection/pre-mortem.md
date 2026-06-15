# Pre-Mortem: plan-context-injection (autonomous /ship)

Run 2026-06-14. Failure-mode lens, building on the eng-lead review (does not restate review-covered risks). **0 CRITICAL → build proceeds (ship Phase 1.2 gate).** The 4 HIGH risks MUST be embedded verbatim in the developer subagent prompt.

## Count by severity
- CRITICAL: 0 — no build gate pause.
- HIGH: 4 (R1, R2, R3, R5)
- MEDIUM: 7 (R4, R6, R7, R8, R9, R10, R11)
- LOW: 2 (R12, R13)

## HIGH risks (load-bearing — embed in dev prompt)

**R1 — Signature change to `assembleBriefForProject` breaks existing tests** (Integration, HIGH/HIGH). New `opts` param could break 2-arg callers (`brief-no-llm.test.ts:122`, `brief-project.test.ts:210`, `intelligence.ts:438`); autonomous dev may "fix" by editing tests.
→ *Mitigation:* new param MUST be optional (`opts?: …`, default `{}`), append-only. Do NOT change the 2-arg call sites or edit those tests. `IntelligenceService.assembleBriefForProject` 2-arg public signature stays callable. Fix code, not tests.

**R2 — Selection code outside `brief-assemblers.ts` escapes the no-LLM grep guard** (Test Patterns, HIGH/MEDIUM). `brief-no-llm.test.ts` greps ONLY `brief-assemblers.ts` (path hardcoded ~:36). If `selectProjectDocs` lands elsewhere, an accidental embedding call passes AC1.7 green.
→ *Mitigation:* define `selectProjectDocs` IN `brief-assemblers.ts`. If split out, extend the guard's path list to include the new file. Selection uses only `tokenize`/`jaccardSimilarity`/`getModified` — no `searchProvider.search`, no embeddings, no `AIService`.

**R3 — `project-doc` candidates land in `unrouted`, not a section** (Integration, HIGH/MEDIUM). Scaffold routes per `classifySection` bucket, not per source (`agenda-scaffold.ts:362-398`). Lean skeleton templates (John's preference) often lack `general`/`priorities` headings → project doc surfaces nowhere on real meetings while the unit test (richer template) passes.
→ *Mitigation:* add `projectDocCandidates` to BOTH `priorities` and `general` cases (`:368,386`) with a `consumed.projectDoc` flag; fall to `unrouted` only when no section consumes. Test with a MINIMAL skeleton template and assert the candidate is reachable, not dropped.

**R5 — Jaccard on short meeting titles selects the wrong doc confidently** (Code Quality, HIGH/HIGH). "Jira Roadmap Sync" → ~2-3 tokens after stop-word strip; jaccard near-zero/noisy → recency (0.30) dominates → picks most-recent `working/` scratch, not the synthesis. Zero-result fallback makes a *confident wrong pick* surfaced as authoritative.
→ *Mitigation:* enrich the selection query — union title + resolved area slug + attendee/project-name tokens (brief resolves these at `:2172-2187`) before tokenizing. Test a SHORT title with 3 docs where the correct doc is NOT most recent; assert relevance still wins. Emit a low-confidence flag when top score < threshold.

## MEDIUM risks
- **R4 — double-count:** selected doc under `resources/meetings/` overlaps recent-meeting candidates → same decision twice. Dedupe by normalized rel-path/first-heading; prefer recent-meeting candidate.
- **R6 — second body parser bolted onto `plan-context`:** forbidden. `plan-context` gets body ONLY via `selectProjectDocs`/`assembleBriefForProject`. Reviewer grep new command for `parseFrontmatter|match(/##|readFileSync` → must be zero.
- **R7 — `openQuestions[]` contract gap:** AC2.1 requires `openQuestions[]` on `projects[]` but `ProjectDocSelection` has no producer. Reconcile BEFORE WS-2 (labeled `expanded` entry whose heading matches `/open questions/i`, or new descriptor field). Freeze WS-1 contract + green tests before WS-2.
- **R8 — gate gaming:** don't weaken/`.skip`/delete AC tests. Integration test must assert a SPECIFIC fixture doc's content, not `length>=0`. Blocked AC → STOP and report.
- **R9 — shared-budget overflow → all-listed agenda:** worse than today's metadata bullet. Test 2 projects each >½ shared budget; assert ≥1 doc expanded; consider expanding most-relevant section vs whole-doc-or-nothing.
- **R10 — recurring-template regresses real 1:1s:** make additive — only meetings with a prior same-titled instance derive from it; 2-attendee w/o prior instance still `1on1`. Regression test for genuine 1:1 + attendee-scoped Priorities seeding (`:263-314`).
- **R11 — `working/`-boost leaks to `/project`:** `locationBoost`/`expandWorking` default FALSE; only `plan-context` + meeting-brief prep opt in. Test default call ranks `outputs/` above recent `working/`.

## LOW risks
- **R12 — non-`.md` in `outputs/` read as body / traversal cost:** apply `list({extensions:['.md']})` to ALL dirs incl `outputs/`; cap files traversed (~20 by mtime, list rest). Fixture with `.png`/`.csv` in outputs → not expanded, no error.
- **R13 — `--day` empty on low-confidence area days:** fall back to recently-active projects (last ~7d) or emit `reason:'no-area-today'`; never silent empty. Test a sub-threshold day.
