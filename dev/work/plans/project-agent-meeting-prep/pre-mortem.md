# Pre-Mortem: Project-Agent Meeting-Agenda Prep — grounded fan-out

> Method: Areté `run-pre-mortem`. Adversarial framing — assume the build WILL hit trouble; find where.
> Grounded against the real codebase 2026-06-22 (paths below are absolute).
> Plan under analysis: `/Users/john/code/arete.worktrees/project-agent-meeting-prep/dev/work/plans/project-agent-meeting-prep/plan.md`

## How to read this

Each risk cites the file/mechanism, rates severity (CRITICAL / HIGH / MEDIUM / LOW), and gives a concrete mitigation tied to a workstream. The plan's central novelty — a product skill that spawns LLM subagents, passes them a profile, and merges structured bundles back — is the source of most of the high-severity risk, so I lead with it. The gate verdict is at the bottom.

---

## Category: Platform Issues — the spawn-subagent mechanism (THE load-bearing assumption)

### Risk: "Skill prose instructs the host to spawn subagents" is a behavioral hope, not a guaranteed mechanism — CRITICAL

**Problem**: The entire architecture rests on the prime agent (the user's Claude Code session, executing markdown prose) reliably (a) spawning N `Agent`/`Task` subagents, (b) passing each one the contents of `profiles/project-agent.md` as its prompt plus per-meeting context, and (c) collecting a *structured* bundle back from each. The plan's "Verified findings" states "The harness `Agent`/`Task` tool ... all exist at the host level" and treats this as settled. It is half-true and dangerously under-specified:

- The `Agent`/`Task` tool genuinely exists in Claude Code, and a general-purpose subagent does inherit cwd, can run `arete project open`, and can call MCP tools. That part is real.
- But a Areté product skill is **prose interpreted by a model**, not code. Nothing *enforces* that the prime spawns a subagent rather than just doing the work inline itself (the cheaper, more natural path for an LLM). Today **zero product skills spawn LLM subagents** — verified: `grep -rln "Task tool\|spawn.*subagent\|general-purpose" packages/runtime/skills/` returns only `_authoring-guide.md` and `general-project/SKILL.md` (as references, not live spawn flows), and `process-meetings` parallelizes via shell `&` on CLI calls (`process-meetings/SKILL.md:97`), NOT via LLM subagents. The plan's own findings concede this ("No product skill spawns Claude subagents today"). So there is no in-repo precedent proving the prose-driven spawn pattern works end-to-end, and no test can assert it (it's runtime model behavior).
- The bundle "contract" (`plan.md` § Grounded-bundle contract) is a typed-looking schema (`decisions[]`, `tickets[]{key,title,status,owner,verifiedAt}`, `provenance`) but it will be returned as **free-form text in a subagent's final message**, not a validated object. The prime has to parse prose back into structure with no schema enforcement. This is exactly the failure shape the plan itself warns about ("silent-miss ... echoes WS-1 CR-3 dark code").

**Severity**: CRITICAL. If the prime quietly skips the spawn (does it inline), or the bundle returns in a shape the prime can't reliably merge, the build ships and *looks* like it works on the happy path while delivering none of the context-isolation / lean-prime / anti-degradation benefits that are the whole justification. It would regress silently.

**Mitigation**:
1. **Before building WS-B/WS-C, run a throwaway spike** in a real Claude Code session: a minimal skill that spawns ONE project-agent subagent, passes the profile, and returns a bundle. Confirm the host actually spawns (vs. inlines) and that the bundle round-trips. Treat this as a gate on the whole plan — if the host won't reliably spawn from prose, the architecture must change (e.g. ship a `.claude/agents/project-agent.md` agentType after all, which the plan explicitly rejected in Decision 2).
2. **Make the bundle contract a literal output template** the subagent must emit (a fenced block with named fields), and have the prime's prose include an explicit "if a bundle is missing any field, treat it as a grounding FAILURE and surface it — never synthesize around a missing bundle." Mirror the WS-1 CR-3 lesson.
3. **Add an observable trace**: the skill should instruct each subagent to write its bundle to a deterministic path (e.g. `.arete/cache/plan-context/<slug>.json`, which WS-E builds anyway) so the prime reads structured JSON from disk rather than parsing chat prose, AND so a human can verify the fan-out actually happened. This converts the un-testable "did it spawn" into a checkable artifact.

