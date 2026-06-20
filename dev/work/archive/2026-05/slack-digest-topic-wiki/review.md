## Review: Slack-Digest → Topic-Wiki Integration

**Type**: Plan
**Audience**: Unclear (mixed — see Concern #1)
**Review Path**: Full
**Complexity**: Medium (6 steps, 5+ files across `packages/core/`, `packages/cli/`, `packages/runtime/skills/`, `packages/runtime/rules/`)
**Recommended Track**: standard

---

### Concerns

1. **Audience clarity**. The plan ships user-facing functionality (slack-digest is a primary daily skill for the builder-as-PM) but reads as builder-internal throughout — no "Why this matters to a PM running their day" framing, all framing is in terms of Karpathy loops, Hook 1/2 vocabulary, dark-code precedent. The plan does not state explicitly who the user-visible win is for or what they will see differently. Per `review-plan/SKILL.md` Step 5, ambiguous audience is itself a flag — and the slack-digest skill lives in `packages/runtime/`, which is the user-facing surface.
   - Suggestion: Add a one-paragraph "What changes for the user" subsection under the existing intro that names a concrete user moment ("when a PM closes a cover-whale-templates question on Slack, the topic page now reflects it"). Keep the engineering rationale in Steps 1-6.

2. **Parser duplication is unjustified — empirical check refutes the cheap-vs-generalized framing**. Verified: `parseMeetingFile` (`meeting-context.ts:163`) tolerates missing `attendees` (defaults to `[]`), reads `topics` directly via `Array.isArray(fm.topics)`, requires only the `^---\n...\n---\n` framing — and the actual `2026-04-28-slack-digest.md` in arete-reserv parses cleanly against this contract. The plan's Step 2 commits to a new `parseSlackDigestFile` (~30 LOC) on the basis that the meeting parser "is misnamed for slack digest input." That's a naming concern, not a behavior concern. Two parsers consuming the same frontmatter shape forks the schema if either side adds fields (e.g., the slack-evidence-dedup coordination point). This is the highest-leverage simplification in the plan.
   - Suggestion: Drop `parseSlackDigestFile`. Use `parseMeetingFile` for both source types; rename it to `parseSourceFile` if the lie is intolerable, but don't fork. Validate empirically by adding a unit test that parses `2026-04-28-slack-digest.md`'s real frontmatter and asserts `topics`, `date`, body extraction. Eliminates an entire sub-step from Step 2 and reduces drift surface to zero.

3. **Step 2's call-site count is off** (corroborates Pre-Mortem Risk 5, but with stronger numbers). Verified via `rg -n 'refreshAllFromMeetings' packages/`: **8 touchpoints**, not 6 — `topic.ts` (4), `meeting.ts:1421` (1), `intelligence.ts:511` (1), service definition `topic-memory.ts:779,790` (1 logical site, 2 lines), and one **previously-unflagged** call site at `packages/apps/backend/src/routes/meetings.ts:244`. The plan and the pre-mortem both miss the backend route. Plus the doc-comment at `meeting.ts:1391`. A grep gate before merge is essential or the rename will silently leave the backend's topic refresh referencing the old method name.
   - Suggestion: Bump to 8 in plan text. Explicitly enumerate `packages/apps/backend/src/routes/meetings.ts:244` as a call site. Add pre/post-rename grep gate to Step 2's acceptance: `rg 'refreshAllFromMeetings' packages/{cli,core,apps}/src` returns zero matches after rename.

4. **No backward-compat or deprecation alias for the rename — hard cutover across 8 sites**. The plan accepts this as "tractable" but `packages/apps/backend/` is a separate deployable surface (the backend agent route handler). If the rename lands in core but a backend deploy is staggered, the backend's import would resolve at build time — fine for monorepo but risky if anyone ever consumes `@arete/core` externally. Less important, but worth one sentence either way.
   - Suggestion: Either explicitly state "monorepo-only consumer; no deprecation alias" in Step 2 or add a 2-line `refreshAllFromMeetings = refreshAllFromSources` alias with `@deprecated` JSDoc, removable in a follow-up. Default to the explicit-no-alias path; just name the choice.

5. **Dark-code grep gate is named in Step 4 but missing test wiring**. Step 4's grep gate (`rg -n 'discoverTopicSources|parseSlackDigestFile|refreshAllFromSources' packages/{cli,core}/src`) is labeled "process, not code." Per the 2026-04-23 LEARNINGS entry ("Services tested ≠ services wired"), a grep that lives in a plan-mode review checklist will be skipped. The pattern that worked for topic-wiki-memory was wiring the calls at named CLI sites (`meeting approve` Hook 2). This plan adds two new exports (`discoverTopicSources`, `refreshAllFromSources`) and one CLI primitive (`arete topic list --active --slugs`). All three need named, non-test callers. The plan asserts but does not enumerate them.
   - Suggestion: Strengthen Step 4's acceptance: list the production call sites for each new export, e.g., "`discoverTopicSources` is called from inside `refreshAllFromSources` (1 site); `refreshAllFromSources` is called from 8 sites enumerated in Step 2; `arete topic list --active --slugs` is invoked by `slack-digest/SKILL.md` Phase 2a." If any cell is empty, the export is dark.

6. **Test expectations are bundled into Step 4 only — Steps 1, 2, 3, 6 modify code/skill markdown without per-step test ACs**. Per the AC rubric and `review-plan/SKILL.md` Test Coverage Requirements, each code-modifying task should have its own test expectation. Step 1 modifies SKILL.md (markdown — exempt) but also adds a CLI primitive (code — needs test). Step 2 modifies `topic-memory.ts`, adds `discoverTopicSources` and the parser path. Step 3 adds `--source` and `--slugs` flag handling. Step 6 is documentation-only (exempt). Bundling all tests in Step 4 means a partial PR could land Step 2 without its own regression coverage if execution is split.
   - Suggestion: Inline minimum test expectations per step. Step 1: "`arete topic list --active --slugs` byte-equals `renderActiveTopicsAsSlugList(getActiveTopics(...))`." Step 2: "`discoverTopicSources` returns both source types in date order against a fixture workspace." Step 3: "`arete topic refresh --slugs --source` invokes `refreshAllFromSources` with the right slug filter." Step 4 then becomes the integration-level test bundle, not the only test surface.

7. **AC anti-patterns**. Mechanical pass through ac-rubric.md against Steps 1-3 surfaces several vague terms (see AC Validation Issues table). Most are minor; one is structural ("preserved" in Step 2's "every test in `topic-memory.test.ts` still passes unchanged" is fine; "deterministically ordered by date" is good; "honored" in `--skip-topics honored` is the standard CLI cargo phrasing — flag but tolerate).

8. **Risk 4 (`--source` is label-only) is acknowledged but not resolved in the plan**. Pre-mortem Risk 4 is correct: making `--source` actually scope to one file is ~20 LOC and removes a real cost-surprise UX hazard. The plan defers this to "documentation explicitly so users don't assume `--source` scopes." The plan's idempotency claim (content-hash dedup) only protects re-runs, not first runs against a workspace with N pre-tagged digests. Decision deferred → cost surprise lands in production.
   - Suggestion: Re-litigate before Phase 2 PRD. Either (a) make `--source` scope `discoverTopicSources` to that file (cleaner; ~20 LOC), or (b) add a dry-run cost preview step before invoking `refreshAllFromSources` (matches LEARNINGS pattern from 2026-04-23 "LLM-spending commands need four things"). Don't ship label-only.

9. **Multi-IDE consistency: Step 6 modifies `packages/runtime/rules/cursor/agent-memory.mdc` but `packages/runtime/rules/claude/` is not enumerated**. Areté ships dual-IDE; topic-source provenance changes that affect the Cursor rule should have a Claude-side counterpart (or an explicit "Claude rules don't have this concept yet" note). Risk: silent IDE drift.
   - Suggestion: Step 6 enumerates Claude-side rule changes too (or explicitly states "Claude has no agent-memory.mdc equivalent because X").

10. **Catalog**: `dev/catalog/capabilities.json` is not touched by the plan. Verified — it has no slack-digest entry today, and the plan adds a new CLI primitive (`arete topic list --active --slugs`) and a new flag (`arete topic refresh --source`). Either both should appear in the catalog (consistent with the `arete topic` block already there) or the plan should explicitly state catalog updates are out of scope per project convention.
   - Suggestion: One line in Step 6 — either "update `dev/catalog/capabilities.json` for new `arete topic list --active --slugs` flag combo and `arete topic refresh --source` flag" or "catalog is not updated for flag-level additions per current convention."

11. **Pre-mortem Risk 1 (skill prompt regression detectability) deserves to be promoted into the plan, not orphaned in pre-mortem**. The byte-equality grep test for the bias block between meeting-extraction.ts and slack-digest SKILL.md is cheap (~30 LOC test) and directly targets the dark-code precedent. The pre-mortem proposes it as a mitigation; the plan should include it as a Step 4 acceptance criterion.
   - Suggestion: Step 4 acceptance gains "Test asserts the active-slug bias block in `slack-digest/SKILL.md` Phase 2c is byte-equal to the canonical block in `meeting-extraction.ts` (or a shared anchor in PATTERNS.md)."

---

### AC Validation Issues

| Step | AC | Issue | Suggested Fix |
|------|-----|-------|---------------|
| 1 | "mirroring the meeting-extraction prompt's wording" | Vague — "mirroring" is undefined | "Phase 2c bias block string-matches `buildMeetingExtractionPrompt`'s active-slug section, verified by byte-equality test" |
| 1 | "Idempotent: running the skill twice ... produces the same `topics:` set (subject to LLM determinism)" | Self-contradicting hedge — "subject to LLM determinism" makes this untestable | Drop the parenthetical or replace with "produces the same `topics:` set when LLM seed/temperature are pinned" |
| 2 | "deterministically ordered by date" | Good | (no change) |
| 2 | "Existing meeting-only behavior is preserved" | "Preserved" is fine in context (test-name reference) | (no change) |
| 3 | "the narrative reflects the digest content" | Subjective — what does "reflects" mean? | "the topic file's `## Current state` section gains a sentence containing one substring from the digest body" |
| 3 | "`--skip-topics` honored (mirrors `meeting approve`)" | "Honored" is anti-pattern but standard CLI phrasing | "When `--skip-topics` is passed, no LLM calls are made and `sources_integrated` is unchanged" |
| 4 | "Test fails meaningfully if Hook 2 wiring regresses" | Vague — "meaningfully" is undefined | Replace with explicit assertion: "Removing the `arete topic refresh` line from `slack-digest/SKILL.md` Phase 5 causes the integration test to fail with a clear error message" — but this is hard to test mechanically; consider dropping or rephrasing as a code-review note |
| 5 | "Out of scope section explicitly names backfill" | Good | (no change) |
| 5 | "README/SKILL.md notes the manual re-process path" | "Notes" is vague — which file, which section? | "`packages/runtime/skills/slack-digest/SKILL.md` gains a `## Topic Wiki Coverage` subsection naming `--days-back=N` as the backfill workaround" |
| 6 | "All five files updated in one commit; diff reviewed" | Diff-reviewed is process, not testable | Acceptable for documentation-only step |
| 6 | "Grep for 'meeting' in `topic-memory.ts` doc comments — anything describing the substrate as meetings-only gets rewritten" | Good — concrete grep | (no change) |

---

### Test Coverage Gaps

- **Step 1**: New CLI primitive `arete topic list --active --slugs` has no test expectation in Step 1. Step 4 covers it implicitly. Add: byte-equality test against `renderActiveTopicsAsSlugList(getActiveTopics(...))`.
- **Step 2**: `discoverTopicSources` tolerance behavior (missing `notes/` dir, malformed slack-digest frontmatter, mixed source order) is described in approach but not in acceptance criteria.
- **Step 3**: `--skip-topics` flag is in acceptance but no test asserting "no LLM call made when flag is set" (matches the 2026-04-23 LEARNINGS gotcha — env var `ARETE_NO_LLM=1` should also short-circuit; verify the gate boundary check is included).
- **Step 4**: The seed-lock collision path (Pre-Mortem Risk 3) has no test. A test holding the lock externally and asserting the slack-digest path's wrapper handles it gracefully would close that gap.

---

### Strengths

- Strong refusal of overgeneralization — explicitly rejects the `parseTopicSourceFile` abstraction, the source-agnostic engine, the `--skip-qmd` per-call pattern is preserved.
- Risks section is honest and well-scoped (per-thread vs per-digest trade-off, rename tension, sibling-plan coordination).
- Architectural call: routing through the existing `arete topic refresh` verb (Option 2) instead of inventing `arete slack-digest approve` is correct and reuses code.
- The parent build's dark-code learnings memo is cited and the grep gate is named (Step 4 #4) — even if it needs strengthening (Concern #5), the awareness is there.
- Sequencing notes vs Phase C items (item 2 background queue, item 5 AI-mock harness, item 6 backfill) are pragmatic — neither blocking nor over-coordinating.
- Acceptance of `hashMeetingSource` body-only invariant — the slack-evidence-dedup interaction (frontmatter changes don't bust the hash) is an existing strength of the architecture and the plan correctly inherits it.

---

### Devil's Advocate

**If this fails, it will be because** the per-digest topic-union design (Step 1's chosen aggregation strategy) leaks unrelated thread content into topic narratives at first contact, the user notices `cover-whale-templates.md` has a paragraph clearly imported from a thread about access provisioning, files an issue, and the plan team has to either (a) reverse out and ship per-thread source segmentation (which the plan defers to a future iteration as "breaking the file-as-source content-hash invariant"), or (b) tune the integration prompt to filter input by topic relevance. Both are real work; (a) is meaningful refactor. The plan's defense rests on `integrateSource`'s prompt "filtering its own input" — but Risk 8 of the pre-mortem and a direct read of the prompt text show that's a minimal-mutation instruction, not a relevance-filter instruction. **The bet is plausible but unverified, and the failure mode is user-visible content quality, not a test fail.**

**The worst outcome would be** a slack-digest run that silently corrupts a topic page — the dark-code precedent from 2026-04-23 was bad, but recoverable (export tested, just not called). Here the new failure mode is *integrated*: the LLM produces a plausible-looking topic-page edit that's actually wrong (e.g., promotes a speculative thread comment to a "Current state" sentence). Without a per-thread relevance filter on the LLM input *and* without a noise-budget trip in the integration prompt, content quality regression is undetected by tests, undetected by typecheck, and only catchable by a human reading their own topic narratives — which they may stop doing if the narratives become unreliable. The plan's "if too noisy, defer to next iteration" stance accepts this as a near-term cost.

---

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended; **no structural blockers**
- [ ] **Approve pending pre-mortem** — Pre-mortem complete, gate signal PROCEED
- [ ] **Revise** — Address concerns before proceeding

The pre-mortem already cleared (0 CRITICAL, gate signal PROCEED). This review confirms no structural blockers for the /ship Phase 1.3 gate. The 11 concerns above are addressable in the Phase 2 PRD-generation step or during execution — none of them block the move from plan-approved to PRD-drafting.

**The single highest-leverage change before Phase 2**: drop `parseSlackDigestFile` from Step 2 per Concern #2. Empirically verified — it's redundant. This eliminates ~30 LOC, removes a schema-fork risk surface, and tightens Step 2 to a true single-concern (rename + discovery widening). The pre-mortem flagged this as Risk 2 (HIGH) and the verification I ran (parsing `2026-04-28-slack-digest.md` against the existing `parseMeetingFile` contract) confirms the parser already handles slack-digest frontmatter shape correctly.

---

### Suggested Changes (Mode B — Structured Suggestions)

**Change 1**: [Audience] Add 1-paragraph "What changes for the user"
- **What's wrong**: Plan reads as builder-internal despite shipping user-facing slack-digest functionality
- **What to do**: Add a paragraph between the intro and Context section naming a concrete user moment
- **Where to fix**: `plan.md` after line 39 (between intro and `## Context`)

**Change 2**: [Architecture] Drop `parseSlackDigestFile`
- **What's wrong**: Step 2 forks the meeting parser into a slack-digest variant despite the existing parser already handling the shape correctly
- **What to do**: Use `parseMeetingFile` for both source types. Optionally rename to `parseSourceFile` if the meeting-named function on slack-digest content is intolerable
- **Where to fix**: `plan.md` Step 2 "Parser" subsection (lines ~193-206) — replace with a one-paragraph reuse statement; add unit-test acceptance "parses `2026-04-28-slack-digest.md` real fixture cleanly"

**Change 3**: [Touchpoints] Bump rename count to 8 and enumerate backend
- **What's wrong**: Plan undercount (6) misses backend route (`packages/apps/backend/src/routes/meetings.ts:244`) and doc comment
- **What to do**: Update Step 2's rename table; add explicit pre/post grep gate
- **Where to fix**: `plan.md` Step 2 rename table (line ~157) — change "Touches 6 call sites" to 8; enumerate the backend site

**Change 4**: [Cost] Re-litigate `--source` scope semantics
- **What's wrong**: Label-only `--source` produces cost-surprise on first runs against pre-tagged digest workspaces
- **What to do**: Either (a) scope `discoverTopicSources` filter to `entry.path === sourcePath`, or (b) add dry-run cost preview before invoking
- **Where to fix**: `plan.md` Step 3 acceptance + Risks section line ~432

**Change 5**: [Test wiring] Per-step test expectations
- **What's wrong**: Step 4 bundles all tests; Steps 1-3 (code-modifying) have no per-step test ACs
- **What to do**: Add minimum test expectation to each code-modifying step's acceptance
- **Where to fix**: `plan.md` Steps 1, 2, 3 acceptance subsections

**Change 6**: [Dark code] Strengthen Step 4 grep gate to enumerate call sites
- **What's wrong**: Grep gate names symbols but not expected call sites — risk that gate passes on tests-only callers
- **What to do**: Step 4 acceptance lists production call sites per new export
- **Where to fix**: `plan.md` Step 4 #4 (line ~334)

**Change 7**: [Multi-IDE] Enumerate Claude-side rule parity
- **What's wrong**: Step 6 modifies Cursor `agent-memory.mdc` without naming Claude counterpart
- **What to do**: Step 6 either includes Claude-side rule update or names the parity gap explicitly
- **Where to fix**: `plan.md` Step 6 #4 (line ~393)

**Change 8**: [Catalog] Decide on capabilities.json updates
- **What's wrong**: New CLI primitive + flag don't appear in catalog plan
- **What to do**: Either include catalog update in Step 6 or explicitly state out-of-scope
- **Where to fix**: `plan.md` Step 6

**Change 9**: [Bias-block regression] Promote pre-mortem Risk 1 mitigation into plan acceptance
- **What's wrong**: Skill prompt regression has no test signal; pre-mortem proposes byte-equality test as mitigation but plan doesn't include it
- **What to do**: Step 4 acceptance gains byte-equality test for the active-slug bias block between meeting-extraction.ts and slack-digest SKILL.md
- **Where to fix**: `plan.md` Step 4 acceptance (line ~339-345)

**Change 10**: [Backward compat] Name the rename cutover decision
- **What's wrong**: Hard cutover across 8 sites in one commit with no deprecation alias is implicit
- **What to do**: Add one sentence stating "monorepo-only consumer; no deprecation alias needed" or add a 2-line `@deprecated` alias
- **Where to fix**: `plan.md` Step 2 rename approach section
