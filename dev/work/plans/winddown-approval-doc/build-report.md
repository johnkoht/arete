# Build report — winddown approval doc (checkbox review surface)

Branch: `feat/winddown-approval-doc` (stacked on `feat/single-pass-extraction`)
Worktree: `/Users/john/code/arete/.claude/worktrees/winddown-approval`
Status: SHIPPED — W1→W4 complete, all ACs covered, full suite green.
No real-LLM calls (render/parse/apply are deterministic).

## What shipped

| WI | What | Where |
|---|---|---|
| W1 | Checkbox renderer (`renderStagedItemsAsChecklist` + `renderWinddownDoc`) — per-meeting `### Action items/Decisions/Learnings` checkboxes pre-filled from tier+status, `[BLOCKER]`/`[high]`/⚠ markers, inline skip/uncertainty reasons, ↩/⤴ link annotations, hidden per-line anchors | `packages/core/src/integrations/winddown-checklist.ts` |
| W2 | "Your call" choice blocks (uncertain → option-checkboxes, not pre-filled) + Proposed-actions block (pre-filled from agent reco). D8 editable action bodies as indented fenced blocks scoped by the action anchor | same module (`renderChoices`/`renderActions`/`uncertainItemToChoice`) |
| W3 | Apply mapper: `arete winddown apply <date>` + core `winddown-apply.ts` (parse → anchor map → diff vs baseline → classify → confirm summary → execute via existing primitives) | `packages/core/src/integrations/winddown-apply.ts`, `packages/cli/src/commands/winddown.ts` |
| W4 | Round-trip safety: anchor-keyed diff, edit-detection, unchecked-[x]→user-rejected skip, checked-[ ]→approve override, malformed/unknown anchors surfaced not dropped, idempotent re-apply | folded into W3 module + tests |

Supporting changes: `winddown_render` config flag (`packages/core/src/config.ts`,
`models/workspace.ts`); core barrel exports (`packages/core/src/index.ts`); CLI
registration (`packages/cli/src/index.ts`); daily-winddown SKILL.md Step 4
(render mode), Step 5 (baseline persistence), Step 6 (`/winddown apply`).

## Flag name + how to enable

`winddown_render` in `arete.yaml` (workspace) or `~/.arete/config.yaml` (global):

```yaml
winddown_render: checklist   # default is "prose" (today's narrative, byte-identical)
```

- `prose` (DEFAULT) — the chef never invokes the renderer; winddown is exactly
  today's output. Invalid values clamp to `prose` (AC6 safety).
- `checklist` — the chef builds a `ChecklistView` from today's staged meetings +
  their frontmatter maps and calls `renderWinddownDoc(view)`; persists the
  verbatim render as `winddown-<date>.baseline.md`; the user toggles in their
  editor and runs `/winddown apply`.

## How apply works end-to-end

1. Render time (Step 5, checklist mode): chef writes
   `now/archive/daily-winddown/winddown-<date>.md` AND copies it verbatim to
   `winddown-<date>.baseline.md` (the agent recommendation snapshot) BEFORE the
   user edits.
2. User toggles checkboxes / edits text / edits action bodies in
   `winddown-<date>.md`.
3. `arete winddown apply <date>`:
   - reads the edited doc + the baseline;
   - `buildApplyPlan` parses both into anchor→line maps, diffs, classifies each
     line: approve / skip / user-override / rescue / edited / choice-resolved;
   - `renderApplySummary` prints counts + edited-item diffs + the FINAL outbound
     text for every message action + warnings, then `Proceed? [y/N]`;
   - on `y`: per-item `writeItemStatusToFile` (user-override also writes a
     `staged_item_skip_reason` marker with reason "user-rejected"), then
     `commitApprovedItems` once per touched meeting, then `commitments.resolve`
     for `act:resolve:*` (R7 idempotency via `listOpen`), then DRAFT output for
     `act:dm/slack/email/jira/inbox/create:*` — NOT sent; the chef executes the
     send through MCP using the echoed verbatim (possibly edited) body.
   Flags: `--dry-run` (preview only), `--yes` (skip confirm), `--json`.
