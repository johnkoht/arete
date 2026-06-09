# Phase 9 Plan Review — Eng-Lead Pass

**Reviewer**: eng-lead
**Reviewed**: 2026-06-03
**Plan**: phase-9-brief-primitive-restore/plan.md
**Verdict**: REVISE BEFORE BUILD

## Verdict reasoning

The plan's architectural shape is right: typed-mode aggregators that compose existing services with no LLM in the verb, output stable markdown, agent does synthesis in chat context. That matches v2's contract and the diagnosed regression. Two issues bump this to REVISE, not APPROVE-with-minor.

First, **the plan calls `TopicMemoryService.findTopics()` and that method does not exist** (see `topic-memory.ts:343-475`). The actual surface is `listAll()` + `retrieveRelevant()`. This isn't a typo — wiki retrieval is described as load-bearing for the regression fix (plan §"Wiki integration"), and there are at least two viable strategies (alias-jaccard via `listAll()` + `tokenizeSlug()` vs. semantic-search via `retrieveRelevant()`) that have different cost, latency, and quality tradeoffs. The plan needs to pick one before build, with a justification, because picking wrong is exactly the failure mode that produces today's thin briefs.

Second, **Memory Highlights are currently empty for most people** because `arete people memory refresh` does not wire `callLLM` (`packages/cli/src/commands/people.ts:519-525` omits the `callLLM` option). `--person` mode's "verbatim Memory Highlights" section therefore lands as empty for any person whose stances haven't been extracted via a different path. The plan inherits this thin input and AC10 (the quality bar) is the only thing that catches it — too late and too subjective. A pre-build callLLM wiring or an explicit decision to live with stance-less Memory Highlights for v1 needs to be on the page.

Beyond those, several smaller gaps: the existing `--for` is `requiredOption` so mutual-exclusion needs an option-API change not just validation; `--meeting` for an attendee with no person file is unspecified; per-attendee token caps aren't bounded; `suggestAreaForMeeting`'s ~42% rate is the load-bearing signal for project/area composition in `--meeting`; and the SKILL.md "ignore qmd index output" prose is hopeful — a `--quiet` flag is the actual fix. Plan should be revised, not rewritten.

---

## Concerns (HIGH — must address before build)

### C1: `TopicMemoryService.findTopics()` does not exist

**Concern**: Plan §"Wiki integration" (lines 188-202), AC5 (line 303), and every mode's gather plan (lines 107, 127, 146, 173) call `findTopics(query: string)`. The class has no such method. Available surface:
- `listAll(paths)` → returns all topic pages plus errors. Caller can filter by `frontmatter.aliases` / `frontmatter.area` / token-match against `topic_slug` using the already-exported `tokenizeSlug()` helper.
- `retrieveRelevant(query, opts)` → semantic search via injected `SearchProvider` (qmd or fallback), returns top-k topic pages with `bodyForContext` already truncated to a word budget. Returns `searchBackend: 'none'` when no provider is wired.

These two paths have different tradeoffs:
- `listAll()` + alias-jaccard match is deterministic, ~free, but won't catch a topic whose page doesn't have the attendee/area in `aliases:` even though the body discusses them.
- `retrieveRelevant()` is qmd-dependent (so re-introduces the "index fresh enough?" risk that already bit `meeting` mode in C2 below), but catches semantic matches the alias surface misses.

**Why it matters**: Wiki retrieval is the "load-bearing change" called out in the plan itself ("today's regression includes 'agent doesn't find the topic pages'"). If this method materialization gets handed to the builder, they'll pick one of the two paths under pressure and the wrong choice silently degrades AC10. The April 29 quality bar is what we're chasing — bad wiki matching gets us April 29 with weaker callbacks.

**Recommendation**: Pick before build. My read: use `retrieveRelevant()` as primary with `listAll()` + alias-jaccard as a fallback when `searchBackend === 'none'`. Rationale: `retrieveRelevant()` already does the recency-bonus + area-match-bonus re-ranking the brief wants, and the cap-at-7 contract maps cleanly to its `limit` option. Update plan §"Wiki integration", AC5, and the per-mode gather plans to reflect the chosen surface. Note in AC5 that the test fixture must seed enough topic content to exercise whichever path is chosen (semantic vs. alias).

**Plan reference**: §"Wiki integration" line 191; per-mode gather plans lines 107, 127, 146, 173; AC5 line 303.

---

### C2: `--meeting` mode's project/area composition leans on a ~42%-accurate signal

