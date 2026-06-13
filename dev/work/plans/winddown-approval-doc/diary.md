# Winddown approval doc — build diary

Branch: `feat/winddown-approval-doc` (stacked on `feat/single-pass-extraction`)
Worktree: `/Users/john/code/arete/.claude/worktrees/winddown-approval`
Builder: Claude (orchestrator). ZERO real-LLM calls — render/parse/apply are deterministic.

---

## 2026-06-12 — Setup + substrate recon

**What I did.** Created the stacked worktree off `feat/single-pass-extraction`
(HEAD a13a64a2). Verified branch + ancestry. Copied `plan.md` + `mockup.md`
(untracked in main repo) into the worktree; will land them as the first commit.

**Substrate findings (single-pass, what I'm building on):**
- On-disk frontmatter contract (written by `packages/cli/src/commands/meeting.ts`
  ~L1380-1407, `singlePassMode` block):
  - `staged_item_status`  : id → `'approved'|'skipped'|'pending'`
  - `staged_item_importance`: id → `'blocker'|'high'|'normal'`
  - `staged_item_uncertain`: id → reason string (the ⚠ channel; '' if no reason)
  - `staged_item_links`    : id → `{ continuationOf?, supersedes? }`
  - `staged_item_owner`    : id → `{ ownerSlug?, direction?, counterpartySlug? }`
    direction `'none'` renders `·` (D7-inert, never a commitment)
  - `staged_item_skip_reason`: id → `{ reason, evidence, setBy, setAt }`
  - `staged_item_confidence`, `staged_item_edits`, `staged_item_matched_text`
- `parseStagedSections(body)` reads `## Staged Action Items / Decisions /
  Learnings` → `{ actionItems, decisions, learnings }` (StagedItem[]).
- Apply primitives that already exist + are reused by W3:
  - `writeItemStatusToFile(storage, path, id, {status, editedText?})`
  - `commitApprovedItems(storage, path, memoryDir, {onApproved, onSkipped})`
    — strips staged sections, writes `## Approved *` body sections + a
    `## Skipped on Apply` audit block, filters sibling maps by approvedIds,
    sets `status: approved`. THIS is the web-`/review` frontmatter contract (AC7).
  - `arete meeting approve <slug> --items <ids> --skip <ids>` wraps the above.
  - `services.commitments.resolve(...)` (R7 resolvedAt idempotency guard).
- Winddown is **skill-orchestrated** (no `arete winddown` CLI command exists yet).
  SKILL.md Step 4 composes the prose doc; Step 5 persists it to
  `now/archive/daily-winddown/winddown-YYYY-MM-DD.md`; Step 6 executes.
  The tier-ranking spec already lives in Step 4 (L1105-1130).

**Architecture decision.**
- W1/W2: new core module `integrations/winddown-checklist.ts` —
  `renderStagedItemsAsChecklist(meeting)` pure over a structured view
  (staged items + the frontmatter maps + proposed actions + uncertain choices).
  Anchors: `<!-- ai_001@slug -->` (items), `<!-- choice:... -->` (your-call),
  `<!-- act:<verb>:<id> -->` (actions). D8 action bodies render as an indented
  fenced block scoped by the action anchor.
- W3: `arete winddown apply <date>` CLI + core `applyWinddownDoc` engine —
  parse saved doc → anchor map → diff vs persisted baseline → classify
  (approve/skip/user-override/rescue/edited/choice-resolved) → confirm summary →
  execute via the existing primitives. Baseline persisted at render time
  alongside the archive (`.baseline.md` sidecar).
- Flag: a render flag family — `winddown.render.checklist` (config) /
  `ARETE_WINDDOWN_CHECKLIST=1` env. OFF ⇒ renderer not invoked ⇒ byte-identical
  prose (AC6). The flag gates whether the chef calls the helper at all.

**Subagent note.** Nested Agent/Task tooling is NOT available in this
environment (only TaskStop for background bash + worktree tools). Per operating
rules I therefore do disciplined SEPARATE-PASS self-reviews for each work item
(build pass, then a fresh read-only review pass over the diff) and record
findings here.

**Worktree node_modules trap (cost me a detour — recording so it's not
repeated).** The worktree had NO node_modules. I first symlinked
`node_modules → /Users/john/code/arete/node_modules` (main repo). That made
`node_modules/@arete/core` resolve to the MAIN repo's `packages/core` (on
`main`, lacking all single-pass exports), so `tsc -b packages/cli` failed with
~25 phantom "no exported member SINGLE_PASS_STAGED_HEADERS / reconcile_mode /
stagedItemImportance" errors that looked like a broken single-pass branch.
The single-pass branch is FINE — those symbols reach the `@arete/core` barrel
via `export * from './services/index.js'`. Fix: `rm node_modules` then
`npm install` IN the worktree (npm workspaces points `@arete/core` →
`../../packages/core` = the worktree's own core). After that, full core+cli
typecheck is clean. Lesson: never cross-symlink node_modules between worktrees;
always `npm install` locally so workspace symlinks stay intra-worktree.

---

## 2026-06-12 — W1 + W2: checkbox renderer + Your-call/actions

**Shipped.** `packages/core/src/integrations/winddown-checklist.ts` — pure,
deterministic renderer. Public surface:
- `renderStagedItemsAsChecklist(meeting)` — ONE meeting → `### Action items /
  Decisions / Learnings` checkbox blocks (W1 entry point).
- `renderWinddownDoc(view)` — full approval doc: header + `## ⛔ Blockers & ⚠
  Your call first` + per-meeting blocks + `## Proposed actions`. This is the
  agent baseline the apply mapper diffs against (W3).
- `renderChoices` / `renderActions` / `uncertainItemToChoice` (W2).
- Anchor builders + recovery regexes (`itemAnchor`/`choiceAnchor`/`actionAnchor`,
  `ITEM_ANCHOR_RE`/`CHOICE_ANCHOR_RE`/`ACTION_ANCHOR_RE`) — single source of
  truth shared with the apply mapper.

**Semantics implemented (mockup table):** `[x]`=keep (status approved OR
pending+tier), `[ ]`=skip (status skipped, inline `— skip: <reason>`),
`[BLOCKER]`/`[high]` markers, tier ordering blocker→high→normal (stable),
`↩ continues`/`⤴ supersedes` from links, ⚠ uncertain items promoted OUT of
their section INTO Your-call (never pre-filled), D8 editable action body as an
indented fenced blockquote scoped by the action anchor.

**Flag.** `winddown_render: 'prose' | 'checklist'` config (model
`WinddownRenderMode`, default `prose`, clamped in `normalizeConfig`). OFF ⇒ the
chef never invokes the renderer ⇒ byte-identical prose (AC6). Wired an additive,
flag-gated CHECKLIST RENDER MODE note into daily-winddown SKILL.md Step 4
(within `## Stage for approval`).

**Tests.** `winddown-checklist.test.ts` — 14 tests, all green; cover every
semantics-table row, anchor recovery, tier ordering, W2 choices/actions, D8
body, full-doc ordering, empty-block omission.

**Self-review pass (separate read of the diff).** Findings:
- choice anchor key `ai_007>acc2a220` contains `>` — non-whitespace, matches
  `CHOICE_ANCHOR_RE` `(\S+?)`. OK.
- D8 body uses `      > ` blockquote + triple backticks (matches mockup). The
  apply parser must strip that exact prefix — noted as a W3 contract.
- `prefillChecked(undefined)` returns true (no overlay → keep). Acceptable for
  legacy-shaped items but the chef always supplies meta in checklist mode.
No correctness issues found; proceeding to commit.