4. Idempotent: re-running mutates nothing (meeting already `status: approved` →
   commit no-ops; commitment absent from open list → "already resolved").

CLI quick reference:
```
arete winddown apply 2026-06-09            # interactive confirm
arete winddown apply 2026-06-09 --dry-run  # plan + summary, execute nothing
arete winddown apply 2026-06-09 --yes      # apply without prompt
arete winddown apply 2026-06-09 --json     # machine-readable plan + result
```

## AC status

| AC | Status | Evidence |
|---|---|---|
| AC1 round-trip agree-path zero-drift | PASS | `winddown-apply.test.ts` "AC1 round-trip"; CLI "AC1 agree-path"; manual render→parse→plan check (0 warnings, 0 edited) |
| AC2 every line maps or is reported | PASS | `winddown-apply.test.ts` unknown-anchor + malformed; CLI "AC2 warning" |
| AC3 full semantics table (each row a test) | PASS | `winddown-apply.test.ts` "classify — semantics table" (approve/skip/user-override/rescue/edited) + choice resolution |
| AC4 idempotent re-apply | PASS | `winddown-apply.test.ts` "AC4"; CLI "AC4 idempotent re-apply" (0 commits, already-resolved) |
| AC5 summary matches mutations | PASS | `winddown-apply.test.ts` "summary counts equal executed mutation counts" |
| AC5b edited action body sent verbatim + echoed | PASS | `winddown-apply.test.ts` "edited DM body flows verbatim and is echoed" |
| AC6 flag off = byte-identical to today | PASS | `config.test.ts` default prose + clamp; SKILL.md diff has ZERO deletions (all additive gated blocks) |
| AC7 web /review reads correct status after CLI apply | PASS | apply writes the SAME `status: approved` + `## Approved *` body via `commitApprovedItems` (no new writer); CLI test asserts `status: approved` + `## Approved Action Items` |

## Tests added

- `packages/core/test/integrations/winddown-checklist.test.ts` — 14 (renderer)
- `packages/core/test/integrations/winddown-apply.test.ts` — 14 (apply engine)
- `packages/cli/test/commands/winddown.test.ts` — 5 (CLI integration, real workspace)
- `packages/core/test/config.test.ts` — +3 (flag default/resolve/clamp)

Full unit suite: 4602 pass / 0 fail / 2 pre-existing skips. Core+CLI typecheck green.

## Known gaps / deferred

- `act:create:*` (create commitment) is NOT wired to `commitments.create` — that
  primitive needs person/direction resolution not derivable from the doc
  deterministically. The engine routes `create` actions through the draft path
  so the chef executes `commitments_create` via MCP (matches the prose flow; the
  mockup shows no create action). Resolve/DM/jira/inbox are the live verbs.
- Non-item choice keys (mirror-pair, calendar) are COUNTED as resolved but have
  no generic execution primitive — the chef reads the chosen key from the doc
  and acts. Only `<id>@<slug>:keep|skip` choice keys auto-drive an item status.
- Outbound sends (Slack/email/jira) are intentionally NOT executed by `apply` —
  it emits `DRAFT <verb>:<id>` with the verbatim body; the chef sends via MCP
  (per plan W3 / D8). The point built here is that the EDITED body flows through.
- Web `/review` winddown UI (plan backlog item) — not in scope; the frontmatter
  contract is preserved so it can be built later over the same model.
- The chef-side `ChecklistView` assembly (reading frontmatter maps → the view)
  is specified in SKILL.md but is agent-orchestrated, not a core function — the
  renderer is the unit-tested deterministic core; the chef wiring is prose.

## Setup note (for future stacked builds)

The worktree had no `node_modules`. Do NOT symlink the main repo's
`node_modules` in — that makes `@arete/core` resolve to the main branch's
`packages/core` and produces phantom "no exported member" errors. Run
`npm install` IN the worktree so npm workspaces points `@arete/core` →
`../../packages/core` (this worktree's own core). After that, `tsc -b
packages/core packages/cli` is clean.