**Concern**: §"Modes — `--meeting`" step 3 says "Infer meeting area via `AreaParserService.suggestAreaForMeeting()` if no explicit tag" (line 168) and step 4 conditions project inclusion on that area match. `suggestAreaForMeeting` was Phase 8 followup-8's tuning target and landed at ~42% on real meetings. For meetings without an explicit `area:` in frontmatter — most ad-hoc and many calendar-derived ones — that means more than half of `--meeting` invocations will silently drop the project section entirely, or worse, attach a project section for the wrong project.

The downstream impact is exactly the regression class we're trying to fix: agent sees no project section, doesn't weave project context into the agenda, and we're back to "thin template fill."

**Why it matters**: Project context was a notable column of the April 29 quality bar (the "Glance 2.0 Roadmap" section is explicit project framing). The plan treats project resolution as "just call the inference function" but the function's accuracy is the actual bottleneck. AC4 doesn't gate against this; AC10 is the only catch and it's subjective.

**Recommendation**: One of:
1. Require `--project <slug>` as an optional manual override on `--meeting` mode so the caller can pin the project when inference fails ("brief --meeting 'foo' --project glance-2-mvp").
2. Lower the SUGGESTION_THRESHOLD just for brief composition and surface the confidence in the markdown so the agent can decide whether to lean on it.
3. Add an AC that verifies `--meeting` composes project context whenever the meeting file has an explicit `area:` field (the deterministic path), and explicitly accept that inference-path composition is best-effort.

I'd take option 1 — it costs ~10 LOC, keeps the deterministic path clean, and gives the scripted use case (recurring 1:1s tagged to specific projects) a tested escape hatch.

**Plan reference**: Mode §"`--meeting` Gather plan" steps 3-4 (lines 168-170); AC4 (line 301).

---

### C3: Memory Highlights are likely empty — `--person` mode has thin input today

**Concern**: `arete people memory refresh` (`packages/cli/src/commands/people.ts:519-525`) does not pass `callLLM`. `entity.ts:1354` only extracts stances when `options.callLLM` is set. Action items still get extracted, so `## Memory Highlights (Auto)` ends up with action items but no stances/asks/concerns for any person refreshed via the standard CLI path. Plan §"`--person` Gather plan" step 4 says "Read `## Memory Highlights (Auto)` from person file (asks/concerns/stances) — surfaced as-is" (line 104) — surfaced as-is is empty for most people.

The Phase 9 plan is silent on this. The regression diagnosis context implies it's known ("the 'callLLM never wired into people memory refresh' Layer 1 bug"). But Phase 9 inherits the bug and AC10 is the only thing that catches it.

**Why it matters**: "Memory highlights" is one of the three sections that gave the April 29 agenda its richness ("standing prompts," "asks to revisit"). Without stances, `--person` returns a metadata block plus open commitments plus a list of recent meetings — pretty close to what the agent could already produce manually, which means Phase 9's --meeting mode (which composes per-attendee briefs) doesn't fix the regression for any meeting whose attendees lack stance extraction.

**Recommendation**: Either:
1. Add a non-AC build step to Phase 9: wire `callLLM` into `arete people memory refresh`'s `refreshPersonMemory` call site. Run a one-shot refresh against the workspace before AC10. Cost is small (~5 LOC + a stance-extraction-cost confirm prompt). This is the cheapest, most aligned fix.
2. Or explicitly mark this out of scope and add an AC that `--person` Memory Highlights section gracefully degrades when stances are absent (still surface the action-items portion, drop the empty stance subsection cleanly) — and accept that AC10 will reflect that degradation.

I'd take (1). Without it, AC10 is set up to fail or to be papered over.

**Plan reference**: §"`--person` Gather plan" step 4 (line 104); AC1 (line 295); AC10 (line 313).

---

### C4: Mutual exclusion requires changing `--for` from required to optional — plan glosses this

**Concern**: AC8 says "`arete brief` with two or more of `--for/--person/--project/--area/--meeting` errors" (line 309). Today, `--for` is declared `.requiredOption(...)` (`packages/cli/src/commands/intelligence.ts:826`). To add `--person` as an alternative to `--for`, `--for` must become `.option()` and the validation must enforce "exactly one of {for, person, project, area, meeting}." The plan's step 12 ("CLI extension — add typed mode options to `registerBriefCommand`. Mutual exclusion validation. `--json` parity.") buries this in one bullet.

