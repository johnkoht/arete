## Review: Wiki-leaning meeting extraction

**Type**: Plan (pre-execution)
**Audience**: Builder (Areté internal — meeting-intelligence pipeline)
**Review Path**: Full
**Complexity**: Large (12+ files; cross-package: core/cli/backend; multiple architectural decisions)
**Recommended Track**: `full`

**Step 1 — Path chosen**: Full Review. Reason: 12 critical files across core + cli + backend, three architectural threads (L2 schema change, extraction-context injection, recap shape change), and a new pure module (`topic-detection.ts`). Pre-mortem required.

**Step 2 — Profiles loaded**: `core` (Invariants / Anti-Patterns / Key Abstractions), `cli` (Purpose & Boundaries / Command Architecture), `backend` (first 200 lines).

**Step 3 — LEARNINGS scanned**: `services/`, `integrations/`, `cli/commands/`, `.pi/skills/`. Findings folded in below.

---

### Plan Review Checklist

| Concern | Verdict | Note |
|---|---|---|
| Audience | Hit | Clearly builder/internal — services/CLI/backend, no end-user surface. |
| Scope | Hit (with stretch) | Three threads in one PR is justified by tight coupling (B reads what A writes; C reshapes what B emits). See risk #1 below. |
| Risks | Hit | Risks section names topic-detection precision, token cost, `could_include` quality, section-selection drift. Misses two — see Concerns #1 and #4. |
| Dependencies | Hit | Implicit but correct: A → B → C. Step 7 in `meeting-context.ts` is gated on Thread A's `getMemoryItemsForTopics`. |
| Patterns | Hit | Pure functions for `detectTopicsLexical` and `renderForExtractionContext`; mirrors `selectSectionsForBudget` style; respects "lexical first, LLM as escape hatch" decision. |
| Multi-IDE | N/A | No `runtime/` or `.agents/sources/` content. |
| Backward compatibility | Mostly hit | `summary` retained for back-compat; `Approved Action Items` regex precedence preserved. But `## Summary` → `## Core` in `formatStagedSections` will break golden fixtures and any historical-meeting reader. See Concern #2. |
| Catalog | N/A | No `dev/catalog/capabilities.json` impact (no new CLI command, no new tool). |
| Completeness | Mostly hit | One critical omission: `meeting-context.ts` `MeetingContextDeps` change at line 122 needs to thread through `factory.ts` callsites and any test that constructs `MeetingContextDeps` directly. Plan doesn't enumerate that. |
| Test coverage | Mostly hit | New test files are listed (topic-detection, memory parser changes, meeting-context enrichment, meeting-extraction prompt). Gap: no test listed for `renderForExtractionContext` itself, and no golden test refresh enumerated for backend `agent.ts:220` change. See Test Coverage Gaps. |
| Quality gates | Miss | Plan doesn't explicitly call out `npm run typecheck && npm test` and `npm run -w @arete/cli build` after the model change. Add to Tests section. |

---

### AC Validation

This is a design plan, not a PRD — explicit ACs aren't expected at this stage and are absent. Note for plan-to-prd conversion: each thread should produce ACs of the shape:
- **Thread A**: "Given a meeting with `topics: [foo, bar]` in frontmatter, after `arete meeting approve --all`, both `decisions.md` and `learnings.md` entries contain a `- **Topics**: foo, bar` bullet, and `parseMemorySections` returns those topic slugs in `MemorySection.topics`." Plus regression: "Existing `### Title` entries still parse (no data loss)."
- **Thread B**: "Given an existing topic page for slug `q2-planning` and a transcript whose tokens cover ≥0.5 of the slug+alias tokens with ≥2 distinct multi-char tokens, the extraction prompt contains a `## Topic Wiki` section referencing `[[q2-planning]]`. Prompt char-count stays under `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000`."
- **Thread C**: "Extraction response with `core` + `could_include` produces `## Core` + `## Could include` (≤8 items, each ≤200 chars) in the staged section; absent `core` falls back to `summary`; absent or empty `could_include` omits the block entirely."

