# Scratchpad

> Raw capture space for ideas, issues, and observations. Items here can graduate to `dev/work/backlog/` or `dev/work/plans/` when they're ready.

---

## New Workspace Setup Testing (2026-03-24)

Issues and observations from testing a fresh Areté workspace install.

### Issues

1. **Default AI tiers are outdated** (2026-03-24)
   - New project gets old model versions:
     ```yaml
     tiers:
       fast: anthropic/claude-3-5-haiku-latest
       standard: anthropic/claude-sonnet-4-20250514
       frontier: anthropic/claude-3-opus
     ```
   - Should be (per reserv project):
     ```yaml
     tiers:
       fast: claude-haiku-4-5
       standard: claude-sonnet-4-6
       frontier: claude-opus-4-6
     ```
   - Need to update defaults in codebase
   - **Location**: `packages/cli/src/commands/onboard.ts` (two places)

2. **Onboard messaging is unclear** (2026-03-24)
   - Current: Says something like "update your anthropic key"
   - Should be: More contextual about what Areté does with LLMs
   - Suggested: "Areté embeds LLMs into the toolchain, connecting your Anthropic account to leverage the intelligence layer..."

3. **Onboard stops after Anthropic setup — UX confusion** (2026-03-24)
   - Flow: `arete install` → `arete onboard` → user expected more
   - **By design**: Integrations handled by `getting-started` skill in chat
   - **Problem**: Not clear that next step is "Let's get started" in conversation
   - **Problem**: Message says "Update Anthropic credentials?" (line 282 in onboard.ts)
     - Appears when credentials exist from previous install
     - Confusing phrasing, doesn't explain WHY Areté needs AI
   - **Fix options**:
     a. Add integrations to `arete onboard` directly
     b. Make handoff to conversational onboarding much clearer
     c. Better messaging about what Areté does with AI

4. **Getting-started skill delegates to CLI instead of helping directly** (2026-03-24)
   - User says "let's get started" → skill asks about integrations
   - Then tells user to run CLI commands manually
   - **Location**: `packages/runtime/skills/getting-started/SKILL.md` — Path C says:
     ```
     1. Run: arete integration configure calendar
     2. Then: arete pull calendar --days 7
     ```
   - **Should**: Guide user through setup conversationally, not hand off to CLI
   - The agent should BE the onboarding, not point to docs
   - **Fix**: Skill should run these commands itself or guide user step-by-step in chat

5. **Calendar integration assumes ical-buddy without asking** (2026-03-24)
   - User said "yes" to calendar integration
   - Skill proceeded directly to ical-buddy setup
   - **Location**: Same skill, Path C doesn't offer choice
   - **Should**: Ask "Would you like to use macOS Calendar (ical-buddy) or Google Calendar?"
   - Then proceed based on choice
   - Note: `arete integration configure` has both `apple-calendar` and `google-calendar` options

6. **Google Calendar integration gets stuck on interactive prompt** (2026-03-24)
   - Agent runs `arete integration configure google-calendar`
   - CLI prompts user to select which calendars (interactive)
   - Agent can't respond to interactive prompts → gets stuck
   - **Root cause**: Skill doesn't know about non-interactive flags
   - **Flags already exist**: `--calendars <list>` and `--all` (see integration.ts lines 78-79)
   - **Fix**: Update getting-started skill to:
     a. Ask user which calendars they want (or "all")
     b. Pass `--all` or `--calendars "Work,Personal"` when running command
   - Alternatively: Skill should document these flags so agent knows to use them
   - **Note**: Google Calendar also has OAuth browser flow first (line 220) — agent may need to guide user through that part manually, then use `--all` for calendar selection

7. **agent-observations.md in .arete is ignored** (2026-03-24)
   - File: `.arete/memory/items/agent-observations.md` (user workspace)
   - **Note**: File is `agent-observations.md` (singular), not `agents-observations.md`
   - **Investigation findings**:
     - File IS defined in `packages/core/src/services/memory.ts` line 31
     - File IS included in memory search (line 197: `['decisions', 'learnings', 'observations']`)
     - File IS documented in `packages/runtime/rules/cursor/agent-memory.mdc`
     - Briefing DOES include memory results (intelligence.ts lines 259-272)
   - **Possible issues**:
     a. File doesn't exist in user workspace (never created during install?)
     b. File exists but is empty/not indexed
     c. Memory search returns results but observations aren't surfaced prominently
     d. Rules file tells agents WHEN to write, but not to READ it proactively
   - **Fix needed**: Verify file is created during workspace setup, and ensure agents read it at session start (not just when searching)