**Why it matters**: Loosening `requiredOption` is a small but visible CLI contract change. Existing scripts calling `arete brief --for X` keep working, but anything that runs `arete brief` with no flags will now error in the new code path rather than commander's "error: required option '--for <query>' not specified" path. The error message needs to be helpful: "exactly one of --for/--person/--project/--area/--meeting required."

**Recommendation**: Promote this to its own bullet in AC8 with explicit error-message contract; add a unit test that exercises both the "zero modes" and "two modes" paths and asserts on exit code + error text. Trivial to build, but worth pinning in the AC so it doesn't drift.

**Plan reference**: AC8 line 309; Build step 12 line 334.

---

## Minor concerns (LOW — fix in build or queue as followup)

### MC1: Per-section token caps unbounded inside the 12K total cap

12K total cap is named (line 91, AC11 line 315). But for `--meeting` composing 5 attendees, if any single attendee's mini-brief is itself >12K (an outlier — Lindsay's brief alone could approach this), per-attendee composition has no inner cap and the truncation marker doesn't tell the agent which attendee was dropped. Add per-section caps with explicit defaults: 2K per attendee mini-brief, 4K for project section, etc. Document them inline.

### MC2: `--meeting` for an unknown attendee — silent vs. error?

§"`--meeting` Gather plan" step 2 says "For each attendee → call internal person-brief assembler." If an attendee resolves to a calendar email with no person file, plan is silent. Likely intent: surface a one-line stub ("Attendee: jane@acme.com — no person file") so the agent knows to ask. Add a sub-AC under AC4. Trivial to build.

### MC3: SKILL.md "ignore qmd index output" is hopeful, not load-bearing

§"prepare-meeting-agenda integration" line 289 adds prose "ignore any `[qmd: indexed N files]` output." Agents see stderr noise and sometimes treat it as a user prompt anyway. Right fix: `arete brief --meeting` should suppress the qmd-noise on its own path (or pipe through a `--quiet` flag) so the SKILL.md doesn't need to caveat anything. Cost is small; the plan can either (a) add it as a step in Phase 9 or (b) queue it explicitly as a followup with name + 1-line scope.

### MC4: `--meeting` cross-meeting overlap via SearchProvider — qmd freshness assumption unstated

§"`--meeting` Gather plan" step 5 lists "last 3 meetings with this attendee set (any subset overlap)" composed via SearchProvider (per Architecture line 228). qmd may not include the most recent 1-2 meetings if the user just finalized them and hasn't indexed. The plan should pick a fallback: scan `resources/meetings/*.md` filenames + frontmatter for attendee overlap directly when SearchProvider returns 0 / fewer-than-limit results. Note: `EntityService.refreshPersonMemory` already does exactly this fallback (`entity.ts:1281-1291`); reuse the pattern.

### MC5: `--for` keeping the existing `assembleBriefing` path — duplicate aggregator surfaces

Plan keeps `--for` (line 77, 184). Fine for backward compat, but it means two `assembleBriefing*` paths now coexist with diverging behaviors (gaps, confidence, primitive grouping for `--for` vs. clean structured sections for typed modes). Worth one line in §"Non-goals" explicitly noting that the divergence is accepted v1 and we'll converge later if we find ourselves maintaining the same fix in two places.

### MC6: `EntityService.listPeople()` × per-person meeting frontmatter scan — workspace scale

Plan §"`--person` Gather plan" step 2 ("List meetings where person appears in `attendee_ids` OR `attendees`") is O(meetings) for one person, fine. But `--meeting` mode does this for every attendee + step 5 does it again for the attendee set. With 124 person files in the user's workspace and a typical meeting having 1-2 attendees, this is fine; with a 5-person leadership sync, it's 5× the meetings-dir scan. The fix is to read the meetings dir once and bucket by attendee, not loop the dir per attendee. Worth a note in the assembler so the builder doesn't write the naive O(attendees × meetings) version.

---

## Strengths (what the plan got right)

