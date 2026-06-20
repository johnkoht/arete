## Pre-Mortem: Slack-Digest → Topic-Wiki Integration

**Plan**: dev/work/plans/slack-digest-topic-wiki/plan.md
**Date**: 2026-04-29
**Tier counts**: 0 CRITICAL, 4 HIGH, 6 MEDIUM, 3 LOW

---

### Risk 1: Skill prompt regression is undetectable [HIGH]

**Problem**: Step 1 adds a "Prefer these existing topic slugs when applicable" block to `packages/runtime/skills/slack-digest/SKILL.md` Phase 2c, verbatim from the meeting-extraction prompt. The skill is markdown-authored — no unit test exercises the prompt itself. If a future edit to the bias block (e.g., reformatting, accidental deletion of the active-slug list) regresses, the only signal is "topics on slack digests look wrong / sprawl returns." Step 4's CLI integration test covers `arete topic refresh --slugs --source` (the post-skill code path) but not the skill's prompt output. The 2026-04-23 learnings memo flagged this exact class of failure ("services tested ≠ services wired") and the dual-tier sprawl defense (extraction prompt bias + Jaccard alias-merge) only works if the prompt half holds.

**Mitigation**: Two defenses, both cheap. (a) Convert the bias block into a single named anchor in PATTERNS.md (e.g., `topic_slug_bias_block`) that *both* meeting-extraction's prompt and the slack-digest skill quote by reference, so divergence is grep-detectable: `rg "Prefer these existing topic slugs" packages/runtime` should return both files with byte-identical text. Add a test in `packages/runtime/test/skills.test.ts` (if it exists; otherwise a new `packages/core/test/runtime/slack-digest-prompt.test.ts`) that reads both files and asserts the bias-block region byte-equals the canonical anchor. (b) On the receiving end, the alias-merge pass in `meeting-apply.ts:201`/`aliasAndMerge` already normalizes drift to known slugs. Verify it runs on slack-digest topic output too — if the skill writes `topics:` to digest frontmatter and `discoverTopicSources` consumes those slugs without a normalization step, a misshapen slug from the skill survives into `sources_integrated`. The plan should add an explicit step "alias/merge slack-digest topics at digest-write time" or document that we accept post-hoc skew.

**Verification**: Grep test passes; deliberate corruption of the bias block in one file fails the byte-equal assertion. Manually corrupt a slug in a digest fixture and confirm the topic refresh path either rejects it (ideal) or produces a clearly attributable source-trail entry (acceptable).

---

### Risk 2: `parseMeetingFile` silently rejects slack-digest files (current behavior masks the dependency change) [HIGH]

