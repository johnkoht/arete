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

---

## 2026-06-12 — W3 + W4: apply mapper + round-trip safety

**Shipped.** `packages/core/src/integrations/winddown-apply.ts` (pure
parse/diff/classify/summary + an `executeWinddownApply` driven by injected
deps) and `packages/cli/src/commands/winddown.ts` (`arete winddown apply
<date>`). Wired `registerWinddownCommand` into the CLI.

**Flow (as built).**
1. `arete winddown apply <date>` reads `now/archive/daily-winddown/
   winddown-<date>.md` (user-edited) + `winddown-<date>.baseline.md`
   (agent render, persisted at Step 5).
2. `buildApplyPlan` parses BOTH docs into anchor→line maps, diffs, classifies
   each line: approve / skip / user-override / rescue / edited / choice-resolved.
3. `renderApplySummary` prints counts + edited-item diffs + the FINAL outbound
   text for every message action (AC5b), + warnings.
4. Confirm `[y/N]` (D6; `--yes` to skip, `--dry-run` to preview, `--json`).
5. `executeWinddownApply` → per-item `writeItemStatusToFile` (+ user-rejected
   skip_reason marker), then `commitApprovedItems` once per touched meeting,
   then commitment resolves (R7 guard via `listOpen`), then DRAFT output for
   DM/Slack/email/jira/inbox (NOT sent — chef sends via MCP; edited body flows
   verbatim).

**W4 safety.** Anchors are the diff key (text edits round-trip as `edited`,
not broken maps). unchecked-[x] → user-override → skipped+"user-rejected".
checked-[ ] → rescue → approved. Malformed (anchorless) checkbox lines and
unknown anchors (not in baseline) → `plan.warnings`, surfaced in the summary,
NEVER applied (AC2). Idempotent: meeting already `status: approved` → commit
no-ops; commitment absent from `listOpen` → `already-resolved` (R7).

**Design fix found during testing (recorded — AC5 contract).** First cut had
`executeWinddownApply` push to `result.meetingsCommitted` unconditionally after
`deps.commitMeeting`, so a no-op re-commit still inflated the count → AC4/AC5
mismatch. Fixed by making `commitMeeting` return `'committed' | 'already-applied'`
and counting only real commits. The dep now SIGNALS idempotency so the summary
counts equal executed mutations exactly.

**Scope decision (documented gap).** `act:create:*` (create commitment) is NOT
wired to `commitments.create` in the CLI — create needs person/direction
resolution that isn't deterministically derivable from the doc. With
`createCommitment` absent from deps, the engine routes `create` actions through
`draftAction`, so the chef executes the `commitments_create` verb via MCP (same
as the prose flow). Resolve/DM/jira/inbox are the live verbs; this matches the
mockup (no create action shown).

**Baseline persistence.** SKILL.md Step 5 now instructs (checklist mode only):
`cp winddown-<date>.md → winddown-<date>.baseline.md` immediately after writing
the rendered doc and BEFORE the user edits — so the baseline is the verbatim
agent recommendation (AC1 zero-drift). Step 6 documents the `arete winddown
apply` invocation + the draft-don't-send contract.

**Tests.**
- `winddown-apply.test.ts` (14, core): parse incl. D8 body, full semantics
  table (AC3), AC1 round-trip, AC2 unknown/malformed, AC4 idempotent re-apply,
  AC5 summary==mutations, AC5b edited body verbatim+echo, choice resolution.
- `winddown.test.ts` (5, CLI integration, real workspace): AC1 agree-path
  (meeting → status:approved, commitment resolved), AC4 re-apply (0 commits,
  "already resolved"), dry-run no-op, user-override skips item, AC2 warning.
  This also verifies AC7 — the apply writes the SAME `status: approved` +
  `## Approved *` body contract the web `/review` reads (no new writer path).
- `config.test.ts` (+3): winddown_render default prose, resolves checklist,
  clamps invalid → prose (AC6 safety).

**Self-review pass (separate read of the W3/W4 diff).** Findings:
- `cleanText` strips tier markers + trailing `— skip:` reason + link
  annotations so the diff compares USER text only (agent decoration on a skip
  line doesn't read as an edit). Verified by the AC1 round-trip test (no
  spurious `edited`).
- D8 body parser keys off the blockquote-fence; a body with NO fence is left
  as undefined (action line still maps). Safe.
- choice keys of form `<id>@<slug>:keep|skip` drive the underlying item;
  other choice keys (mirror/cal) are counted resolved but executed by the chef
  (no generic primitive) — matches mockup intent.
- AC6: the renderer/apply are inert unless `winddown_render: checklist`; prose
  path is the existing skill text, untouched when flag off.
No correctness issues; proceeding to commit + full-suite gate.

---

## 2026-06-12 — WRAP

**Full suite.** `tsx --test` over all of packages/core/test + packages/cli/test
(excluding the slow integration dir): 4602 pass / 0 fail / 2 pre-existing skips.
Core+CLI typecheck (`tsc -b packages/core packages/cli`) green.

**Fresh-eyes review over the whole branch diff (feat/single-pass-extraction...HEAD).**
Done as a disciplined separate read pass (no nested-agent tooling available).
Checked:
- Anchor regex collision: `<!-- choice:le_001@cust:keep -->` does NOT match
  `ITEM_ANCHOR_RE` (the id group is anchored immediately after `<!--\s*`, and
  the slug class excludes `:`). Verified empirically. No mis-classification.
- `parseActionBody` skips the pre-fence label line, captures only fenced body
  lines, returns undefined (action still maps) when no fence. Safe.
- `cleanText` strips tier markers + trailing `— skip:` + ↩/⤴ link runs so the
  diff compares USER text only — agent decoration on a skip line is not an
  "edit". AC1 round-trip test confirms zero spurious edits.
- AC5 contract: `commitMeeting` returns committed|already-applied; the engine
  counts only real commits → summary counts == executed mutations even on
  re-apply. (This was the one design bug found + fixed during W3 testing.)
- Auto-promoted uncertain item round-trips with 0 warnings / 0 malformed.
- SKILL.md diff: ZERO deletions — all additive gated blocks → AC6 byte-identical
  prose when flag off.
No correctness findings to fix.

**Artifacts.** dist rebuilt + committed per house rule (only the files my source
touches changed in dist — no stale churn). build-report.md written. Worktree
clean after the wrap commit.

**For John's review (top items):**
1. The chef-side `ChecklistView` assembly lives in SKILL.md prose (Step 4), not
   a core function — by design (renderer is the tested deterministic core). If
   you'd rather have a `buildChecklistView(meetingFiles)` core helper so the
   chef does less, that's a clean follow-up.
2. `act:create:*` and non-item choice keys (mirror/cal) are surfaced/counted but
   executed chef-side, not by `apply` (need person/direction or no generic
   primitive). Confirm that split is what you want, or we wire `create`.
3. Apply never SENDS outbound — it drafts `DRAFT <verb>:<id>` with verbatim body
   for you to fire via MCP (D8/AC5b: the edited body is the deliverable). If you
   want apply to send directly for some verbs, that's a deliberate next step.