- **Pure aggregator contract is well-defined** (Design principles 1-2, AC7). The "no AIService injection" invariant test (AC7 + `brief-no-llm.test.ts`) is exactly the right shape — it pins v2's "no LLM in CLI" rule structurally instead of relying on review.
- **Stable markdown shape with empty-section drop** is the right call for downstream agent consumption. Removes the "fill in N/A" anti-pattern that bloats output without informing.
- **Source paths on every fact** (Design principle 5) operationalizes verifiability without requiring the agent to call follow-up tools. This is the right tradeoff vs. wikilink-style references.
- **`--summarize` punted to queued followups** is correct. The agenda regression is fixed by structured input, not by another LLM verb. Adding `--summarize` upfront would have re-introduced exactly the LLM-in-CLI surface we just removed.
- **Composition over reimplementation**: `--meeting` composes `--person` + `--project` rather than defining its own gather plan. Right shape — single source of truth per primitive type.
- **Rollback plan is clean** (line 378). Single-commit SKILL.md revert restores the prior agent flow without touching the new CLI surface. Genuinely additive — that's rare and valuable for a soak-driven phase.
- **Q1 / Q4 / Q5 calls are defensible** (see Q&A below).

---

## Q&A decisions re-evaluated

**Q1 — option shape (separate `--person/--project/--area/--meeting`)** — CONFIRM. The plan picks the right shape for help text and autocompletion. A single `--mode=person --slug=lindsay-gray` form would be marginally tidier but worse for muscle memory ("brief --person foo" is what John will type).

**Q2 — `--meeting` accepts slug AND title** — CONFIRM with a caveat. Slug-first resolution is unambiguous; title-second pulls calendar and matches. The implicit precedence ("try slug, fall back to title") should be stated in the AC so the implementer doesn't invert it. Pin in AC4.

**Q3 — fixed defaults, no `--limit` flag** — CONFIRM. YAGNI. 10/3 is reasonable for the regression we're solving. If friction surfaces, adding the flag is one commit. Don't pre-pave it.

**Q4 — `--json` structured-only, no markdown field** — CONFIRM. Right call. Markdown is derived; embedding it in JSON would double the payload for no gain. Agent consumers either want structured (use JSON) or narrative (use markdown stdout).

**Q5 — `--meeting` resolution failure degrades with warning, no silent empty** — CONFIRM, sharpen. The plan says "best-effort with title only." Need to specify what "title only" actually returns — title metadata + a warning + no attendee briefs? Title + wiki-match attempt against the title string? Pin in AC4.

**Q6 — wiki retrieval cap N=7, no tunable flag** — PUSH BACK MILDLY. 7 is fine as the default, but if the wiki retrieval path is `retrieveRelevant()` (see C1), that method's `limit` defaults to 3 and the score re-ranking happens post-fetch. 7 is more than 3× the natural default. Verify empirically during build that 7 doesn't crowd out higher-priority sections of the brief. If it does, knock it to 5 and revisit if quality fails.

---

## Verification checklist for post-build review

1. Code review confirms zero `AIService` / `callLLM` / `aiService.call` imports or invocations in any new `assembleBriefFor*` method or formatter (AC7).
2. `brief-no-llm.test.ts` instantiates `IntelligenceService` with no AIService and exercises every new method. Test passes in `tsx --test`.
3. Wiki retrieval path is documented in the build report (per C1 decision): which method, why, fixture asserts which behavior.
4. `arete brief --person <slug-with-stances>` returns non-empty `## Memory highlights`; `arete brief --person <slug-without-stances>` degrades gracefully (per C3 resolution path).
5. `arete brief --meeting <recurring-1:1-slug>` returns a project section when the meeting frontmatter has an explicit `area:` (verifies the deterministic path independently of `suggestAreaForMeeting` quality).
6. `arete brief` with zero of `{--for, --person, --project, --area, --meeting}` exits 1 with a clear "exactly one mode required" message (AC8 + C4).
7. `arete brief` with two of those flags exits 1 with the same shape error.
8. `arete brief --person <slug> --json` shape is documented in the build report; markdown-vs-JSON parity gate from AC6 passes.
9. Token-budget truncation marker appears at the bottom of an oversize brief and names the count of dropped items (AC11). Verify on a 6-attendee leadership meeting fixture if available.
10. `prepare-meeting-agenda` SKILL.md diff: step 4 references `arete brief --meeting`, fallback path is `--person` per attendee, April 29 quality bar is cited. Includes the qmd-noise suppression (per MC3 resolution path).
11. Manual AC10: a fresh agenda generated for an upcoming 1:1 has ≥3 themed sections, ≥2 cross-source references, ≥2 specific items per section, and is compared side-by-side with `resources/meetings/2026-04-29-john-lindsay-11.md` lines 88-158. Note any quality delta as residual.
12. Build report includes a 1-paragraph soak plan: which meetings will be generated against the new flow during the next N days, what counts as "agenda regression resolved" vs. "still degraded."