8. **Onboarding needs holistic improvement** (2026-03-24)
   - Overall onboarding experience is rough
   - **Existing plan found**: `dev/work/plans/self-guided-onboarding/plan.md`
     - Status: idea (blocked - needs infrastructure)
     - Comprehensive plan for `arete onboard` using Areté to onboard to Areté
     - Includes discovery questions, personalized paths, checkpoints
   - **Also in archive**: 6+ previous onboarding improvement attempts
   - **Action**: Review self-guided-onboarding plan, update with current issues, potentially activate

9. **getting-started skill is out of date** (2026-03-24)
   - Location: `packages/runtime/skills/getting-started/SKILL.md`
   - **Outdated references**:
     - Mentions "areas" (removed?)
     - Says `/now` structure but now only has scratchpad
     - Missing info about weekly and daily plans
   - **Good parts**: "What to do first" section is solid
   - **Fix**: Audit skill against current workspace structure and update

10. **Goal setting creates individual files — is this right?** (2026-03-24)
    - User selected "let's set my goals" during onboarding
    - Agent created individual goal files instead of adding to `goals/quarter.md`
    - **Finding**: `quarter-plan/SKILL.md` explicitly says "Individual goal files are created for each outcome"
    - **No quarter.md found** in workspace template
    - **Question for John**: Is this the intended behavior? Or should goals consolidate into quarter.md?
    - If refactor needed: update quarter-plan skill + getting-started skill

### Observations

<!-- Things that work but could be better -->

### Questions

<!-- Things to investigate or clarify -->

---

## Kun Chen agentic-tooling adoption (2026-06-20)

