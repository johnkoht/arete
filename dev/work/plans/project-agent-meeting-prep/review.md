# Cross-Model Plan Review — project-agent-meeting-prep

**Type**: Plan
**Audience**: Builder (Areté internals: `packages/runtime/profiles/`, `packages/runtime/skills/`, `_authoring-guide.md`) — clear.
**Review Path**: Full
**Complexity**: Large (5 workstreams, net-new architectural pattern — first product skill to spawn LLM subagents, a new profile, a unification refactor of `/project`, plus a cache layer).
**Recommended Track**: full (or at minimum `standard` with a pre-mortem — `has_pre_mortem: false` today; for a Large plan that introduces a sanctioned-but-unprecedented pattern, that gap is itself a finding).
**Reviewer**: independent second opinion, grounded against the real codebase at HEAD (2026-06-22).

---

## What I verified against the codebase (load-bearing claims)

I checked the plan's "Verified findings" and its central Insight against the actual code rather than taking them on faith. Most infra claims hold. One claim that the whole design rests on does NOT hold as stated, and it changes the shape of the fix.

**HOLDS — WS-1 is live and wired.** `selectProjectDocs` exists and is called from the project/meeting brief path; `agenda-scaffold.ts:226` carries the `PROJECT_DOC_HEADING_RE` extractor with `source:'project-doc'` and folds the doc excerpt into `sections[].candidates[]`. So a selected project-doc excerpt does reach agendas. Correct.

**HOLDS — no new code primitive is required for spawn.** The harness `Agent`/`Task` tool, the `arete` CLI, and the Atlassian MCP all exist at the host level; a spawned agent inherits cwd and can run `arete project open` and call the MCP. Correct.

**HOLDS — this is a net-new skill pattern.** No product skill spawns Claude subagents today (`process-meetings` fans out via `&`-parallel CLI calls, not LLM subagents), and `_authoring-guide.md` explicitly states expert patterns "run in the same conversation — the agent does not spawn a new agent or call a subagent." So WS-D's authoring-guide blessing is genuinely required, not ceremonial. Correct, and good that the plan flags it.

**HOLDS — `profiles/` is the right shippable surface.** `packages/runtime/profiles/` ships `pm-orchestrator.md`, `pm-advisor.md`, `plan-reviewer.md` as `name`/`description` + "How You Think" bodies. A new `profiles/project-agent.md` fits that pattern exactly, and the rationale for a profile over a `.claude/agents/` agentType (host-agnostic, inside the install surface) is sound.