**Problem**: Today, `refreshAllFromMeetings` only scans `resources/meetings/` and reads via `parseMeetingFileExternal` (= `parseMeetingFile` from `meeting-context.ts:163`). I checked the parser: it requires only `^---\n...\n---\n` framing and tolerates missing `attendees` (defaults to `[]`); `topics` is read directly via `Array.isArray(fm.topics)`. So a slack-digest with `topics: [...]` would parse fine if the directory scan reached it — but the current `meetingsDir = pathJoin(paths.resources, 'meetings')` filter means it never does. **The plan implicitly assumes `parseMeetingFile` will Just Work on slack digests, but commits to building a separate `parseSlackDigestFile` (Step 2, "cheap" path).** Two parsers reading the same frontmatter shape is the kind of duplication the plan explicitly warns against, and it forks the schema if either side adds fields (e.g., `slack-evidence-dedup` adding commitment IDs to digest frontmatter — the plan's own coordination point).

**Mitigation**: Before writing `parseSlackDigestFile`, verify empirically: feed `2026-04-24-slack-digest.md` (already exists in arete-reserv) through `parseMeetingFile` in a one-off script and inspect the output. If `topics`, `date`, and body parse correctly (they should, given the regex), drop `parseSlackDigestFile` entirely and use `parseMeetingFile` for both source types. If a real failure surfaces, document the *specific* shape difference that forced a split. The plan's "generalize to `parseTopicSourceFile`" rejection is right; the choice between "reuse `parseMeetingFile` as-is" and "fork into `parseSlackDigestFile`" is the actual decision and the plan picked the more expensive option without empirical justification.

**Verification**: New unit test `packages/core/test/services/topic-memory-discovery.test.ts` asserts `parseMeetingFile(slackDigestFixtureContent)` returns a parsed object with the expected `topics: [...]` and a non-empty body. If this passes, delete `parseSlackDigestFile` from the plan.

---

### Risk 3: Concurrent `meeting approve` + slack-digest skill collide on `.seed.lock` (NOT a deadlock — a hard error) [HIGH]

**Problem**: The plan's risk section says "Concurrent topic refresh from meeting approve + slack-digest approve... Both paths acquire `.arete/.seed.lock` via `refreshAllFromSources`. Symmetric locking is already verified for meeting-side; slack-side inherits it for free." This is half right and half wrong. I read `packages/core/src/services/seed-lock.ts`: `acquireSeedLock` uses `fs.open(path, 'wx')` (= `O_CREAT | O_EXCL`), which is **not reentrant** and throws `SeedLockHeldError` on collision. `meeting.ts:1437-1444` catches this and degrades gracefully (`warn('Topic integration skipped: ...')`); the committed items already persisted. But the slack-digest skill is markdown-authored — it shells out to `arete topic refresh --slugs ... --source ...`. If a `meeting approve` is running concurrently and holds the lock, the slack-digest skill's CLI invocation will exit non-zero with `seed_lock_held` JSON, the skill won't know how to retry, and the user sees a confusing error mid-Phase-5. Worse: the digest file is already written (Phase 5a completes before topic refresh per the plan's sequencing), so the digest's `topics:` are *committed but not integrated* — silent partial state until the next `arete memory refresh`.

**Mitigation**: Two parts. (a) Make the slack-digest skill's `arete topic refresh --slugs --source ...` invocation tolerate `seed_lock_held` the same way meeting-approve does: catch, warn, continue. The skill must explicitly document this in Phase 5 and not abort. (b) Add a recovery hint to the digest file's frontmatter when integration is skipped — e.g., `topics_integrated: false` — so a later `arete memory refresh` can detect "digests with topics_integrated=false" and re-run. Without (b), the partial state is invisible. Note that meeting approve has the same gap and ships today, so this is a pre-existing problem the plan inherits; flagging because slack-digest's failure surface is more user-visible (skill output is the only signal).

**Verification**: Test in `packages/cli/test/commands/topic-refresh-slack.test.ts`: hold the seed lock externally, run `arete topic refresh --slugs foo --source path/digest.md`, assert exit code is non-zero with `seed_lock_held` JSON shape AND that the skill's wrapper (documented in SKILL.md) treats this as recoverable. Add a follow-up plan-c item if (b) gets deferred.

---

### Risk 4: `--source` flag is "label-only" — UX surprise on bulk re-integration [HIGH]

**Problem**: The plan acknowledges this in Risks: "`topic refresh --slugs ... --source ...` does NOT scope to that one file — it runs `refreshAllFromSources` against ALL meetings/digests tagged with the slug. The `--source` flag is just a logging hint." But the plan's Step 3 acceptance criterion says: *"A slack digest approving a thread that references `cover-whale-templates` produces a new entry in `cover-whale-templates.md`'s `sources_integrated` referencing the digest file path."* That sounds like the user expects scoped behavior. Real failure mode: a user runs the slack-digest skill, sees "Integrating 1 source... cost $0.045 (3 topics × ~$0.015)" — but the actual run is "integrating ALL meetings + digests for 3 topics," which on a workspace with 10 prior digests for `cover-whale-templates` could be 10× the cost. The plan's idempotency claim (content-hash dedup makes re-integration a no-op) only holds if the prior digests were *already* integrated; if they have `topics:` from this plan's Step 1 but were *first* discovered today, every one of them runs a full LLM integration synchronously in the slack-digest skill's flow.