Watch for the AC anti-pattern "extraction quality improves" — that's a vibe metric, not testable. Quality work belongs in the empirical-validation step (dry-run flag) per Risks #1, not in ACs.

### Test Coverage Gaps

- **`renderForExtractionContext`** in `models/topic-page.ts` — no test listed. Add unit tests for: section-present-and-truncated (>1000 char Scope), section-absent (no header rendered), change-log limited to last 3, deterministic ordering.
- **Backend agent path** — `apps/backend/src/services/agent.ts:220` plumbing change isn't covered. The plan calls out this is fixing a latent gap (missing `activeTopicSlugs`), which means the backend test app pattern (`buildTestApp`) should assert the slug list reaches the extraction call. Without it, this regresses again silently.
- **`getMemoryItemsForTopics` recency-filter** — listed as "5 per slug, 90 days" but the test bullet is generic. Add explicit cases: zero-topics input → empty, one-topic-many-matches → cap at 5, mixed-recency → only ≤90d items.
- **`parseStagedSections` updates in `meeting-apply.ts:119–124`** — new `STAGED_HEADERS` entries (`'core'`, `'could include'`) need a parsing-roundtrip test; otherwise the new `formatStagedSections` writes headers that the parser silently drops.

---

### Concerns

1. **Single-PR scope is justified but raises blast radius.** Threads A/B/C share runtime paths but are independently risky: A is a writer/parser format change, B injects ~6KB into every extraction prompt, C reshapes the staged-section format. If any one of the three causes a real-world regression (e.g., LLM does worse with the delta directive), rollback drags the other two with it.
   - Suggestion: Land A first as a small standalone commit on the same branch (parser fix is a strict bug fix; topic tagging is forward-only and safe). Then B and C as a second commit. Two reverts beats one. The plan says "Single PR, not split" — fine, but at least split commits.

2. **`## Summary` → `## Core` rename is a breaking change to the staged-section format.** `meeting-apply.ts:119–124` STAGED_HEADERS additions are listed, but the plan doesn't enumerate every reader. From the LEARNINGS, `parseStagedSections` "stops at any `##` non-staged header" (integrations LEARNINGS, Staged Items Pattern). If `## Summary` is no longer recognized in re-extraction of older staged meetings (e.g., `--clear-approved` rerun), the parser will treat it as a section terminator instead of a known header — silently truncating section content. Also affects backend's `meetings.ts` route (`GET /:slug` returns staged sections to the web UI).
   - Suggestion: Keep BOTH `'summary'` and `'core'` in `STAGED_HEADERS` permanently; render `## Core` going forward but parse either. Add a regression test that opens a historical fixture with `## Summary` and confirms it still round-trips. Grep for `## Summary` across `packages/apps/backend/`, `packages/apps/web/`, and `packages/cli/test/golden/`.

3. **Lexical detection threshold is empirical and currently unvalidated.** `≥2 distinct multi-char slug tokens AND topic-token-coverage ≥ 0.5` is plausible but never measured against a real corpus. The plan's mitigation (a dry-run flag) is correct but is itself unspecified — it isn't in the Implementation section, only in Risks.
   - Suggestion: Promote the dry-run from a "things to watch" mention to an explicit task: "Add `arete meeting extract --dry-run-topics <file>` that prints `{ slug, score, tokenOverlap, multiTokenCount }` per candidate and exits without calling the LLM. Run on 5 real meetings before merge." This is a 30-line task and it gates Thread B's correctness.

4. **`MeetingContextDeps` constructor signature change isn't traced through callsites.** `topicMemory: TopicMemoryService` added to `MeetingContextDeps` (line 122 ref) means every `buildMeetingContext` caller needs `services.topicMemory`. Per `services/LEARNINGS.md`: "If changing AreteServices type: search for all `createServices()` call sites in `packages/cli/src/commands/` and update destructuring." Same applies here.
   - Suggestion: Plan should add a checklist item: "grep `buildMeetingContext\\(` and `MeetingContextDeps` across packages/, update each callsite, update mock factory under packages/core/test/factories." `topicMemory` is already present in `AreteServices` per recent commits (`topic-memory.ts` exists), so wiring is feasible — the gap is just enumeration.