**DOES NOT HOLD AS STATED — the Insight's "full-body context" claim.** The plan's worked example says `/project status-letter-automation` was reliable because "it had the README **Decisions** body". It did NOT get that from `arete project open`. I read `assembleBriefForProject` (`brief-assemblers.ts:1383`) and the `open` command (`project.ts:568-700`). `open` surfaces: a **Background** excerpt + a **Status Updates** excerpt (`brief-assemblers.ts:1427-1435`), a **capped** `Project document` selected-doc excerpt (1456-1481), **area-tagged memory items** from `.arete/memory/items/decisions.md`/`learnings.md` (1535-1558 — NOT the README's own `## Decisions` section), recent area meetings, wiki, siblings, and a whatsNew delta. The README's full `## Decisions` body is never emitted by `open`. So when `/project` "had the Decisions body," the agent got it by reading `projects/active/<slug>/README.md` directly — which `/project`'s own skill prose forbids as the data path ("do not freestyle with manual file reads"). This matters three ways below.

**DOES NOT HOLD — "keep retrieval deterministic; the agent reasons on top" for decisions.** The plan asserts the subagent "USES `arete project open` for its facts" and only adds a reasoning layer. But `open` does not return the canonical decisions body or any Jira facts. The subagent's two highest-value outputs (decisions reconciliation, live Jira verification) come from sources `open` does NOT provide: the raw README body (read directly) and the Atlassian MCP. So the "deterministic facts, LLM reasons on top" framing oversells reproducibility — the inputs that fix errors 1/2/3 are themselves agent-fetched, not CLI-emitted. Two runs will NOT produce "the same facts" for the Jira layer (live MCP) or for whichever README slice the agent chooses to read.

**HOLDS — no Jira in core/CLI.** `grep` for atlassian/jira-fetch/JiraClient across `packages/core/src` and `packages/cli/src` returns nothing. Live Jira grounding is purely MCP-at-agent-layer. Correct — and it underlines that the Jira-verify behavior is 100% a disposition/behavioral concern, exactly as the plan argues for error 2/3. This is the one place the "disposition, not context" thesis is unambiguously right.

---

## Scope / architecture pressure-test

**Is fan-out-one-subagent-per-project actually better than prime-loads-inline for ~3 meetings?** This is the plan's biggest unforced risk. The plan's stated justifications for spawning are (a) lean prime context, (b) grounding-dedup, (c) parallelism. At the stated scale — once/day, ~3 meetings, "a small number of unique projects" — none of the three clearly pays:
- (a) Lean prime: a compact bundle is ~1-2k; a full project README body via direct read is realistically 2-6k. For ~3 unique projects that is ~6-18k of prime context. That is not a context-pressure problem on Opus; the prime already holds the scaffold, templates, and calendar. The "prime never holds N full bodies" benefit is real only when N is large, and the plan elsewhere says N is small.
- (b) Grounding-dedup: real, but achievable inline just as easily — ground each unique project once in a loop, cache the bundle in a local variable, reuse across meetings. Dedup does not require process isolation; it requires keying by project, which you can do in either topology.
- (c) Parallelism: the only thing isolation genuinely buys is wall-clock, and the plan explicitly says cost/timeline are NOT a constraint. So the one benefit that needs separate processes is the one benefit the plan says it doesn't care about.

The cost of fan-out is real and new: N subagent spawns, N prompt-assembly sites, a bundle serialization contract that must round-trip losslessly, partial-failure handling (what if 1 of 3 subagents errors or returns a malformed bundle?), and the first-ever instance of this pattern in a product skill — i.e., maximum novelty for a once-a-day batch of three. By the review-plan checklist's Scope and Patterns rows, this reads as **over-built for the stated scale**. The honest framing: the architecture is justified by "build it properly because cost isn't a constraint," but cost-isn't-a-constraint argues for the model tier (Opus) and for doing grounding at all — it does NOT argue for process isolation, which only earns its keep at a scale the plan says won't occur.

**The simplest thing that fixes the original bug.** The three errors were: (1) asserted a superseded decision, (2) wrong Jira title, (3) stale commitment hash. The minimal fix is a **disposition** applied during synthesis: before asserting any decision, reconcile against the README's full Decisions body and flag conflicts; before asserting any Jira fact, verify it live via the MCP; cite commitment IDs from the scaffold (which already carries verified IDs). That disposition is exactly `profiles/project-agent.md` — the profile is the load-bearing fix. Whether it runs inline (adopt) or spawned (fan-out) is orthogonal to whether the bug is fixed. So WS-A is the cure; WS-B/C's spawn topology is an optimization the bug does not require. A staff engineer reading this would say: ship the disposition + inline grounding first, prove it fixes the three errors on the real 6/22 agenda, and only add spawn-isolation if/when batch size or latency actually hurts.

**Architectural fit of "spawn from skill prose."** It fits *only after* WS-D's blessing lands, and even then it's swimming slightly upstream. Every other intelligence path in Areté is CLI-recipe-deterministic + inline-expert-reasoning. Putting subagent orchestration into skill prose means the orchestration logic (scope resolution, dedup, fan-out, bundle merge, partial-failure recovery) lives as natural-language instructions the model must follow each run, with no typecheck, no test, no `arete` verb to gate it. That is a fragility the existing scaffold-verb gate was specifically designed to avoid (see the `prepare-meeting-agenda` step-4 "verb invocation is the gate" framing). The plan adds reasoning-heavy orchestration in exactly the layer Areté has been moving logic OUT of. If fan-out survives review, the dedup + scope-resolution step should be a deterministic `arete` verb (it already is "no LLM" per the plan), and only the grounding/synthesis should be prose.

---

## The bundle contract — under-defined for build

The draft fields are a good start but the contract is not yet buildable. Missing or unspecified:
- **Serialization + size budget.** Is the bundle JSON returned in the subagent's final message? What is the byte cap, and what happens on overflow (truncate which fields first)? The whole "lean prime" thesis depends on a hard cap that isn't stated.
- **The README-body source.** Given `arete project open` does NOT emit the canonical Decisions body (verified above), the contract must specify that the subagent reads `projects/active/<slug>/README.md` directly for the Decisions section, and which sections it is allowed to read. Otherwise the decisions[] field has no defined source.
- **`verifiedAt` semantics + failure value.** What does `tickets[].status` hold when the MCP call fails, times out, or the key 404s? "unverified" vs. omitted vs. error — synthesis behaves very differently across these, and the bug being fixed is precisely a confidently-wrong assertion, so an unverified ticket MUST be representable and MUST suppress assertion.
- **`superseded?` + conflict note shape.** "flag-not-resolve is acceptable v1" is fine, but the synthesis side needs a defined contract: when superseded? is true, what is the prime instructed to render? (Drop it? Show both with a "superseded — do not assert" marker?) Without this, error 1 can recur even with a correct flag.
- **Relevance-query contract.** WS-B passes "meeting title/attendees as the relevance query so the bundle is meeting-relevant." But the bundle is deduped per-project and reused across meetings — so it cannot be scoped to one meeting's relevance without breaking reuse. This is an internal contradiction (see Sequencing).
- **Empty/no-area projects.** `assembleBriefForProject` has explicit area-resolution-failure handling (`metadata.areaNote`). The bundle contract should carry that note through so the prime can surface "context unavailable" rather than silently grounding on thin data.

---

## WS-D — unify `/project` onto the profile: what breaks

The risk here is real and the plan half-acknowledges it. `/project` today is READ-ONLY, fast, deterministic, and presents to a human. Folding in "live-grounding on-when-working" changes its latency and determinism profile:
- **Latency regression on a simple open.** The plan gates live-grounding to "on-when-working, not on a bare open." But "working" is a fuzzy, model-judged boundary inside skill prose — there is no deterministic trigger. The likely failure is the model grounding live (multi-second MCP round-trips) on opens the user expected to be instant. The gate needs a concrete definition or `/project` open regresses.
- **Read-only invariant.** `/project`'s skill prose forbids manual file reads as the data path. The disposition explicitly requires reading the README Decisions body directly. These conflict. WS-D must reconcile: either `/project` keeps its CLI-only data path and the disposition's README-read is spawn-only, OR `/project`'s read-only prose is amended to permit additive reads. The plan doesn't resolve this and it's load-bearing.
- **Scope creep.** Unifying is presented as drift-prevention, which is legitimate. But it converts a stable, shipped, read-only command into a consumer of a brand-new, unproven disposition. If the disposition has a bug, it now blasts a daily-driver command, not just the new agenda path. Sequence WS-D LAST and behind a flag, after the disposition has soaked in spawn/inline agenda use.

---

## Sequencing / dependency hazards

- **WS-A → WS-B/C/D is correct** (profile + contract first). Good.
- **Contradiction between WS-B's per-meeting relevance query and the dedup-by-project rule.** WS-B says pass meeting title/attendees as the relevance query so the bundle is meeting-relevant. WS-C/Architecture says ground each unique project ONCE and reuse across meetings. A project touching meetings X and Y is grounded once — so its bundle cannot be relevance-scoped to both X and Y. Either the bundle is project-scoped (full, reused) and relevance-filtering happens at synthesis, or it's meeting-scoped and you lose the dedup win. Resolve this before build; as written the two sections specify incompatible behavior.
- **WS-C relaxing the F3 anti-degradation rule depends on isolation existing.** The plan's claim that "subagent isolation retires F3" is only true for the synthesis step IF synthesis is also isolated per-meeting. But the Architecture says the **prime** synthesizes all agendas for small batches (no per-meeting synthesis subagent). So F3's actual failure mode — the prime degrading agenda #4 of 4 to a skeleton — is NOT structurally prevented; the prime is still doing all N syntheses in one context. Grounding isolation does nothing for synthesis degradation. **Do not relax F3** on the strength of grounding isolation; the AC1 self-check and the per-meeting full pass must stay exactly as today. This is a correctness regression risk hiding in WS-C.
- **WS-E cache vs. supersession freshness.** The cache is slug-keyed, max-mtime invalidated. But "live Jira" facts and "superseded?" flags can go stale without any workspace file changing mtime (a ticket gets renamed in Jira; a decision is reversed in a meeting not yet processed). An mtime-invalidated cache will happily serve a stale "verified" Jira fact — reintroducing exactly error 2/3 the effort exists to kill. The cache needs a separate TTL on the jira-live layer (or must not cache the live layer at all). Build the cache LAST and treat the live layer as non-cacheable or short-TTL.

---

## Test coverage

The plan is profile-prose + skill-prose + an authoring-guide edit + an optional cache. The only code-touching item is WS-E's cache (`.arete/cache/plan-context/<slug>.json`), which needs unit tests for write/read/mtime-invalidation/corrupt-file. No test expectation is stated. Everything else is prose, so the real "test" is a soak gate. Given the memory note [[feedback_poc_vs_fair_test]] (single_pass regressed in soak after a favorable benchmark) and [[feedback_verify_reviews_against_data]], the plan should pin an explicit acceptance gate: **reproduce the 6/22 glance-email-templates agenda and confirm all three errors are corrected**, plus a junk/no-fabrication check, before declaring done. That concrete regression target is currently missing.

---

## Strengths

- The decomposition of "/project reliability" into context / disposition / focus, and the recognition that the **disposition** (not context loading) is the real fix, is the right insight and is genuinely supported by the code (live-Jira has no CLI path; it can only be behavioral).
- Shipping a `profiles/project-agent.md` is the correct, host-agnostic surface and matches the existing profile pattern exactly.
- The plan correctly identifies that the authoring guide forbids the pattern it needs and schedules the blessing rather than sneaking past it.
- "Flag-not-resolve" for supersession in v1 is appropriately humble.

## Devil's Advocate

**If this fails, it will be because** the spawn-fan-out topology added failure surface (partial subagent failures, malformed bundles, the per-meeting-relevance vs. dedup contradiction) for a once-a-day batch of three, while the actual bug was a disposition gap that an inline pass would have fixed with a fraction of the moving parts — and meanwhile F3 got relaxed on a false premise (grounding isolation doesn't isolate synthesis), so agenda #4 of 4 quietly skeletons again.

**The worst outcome would be** a cached, stale, "verified-live" Jira fact rendered with full confidence into an agenda — i.e., the cache layer (WS-E) reintroduces errors 2/3 with the added authority of a "verifiedAt" timestamp, in the exact failure class this whole effort was created to eliminate, and now harder to spot because it looks grounded.

---

## Verdict

**READY-WITH-CHANGES.** The insight and the profile are sound and worth building; the fan-out topology and the cache are over-built/under-specified relative to the stated scale and carry concrete regression risks. No single change is a hard structural blocker that should halt the build, but two of the CRs (CR-1 correctness, CR-5 cache freshness) guard against re-creating the original bug and must land before ship.

### Change Requests

1. **(must-fix) Correct the Insight's data-source claim and the bundle's decisions source.** `arete project open` does NOT emit the README's `## Decisions` body or any Jira facts (verified: `brief-assemblers.ts:1383-1558`, `project.ts:568-700`). Update the plan's Insight + "keep retrieval deterministic" sections to state that decisions reconciliation reads the README body directly and Jira is MCP-only — and specify both as bundle sources in WS-A. Drop the "two runs → same facts" reproducibility claim for the Jira/decisions layers.
2. **(must-fix) Do NOT relax the F3 anti-degradation rule on the strength of grounding isolation.** The prime still synthesizes all N agendas in one context (per the Architecture), so synthesis degradation is unchanged. Keep the AC1 self-check and the per-meeting full pass verbatim. Only relax F3 if/when per-meeting synthesis subagents are actually built.
3. **(must-fix) Resolve the per-meeting-relevance vs. dedup-by-project contradiction.** WS-B (meeting-scoped relevance query) and WS-C/Architecture (one bundle per project, reused across meetings) specify incompatible behavior. Pick: project-scoped bundle + relevance-filter at synthesis (recommended), and rewrite WS-B accordingly.
4. **(must-fix) Fully specify the bundle contract before build.** Add: serialization + byte cap + overflow policy; README-body read source/sections; `verifiedAt`/failure semantics (unverified MUST suppress assertion); the `superseded?` render contract on the synthesis side; and pass-through of the area-resolution `areaNote`.
5. **(must-fix) Make the live-Jira layer non-cacheable (or short-TTL), separate from the mtime-keyed bundle cache.** An mtime-invalidated cache will serve stale "verified" Jira facts and reintroduce errors 2/3. Build WS-E last and gate it behind a demonstrated need.
6. **(nice-to-have) Defend the fan-out topology or descope it to inline-first.** At once/day × ~3 meetings with cost-not-a-constraint, process isolation's only unique benefit (wall-clock parallelism) is the one the plan says it doesn't care about. Recommend: ship WS-A disposition + inline grounding with per-project dedup in a local loop, prove it fixes the 6/22 errors, and add spawn-isolation only when batch size/latency demonstrably hurts. If fan-out is kept, move scope-resolution + dedup into a deterministic `arete` verb rather than skill prose, and specify partial-failure handling (1 of N subagents fails/malforms).
7. **(nice-to-have) Sequence WS-D last and behind a concrete "working" trigger + reconcile the read-only invariant.** Define a deterministic gate for live-grounding on `/project` (or it regresses bare-open latency), and reconcile the disposition's direct-README-read against `/project`'s "no manual file reads" data-path rule.
8. **(nice-to-have) Pin an explicit acceptance gate.** "Reproduce the 2026-06-22 glance-email-templates agenda; all three named errors corrected; no new fabrication" — plus the WS-E cache unit tests (write/read/mtime-invalidate/corrupt). Run `/pre-mortem` (`has_pre_mortem: false`) given Large + net-new pattern.