**Mitigation**: Either (a) make `--source <path>` actually scope behavior — pass a `sourcePath` filter into `refreshAllFromSources` that limits `discoverTopicSources` output to entries where `entry.path === sourcePath`. The dedup invariant is preserved (idempotent on re-runs), and the cost surprise vanishes. This is ~20 LOC and is the right semantics. Or (b) keep label-only but make the cost estimate visible *before* the skill runs the call — print `Integrating N sources across M topics (~$X)` and abort if above a threshold. Given that the skill is non-interactive in Phase 5, (a) is much cleaner. The plan's rejection of (a) is implicit; raise it to an explicit decision.

**Verification**: With `--source` scoping (a): integration test in `topic-refresh-slack.test.ts` sets up 3 prior digests + 1 new digest all tagged `foo`, runs `arete topic refresh --slugs foo --source <new-digest-path>`, asserts only the new digest's hash appears in `sources_integrated` after the call (the prior 3 are not integrated until a later `--all` sweep). Without scoping (b): assert dry-run output prints all 4 sources before the user decides.

---

### Risk 5: Plan's call-site count is off — `meeting.ts:1421` correct, others slightly off [MEDIUM]

**Problem**: I verified the rename targets via `rg`. The actual call sites are:
- `packages/cli/src/commands/intelligence.ts:511` ✓ (matches plan)
- `packages/cli/src/commands/topic.ts:253` ✓
- `packages/cli/src/commands/topic.ts:331` ✓
- `packages/cli/src/commands/topic.ts:787` ✓
- `packages/cli/src/commands/topic.ts:910` ✓
- `packages/cli/src/commands/meeting.ts:1421` ✓ (plan said 1421, correct)
- **Plus** the prototype declaration at `packages/core/src/services/topic-memory.ts:779,790` and the `dist/` mirror; doc comment at `meeting.ts:1391` that mentions `refreshAllFromMeetings` by name. The plan called out 6 call sites; counting the service definition + doc comment, it's 8 places to touch. Plan's count is a slight under-reporting and the doc comment will silently lie if missed.

**Mitigation**: Pre-rename grep gate: `rg -n 'refreshAllFromMeetings' packages/{cli,core}/src` and `rg -n 'refreshAllFromMeetings' packages/{cli,core}/src/**/*.md` (doc comments). Both must hit zero after rename. The plan's "rename lands as its own commit with no behavior change" is the right approach; just bump the touchpoint count to 8 (incl. service + doc). `dist/` regenerates from the build; no manual edit there.

**Verification**: Post-rename grep: `rg -n 'refreshAllFromMeetings' packages/cli/src packages/core/src` returns no matches. CI typecheck passes. All `topic-memory.test.ts` tests green.

---

### Risk 6: `--days-back=N` "manual recovery" path is undocumented to users [MEDIUM]

**Problem**: Step 5 declares pre-existing slack-digest backfill out of scope and points users to `arete slack-digest --days-back=N` as the workaround. Plan says "Document this as the manual-recovery path." But the plan's "Acceptance" only references README/SKILL.md generically — the slack-digest SKILL.md I read does mention `--days-back=N` (line 50) as an existing arg, but there is no dedicated section explaining "if you upgraded after April 28, 2026, your old digests don't appear in topic narratives — re-run with `--days-back=N` to backfill." Without this, users hit the gap silently and conclude "the topic wiki doesn't cover Slack" when in fact it just doesn't cover their *historical* Slack.

**Mitigation**: Add a 3-line "Topic Wiki Coverage" subsection to `slack-digest/SKILL.md` between the "Workflow" header and "Phase 1" (or in the "References" section): "Slack digests created on or after the topic-wiki integration ship date contribute to topic pages automatically. To backfill earlier digests, re-run with `--days-back=N` covering the gap." Also update `dev/work/plans/topic-wiki-memory-phase-c/plan.md` item 6 (historical backfill) to explicitly note slack-digest needs the same treatment, so when item 6 ships it covers both source types.

**Verification**: Grep `packages/runtime/skills/slack-digest/SKILL.md` for "days-back" and confirm at least one mention is in the context of topic-wiki coverage. README check: `rg "topic.*backfill|backfill.*topic" README.md` returns at least one user-visible note.

---

### Risk 7: `slack-evidence-dedup` adds commitment IDs to digest frontmatter, busting `hashSourceBody` idempotency [MEDIUM]