5. **Frontmatter-injection guard not mentioned for `core` / `could_include`.** Per services LEARNINGS (2026-04-23): "reject any value containing raw `---` — a section body with a triple-dash terminator breaks frontmatter parsing on the next read." `core` is free-form prose and `could_include[]` are LLM-generated strings — both can carry `---` if a transcript or LLM output happens to. `formatStagedSections` writes them into a YAML-frontmattered file.
   - Suggestion: Add a sanitizer in `parseMeetingExtractionResponse` (the same place `could_include` length cap lives): strip or escape lines beginning with `---` in `core` and any `could_include[i]`.

6. **`MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` truncation strategy is "last-in-last-out" — but the plan doesn't define it.** "Last-in-last-out" is ambiguous. If it's "drop the most-recently-detected topic until under budget," that biases against newer topics, which is the opposite of what recency tiebreakers want elsewhere. If it's per-topic body truncation, it's fine.
   - Suggestion: Specify: "When over budget, truncate the lowest-scoring topic's `l2Excerpts` first, then its `sections.changeLog`, then drop the topic entirely. Keep at least the highest-scoring detected topic full-fidelity." Encode this as a small helper with its own test.

---

### Strengths

- **Latent bug fixes are real and well-scoped.** Verified the parser/writer mismatch exists today (`staged-items.ts:592` writes `## ${entryTitle}`; `memory.ts:55` parser regex is `^###\s+...`). All newly approved learnings/decisions are unsearchable until this lands. That alone justifies the work.
- **`renderForExtractionContext` and `detectTopicsLexical` as pure functions** matches the codebase's testability patterns (mirrors `selectSectionsForBudget`, `inferMeetingImportance`, `computeCommitmentMomentum`).
- **Decision log is concrete.** Five decisions, each with rationale; "no backfill" and "lexical first, LLM as future escape hatch" are correctly biased toward lower-cost, lower-risk choices.
- **Token-cost discipline.** `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` mirrors `MAX_EXCLUSION_CHARS = 4000` precedent. Good cohesion with the existing extraction prompt.
- **Out-of-scope section is sharp.** Slack-digest forward-compat noted; reconciliation untouched; topic-stub creation stays at approve gate. No scope creep.

---

### Devil's Advocate

**If this fails, it will be because the LLM ignores the delta directive and continues to restate wiki content.** The prompt asks the model to read a 6KB block labeled "DO NOT re-extract" and to filter on a five-rule rubric (NEW decision, CHANGED plan, NEW risk, NEW open question, CONFIRMATION-of-uncertain). LLMs at fast or balanced tier are uneven at multi-rule conditional filtering, and the prompt now competes with the existing Consolidation rules from 2026-04-17 (also conditional). The empirical signal will be ambiguous: recaps will look thinner because we removed `## Summary`'s implicit padding, even if the model is still emitting restatements that just *sound* like deltas. Without a labeled eval set or a baseline regression check, we'll likely declare success based on subjective "feels less verbose," then discover months later that the wiki and the meeting are diverging silently. Mitigation: before merge, run the plan's dry-run on 5 real meetings, then *separately* run extraction with and without `topicWikiContext` injected and diff the outputs — count whether any extracted item appears verbatim or paraphrased in the wiki context. That's a cheap A/B and it gives a real number.

**The worst outcome would be silently dropping real new learnings because the LLM over-applies the delta filter.** A topic page captures a stale plan; the meeting confirms a *different* plan; the LLM sees "this topic is in the wiki" and treats the new decision as a confirmation that doesn't need extracting. Or: a new risk is raised that's tangentially related to a wiki "Known gap" entry — model decides it's already known and drops it. Unlike Concern #1 (over-extraction), this is *invisible* — there's no downstream signal that an item was suppressed. The wiki keeps showing the stale state; the user reads thinner recaps and assumes nothing decision-worthy happened; weeks later the topic page is wrong and no one knows why. Mitigation: the "CONFIRMATION ONLY when the wiki shows a prior plan as uncertain and this meeting pins it down" rule is the load-bearing escape hatch. Strengthen it with a one-shot example in the prompt body. Also, instrument: log when `topicWikiContext` is present and extracted-items count drops below the historical mean for that meeting size — flag for manual review at the next `arete memory refresh`.