### Risk: Atlassian MCP unavailable / unauthenticated inside a subagent or headless run — HIGH

**Problem**: Grounding is "always-on" for agenda-prep spawns and the ticket-verify step (`tickets[].verifiedAt`, the part that fixes errors 2/3) depends entirely on the Atlassian MCP. The deferred-tools list in this very environment shows `mcp__claude_ai_Atlassian_Rovo__authenticate` / `complete_authentication` — i.e. the MCP can be in an *unauthenticated* state requiring an interactive auth handshake. A spawned subagent in a batch/overnight context (the plan's primary hot path is `/daily-plan` → batch) may have no way to complete OAuth. The memory note `feedback_overnight_ship` already records that overnight automated runs have environment gaps. If the MCP is down, rate-limited, or unauthenticated, the subagent either (a) hangs on auth, (b) fabricates ticket facts to fill the schema, or (c) returns empty ticket data that the prime then renders as "no Jira issues" — re-introducing exactly the wrong-Jira-fact error this plan exists to kill.

**Severity**: HIGH. The single feature that justified Opus and the whole grounding disposition is the most fragile dependency.

**Mitigation**:
1. The profile (`profiles/project-agent.md`, WS-A) must specify a **degraded mode**: if the Atlassian MCP errors/times-out/needs-auth, the bundle marks every affected ticket `provenance: unverified` and the prime renders it as an explicit caveat ("PLAT-11323 — title unverified, MCP unavailable") rather than asserting or omitting. Never let an MCP failure silently downgrade to a confident-but-stale assertion.
2. Set a hard per-ticket timeout in the profile guidance and a max-tickets bound to bound rate-limit exposure.
3. Pre-flight: the prime checks MCP availability once before fan-out; if unavailable in a batch context, it should warn and offer to proceed unverified rather than spawning N subagents that each independently fail the auth dance.

### Risk: Authoring-guide norm explicitly forbids the pattern — HIGH (governance/integration)

**Problem**: `_authoring-guide.md:359` states verbatim: "Expert agent patterns run in the same conversation — the agent does not spawn a new agent or call a subagent." The new pattern directly contradicts the documented, shipped norm. WS-D is supposed to "bless" subagent-fan-out, but if WS-D lands incompletely (or after WS-C ships), the skill ecosystem has a sanctioned-in-one-place / forbidden-in-another contradiction, and future skill authors (and future-you) will hit conflicting guidance.

**Severity**: HIGH — not a runtime crash, but a real integration/documentation defect that will cause drift.

**Mitigation**: Make WS-D's authoring-guide edit a **hard dependency of WS-C** (do not merge the skill orchestration without the guide amendment in the same change). The amendment must explicitly carve subagent-fan-out as a distinct sanctioned pattern, state when-to-spawn vs when-to-inline, and update the line 359 note so it scopes itself to *expert patterns* and points to the new section. Verify: grep the guide post-change for both the old norm and the new pattern co-existing coherently.

---

## Category: Integration — does the fan-out break the no-LLM brief invariant?

### Risk: Confusion between "brief verb is LLM-free" and "skill orchestration uses LLM" — MEDIUM

**Problem**: `packages/core/test/services/brief-no-llm.test.ts` enforces (AC7) that `assembleBriefFor*` and `brief-assemblers.ts` contain NO LLM symbols (`AIService`, `aiService.`, `callLLM`, `services/ai` import) — both a source grep guard and a runtime invariant. The plan's grounding subagents ARE LLM calls. The good news: the fan-out lives in the **skill prose layer** (`prepare-meeting-agenda/SKILL.md`) and the **subagent**, NOT inside `brief-assemblers.ts` or the `agenda scaffold` verb. So as long as the build keeps grounding strictly in the skill/subagent layer, this test does NOT break. The risk is a builder, trying to make grounding "deterministic and reproducible" (a stated plan goal), reaches into `brief-assemblers.ts` or `agenda-scaffold.ts` to add an LLM hook or an AIService import — which would trip the grep guard immediately.

**Severity**: MEDIUM. The invariant is well-guarded by an existing test, so a violation fails loudly at CI, not silently. But it's a foreseeable wrong-turn given the plan's own "keep retrieval deterministic" language.

**Mitigation**: WS-C task prompt must state explicitly: "Grounding LLM work lives ONLY in the skill prose + spawned subagent. Do NOT add any AIService/LLM call to `brief-assemblers.ts` or `agenda-scaffold.ts` — `brief-no-llm.test.ts` will fail. The scaffold remains a pure deterministic input." Verification: `npm test` for `brief-no-llm.test.ts` stays green; grep the diff for changes under `packages/core/src/services/brief-assemblers.ts` and `agenda-scaffold.ts` and reject LLM additions.

### Risk: The plan's "determinism preserved" claim is overstated — MEDIUM

**Problem**: The plan asserts "two runs → same facts; grounding reasoning is the only LLM-variable layer." This is only true for the deterministic `arete project open` payload. But the **bundle the prime actually consumes is the subagent's LLM output**, which includes which decisions it flagged superseded, which tickets it chose to verify, and how it summarized — all non-deterministic. So the *agenda* (the user-facing artifact) is NOT reproducible run-to-run. The deterministic claim is true of a layer the user never sees and false of the layer they do. This matters because the `feedback_cli_review_surface` and `feedback_verify_reviews_against_data` memory notes show John approves artifacts and expects to trust them; a subtly different agenda each run undermines that.

**Severity**: MEDIUM.

**Mitigation**: Reframe the plan's claim in WS-A docs to be honest: "the FACTS are deterministic; the SYNTHESIS is not." Lean on the WS-E disk cache (slug-keyed, mtime-invalidated) so the same batch run reuses one bundle rather than re-grounding — this gives practical run-to-run stability within a day even though it isn't true determinism.

---

## Category: Scope Creep / Code Quality — supersession detection

### Risk: LLM supersession detection produces false positives and false negatives — HIGH

**Problem**: Supersession detection ("flag a stale decision reversed by a later one") is the subtlest reasoning task in the plan and the explicit motivating example (the reversed "infer recipient from claim-party-table lookup" decision). The memory note `project_supersession_gap` already flags this as a hard, unsolved problem ("user curates ... NOT a state machine; risk = dedup hiding arc by collapse-to-oldest"). An Opus subagent reasoning over a project README's Decisions section can: (a) **false-positive** — flag a still-current decision as superseded because two bullets sound contradictory (e.g. scoping notes vs final decision), causing the agenda to drop a valid decision; (b) **false-negative** — miss a real reversal because the two decisions are phrased differently or live in different docs. The plan accepts "flag-not-resolve is acceptable v1," which bounds the damage but does not bound the false-positive rate. A confidently-wrong supersession flag is *worse* than WS-1's original silence, because it actively misdirects.

**Severity**: HIGH. This is the exact capability the effort exists to add, and it is the least reliable.

**Mitigation**:
1. The profile must instruct: **flag with the quoted evidence** (both the earlier and later decision text + dates), never a bare "superseded" verdict. The prime renders the conflict as "possible supersession — verify" with both sides shown, so a wrong flag is visible and cheap to dismiss rather than silently acted on. This matches `feedback_verify_reviews_against_data` (reviews can be confidently wrong; show the evidence).
2. Bias toward **recall over precision with human-in-the-loop**: flag suspected conflicts for John to resolve (consistent with `project_supersession_gap`'s "user resolves" stance), do NOT auto-suppress the older decision.
3. Defer any auto-resolution to WS-E as the plan already scopes — keep v1 strictly flag-with-evidence.

### Risk: F3 anti-degradation relaxation — isolation does NOT guarantee quality — HIGH

**Problem**: `prepare-meeting-agenda/SKILL.md:98-106` (the F3 rule) is LOAD-BEARING and was added because batching N agendas degrades the expensive qualitative synthesis to skeletons. The plan's claim: per-project/per-meeting subagent isolation makes degradation "structurally impossible," so F3 can relax to a self-check. This is **only partly correct**:
- The GROUNDING subagents are per-project and isolated — fine, they won't degrade each other.
- But the plan (§ Carve-outs) keeps **synthesis in the PRIME** for small batches (~3): "Prime synthesizes all agendas for small batches." So the prime, in ONE context, still synthesizes 3 agendas sequentially — which is *exactly* the F3 failure condition (one context, N expensive qualitative outputs). Isolation was applied to the cheap deterministic load+ground step, NOT to the expensive synthesis step the F3 rule actually governs. The plan relaxes the rule for the wrong layer.
- The F3 rule also guards the AC1 self-check (`SKILL.md:120-132`), which is the real quality gate. Relaxing it risks weakening the one mechanism that catches skeleton output.

**Severity**: HIGH. Relaxing F3 while leaving synthesis in a shared prime context could directly regress the quality this whole skill exists to protect — and it would look like a "cleanup" win.

**Mitigation**:
1. **Do NOT relax F3 for the synthesis step.** Keep the per-agenda, start-to-finish, AC1-self-check-each rule fully in force for prime synthesis. Only annotate that the *grounding* step is now isolated. The plan's WS-C says "relax to a self-check ... keep AC1 gate" — make this concrete: the AC1 gate (SKILL.md:120-132) stays verbatim and non-skippable in batch.
2. If batch synthesis ever degrades in soak, the fix is to fan out **synthesis** subagents (the plan defers this — "do not build until needed"). Pre-commit to that as the escalation rather than weakening AC1.
3. Verification: keep a soak test that prepares a 3-meeting batch and asserts each agenda passes AC1 checks (themed sections, dated callback, commitment IDs). This is the `feedback_poc_vs_fair_test` lesson — eval the production batch path, not a single-agenda PoC.

---

## Category: Context Gaps — the bundle merge (silent-miss / dark-code echo)

### Risk: Bundles never reach the synthesized agenda (WS-1 CR-3 redux) — CRITICAL

**Problem**: The plan itself names this risk: "silent-miss risk if bundles never reach the synthesis output (echoes WS-1 CR-3 'dark code' failure)." This is concrete and grounded: WS-1's CR-3 was literally about a project-doc candidate that was extracted but never routed into `sections[].candidates[]` (see `agenda-scaffold.ts:226-298` — the `projectDocCandidates` extractor + the routing at lines 430-537 that CR-3 had to make explicit). The new pipeline adds an even longer, prose-mediated chain: prime resolves projects → spawns subagent → subagent grounds → returns bundle → prime parses bundle → prime merges bundle into per-meeting synthesis → output. Every arrow is a place a bundle can be dropped, and unlike the deterministic scaffold routing (which a unit test can assert), the merge happens in prime LLM prose with no enforcement. A prime that grounds 3 projects and then writes agendas using only the deterministic scaffold (ignoring the bundles) would produce *plausible* agendas with the original errors — undetectably.

**Severity**: CRITICAL. This is the WS-1 CR-3 failure replayed in a layer that has NO test coverage, on the exact artifacts (Jira facts, superseded decisions) the plan exists to fix.

**Mitigation**:
1. **Make bundle-consumption observable and checkable.** Have each agenda's synthesis cite the bundle it used (e.g. a `_grounded against: <slug> (verifiedAt ...)_` provenance footer, stripped only at final save, or kept). If an agenda touches a project but carries no grounded-fact provenance, that is a detectable miss.
2. **Add an explicit AC to the skill self-check (step 5a)**: "For every project resolved for this meeting, at least one grounded fact (a verified ticket, a flagged/confirmed decision, or an explicit 'no Jira refs / no decision conflicts found' line) appears in the agenda. A resolved project with zero grounded output is a FAILURE — go back."
3. Route bundles through disk (WS-E cache) so the prime reads structured JSON and the presence/absence of each `<slug>.json` is verifiable, rather than relying on chat-history bundles surviving.
4. Carry the WS-1 CR-3 lesson forward explicitly in the WS-C task prompt: "Producing the bundle is not enough — it must demonstrably reach the output. Name the deliverable; do not let it be dark code."

### Risk: Meeting→project resolution is narrower than the plan implies — MEDIUM

**Problem**: The plan's step 1 ("Resolve which projects each meeting touches ... deterministic, no LLM") leans on the existing `resolvedProjects` mechanism in `brief-assemblers.ts:2707` (area inference + `--project` override). Verified reality: this resolves via **area inference** (`inferredArea`, with a confidence score) and the `--project` pin, and the project-doc selection is **capped at ≤2 projects** (`brief-assemblers.ts:2731-2759`, "here ≤2 projects"). So "which projects each meeting touches" is (a) confidence-gated area inference that can mis-resolve or resolve to none, and (b) bounded at 2. A meeting that genuinely touches 3 projects, or one whose area infers wrong, will silently ground the wrong set — and the fan-out faithfully grounds whatever it's handed. "Deterministic" here means "repeatable," not "correct."

**Severity**: MEDIUM. Bounded by existing behavior (the scaffold already has this limit), but the plan presents resolution as a solved trivial step when it carries its own accuracy risk.

**Mitigation**: WS-C must reuse the existing `resolvedProjects` path verbatim (don't reimplement resolution — see Reuse risk below) and surface low-confidence area inference to the prime so a mis-resolution is visible. Document the ≤2-project cap as a known bound; if a meeting needs more, the `--project` pin is the escape hatch (already documented at `brief-assemblers.ts:2967`).

---

## Category: Reuse / Duplication

### Risk: Subagent or prime reimplements project resolution / brief assembly instead of reusing CLI — MEDIUM

**Problem**: The grounding subagent is told to run `arete project open <slug>` for deterministic facts. But an LLM subagent handed a profile and a project slug may "helpfully" Read README files directly or re-derive area/commitment data, bypassing the deterministic CLI — the exact anti-pattern `prepare-meeting-agenda/SKILL.md:88` already warns against ("Do NOT shortcut by reading person files directly with the Read tool — that path produces the regressed thin-template output"). Likewise the prime could reimplement meeting→project resolution instead of using the existing `resolvedProjects`/scaffold path.

**Severity**: MEDIUM.

**Mitigation**: The profile (WS-A) must state, in the same imperative tone as SKILL.md:88: "Facts come ONLY from `arete project open` (deterministic data path). Do NOT freestyle with manual Read of README/working files for facts — that reintroduces the regressed path. Your judgment applies on TOP of the CLI payload (grounding tickets live, flagging supersession), never inside retrieval." Mirror the `/project` skill's existing "No LLM in the data path" boundary (`project/SKILL.md:61`).

---

## Category: State Tracking / Build Scripts

### Risk: WS-E cache invalidation correctness — MEDIUM

**Problem**: WS-E caches the grounded bundle at `.arete/cache/plan-context/<slug>.json`, "slug-keyed, max-mtime invalidated." But a bundle's freshness depends on BOTH the project files' mtime AND the live Jira state (`verifiedAt`). Jira tickets change without touching any local file — so an mtime-only invalidation will serve a stale `tickets[]` (wrong status/owner) from cache, silently re-introducing the wrong-Jira-fact error the plan exists to fix, now masked by a "fresh" cache.

**Severity**: MEDIUM.

**Mitigation**: Cache entries must carry `verifiedAt` and a TTL for the live-grounded portion (e.g. Jira facts expire after N hours regardless of file mtime). Invalidate on `max(file-mtime) OR verifiedAt-older-than-TTL`. Document this in WS-E; don't copy the pure-mtime scheme from the WS-5 design unchanged.

### Risk: Profile artifact lives in `profiles/` but is consumed as a subagent prompt — LOW

**Problem**: `profiles/project-agent.md` must match the existing pattern (`pm-orchestrator.md` etc.: frontmatter `name`/`description` + "How You Think" body). Those existing profiles are dispositions for inline adoption; none is currently passed as a subagent prompt. The build must confirm the profile body, when handed verbatim to a general-purpose `Agent` as its prompt, actually reads as actionable instructions (it includes frontmatter the subagent doesn't need, and "How You Think" voice prose may not drive concrete tool calls).

**Severity**: LOW — caught by the WS-B spike, easy to fix.

**Mitigation**: In WS-B, when passing the profile to a subagent, strip frontmatter and prepend the concrete task (slug, relevance query, live-grounding ON, bundle output template). Verify in the spike that the subagent produces a well-formed bundle from the profile prose.

---

## Category: Documentation

### Risk: `/project` upgraded to write/ground-live but README still says READ-ONLY — MEDIUM

**Problem**: `project/SKILL.md` is emphatic and repeated: "This flow is READ-ONLY ... Opening a project NEVER writes ... No LLM in the data path" (lines 29, 61, 79-82). WS-D "UPGRADES `/project` to ground live during work." Live-grounding calls the Atlassian MCP — a network side-effect — and adds an LLM reasoning layer the skill currently forbids in the data path. If WS-D edits the adopt flow but leaves the READ-ONLY / no-LLM-in-data-path boundary prose intact, the skill becomes self-contradictory, and a user (or future-you) relying on "open is fast and read-only" gets a slow, MCP-hitting, LLM-reasoning open.

**Severity**: MEDIUM.

**Mitigation**: WS-D must rewrite the `/project` boundary prose precisely: bare `open` stays fast + read-only + no-live-grounding; live-grounding is **on-when-working** (an explicit mode the user enters), and even then it's read-only w.r.t. the workspace (MCP reads, no writes). Make the "fast bare open" guarantee survive verbatim. Verify the edited SKILL.md has no leftover "open NEVER ... LLM" line that now contradicts the new mode.

---

## Gate verdict

**Risk counts:**
- CRITICAL: 2 — (1) the spawn-subagent mechanism is a behavioral hope with zero in-repo precedent and an unenforceable bundle contract; (2) bundle-merge silent-miss (WS-1 CR-3 redux) in an untested prose layer.
- HIGH: 4 — Atlassian MCP availability/auth in headless subagents; authoring-guide norm contradiction (governance); LLM supersession false-positives/negatives; F3 relaxation applied to the wrong layer (synthesis stays in the shared prime).
- MEDIUM: 6 — no-LLM-invariant wrong-turn; overstated determinism claim; meeting→project resolution narrower/confidence-gated + ≤2 cap; reuse/freestyle-Read anti-pattern; WS-E mtime-only invalidation serves stale Jira; `/project` read-only doc contradiction.
- LOW: 1 — profile-as-prompt shape.

**Single most dangerous risk**: The spawn mechanism + bundle merge pair (the two CRITICALs are one compound failure). A product skill made of prose has no enforcement that the prime actually spawns subagents OR that the returned bundles reach the synthesized agenda. The likely failure is silent: the prime does the work inline (or grounds but ignores the bundles), ships plausible-looking agendas, and re-commits the exact wrong-Jira-fact and superseded-decision errors this entire effort exists to eliminate — with no test able to catch it. This is the WS-1 CR-3 "dark code" failure replayed in a layer with zero test coverage.

**Verdict: PAUSE before full build.** The CRITICAL risks should gate. Specifically: do NOT build WS-B/WS-C/WS-D until a throwaway spike (Mitigation under the first CRITICAL) proves, in a real Claude Code session, that (1) the prime reliably spawns a project-agent subagent from skill prose, (2) the bundle round-trips in a parseable/structured form (strongly: via a disk artifact, not chat prose), and (3) the prime demonstrably merges the bundle into the agenda with a checkable provenance marker. If the spike fails, the architecture must change (revisit Decision 2's rejection of a `.claude/agents/` agentType, or fall back to the inline live-Jira-verify the plan already keeps available). If the spike passes, the HIGH risks are all mitigable in-flight and the build may proceed — with the non-negotiable conditions that F3/AC1 stays fully in force for prime synthesis, supersession is flag-with-evidence only, and MCP failure degrades to an explicit "unverified" caveat rather than a silent stale assertion.