**Problem**: The sibling `slack-evidence-dedup` plan (line 52) raises the possibility that digests carry commitment IDs in frontmatter for ID-based matching. `hashMeetingSource` (= `hashSourceBody` post-rename) strips frontmatter via `/^---\r?\n[\s\S]*?\r?\n---\r?\n?/` and hashes only the body — so adding commitment-ID frontmatter to a digest does *not* bust the topic-page idempotency hash. **But**: if `slack-evidence-dedup` instead adds commitment IDs *inline in the digest body* (e.g., as `### Commitments Resolved\n- fd38fa2c: ...`), regenerating the digest with updated commitment hashes (resolution status changes) does change the body and thus does bust the hash, forcing topic re-integration on every digest regen. The plan claims orthogonality based on "we don't share state" — but the body-hash invariant is implicitly shared and not called out.

**Mitigation**: The plan's coordination-point note ("if `slack-evidence-dedup` adds fields, this plan ignores them") needs to be tightened to "...adds frontmatter fields..." — body changes do bust the hash by design, and that's correct (a digest whose body genuinely changed should re-integrate). Document this distinction in `topic-memory.ts:hashMeetingSource` JSDoc with a slack-digest note. Coordinate with the sibling plan: any dedup metadata that's volatile across runs must live in frontmatter, not in body.

**Verification**: Read `slack-evidence-dedup/plan.md` (when it lands beyond stub) for "frontmatter" vs "body" dedup-data placement. Add a unit test that verifies adding frontmatter fields (e.g., `dedup_processed_at: 2026-04-28`) to a slack-digest fixture leaves `hashSourceBody` byte-identical.

---

### Risk 8: Per-digest topic union pollutes single-thread topic narratives [MEDIUM]

**Problem**: Step 1 explicitly chose per-thread extraction with per-digest union for `topics:`. The plan defends this: "`integrateSource`'s LLM prompt already filters its own input." I read the prompt at `topic-memory.ts:667`: it says *"updating ONLY the sections the new source substantively changes."* Substantive-change framing biases toward minimal mutation but does NOT instruct the LLM to filter the input by topic relevance. A digest covering 8 threads, where only thread 3 mentions `cover-whale-templates`, will see all 8 threads in `NEW SOURCE`, and the LLM may pick up unrelated mentions ("templates" in thread 6 about a different feature) and conflate them. The plan's defense is "if this proves too noisy in practice, the next iteration introduces a per-thread source-segment abstraction" — i.e., an unverified bet on LLM judgment with a deferred fix.

**Mitigation**: Concrete mitigation cheap to ship now: extend `buildIntegratePrompt` (or add a sibling for digest sources) to take an optional `relevantSlice: string` field. For slack-digest sources, the skill knows which thread(s) tagged each slug — pass *only those threads' content* as `NEW SOURCE` instead of the whole digest body. The hash invariant stays at the file level (the digest's content-hash is what gates re-integration), but the LLM input is sharper. ~30 LOC change in `topic-memory.ts`'s prompt builder + a new optional field in `discoverTopicSources` entries. Defer if the plan team explicitly accepts the noise risk; otherwise it's a Phase 1 inclusion.

**Verification**: Hand-craft a 3-thread digest fixture where thread 1 = topic A only, thread 2 = topic B only, thread 3 = topic A + B. Run integration, eyeball the resulting `cover-whale-templates.md` Current state for thread-2-only content bleed-through. If clean, accept. If polluted, ship the per-thread slice mitigation before merge.

---

### Risk 9: Step 4's AI mock harness diverges from Phase C item 5 if both ship [MEDIUM]

**Problem**: Plan's Step 4 builds a minimal `services.ai.call` stub for `topic-refresh-slack.test.ts`. Phase C item 5 (separate plan, not yet written) ships generic AI-mock CLI test infrastructure. If item 5 lands with a different injection point (e.g., a workspace-level `services.ai = mockAI` swap vs. this plan's prompt-shape-keyed scripted responses), Step 4's harness becomes a one-off duplicating effort. Cost is low (one test file) but the surface area is conceptually wrong: if the team ships AI-mock in two places with different shapes, every future LLM-spending feature gets a third option.