Source: Kun Chen ("L8 Principal's Agentic Engineering Workflow", https://www.youtube.com/watch?v=iQyg-KypKAA) plus his open-source toolset. All MIT, agent-agnostic, several install as plain skills.

Repos:
- no-mistakes (Go): https://github.com/kunchenguid/no-mistakes — validation gate, isolated worktree, review/test/docs/lint/PR/CI, auto-fix mechanical / escalate intent. Installs as `/no-mistakes` skill.
- lavish-axi (TS): https://github.com/kunchenguid/lavish-axi — render + feedback engine for agent-written HTML artifacts. Agent writes `artifact.html`, Lavish serves it, human annotates elements/text ranges, feedback returns via `lavish-axi poll`. Design system: user request → inspect project → Tailwind/DaisyUI fallback. Playbooks: plan, table, comparison, diagram, input, slides. Installs as `/lavish` skill. NOTE: needs a background server + browser (a GUI surface, not terminal-native).
- gnhf (TS): https://github.com/kunchenguid/gnhf — ralph-style long-running loop, one committed change per iteration, caps on iterations/tokens/stop-when, `notes.md` carries context.
- treehouse (Go): https://github.com/kunchenguid/treehouse — git worktree pool, auto reuse/cleanup, `post_create`/`pre_destroy` hooks (user-level only).
- firstmate (bash): https://github.com/kunchenguid/firstmate — orchestrator-of-orchestrators; one liaison agent runs a crew via tmux + treehouse + no-mistakes.

### Core reframe

Most of these are ADOPTED, not ported. The question per tool is: install as-is / adapt the concept / skip. Only Lavish is genuinely mode-agnostic (it's a generic render+feedback engine). The rest are code-shipping infrastructure — the meta-patterns transfer, the literal tools mostly don't.

### Per-tool verdict

- Lavish — ADOPT AS-IS, both modes. Highest leverage, lowest effort (it's a skill). Areté-specific work is small: an Areté artifact style + teaching skills WHEN to render and WHAT. Don't build a renderer. Accept that it's a browser/GUI surface (breaks the terminal/phone-portability story).
- no-mistakes — ADAPT (BUILD). Adopt for MECHANICAL hygiene only (rebase, conflicts, docs, lint, PR babysitting). Do NOT trust it for behavior correctness — the `single_pass` soak regression would have passed a generic "tests green" gate because it was a quality regression, not a test failure (see poc_vs_fair_test). Steal the auto-fix-vs-escalate decision layer (mirrors ai_fix_escalation).
- gnhf — ADOPT (BUILD overnight). Adds the token/iteration cap missing from current overnight `/ship` (the "wake up, quota gone" gotcha). Scope to verifiable objectives only.
- treehouse — ADOPT (BUILD). `post_create` hook directly fixes the documented overnight_ship gotcha (worktrees lack node_modules → symlink/install in hook).
- firstmate — SKIP for now. Eventual shape of coach-as-orchestrator; premature for single-user/single-machine. Revisit when genuinely juggling parallel crews.

### Candidate plans — BUILD mode

1. **`/wrap` knowledge-capture pipeline** (strongest BUILD idea; NOT no-mistakes). Post-completion pipeline: extract session learnings → diff changelog → propose memory writes WITH reasons → update plan status → escalate ambiguous learnings for approval. Steal no-mistakes' STRUCTURE (discrete steps, each auto-completes or emits a finding, evidence recorded), not the tool. Compounds with L3-memory-automation + cli_review_surface. Review surface = a Lavish artifact (checklist of proposed memory/changelog edits, approve inline).
2. **Lavish plan review** (plan mode). Interactive version of the cli_review_surface checkbox-doc idea. For structured plans (phases/decisions/open questions, per plan_context_injection) inline annotation beats wall of text. Lavish ships a `plan` playbook. Decision rule: linear quick approval → markdown checkbox; structured plan w/ trade-offs → Lavish.
3. **no-mistakes mechanical gate** for Areté's own code PRs. Adopt for hygiene/PR babysitting; explicitly not for extraction-quality correctness.
4. **treehouse + gnhf for overnight `/ship`.** treehouse post_create solves node_modules; gnhf adds token caps. Cheap, fixes documented pain.

### Candidate plans — GUIDE mode

1. **Lavish triage board** (winddown / commitments / inbox) — HIGHEST-VALUE application across both modes. Triage is intrinsically "review N items, decide each." Replace conversational back-and-forth with a board: click keep/defer/drop/resolve, decisions batch back. Lands batch_commitments + cli_review_surface + theme_render at once. Best first prototype.
2. **Lavish PRD / project artifacts with inline comments.** HARD BOUNDARY: Lavish is an EPHEMERAL review surface, not storage. PRDs live as markdown in the wiki (L1 source, per published_doc_sync). Pipeline: agent writes PRD markdown (source of truth) → generates HTML view → human annotates → agent revises the markdown. Never treat the HTML as the artifact, or wiki-sync breaks and artifacts sprawl.

### Cross-cutting risks / boundaries

- Kun's own warning (don't trust tools on popularity, demand rigorous eval) applies to HIS tools too — none benchmarked for our workload. Eval against our flows.
- Runtime `npx`-fetched deps are a reproducibility + supply-chain concern we don't currently have (we install from GitHub directly, commit_dist). Pin versions.
- Lavish = review LENS, not document. Keep source-of-truth in markdown.
- Lavish's browser/server requirement is a real departure from terminal-native Areté.

### Proposed sequencing (graduate one at a time)

1. Lavish triage board (GUIDE) — spike first; cheapest path to something concrete.
2. `/wrap` knowledge pipeline (BUILD) — the compounding one; reviewed via Lavish.
3. treehouse + gnhf for overnight `/ship` (BUILD) — cheap, fixes known pain.
4. no-mistakes mechanical gate (BUILD) — hygiene only.
5. Lavish plan review + PRD review — after triage proves the Lavish integration pattern.
6. firstmate — note only; not now.

### Open questions for John

- OK to accept Lavish's browser/server GUI surface, or is terminal-native a hard requirement (which would mean adapting the concept into a markdown/TUI approval surface instead of adopting Lavish)?
- For Lavish: build an Areté house artifact style, or start on the Tailwind/DaisyUI fallback?
- Adopt Kun's tools as runtime deps (npx/skill install) vs. vendor/fork into Areté for reproducibility?
- Confirm sequencing — start with the GUIDE triage spike?

### Multi-ship / fleet orchestration (exploratory, 2026-06-20)

Question raised: can we `/ship` multiple plans at once ("create a plan for each item, ship each separately")?

- `/ship` is single-plan but already SLUG-ISOLATED (own worktree/branch/build-log/execution dir). State model does not block N concurrent ships — the parallelism prerequisite is already met. This is a missing LAYER, not an architectural wall.
- Three collision points when running N ships: (1) merge serialization — artifact commits + gitboss merge contend on main; serialize the merge step or queue PRs; (2) shared budget — N ships burn quota ~Nx faster, so the token/iteration cap from the ship-patches note becomes a REQUIREMENT not a nicety; (3) gate arbitration — N interleaved human gate-pauses is the real wall; needs per-plan autonomy levels + a liaison that batches escalations + serialized merges. Plus an OVERLAP CHECK: disjoint-file plans parallelize cleanly, same-file plans must serialize (autonomous gate can't safely resolve cross-plan conflicts).
- The conductor's job (serialize merges, shared budget cap, gate arbitration, overlap detection) IS firstmate's job description. This REVISES the earlier "skip firstmate" call: a firstmate-lite "fleet" layer on top of the existing ship belongs in the BUILD-Claude-port as a distinct item IF multi-ship becomes a real workflow.
- Can orchestrate today hand-rolled (subagents w/ worktree isolation, agent acts as liaison, serialized merges, batched escalations) or as a deterministic fan-out workflow (needs opt-in; per-agent ships run on autonomy rules + escalate by returning findings, can't do interactive gates). Exploratory for now; not prioritized.

### Lavish plan-review spike — STATUS / RESUME HERE (paused 2026-06-22)

DECISION: First Lavish target = BUILD mode, NOT guide-mode triage. Use Lavish to review/collaborate on PLANS before they enter `/ship`. Chosen because John is the user (zero end-user risk), it's the literal use case from the video (kill the wall-of-text plan), the GUI/browser concern is moot at-desk, and it's already the `cli_review_surface` want. Dogfood before exposing Lavish to the daily winddown.

v1 SCOPE (locked): plan-ONLY board. Render `plan.md` (Goal/Context/steps/Risks/Open Questions), annotate + per-step disposition + overall verdict. Pre-mortem/review adjudication panels = v1.1. NOT woven into `/ship` internals (pending the open fork below).

ROUND-TRIP TEST: DONE, PASSED (throwaway in /tmp, cleaned up). Proved the full Lavish contract:
- Open-ended annotations return with CSS selector (where) + element text (what) + the comment.
- Structured decisions via `window.lavish.queuePrompt(text, {data})` return reliably; each radio answer came back with a parseable payload.
- All items batch into one "Send to Agent"; Lavish also hands the agent a DOM snapshot with stable uids.
- GOTCHA for the generator: the custom `data` payload is serialized INTO the prompt text as a `Context data: {json}` block (the structured prompts array only exposes uid/prompt/selector/tag/text). Emit that JSON in a consistent shape and parse it back out.

LAVISH MECHANICS LEARNED: artifacts live under `.lavish/` in cwd; `npx -y lavish-axi <file>` opens/resumes a session (express server, opens browser); `lavish-axi poll <file>` long-polls (run BACKGROUNDED, re-run if killed — queued feedback never lost; add `--agent-reply "..."` to answer in-editor and keep looping); `lavish-axi end <file>` / `lavish-axi stop` to close. Guidance via `lavish-axi playbook input` (decisions/triage) and `playbook plan`. Design priority: user-requested look → match the subject project's design system → Tailwind v4 + DaisyUI v5 CDN fallback (`lavish-axi design`). `.lavish/` is NOT gitignored yet — add it when building.

BOUNDARIES (locked): `plan.md` stays source of truth — revise via plan-mode tools (`set_plan` / `/plan save`), NEVER hand-write plan.md (extension owns frontmatter/status). Keep integration glue harness-agnostic (BUILD is mid-port off Pi) — read plan files + call `npx lavish` + write back via plan-mode tools. Tailwind/DaisyUI fallback styling for v1; Areté house style later.

PLAN LIFECYCLE (grounded): plans at `dev/work/plans/{slug}/plan.md`, status `idea→draft→planned→building→complete`; flow `/plan save` → `/review`(review.md) + `/pre-mortem`(pre-mortem.md) → `/approve` → `/ship`. Plan-mode is a Pi extension at `.pi/extensions/plan-mode/`. Board slots in at the `/review`–`/approve` seam.

OPEN FORKS (must resolve before writing the plan.md):
1. PLACEMENT: standalone `/plan review` BEFORE `/ship` (what we leaned toward) vs INSIDE `/ship` Phase 1.2/1.3 (render pre-mortem/review gate for inline adjudication — more invasive, arguably higher value). John's test-click chose "inside Phase 1" but unclear if that was a real signal or just exercising the control. CONFIRM FIRST.
2. WORKTREE: create `feature/lavish-plan-review` now (plan + code together) vs author plan.md on main and branch at build time. (Plan docs normally authored on main per `/ship` flow.)

NEXT STEP ON RESUME: confirm placement fork → write `dev/work/plans/lavish-plan-review/plan.md` → set up worktree → build (round-trip already de-risked, so build = HTML generator from plan.md + feedback→plan.md revision loop via plan-mode tools). First real plan to dogfood the board on = this plan itself.

---

## Archive

<!-- Move resolved items here with dates -->