---

### Verdict

- [ ] Approve
- [ ] Approve with suggestions
- [x] **Approve pending pre-mortem completion** — plan is structurally sound; pre-mortem (running in parallel) will validate the failure modes flagged above. Address Concerns #2, #4, and #5 before execution begins (they are concrete, low-effort fixes). Concerns #1, #3, #6 should be reflected in the PRD-stage ACs and explicitly tasked.
- [ ] Revise

### Suggested Changes (Mode B)

**Change 1**: Backward compatibility (Concern #2)
- **What's wrong**: `## Summary` removal from `STAGED_HEADERS` will break re-parse of any historical staged meeting and any backend/web reader that knows the literal section name.
- **What to do**: Keep `'summary'` permanently in `STAGED_HEADERS` alongside new `'core'` and `'could include'`; in `formatStagedSections` prefer `## Core` on write but accept either on read; grep `## Summary` across `packages/apps/` and `packages/cli/test/golden/`.
- **Where to fix**: `packages/core/src/services/meeting-apply.ts:119–124` (parser side); `packages/core/src/services/meeting-processing.ts:625–666` (writer side); add fixture-roundtrip test to `packages/core/test/services/meeting-processing.test.ts`.

**Change 2**: Wiring trace (Concern #4)
- **What's wrong**: New `topicMemory` dependency on `MeetingContextDeps` not enumerated through callsites and test factories.
- **What to do**: Add a Tests-section task: "grep `MeetingContextDeps` and `buildMeetingContext(` repo-wide; update all construction sites and mock factories; verify via `npm run typecheck`."
- **Where to fix**: Plan's Tests section, plus `packages/core/test/factories/` (whichever factory builds `MeetingContextDeps`).

**Change 3**: Frontmatter-injection guard (Concern #5)
- **What's wrong**: `core` (free prose) and `could_include[]` can carry `---`, breaking frontmatter on next read — same issue as the topic-wiki-memory work caught last week.
- **What to do**: In `parseMeetingExtractionResponse`, add line-prefix sanitizer: replace `^---` with `— —` (or strip the line) for both `core` and each `could_include[i]`.
- **Where to fix**: `packages/core/src/services/meeting-extraction.ts` parse path (~line 817–1139).

**Change 4**: Dry-run promotion (Concern #3)
- **What's wrong**: Empirical threshold validation is in Risks but not Implementation.
- **What to do**: Add a task under Thread B: "Add `--dry-run-topics` to `arete meeting extract` that prints detected topics + scores and exits before LLM call. Required for threshold validation before merge."
- **Where to fix**: Plan's Thread B section; corresponding code in `packages/cli/src/commands/meeting.ts`.

**Change 5**: Truncation strategy spec (Concern #6)
- **What's wrong**: "Last-in-last-out" is ambiguous.
- **What to do**: Specify priority order: drop lowest-scoring topic's `l2Excerpts` → its `sections.changeLog` → drop the topic. Always retain the top-scored topic full-fidelity.
- **Where to fix**: Plan's Thread B, `MAX_TOPIC_WIKI_CONTEXT_CHARS` paragraph; helper goes in `meeting-extraction.ts`.

**Change 6**: Commit split inside the single PR (Concern #1)
- **What's wrong**: Three threads in one commit means rollback is all-or-nothing.
- **What to do**: One commit per thread on the same branch. Thread A first (it's a strict bug fix + forward-only schema). B and C can pair if needed.
- **Where to fix**: Execution-stage instruction; not a plan content change but worth noting for the PRD.