**Mitigation**: Constrain Step 4's harness to *only* injection-via-`AIServiceTestDeps` (already exists in `packages/core/src/services/ai.ts:64`). The plan already mentions this. Avoid building a "scripted response queue keyed by prompt-shape" abstraction in this plan — start with a single canned response object and let item 5 design the queueing/keying API. If item 5 lands first, this plan's test imports its harness instead of building a parallel one. Add an explicit note in the plan's Step 4: "If Phase C item 5 lands first, replace this section with item 5's harness."

**Verification**: Code review of `topic-refresh-slack.test.ts` rejects any new "AI-mock framework" abstraction beyond direct `AIServiceTestDeps` use. The test file should be ≤150 LOC including fixtures.

---

### Risk 10: New CLI primitive `arete topic list --active --slugs --json` duplicates `renderActiveTopicsAsSlugList` outside core [MEDIUM]

**Problem**: Plan's Step 1 adds a new flag combination: `arete topic list --active --slugs --json`. The expected output is "the same format `renderActiveTopicsAsSlugList(getActiveTopics(...))` produces." The plan rationale: the skill is markdown-authored and can only reach core via CLI, and the alternative ("pipe `arete topic list --json` through jq") is fragile. Risk: if the implementation in `topic.ts` calls `getActiveTopics` and `renderActiveTopicsAsSlugList` directly, fine — single source of truth. But if it re-implements the slug-list rendering inline (because the renderer signature doesn't match the CLI's filter combinations exactly), drift happens. I confirmed `renderActiveTopicsAsSlugList` exists at `packages/core/src/models/active-topics.ts:144` and is exported from `packages/core/src/index.ts:144`; it's reachable. So the risk is process, not architecture: the implementer must use the existing function, not write a parallel one.

**Mitigation**: Step 1's acceptance criterion already says "emits the same format `renderActiveTopicsAsSlugList(getActiveTopics(...))` produces" — strengthen that to "implementation literally calls `renderActiveTopicsAsSlugList(getActiveTopics(topics, opts))` and pipes the result to stdout, no local rendering." Test asserts byte-equality between the CLI output and a direct in-process call to the renderer.

**Verification**: New test in `packages/cli/test/commands/topic-list-active-slugs.test.ts`: invokes the CLI with `--active --slugs`, captures stdout, compares byte-equal to `renderActiveTopicsAsSlugList(getActiveTopics(fixtures))`. If the test ever requires custom string fiddling, the implementation drifted.

---

### Risk 11: `topics:` aggregation timing — Phase 5a writes digest before Phase 5 calls topic refresh, but Phase 4c writes commitments first [LOW]

**Problem**: Plan's Step 3 sequencing: "skill ordering is approve → write digest → topic refresh → index." But the existing slack-digest SKILL.md Phase 4c writes commitments / week.md / memory items BEFORE Phase 5a writes the digest file. If `arete topic refresh --slugs ...` is called *after* Phase 5a but the digest file's `topics:` was written in Phase 5a only, then the topic-refresh step has just-written content available (good). But if a future skill edit moves digest-write earlier or splits it (e.g., write skeleton in 4c, fill in 5a), the topic-refresh call could pick up an incomplete digest. The risk is process drift over the skill's lifetime, not a Day 1 bug.

**Mitigation**: Add a defensive ordering note in `slack-digest/SKILL.md` Phase 5: explicitly comment "Phase 5b/topic-refresh assumes the digest file at `resources/notes/{date}-slack-digest.md` is fully written with final `topics:` frontmatter. Do not split the digest write across phases without updating this contract." Cheap; one line.

**Verification**: Code review of any future slack-digest skill edits checks for digest-write-ordering preservation. No automated test (skill flow is markdown).

---

### Risk 12: `arete topic refresh --slugs <comma-sep>` semantics vs. existing positional `[slug]` [LOW]

**Problem**: Existing CLI: `arete topic refresh [slug]` (singular positional) with `--all`. Plan adds `--slugs <comma-list>` (plural flag). Three ways to specify slugs (positional, `--slugs`, `--all`) creates ambiguity. What does `arete topic refresh foo --slugs bar,baz` do? What if user passes `--slugs foo` (singular) — is that an error or coercion? Commander.js will accept all combinations silently and the implementation has to pick one.

**Mitigation**: Resolve in implementation: positional `[slug]` continues to mean "exactly one slug, equivalent to `--slugs <slug>`." `--slugs` is the multi-slug variant; passing both is an error with a clear message. `--all` overrides both. Document in `--help` text. Single-source the resolution into a tiny helper `resolveTargetSlugs(slug, slugsFlag, all): string[] | 'all'`.

**Verification**: Unit test for `resolveTargetSlugs`: covers positional-only, `--slugs`-only, both-set (error), `--all` overrides everything, neither set (error).

---

### Risk 13: `dev/work/plans/topic-wiki-memory-phase-c/plan.md` factual error about digest path is a known artifact [LOW]

**Problem**: Plan's Step 6 calls out fixing item 8 in phase-c: "probably `resources/slack-digests/*.md`" — wrong, should be `resources/notes/{date}-slack-digest.md`. This is correctly identified as a one-line doc fix. Risk is only that someone reads the phase-c plan during implementation, takes the wrong path as gospel, and writes to a directory the slack-digest skill never produces. Low because the slug-list filter on filename pattern (`^\d{4}-\d{2}-\d{2}-slack-digest\.md$`) would skip non-conforming files anyway.

**Mitigation**: Already in plan (Step 6 #5). Land the phase-c fix in the same commit/PR that lands this plan, not as a separate follow-up.

**Verification**: After implementation: `rg 'slack-digests' dev/work/plans/topic-wiki-memory-phase-c/plan.md` returns zero matches.

---

## Summary

Total risks: 13
Tier breakdown: 0 CRITICAL, 4 HIGH, 6 MEDIUM, 3 LOW
Categories covered: Context Gaps, Test Patterns, Integration, Reuse / Duplication, Code Quality, Documentation, State Tracking, Build Scripts (rename touchpoints), Platform Issues (lock semantics)

**Gate signal**: PROCEED

No CRITICAL risks. The build can proceed past the /ship gate. The 4 HIGH risks are all addressable mid-build (not blocking the start), but each needs a concrete decision before merge:

- Risk 1 (skill prompt regression): land a byte-equality grep test for the bias block.
- Risk 2 (parser duplication): empirically verify `parseMeetingFile` works on slack digests; if it does, drop `parseSlackDigestFile` from Step 2 entirely. **This is the highest-leverage simplification in this pre-mortem.**
- Risk 3 (lock collision): document the failure mode in slack-digest SKILL.md and ensure the skill tolerates `seed_lock_held` non-zero exit; consider adding `topics_integrated: false` digest-frontmatter recovery flag.
- Risk 4 (--source label-only UX): pick (a) — make `--source` actually scope to that file. ~20 LOC; correct semantics; eliminates the cost-surprise risk entirely. The plan's current "label-only" choice should be re-litigated.

**Plan inaccuracies found** (cite line/path):

1. `plan.md:166-167` — claims 6 call sites for `refreshAllFromMeetings`. Counting the service-method declaration (`packages/core/src/services/topic-memory.ts:779,790`) and the doc comment in `packages/cli/src/commands/meeting.ts:1391` that names the function inline, the actual touchpoint count is 8. Minor; bump for accuracy.
2. `plan.md:460` — claims "Concurrent topic refresh from meeting approve + slack-digest approve... lock... symmetric for meeting-side; slack-side inherits it for free." The lock is non-reentrant `O_CREAT|O_EXCL` (verified at `packages/core/src/services/seed-lock.ts:54`); concurrent runs fail-fast with `SeedLockHeldError`, they don't queue. Meeting-approve catches and degrades; slack-digest's markdown-skill caller currently has no equivalent catch. Not "free."
3. `plan.md:108-109` — the per-digest union defense relies on `integrateSource`'s prompt "filtering its own input." I read the prompt (`topic-memory.ts:667`); it instructs "update ONLY the sections the new source substantively changes" — which is about minimal mutation, not topic-relevance filtering of the input body. The plan's claim slightly over-states the prompt's behavior. The risk is real but moderate (Risk 8); the plan's defense is weaker than written.
